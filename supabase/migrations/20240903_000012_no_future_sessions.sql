-- 2024‑09‑02b: Historical-correction rule.
-- Attendance sessions can never be created or moved to a future date.
-- This applies to teachers AND admins: corrections are for conducted
-- sessions only. Prevents fake future attendance at the database level,
-- independent of UI.

CREATE OR REPLACE FUNCTION public.prevent_future_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.session_date > current_date THEN
        RAISE EXCEPTION 'Attendance sessions cannot exist for future dates';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_future_sessions ON public.attendance_sessions;
CREATE TRIGGER trg_no_future_sessions
BEFORE INSERT OR UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_future_session();
