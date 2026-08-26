-- 2024‑09‑02: Tighten attendance_records read policy.
-- Students must see ONLY their own attendance records (Part 19).
-- The previous policy also exposed classmates' records to enrolled
-- students via the class-membership branch of the EXISTS clause.
-- attendance_sessions remains readable to the enrolled class (needed
-- for embedded joins), but individual records are private per student.

DROP POLICY IF EXISTS attendance_records_select ON public.attendance_records;

CREATE POLICY attendance_records_select ON public.attendance_records
    FOR SELECT USING (
        public.is_admin()
        OR student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.attendance_sessions s
            JOIN public.timetable t ON t.id = s.timetable_id
            WHERE s.id = session_id
              AND (
                  public.is_class_teacher(s.class_id, auth.uid())
                  OR t.teacher_id = auth.uid()
              )
        )
    );
