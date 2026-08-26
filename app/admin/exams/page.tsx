import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AdminExams from "@/components/AdminExams";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminExamsPage() {
  const supabase = await createSupabaseServer();

  const { data: claimsResponse, error: claimsError } =
    await supabase.auth.getClaims();

  if (
    claimsError ||
    !claimsResponse?.claims?.sub ||
    typeof claimsResponse.claims.sub !== "string"
  ) {
    redirect("/login");
  }

  const userId = claimsResponse.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  const role = String(profile.role);
  if (role !== "admin") {
    return (
      <AccessDenied
        role={role}
        homeHref={role === "teacher" ? "/teacher" : role === "student" ? "/student" : "/login"}
        homeLabel={role === "teacher" ? "Teacher Dashboard" : role === "student" ? "Student Dashboard" : "Login"}
      />
    );
  }

  // Load classes, enrollments, exams and marks — classes/enrollments in
  // parallel; flat queries avoid the array/object mismatch of nested
  // one-to-many embeds that previously produced a phantom "Unknown"
  // student in the marks roster.
  const [classesRes, enrollmentsRes, examsRes, marksRes] = await Promise.all([
    supabase.from("classes").select("id, name, description"),
    supabase
      .from("class_students")
      .select("class_id, student_id, profiles!inner(full_name)"),
    supabase
      .from("exams")
      .select(
        "id, class_id, name, description, exam_date, created_by, created_at, updated_at",
      ),
    supabase.from("marks").select("id, exam_id, student_id, marks_obtained, max_marks"),
  ]);

  const classes = classesRes.data;
  const classesError = classesRes.error;
  const enrollments = enrollmentsRes.data;
  const enrollmentsError = enrollmentsRes.error;

  if (classesError) {
    return (
      <AppShell role="admin">
        <PageHeader title="Exams & Marks" subtitle="Failed to load classes." />
        <p className="text-sm text-destructive">{classesError.message}</p>
      </AppShell>
    );
  }

  if (enrollmentsError) {
    return (
      <AppShell role="admin">
        <PageHeader title="Exams & Marks" subtitle="Failed to load enrollments." />
        <p className="text-sm text-destructive">{enrollmentsError.message}</p>
      </AppShell>
    );
  }

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

  const classMap = new Map<string, ClassInfo>();
  ((classes as { id: string; name: string; description: string | null }[] | null) ?? []).forEach(
    (cls) => {
      classMap.set(cls.id, {
        id: cls.id,
        name: cls.name,
        description: cls.description ?? "",
        students: [],
      });
    },
  );

  (
    (enrollments as {
      class_id: string;
      student_id: string;
      profiles: { full_name: string } | { full_name: string }[];
    }[] | null) ?? []
  ).forEach((row) => {
    const cls = classMap.get(row.class_id);
    if (!cls) return;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!cls.students.some((s) => s.id === row.student_id)) {
      cls.students.push({
        id: row.student_id,
        full_name: profile?.full_name ?? "Unknown",
      });
    }
  });

  const classList = [...classMap.values()];
  const examList = (examsRes.data as ExamInfo[]) ?? [];
  const markList = (marksRes.data as MarkInfo[]) ?? [];

  return (
    <AppShell role="admin">
      <div className="space-y-6">
        <PageHeader
          title="Exams & Marks"
          subtitle={`Welcome back, ${profile.full_name}`}
        />
        <AdminExams classes={classList} exams={examList} marks={markList} />
      </div>
    </AppShell>
  );
}
