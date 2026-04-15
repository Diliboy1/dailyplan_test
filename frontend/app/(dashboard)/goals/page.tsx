"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";
import type { PlanWeekResponse, WeeklyGoalRead } from "@/lib/types";

type GoalStatus = "draft" | "active" | "completed";
type GenerationStatusFilter = "all" | "idle" | "generating" | "completed" | "failed";

type WeeklyGoalCreatePayload = {
  title: string;
  description: string;
  week_start_date: string;
  status: GoalStatus;
};

const statusLabel: Record<GoalStatus, string> = {
  draft: "草稿",
  active: "进行中",
  completed: "已完成",
};

const statusBadgeClass: Record<GoalStatus, string> = {
  draft: "border border-slate-300/20 bg-slate-400/10 text-slate-200",
  active:
    "mission-badge-active border border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
  completed: "border border-sky-300/35 bg-sky-300/15 text-sky-100",
};

const generationLabel: Record<WeeklyGoalRead["generation_status"], string> = {
  idle: "未生成",
  generating: "生成中",
  completed: "已完成",
  failed: "失败",
};

const generationBadgeClass: Record<WeeklyGoalRead["generation_status"], string> = {
  idle: "border border-slate-300/20 bg-slate-400/10 text-slate-300",
  generating: "border border-cyan-300/35 bg-cyan-300/15 text-cyan-100",
  completed: "border border-emerald-300/35 bg-emerald-300/15 text-emerald-100",
  failed: "border border-rose-300/35 bg-rose-300/15 text-rose-100",
};

function getGenerateButtonText(goal: WeeklyGoalRead): string {
  if (goal.generation_status === "generating") {
    return "生成中...";
  }
  if (goal.generation_status === "completed") {
    return "已生成";
  }
  if (goal.generation_status === "failed") {
    return "重新生成";
  }
  return "生成计划";
}

export default function GoalsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weekStartDate, setWeekStartDate] = useState("");
  const [status, setStatus] = useState<GoalStatus>("draft");
  const [createError, setCreateError] = useState<string | null>(null);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [generationFilter, setGenerationFilter] = useState<GenerationStatusFilter>("all");
  const [recentCreatedGoalId, setRecentCreatedGoalId] = useState<number | null>(null);

  const weeklyGoalsQuery = useQuery({
    queryKey: ["weekly-goals"],
    queryFn: () => apiGet<WeeklyGoalRead[]>("/api/weekly-goals"),
  });

  useEffect(() => {
    if (recentCreatedGoalId === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRecentCreatedGoalId(null);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [recentCreatedGoalId]);

  const createGoalMutation = useMutation({
    mutationFn: (payload: WeeklyGoalCreatePayload) =>
      apiPost<WeeklyGoalRead>("/api/weekly-goals", payload),
    onSuccess: async (createdGoal) => {
      setTitle("");
      setDescription("");
      setWeekStartDate("");
      setStatus("draft");
      setCreateError(null);
      setRecentCreatedGoalId(createdGoal.id);
      await queryClient.invalidateQueries({ queryKey: ["weekly-goals"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "创建周目标失败";
      setCreateError(message);
    },
  });

  const generatePlanMutation = useMutation<
    PlanWeekResponse,
    unknown,
    number,
    { previousGoals?: WeeklyGoalRead[] }
  >({
    mutationFn: (goalId: number) =>
      apiPost<PlanWeekResponse>("/api/agent/plan-week", { weekly_goal_id: goalId }),
    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: ["weekly-goals"] });
      const previousGoals = queryClient.getQueryData<WeeklyGoalRead[]>(["weekly-goals"]);
      queryClient.setQueryData<WeeklyGoalRead[]>(["weekly-goals"], (goals) =>
        (goals ?? []).map((goal) =>
          goal.id === goalId
            ? {
                ...goal,
                generation_status: "generating",
                generation_error: null,
              }
            : goal,
        ),
      );
      return { previousGoals };
    },
    onError: (_error, _goalId, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["weekly-goals"], context.previousGoals);
      }
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["weekly-goals"] });
      router.push(`/plans/${data.weekly_goal_id}`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["weekly-goals"] });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: number) => apiDelete(`/api/weekly-goals/${goalId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["weekly-goals"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-week"] });
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });

  const sortedGoals = useMemo(() => {
    const goals = weeklyGoalsQuery.data ?? [];
    return [...goals].sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  }, [weeklyGoalsQuery.data]);

  const filteredGoals = useMemo(() => {
    const normalizedSearch = searchKeyword.trim().toLowerCase();

    return sortedGoals.filter((goal) => {
      if (statusFilter !== "all" && goal.status !== statusFilter) {
        return false;
      }

      if (generationFilter !== "all" && goal.generation_status !== generationFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        goal.title.toLowerCase().includes(normalizedSearch) ||
        goal.description.toLowerCase().includes(normalizedSearch) ||
        goal.week_start_date.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [generationFilter, searchKeyword, sortedGoals, statusFilter]);

  const overview = useMemo(() => {
    const goals = weeklyGoalsQuery.data ?? [];
    return {
      total: goals.length,
      active: goals.filter((goal) => goal.status === "active").length,
      generating: goals.filter((goal) => goal.generation_status === "generating").length,
    };
  }, [weeklyGoalsQuery.data]);

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (!title.trim() || !description.trim() || !weekStartDate) {
      setCreateError("请完整填写标题、描述和周起始日期");
      return;
    }

    try {
      await createGoalMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        week_start_date: weekStartDate,
        status,
      });
    } catch {
      // error message is handled in onError
    }
  }

  async function handleGenerate(goal: WeeklyGoalRead) {
    if (goal.generation_status === "completed") {
      router.push(`/plans/${goal.id}`);
      return;
    }
    if (goal.generation_status === "generating") {
      alert("该周目标正在生成计划，请稍后查看结果");
      return;
    }

    try {
      await generatePlanMutation.mutateAsync(goal.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ["weekly-goals"] });
        if (error.message.includes("生成中")) {
          alert("该周目标正在生成计划，请稍后查看结果");
          return;
        }
        if (error.message.includes("已生成过计划")) {
          alert("该周目标已生成过计划，请直接查看计划");
          router.push(`/plans/${goal.id}`);
          return;
        }
      }
      const message = error instanceof Error ? error.message : "生成计划失败";
      alert(message);
    }
  }

  function handleDeleteGoal(goalId: number) {
    if (
      !window.confirm(
        "确定删除该周目标？其下的日计划、任务与验收标准将一并删除，且不可恢复。",
      )
    ) {
      return;
    }
    deleteGoalMutation.mutate(goalId, {
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : "删除失败";
        alert(message);
      },
    });
  }

  function clearFilters() {
    setSearchKeyword("");
    setStatusFilter("all");
    setGenerationFilter("all");
  }

  return (
    <div className="-mx-6 -my-8 min-h-[calc(100vh-64px)] px-4 py-6 sm:px-6 sm:py-8">
      <section className="mission-shell rounded-[28px] p-4 sm:p-6 lg:p-7">
        <div className="relative z-10 space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs tracking-[0.14em] text-slate-300">
                Mission Control
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                周目标任务控制中枢
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                在同一个面板中创建目标、生成计划、跟踪状态与执行动作，让每周推进更清晰。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="mission-glass px-3 py-2 text-xs text-slate-300">
                总目标 <span className="ml-2 text-base font-semibold text-white">{overview.total}</span>
              </div>
              <div className="mission-glass px-3 py-2 text-xs text-slate-300">
                推进中 <span className="ml-2 text-base font-semibold text-emerald-200">{overview.active}</span>
              </div>
              <div className="mission-glass px-3 py-2 text-xs text-slate-300">
                生成中 <span className="ml-2 text-base font-semibold text-cyan-200">{overview.generating}</span>
              </div>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(300px,35%)_minmax(0,65%)]">
            <section className="lg:sticky lg:top-24 lg:self-start">
              <div className="mission-glass p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-white">创建周目标</h2>
                <p className="mt-1 text-sm text-slate-300">
                  先定义目标，再自动生成工作日计划。该面板会在桌面端保持可见。
                </p>

                <form className="mt-5 grid gap-4" onSubmit={handleCreateGoal}>
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-slate-300">
                      标题
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mission-input"
                      placeholder="例如：完成 AI 功能上线验收"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-slate-300">
                      描述
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      className="mission-input resize-none"
                      placeholder="描述本周目标、范围和期望交付。"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-slate-300">
                        开始执行日
                      </label>
                      <input
                        type="date"
                        value={weekStartDate}
                        onChange={(event) => setWeekStartDate(event.target.value)}
                        className="mission-input"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-slate-300">
                        目标状态
                      </label>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as GoalStatus)}
                        className="mission-input"
                      >
                        <option value="draft">draft</option>
                        <option value="active">active</option>
                        <option value="completed">completed</option>
                      </select>
                    </div>
                  </div>

                  {createError ? (
                    <p className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {createError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={createGoalMutation.isPending}
                    className="mission-btn-primary w-full"
                  >
                    {createGoalMutation.isPending ? "创建中..." : "创建周目标"}
                  </button>
                </form>
              </div>
            </section>

            <section className="space-y-4">
              <div className="mission-glass p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">目标列表</h2>
                  <p className="text-xs text-slate-300">共 {filteredGoals.length} 条结果</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_170px_auto]">
                  <input
                    type="search"
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    className="mission-input"
                    placeholder="搜索标题、描述或日期"
                  />

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as GoalStatus | "all")}
                    className="mission-input"
                  >
                    <option value="all">全部状态</option>
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                  </select>

                  <select
                    value={generationFilter}
                    onChange={(event) =>
                      setGenerationFilter(event.target.value as GenerationStatusFilter)
                    }
                    className="mission-input"
                  >
                    <option value="all">全部生成状态</option>
                    <option value="idle">未生成</option>
                    <option value="generating">生成中</option>
                    <option value="completed">已完成</option>
                    <option value="failed">失败</option>
                  </select>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mission-btn-secondary"
                  >
                    清空筛选
                  </button>
                </div>
              </div>

              {weeklyGoalsQuery.isLoading ? (
                <div className="mission-glass p-6 text-sm text-slate-200">正在加载周目标...</div>
              ) : null}

              {weeklyGoalsQuery.isError ? (
                <div className="mission-glass border-rose-400/30 p-6 text-sm text-rose-200">
                  加载失败：
                  {weeklyGoalsQuery.error instanceof Error
                    ? weeklyGoalsQuery.error.message
                    : "未知错误"}
                </div>
              ) : null}

              {!weeklyGoalsQuery.isLoading &&
              !weeklyGoalsQuery.isError &&
              filteredGoals.length === 0 ? (
                <div className="mission-glass p-6 text-sm text-slate-300">
                  暂无匹配的周目标，请调整筛选或先创建一个新目标。
                </div>
              ) : null}

              <div className="space-y-3">
                {filteredGoals.map((goal) => {
                  const generatingThisGoal =
                    generatePlanMutation.isPending &&
                    generatePlanMutation.variables === goal.id;
                  const generationStatus = generatingThisGoal
                    ? "generating"
                    : goal.generation_status;
                  const generationLabelText =
                    generationStatus === "generating"
                      ? "生成中..."
                      : getGenerateButtonText(goal);
                  const disableGenerate =
                    deleteGoalMutation.isPending ||
                    generatePlanMutation.isPending ||
                    generationStatus === "generating" ||
                    generationStatus === "completed";
                  const disableDelete =
                    deleteGoalMutation.isPending ||
                    generationStatus === "generating" ||
                    generatingThisGoal;

                  return (
                    <article
                      key={goal.id}
                      className={`mission-card ${
                        recentCreatedGoalId === goal.id ? "mission-card-enter" : ""
                      }`}
                    >
                      <div className="relative z-10">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-lg font-semibold text-white">{goal.title}</h3>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-300">{goal.description}</p>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[goal.status]}`}
                            >
                              {statusLabel[goal.status]}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${generationBadgeClass[generationStatus]}`}
                            >
                              {generationLabel[generationStatus]}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                          <span>开始执行日：{goal.week_start_date}</span>
                          <span>当前动作：{generationLabelText}</span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleGenerate(goal)}
                            disabled={disableGenerate}
                            className="mission-btn-primary"
                          >
                            {generationLabelText}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/plans/${goal.id}`)}
                            className="mission-btn-secondary"
                          >
                            查看计划
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGoal(goal.id)}
                            disabled={disableDelete}
                            className="inline-flex items-center justify-center rounded-xl border border-rose-300/35 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deleteGoalMutation.isPending && deleteGoalMutation.variables === goal.id
                              ? "删除中..."
                              : "删除"}
                          </button>
                        </div>

                        {goal.generation_status === "generating" ? (
                          <p className="mt-3 text-xs text-cyan-200">
                            计划正在生成中，切换页面后也会保持该状态。
                          </p>
                        ) : null}
                        {goal.generation_status === "failed" && goal.generation_error ? (
                          <p className="mt-3 text-xs text-rose-200">
                            上次生成失败：{goal.generation_error}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
