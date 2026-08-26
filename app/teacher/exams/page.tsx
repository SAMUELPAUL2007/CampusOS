import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import TeacherExams from "@/components/TeacherExams";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function TeacherExamsPage() {
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
  if (role !== "teacher") {
    return (
      <AccessDenied
        role={role}
        homeHref={role === "admin" ? "/admin" : role === "student" ? "/student" : "/login"}
        homeLabel={role === "admin" ? "Admin Dashboard" : role === "student" ? "Student Dashboard" : "Login"}
      />
    );
  }

  // RLS on classes ensures only classes this teacher teaches are returned.
  // Rosters are loaded through the secure get_class_roster RPC because
  // profiles RLS intentionally hides other users' profile rows from
  // embedded joins. The independent exams/marks queries start in parallel.
  const examsPromise = supabase
    .from("exams")
    .select("id, class_id, name, description, exam_date, created_by, created_at, updated_at");
  const marksPromise = supabase
    .from("marks")
    .select("id, exam_id, student_id, marks_obtained, max_marks");

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id, name, description");

  if (classesError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start p-6 gap-6">
        <h1 className="text-3xl font-bold">Teacher Exams</h1>
        <p className="text-destructive">
          Failed to load classes: {classesError.message}
        </p>
      </div>
    );
  }

  // RLS on exams/marks scopes these to the teacher's classes (fetched in
  // parallel above; awaited here).
  const { data: exams, error: examsError } = await examsPromise;

  if (examsError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start p-6 gap-6">
        <h1 className="text-3xl font-bold">Teacher Exams</h1>
        <p className="text-destructive">
          Failed to load exams: {examsError.message}
        </p>
      </div>
    );
  }

  const { data: marks, error: marksError } = await marksPromise;

  if (marksError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start p-6 gap-6">
        <h1 className="text-3xl font-bold">Teacher Exams</h1>
        <p className="text-destructive">
          Failed to load marks: {marksError.message}
        </p>
      </div>
    );
  }

  interface StudentInfo {
    id: string;
    full_name: string;
    email?: string;
  }
  interface RosterRow {
    student_id: string;
    full_name: string;
    class_id: string;
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

  const rosterResults = await Promise.all(
    ((classes as { id: string; name: string; description: string }[] | null) ?? []).map(
      async (cls) => {
        const { data: roster, error: rosterError } = await supabase.rpc(
          "get_class_roster",
          { p_class_id: cls.id },
        );
        if (rosterError) {
          throw new Error(rosterError.message);
        }
        return { cls, roster: (roster as RosterRow[] | null) ?? [] };
      },
    ),
  );

  const classMap = new Map<string, ClassInfo>();
  rosterResults.forEach(({ cls, roster }) => {
    classMap.set(cls.id, {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      students: roster.map((r) => ({
        id: r.student_id,
        full_name: r.full_name,
      })),
    });
  });

  const classList = [...classMap.values()];
  const examList = (exams as ExamInfo[]) ?? [];
  const markList = (marks as MarkInfo[]) ?? [];

  return (
    <AppShell role="teacher">
      <div className="space-y-6">
        <div className="space-y-1">
          <PageHeader title="Exams & Marks" />
          <p className="text-sm text-muted-foreground">
            Welcome, {profile.full_name}
          </p>
        </div>
        <TeacherExams classes={classList} exams={examList} marks={markList} />
      </div>
    </AppShell>
  );
}
