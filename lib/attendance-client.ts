import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared client-side operations for the session-based attendance system.
 * Duplicate prevention is enforced by database unique constraints:
 *   attendance_sessions(timetable_id, session_date)
 *   attendance_records(session_id, student_id)
 */

export interface SessionMeta {
  timetableId: string;
  classId: string;
}

/** Find an existing session for a timetable entry + date, or create it. */
export async function findOrCreateSession(
  supabase: SupabaseClient,
  meta: SessionMeta,
  sessionDate: string,
): Promise<string> {
  const selectExisting = () =>
    supabase
      .from("attendance_sessions")
      .select("id")
      .eq("timetable_id", meta.timetableId)
      .eq("session_date", sessionDate)
      .maybeSingle();

  const { data: existing } = await selectExisting();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("attendance_sessions")
    .insert({
      class_id: meta.classId,
      timetable_id: meta.timetableId,
      session_date: sessionDate,
    })
    .select("id")
    .single();

  if (!error && created) return created.id as string;

  // Race lost — another request created it between insert and now.
  const { data: fallback } = await selectExisting();
  if (fallback) return fallback.id as string;
  throw error ?? new Error("Could not create attendance session");
}

export interface ExistingRecord {
  id: string;
  student_id: string;
  status: string;
}

/** Load an existing session's id and its records (if any). */
export async function loadSessionWithRecords(
  supabase: SupabaseClient,
  meta: SessionMeta,
  sessionDate: string,
): Promise<{ sessionId: string | null; records: ExistingRecord[] }> {
  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("id")
    .eq("timetable_id", meta.timetableId)
    .eq("session_date", sessionDate)
    .maybeSingle();
  if (!session) return { sessionId: null, records: [] };

  const sessionId = session.id as string;
  const { data: recs } = await supabase
    .from("attendance_records")
    .select("id, student_id, status")
    .eq("session_id", sessionId);
  return { sessionId, records: (recs as ExistingRecord[]) ?? [] };
}

/** Upsert one status per student for a session (idempotent). */
export async function saveRecords(
  supabase: SupabaseClient,
  sessionId: string,
  entries: { studentId: string; status: string }[],
): Promise<void> {
  const rows = entries.map((e) => ({
    session_id: sessionId,
    student_id: e.studentId,
    status: e.status,
  }));
  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "session_id,student_id" });
  if (error) throw error;
}

/**
 * Map low-level database/RLS errors to user-friendly messages.
 * Technical details stay in the developer console.
 */
export function friendlyAttendanceError(e: unknown, context: "save" | "load"): string {
  const err = e as { code?: string; message?: string } | null;
  console.error(`[attendance ${context}]`, err?.code, err?.message);
  const msg = (err?.message ?? "").toLowerCase();
  if ((err?.code ?? "") === "42501" || msg.includes("row-level security")) {
    return "You don't have permission to edit this attendance.";
  }
  if ((err?.code ?? "") === "23505" || msg.includes("duplicate key")) {
    return "Attendance already exists for this session.";
  }
  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch")
  ) {
    return "Unable to reach the server. Please check your connection and try again.";
  }
  return context === "save"
    ? "Unable to save attendance. Please try again."
    : "Unable to load attendance. Please try again.";
}
