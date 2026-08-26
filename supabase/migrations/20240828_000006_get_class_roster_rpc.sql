-- supabase/migrations/20240828_000006_get_class_roster_rpc.sql
-- ------------------------------------------------------------
-- Secure roster RPC for CampusOS teachers.
--
-- Teachers must see the full names of students enrolled in THEIR
-- assigned classes, but profiles RLS intentionally denies reading
-- other users' profile rows. This SECURITY DEFINER function exposes
-- exactly that narrow slice: enrollment rows for one class, and only
-- when the caller is an authenticated teacher assigned to it.
--
-- Reuses the existing public.is_class_teacher(uuid, uuid) helper
-- (migration 20240825_000003) rather than duplicating logic.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_class_roster(p_class_id uuid)
RETURNS TABLE (
    student_id uuid,
    full_name  text,
    class_id   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
    SELECT
        cs.student_id,
        p.full_name,
        cs.class_id
    FROM public.class_students AS cs
    JOIN public.profiles AS p
      ON p.id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND public.is_class_teacher(p_class_id, auth.uid())
$$;

-- Execution restricted to authenticated users; authorization is
-- enforced inside the function body (assignment check), not by grants.
REVOKE ALL ON FUNCTION public.get_class_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_class_roster(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_class_roster(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_class_roster(uuid) IS
'Returns enrolled students (student_id, full_name, class_id) for a class,
but only when the caller is an authenticated teacher assigned to that class.';

-- End of migration
