"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, BookOpen, ChevronRight, LayoutDashboard, ListFilter, Menu, PanelLeftClose, PanelLeftOpen, Settings, SlidersHorizontal } from "lucide-react";
import { HackerChrome } from "@/components/hacker/hacker-chrome";
import { HackerCinema } from "@/components/hacker/hacker-cinema";
import sidebarStyles from "@/components/app-shell.module.css";
import { Button, Drawer } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { persistSidebarPreference, readSidebarPreference, subscribeToSidebarPreference } from "@/lib/sidebar";
import { useCheatCodeListener } from "@/lib/use-hacker";
import { useTheme } from "@/lib/use-theme";

const navigation = [
  { href: "/control", label: "Control", icon: SlidersHorizontal },
  { href: "/", label: "Live monitor", icon: Activity },
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/results", label: "Results", icon: ListFilter },
  { href: "/help", label: "Guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  // Always expanded for the server render; the stored choice is restored after
  // mount so the client never disagrees with the server-rendered markup.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const selected = navigation.find(item => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  useCheatCodeListener();

  useEffect(() => {
    // Reading after mount keeps the server and first client renders expanded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarCollapsed(readSidebarPreference() === "collapsed");
    return subscribeToSidebarPreference(preference => {
      setSidebarCollapsed(preference === "collapsed");
    });
  }, []);

  const toggleSidebar = () => {
    const collapsed = !sidebarCollapsed;
    persistSidebarPreference(collapsed ? "collapsed" : "expanded");
    setSidebarCollapsed(collapsed);
  };

  const renderNavigation = (showTooltips: boolean) => <nav className="app-navigation" aria-label="Main navigation">{navigation.map(item => {
    const Icon = item.icon;
    const active = item === selected;
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} aria-label={item.label} title={showTooltips ? item.label : undefined} className={active ? "active" : ""} onClick={() => setMenuOpen(false)}><Icon size={18} /><span>{item.label}</span></Link>;
  })}</nav>;

  return <div className={`app-shell ${sidebarStyles.shell}${sidebarCollapsed ? ` ${sidebarStyles.collapsed}` : ""}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside id="app-sidebar" className="app-sidebar">
      <Link href="/" className="app-brand" aria-label="TESIS Console" title={sidebarCollapsed ? "TESIS Console" : undefined}><span className="brand-mark" aria-hidden="true">T</span><span>TESIS</span></Link>
      <div className="workspace-label" title={sidebarCollapsed ? "Research workspace — DVWA sandbox" : undefined}><span className="workspace-avatar">R</span><span>Research workspace<small>DVWA sandbox</small></span></div>
      {renderNavigation(sidebarCollapsed)}
      <button type="button" className={sidebarStyles.sidebarToggle} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="app-sidebar" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar}>
        {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        <span className={sidebarStyles.toggleLabel}>{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
      </button>
    </aside>
    <div className="app-workspace">
      <header className="app-topbar">
        <div className="topbar-context"><Button className="mobile-menu ui-button-icon" variant="ghost" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></Button>
          <span>Workspace</span><ChevronRight size={14} /><strong>{selected?.label ?? "Results"}</strong>
        </div>
        <div className="topbar-actions">
          {theme === "hacker" ? null : <ThemeToggle />}
          <Link href="/help" className="topbar-help">Guide <ArrowUpRight size={14} /></Link>
        </div>
      </header>
      <main id="main-content" className="app-main canvas" tabIndex={-1}>{children}</main>
    </div>
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="TESIS navigation" side="left">{renderNavigation(false)}</Drawer>
    {/* Session cinematics render above every layer and outlive the hacker
        chrome they retire, so they mount beside it, not inside it. */}
    <HackerCinema />
    <HackerChrome />
  </div>;
}
