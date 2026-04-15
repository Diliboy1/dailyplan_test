"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";

type SubmitState = "idle" | "submitting" | "success";

const processSteps = [
  {
    title: "目标",
    description: "输入你真正想交付的周目标，定义完成边界。",
  },
  {
    title: "计划",
    description: "系统将目标拆成可执行的工作日任务，不再空转。",
  },
  {
    title: "执行",
    description: "每天按优先级推进任务，实时更新状态与阻塞项。",
  },
  {
    title: "复盘",
    description: "用验收标准判断结果，把本周经验沉淀成下周优势。",
  },
] as const;

const trustSignals = [
  {
    label: "本周已生成计划",
    value: "12,384",
    suffix: "份",
    description: "覆盖研发、运营、产品团队的工作周。",
  },
  {
    label: "目标拆解准确率",
    value: "93",
    suffix: "%",
    description: "用户反馈“任务更具体可做，不再停留在想法”。",
  },
  {
    label: "平均节省规划时间",
    value: "4.1",
    suffix: "小时/周",
    description: "把更多时间还给真正的执行与交付。",
  },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const isBusy = submitState === "submitting" || submitState === "success";

  const submitLabel = useMemo(() => {
    if (submitState === "submitting") {
      return "正在创建你的计划系统...";
    }
    if (submitState === "success") {
      return "创建成功，正在进入周目标";
    }
    return "注册并开始本周交付";
  }, [submitState]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/goals");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("密码长度至少 8 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitState("submitting");
    try {
      await register(email.trim(), password);
      setSubmitState("success");
      window.setTimeout(() => {
        router.push("/goals");
      }, 720);
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败，请重试";
      setError(message);
      setSubmitState("idle");
    }
  }

  return (
    <main className="brand-shell min-h-screen px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="brand-card overflow-hidden p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-end">
            <div>
              <span className="story-chip">DailyPlan Product Story</span>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[color:var(--color-graphite-950)] sm:text-4xl">
                把“想做完”变成“本周可交付”。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--color-graphite-700)] sm:text-base">
                DailyPlan 不是又一个待办清单，而是把周目标转成可执行日计划的工作系统。
                从目标拆解、执行推进到验收复盘，让每周产出不再靠意志力。
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[rgba(26,42,45,0.12)] bg-[rgba(255,255,255,0.72)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-graphite-500)]">
                    产品收益
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--color-graphite-700)]">
                    每天知道做什么、先做什么、做到什么程度算完成。
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(26,42,45,0.12)] bg-[rgba(255,255,255,0.72)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-graphite-500)]">
                    业务价值
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--color-graphite-700)]">
                    让计划服务交付，减少无效忙碌，提高团队节奏一致性。
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="relative hidden lg:block">
                <div className="story-flow-line absolute left-10 right-10 top-[41px] h-[2px] rounded-full bg-[rgba(62,200,164,0.45)]" />
                <div className="grid grid-cols-4 gap-3">
                  {processSteps.map((step, index) => (
                    <article
                      key={step.title}
                      className="story-flow-node rounded-2xl border border-[rgba(26,42,45,0.16)] bg-[rgba(255,255,255,0.85)] p-3"
                      style={{ animationDelay: `${index * 0.7}s` }}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(62,200,164,0.2)] text-sm font-semibold text-[color:var(--color-graphite-950)]">
                        {index + 1}
                      </span>
                      <h2 className="mt-3 text-sm font-semibold text-[color:var(--color-graphite-950)]">
                        {step.title}
                      </h2>
                      <p className="mt-1 text-xs leading-6 text-[color:var(--color-graphite-700)]">
                        {step.description}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto pb-2 lg:hidden">
                {processSteps.map((step, index) => (
                  <article
                    key={step.title}
                    className="min-w-[78%] snap-center rounded-2xl border border-[rgba(26,42,45,0.16)] bg-[rgba(255,255,255,0.9)] p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-graphite-500)]">
                      STEP {index + 1}
                    </p>
                    <h2 className="mt-2 text-base font-semibold text-[color:var(--color-graphite-950)]">
                      {step.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--color-graphite-700)]">
                      {step.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(300px,410px)_1fr]">
          <div className="brand-card">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-graphite-500)]">
              创建账号
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[color:var(--color-graphite-950)]">
              现在开始你的执行闭环
            </h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-graphite-700)]">
              输入邮箱和密码，1 分钟内就能得到可执行的本周计划视图。
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
                  placeholder="至少 8 位"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[color:var(--color-graphite-700)]">
                  确认密码
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="brand-input"
                  placeholder="再次输入密码"
                />
              </div>

              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isBusy}
                data-state={submitState === "success" ? "success" : undefined}
                className="brand-btn w-full"
              >
                {submitLabel}
              </button>
            </form>

            <p className="mt-5 text-sm text-[color:var(--color-graphite-700)]">
              已有账号？
              <Link
                href="/login"
                className="ml-1 font-semibold text-[color:var(--color-graphite-950)] underline decoration-[rgba(62,200,164,0.7)] underline-offset-4"
              >
                去登录
              </Link>
            </p>
          </div>

          <div className="brand-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[color:var(--color-graphite-950)]">
                为什么团队选择 DailyPlan
              </h2>
              <span className="story-chip">Social Proof</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {trustSignals.map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-[rgba(26,42,45,0.14)] bg-[rgba(245,250,248,0.9)] p-4"
                >
                  <p className="text-xs text-[color:var(--color-graphite-500)]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--color-graphite-950)]">
                    {item.value}
                    <span className="ml-1 text-sm text-[color:var(--color-graphite-700)]">
                      {item.suffix}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--color-graphite-700)]">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <blockquote className="rounded-2xl border border-[rgba(26,42,45,0.12)] bg-white/80 p-4 text-sm leading-7 text-[color:var(--color-graphite-700)]">
                “以前周计划都是愿望清单。现在每项任务都带验收标准，周会汇报变得非常清晰。”
                <footer className="mt-2 text-xs text-[color:var(--color-graphite-500)]">
                  —— 某 SaaS 产品团队负责人
                </footer>
              </blockquote>
              <div className="rounded-2xl border border-[rgba(26,42,45,0.12)] bg-white/80 p-4">
                <p className="text-sm font-semibold text-[color:var(--color-graphite-950)]">
                  你将立即获得
                </p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-[color:var(--color-graphite-700)]">
                  <li>• 周目标自动拆解成工作日任务</li>
                  <li>• 每日主题、优先级、工时可手动编辑</li>
                  <li>• 验收标准可持续更新，执行结果可追踪</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
