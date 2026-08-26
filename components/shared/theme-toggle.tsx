"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

type ThemeOption = "dark" | "light" | "system"

const OPTIONS: { value: ThemeOption; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
]

/**
 * Visible, accessible theme control. Preserves the existing next-themes
 * setup; the hidden "d" hotkey remains until this control is confirmed.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  // Hydration-safe "mounted" check without setState-in-effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  // Render the dark icon pre-mount to match the dark-first default and
  // avoid a hydration mismatch flash.
  const current: ThemeOption =
    mounted && OPTIONS.some((o) => o.value === theme)
      ? (theme as ThemeOption)
      : "dark"
  const active = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0]
  const next = OPTIONS[(OPTIONS.indexOf(active) + 1) % OPTIONS.length]
  const Icon = active.icon

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      aria-label={`Theme: ${active.label}. Switch to ${next.label}.`}
      title={`Theme: ${active.label} — switch to ${next.label}`}
      className={
        className ??
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring/60"
      }
    >
      <Icon className="size-4" />
    </button>
  )
}
