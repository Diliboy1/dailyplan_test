"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPatch } from "@/lib/api";
import type { PlanWeekResponse } from "@/lib/types";

const weekdayMap: Record<number, string> = {
  0: "周一",
  1: "周二",
  2: "周三",
  3: "周四",
  4: "周五",
  5: "周六",
  6: "周日",
};

const statusLabelMap: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  blocked: "阻塞",
};

const taskStyleMap: Record<string, string> = {
  not_started: "bg-white border-slate-200",
  in_progress: "bg-blue-50 border-l-4 border-l-blue-500 border-slate-200",
  completed: "bg-emerald-50 border-slate-200",
  blocked: "bg-rose-50 border-l-4 border-l-rose-500 border-slate-200",
};

const priorityStyleMap: Record<string, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

export default function PlanBoardPage() {
  const params = useParams<{ goalId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const goalId = Number(params.goalId);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<number, boolean>>({});

  const planQuery = useQuery({
    queryKey: ["plan-week", goalId],
    queryFn: () => apiGet<PlanWeekResponse>(`/api/agent/plan-week/${goalId}`),
    enabled: Number.isFinite(goalId),
    retry: false,
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiPatch(`/api/tasks/${taskId}/status`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-week", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["progress", goalId] });
    },
  });

  const updateCriteriaMutation = useMutation({
    mutationFn: ({
      taskId,
      criterionId,
      isMet,
    }: {
      taskId: number;
      criterionId: number;
      isMet: boolean;
    }) => apiPatch(`/api/tasks/${taskId}/criteria/${criterionId}`, { is_met: isMet }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-week", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["progress", goalId] });
    },
  });

  const sortedDays = useMemo(() => {
    return [...(planQuery.data?.days ?? [])].sort((a, b) => a.day_of_week - b.day_of_week);
  }, [planQuery.data?.days]);

  function toggleTaskExpand(taskId: number) {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  async function handleTaskStatusChange(taskId: number, status: string) {
    await updateTaskStatusMutation.mutateAsync({ taskId, status });
  }

  async function handleCriterionToggle(
    taskId: number,
    criterionId: number,
    nextValue: boolean,
  ) {
    await updateCriteriaMutation.mutateAsync({ taskId, criterionId, isMet: nextValue });
  }

  if (planQuery.isLoading) {
    return (
      <main className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
        正在加载计划...
      </main>
    );
  }

  if (planQuery.isError) {
    const message = planQuery.error instanceof Error ? planQuery.error.message : "加载失败";
    const isNotFound =
      message.toLowerCase().includes("not found") || message.includes("找不到");

    if (isNotFound) {
      return (
        <main className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">暂无计划数据</h1>
          <p className="mt-2 text-slate-600">该周目标尚未生成计划，请先返回周目标页执行生成。</p>
          <button
            type="button"
            onClick={() => router.push("/goals")}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            返回周目标
          </button>
        </main>
      );
    }

    return (
      <main className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">
        加载失败：{message}
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">日计划看板</h1>
        <p className="mt-1 text-slate-600">按天执行任务，实时更新状态与验收标准达成情况。</p>
      </header>

      {sortedDays.map((day) => (
        <section key={day.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-4 border-b border-slate-100 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {day.date} · {weekdayMap[day.day_of_week] ?? "未知星期"}
              {day.theme ? ` · ${day.theme}` : ""}
            </h2>
            <p className="text-xs text-slate-500">缓冲比例：{day.buffer_percent}%</p>
          </header>

          <div className="space-y-3">
            {day.daily_tasks
              .slice()
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => {
                const expanded = expandedTaskIds[task.id] ?? false;
                const isCompleted = task.status === "completed";
                return (
                  <article
                    key={task.id}
                    className={`rounded-lg border p-4 ${taskStyleMap[task.status] ?? "bg-white border-slate-200"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              priorityStyleMap[task.priority] ?? "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {task.priority}
                          </span>
                          <span className="text-xs text-slate-500">
                            预计 {task.estimated_hours} 小时
                          </span>
                        </div>
                        <p
                          className={`mt-2 text-sm ${
                            isCompleted ? "text-slate-500 line-through" : "text-slate-800"
                          }`}
                        >
                          {task.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={task.status}
                          onChange={(event) =>
                            void handleTaskStatusChange(task.id, event.target.value)
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500"
                        >
                          <option value="not_started">{statusLabelMap.not_started}</option>
                          <option value="in_progress">{statusLabelMap.in_progress}</option>
                          <option value="completed">{statusLabelMap.completed}</option>
                          <option value="blocked">{statusLabelMap.blocked}</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => toggleTaskExpand(task.id)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          {expanded ? "收起验收" : "展开验收"}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <ul className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                        {task.acceptance_criteria.map((criterion) => (
                          <li
                            key={criterion.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                              <input
                                type="checkbox"
                                checked={criterion.is_met}
                                onChange={(event) =>
                                  void handleCriterionToggle(
                                    task.id,
                                    criterion.id,
                                    event.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                              />
                              <span>
                                {criterion.metric_name}（{criterion.target_value}
                                {criterion.unit ?? ""}）
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
