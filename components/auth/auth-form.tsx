"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEMO_LABEL, writeDemoSession } from "@/lib/auth/demo-session";

type Mode = "signup" | "login";

const darkInput =
  "border-white/10 bg-zinc-900 text-paper placeholder:text-zinc-500 focus-visible:ring-sky-500/60 shadow-none";
const darkLabel = "text-paper";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !password.trim()) {
      setError("请填写邮箱和密码。");
      return;
    }
    if (isSignup && !trimmedName) {
      setError("请填写昵称。");
      return;
    }
    if (password.trim().length < 6) {
      setError("密码至少 6 位（演示占位，未真正校验）。");
      return;
    }
    setBusy(true);
    try {
      // TODO(auth): POST to real credentials API + Postgres users. No Stripe here.
      writeDemoSession({
        name: isSignup ? trimmedName : trimmedName || trimmedEmail.split("@")[0] || "用户",
        email: trimmedEmail,
      });
      router.push("/#app");
      router.refresh();
    } catch {
      setError("演示登录写入失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="shadow-input mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 md:p-8"
      data-testid={isSignup ? "signup-form" : "login-form"}
    >
      <p className="text-xs font-medium tracking-[0.18em] text-zinc-400 uppercase">PAGEBOND</p>
      <h1 className="mt-2 text-xl font-bold text-paper md:text-2xl">
        {isSignup ? "注册 Pagebond" : "登录 Pagebond"}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        {isSignup
          ? "创建演示账号。当前为本地占位，不会写入服务器。"
          : "使用演示账号进入工作台。当前为本地占位。"}
      </p>
      <p className="mt-2 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-200/90">
        {DEMO_LABEL} · 非正式账户
      </p>

      <form className="my-8" onSubmit={handleSubmit} noValidate>
        {isSignup ? (
          <LabelInputContainer className="mb-4">
            <Label htmlFor="name" className={darkLabel}>
              昵称
            </Label>
            <Input
              id="name"
              name="name"
              autoComplete="nickname"
              placeholder="你的称呼"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={darkInput}
              data-testid="auth-name"
            />
          </LabelInputContainer>
        ) : null}
        <LabelInputContainer className="mb-4">
          <Label htmlFor="email" className={darkLabel}>
            邮箱
          </Label>
          <Input
            id="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={darkInput}
            data-testid="auth-email"
          />
        </LabelInputContainer>
        <LabelInputContainer className="mb-6">
          <Label htmlFor="password" className={darkLabel}>
            密码
          </Label>
          <Input
            id="password"
            name="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={darkInput}
            data-testid="auth-password"
          />
        </LabelInputContainer>

        {error ? (
          <p role="alert" className="mb-4 text-sm text-red-300" data-testid="auth-error">
            {error}
          </p>
        ) : null}

        <button
          className="group/btn relative block h-11 w-full cursor-pointer rounded-md bg-zinc-800 font-medium text-paper transition hover:bg-zinc-700 disabled:opacity-60"
          type="submit"
          disabled={busy}
          data-testid="auth-submit"
        >
          {isSignup ? "注册 →" : "登录 →"}
          <BottomGradient />
        </button>

        <p className="mt-6 text-center text-sm text-zinc-400">
          {isSignup ? (
            <>
              已有账号？{" "}
              <Link href="/login" className="text-sky-400 hover:underline" data-testid="auth-switch-login">
                去登录
              </Link>
            </>
          ) : (
            <>
              还没有账号？{" "}
              <Link href="/signup" className="text-sky-400 hover:underline" data-testid="auth-switch-signup">
                去注册
              </Link>
            </>
          )}
        </p>
        <p className="mt-3 text-center text-xs text-zinc-500">
          <Link href="/#app" className="hover:text-zinc-300">
            返回工作台
          </Link>
          {" · "}
          TODO: Postgres 用户与正式鉴权（无 Stripe）
        </p>
      </form>
    </div>
  );
}

const BottomGradient = () => (
  <>
    <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
    <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
  </>
);

const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex w-full flex-col gap-2", className)}>{children}</div>
);
