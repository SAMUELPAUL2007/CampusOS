import { cn } from "@/lib/utils"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"

type MessageTone = "success" | "error" | "info" | "warning"

const toneClasses: Record<
  MessageTone,
  { box: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }
> = {
  success: {
    box: "border-success/25 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  error: {
    box: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: AlertCircle,
  },
  info: {
    box: "border-info/25 bg-info/10 text-info",
    icon: Info,
  },
  warning: {
    box: "border-warning/25 bg-warning/10 text-warning",
    icon: AlertTriangle,
  },
}

/**
 * Inline form result message. Preserves caller-provided text verbatim;
 * only the presentation is shared. `error` uses role="alert",
 * everything else uses role="status" — matching prior aria semantics.
 */
export function FormMessage({
  tone = "info",
  children,
  className,
}: {
  tone?: MessageTone
  children: React.ReactNode
  className?: string
}) {
  const { box, icon: Icon } = toneClasses[tone]
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
