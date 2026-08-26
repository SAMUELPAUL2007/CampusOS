import { redirect } from "next/navigation";
import { CalendarDays, ClipboardCheck, FileText, GraduationCap, School, UserCog, Users } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import AdminClassManagement from "@/components/AdminClassManagement";
import LogoutButton from "@/components/LogoutButton";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { QuickActions } from "@/components/shared/quick-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { formatRange, todayTimetableDay } from "@/lib/timetable";

export default async function AdminPage() {
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

  // -------------------------------------------------------------------
  // Statistics – server-side queries, RLS scopes to admin
  // -------------------------------------------------------------------
  const [classesResult, teachersResult, studentsResult, examsResult] =
    await Promise.all([
      supabase.from("classes").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "teacher"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student"),
      supabase.from("exams").select("id", { count: "exact", head: true }),
    ]);

  const totalClasses = classesResult.count ?? 0;
  const totalTeachers = teachersResult.count ?? 0;
  const totalStudents = studentsResult.count ?? 0;
  const totalExams = examsResult.count ?? 0;

  // -------------------------------------------------------------------
  // Today's schedule (all classes) + recent exams — independent, parallel.
  // -------------------------------------------------------------------
  interface ScheduleRow {
    id: string;
    course_code: string;
    course_title: string;
    start_time: string;
    end_time: string;
    room: string;
    classes: { name: string } | { name: string }[] | null;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }
  interface RawRecentExam {
    id: string;
    name: string;
    exam_date: string;
    classes: { name: string } | { name: string }[];
  }
  const ttDay = todayTimetableDay();
  const [todaysSchedule, recentExamRows] = await Promise.all([
    (async () => {
      if (!ttDay) return [] as ScheduleRow[];
      const { data } = await supabase
        .from("timetable")
        .select(
          "id, course_code, course_title, start_time, end_time, room, classes(name), profiles(full_name)",
        )
        .eq("day_of_week", ttDay)
        .neq("course_code", "LUNCH")
        .neq("course_code", "BREAK")
        .order("start_time")
        .limit(8);
      return ((data as unknown as ScheduleRow[]) ?? []);
    })(),
    (async () => {
      const { data } = await supabase
        .from("exams")
        .select("id, name, exam_date, classes!inner(name)")
        .order("exam_date", { ascending: false })
        .limit(5);
      return ((data as unknown as RawRecentExam[]) ?? []);
    })(),
  ]);

  const recentExams = recentExamRows.map((e) => {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
    return {
      id: e.id,
      name: e.name,
      exam_date: e.exam_date,
      class_name: cls.name,
    };
  });

  // -------------------------------------------------------------------
  // Today's schedule (across all classes) for the dashboard section.
  // -------------------------------------------------------------------
  return (
    <AppShell role="admin" fullName={profile.full_name}>
      <div className="space-y-8">
        {/* Welcome */}
        <PageHeader
          title="Admin Dashboard"
          subtitle={`Welcome back, ${profile.full_name}`}
          actions={<LogoutButton />}
        />

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Classes", value: totalClasses, icon: School },
            { label: "Total Teachers", value: totalTeachers, icon: UserCog },
            { label: "Total Students", value: totalStudents, icon: GraduationCap },
            { label: "Total Exams", value: totalExams, icon: FileText },
          ].map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
            />
          ))}
        </div>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Quick Actions</h2>
          <QuickActions
            columns={5}
            items={[
              { href: "/admin/users", label: "Manage Users", icon: Users },
              { href: "#class-management", label: "Manage Classes", icon: School },
              { href: "/admin/timetable", label: "Manage Timetable", icon: CalendarDays },
              { href: "/admin/attendance", label: "Manage Attendance", icon: ClipboardCheck },
              { href: "/admin/exams", label: "Manage Exams & Marks", icon: FileText },
            ]}
          />
        </section>

        {/* Today's Schedule */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Today&apos;s Schedule</h2>
            <a
              href="/admin/timetable"
              className="text-sm font-medium text-primary hover:underline"
            >
              View Full Timetable
            </a>
          </div>
          {todaysSchedule.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No classes scheduled for today."
              description="Sessions will appear here based on the weekly timetable."
            />
          ) : (
            <div className="space-y-2">
              {todaysSchedule.map((s) => {
                const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
                const teacher = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card p-3 shadow-card transition-colors hover:bg-accent/40"
                  >
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {formatRange(s.start_time, s.end_time)}
                    </span>
                    <span className="text-sm font-medium">{s.course_title}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                      {s.course_code}
                    </span>
                    <span className="text-sm text-muted-foreground">{cls?.name}</span>
                    <span className="text-sm text-muted-foreground">{teacher?.full_name}</span>
                    {s.room && (
                      <span className="ml-auto text-xs text-muted-foreground">Room {s.room}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Exams */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Recent Exams</h2>
            <a
              href="/admin/exams"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all exams
            </a>
          </div>
          {recentExams.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No exams found."
              description="Created exams will be listed here."
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Exam</th>
                  <th scope="col">Class</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentExams.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium">{e.name}</td>
                    <td className="text-muted-foreground">{e.class_name}</td>
                    <td className="font-mono text-muted-foreground">{e.exam_date}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        {/* Class Management (existing component) */}
        <section id="class-management" className="scroll-mt-6 space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Class Management</h2>
          <AdminClassManagement />
        </section>
      </div>
    </AppShell>
  );
}
