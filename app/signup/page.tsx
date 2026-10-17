import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "注册 · PAGEBOND",
  description: "注册 Pagebond 演示账号（本地占位）。",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-16">
      <AuthForm mode="signup" />
    </main>
  );
}
