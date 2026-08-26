import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import AdminUserManagement from "@/components/AdminUserManagement";
import AccessDenied from "@/components/AccessDenied";

export default async function AdminUsersPage() {
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

  // Resolve auth emails server-side (service role, never exposed to the
  // client bundle) so the user table can display and search by email.
  let emailById: Record<string, string> = {};
  try {
    const admin = getSupabaseAdmin();
    const { data: users } = await admin.auth.admin.listUsers();
    emailById = Object.fromEntries(
      (users?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    );
  } catch {
    emailById = {};
  }

  return <AdminUserManagement emailById={emailById} />;
}
