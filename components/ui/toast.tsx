"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CheckCircle2, AlertCircle, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * CampusOS toast viewport. Mount once (<Toaster />) and fire toasts from
 * client components via `toastManager.add({ title, type })` where
 * `type` is "success" | "error". Short, non-blocking feedback only.
 *
 * Uses a standalone toastManager (Base UI's documented decoupled pattern)
 * instead of context so producers never depend on provider scoping.
 */
export const toastManager = ToastPrimitive.createToastManager()

export function Toaster(props: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return (
    <ToastPrimitive.Provider timeout={4000} toastManager={toastManager} {...props}>
      <ToastViewport />
    </ToastPrimitive.Provider>
  )
}

function ToastViewport() {
  const { toasts } = ToastPrimitive.useToastManager()
  return (
    <ToastPrimitive.Viewport
      className="fixed bottom-16 right-4 z-100 flex w-full max-w-80 flex-col gap-2 outline-none md:bottom-6"
    >
      {toasts.map((toast) => (
        <ToastRoot key={toast.id} toast={toast} />
      ))}
    </ToastPrimitive.Viewport>
  )
}

function ToastRoot({
  toast,
}: {
  toast: { id: string; title?: React.ReactNode; description?: React.ReactNode; type?: string }
}) {
  const isError = toast.type === "error"
  return (
    <ToastPrimitive.Root
      toast={toast}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-overlay transition-opacity",
        isError
          ? "border-destructive/30"
          : "border-success/30",
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      )}
      <div className="flex flex-col gap-0.5">
        <ToastPrimitive.Title className="text-sm font-medium">
          {toast.title}
        </ToastPrimitive.Title>
        {toast.description ? (
          <ToastPrimitive.Description className="text-sm text-muted-foreground">
            {toast.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss notification"
        className="ml-auto shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/60"
      >
        <XIcon className="size-4" aria-hidden />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
