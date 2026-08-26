"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server action: remove a student from a class (unenrollment only).
 *
 * Security model:
 * - Requester must be an authenticated TEACHER (verified server-side from
 *   their auth cookies; nothing is trusted from the browser payload).
 * - The teacher must be assigned to the target class via class_teachers.
 *   This check runs server-side against the admin client, so hand-crafted
 *   class_id/student_id values cannot remove students from another
 *   teacher's class.
 * - Only the single class_students relationship row is deleted. The
 *   student's auth account, profile, other enrollments, and all historical
 *   attendance/marks remain untouched.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RemoveStudentResult {
  ok: boolean;
  message: string;
}

export async function removeStudentFromClassAction(
  classId: string,
  studentId: string,
): Promise<RemoveStudentResult> {
  // 1) Identify the requester from their session (server-side only).
  const supabase = await createSupabaseServer();
  const { data: claimsRes, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsRes?.claims?.sub;
  if (claimsError || typeof userId !== "string" || !userId) {
    return { ok: false, message: "Unauthorized." };
  }

  // 2) Verify the requester really is a teacher (RLS-enforced read).
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "teacher") {
    return { ok: false, message: "Forbidden." };
  }

  // 3) Validate ids before any privileged query runs.
  if (!UUID_PATTERN.test(classId) || !UUID_PATTERN.test(studentId)) {
    return { ok: false, message: "Invalid request." };
  }

  let adminClient;
  try {
    adminClient = getSupabaseAdmin();
  } catch {
    return {
      ok: false,
      message:
        "Class management is not configured on this server. Contact your administrator.",
    };
  }

  // 4) Authorization: the teacher must actually be assigned to THIS class.
  const { data: assignment, error: assignmentError } = await adminClient
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", classId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (assignmentError) {
    return { ok: false, message: "Could not verify your class assignment." };
  }
  if (!assignment) {
    return {
      ok: false,
      message: "You are not assigned to this class.",
    };
  }

  // 5) Verify the student is enrolled in THIS class.
  const { data: enrollment, error: enrollmentError } = await adminClient
    .from("class_students")
    .select("student_id")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (enrollmentError) {
    return { ok: false, message: "Could not verify the student's enrollment." };
  }
  if (!enrollment) {
    return { ok: false, message: "This student is not enrolled in this class." };
  }

  // 6) Remove exactly one relationship row. Nothing else is touched:
  //    auth.users, profiles, other classes, attendance and marks all remain.
  const { error: deleteError } = await adminClient
    .from("class_students")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);

  if (deleteError) {
    return { ok: false, message: "Failed to remove the student from the class." };
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/attendance");
  revalidatePath("/admin/users");
  return { ok: true, message: "Student removed from class." };
}
