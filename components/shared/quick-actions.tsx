import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface QuickActionItem {
  href: string
  label: React.ReactNode
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  /** Accessible description for screen readers / secondary line. */
  description?: string
}

const columnClasses: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
}

/**
 * Action card grid. Uses Next.js client-side navigation (Link) instead of
 * raw anchors; destinations are passed in by callers and unchanged.
 */
export function QuickActions({
  items,
  columns = 3,
  className,
}: {
  items: QuickActionItem[]
  columns?: 1 | 2 | 3 | 4 | 5
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        columnClasses[columns] ?? columnClasses[3],
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-label={item.description}
          className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-card transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring/60"
        >
          <span className="flex items-center gap-3">
            {item.icon ? (
              <item.icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
            ) : null}
            {item.label}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
      ))}
    </div>
  )
}
