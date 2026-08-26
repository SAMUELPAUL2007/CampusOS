import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import StudentAttendanceView, {
  type StudentRecord,
} from "@/components/StudentAttendanceView";
import AttendanceRealtimeRefresher from "@/components/AttendanceRealtimeRefresher";

export default async function StudentAttendancePage() {
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

  // Single scoped query: this student's records joined with session +
  // timetable details. RLS restricts to the student's own rows.
  interface RawRow {
    id: string;
    status: string;
    attendance_sessions: {
      session_date: string;
      timetable: {
        course_code: string;
        course_title: string;
        start_time: string;
        end_time: string;
      };
    };
  }
  const { data: raw } = await supabase
    .from("attendance_records")
    .select(
      "id, status, attendance_sessions!inner(session_date, timetable!inner(course_code, course_title, start_time, end_time))",
    )
    .order("session_date", { referencedTable: "attendance_sessions", ascending: false })
    .limit(2000);

  const records: StudentRecord[] = ((raw as unknown as RawRow[] | null) ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    session_date: r.attendance_sessions.session_date,
    course_code: r.attendance_sessions.timetable.course_code,
    course_title: r.attendance_sessions.timetable.course_title,
    start_time: r.attendance_sessions.timetable.start_time,
    end_time: r.attendance_sessions.timetable.end_time,
  }));

  return (
    <AppShell role="student">
      <AttendanceRealtimeRefresher studentId={userId} />
      <div className="space-y-6">
        <PageHeader title="My Attendance" subtitle="Subject-wise and daily attendance history." />
        <StudentAttendanceView records={records} />
      </div>
    </AppShell>
  );
}
