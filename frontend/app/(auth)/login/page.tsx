"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";

type SubmitState = "idle" | "submitting";

const storyPillars = [
  "目标定义：明确本周产出边界",
  "计划生成：自动拆解到工作日",
  "执行跟踪：实时更新任务与状态",
  "复盘验收：结果可衡量、可沉淀",
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const submitLabel = useMemo(() => {
    return submitState === "submitting" ? "验证中..." : "登录并继续执行";
  }, [submitState]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/goals");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitState("submitting");
    try {
      await login(email.trim(), password);
      router.push("/goals");
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败，请重试";
      setError(message);
      setSubmitState("idle");
    }
  }

  return (
    <main className="brand-shell min-h-screen px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_minmax(320px,430px)] lg:items-center">
        <section className="brand-card p-6 sm:p-8">
          <span className="story-chip">Welcome Back</span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[color:var(--color-graphite-950)] sm:text-4xl">
            回到你的交付节奏，
            <br className="hidden sm:block" />
            继续把计划变成结果。
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--color-graphite-700)] sm:text-base">
            登录后可继续查看周目标、更新每日任务状态，并根据验收标准判断本周进展。
            DailyPlan 会把目标、计划、执行、复盘串成一条可持续优化的工作链路。
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {storyPillars.map((item, index) => (
              <article
                key={item}
                className="rounded-2xl border border-[rgba(26,42,45,0.14)] bg-[rgba(255,255,255,0.85)] p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-graphite-500)]">
                  0{index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-graphite-700)]">
                  {item}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(26,42,45,0.12)] bg-[rgba(245,250,248,0.9)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-graphite-500)]">
              Daily snapshot
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xl font-semibold text-[color:var(--color-graphite-950)]">6.8h</p>
                <p className="text-xs text-[color:var(--color-graphite-700)]">平均日执行工时</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-[color:var(--color-graphite-950)]">82%</p>
                <p className="text-xs text-[color:var(--color-graphite-700)]">任务按期完成率</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-[color:var(--color-graphite-950)]">3.2x</p>
                <p className="text-xs text-[color:var(--color-graphite-700)]">复盘效率提升</p>
              </div>
            </div>
          </div>
        </section>

        <section className="brand-card">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-graphite-500)]">
            登录账号
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--color-graphite-950)]">继续本周计划</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-graphite-700)]">
            使用你的账号进入周目标看板，继续推进本周交付。
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-[color:var(--color-graphite-700)]">
                邮箱
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="brand-input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[color:var(--color-graphite-700)]">
                密码
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="brand-input"
                placeholder="请输入密码"
              />
            </div>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={submitState === "submitting"} className="brand-btn w-full">
              {submitLabel}
            </button>
          </form>

          <p className="mt-5 text-sm text-[color:var(--color-graphite-700)]">
            还没有账号？
            <Link
              href="/register"
              className="ml-1 font-semibold text-[color:var(--color-graphite-950)] underline decoration-[rgba(62,200,164,0.7)] underline-offset-4"
            >
              去注册
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
