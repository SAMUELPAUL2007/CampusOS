"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { FileText, Loader2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

interface StudentInfo {
  id: string;
  full_name: string;
  email?: string;
}

interface ClassInfo {
  id: string;
  name: string;
  description: string;
  students: StudentInfo[];
}

interface ExamInfo {
  id: string;
  class_id: string;
  name: string;
  description: string | null;
  exam_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MarkInfo {
  id: string;
  exam_id: string;
  student_id: string;
  marks_obtained: number;
  max_marks: number;
}

interface MarkEntry {
  student_id: string;
  full_name: string;
  email?: string;
  marks_obtained: string;
  max_marks: string;
  existing_mark_id?: string;
}

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminExams({
  classes,
  exams,
  marks,
}: {
  classes: ClassInfo[];
  exams: ExamInfo[];
  marks: MarkInfo[];
}) {
  const [examList, setExamList] = useState<ExamInfo[]>(exams);
  const [markList, setMarkList] = useState<MarkInfo[]>(marks);

  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examClassId, setExamClassId] = useState("");
  const [examName, setExamName] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examDate, setExamDate] = useState(todayLocal());
  const [savingExam, setSavingExam] = useState(false);

  const [managingMarksForExam, setManagingMarksForExam] = useState<string | null>(null);
  const [markEntries, setMarkEntries] = useState<MarkEntry[]>([]);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);
  const [deletingMarkId, setDeletingMarkId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshExams = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("exams")
      .select("id, class_id, name, description, exam_date, created_by, created_at, updated_at");
    if (!fetchError && data) {
      setExamList(data as ExamInfo[]);
    }
  }, []);

  const refreshMarks = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("marks")
      .select("id, exam_id, student_id, marks_obtained, max_marks");
    if (!fetchError && data) {
      setMarkList(data as MarkInfo[]);
    }
  }, []);

  // Realtime: keep the marks table in sync without polling. The database
  // remains the source of truth — every change event triggers a single
  // refetch through RLS-scoped reads. The channel is removed on unmount.
  useEffect(() => {
    const channel = supabase
      .channel("marks-realtime-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marks" },
        () => {
          void refreshMarks();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshMarks]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!examClassId) {
      setError("Please select a class.");
      return;
    }
    if (!examName.trim()) {
      setError("Exam name is required.");
      return;
    }

    setSavingExam(true);
    try {
      const { error: insertError } = await supabase.from("exams").insert({
        class_id: examClassId,
        name: examName.trim(),
        description: examDescription.trim() || null,
        exam_date: examDate,
      });
      if (insertError) throw insertError;
      setSuccess("Exam created successfully.");
      setShowExamForm(false);
      setExamClassId("");
      setExamName("");
      setExamDescription("");
      setExamDate(todayLocal());
      await refreshExams();
    } catch (e: any) {
      setError(e.message ?? "Failed to create exam.");
    } finally {
      setSavingExam(false);
    }
  };

  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExamId) return;
    setError(null);
    setSuccess(null);

    if (!examName.trim()) {
      setError("Exam name is required.");
      return;
    }

    setSavingExam(true);
    try {
      const { error: updateError } = await supabase
        .from("exams")
        .update({
          name: examName.trim(),
          description: examDescription.trim() || null,
          exam_date: examDate,
        })
        .eq("id", editingExamId);
      if (updateError) throw updateError;
      setSuccess("Exam updated successfully.");
      setShowExamForm(false);
      setEditingExamId(null);
      setExamClassId("");
      setExamName("");
      setExamDescription("");
      setExamDate(todayLocal());
      await refreshExams();
    } catch (e: any) {
      setError(e.message ?? "Failed to update exam.");
    } finally {
      setSavingExam(false);
    }
  };

  const requestDeleteExam = (examId: string) => {
    setPendingConfirm({
      title: "Delete this exam?",
      description:
        "This will also remove all marks for this exam (cascade delete).",
      confirmLabel: "Delete exam",
      action: () => {
        void handleDeleteExam(examId);
      },
    });
  };

  const handleDeleteExam = async (examId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const { error: deleteError } = await supabase
        .from("exams")
        .delete()
        .eq("id", examId);
      if (deleteError) throw deleteError;
      setSuccess("Exam deleted successfully.");
      if (managingMarksForExam === examId) {
        setManagingMarksForExam(null);
        setMarkEntries([]);
      }
      await refreshExams();
      await refreshMarks();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete exam.");
    }
  };

  const startEditExam = (exam: ExamInfo) => {
    setEditingExamId(exam.id);
    setExamClassId(exam.class_id);
    setExamName(exam.name);
    setExamDescription(exam.description ?? "");
    setExamDate(exam.exam_date);
    setShowExamForm(true);
    setError(null);
    setSuccess(null);
  };

  const cancelExamForm = () => {
    setShowExamForm(false);
    setEditingExamId(null);
    setExamClassId("");
    setExamName("");
    setExamDescription("");
    setExamDate(todayLocal());
    setError(null);
  };

  const openManageMarks = useCallback(
    async (examId: string) => {
      setManagingMarksForExam(examId);
      setLoadingMarks(true);
      setError(null);
      setSuccess(null);

      const exam = examList.find((e) => e.id === examId);
      if (!exam) {
        setError("Exam not found.");
        setLoadingMarks(false);
        return;
      }

      const classInfo = classes.find((c) => c.id === exam.class_id);
      if (!classInfo) {
        setError("Class not found.");
        setLoadingMarks(false);
        return;
      }

      const baseEntries: MarkEntry[] = classInfo.students.map((s) => ({
        student_id: s.id,
        full_name: s.full_name,
        email: s.email,
        marks_obtained: "",
        max_marks: "100",
      }));

      const examMarks = markList.filter((m) => m.exam_id === examId);
      const markMap = new Map<string, MarkInfo>();
      examMarks.forEach((m) => markMap.set(m.student_id, m));

      const merged: MarkEntry[] = baseEntries.map((e) => {
        const existing = markMap.get(e.student_id);
        if (existing) {
          return {
            ...e,
            marks_obtained: String(existing.marks_obtained),
            max_marks: String(existing.max_marks),
            existing_mark_id: existing.id,
          };
        }
        return e;
      });

      setMarkEntries(merged);
      setLoadingMarks(false);
    },
    [examList, classes, markList],
  );

  const closeManageMarks = () => {
    setManagingMarksForExam(null);
    setMarkEntries([]);
  };

  const updateMarkEntry = (
    studentId: string,
    field: "marks_obtained" | "max_marks",
    value: string,
  ) => {
    setMarkEntries((prev) =>
      prev.map((e) =>
        e.student_id === studentId ? { ...e, [field]: value } : e,
      ),
    );
  };

  const saveAllMarks = async () => {
    if (!managingMarksForExam) return;
    setSavingMarks(true);
    setError(null);
    setSuccess(null);

    const rows: {
      exam_id: string;
      student_id: string;
      marks_obtained: number;
      max_marks: number;
    }[] = [];
    const validationErrors: string[] = [];

    for (const entry of markEntries) {
      const obtained = entry.marks_obtained.trim();
      const max = entry.max_marks.trim();

      if (obtained === "" && max === "") {
        continue;
      }

      const obtainedNum = Number(obtained);
      const maxNum = Number(max);

      if (isNaN(obtainedNum) || isNaN(maxNum)) {
        validationErrors.push(
          `${entry.full_name}: marks must be valid numbers.`,
        );
        continue;
      }
      if (obtainedNum < 0) {
        validationErrors.push(
          `${entry.full_name}: marks obtained cannot be negative.`,
        );
        continue;
      }
      if (maxNum <= 0) {
        validationErrors.push(
          `${entry.full_name}: max marks must be greater than 0.`,
        );
        continue;
      }
      if (obtainedNum > maxNum) {
        validationErrors.push(
          `${entry.full_name}: marks obtained cannot exceed max marks.`,
        );
        continue;
      }

      rows.push({
        exam_id: managingMarksForExam,
        student_id: entry.student_id,
        marks_obtained: obtainedNum,
        max_marks: maxNum,
      });
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      setSavingMarks(false);
      return;
    }

    try {
      if (rows.length > 0) {
        // Upsert keyed on the database unique constraint (exam_id,
        // student_id): inserts when absent, updates when present.
        // Prevents "duplicate key" errors when two sessions hold the
        // same roster open or markList state is stale.
        const { error: upsertError } = await supabase
          .from("marks")
          .upsert(rows, { onConflict: "exam_id,student_id" });
        if (upsertError) throw upsertError;
      }

      setSuccess("Marks saved successfully.");
      await refreshMarks();
      await openManageMarks(managingMarksForExam);
    } catch (e: any) {
      setError(e.message ?? "Failed to save marks.");
    } finally {
      setSavingMarks(false);
    }
  };

  const requestDeleteMark = (markId: string) => {
    setPendingConfirm({
      title: "Delete this mark record?",
      description: "The recorded mark will be permanently removed.",
      confirmLabel: "Delete mark",
      action: () => {
        void deleteMark(markId);
      },
    });
  };

  const deleteMark = async (markId: string) => {
    setDeletingMarkId(markId);
    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } = await supabase
        .from("marks")
        .delete()
        .eq("id", markId);
      if (deleteError) throw deleteError;
      setSuccess("Mark deleted.");
      await refreshMarks();
      if (managingMarksForExam) {
        await openManageMarks(managingMarksForExam);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to delete mark.");
    } finally {
      setDeletingMarkId(null);
    }
  };

  const getClassName = (classId: string) =>
    classes.find((c) => c.id === classId)?.name ?? "Unknown";

  const getMarkCount = (examId: string) =>
    markList.filter((m) => m.exam_id === examId).length;

  const sortedExams = [...examList].sort(
    (a, b) => b.exam_date.localeCompare(a.exam_date),
  );

  const managingExam = managingMarksForExam
    ? examList.find((e) => e.id === managingMarksForExam)
    : null;

  return (
    <div className="w-full max-w-4xl space-y-6">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {success && <FormMessage tone="success">{success}</FormMessage>}

      {/* Exam form */}
      {showExamForm && (
        <form
          onSubmit={editingExamId ? handleUpdateExam : handleCreateExam}
          className="space-y-4 rounded-xl border bg-card p-4 shadow-card md:p-5"
        >
          <h2 className="text-base font-semibold">
            {editingExamId ? "Edit Exam" : "Create New Exam"}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="exam-class" className="block text-sm font-medium text-foreground">
              Class
            </label>
            <select
              id="exam-class"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={examClassId}
              onChange={(e) => setExamClassId(e.target.value)}
              disabled={!!editingExamId}
            >
              <option value="">-- Choose a class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.students.length} student
                  {c.students.length !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Exam Name
            </label>
            <Input
              id="exam-name"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="e.g. Midterm Exam"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Description (optional)
            </label>
            <Input
              id="exam-description"
              value={examDescription}
              onChange={(e) => setExamDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Exam Date
            </label>
            <input
              id="exam-date"
              type="date"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={savingExam}>
              {savingExam && <Loader2 className="animate-spin" aria-hidden />}
              {savingExam
                ? "Saving..."
                : editingExamId
                  ? "Update Exam"
                  : "Create Exam"}
            </Button>
            <Button type="button" variant="outline" onClick={cancelExamForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Manage marks view */}
      {managingExam && (
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-card md:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                Marks — {managingExam.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Class: {getClassName(managingExam.class_id)} | Date:{" "}
                {managingExam.exam_date}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={closeManageMarks}>
              Back to Exams
            </Button>
          </div>

          {loadingMarks ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading marks...
            </div>
          ) : markEntries.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students enrolled in this class."
              description="Enroll students in the class to record their marks."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Student
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Email
                      </th>
                      <th scope="col" className="px-4 py-2 text-center font-medium">
                        Marks Obtained
                      </th>
                      <th scope="col" className="px-4 py-2 text-center font-medium">
                        Max Marks
                      </th>
                      <th scope="col" className="px-4 py-2 text-center font-medium">
                        %
                      </th>
                      <th scope="col" className="px-4 py-2 text-center font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {markEntries.map((entry) => {
                      const obtained = Number(entry.marks_obtained);
                      const max = Number(entry.max_marks);
                      const pct =
                        entry.marks_obtained && entry.max_marks && max > 0
                          ? Math.round((obtained / max) * 1000) / 10
                          : null;

                      return (
                        <tr
                          key={entry.student_id}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-4 py-2">{entry.full_name}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {entry.email || "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              className="w-20 text-center"
                              value={entry.marks_obtained}
                              onChange={(e) =>
                                updateMarkEntry(
                                  entry.student_id,
                                  "marks_obtained",
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Input
                              type="number"
                              min="1"
                              step="any"
                              className="w-20 text-center"
                              value={entry.max_marks}
                              onChange={(e) =>
                                updateMarkEntry(
                                  entry.student_id,
                                  "max_marks",
                                  e.target.value,
                                )
                              }
                              placeholder="100"
                            />
                          </td>
                          <td className="px-4 py-2 text-center font-medium">
                            {pct !== null ? `${pct}%` : "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {entry.existing_mark_id ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={
                                  savingMarks || deletingMarkId !== null
                                }
                                onClick={() =>
                                  requestDeleteMark(entry.existing_mark_id!)
                                }
                              >
                                {deletingMarkId === entry.existing_mark_id
                                  ? "Deleting..."
                                  : "Delete"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={saveAllMarks}
                  disabled={savingMarks || loadingMarks || deletingMarkId !== null}
                >
                  {savingMarks && <Loader2 className="animate-spin" aria-hidden />}
                  {savingMarks ? "Saving..." : "Save All Marks"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Exam list */}
      {!showExamForm && !managingMarksForExam && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">All Exams</h2>
            <Button
              onClick={() => { setShowExamForm(true); setError(null); setSuccess(null); }}
            >
              + New Exam
            </Button>
          </div>

          {sortedExams.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No exams found."
              description="Created exams will be listed here."
            />
          ) : (
            <div className="space-y-3">
              {sortedExams.map((exam) => {
                const upcoming =
                  exam.exam_date >= new Date().toISOString().slice(0, 10);
                return (
                <details key={exam.id} className="rounded-xl border bg-card shadow-card">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-4">
                    <span className="text-sm font-semibold">{exam.name}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                      {getClassName(exam.class_id)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {exam.exam_date}
                    </span>
                    <StatusBadge tone={upcoming ? "info" : "neutral"}>
                      {upcoming ? "Upcoming" : "Completed"}
                    </StatusBadge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {getMarkCount(exam.id)} mark(s)
                    </span>
                  </summary>
                  <div className="border-t px-4 pb-4 pt-3">
                  {exam.description && (
                    <p className="text-sm text-muted-foreground">
                      {exam.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => startEditExam(exam)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openManageMarks(exam.id)}
                    >
                      Manage Marks
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => requestDeleteExam(exam.id)}
                    >
                      Delete
                    </Button>
                  </div>
                  </div>
                </details>
                );
              })}
            </div>
          )}
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
