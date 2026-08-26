import { cn } from "@/lib/utils"

/**
 * Layout-placeholder pulse block for route-level loading states.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-muted", className)}
      {...props}
    />
  )
}
