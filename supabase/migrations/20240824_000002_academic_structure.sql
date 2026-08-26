-- supabase/migrations/20240824_000002_academic_structure.sql
-- ------------------------------------------------------------
-- Academic structure for CampusOS (revised)
-- Creates tables for classes, class‑teacher assignments, and class‑student enrollments.
-- Includes RLS policies and hardened security‑definer helper functions.
-- ------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. classes table
-- ---------------------------------------------------------------------
CREATE TABLE public.classes (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text        NOT NULL,
    description   text,
    created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Ensure class names are not empty strings.
ALTER TABLE public.classes
    ADD CONSTRAINT classes_name_not_empty CHECK (char_length(trim(name)) > 0);

-- Optional uniqueness: class name unique per creator (allow same name across different creators).
CREATE UNIQUE INDEX IF NOT EXISTS classes_name_creator_idx ON public.classes (created_by, lower(name));

-- ---------------------------------------------------------------------
-- 2. class_teachers table – many‑to‑many teacher assignments
-- ---------------------------------------------------------------------
CREATE TABLE public.class_teachers (
    class_id   uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (class_id, teacher_id)
);

-- ---------------------------------------------------------------------
-- 3. class_students table – many‑to‑many student enrollments
-- ---------------------------------------------------------------------
CREATE TABLE public.class_students (
    class_id   uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (class_id, student_id)
);

-- ---------------------------------------------------------------------
-- 4. Helper functions for role validation (SECURITY DEFINER)
-- ---------------------------------------------------------------------

-- Ensure a profile ID refers to a teacher role.
CREATE OR REPLACE FUNCTION public.is_teacher(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_profile_id AND role = 'teacher'
    );
$$;

-- Ensure a profile ID refers to a student role.
CREATE OR REPLACE FUNCTION public.is_student(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_profile_id AND role = 'student'
    );
$$;

-- Grant EXECUTE to PUBLIC so RLS policies can call these helpers.
GRANT EXECUTE ON FUNCTION public.is_teacher(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student(uuid) TO PUBLIC;

-- Update classes.updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
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

CREATE TRIGGER trg_touch_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Set created_by to the authenticated admin on INSERT.
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Only admins may insert, enforce via policy; still set value safely.
    NEW.created_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_created_by
BEFORE INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ---------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------

-- Enable RLS on all new tables.
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Policies for `classes`
-- ---------------------------------------------------------------------

-- Admins can SELECT any class.
CREATE POLICY classes_select_admin ON public.classes
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT classes they are assigned to.
CREATE POLICY classes_select_teacher ON public.classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_teachers ct
            WHERE ct.class_id = classes.id AND ct.teacher_id = auth.uid()
        )
    );

-- Students can SELECT classes they are enrolled in.
CREATE POLICY classes_select_student ON public.classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_students cs
            WHERE cs.class_id = classes.id AND cs.student_id = auth.uid()
        )
    );

-- Admins can INSERT, UPDATE, DELETE classes.
CREATE POLICY classes_insert_admin ON public.classes
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY classes_update_admin ON public.classes
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY classes_delete_admin ON public.classes
    FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Policies for `class_teachers`
-- ---------------------------------------------------------------------

-- Admins can SELECT any teacher assignment.
CREATE POLICY class_teachers_select_admin ON public.class_teachers
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT only their own assignments.
CREATE POLICY class_teachers_select_teacher ON public.class_teachers
    FOR SELECT USING (teacher_id = auth.uid());

-- Admins can INSERT teacher assignments (validated by is_teacher).
CREATE POLICY class_teachers_insert_admin ON public.class_teachers
    FOR INSERT WITH CHECK (public.is_admin() AND public.is_teacher(teacher_id));

-- Admins can DELETE any teacher assignment.
CREATE POLICY class_teachers_delete_admin ON public.class_teachers
    FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Policies for `class_students`
-- ---------------------------------------------------------------------

-- Admins can SELECT any student enrollment.
CREATE POLICY class_students_select_admin ON public.class_students
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT enrollments for classes they teach.
CREATE POLICY class_students_select_teacher ON public.class_students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_teachers ct
            WHERE ct.class_id = class_students.class_id AND ct.teacher_id = auth.uid()
        )
    );

-- Students can SELECT only their own enrollments.
CREATE POLICY class_students_select_student ON public.class_students
    FOR SELECT USING (student_id = auth.uid());

-- Admins can INSERT student enrollments (validated by is_student).
CREATE POLICY class_students_insert_admin ON public.class_students
    FOR INSERT WITH CHECK (public.is_admin() AND public.is_student(student_id));

-- Admins can DELETE any student enrollment.
CREATE POLICY class_students_delete_admin ON public.class_students
    FOR DELETE USING (public.is_admin());

-- End of migration
