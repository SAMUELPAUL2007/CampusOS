"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Admin user-management server actions (create / remove users).
 * See the doc blocks on each action for their security models.
 */

const VALID_ROLES = ["admin", "teacher", "student"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FULL_NAME_LENGTH = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InviteUserResult {
  ok: boolean;
  message: string;
}

export interface RemoveUserResult {
  ok: boolean;
  message: string;
}

/**
 * Shared requester verification for privileged user-management actions.
 * Returns the authenticated admin's id, or an error result.
 * Identity comes from auth cookies; the admin role is confirmed through an
 * RLS-scoped profiles read, so neither can be spoofed from the browser.
 */
async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createSupabaseServer();
  const { data: claimsRes, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsRes?.claims?.sub;
  if (claimsError || typeof userId !== "string" || !userId) {
    return { ok: false, message: "Unauthorized." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false, message: "Forbidden." };
  }
  return { ok: true, userId };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Server action: create a new CampusOS user directly from the admin form.
 *
 * Security model:
 * - The requester's identity is established server-side from their auth
 *   cookies via createSupabaseServer(); nothing about the requester is
 *   trusted from the browser payload.
 * - The requester's admin role is read from the profiles table through
 *   RLS before any privileged operation runs.
 * - The requested role is validated against a whitelist; it is used only
 *   as the assignment value, never as authorization.
 * - The default password lives only in this server module: it is never
 *   logged, never returned to the client beyond the fixed helper text,
 *   and never stored in public.profiles.
 * - Only safe, human-readable results are returned to the client.
 */

const DEFAULT_INITIAL_PASSWORD = "1234";

export async function inviteUserAction(
  _prev: InviteUserResult | null,
  formData: FormData,
): Promise<InviteUserResult> {
  // -----------------------------------------------------------------
  // 1) Identify the requester from their session (server-side only).
  // -----------------------------------------------------------------
  const supabase = await createSupabaseServer();
  const { data: claimsRes, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsRes?.claims?.sub;
  if (claimsError || typeof userId !== "string" || !userId) {
    return { ok: false, message: "Unauthorized." };
  }

  // -----------------------------------------------------------------
  // 2) Verify the requester really is an admin (RLS-enforced read).
  //    A non-admin can only read their own profile row here, so the
  //    check cannot be spoofed by crafted form data.
  // -----------------------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false, message: "Forbidden." };
  }

  // -----------------------------------------------------------------
  // 3) Validate the submitted fields.
  // -----------------------------------------------------------------
  const email = field(formData, "email").toLowerCase();
  const fullName = field(formData, "full_name");
  const role = field(formData, "role");

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, message: "Full name is required." };
  }
  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return {
      ok: false,
      message: `Full name must be at most ${MAX_FULL_NAME_LENGTH} characters.`,
    };
  }
  if (!VALID_ROLES.includes(role as ValidRole)) {
    return { ok: false, message: "Invalid role selected." };
  }

  // -----------------------------------------------------------------
  // 4) Obtain the server-only Admin client.
  //    When SUPABASE_SERVICE_ROLE_KEY is not configured this fails
  //    safely and the feature stays disabled.
  // -----------------------------------------------------------------
  let adminClient;
  try {
    adminClient = getSupabaseAdmin();
  } catch {
    return {
      ok: false,
      message:
        "User provisioning is not configured on this server. Contact your administrator.",
    };
  }

  // -----------------------------------------------------------------
  // 5) Create the Auth account server-side with the default password,
  //    pre-confirmed so the user can log in immediately through /login.
  //    Duplicate emails are rejected with a clear message.
  // -----------------------------------------------------------------
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password: DEFAULT_INITIAL_PASSWORD,
      email_confirm: true,
    });

  if (createError) {
    const raw = createError.message ?? "";
    if (/already|registered|exists/i.test(raw)) {
      return { ok: false, message: "A user with this email already exists." };
    }
    return {
      ok: false,
      message: "Failed to create the user account. Please try again later.",
    };
  }

  const newUserId = created?.user?.id;
  if (!newUserId) {
    return {
      ok: false,
      message: "Account created, but it could not be confirmed.",
    };
  }

  // -----------------------------------------------------------------
  // 6) Assign role and full name through the requester-scoped client.
  //    The create_profile_for_user trigger has by now created the
  //    profile row (role defaults to 'student', full_name set to the
  //    email); this update applies the admin's chosen values. RLS's
  //    admin-update policy authorizes it.
  // -----------------------------------------------------------------
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", newUserId);

  if (updateError) {
    return {
      ok: false,
      message:
        "Account created, but applying the role/name failed. Adjust them in Manage Users.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "User created successfully. Default password: 1234" };
}

/**
 * Server action: permanently remove a user (student or teacher) from
 * CampusOS.
 *
 * Security model:
 * - Requester must be an authenticated admin (verified server-side above).
 * - Self-deletion is rejected; admin accounts can never be removed through
 *   this action, even if the request is hand-crafted.
 * - The target id is validated as a UUID before any query runs.
 *
 * Data-safety model (matches the existing foreign keys):
 * - auth.users deletion cascades to profiles, class_students,
 *   class_teachers, the user's own attendance/marks rows (schema-defined).
 * - timetable.teacher_id / exams.created_by / attendance_sessions.marked_by /
 *   attendance_records.marked_by are ON DELETE SET NULL — historical
 *   academic data is preserved with the marker anonymized.
 * - attendance.marked_by and marks.marked_by are NOT NULL ON DELETE RESTRICT:
 *   those references are re-pointed to the acting admin first so history is
 *   preserved and the FK never blocks or orphans a delete.
 */
export async function removeUserAction(
  targetId: string,
): Promise<RemoveUserResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  const adminUserId = auth.userId;

  if (!UUID_PATTERN.test(targetId)) {
    return { ok: false, message: "Invalid user." };
  }

  // Self-protection: an admin can never remove their own account.
  if (targetId === adminUserId) {
    return { ok: false, message: "You cannot remove your own account." };
  }

  let adminClient;
  try {
    adminClient = getSupabaseAdmin();
  } catch {
    return {
      ok: false,
      message:
        "User management is not configured on this server. Contact your administrator.",
    };
  }

  // Read the target through the admin client so the role check cannot be
  // bypassed by RLS-scoped spoofing. Admins are protected from removal.
  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", targetId)
    .single();

  if (targetError || !target) {
    return { ok: false, message: "User not found." };
  }
  if (target.role === "admin") {
    return { ok: false, message: "Admin accounts cannot be removed." };
  }

  // Preserve historical records that reference this user as the marker.
  // These columns are NOT NULL with ON DELETE RESTRICT, so they must be
  // re-attributed before the auth user can be deleted.
  const { error: attErr } = await adminClient
    .from("attendance")
    .update({ marked_by: adminUserId })
    .eq("marked_by", targetId);
  if (attErr) {
    return { ok: false, message: "Could not preserve attendance history. Removal aborted." };
  }
  const { error: marksErr } = await adminClient
    .from("marks")
    .update({ marked_by: adminUserId })
    .eq("marked_by", targetId);
  if (marksErr) {
    return { ok: false, message: "Could not preserve marks history. Removal aborted." };
  }

  // Deleting the auth user cascades to profiles and enrollment/assignment
  // relationships per the existing schema. Sessions stay valid elsewhere:
  // Supabase rejects tokens for deleted users immediately.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);

  if (deleteError) {
    return {
      ok: false,
      message:
        "Failed to remove the user. They may still be referenced by records that could not be transferred.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "User removed successfully." };
}
