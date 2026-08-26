import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";

/**
 * Explicit access-denied state. Rendered by role-guarded pages when the
 * authenticated user's role does not permit the route. Never silently
 * redirects anywhere — the user always sees why they are blocked and
 * which identity they are currently signed in as.
 */
export default function AccessDenied({
  role,
  homeHref,
  homeLabel,
}: {
  role: string;
  homeHref: string;
  homeLabel: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <LockKeyhole className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You are signed in as{" "}
          <span className="font-medium capitalize text-foreground">{role}</span>,
          which does not have permission to view this page.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <Link
            href={homeHref}
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to {homeLabel}
          </Link>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
