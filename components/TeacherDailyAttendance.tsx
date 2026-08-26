"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AttendanceTaker, {
  type AttendanceTakerMeta,
  type RosterStudent,
} from "@/components/AttendanceTaker";
import {
  formatRange,
  localDateStr,
  minutesOf,
  nowMinutes,
  sessionState,
} from "@/lib/timetable";
import { friendlyAttendanceError } from "@/lib/attendance-client";
import { removeStudentFromClassAction } from "@/app/teacher/actions";
import { CalendarDays } from "lucide-react";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FormMessage } from "@/components/shared/form-message";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastManager } from "@/components/ui/toast";

export interface TeacherEntry {
  id: string;
  course_code: string;
  course_title: string;
  room: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
  class_name: string;
  class_id: string;
}

interface SessionInfo {
  sessionId: string;
  updatedAt: string;
}

/**
 * Teacher attendance with date navigation (Previous / date picker / Next).
 * - Future dates: sessions shown read-only ("Upcoming").
 * - Today: take within the time window; edit taken sessions all day.
 * - Past dates: take or edit own conducted sessions.
 * RLS enforces that a teacher can only ever write their OWN entries'
 * sessions and records — the UI cannot bypass this.
 */
export default function TeacherDailyAttendance({ entries }: { entries: TeacherEntry[] }) {
  const today = localDateStr();
  const [date, setDate] = useState<string>(today);
  const [now, setNow] = useState<Date | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [sessionsMap, setSessionsMap] = useState<Record<string, SessionInfo>>({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const shiftDate = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(localDateStr(d));
    setOpenEntryId(null);
  };

  const selectedDay = new Date(date + "T00:00:00").getDay();
  const weekday = selectedDay >= 1 && selectedDay <= 5 ? selectedDay : null;
  const isFuture = date > today;
  const isPast = date < today;
  const isToday = date === today;

  // Sessions already having attendance for the selected date.
  const refreshSessions = useCallback(async () => {
    if (isFuture || !weekday) {
      setSessionsMap({});
      return;
    }
    const ids = entries.filter((e) => e.day_of_week === weekday).map((e) => e.id);
    if (ids.length === 0) {
      setSessionsMap({});
      return;
    }
    setSessionsLoading(true);
    try {
      const { data } = await supabase
        .from("attendance_sessions")
        .select("id, timetable_id, updated_at")
        .in("timetable_id", ids)
        .eq("session_date", date);
      const m: Record<string, SessionInfo> = {};
      for (const s of (data as { id: string; timetable_id: string; updated_at: string }[]) ?? []) {
        m[s.timetable_id] = { sessionId: s.id, updatedAt: s.updated_at };
      }
      setSessionsMap(m);
    } finally {
      setSessionsLoading(false);
    }
  }, [entries, weekday, date, isFuture]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const getRoster = async (classId: string): Promise<RosterStudent[]> => {
    if (rosters[classId]) return rosters[classId];
    const { data, error } = await supabase.rpc("get_class_roster", { p_class_id: classId });
    if (error) throw new Error(error.message);
    const list = ((data as unknown as { student_id: string; full_name: string }[]) ?? []).map(
      (r) => ({ id: r.student_id, full_name: r.full_name }),
    );
    setRosters((prev) => ({ ...prev, [classId]: list }));
    return list;
  };

  const confirmRemoveStudent = async () => {
    if (!pendingRemove || removing) return;
    setRemoving(true);
    try {
      const result = await removeStudentFromClassAction(
        pendingRemove.classId,
        pendingRemove.studentId,
      );
      if (!result.ok) {
        setRosterError(result.message);
        toastManager.add({ type: "error", title: result.message });
        return;
      }
      // Refresh the roster: drop the cache so the next open refetches, and
      // close the session view that showed the removed student.
      setRosters((prev) => {
        const next = { ...prev };
        delete next[pendingRemove.classId];
        return next;
      });
      setOpenEntryId(null);
      void refreshSessions();
      toastManager.add({ type: "success", title: "Student removed from class." });
    } catch {
      const message = "Failed to remove the student. Please try again.";
      setRosterError(message);
      toastManager.add({ type: "error", title: message });
    } finally {
      setRemoving(false);
      setPendingRemove(null);
    }
  };

  const curMin = now ? nowMinutes(now) : -1;
  const minLabel = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    const ap = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
  };

  const sorted = useMemo(
    () =>
      entries
        .filter((e) => e.day_of_week === weekday)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [entries, weekday],
  );

  const prettyDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/60"
        >
          &larr; Previous Day
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            setDate(e.target.value || today);
            setOpenEntryId(null);
          }}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next Day &rarr;
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => {
              setDate(today);
              setOpenEntryId(null);
            }}
            className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/60"
          >
            Jump to Today
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Policy:</span> taking opens 10 min before each session and
        closes 15 min after it ends (today). Previous days of YOUR sessions can be viewed and
        corrected any time. Future dates are read-only. You can never access another teacher&apos;s
        sessions — enforced server-side.
      </p>

      {rosterError && <FormMessage tone="error">{rosterError}</FormMessage>}

      <h3 className="text-sm font-semibold text-muted-foreground">{prettyDate(date)}</h3>

      {(selectedDay === 0 || selectedDay === 6) && (
        <EmptyState
          icon={CalendarDays}
          title="Weekends have no scheduled classes."
          description="Use the date navigation above to pick a school day."
        />
      )}

      {sorted.map((e) => {
        const st =
          curMin < 0 || !isToday
            ? isFuture
              ? "upcoming"
              : "done"
            : sessionState(minutesOf(e.start_time), minutesOf(e.end_time), curMin);
        const taken = !!sessionsMap[e.id];
        const isOpen = openEntryId === e.id;

        let buttonLabel: string;
        let disabled = false;
        if (isFuture) {
          buttonLabel = "Upcoming";
          disabled = true;
        } else if (taken) {
          buttonLabel = "Edit Attendance";
        } else if (isPast) {
          buttonLabel = "Take Attendance";
        } else {
          // today, not yet taken
          const windowOpen =
            curMin >= minutesOf(e.start_time) - 10 &&
            curMin <= minutesOf(e.end_time) + 15;
          if (windowOpen) buttonLabel = "Take Attendance";
          else {
            buttonLabel = st === "upcoming" ? "Opens soon" : "Window closed";
            disabled = true;
          }
        }

        return (
          <div key={e.id}>
            <div
              className={`flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors sm:flex-row sm:items-center sm:gap-4 ${isOpen ? "border-primary/50" : ""}`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    {formatRange(e.start_time, e.end_time)}
                  </span>
                  <h4 className="text-sm font-semibold">{e.course_title}</h4>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                    {e.course_code}
                  </span>
                  {isFuture && (
                    <StatusBadge tone="info">Upcoming · Attendance not available yet</StatusBadge>
                  )}
                  {!isFuture && taken && (
                    <StatusBadge tone="success">&#10003; Attendance Taken</StatusBadge>
                  )}
                  {!isFuture && !taken && !disabled && (
                    <StatusBadge tone="warning">Attendance Not Taken</StatusBadge>
                  )}
                  {st === "live" && (
                    <StatusBadge tone="success">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" />
                        NOW
                      </span>
                    </StatusBadge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {e.class_name}
                  {e.room ? ` · Room ${e.room}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                title={
                  isFuture
                    ? "Attendance becomes available on the session day."
                    : disabled
                      ? `Attendance opens at ${minLabel(minutesOf(e.start_time) - 10)}.`
                      : undefined
                }
                onClick={async () => {
                  if (isOpen) {
                    setOpenEntryId(null);
                    void refreshSessions();
                    return;
                  }
                  try {
                    await getRoster(e.class_id);
                    setOpenEntryId(e.id);
                  } catch (err: unknown) {
                    setRosterError(friendlyAttendanceError(err, "load"));
                  }
                }}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isOpen ? "Close" : buttonLabel}
              </button>
            </div>

            {isOpen && rosters[e.class_id] && (
              <div className="mt-2">
                <AttendanceTaker
                  meta={
                    {
                      timetableId: e.id,
                      classId: e.class_id,
                      className: e.class_name,
                      courseCode: e.course_code,
                      courseTitle: e.course_title,
                      room: e.room,
                      startTime: e.start_time,
                      endTime: e.end_time,
                    } satisfies AttendanceTakerMeta
                  }
                  date={date}
                  roster={rosters[e.class_id]}
                  canManage
                  sessionUpdatedAt={sessionsMap[e.id]?.updatedAt ?? null}
                  onRemoveStudent={(student) =>
                    setPendingRemove({
                      studentId: student.id,
                      studentName: student.full_name,
                      classId: e.class_id,
                      className: e.class_name,
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Remove student from class confirmation */}
      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from class?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{pendingRemove?.studentName}</span> from{" "}
              <span className="font-medium text-foreground">{pendingRemove?.className}</span>.
              Their CampusOS account and historical academic records will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRemoveStudent();
              }}
            >
              <span className="inline-flex items-center gap-2">
                {removing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {removing ? "Removing…" : "Remove Student"}
              </span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
