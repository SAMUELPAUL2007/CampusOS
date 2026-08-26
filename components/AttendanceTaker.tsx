"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  findOrCreateSession,
  friendlyAttendanceError,
  loadSessionWithRecords,
  saveRecords,
} from "@/lib/attendance-client";
import { formatRange } from "@/lib/timetable";
import { Loader2, Search, Users, X } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export interface RosterStudent {
  id: string;
  full_name: string;
}

export interface AttendanceTakerMeta {
  timetableId: string;
  classId: string;
  className: string;
  courseCode: string;
  courseTitle: string;
  room: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  teacherName?: string | null;
}

/**
 * Take / edit attendance for ONE session (class + subject + date).
 * Saving is idempotent: the session is found-or-created and records are
 * upserted on (session_id, student_id), so saving twice updates rather
 * than duplicates.
 */
export default function AttendanceTaker({
  meta,
  date,
  roster,
  canManage,
  sessionUpdatedAt,
  onRemoveStudent,
}: {
  meta: AttendanceTakerMeta;
  date: string;
  roster: RosterStudent[];
  canManage: boolean;
  sessionUpdatedAt?: string | null;
  /** When provided, each roster row gains a "Remove" action (teacher class roster). */
  onRemoveStudent?: (student: RosterStudent) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Client-side search over the authorized roster. Filtering affects
  // DISPLAY only — saving always submits the full roster, so students
  // hidden by the current search keep their existing statuses.
  const q = search.trim().toLowerCase();
  const visibleRoster =
    q.length === 0 ? roster : roster.filter((s) => s.full_name.toLowerCase().includes(q));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { sessionId, records } = await loadSessionWithRecords(supabase, meta, date);
      setHasExisting(sessionId !== null);
      if (sessionId) {
        const map: Record<string, string> = {};
        for (const r of records) map[r.student_id] = r.status;
        // Students without a record default to present for editing UX.
        for (const s of roster) if (!map[s.id]) map[s.id] = "present";
        setStatuses(map);
      } else {
        const init: Record<string, string> = {};
        for (const s of roster) init[s.id] = "present";
        setStatuses(init);
      }
    } catch (e: unknown) {
      setError(friendlyAttendanceError(e, "load"));
    } finally {
      setLoading(false);
    }
  }, [meta, date, roster]);

  useEffect(() => {
    void load();
  }, [load]);

  const presentCount = roster.filter((s) => statuses[s.id] === "present").length;
  const absentCount = roster.length - presentCount;

  // Save ALWAYS submits the full roster (not just visible search results),
  // preserving statuses of filtered-out students.
  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const sessionId = await findOrCreateSession(
        supabase,
        { timetableId: meta.timetableId, classId: meta.classId },
        date,
      );
      await saveRecords(
        supabase,
        sessionId,
        roster.map((s) => ({ studentId: s.id, status: statuses[s.id] ?? "absent" })),
      );
      setMessage(hasExisting ? "Attendance updated successfully." : "Attendance saved successfully.");
      setHasExisting(true);
    } catch (e: unknown) {
      setError(friendlyAttendanceError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-muted-foreground">
            {formatRange(meta.startTime, meta.endTime)}
          </span>
          <h3 className="text-base font-semibold tracking-tight">{meta.courseTitle}</h3>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
            {meta.courseCode}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {meta.className}
          {meta.teacherName ? ` · ${meta.teacherName}` : ""}
          {meta.room ? ` · Room ${meta.room}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {date} · Session = class + subject + date. Saving twice updates — never duplicates.
          {sessionUpdatedAt
            ? ` Last updated: ${new Date(sessionUpdatedAt).toLocaleString()}`
            : ""}
        </p>
      </div>

      {!canManage ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          You can only take attendance during your scheduled time window. Admins may correct historical sessions.
        </p>
      ) : loading ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading roster…
            </div>
      ) : (
        <>
          {hasExisting && !message && (
            <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              Attendance already taken for this session — you are editing it.
            </p>
          )}

          {/* Controls */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setStatuses(Object.fromEntries(roster.map((s) => [s.id, "present"])))
              }
              className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Mark All Present
            </button>
            <button
              type="button"
              onClick={() =>
                setStatuses(Object.fromEntries(roster.map((s) => [s.id, "absent"])))
              }
              className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Mark All Absent
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || roster.length === 0}
              className="ml-auto inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {saving ? "Saving…" : hasExisting ? "Update Attendance" : "Save Attendance"}
            </button>
          </div>

          {/* Student search (display filter only — save covers everyone) */}
          <div className="mb-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students by name..."
                aria-label="Search students by name"
                className="h-9 w-full max-w-sm rounded-md border border-input bg-background pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2.5 text-muted-foreground transition-colors hover:bg-accent"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {visibleRoster.length} of {roster.length} students. Saving always saves all{" "}
              {roster.length} — filtered-out students keep their statuses.
            </p>
          </div>

          {/* Student list */}
          {visibleRoster.length === 0 ? (
            <EmptyState
              icon={Users}
              title={"No students found for \u0022" + search + "\u0022."}
              description="Try a different search."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {visibleRoster.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{s.full_name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {onRemoveStudent && (
                    <button
                      type="button"
                      onClick={() => onRemoveStudent(s)}
                      className="inline-flex h-9 items-center rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  )}
                  {(["present", "absent"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatuses({ ...statuses, [s.id]: st })}
                      className={`min-h-11 flex-1 rounded-md px-4 text-sm font-medium capitalize transition-colors ${
                        statuses[s.id] === st
                          ? st === "present"
                            ? "bg-success text-success-foreground"
                            : "bg-destructive text-destructive-foreground"
                          : "border hover:bg-accent"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </span>
              </li>
              ))}
            </ul>
          )}

          {/* Counts */}
          <p className="mt-3 text-sm text-muted-foreground">
            Present: <span className="font-semibold text-success">{presentCount}</span>{" "}
            · Absent: <span className="font-semibold text-destructive">{absentCount}</span> · Total:{" "}
            <span className="font-semibold">{roster.length}</span>
          </p>

          {message && (
            <p role="status" className="mt-2 text-sm font-medium text-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
