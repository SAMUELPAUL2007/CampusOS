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
  classes: { name: string } | { name: string }[] | null;
}

export default async function TeacherTimetablePage() {
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

  // RLS on timetable restricts rows to entries taught by this teacher.
  const { data: raw, error: timetableError } = await supabase
    .from("timetable")
    .select(
      "id, course_code, course_title, room, day_of_week, start_time, end_time, classes(name)",
    )
    .eq("teacher_id", userId)
    .order("day_of_week")
    .order("start_time");

  const entries = ((raw as unknown as Entry[]) ?? []).filter(
    (e) => e.course_code !== "LUNCH" && e.course_code !== "BREAK",
  );
  void timetableError;

  const grouped = groupByDay(entries);

  return (
    <AppShell role="teacher">
      <div className="space-y-6">
        <PageHeader title="My Timetable" subtitle="Your weekly teaching schedule." />

        {entries.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No timetable entries assigned yet."
            description="Entries will appear here once the admin publishes your schedule."
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
                    {grouped[day]!.map((entry) => {
                      const cls = Array.isArray(entry.classes)
                        ? entry.classes[0]
                        : entry.classes;
                      return (
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
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{cls?.name}</div>
                        </li>
                      );
                    })}
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
