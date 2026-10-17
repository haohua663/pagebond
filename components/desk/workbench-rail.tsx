"use client";

import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Home,
  Lightbulb,
  Settings,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

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
      <div className="ml-auto flex flex-row items-center gap-1 lg:ml-0 lg:flex-col lg:gap-3">
        <RailButton label="返回" testId="rail-back" onClick={() => onAction("back")}>
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        </RailButton>
        <RailButton label="用户" testId="rail-user" onClick={() => onAction("user")}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <UserRound size={16} strokeWidth={1.75} aria-hidden />
          </span>
        </RailButton>
      </div>
    </nav>
  );
}
