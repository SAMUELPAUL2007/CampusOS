import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import AdminTimetable from "@/components/AdminTimetable";
import AccessDenied from "@/components/AccessDenied";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminTimetablePage() {
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

  return (
    <AppShell role="admin">
      <div className="space-y-6">
        <div className="space-y-1">
          <PageHeader
            title="Timetable Management"
            subtitle="Create, edit and delete weekly schedule entries per class."
          />
        </div>
        <AdminTimetable />
      </div>
    </AppShell>
  );
}
