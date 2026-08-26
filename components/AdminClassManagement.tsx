"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface Class {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  teachers_count?: number;
  students_count?: number;
  teachers?: { id: string; full_name: string; email?: string }[];
  students?: { id: string; full_name: string; email?: string }[];
}

interface Profile {
  id: string;
  full_name: string;
  email?: string;
}

export default function AdminClassManagement() {
  const router = useRouter();
  const initialLoadDone = useRef(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addToast = toastManager.add.bind(toastManager);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [teacherSelectOpen, setTeacherSelectOpen] = useState(false);
  const [teacherSelectClassId, setTeacherSelectClassId] = useState<string | null>(null);
  const [availableTeachers, setAvailableTeachers] = useState<Profile[]>([]);

  const [studentSelectOpen, setStudentSelectOpen] = useState(false);
  const [studentSelectClassId, setStudentSelectClassId] = useState<string | null>(null);
  const [availableStudents, setAvailableStudents] = useState<Profile[]>([]);

  const loadClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch classes, teacher assignments, and student enrollments separately
      // to avoid inner joins hiding classes with no teachers/students.
      const [classesRes, teacherRes, studentRes] = await Promise.all([
        supabase
          .from("classes")
          .select("id, name, description, created_at, updated_at"),
        supabase
          .from("class_teachers")
          .select("class_id, teacher_id, profiles!inner(full_name)"),
        supabase
          .from("class_students")
          .select("class_id, student_id, profiles!inner(full_name)"),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (teacherRes.error) throw teacherRes.error;
      if (studentRes.error) throw studentRes.error;

      const classMap = new Map<string, Class>();
      (classesRes.data as any[]).forEach((cls) => {
        classMap.set(cls.id, {
          id: cls.id,
          name: cls.name,
          description: cls.description,
          created_at: cls.created_at,
          updated_at: cls.updated_at,
          teachers_count: 0,
          students_count: 0,
          teachers: [],
          students: [],
        });
      });

      (teacherRes.data as any[]).forEach((row) => {
        const cls = classMap.get(row.class_id);
        if (cls && !cls.teachers!.some((t) => t.id === row.teacher_id)) {
          cls.teachers!.push({
            id: row.teacher_id,
            full_name: row.profiles?.full_name ?? "",
          });
          cls.teachers_count = cls.teachers!.length;
        }
      });

      (studentRes.data as any[]).forEach((row) => {
        const cls = classMap.get(row.class_id);
        if (cls && !cls.students!.some((s) => s.id === row.student_id)) {
          cls.students!.push({
            id: row.student_id,
            full_name: row.profiles?.full_name ?? "",
          });
          cls.students_count = cls.students!.length;
        }
      });

      setClasses(Array.from(classMap.values()));
      // Re-render the server component so dashboard statistics reflect
      // the latest data — but only after actual mutations, not on the
      // initial mount (which would trigger a redundant server render).
      if (initialLoadDone.current) {
        router.refresh();
      } else {
        initialLoadDone.current = true;
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required and cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from("classes")
          .update({ name: name.trim(), description: description.trim() || null })
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("classes")
          .insert({ name: name.trim(), description: description.trim() || null });
        if (insertError) throw insertError;
      }
      await loadClasses();
      setShowForm(false);
      setEditingId(null);
      setName("");
      setDescription("");
      addToast({ type: "success", title: editingId ? "Class updated" : "Class created" });
    } catch (e: any) {
      setError(e.message ?? "Failed to save class");
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteClass = (id: string) => {
    setPendingConfirm({
      title: "Delete this class?",
      description: "This cannot be undone.",
      confirmLabel: "Delete class",
      action: () => {
        void handleDelete(id);
      },
    });
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const { error: deleteError } = await supabase.from("classes").delete().eq("id", id);
      if (deleteError) throw deleteError;
      await loadClasses();
      addToast({ type: "success", title: "Class deleted" });
    } catch (e: any) {
      setError(e.message ?? "Failed to delete class");
    }
  };

  const startEdit = (cls: Class) => {
    setEditingId(cls.id);
    setName(cls.name);
    setDescription(cls.description ?? "");
    setShowForm(true);
  };

  const openTeacherSelect = async (classId: string) => {
    setTeacherSelectClassId(classId);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "teacher")
      .order("full_name");
    if (error) {
      setError(error.message);
      return;
    }
    const cls = classes.find((c) => c.id === classId);
    const assignedIds = new Set(cls?.teachers?.map((t) => t.id) || []);
    const filtered = (data as Profile[]).filter((t) => !assignedIds.has(t.id));
    setAvailableTeachers(filtered);
    setTeacherSelectOpen(true);
  };

  const openStudentSelect = async (classId: string) => {
    setStudentSelectClassId(classId);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name");
    if (error) {
      setError(error.message);
      return;
    }
    const cls = classes.find((c) => c.id === classId);
    const assignedIds = new Set(cls?.students?.map((s) => s.id) || []);
    const filtered = (data as Profile[]).filter((s) => !assignedIds.has(s.id));
    setAvailableStudents(filtered);
    setStudentSelectOpen(true);
  };

  const handleAssignTeacher = async (teacherId: string) => {
    if (!teacherSelectClassId) return;
    const { error } = await supabase
      .from("class_teachers")
      .insert({ class_id: teacherSelectClassId, teacher_id: teacherId });
    if (error) {
      setError(error.message);
      return;
    }
    await loadClasses();
    setTeacherSelectOpen(false);
    addToast({ type: "success", title: "Teacher assigned to class" });
  };

  const requestRemoveTeacher = (classId: string, teacherId: string) => {
    setPendingConfirm({
      title: "Remove this teacher from the class?",
      description: "The teacher will lose access to this class.",
      confirmLabel: "Remove teacher",
      action: () => {
        void handleRemoveTeacher(classId, teacherId);
      },
    });
  };

  const handleRemoveTeacher = async (classId: string, teacherId: string) => {
    const { error } = await supabase
      .from("class_teachers")
      .delete()
      .eq("class_id", classId)
      .eq("teacher_id", teacherId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadClasses();
    addToast({ type: "success", title: "Teacher removed from class" });
  };

  const handleAssignStudent = async (studentId: string) => {
    if (!studentSelectClassId) return;
    const { error } = await supabase
      .from("class_students")
      .insert({ class_id: studentSelectClassId, student_id: studentId });
    if (error) {
      setError(error.message);
      return;
    }
    await loadClasses();
    setStudentSelectOpen(false);
    addToast({ type: "success", title: "Student enrolled" });
  };

  const requestRemoveStudent = (classId: string, studentId: string) => {
    setPendingConfirm({
      title: "Remove this student from the class?",
      description: "The student will be unenrolled from this class.",
      confirmLabel: "Remove student",
      action: () => {
        void handleRemoveStudent(classId, studentId);
      },
    });
  };

  const handleRemoveStudent = async (classId: string, studentId: string) => {
    const { error } = await supabase
      .from("class_students")
      .delete()
      .eq("class_id", classId)
      .eq("student_id", studentId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadClasses();
    addToast({ type: "success", title: "Student removed from class" });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <Loader2 className="animate-spin" aria-hidden />
        <span>Loading classes...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      {error && <FormMessage tone="error" className="mb-4">{error}</FormMessage>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded border p-4 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">
            {editingId ? "Edit Class" : "Create New Class"}
          </h2>
          <div className="mb-2">
            <label className="block text-sm font-medium" htmlFor="name">Name</label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Class name"
              required
            />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium" htmlFor="description">Description (optional)</label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Class description"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setName("");
                setDescription("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {classes.length === 0 && (
          <EmptyState
            icon={School}
            title="No classes found."
            description="Classes you create will appear here."
          />
        )}
        {classes.map((cls) => (
          <details key={cls.id} className="border rounded p-4">
            <summary className="font-medium">
              {cls.name}
              <span className="ml-2 text-sm text-muted-foreground">
                {cls.teachers_count ?? 0} teacher(s), {cls.students_count ?? 0} student(s)
              </span>
            </summary>
            <p className="mt-2">{cls.description || "(No description)"}</p>

            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => startEdit(cls)}>Edit</Button>
              <Button size="sm" variant="destructive" onClick={() => requestDeleteClass(cls.id)}>Delete</Button>
            </div>

            <div className="mt-3">
              <p className="text-sm font-medium">Teachers:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {cls.teachers && cls.teachers.length > 0 ? (
                  cls.teachers.map((t) => (
                    <span key={t.id} className="inline-flex items-center rounded bg-info/15 px-2 py-0.5 text-sm text-info">
                      {t.full_name}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 h-6 w-6 p-0 text-xs"
                        onClick={() => requestRemoveTeacher(cls.id, t.id)}
                        aria-label={`Remove ${t.full_name} from this class`}
                      >
                        x
                      </Button>
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
                <Button size="sm" variant="outline" onClick={() => openTeacherSelect(cls.id)}>
                  + Add Teacher
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-sm font-medium">Students:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {cls.students && cls.students.length > 0 ? (
                  cls.students.map((s) => (
                    <span key={s.id} className="inline-flex items-center rounded bg-success/15 px-2 py-0.5 text-sm text-success">
                      {s.full_name}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 h-6 w-6 p-0 text-xs"
                        onClick={() => requestRemoveStudent(cls.id, s.id)}
                        aria-label={`Remove ${s.full_name} from this class`}
                      >
                        x
                      </Button>
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
                <Button size="sm" variant="outline" onClick={() => openStudentSelect(cls.id)}>
                  + Add Student
                </Button>
              </div>
            </div>
          </details>
        ))}
      </div>

      {!showForm && (
        <Button className="mt-4" onClick={() => setShowForm(true)}>
          + New Class
        </Button>
      )}

      <Dialog open={teacherSelectOpen} onOpenChange={setTeacherSelectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Teacher</DialogTitle>
            <DialogDescription>
              Choose an unassigned teacher to lead this class.
            </DialogDescription>
          </DialogHeader>
          {availableTeachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unassigned teachers available.</p>
          ) : (
            <ul className="space-y-1">
              {availableTeachers.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
                  <span className="text-sm">{t.full_name}</span>
                  <Button size="sm" onClick={() => handleAssignTeacher(t.id)}>Assign</Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="w-full" onClick={() => setTeacherSelectOpen(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={studentSelectOpen} onOpenChange={setStudentSelectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll Student</DialogTitle>
            <DialogDescription>
              Choose an unenrolled student to add to this class.
            </DialogDescription>
          </DialogHeader>
          {availableStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unenrolled students available.</p>
          ) : (
            <ul className="space-y-1">
              {availableStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
                  <span className="text-sm">{s.full_name}</span>
                  <Button size="sm" onClick={() => handleAssignStudent(s.id)}>Enroll</Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="w-full" onClick={() => setStudentSelectOpen(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>

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
