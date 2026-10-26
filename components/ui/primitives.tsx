"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Card */

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ui-card",
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
        "ui-card-header",
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
    <h2
      className={cn(
        "ui-card-title",
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
  return <div className={cn("ui-card-content", className)} {...props} />;
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
      "ui-badge-default",
    amber: "ui-badge-amber",
    cyan: "ui-badge-cyan",
    lime: "ui-badge-lime",
    red: "ui-badge-red",
    outline: "ui-badge-outline",
    violet: "ui-badge-violet",
  };
  return (
    <span
      className={cn(
        "ui-badge",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* Button */

type ButtonVariant = "default" | "outline" | "ghost" | "amber" | "danger" | "primary";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "ui-button-primary",
    default:
      "ui-button-default",
    outline:
      "ui-button-outline",
    ghost: "ui-button-ghost",
    amber:
      "ui-button-amber",
    danger:
      "ui-button-danger",
  };
  return (
    <button
      type="button"
      className={cn(
        "ui-button",
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
  idPrefix,
  panelId,
  label = "View",
}: {
  tabs: Array<{ value: string; label: string; badge?: number }>;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  idPrefix?: string;
  panelId?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "ui-tabs",
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-${tab.value}` : undefined}
          aria-controls={panelId}
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onValueChange(tab.value)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            onValueChange(tabs[next].value);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
          className={cn(
            "ui-tab",
            value === tab.value
              ? "ui-tab-active"
              : "",
          )}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="ui-tab-count">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* Centered confirmation dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dialog = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const bodyId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // A confirmation starts on its least destructive control.
    const initial =
      dialog.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      dialog.current?.querySelector<HTMLElement>("button");
    initial?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      origin?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      ref={dialog}
      className="ui-dialog-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Tab") {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="ui-dialog-backdrop" onClick={onClose} />
      <div className="ui-dialog">
        <div className="ui-dialog-header">
          <div id={titleId} className="ui-dialog-title">{title}</div>
          <button type="button" onClick={onClose} className="ui-button ui-button-ghost ui-button-icon" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="ui-dialog-body" id={bodyId}>{children}</div>
        {footer ? <div className="ui-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* Progress bar */

export function Progress({
  value,
  max = 100,
  color = "signal",
  className,
  label = "Progress",
}: {
  value: number;
  max?: number;
  color?: "signal" | "amber" | "lime" | "red";
  className?: string;
  label?: string;
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
      aria-label={label}
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
    <div className={cn("overflow-auto overscroll-contain", className)}>{children}</div>
  );
}

/* Separator */

export function Separator({ className }: { className?: string }) {
  return <div className={cn("ui-separator", className)} />;
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
    <span className="ui-tooltip-wrap">
      {children}
      <span className="ui-tooltip">
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
  side?: "right" | "bottom" | "left";
}) {
  const dialog = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; origin?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={dialog} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Tab") {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}>
      <div
        className="ui-drawer-backdrop"
        onClick={onClose}
      />
      <div
        className={cn(
          "ui-drawer-sheet",
          side === "right" ? "ui-drawer-right" : side === "left" ? "ui-drawer-left" : "ui-drawer-bottom",
        )}
      >
        <div className="ui-drawer-header">
          <div id={titleId} className="ui-drawer-title">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-button ui-button-ghost ui-button-icon"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </div>
    </div>
  );
}
