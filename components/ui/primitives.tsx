import * as React from "react";
import { cn } from "@/lib/utils";

/* Card */

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-graphite-700/80 bg-panel shadow-sm backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-graphite-700/70 px-3 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-graphite-500",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-3", className)} {...props} />;
}

/* Badge */

type BadgeVariant = "default" | "amber" | "cyan" | "lime" | "red" | "outline" | "violet";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    default:
      "border-graphite-600 bg-graphite-800 text-graphite-400",
    amber: "border-ember-500/40 bg-ember-500/15 text-ember-300",
    cyan: "border-signal-500/40 bg-signal-500/15 text-signal-300",
    lime: "border-confirm-500/40 bg-confirm-500/15 text-confirm-400",
    red: "border-danger-500/40 bg-danger-500/15 text-danger-400",
    outline: "border-graphite-600 bg-transparent text-graphite-400",
    violet: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-none tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* Button */

type ButtonVariant = "default" | "outline" | "ghost" | "amber" | "danger";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    default:
      "border-graphite-600 bg-graphite-800 text-graphite-200 hover:border-graphite-500 hover:bg-graphite-700",
    outline:
      "border-graphite-700 bg-transparent text-graphite-300 hover:border-graphite-500 hover:bg-graphite-800",
    ghost: "border-transparent bg-transparent text-graphite-400 hover:bg-graphite-800 hover:text-graphite-200",
    amber:
      "border-ember-500/50 bg-ember-500/15 text-ember-300 hover:bg-ember-500/25",
    danger:
      "border-danger-500/50 bg-danger-500/15 text-danger-400 hover:bg-danger-500/25",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm border px-2.5 py-1 font-display text-[12px] font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* Tabs (segmented control) */

export function Tabs({
  tabs,
  value,
  onValueChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; badge?: number }>;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-graphite-700 bg-graphite-900/60 p-0.5",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "rounded-[3px] px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50",
            value === tab.value
              ? "bg-graphite-700 text-graphite-100 shadow-sm"
              : "text-graphite-500 hover:text-graphite-300",
          )}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="ml-1.5 rounded-sm bg-ember-500/20 px-1 font-mono text-[9px] text-ember-300">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* Progress bar */

export function Progress({
  value,
  max = 100,
  color = "signal",
  className,
}: {
  value: number;
  max?: number;
  color?: "signal" | "amber" | "lime" | "red";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = {
    signal: "bg-signal-400",
    amber: "bg-ember-400",
    lime: "bg-confirm-400",
    red: "bg-danger-500",
  };
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-graphite-800", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-sm transition-all duration-300", colors[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ScrollArea */

export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-y-auto overscroll-contain", className)}>{children}</div>
  );
}

/* Separator */

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-graphite-700/70", className)} />;
}

/* Tooltip (simple title-based) */

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm border border-graphite-600 bg-graphite-900 px-2 py-1 text-[10px] text-graphite-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

/* Drawer (side sheet) */

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "bottom";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex flex-col border-graphite-600 bg-graphite-850 shadow-2xl",
          side === "right"
            ? "ml-auto h-full w-full max-w-xl border-l"
            : "mt-auto h-[70vh] w-full border-t",
        )}
      >
        <div className="flex items-center justify-between border-b border-graphite-700 px-4 py-3">
          <div className="font-display text-[13px] font-semibold uppercase tracking-wider text-graphite-200">
            {title}
          </div>
          <button
            onClick={onClose}
            className="rounded-sm px-2 py-1 text-graphite-400 hover:bg-graphite-800 hover:text-graphite-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
