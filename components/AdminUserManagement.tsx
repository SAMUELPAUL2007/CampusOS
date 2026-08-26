"use client";

import { useActionState, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AccessDenied from "@/components/AccessDenied";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastManager } from "@/components/ui/toast";
import { FormMessage } from "@/components/shared/form-message";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchX, Search, Users, X } from "lucide-react";
import { Skeleton } from "@/components/shared/skeleton";
import { AppShell } from "@/components/shared/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { inviteUserAction, removeUserAction, type InviteUserResult } from "@/app/admin/users/actions";
import { Loader2, UserX } from "lucide-react";

function initials(fullName: string) {
  return (
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

interface Profile {
  id: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  created_at: string;
}

type Role = "admin" | "teacher" | "student";

const ROLE_FILTERS: { key: "all" | Role; label: string }[] = [
  { key: "all", label: "All" },
  { key: "student", label: "Students" },
  { key: "teacher", label: "Teachers" },
  { key: "admin", label: "Admins" },
];

export default function AdminUserManagement({
  emailById,
}: {
  emailById: Record<string, string>;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const addToast = toastManager.add.bind(toastManager);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [pendingRemove, setPendingRemove] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [inviteState, inviteAction, invitePending] = useActionState<
    InviteUserResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await inviteUserAction(prev, formData);
    // Refresh the users list after a successful creation so the new user
    // appears immediately without a manual page reload.
    if (result.ok) void fetchProfiles();
    return result;
  }, null);

  // Case-insensitive client-side filtering over the already-authorized
  // profile list (single fetch; no per-keystroke database requests).
  const q = search.trim().toLowerCase();
  const filteredProfiles = profiles.filter((p) => {
    if (roleFilter !== "all" && p.role !== roleFilter) return false;
    if (q.length === 0) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      (emailById[p.id] ?? "").toLowerCase().includes(q)
    );
  });

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: claims, error: claimsError } = await supabase.auth.getClaims();
      if (claimsError) throw claimsError;
      const userId = claims?.claims?.sub as string;
      setCurrentUserId(userId);

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (meErr || !me) throw new Error("Could not verify your role");
      setCurrentRole(me.role);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .order("full_name");
      if (error) throw error;
      setProfiles(data as Profile[]);
    } catch (e: any) {
      setError(e.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const requestRoleChange = (profileId: string, newRole: Role) => {
    const isSelf = profileId === currentUserId;
    setPendingConfirm({
      title: "Change role to " + newRole + "?",
      description: isSelf
        ? "You are about to change your own role. Continue?"
        : "The user's access will update immediately.",
      confirmLabel: "Change role",
      action: () => {
        void changeRole(profileId, newRole);
      },
    });
  };

  const changeRole = async (profileId: string, newRole: Role) => {
    setSavingId(profileId);
    setError(null);
    try {
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
      if (error) throw error;
      await fetchProfiles();
      addToast({ type: "success", title: "Role updated" });
    } catch (e: any) {
      setError(e.message ?? "Failed to update role");
    } finally {
      setSavingId(null);
    }
  };

  const confirmRemoveUser = async () => {
    if (!pendingRemove || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const result = await removeUserAction(pendingRemove.id);
      if (!result.ok) {
        setError(result.message);
        addToast({ type: "error", title: result.message });
        return;
      }
      addToast({ type: "success", title: "User removed successfully." });
      await fetchProfiles();
    } catch {
      const message = "Failed to remove the user. Please try again.";
      setError(message);
      addToast({ type: "error", title: message });
    } finally {
      setRemoving(false);
      setPendingRemove(null);
    }
  };

  if (loading) {
    return (
      <AppShell role="admin">
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>Loading users...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  if (currentRole && currentRole !== "admin") {
    return (
      <AccessDenied
        role={currentRole}
        homeHref={currentRole === "teacher" ? "/teacher" : "/student"}
        homeLabel={currentRole === "teacher" ? "Teacher Dashboard" : "Student Dashboard"}
      />
    );
  }

  return (
    <AppShell role="admin">
      <div className="space-y-6">
      <div className="space-y-1">
        <PageHeader
          title="User Management"
          subtitle="Manage roles and access for everyone in your school."
        />
      </div>

      {/* Create / Invite User */}
      <form
        action={inviteAction}
        className="space-y-4 rounded-xl border bg-card p-4 shadow-card md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Create / Invite User</h2>
          <p className="text-xs text-muted-foreground">
            New users receive the default password: <span className="font-mono font-semibold">1234</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              name="email"
              placeholder="teacher@school.edu"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="invite-name"
              type="text"
              name="full_name"
              placeholder="Full name"
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="student"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={invitePending} className="w-full sm:w-auto">
          {invitePending && <Loader2 className="animate-spin" aria-hidden />}
          {invitePending ? "Creating user…" : "Create User"}
        </Button>
        {inviteState && (
          <p
            role="status"
            className={
              inviteState.ok ? "text-sm text-success" : "text-sm text-destructive"
            }
          >
            {inviteState.message}
          </p>
        )}
      </form>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      {/* Search + role filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRoleFilter(f.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
                roleFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            aria-label="Search users by name or email"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2.5 text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found."
          description="Invited users will appear here."
        />
      ) : filteredProfiles.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            "No users found for \u0022" + search + "\u0022" +
            (roleFilter !== "all"
              ? " in " + (ROLE_FILTERS.find((f) => f.key === roleFilter)?.label ?? "")
              : "") + "."
          }
          description="Try a different search or filter."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {filteredProfiles.length} of {profiles.length} users
          </p>
          <DataTable>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                      >
                        {initials(p.full_name)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{p.full_name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {emailById[p.id] ?? "—"}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      tone={
                        p.role === "admin"
                          ? "primary"
                          : p.role === "teacher"
                            ? "info"
                            : "neutral"
                      }
                    >
                      <span className="capitalize">{p.role}</span>
                    </StatusBadge>
                  </td>
                  <td className="font-mono text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {(["admin", "teacher", "student"] as Role[]).map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={r === p.role ? "secondary" : "outline"}
                        disabled={savingId === p.id || r === p.role}
                        onClick={() => {
                          if (r !== p.role) requestRoleChange(p.id, r);
                        }}
                      >
                        {r}
                      </Button>
                    ))}
                      {/* Admin accounts (including the signed-in admin)
                          are never removable — hidden in the UI and
                          rejected server-side. */}
                      {p.role !== "admin" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={removing || savingId === p.id}
                          onClick={() =>
                            setPendingRemove({
                              id: p.id,
                              name: p.full_name,
                              email: emailById[p.id] ?? "",
                            })
                          }
                        >
                          <UserX aria-hidden />
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingConfirm?.action()}>
              {pendingConfirm?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove user confirmation */}
      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {pendingRemove?.name}
                {pendingRemove?.email ? ` (${pendingRemove.email})` : ""}
              </span>{" "}
              from CampusOS. This will permanently remove this user&apos;s CampusOS account and
              their associated profile/data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open while the removal is in flight.
                event.preventDefault();
                void confirmRemoveUser();
              }}
            >
              <span className="inline-flex items-center gap-2">
                {removing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {removing ? "Removing…" : "Remove User"}
              </span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </AppShell>
  );
}
