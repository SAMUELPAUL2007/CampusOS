-- Grant base DML privileges to PostgREST roles (authenticated, anon).
-- RLS policies remain enforced AFTER these grants.
-- PostgREST checks base grants before RLS; without these, all queries return 42501.

-- profiles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- classes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT SELECT ON public.classes TO anon;

-- class_teachers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT SELECT ON public.class_teachers TO anon;

-- class_students
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_students TO authenticated;
GRANT SELECT ON public.class_students TO anon;

-- attendance
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT SELECT ON public.attendance TO anon;

-- exams
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT SELECT ON public.exams TO anon;

-- marks
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marks TO authenticated;
GRANT SELECT ON public.marks TO anon;
