import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import StudentExams from "@/components/StudentExams";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function StudentExamsPage() {
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
  if (role !== "student") {
    return (
      <AccessDenied
        role={role}
        homeHref={role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/login"}
        homeLabel={role === "admin" ? "Admin Dashboard" : role === "teacher" ? "Teacher Dashboard" : "Login"}
      />
    );
  }

  // RLS on exams ensures only exams for classes the student is enrolled in.
  const { data: exams, error: examsError } = await supabase
    .from("exams")
    .select(
      "id, class_id, name, description, exam_date, created_at, classes!inner(id, name)",
    )
    .order("exam_date", { ascending: false });

  if (examsError) {
    return (
      <AppShell role="student">
        <PageHeader title="Exams & Marks" subtitle="Failed to load exams." />
        <p className="text-sm text-destructive">{examsError.message}</p>
      </AppShell>
    );
  }

  // RLS on marks ensures only the student's own marks are returned.
  const { data: marks, error: marksError } = await supabase
    .from("marks")
    .select("id, exam_id, marks_obtained, max_marks");

  if (marksError) {
    return (
      <AppShell role="student">
        <PageHeader title="Exams & Marks" subtitle="Failed to load marks." />
        <p className="text-sm text-destructive">{marksError.message}</p>
      </AppShell>
    );
  }

  interface RawExam {
    id: string;
    class_id: string;
    name: string;
    description: string | null;
    exam_date: string;
    created_at: string;
    classes: { id: string; name: string } | { id: string; name: string }[];
  }
  interface RawMark {
    id: string;
    exam_id: string;
    marks_obtained: number;
    max_marks: number;
  }

  const rawExams = (exams as RawExam[] | null) ?? [];
  const rawMarks = (marks as RawMark[] | null) ?? [];

  const serializedExams = rawExams.map((e) => {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
    return {
      id: e.id,
      class_id: e.class_id,
      class_name: cls.name,
      name: e.name,
      description: e.description,
      exam_date: e.exam_date,
      created_at: e.created_at,
    };
  });

  const serializedMarks = rawMarks.map((m) => ({
    id: m.id,
    exam_id: m.exam_id,
    marks_obtained: m.marks_obtained,
    max_marks: m.max_marks,
  }));

  return (
    <AppShell role="student">
      <div className="space-y-6">
        <PageHeader
          title="Exams & Marks"
          subtitle={`Welcome back, ${profile.full_name}`}
        />
        <StudentExams exams={serializedExams} marks={serializedMarks} />
      </div>
    </AppShell>
  );
}
