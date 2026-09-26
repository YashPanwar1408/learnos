import * as React from "react"

import { cn } from "@/lib/utils"

export function Progress({
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { value: number }) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700",
        className
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-all duration-300 dark:bg-emerald-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
