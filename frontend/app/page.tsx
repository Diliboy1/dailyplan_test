"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (isAuthenticated) {
      router.replace("/goals");
      return;
    }
    router.replace("/register");
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-[color:var(--color-graphite-700)]">
      正在进入 DailyPlan...
    </main>
  );
}
