import { cn } from "@/lib/utils"

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "primary"

/**
 * Known application statuses mapped to semantic tones. Meaning is preserved
 * from the pre-existing hardcoded pills:
 *   green pills  -> success   (present / taken / completed / live)
 *   red pills    -> destructive (absent / cancelled)
 *   amber pills  -> warning   (pending / not taken)
 *   blue pills   -> info      (upcoming / next / scheduled)
 */
const statusTones: Record<string, StatusTone> = {
  present: "success",
  taken: "success",
  completed: "success",
  live: "success",
  absent: "destructive",
  cancelled: "destructive",
  pending: "warning",
  "not taken": "warning",
  "not_taken": "warning",
  upcoming: "info",
  next: "info",
  scheduled: "info",
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/25 bg-success/15 text-success",
  warning: "border-warning/25 bg-warning/15 text-warning",
  destructive: "border-destructive/25 bg-destructive/15 text-destructive",
  info: "border-info/25 bg-info/15 text-info",
  primary: "border-primary/25 bg-primary/15 text-primary",
}

export function StatusBadge({
  status,
  tone,
  children,
  className,
}: {
  /** Known status key; unknown keys fall back to neutral. */
  status?: string
  /** Explicit tone override (wins over the status map). */
  tone?: StatusTone
  /** Custom label; defaults to a title-cased status. */
  children?: React.ReactNode
  className?: string
}) {
  const resolved: StatusTone =
    tone ?? (status ? statusTones[status.toLowerCase()] ?? "neutral" : "neutral")
  const label =
    children ??
    (status
      ? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[resolved],
        className,
      )}
    >
      {label}
    </span>
  )
}
