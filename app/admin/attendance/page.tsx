import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AccessDenied from "@/components/AccessDenied";
import AdminDailyAttendance from "@/components/AdminDailyAttendance";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminAttendancePage() {
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

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .order("name");

  return (
    <AppShell role="admin">
      <div className="space-y-6">
        <PageHeader
          title="Attendance Management"
          subtitle="Daily, subject-wise attendance per class session."
        />
        <AdminDailyAttendance classes={(classes as { id: string; name: string }[]) ?? []} />
      </div>
    </AppShell>
  );
}
