"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import LogoutButton from "@/components/LogoutButton"
import { ThemeToggle } from "@/components/shared/theme-toggle"

type Role = "admin" | "teacher" | "student"

interface NavItem {
  href: string
  label: string
  shortLabel: string
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", shortLabel: "Users", icon: Users },
    { href: "/admin/attendance", label: "Attendance", shortLabel: "Attend", icon: ClipboardCheck },
    { href: "/admin/exams", label: "Exams", shortLabel: "Exams", icon: FileText },
    { href: "/admin/timetable", label: "Timetable", shortLabel: "Sched", icon: CalendarDays },
  ],
  teacher: [
    { href: "/teacher", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { href: "/teacher/attendance", label: "Attendance", shortLabel: "Attend", icon: ClipboardCheck },
    { href: "/teacher/exams", label: "Exams", shortLabel: "Exams", icon: FileText },
    { href: "/teacher/timetable", label: "Timetable", shortLabel: "Sched", icon: CalendarDays },
  ],
  student: [
    { href: "/student", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { href: "/student/attendance", label: "Attendance", shortLabel: "Attend", icon: ClipboardCheck },
    { href: "/student/exams", label: "Exams", shortLabel: "Exams", icon: FileText },
    { href: "/student/timetable", label: "Timetable", shortLabel: "Sched", icon: CalendarDays },
  ],
}

function isActive(pathname: string, item: NavItem, role: Role) {
  if (pathname === item.href) return true
  // Dashboard is an exact match; section roots match their subtree.
  return item.href !== `/${role}` && pathname.startsWith(`${item.href}/`)
}

function initials(fullName?: string) {
  if (!fullName) return "U"
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

/**
 * Authenticated application shell: desktop sidebar + mobile bottom nav.
 * Presentation only — navigation visibility never grants access; each
 * page's existing server-side role guard remains the source of truth.
 */
export function AppShell({
  role,
  fullName,
  children,
}: {
  role: Role
  fullName?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const items = NAV[role]

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">CampusOS</span>
            <span className="text-xs text-muted-foreground">Academic Portal</span>
          </span>
        </div>

        <nav
          aria-label={`${role} navigation`}
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          {items.map((item) => {
            const active = isActive(pathname, item, role)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring/60",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                  />
                )}
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials(fullName)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {fullName ?? "Signed in"}
              </span>
              <span className="text-xs font-medium capitalize text-primary">
                {role}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Main content — offset for the sidebar on desktop, clear of the
          bottom nav on mobile. */}
      <main id="content" className="md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={`${role} navigation`}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid auto-cols-fr grid-flow-col">
          {items.map((item) => {
            const active = isActive(pathname, item, role)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring/60",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                  />
                )}
                <item.icon className="size-5 shrink-0" aria-hidden />
                <span className="leading-none">{item.shortLabel}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
