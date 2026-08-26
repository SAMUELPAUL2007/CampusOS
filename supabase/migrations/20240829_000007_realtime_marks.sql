-- supabase/migrations/20240829_000007_realtime_marks.sql
-- ------------------------------------------------------------
-- Enable Supabase Realtime for the marks table.
--
-- Realtime postgres_changes events are only delivered for tables that
-- are members of the supabase_realtime publication. Row security is
-- still enforced per subscriber: each authenticated client only
-- receives events for rows it is allowed to SELECT under RLS.
-- ------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'marks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.marks;
    END IF;
END
$$;

-- End of migration
