"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";
import type { PlanWeekResponse, WeeklyGoalRead } from "@/lib/types";

type GoalStatus = "draft" | "active" | "completed";

type WeeklyGoalCreatePayload = {
  title: string;
  description: string;
  week_start_date: string;
  status: GoalStatus;
};

const statusBadgeClass: Record<GoalStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
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

  const weeklyGoalsQuery = useQuery({
    queryKey: ["weekly-goals"],
    queryFn: () => apiGet<WeeklyGoalRead[]>("/api/weekly-goals"),
  });

  const createGoalMutation = useMutation({
    mutationFn: (payload: WeeklyGoalCreatePayload) =>
      apiPost<WeeklyGoalRead>("/api/weekly-goals", payload),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setWeekStartDate("");
      setStatus("draft");
      setCreateError(null);
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

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (!title.trim() || !description.trim() || !weekStartDate) {
      setCreateError("请完整填写标题、描述和周起始日期");
      return;
    }

    await createGoalMutation.mutateAsync({
      title: title.trim(),
      description: description.trim(),
      week_start_date: weekStartDate,
      status,
    });
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

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">周目标管理</h1>
        <p className="mt-1 text-slate-600">
          创建周目标并基于“开始执行日”生成本周工作日（周一至周五）计划。
        </p>

        <form className="mt-6 grid gap-4" onSubmit={handleCreateGoal}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">标题</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              placeholder="例如：完成 FastAPI 进阶学习"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">描述</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              placeholder="描述你的整周目标、边界与期望产出"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                计划开始执行日
              </label>
              <input
                type="date"
                value={weekStartDate}
                onChange={(event) => setWeekStartDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">状态</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as GoalStatus)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
              </select>
            </div>
          </div>

          {createError ? <p className="text-sm text-rose-600">{createError}</p> : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createGoalMutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createGoalMutation.isPending ? "创建中..." : "创建周目标"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">周目标列表</h2>
        {weeklyGoalsQuery.isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            正在加载周目标...
          </div>
        ) : null}
        {weeklyGoalsQuery.isError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">
            加载失败：{weeklyGoalsQuery.error instanceof Error ? weeklyGoalsQuery.error.message : "未知错误"}
          </div>
        ) : null}
        {!weeklyGoalsQuery.isLoading &&
        !weeklyGoalsQuery.isError &&
        sortedGoals.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            暂无周目标，请先创建一个。
          </div>
        ) : null}

        <div className="grid gap-4">
          {sortedGoals.map((goal) => (
            <article
              key={goal.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{goal.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{goal.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    开始执行日：{goal.week_start_date}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[goal.status]}`}
                >
                  {goal.status}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {(() => {
                  const generatingThisGoal =
                    generatePlanMutation.isPending &&
                    generatePlanMutation.variables === goal.id;
                  const generationStatus = generatingThisGoal
                    ? "generating"
                    : goal.generation_status;
                  const generationLabel =
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
                    <>
                      <button
                        type="button"
                        onClick={() => void handleGenerate(goal)}
                        disabled={disableGenerate}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {generationLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/plans/${goal.id}`)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        查看计划
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        disabled={disableDelete}
                        className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deleteGoalMutation.isPending && deleteGoalMutation.variables === goal.id
                          ? "删除中..."
                          : "删除"}
                      </button>
                    </>
                  );
                })()}
              </div>

              {goal.generation_status === "generating" ? (
                <p className="mt-3 text-xs text-blue-700">
                  计划正在生成中，刷新或切换页面后仍会保持该状态。
                </p>
              ) : null}
              {goal.generation_status === "failed" && goal.generation_error ? (
                <p className="mt-3 text-xs text-rose-700">
                  上次生成失败：{goal.generation_error}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
