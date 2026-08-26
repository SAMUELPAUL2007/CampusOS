import { redirect } from "next/navigation";
import { CalendarDays, ClipboardCheck, FileText, School, Users } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { QuickActions } from "@/components/shared/quick-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { formatRange, todayTimetableDay } from "@/lib/timetable";

export default async function TeacherPage() {
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

  // -------------------------------------------------------------------
  // Load classes assigned to this teacher – RLS ensures only allowed rows.
  // Rosters are loaded through the secure get_class_roster RPC because
  // profiles RLS intentionally hides other users' profile rows from
  // embedded joins. The independent upcoming-exams query starts in
  // parallel with the classes fetch.
  // -------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const examsPromise = supabase
    .from("exams")
    .select("id, name, exam_date, classes!inner(name)")
    .gte("exam_date", today)
    .order("exam_date", { ascending: true })
    .limit(5);

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id, name, description");

  if (classesError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start p-6 gap-6">
        <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
        <p className="text-destructive">
          Failed to load classes: {classesError.message}
        </p>
      </div>
    );
  }

  // Build class map with student details.
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
    name: string;
    description: string;
    students: StudentInfo[];
  }

  // Rosters and today's schedule are independent — fetch in parallel.
  const [rosterResults, todaysScheduleRes] = await Promise.all([
    Promise.all(
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
    ),
    (async () => {
      const ttDay = todayTimetableDay();
      interface ScheduleRow {
        id: string;
        course_code: string;
        course_title: string;
        start_time: string;
        end_time: string;
        room: string;
        classes: { name: string } | { name: string }[] | null;
      }
      let schedule: ScheduleRow[] = [];
      if (ttDay) {
        const { data } = await supabase
          .from("timetable")
          .select("id, course_code, course_title, start_time, end_time, room, classes(name)")
          .eq("teacher_id", userId)
          .eq("day_of_week", ttDay)
          .neq("course_code", "LUNCH")
          .neq("course_code", "BREAK")
          .order("start_time")
          .limit(6);
        schedule = (data as unknown as ScheduleRow[]) ?? [];
      }
      return schedule;
    })(),
  ]);
  const todaysSchedule = todaysScheduleRes;

  const classMap = new Map<string, ClassInfo>();
  rosterResults.forEach(({ cls, roster }) => {
    classMap.set(cls.id, {
      name: cls.name,
      description: cls.description,
      students: roster.map((r) => ({
        id: r.student_id,
        full_name: r.full_name,
      })),
    });
  });

  const classEntries = [...classMap.entries()];

  // Unique student count across all classes (avoid double-counting).
  const uniqueStudentIds = new Set<string>();
  classEntries.forEach(([, info]) =>
    info.students.forEach((s) => uniqueStudentIds.add(s.id)),
  );

  // -------------------------------------------------------------------
  // Upcoming exams (query started in parallel above; awaited here)
  // -------------------------------------------------------------------
  const { data: examsRaw, error: examsError } = await examsPromise;

  interface RawExam {
    id: string;
    name: string;
    exam_date: string;
    classes: { name: string } | { name: string }[];
  }

  const upcomingExams = examsError
    ? []
    : ((examsRaw as RawExam[] | null) ?? []).map((e) => {
        const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
        return {
          id: e.id,
          name: e.name,
          exam_date: e.exam_date,
          class_name: cls.name,
        };
      });

  return (
    <AppShell role="teacher" fullName={profile.full_name}>
      <div className="space-y-8">
        {/* Welcome */}
        <PageHeader
          title="Teacher Dashboard"
          subtitle={`Welcome back, ${profile.full_name}`}
          actions={<LogoutButton />}
        />

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Assigned Classes", value: classEntries.length, icon: School },
            { label: "Total Students", value: uniqueStudentIds.size, icon: Users },
            { label: "Upcoming Exams", value: upcomingExams.length, icon: FileText },
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
            columns={3}
            items={[
              { href: "/teacher/attendance", label: "Take Attendance", icon: ClipboardCheck },
              { href: "/teacher/exams", label: "Manage Exams & Marks", icon: FileText },
              { href: "/teacher/timetable", label: "My Timetable", icon: CalendarDays },
            ]}
          />
        </section>

        {/* My Schedule Today */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">My Schedule Today</h2>
            <a
              href="/teacher/timetable"
              className="text-sm font-medium text-primary hover:underline"
            >
              View Full Timetable
            </a>
          </div>
          {todaysSchedule.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No classes scheduled for today."
              description="Your sessions will appear here based on the weekly timetable."
            />
          ) : (
            <div className="space-y-2">
              {todaysSchedule.map((s) => {
                const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
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
                    {s.room && (
                      <span className="ml-auto text-xs text-muted-foreground">Room {s.room}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Assigned Classes */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Assigned Classes</h2>
          {classEntries.length === 0 ? (
            <EmptyState
              icon={School}
              title="No classes assigned yet."
              description="Classes assigned to you by the administration will appear here."
            />
          ) : (
            <div className="space-y-3">
              {classEntries.map(([id, info]) => (
                <details key={id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <summary className="cursor-pointer font-medium">
                    {info.name}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {info.students.length} student
                      {info.students.length !== 1 ? "s" : ""}
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {info.description || "(No description)"}
                  </p>
                  {info.students.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {info.students.map((s) => (
                        <li key={s.id} className="text-sm">
                          {s.full_name}
                          {s.email && (
                            <span className="text-muted-foreground"> ({s.email})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No students enrolled.
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Exams */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Upcoming Exams</h2>
            <a
              href="/teacher/exams"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all exams
            </a>
          </div>
          {upcomingExams.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No upcoming exams."
              description="Scheduled exams for your classes will be listed here."
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
                {upcomingExams.map((e) => (
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
      </div>
    </AppShell>
  );
}
