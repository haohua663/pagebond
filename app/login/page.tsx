import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "登录 · PAGEBOND",
  description: "登录 Pagebond 演示账号（本地占位）。",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-16">
      <AuthForm mode="login" />
    </main>
  );
}
