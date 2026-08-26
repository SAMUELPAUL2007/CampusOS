import { cn } from "@/lib/utils"

/**
 * Horizontally scrollable table surface. Consumers render their own
 * <thead>/<tbody> as children; header, cell and row styling is applied via
 * variants so every table in the app stays visually identical.
 */
export function DataTable({
  children,
  className,
  stickyHeader = false,
}: {
  children: React.ReactNode
  className?: string
  stickyHeader?: boolean
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl border bg-card shadow-card",
        className,
      )}
    >
      <table
        className={cn(
          "w-full text-sm",
          "[&_thead]:bg-muted/50",
          "[&_thead_tr]:border-b",
          stickyHeader &&
            "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card",
          "[&_th]:h-11 [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:text-left [&_th]:align-middle [&_th]:font-medium [&_th]:text-muted-foreground",
          "[&_td]:px-4 [&_td]:py-3 [&_td]:align-middle",
          "[&_tbody_tr]:border-b [&_tbody_tr]:transition-colors",
          "[&_tbody_tr:last-child]:border-b-0",
          "[&_tbody_tr:hover]:bg-muted/40",
        )}
      >
        {children}
      </table>
    </div>
  )
}
