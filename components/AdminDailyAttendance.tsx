"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AttendanceTaker, {
  type AttendanceTakerMeta,
  type RosterStudent,
} from "@/components/AttendanceTaker";
import { formatRange, localDateStr } from "@/lib/timetable";
import { friendlyAttendanceError } from "@/lib/attendance-client";
import { CalendarDays, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FormMessage } from "@/components/shared/form-message";
import { StatusBadge } from "@/components/shared/status-badge";

interface ClassOption {
  id: string;
  name: string;
}

interface AdminEntry {
  id: string;
  course_code: string;
  course_title: string;
  room: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
  teacher_name: string | null;
}

/**
 * Admin daily attendance management: pick a date and class, see that
 * day's timetable sessions, take or correct attendance for each.
 * Admins may backfill/correct historical sessions at any time.
 */
export default function AdminDailyAttendance({ classes }: { classes: ClassOption[] }) {
  const [date, setDate] = useState<string>(localDateStr());
  const [classId, setClassId] = useState<string>("");
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [takenMap, setTakenMap] = useState<Record<string, string>>({}); // timetable_id -> updated_at
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
  }, [classes, classId]);

  // Load timetable + teacher names when class changes.
  useEffect(() => {
    if (!classId) return;
    void (async () => {
      setLoading(true);
      setError(null);
      setOpenEntryId(null);
      try {
        const [ttRes, teachersRes] = await Promise.all([
          supabase
            .from("timetable")
            .select("id, course_code, course_title, room, start_time, end_time, day_of_week, teacher_id")
            .eq("class_id", classId)
            .neq("course_code", "LUNCH")
            .neq("course_code", "BREAK")
            .order("start_time"),
          supabase.from("profiles").select("id, full_name").eq("role", "teacher"),
        ]);
        if (ttRes.error) throw ttRes.error;
        const tMap = new Map(
          ((teachersRes.data as { id: string; full_name: string }[]) ?? []).map((t) => [t.id, t.full_name]),
        );
        setEntries(
          ((ttRes.data as unknown as (Omit<AdminEntry, "teacher_name"> & { teacher_id: string | null })[]) ?? []).map((e) => ({
            id: e.id,
            course_code: e.course_code,
            course_title: e.course_title,
            room: e.room,
            start_time: e.start_time,
            end_time: e.end_time,
            day_of_week: e.day_of_week,
            teacher_name: e.teacher_id ? tMap.get(e.teacher_id) ?? null : null,
          })),
        );
      } catch (e: unknown) {
        setError(friendlyAttendanceError(e, "load"));
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

  // Which of this class's sessions already have attendance for the date?
  const refreshTaken = useCallback(async () => {
    if (!classId || !date) return;
    const { data } = await supabase
      .from("attendance_sessions")
      .select("timetable_id, updated_at")
      .eq("class_id", classId)
      .eq("session_date", date);
    const m: Record<string, string> = {};
    for (const s of (data as { timetable_id: string; updated_at: string }[]) ?? [])
      m[s.timetable_id] = s.updated_at;
    setTakenMap(m);
  }, [classId, date]);

  useEffect(() => {
    void refreshTaken();
  }, [refreshTaken]);

  // Weekday of the selected date mapped to the timetable's Mon=1..Fri=5.
  const selectedDay = date ? new Date(date + "T00:00:00").getDay() : 0;
  const dayEntries =
    selectedDay >= 1 && selectedDay <= 5
      ? entries.filter((e) => e.day_of_week === selectedDay)
      : [];

  const getRoster = async (cid: string): Promise<RosterStudent[]> => {
    if (rosters[cid]) return rosters[cid];
    const [enrRes, profRes] = await Promise.all([
      supabase.from("class_students").select("student_id").eq("class_id", cid),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const ids = ((enrRes.data as { student_id: string }[]) ?? []).map((e) => e.student_id);
    const pMap = new Map(((profRes.data as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]));
    const list = ids.map((id) => ({ id, full_name: pMap.get(id) ?? "(unknown)" }));
    setRosters((prev) => ({ ...prev, [cid]: list }));
    return list;
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Policy:</span> admins may take or correct attendance for any
        date (backfill allowed). One session = one class + one subject + one date; saving twice
        updates the existing records.
      </p>

      {/* Pickers */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-end sm:gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="att-date" className="text-sm font-medium">
            Date
          </label>
          <input
            id="att-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setOpenEntryId(null);
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring/60"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="att-class" className="text-sm font-medium">
            Class
          </label>
          <select
            id="att-class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setOpenEntryId(null);
              setRosters({});
            }}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring/60 sm:max-w-xs"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      {/* Sessions for the chosen day */}
      {loading ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading sessions…
            </div>
      ) : dayEntries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No timetable sessions for this class on the selected day."
          description="Try another date or class."
        />
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Sessions —{" "}
            {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </h3>
          {dayEntries.map((e) => {
            const isOpen = openEntryId === e.id;
            const taken = !!takenMap[e.id];
            return (
              <div key={e.id}>
                <div className={`flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors sm:flex-row sm:items-center sm:gap-4 ${isOpen ? "border-primary/50" : ""}`}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-muted-foreground">
                        {formatRange(e.start_time, e.end_time)}
                      </span>
                      <h4 className="text-sm font-semibold">{e.course_title}</h4>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                        {e.course_code}
                      </span>
                      {taken && (
                        <StatusBadge tone="warning">Attendance already taken</StatusBadge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Teacher: {e.teacher_name ?? "(unassigned)"}
                      {e.room ? ` · Room ${e.room}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isOpen) {
                        setOpenEntryId(null);
                        return;
                      }
                      try {
                        await getRoster(classId);
                        setOpenEntryId(e.id);
                      } catch (err: unknown) {
                        setError(friendlyAttendanceError(err, "load"));
                      }
                    }}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring/60"
                  >
                    {isOpen ? "Close" : taken ? "Edit Attendance" : "Take Attendance"}
                  </button>
                </div>

                {isOpen && rosters[classId] && (
                  <div className="mt-2">
                    <AttendanceTaker
                      meta={
                        {
                          timetableId: e.id,
                          classId,
                          className: classes.find((c) => c.id === classId)?.name ?? "",
                          courseCode: e.course_code,
                          courseTitle: e.course_title,
                          room: e.room,
                          startTime: e.start_time,
                          endTime: e.end_time,
                          teacherName: e.teacher_name,
                        } satisfies AttendanceTakerMeta
                      }
                      date={date}
                      roster={rosters[classId]}
                      canManage
                      sessionUpdatedAt={takenMap[e.id] ?? null}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
