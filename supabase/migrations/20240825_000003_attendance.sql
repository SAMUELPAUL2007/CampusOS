-- supabase/migrations/20240824_000003_attendance.sql
-- ------------------------------------------------------------
-- Attendance foundation for CampusOS
-- Records per‑student per‑class per‑date attendance status.
-- Includes RLS policies, helper functions, triggers, and indexes.
-- ------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. attendance table
-- ---------------------------------------------------------------------
CREATE TABLE public.attendance (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    attendance_date date     NOT NULL,
    status        text        NOT NULL,
    marked_by     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ---------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------

-- Status must be one of the allowed values.
ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_status_check
    CHECK (status IN ('present', 'absent'));

-- At most one attendance record per class + student + date.
ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_class_student_date_unique
    UNIQUE (class_id, student_id, attendance_date);

-- ---------------------------------------------------------------------
-- 3. Indexes for expected query patterns
-- ---------------------------------------------------------------------

-- Look up attendance by class (e.g. teacher viewing a class roster).
CREATE INDEX IF NOT EXISTS attendance_class_id_idx
    ON public.attendance (class_id);

-- Look up attendance by student (e.g. student viewing their own record).
CREATE INDEX IF NOT EXISTS attendance_student_id_idx
    ON public.attendance (student_id);

-- Look up attendance by date (e.g. filtering by day).
CREATE INDEX IF NOT EXISTS attendance_date_idx
    ON public.attendance (attendance_date);

-- Composite index for the most common query: all attendance for a class on a date.
CREATE INDEX IF NOT EXISTS attendance_class_date_idx
    ON public.attendance (class_id, attendance_date);

-- ---------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------

-- SECURITY DEFINER: checks whether a given teacher is assigned to a class.
-- Bypasses RLS on class_teachers to avoid circular dependency.
CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id uuid, p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.class_teachers
        WHERE class_id = p_class_id AND teacher_id = p_teacher_id
    );
$$;

-- SECURITY DEFINER: checks whether a given student is enrolled in a class.
-- Bypasses RLS on class_students to avoid circular dependency.
CREATE OR REPLACE FUNCTION public.is_class_student(p_class_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.class_students
        WHERE class_id = p_class_id AND student_id = p_student_id
    );
$$;

-- Grant minimum EXECUTE to PUBLIC so RLS policies can call these helpers.
GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_class_student(uuid, uuid) TO PUBLIC;

-- ---------------------------------------------------------------------
-- 5. Trigger: set marked_by on INSERT (prevent client impersonation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_attendance_marked_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Always set marked_by to the authenticated user, ignoring any client value.
    NEW.marked_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_attendance_marked_by
BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_marked_by();

-- ---------------------------------------------------------------------
-- 6. Trigger: update updated_at on UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_attendance_updated_at
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.touch_attendance_updated_at();

-- ---------------------------------------------------------------------
-- 7. Enable RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 8. RLS policies
-- ---------------------------------------------------------------------

-- -----------------------------------------------------------------
-- SELECT policies
-- -----------------------------------------------------------------

-- Admins can SELECT all attendance records.
CREATE POLICY attendance_select_admin ON public.attendance
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT attendance for classes they teach.
CREATE POLICY attendance_select_teacher ON public.attendance
    FOR SELECT USING (
        public.is_class_teacher(class_id, auth.uid())
    );

-- Students can SELECT only their own attendance records.
CREATE POLICY attendance_select_student ON public.attendance
    FOR SELECT USING (student_id = auth.uid());

-- -----------------------------------------------------------------
-- INSERT policies
-- -----------------------------------------------------------------

-- Admins can INSERT attendance only for students enrolled in the specified class.
CREATE POLICY attendance_insert_admin ON public.attendance
    FOR INSERT WITH CHECK (
        public.is_admin()
        AND public.is_class_student(class_id, student_id)
    );

-- Teachers can INSERT attendance only for students enrolled in classes they teach.
CREATE POLICY attendance_insert_teacher ON public.attendance
    FOR INSERT WITH CHECK (
        public.is_class_teacher(class_id, auth.uid())
        AND public.is_class_student(class_id, student_id)
    );

-- -----------------------------------------------------------------
-- UPDATE policies
-- -----------------------------------------------------------------

-- Admins can UPDATE any attendance record.
CREATE POLICY attendance_update_admin ON public.attendance
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Teachers can UPDATE attendance for students enrolled in classes they teach.
CREATE POLICY attendance_update_teacher ON public.attendance
    FOR UPDATE USING (
        public.is_class_teacher(class_id, auth.uid())
    )
    WITH CHECK (
        public.is_class_teacher(class_id, auth.uid())
        AND public.is_class_student(class_id, student_id)
    );

-- -----------------------------------------------------------------
-- DELETE policies
-- -----------------------------------------------------------------

-- Admins can DELETE any attendance record.
CREATE POLICY attendance_delete_admin ON public.attendance
    FOR DELETE USING (public.is_admin());

-- Teachers can DELETE attendance for classes they teach.
CREATE POLICY attendance_delete_teacher ON public.attendance
    FOR DELETE USING (
        public.is_class_teacher(class_id, auth.uid())
    );

-- End of migration
