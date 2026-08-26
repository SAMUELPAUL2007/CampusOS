-- 2024‑08‑31: Timetable system
-- Stores recurring weekly class schedule entries (Mon–Fri).
-- Student timetable is derived from class enrollment; teacher timetable
-- from their own entries. Non-teaching rows (Lunch/Break) have NULL teacher.

-- ---------------------------------------------------------------------
-- 1. timetable table
-- ---------------------------------------------------------------------
CREATE TABLE public.timetable (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id     uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    course_code  text        NOT NULL,
    course_title text        NOT NULL,
    day_of_week  smallint    NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Mon .. 5=Fri
    start_time   time        NOT NULL,
    end_time     time        NOT NULL,
    room         text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.timetable
    ADD CONSTRAINT timetable_time_range_check CHECK (end_time > start_time);

CREATE INDEX timetable_class_day_idx ON public.timetable (class_id, day_of_week, start_time);
CREATE INDEX timetable_teacher_idx   ON public.timetable (teacher_id);

CREATE TRIGGER trg_touch_timetable_updated_at
BEFORE UPDATE ON public.timetable
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;

-- Read: admins, the assigned teacher of the entry, or students enrolled
-- in the entry's class.
CREATE POLICY timetable_select ON public.timetable
    FOR SELECT USING (
        public.is_admin()
        OR teacher_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.class_students cs
            WHERE cs.class_id = timetable.class_id AND cs.student_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.class_teachers ct
            WHERE ct.class_id = timetable.class_id AND ct.teacher_id = auth.uid()
        )
    );

-- Write: admins only.
CREATE POLICY timetable_insert_admin ON public.timetable
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY timetable_update_admin ON public.timetable
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY timetable_delete_admin ON public.timetable
    FOR DELETE USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable TO service_role;

-- ---------------------------------------------------------------------
-- 3. Security-definer RPC for class timetable with teacher names.
-- Mirrors the get_class_roster pattern: profiles RLS intentionally hides
-- other users' rows, so embedded joins cannot resolve teacher names for
-- students. This function gates access explicitly before joining.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_timetable(p_class_id uuid)
RETURNS TABLE (
    id           uuid,
    course_code  text,
    course_title text,
    teacher_name text,
    room         text,
    day_of_week  smallint,
    start_time   time,
    end_time     time
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT t.id,
           t.course_code,
           t.course_title,
           p.full_name AS teacher_name,
           t.room,
           t.day_of_week,
           t.start_time,
           t.end_time
    FROM public.timetable t
    LEFT JOIN public.profiles p ON p.id = t.teacher_id
    WHERE t.class_id = p_class_id
      AND (
          public.is_admin()
          OR EXISTS (
              SELECT 1 FROM public.class_students cs
              WHERE cs.class_id = p_class_id AND cs.student_id = auth.uid()
          )
          OR EXISTS (
              SELECT 1 FROM public.class_teachers ct
              WHERE ct.class_id = p_class_id AND ct.teacher_id = auth.uid()
          )
      );
$$;

REVOKE ALL ON FUNCTION public.get_class_timetable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_timetable(uuid) TO authenticated;
