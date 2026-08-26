import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AccessDenied from "@/components/AccessDenied";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import {
  DAY_NAMES,
  formatRange,
  groupByDay,
  type TimetableEntry,
} from "@/lib/timetable";

interface Entry extends TimetableEntry {
  teacher_name: string | null;
}

export default async function StudentTimetablePage() {
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

  // The student's timetable is derived from their enrolled class — no
  // class picker, and only the enrolled class is queried.
  const { data: enrollment } = await supabase
    .from("class_students")
    .select("class_id")
    .eq("student_id", userId)
    .limit(1)
    .maybeSingle();

  let className: string | null = null;
  let entries: Entry[] = [];

  if (enrollment) {
    const [classRes, timetableRes] = await Promise.all([
      supabase.from("classes").select("name").eq("id", enrollment.class_id).single(),
      supabase.rpc("get_class_timetable", { p_class_id: enrollment.class_id }),
    ]);
    className = classRes.data?.name ?? null;
    entries = ((timetableRes.data as unknown as Entry[]) ?? []).filter(
      (e) => e.course_code !== "LUNCH" && e.course_code !== "BREAK",
    );
  }

  const grouped = groupByDay(entries);

  return (
    <AppShell role="student">
      <div className="space-y-6">
        <PageHeader
          title="My Timetable"
          subtitle={className ?? "No enrolled class"}
        />

        {!enrollment || entries.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No timetable available yet."
            description="Your class schedule will appear here once it is published."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map((day) => (
              <div key={day} className="rounded-xl border bg-card shadow-card">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <h4 className="text-sm font-semibold tracking-tight">
                    {DAY_NAMES[day]}
                  </h4>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {grouped[day]?.length ?? 0}
                  </span>
                </div>
                {(grouped[day]?.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No classes
                  </p>
                ) : (
                  <ul className="space-y-2 p-3">
                    {grouped[day]!.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-lg border border-l-2 border-l-primary/50 bg-background/40 p-3"
                      >
                        <div className="font-mono text-xs font-medium text-muted-foreground">
                          {formatRange(entry.start_time, entry.end_time)}
                        </div>
                        <div className="mt-0.5 text-sm font-medium">{entry.course_title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                            {entry.course_code}
                          </span>
                          {entry.room && (
                            <span className="text-xs text-muted-foreground">
                              Room {entry.room}
                            </span>
                          )}
                        </div>
                        {entry.teacher_name && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{entry.teacher_name}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
