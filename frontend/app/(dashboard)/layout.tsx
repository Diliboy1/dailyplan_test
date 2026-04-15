"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, logout, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#0f1b1f_0%,#122227_100%)] text-sm text-slate-300">
        正在验证登录状态...
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0f1b1f_0%,#122227_100%)]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(10,20,24,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/goals" className="text-lg font-bold tracking-tight text-white">
              DailyPlan
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-300">
              <Link href="/goals" className="transition hover:text-white">
                周目标
              </Link>
              <Link href="/progress" className="transition hover:text-white">
                进度
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">{user?.email ?? "未登录用户"}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200 transition hover:border-[rgba(62,200,164,0.5)] hover:bg-[rgba(62,200,164,0.15)] hover:text-white"
            >
              登出
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
