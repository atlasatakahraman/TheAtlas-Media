"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--sidebar)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--sidebar-border)",
          "--border-radius": "var(--radius-xl)",

          "--success-bg": "var(--sidebar)",
          "--success-text": "var(--foreground)",
          "--success-border": "var(--sidebar-border)",

          "--error-bg": "var(--sidebar)",
          "--error-text": "var(--foreground)",
          "--error-border": "var(--sidebar-border)",

          "--warning-bg": "var(--sidebar)",
          "--warning-text": "var(--foreground)",
          "--warning-border": "var(--sidebar-border)",

          "--info-bg": "var(--sidebar)",
          "--info-text": "var(--foreground)",
          "--info-border": "var(--sidebar-border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:shadow-lg group-[.toaster]:border-sidebar-border font-sans !rounded-2xl p-4",
          description: "!text-muted-foreground text-xs font-medium leading-relaxed",
          title: "!text-foreground text-sm font-semibold",
          actionButton: "!bg-primary !text-primary-foreground font-semibold text-xs !rounded-lg px-3 py-1.5 hover:!bg-primary/90 active:!bg-primary/95 shadow-xs",
          cancelButton: "!bg-background !text-foreground font-medium text-xs !rounded-lg border !border-sidebar-border hover:!bg-secondary active:!bg-secondary/80",
          closeButton: "!bg-background !text-muted-foreground !border-sidebar-border hover:!bg-secondary hover:!text-foreground",
          success: "[&>[data-icon]]:!text-chart-1",
          error: "[&>[data-icon]]:!text-destructive",
          warning: "[&>[data-icon]]:!text-chart-3",
          info: "[&>[data-icon]]:!text-primary",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

