-- supabase/migrations/20240824_000004_exams_marks.sql
-- ------------------------------------------------------------
-- Exams and Marks for CampusOS
-- Records exams per class and marks per student per exam.
-- Includes RLS policies, helper functions, triggers, and indexes.
-- ------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. exams table
-- ---------------------------------------------------------------------
CREATE TABLE public.exams (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    description   text,
    exam_date     date        NOT NULL,
    created_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ---------------------------------------------------------------------
-- 2. exams constraints
-- ---------------------------------------------------------------------

-- Exam name must not be empty after trimming.
ALTER TABLE public.exams
    ADD CONSTRAINT exams_name_not_empty
    CHECK (char_length(trim(name)) > 0);

-- ---------------------------------------------------------------------
-- 3. exams indexes
-- ---------------------------------------------------------------------

-- Look up exams by class (e.g. teacher viewing exams for a class).
CREATE INDEX IF NOT EXISTS exams_class_id_idx
    ON public.exams (class_id);

-- Look up exams by date (e.g. filtering by exam date).
CREATE INDEX IF NOT EXISTS exams_exam_date_idx
    ON public.exams (exam_date);

-- ---------------------------------------------------------------------
-- 4. exams triggers
-- ---------------------------------------------------------------------

-- Update updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION public.touch_exams_updated_at()
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

CREATE TRIGGER trg_touch_exams_updated_at
BEFORE UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.touch_exams_updated_at();

-- Set created_by to the authenticated user on INSERT.
CREATE OR REPLACE FUNCTION public.set_exam_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.created_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_exam_created_by
BEFORE INSERT ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.set_exam_created_by();

-- ---------------------------------------------------------------------
-- 5. marks table
-- ---------------------------------------------------------------------
CREATE TABLE public.marks (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         uuid        NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    marks_obtained  numeric     NOT NULL,
    max_marks       numeric     NOT NULL,
    marked_by       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- ---------------------------------------------------------------------
-- 6. marks constraints
-- ---------------------------------------------------------------------

-- Marks obtained must be non-negative.
ALTER TABLE public.marks
    ADD CONSTRAINT marks_obtained_non_negative
    CHECK (marks_obtained >= 0);

-- Max marks must be positive.
ALTER TABLE public.marks
    ADD CONSTRAINT marks_max_marks_positive
    CHECK (max_marks > 0);

-- Marks obtained cannot exceed max marks.
ALTER TABLE public.marks
    ADD CONSTRAINT marks_obtained_lte_max_marks
    CHECK (marks_obtained <= max_marks);

-- At most one mark record per exam + student.
ALTER TABLE public.marks
    ADD CONSTRAINT marks_exam_student_unique
    UNIQUE (exam_id, student_id);

-- ---------------------------------------------------------------------
-- 7. marks indexes
-- ---------------------------------------------------------------------

-- Look up marks by exam (e.g. teacher viewing marks for an exam).
CREATE INDEX IF NOT EXISTS marks_exam_id_idx
    ON public.marks (exam_id);

-- Look up marks by student (e.g. student viewing their own marks).
CREATE INDEX IF NOT EXISTS marks_student_id_idx
    ON public.marks (student_id);

-- Composite index for the most common query: all marks for an exam by student.
CREATE INDEX IF NOT EXISTS marks_exam_student_idx
    ON public.marks (exam_id, student_id);

-- ---------------------------------------------------------------------
-- 8. marks triggers
-- ---------------------------------------------------------------------

-- Update updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION public.touch_marks_updated_at()
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

CREATE TRIGGER trg_touch_marks_updated_at
BEFORE UPDATE ON public.marks
FOR EACH ROW EXECUTE FUNCTION public.touch_marks_updated_at();

-- Set marked_by to the authenticated user on INSERT (prevent client impersonation).
CREATE OR REPLACE FUNCTION public.set_marks_marked_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.marked_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_marks_marked_by
BEFORE INSERT ON public.marks
FOR EACH ROW EXECUTE FUNCTION public.set_marks_marked_by();

-- ---------------------------------------------------------------------
-- 9. SECURITY DEFINER helper functions
-- ---------------------------------------------------------------------

-- Check if a teacher teaches the class associated with an exam.
-- Bypasses RLS on exams and class_teachers to avoid circular dependency.
CREATE OR REPLACE FUNCTION public.is_exam_class_teacher(p_exam_id uuid, p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.exams e
        JOIN public.class_teachers ct ON ct.class_id = e.class_id
        WHERE e.id = p_exam_id AND ct.teacher_id = p_teacher_id
    );
$$;

-- Check if a student is enrolled in the class associated with an exam.
-- Bypasses RLS on exams and class_students to avoid circular dependency.
CREATE OR REPLACE FUNCTION public.is_exam_class_student(p_exam_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.exams e
        JOIN public.class_students cs ON cs.class_id = e.class_id
        WHERE e.id = p_exam_id AND cs.student_id = p_student_id
    );
$$;

-- Grant minimum EXECUTE to PUBLIC so RLS policies can call these helpers.
GRANT EXECUTE ON FUNCTION public.is_exam_class_teacher(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_exam_class_student(uuid, uuid) TO PUBLIC;

-- ---------------------------------------------------------------------
-- 10. Enable RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 11. RLS policies for exams
-- ---------------------------------------------------------------------

-- -----------------------------------------------------------------
-- SELECT policies
-- -----------------------------------------------------------------

-- Admins can SELECT all exams.
CREATE POLICY exams_select_admin ON public.exams
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT exams for classes they teach.
CREATE POLICY exams_select_teacher ON public.exams
    FOR SELECT USING (
        public.is_class_teacher(class_id, auth.uid())
    );

-- Students can SELECT exams only when enrolled in the exam's class.
CREATE POLICY exams_select_student ON public.exams
    FOR SELECT USING (
        public.is_class_student(class_id, auth.uid())
    );

-- -----------------------------------------------------------------
-- INSERT policies
-- -----------------------------------------------------------------

-- Admins can INSERT exams for any class.
CREATE POLICY exams_insert_admin ON public.exams
    FOR INSERT WITH CHECK (public.is_admin());

-- Teachers can INSERT exams only for classes they teach.
CREATE POLICY exams_insert_teacher ON public.exams
    FOR INSERT WITH CHECK (
        public.is_class_teacher(class_id, auth.uid())
    );

-- -----------------------------------------------------------------
-- UPDATE policies
-- -----------------------------------------------------------------

-- Admins can UPDATE any exam.
CREATE POLICY exams_update_admin ON public.exams
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Teachers can UPDATE exams only for classes they teach.
CREATE POLICY exams_update_teacher ON public.exams
    FOR UPDATE USING (
        public.is_class_teacher(class_id, auth.uid())
    )
    WITH CHECK (
        public.is_class_teacher(class_id, auth.uid())
    );

-- -----------------------------------------------------------------
-- DELETE policies
-- -----------------------------------------------------------------

-- Admins can DELETE any exam.
CREATE POLICY exams_delete_admin ON public.exams
    FOR DELETE USING (public.is_admin());

-- Teachers can DELETE exams only for classes they teach.
CREATE POLICY exams_delete_teacher ON public.exams
    FOR DELETE USING (
        public.is_class_teacher(class_id, auth.uid())
    );

-- ---------------------------------------------------------------------
-- 12. RLS policies for marks
-- ---------------------------------------------------------------------

-- -----------------------------------------------------------------
-- SELECT policies
-- -----------------------------------------------------------------

-- Admins can SELECT all marks.
CREATE POLICY marks_select_admin ON public.marks
    FOR SELECT USING (public.is_admin());

-- Teachers can SELECT marks only for exams belonging to classes they teach.
CREATE POLICY marks_select_teacher ON public.marks
    FOR SELECT USING (
        public.is_exam_class_teacher(exam_id, auth.uid())
    );

-- Students can SELECT only their own marks.
CREATE POLICY marks_select_student ON public.marks
    FOR SELECT USING (student_id = auth.uid());

-- -----------------------------------------------------------------
-- INSERT policies
-- -----------------------------------------------------------------

-- Admins can INSERT marks for any exam/student combination.
CREATE POLICY marks_insert_admin ON public.marks
    FOR INSERT WITH CHECK (public.is_admin());

-- Teachers can INSERT marks only if:
--   a) teacher teaches the exam's class
--   b) student is enrolled in that class
CREATE POLICY marks_insert_teacher ON public.marks
    FOR INSERT WITH CHECK (
        public.is_exam_class_teacher(exam_id, auth.uid())
        AND public.is_exam_class_student(exam_id, student_id)
    );

-- -----------------------------------------------------------------
-- UPDATE policies
-- -----------------------------------------------------------------

-- Admins can UPDATE any marks record.
CREATE POLICY marks_update_admin ON public.marks
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Teachers can UPDATE marks only if:
--   a) teacher teaches the exam's class (USING — existing row)
--   b) teacher teaches the exam's class AND student is enrolled (WITH CHECK — new row)
CREATE POLICY marks_update_teacher ON public.marks
    FOR UPDATE USING (
        public.is_exam_class_teacher(exam_id, auth.uid())
    )
    WITH CHECK (
        public.is_exam_class_teacher(exam_id, auth.uid())
        AND public.is_exam_class_student(exam_id, student_id)
    );

-- -----------------------------------------------------------------
-- DELETE policies
-- -----------------------------------------------------------------

-- Admins can DELETE any marks record.
CREATE POLICY marks_delete_admin ON public.marks
    FOR DELETE USING (public.is_admin());

-- Teachers can DELETE marks only for exams belonging to classes they teach.
CREATE POLICY marks_delete_teacher ON public.marks
    FOR DELETE USING (
        public.is_exam_class_teacher(exam_id, auth.uid())
    );

-- End of migration
