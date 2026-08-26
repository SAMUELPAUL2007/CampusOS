import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import TeacherDailyAttendance, {
  type TeacherEntry,
} from "@/components/TeacherDailyAttendance";

export default async function TeacherAttendancePage() {
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

  // The teacher's full week of sessions — RLS restricts timetable rows to
  // this teacher. The client filters by the selected date; the teacher
  // never chooses arbitrary classes/subjects.
  interface RawEntry {
    id: string;
    course_code: string;
    course_title: string;
    room: string;
    start_time: string;
    end_time: string;
    day_of_week: number;
    classes: { id: string; name: string } | { id: string; name: string }[] | null;
  }
  const { data: raw } = await supabase
    .from("timetable")
    .select(
      "id, course_code, course_title, room, start_time, end_time, day_of_week, class_id, classes(id, name)",
    )
    .eq("teacher_id", userId)
    .neq("course_code", "LUNCH")
    .neq("course_code", "BREAK")
    .order("start_time");
  const entries: TeacherEntry[] = ((raw as unknown as RawEntry[] | null) ?? []).map((e) => {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
    return {
      id: e.id,
      course_code: e.course_code,
      course_title: e.course_title,
      room: e.room,
      start_time: e.start_time,
      end_time: e.end_time,
      day_of_week: e.day_of_week,
      class_id: cls?.id ?? "",
      class_name: cls?.name ?? "",
    };
  });

  return (
    <AppShell role="teacher">
      <div className="space-y-6">
        <PageHeader title="Attendance" subtitle="Browse days, take or correct attendance per session." />
        <TeacherDailyAttendance entries={entries} />
      </div>
    </AppShell>
  );
}
