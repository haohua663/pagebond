"use client";

import { cn } from "@/lib/utils";
import {
  DEMO_LABEL,
  clearDemoSession,
  readDemoSession,
  type DemoSession,
} from "@/lib/auth/demo-session";
import {
  ArrowLeft,
  Home,
  Lightbulb,
  LogIn,
  LogOut,
  Settings,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type RailAction = "home" | "suggestions" | "settings" | "back" | "user";

function PagebondMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 36"
      className={cn("h-7 w-auto text-paper", className)}
      aria-hidden
      focusable="false"
    >
      <rect x="2" y="2" width="10" height="32" rx="5" fill="currentColor" />
      <rect x="16" y="2" width="10" height="32" rx="5" fill="currentColor" />
      <g transform="rotate(14 37 18)">
        <rect x="30" y="2" width="10" height="32" rx="5" fill="currentColor" />
      </g>
    </svg>
  );
}

function RailButton({
  label,
  active,
  onClick,
  testId,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-paper/70 transition-colors hover:bg-white/10 hover:text-paper",
        active && "bg-white/10 text-paper",
      )}
    >
      {children}
    </button>
  );
}

function AccountMenu({
  open,
  session,
  onClose,
  onLogout,
}: {
  open: boolean;
  session: DemoSession | null;
  onClose: () => void;
  onLogout: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="menu"
      data-testid="account-menu"
      className="absolute bottom-14 left-0 z-50 w-52 rounded-xl border border-white/10 bg-zinc-950 p-2 text-sm text-paper shadow-desk lg:bottom-auto lg:left-14 lg:top-0"
    >
      {session ? (
        <>
          <p className="px-2 pt-1 text-xs text-amber-200/90">{DEMO_LABEL}</p>
          <p className="truncate px-2 font-medium">{session.name}</p>
          <p className="mb-2 truncate px-2 text-xs text-zinc-400">{session.email}</p>
          <p className="mb-2 px-2 text-[11px] leading-snug text-zinc-500">
            定价与订阅稍后接入；设置仍用齿轮图标。
          </p>
          <button
            type="button"
            role="menuitem"
            data-testid="account-logout"
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-paper/90 hover:bg-white/10"
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <LogOut size={16} aria-hidden />
            退出演示登录
          </button>
        </>
      ) : (
        <>
          <p className="mb-1 px-2 pt-1 text-xs text-zinc-400">账户</p>
          <Link
            href="/login"
            role="menuitem"
            data-testid="account-login"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-paper/90 hover:bg-white/10"
            onClick={onClose}
          >
            <LogIn size={16} aria-hidden />
            登录
          </Link>
          <Link
            href="/signup"
            role="menuitem"
            data-testid="account-signup"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-paper/90 hover:bg-white/10"
            onClick={onClose}
          >
            <UserPlus size={16} aria-hidden />
            注册
          </Link>
          <p className="mt-1 px-2 pb-1 text-[11px] leading-snug text-zinc-500">
            演示占位 · 定价页稍后
          </p>
        </>
      )}
    </div>
  );
}

export function WorkbenchRail({
  active,
  suggestionsOpen,
  settingsOpen,
  onAction,
  className,
}: {
  active: "home" | "work" | "none";
  suggestionsOpen?: boolean;
  settingsOpen?: boolean;
  onAction: (action: RailAction) => void;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<DemoSession | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setSession(readDemoSession());
    sync();
    window.addEventListener("pagebond:demo-session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pagebond:demo-session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.document.addEventListener("mousedown", onDoc);
    window.document.addEventListener("keydown", onKey);
    return () => {
      window.document.removeEventListener("mousedown", onDoc);
      window.document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <nav
      aria-label="工作台导航"
      data-testid="workbench-rail"
      className={cn(
        "workbench-rail flex shrink-0 flex-row items-center gap-1 rounded-2xl bg-ink px-2 py-2 lg:h-[min(100vh-6rem,42rem)] lg:w-16 lg:flex-col lg:justify-between lg:px-2 lg:py-4",
        className,
      )}
    >
      <div className="flex flex-row items-center gap-1 lg:flex-col lg:gap-3">
        <button
          type="button"
          title="Pagebond"
          aria-label="Pagebond 主页"
          data-testid="rail-logo"
          onClick={() => onAction("home")}
          className="mb-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl hover:bg-white/10 lg:mb-2"
        >
          <PagebondMark />
        </button>
        <RailButton
          label="主页"
          active={active === "home" && !settingsOpen && !suggestionsOpen}
          testId="rail-home"
          onClick={() => onAction("home")}
        >
          <Home size={20} strokeWidth={1.75} aria-hidden />
        </RailButton>
        <RailButton
          label="建议"
          active={Boolean(suggestionsOpen)}
          testId="rail-suggestions"
          onClick={() => onAction("suggestions")}
        >
          <Lightbulb size={20} strokeWidth={1.75} aria-hidden />
        </RailButton>
        <RailButton
          label="设置"
          active={Boolean(settingsOpen)}
          testId="rail-settings"
          onClick={() => onAction("settings")}
        >
          <Settings size={20} strokeWidth={1.75} aria-hidden />
        </RailButton>
      </div>
      <div className="relative ml-auto flex flex-row items-center gap-1 lg:ml-0 lg:flex-col lg:gap-3" ref={wrapRef}>
        <RailButton label="返回" testId="rail-back" onClick={() => onAction("back")}>
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        </RailButton>
        <RailButton
          label="用户"
          active={menuOpen}
          testId="rail-user"
          onClick={() => {
            setMenuOpen((v) => !v);
            onAction("user");
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <UserRound size={16} strokeWidth={1.75} aria-hidden />
          </span>
        </RailButton>
        <AccountMenu
          open={menuOpen}
          session={session}
          onClose={() => setMenuOpen(false)}
          onLogout={() => clearDemoSession()}
        />
      </div>
    </nav>
  );
}
