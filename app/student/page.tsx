import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CalendarCheck, FileText, GraduationCap, School } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { createSupabaseServer } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import AccessDenied from "@/components/AccessDenied";
import TodaySchedule from "@/components/TodaySchedule";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { QuickActions } from "@/components/shared/quick-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { todayTimetableDay } from "@/lib/timetable";

export default async function StudentPage() {
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

  // -------------------------------------------------------------------
  // All dashboard queries run in parallel — they are independent of each
  // other (RLS scopes every query to this student).
  // -------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const [enrollmentsRes, examsRes, marksRes] = await Promise.all([
    supabase
      .from("class_students")
      .select("class_id, classes!inner(name, description)")
      .eq("student_id", userId),
    supabase
      .from("exams")
      .select("id, name, exam_date, classes!inner(name)")
      .order("exam_date", { ascending: false }),
    supabase.from("marks").select("id, exam_id, marks_obtained, max_marks"),
  ]);

  const enrollments = enrollmentsRes.data;
  const enrollError = enrollmentsRes.error;

  if (enrollError) {
    return (
      <AppShell role="student">
        <PageHeader title="Student Dashboard" subtitle="Failed to load enrollments." />
        <p className="text-sm text-destructive">{enrollError.message}</p>
      </AppShell>
    );
  }

  // Teachers per enrolled class (needs the class id list first).
  const enrolledClassIds = (enrollments as any[]).map((e) => e.class_id);

  // -------------------------------------------------------------------
  // Today's classes — ONLY today's entries for the enrolled class,
  // chronologically (including Break/Lunch rows). This is the fix for
  // the "five subjects at 9:00 AM" bug: previously every day's entries
  // were shown together because the day filter was missing.
  // -------------------------------------------------------------------
  interface ScheduleEntry {
    id: string;
    course_code: string;
    course_title: string;
    teacher_name: string | null;
    room: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }
  const ttDay = todayTimetableDay();

  // -------------------------------------------------------------------
  // Session-based attendance summary (overall + per-subject).
  // RLS scopes records to this student only.
  // -------------------------------------------------------------------
  interface RawRecord {
    id: string;
    status: string;
    attendance_sessions: {
      session_date: string;
      timetable: { course_code: string; course_title: string };
    };
  }

  // These three queries are independent of each other — run in parallel.
  const [teacherRowsRes, timetableRes, attRecRes] = await Promise.all([
    supabase
      .from("class_teachers")
      .select("class_id, profiles!inner(full_name)")
      .in("class_id", enrolledClassIds),
    ttDay && enrolledClassIds.length > 0
      ? supabase.rpc("get_class_timetable", { p_class_id: enrolledClassIds[0] })
      : Promise.resolve({ data: [] as unknown[] }),
    enrolledClassIds.length > 0
      ? supabase
          .from("attendance_records")
          .select(
            "id, status, attendance_sessions!inner(session_date, timetable!inner(course_code, course_title))",
          )
          .order("session_date", { referencedTable: "attendance_sessions", ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  let todaysClasses: ScheduleEntry[] = [];
  if (ttDay) {
    todaysClasses = (((timetableRes.data as unknown) ?? []) as ScheduleEntry[])
      .filter((e) => e.day_of_week === ttDay)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  const attRecords = ((attRecRes.data as unknown as RawRecord[] | null) ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    session_date: r.attendance_sessions.session_date,
    course_code: r.attendance_sessions.timetable.course_code,
    course_title: r.attendance_sessions.timetable.course_title,
  }));

  const totalAttendance = attRecords.length;

  // Group by class and collect teacher names.
  const classMap = new Map<
    string,
    { name: string; description: string; teachers: string[] }
  >();
  (enrollments as any[]).forEach((row) => {
    const classId = String(row.class_id);
    const existing = classMap.get(classId) ?? {
      name: row.classes.name,
      description: row.classes.description,
      teachers: [] as string[],
    };
    classMap.set(classId, existing);
  });
  const teacherRows = ((teacherRowsRes.data as { class_id: string; profiles: { full_name: string } }[] | null) ?? []);
  teacherRows.forEach((tr) => {
    const existing = classMap.get(tr.class_id);
    const teacherName = tr.profiles?.full_name;
    if (existing && teacherName && !existing.teachers.includes(teacherName)) {
      existing.teachers.push(teacherName);
    }
  });

  const enrolledClasses = [...classMap.entries()];

  const presentCount = attRecords.filter((r) => r.status === "present").length;
  const attendancePct =
    totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

  // Per-subject stats (top 3 by sessions conducted).
  const subjectStats = new Map<string, { title: string; present: number; total: number }>();
  for (const r of attRecords) {
    const s = subjectStats.get(r.course_code) ?? {
      title: r.course_title,
      present: 0,
      total: 0,
    };
    s.total += 1;
    if (r.status === "present") s.present += 1;
    subjectStats.set(r.course_code, s);
  }
  const topSubjects = [...subjectStats.entries()].slice(0, 3);

  // -------------------------------------------------------------------
  // Exams and marks (fetched in parallel above)
  // -------------------------------------------------------------------
  interface RawExam {
    id: string;
    name: string;
    exam_date: string;
    classes: { name: string } | { name: string }[];
  }

  const examsRaw = examsRes.data;

  const allExams = ((examsRaw as RawExam[] | null) ?? []).map((e) => {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
    return {
      id: e.id,
      name: e.name,
      exam_date: e.exam_date,
      class_name: cls.name,
    };
  });

  interface RawMark {
    id: string;
    exam_id: string;
    marks_obtained: number;
    max_marks: number;
  }

  const marksRecords = (marksRes.data as RawMark[] | null) ?? [];
  const markExamIds = new Set(marksRecords.map((m) => m.exam_id));

  const totalExams = allExams.length;
  const examsWithMarks = allExams.filter((e) => markExamIds.has(e.id)).length;

  // Recent subject-wise attendance (limit 5, newest first).
  const recentAttendance = attRecords.slice(0, 5);

  // Upcoming exams (from today onward, limit 5).
  const upcomingExams = allExams
    .filter((e) => e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
    .slice(0, 5);

  return (
    <AppShell role="student" fullName={profile.full_name}>
      <div className="space-y-8">
        {/* Welcome */}
        <PageHeader
          title="Student Dashboard"
          subtitle={`Welcome back, ${profile.full_name}`}
          actions={<LogoutButton />}
        />

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Enrolled Classes", value: String(enrolledClasses.length), icon: School },
            { label: "Attendance Records", value: String(totalAttendance), icon: CalendarCheck },
            {
              label: "Attendance %",
              value: attendancePct !== null ? `${attendancePct}%` : "No data",
              icon: GraduationCap,
            },
            { label: "Total Exams", value: String(totalExams), icon: FileText },
            { label: "Exams with Marks", value: String(examsWithMarks), icon: FileText },
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
              { href: "/student/attendance", label: "View Attendance", icon: CalendarCheck },
              { href: "/student/exams", label: "View Exams & Marks", icon: FileText },
              { href: "/student/timetable", label: "My Timetable", icon: CalendarDays },
            ]}
          />
        </section>

        {/* Today's Classes */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Today&apos;s Classes</h2>
            <Link
              href="/student/timetable"
              className="text-sm font-medium text-primary hover:underline"
            >
              View Full Timetable
            </Link>
          </div>
          {todaysClasses.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No classes scheduled for today."
              description="Sessions will appear here based on your weekly timetable."
            />
          ) : (
            <TodaySchedule
              entries={todaysClasses}
              classNameLabel={classMap.get(enrolledClassIds[0])?.name ?? ""}
            />
          )}
        </section>

      {/* Enrolled Classes */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Enrolled Classes</h2>
        {enrolledClasses.length === 0 ? (
          <EmptyState
            icon={School}
            title="You are not enrolled in any classes."
            description="Classes you are enrolled in will appear here."
          />
        ) : (
          <div className="space-y-3">
            {enrolledClasses.map(([id, cls]) => (
              <details key={id} className="rounded-xl border bg-card shadow-card">
                <summary className="cursor-pointer rounded-xl p-4 font-medium">
                  {cls.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {cls.teachers.length > 0 ? cls.teachers.join(", ") : "No teachers assigned"}
                  </span>
                </summary>
                <div className="border-t px-4 pb-4 pt-3">
                  <p className="text-sm text-muted-foreground">
                    {cls.description || "(No description)"}
                  </p>
                  <p className="mt-2 text-sm">
                    Teacher{cls.teachers.length !== 1 ? "s" : ""}:{" "}
                    {cls.teachers.length > 0
                      ? cls.teachers.join(", ")
                      : "(none)"}
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Attendance Summary */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Attendance</h2>
          <Link
            href="/student/attendance"
            className="text-sm font-medium text-primary hover:underline"
          >
            View Attendance
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Overall"
            value={attendancePct !== null ? `${attendancePct}%` : "—"}
            hint={totalAttendance > 0 ? `${presentCount}/${totalAttendance} sessions` : undefined}
            icon={CalendarCheck}
            tone={attendancePct !== null && attendancePct < 75 ? "destructive" : "success"}
            className="items-start"
          />
          {topSubjects.map(([code, s]) => {
            const pct = Math.round((s.present / s.total) * 100);
            return (
            <StatCard
              key={code}
              label={s.title}
              value={`${pct}%`}
              hint={`${s.present}/${s.total} sessions`}
              icon={CalendarCheck}
              tone={pct < 75 ? "destructive" : "success"}
              className="items-start"
            />
            );
          })}
        </div>
      </section>

      {/* Recent Attendance */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Recent Attendance</h2>
          <Link
            href="/student/attendance"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all attendance
          </Link>
        </div>
        {recentAttendance.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No attendance records yet."
            description="Your attendance history will appear once sessions are recorded."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Subject</th>
                <th scope="col" className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAttendance.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono">{r.session_date}</td>
                  <td>{r.course_title}</td>
                  <td className="text-center">
                    <StatusBadge status={r.status === "present" ? "present" : "absent"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      {/* Upcoming Exams */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Upcoming Exams</h2>
          <Link
            href="/student/exams"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all exams
          </Link>
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
                <th scope="col" className="text-center">Marks</th>
              </tr>
            </thead>
            <tbody>
              {upcomingExams.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.name}</td>
                  <td className="text-muted-foreground">{e.class_name}</td>
                  <td className="font-mono text-muted-foreground">{e.exam_date}</td>
                  <td className="text-center">
                    {markExamIds.has(e.id) ? (
                      <StatusBadge tone="success">Recorded</StatusBadge>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </td>
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
