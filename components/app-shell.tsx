"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, BookOpen, ChevronRight, Eye, LayoutDashboard, ListFilter, Menu, Moon, Sun } from "lucide-react";
import { Badge, Button, Drawer } from "@/components/ui/primitives";
import { THEME_KEY } from "@/lib/theme";

const navigation = [
  { href: "/", label: "Live monitor", icon: Activity },
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/results", label: "Results", icon: ListFilter },
  { href: "/help", label: "Guide", icon: BookOpen },
];
let sessionTheme: string | null = null;
const subscribeTheme = (callback: () => void) => {
  const changed = () => { sessionTheme = null; callback(); };
  window.addEventListener("storage", changed);
  window.addEventListener("tesis-theme", callback);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener("tesis-theme", callback); };
};
const getTheme = () => {
  if (sessionTheme) return sessionTheme;
  try { return (localStorage.getItem(THEME_KEY) ?? localStorage.getItem("tesis-theme")) === "dark" ? "dark" : "light"; } catch { return "light"; }
};
const serverTheme = () => "light";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, serverTheme);
  useEffect(() => { document.documentElement.dataset.theme = getTheme(); }, [theme]);
  const selected = navigation.find(item => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const nav = <nav className="app-navigation" aria-label="Main navigation">{navigation.map(item => {
    const Icon = item.icon;
    const active = item === selected;
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMenuOpen(false)}><Icon size={18} /><span>{item.label}</span></Link>;
  })}</nav>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="app-sidebar">
      <Link href="/" className="app-brand"><span className="brand-mark" aria-hidden="true">T</span><span>TESIS<span className="brand-caption">Web Observer</span></span></Link>
      <div className="workspace-label"><span className="workspace-avatar">R</span><span>Research workspace<small>DVWA sandbox</small></span></div>
      {nav}
      <div className="sidebar-footer"><Eye size={16} /><span>Read-only observer<small>Experiments run in TESIS</small></span></div>
    </aside>
    <div className="app-workspace">
      <header className="app-topbar">
        <div className="topbar-context"><Button className="mobile-menu ui-button-icon" variant="ghost" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></Button>
          <span>Workspace</span><ChevronRight size={14} /><strong>{selected?.label ?? "Results"}</strong>
        </div>
        <div className="topbar-actions"><Badge variant="outline"><Eye size={13} /> Read-only</Badge>
          <Button className="ui-button-icon" variant="ghost" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={() => {
            const next = theme === "light" ? "dark" : "light";
            sessionTheme = next;
            try { localStorage.setItem(THEME_KEY, next); } catch { /* Retain the selection for this session. */ }
            window.dispatchEvent(new Event("tesis-theme"));
          }}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</Button>
          <Link href="/help" className="topbar-help">Guide <ArrowUpRight size={14} /></Link>
        </div>
      </header>
      <main id="main-content" className="app-main canvas" tabIndex={-1}>{children}</main>
    </div>
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="TESIS navigation" side="left">{nav}</Drawer>
  </div>;
}
