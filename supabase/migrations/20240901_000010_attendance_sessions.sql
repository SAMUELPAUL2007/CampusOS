-- 2024‑09‑01: Timetable integrity constraints + session-based attendance.
--
-- 1) Database-level guarantees for the timetable (no UI-only checks):
--    - a class can never have two overlapping sessions
--    - a teacher can never be booked in two overlapping sessions
--    Uses btree_gist exclusion constraints over minute-of-day ranges.
--    Existing data already satisfies these (verified conflict-free).
--
-- 2) Session-based attendance:
--    ONE SESSION = ONE CLASS + ONE TIMETABLE SUBJECT + ONE DATE.
--    attendance_sessions: unique (timetable_id, session_date)
--    attendance_records:  unique (session_id, student_id)
--    The legacy `attendance` table is preserved untouched.

-- ---------------------------------------------------------------------
-- 1. Timetable exclusion constraints
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS start_min smallint
    GENERATED ALWAYS AS ((date_part('hour', start_time)::int * 60) + date_part('minute', start_time)::int) STORED;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS end_min smallint
    GENERATED ALWAYS AS ((date_part('hour', end_time)::int * 60) + date_part('minute', end_time)::int) STORED;

-- Same class may not have overlapping sessions on the same day.
ALTER TABLE public.timetable DROP CONSTRAINT IF EXISTS timetable_no_class_overlap;
ALTER TABLE public.timetable
    ADD CONSTRAINT timetable_no_class_overlap
    EXCLUDE USING gist (
        class_id WITH =,
        day_of_week WITH =,
        int4range(start_min, end_min) WITH &&
    );

-- Same teacher may not teach two overlapping sessions on the same day.
-- NULL teacher rows (Break/Lunch) are excluded from this constraint.
ALTER TABLE public.timetable DROP CONSTRAINT IF EXISTS timetable_no_teacher_overlap;
ALTER TABLE public.timetable
    ADD CONSTRAINT timetable_no_teacher_overlap
    EXCLUDE USING gist (
        teacher_id WITH =,
        day_of_week WITH =,
        int4range(start_min, end_min) WITH &&
    ) WHERE (teacher_id IS NOT NULL);

-- ---------------------------------------------------------------------
-- 2. Attendance sessions
-- ---------------------------------------------------------------------
CREATE TABLE public.attendance_sessions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    timetable_id  uuid        NOT NULL REFERENCES public.timetable(id) ON DELETE CASCADE,
    session_date  date        NOT NULL,
    marked_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ONE SESSION = CLASS + SUBJECT + DATE (timetable_id implies class_id).
ALTER TABLE public.attendance_sessions
    ADD CONSTRAINT attendance_session_unique UNIQUE (timetable_id, session_date);

CREATE INDEX IF NOT EXISTS attendance_sessions_class_date_idx
    ON public.attendance_sessions (class_id, session_date);

CREATE TRIGGER trg_touch_attendance_session_updated_at
BEFORE UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_set_session_marked_by
BEFORE INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_marked_by();

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Read: admins, teachers assigned to the class, the session's own
-- timetable teacher, or students enrolled in the class.
CREATE POLICY attendance_sessions_select ON public.attendance_sessions
    FOR SELECT USING (
        public.is_admin()
        OR public.is_class_teacher(class_id, auth.uid())
        OR public.is_class_student(class_id, auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.timetable t
            WHERE t.id = timetable_id AND t.teacher_id = auth.uid()
        )
    );

-- Write: admins or exactly the teacher who owns the timetable entry.
-- This prevents a teacher from marking another teacher's session.
CREATE POLICY attendance_sessions_insert ON public.attendance_sessions
    FOR INSERT WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.timetable t
            WHERE t.id = timetable_id AND t.teacher_id = auth.uid()
        )
    );
CREATE POLICY attendance_sessions_update ON public.attendance_sessions
    FOR UPDATE USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.timetable t
            WHERE t.id = timetable_id AND t.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.timetable t
            WHERE t.id = timetable_id AND t.teacher_id = auth.uid()
        )
    );
CREATE POLICY attendance_sessions_delete ON public.attendance_sessions
    FOR DELETE USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.timetable t
            WHERE t.id = timetable_id AND t.teacher_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO service_role;

-- ---------------------------------------------------------------------
-- 3. Attendance records (per student per session)
-- ---------------------------------------------------------------------
CREATE TABLE public.attendance_records (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid        NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status      text        NOT NULL CHECK (status IN ('present','absent')),
    marked_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    marked_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- One student cannot receive two records for the same session.
ALTER TABLE public.attendance_records
    ADD CONSTRAINT attendance_record_unique UNIQUE (session_id, student_id);

CREATE INDEX IF NOT EXISTS attendance_records_student_idx
    ON public.attendance_records (student_id);

CREATE TRIGGER trg_touch_attendance_record_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_set_record_marked_by
BEFORE INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_marked_by();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Read: admins, teachers assigned to the session's class, the owning
-- timetable teacher, or the student themself.
CREATE POLICY attendance_records_select ON public.attendance_records
    FOR SELECT USING (
        public.is_admin()
        OR student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            WHERE s.id = session_id
              AND (
                  public.is_class_teacher(s.class_id, auth.uid())
                  OR public.is_class_student(s.class_id, auth.uid())
                  OR EXISTS (
                      SELECT 1 FROM public.timetable t
                      WHERE t.id = s.timetable_id AND t.teacher_id = auth.uid()
                  )
              )
        )
    );

-- Write: admins or the teacher who owns the session's timetable entry.
CREATE POLICY attendance_records_insert ON public.attendance_records
    FOR INSERT WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            JOIN public.timetable t ON t.id = s.timetable_id
            WHERE s.id = session_id AND t.teacher_id = auth.uid()
        )
    );
CREATE POLICY attendance_records_update ON public.attendance_records
    FOR UPDATE USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            JOIN public.timetable t ON t.id = s.timetable_id
            WHERE s.id = session_id AND t.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            JOIN public.timetable t ON t.id = s.timetable_id
            WHERE s.id = session_id AND t.teacher_id = auth.uid()
        )
    );
CREATE POLICY attendance_records_delete ON public.attendance_records
    FOR DELETE USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            JOIN public.timetable t ON t.id = s.timetable_id
            WHERE s.id = session_id AND t.teacher_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO service_role;

-- ---------------------------------------------------------------------
-- 4. Realtime for student attendance page updates (no polling)
-- ---------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
