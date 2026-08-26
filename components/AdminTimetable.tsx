"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  DAY_NAMES,
  formatRange,
  groupByDay,
  timesOverlap,
  type TimetableEntry,
} from "@/lib/timetable";
import { toastManager } from "@/components/ui/toast";
import { Loader2, School } from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { FormMessage } from "@/components/shared/form-message";

interface TeacherOption {
  id: string;
  full_name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface Entry extends TimetableEntry {
  class_id: string;
  teacher_id: string | null;
}

interface FormState {
  id: string | null; // null = create
  course_code: string;
  course_title: string;
  teacher_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  course_code: "",
  course_title: "",
  teacher_id: "",
  day_of_week: "1",
  start_time: "09:00",
  end_time: "09:50",
  room: "",
};

export default function AdminTimetable() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addToast = toastManager.add.bind(toastManager);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [classesRes, teachersRes, timetableRes] = await Promise.all([
          supabase.from("classes").select("id, name").order("name"),
          supabase
            .from("profiles")
            .select("id, full_name")
            .eq("role", "teacher")
            .order("full_name"),
          supabase
            .from("timetable")
            .select("id, class_id, teacher_id, course_code, course_title, room, day_of_week, start_time, end_time"),
        ]);
        if (classesRes.error) throw classesRes.error;
        if (teachersRes.error) throw teachersRes.error;
        if (timetableRes.error) throw timetableRes.error;
        const cls = (classesRes.data as ClassOption[]) ?? [];
        setClasses(cls);
        setTeachers((teachersRes.data as TeacherOption[]) ?? []);
        setEntries((timetableRes.data as unknown as Entry[]) ?? []);
        if (cls.length > 0) setSelectedClass(cls[0].id);
      } catch (e: any) {
        setError(e.message ?? "Failed to load timetable");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const classEntries = useMemo(
    () => entries.filter((e) => e.class_id === selectedClass),
    [entries, selectedClass],
  );
  const grouped = useMemo(() => groupByDay(classEntries), [classEntries]);
  const editing = form.id !== null;

  const validate = (): string | null => {
    if (!form.course_code.trim()) return "Course code is required.";
    if (!form.course_title.trim()) return "Course title is required.";
    if (!form.teacher_id) return "Teacher is required.";
    if (!form.day_of_week) return "Day is required.";
    if (!form.start_time || !form.end_time)
      return "Start and end times are required.";
    if (form.end_time <= form.start_time)
      return "End time must be after start time.";
    for (const e of entries) {
      if (e.id === form.id) continue;
      if (e.day_of_week !== Number(form.day_of_week)) continue;
      const overlap = timesOverlap(
        form.start_time,
        form.end_time,
        e.start_time,
        e.end_time,
      );
      if (e.class_id === selectedClass && overlap)
        return `Class already has "${e.course_title}" overlapping this time.`;
      if (e.teacher_id === form.teacher_id && overlap)
        return `That teacher is already booked at this time ("${e.course_title}").`;
    }
    return null;
  };

  const saveEntry = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    const row = {
      class_id: selectedClass,
      teacher_id: form.teacher_id,
      course_code: form.course_code.trim(),
      course_title: form.course_title.trim(),
      day_of_week: Number(form.day_of_week),
      start_time: `${form.start_time}:00`,
      end_time: `${form.end_time}:00`,
      room: form.room.trim(),
    };
    const { error: dbError } = form.id
      ? await supabase.from("timetable").update(row).eq("id", form.id)
      : await supabase.from("timetable").insert(row);
    if (dbError) {
      setError(dbError.message);
    } else {
      const { data } = await supabase
        .from("timetable")
        .select("id, class_id, teacher_id, course_code, course_title, room, day_of_week, start_time, end_time");
      setEntries((data as unknown as Entry[]) ?? []);
      setForm(EMPTY_FORM);
      addToast({ type: "success", title: form.id ? "Timetable entry updated" : "Timetable entry added" });
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    setError(null);
    const { error: dbError } = await supabase.from("timetable").delete().eq("id", id);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (form.id === id) setForm(EMPTY_FORM);
    addToast({ type: "success", title: "Timetable entry deleted" });
  };

  const requestDeleteEntry = (id: string) => {
    setPendingConfirm({
      title: "Delete timetable entry?",
      description: "This entry will be removed from the weekly schedule.",
      confirmLabel: "Delete",
      action: () => {
        void deleteEntry(id);
      },
    });
  };

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 rounded-xl border bg-card p-8 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading timetable…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Class selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="tt-class" className="text-sm font-medium">
          Class
        </label>
        <select
          id="tt-class"
          value={selectedClass}
          onChange={(e) => {
            setSelectedClass(e.target.value);
            setForm(EMPTY_FORM);
            setError(null);
          }}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Create / edit form */}
      <div className="rounded-xl border bg-card p-4 shadow-card md:p-5">
        <h3 className="mb-3 text-base font-semibold">
          {editing ? "Edit Timetable Entry" : "Create Timetable Entry"}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            placeholder="Course code (e.g. 23CSE510)"
            aria-label="Course code"
            value={form.course_code}
            onChange={(e) => setForm({ ...form, course_code: e.target.value })}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="text"
            placeholder="Course title"
            aria-label="Course title"
            value={form.course_title}
            onChange={(e) => setForm({ ...form, course_title: e.target.value })}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2"
          />
          <select
            aria-label="Teacher"
            value={form.teacher_id}
            onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          <select
            aria-label="Day of week"
            value={form.day_of_week}
            onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={String(d)}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="time"
              aria-label="Start time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">–</span>
            <input
              type="time"
              aria-label="End time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <input
            type="text"
            placeholder="Room (optional)"
            aria-label="Room (optional)"
            value={form.room}
            onChange={(e) => setForm({ ...form, room: e.target.value })}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveEntry()}
              disabled={saving || !selectedClass}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : editing ? (
                "Update"
              ) : (
                "Add Entry"
              )}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setError(null);
                }}
                className="inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
      </div>

      {/* Weekly grid */}
      {classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="No classes yet"
          description="Create a class first to start building the weekly timetable."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((day) => (
            <div key={day} className="rounded-xl border bg-card shadow-card">
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <h4 className="text-sm font-semibold tracking-tight">
                  {DAY_NAMES[day]}
                </h4>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {grouped[day]?.length ?? 0}
                </span>
              </div>
              {(grouped[day]?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No entries
                </p>
              ) : (
                <ul className="space-y-2 p-3">
                  {grouped[day]!.map((entry) => {
                    const isBreak =
                      entry.course_code === "LUNCH" || entry.course_code === "BREAK";
                    return (
                    <li
                      key={entry.id}
                      className={`rounded-lg border p-3 ${
                        isBreak
                          ? "border-dashed bg-muted/40 text-muted-foreground"
                          : "border-l-2 border-l-primary/50 bg-background/40"
                      }`}
                    >
                      <div className="font-mono text-xs font-medium text-muted-foreground">
                        {formatRange(entry.start_time, entry.end_time)}
                      </div>
                      <div className={`mt-0.5 font-medium ${isBreak ? "text-sm" : "text-sm"}`}>
                        {entry.course_title}
                      </div>
                      {!isBreak && (
                        <>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                              {entry.course_code}
                            </span>
                            {entry.room && (
                              <span className="text-xs text-muted-foreground">
                                Room {entry.room}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {teachers.find((t) => t.id === entry.teacher_id)?.full_name ??
                              "(no teacher)"}
                          </div>
                          <div className="mt-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  id: entry.id,
                                  course_code: entry.course_code,
                                  course_title: entry.course_title,
                                  teacher_id: entry.teacher_id ?? "",
                                  day_of_week: String(entry.day_of_week),
                                  start_time: entry.start_time.slice(0, 5),
                                  end_time: entry.end_time.slice(0, 5),
                                  room: entry.room,
                                })
                              }
                              className="min-h-11 flex-1 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-accent"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteEntry(entry.id)}
                              className="min-h-11 flex-1 rounded-lg border border-destructive/30 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingConfirm?.action()}>
              {pendingConfirm?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
