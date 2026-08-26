import { cn } from "@/lib/utils"

type StatTone = "neutral" | "success" | "warning" | "destructive" | "info" | "primary"

const toneClasses: Record<StatTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
  primary: "text-primary",
}

/**
 * Metric card used across dashboards. Presentation only.
 * `value` accepts any ReactNode (number, string, colored span, ...).
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "neutral",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  hint?: React.ReactNode
  tone?: StatTone
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      <p
        className={cn(
          "text-2xl font-semibold tracking-tight tabular-nums",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
