"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPatch } from "@/lib/api";
import type { DailyPlanRead, DailyTaskRead, PlanWeekResponse } from "@/lib/types";

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
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planDraft, setPlanDraft] = useState({ theme: "", buffer_percent: 20 });
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskDraft, setTaskDraft] = useState({
    description: "",
    estimated_hours: "1",
    priority: "medium" as DailyTaskRead["priority"],
  });

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

  const updateDailyPlanMutation = useMutation({
    mutationFn: ({
      dailyPlanId,
      theme,
      buffer_percent,
    }: {
      dailyPlanId: number;
      theme: string;
      buffer_percent: number;
    }) =>
      apiPatch<DailyPlanRead>(`/api/daily-plans/${dailyPlanId}`, {
        theme: theme.trim() || null,
        buffer_percent,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-week", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["progress", goalId] });
      setEditingPlanId(null);
    },
  });

  const updateTaskContentMutation = useMutation({
    mutationFn: ({
      taskId,
      description,
      estimated_hours,
      priority,
    }: {
      taskId: number;
      description: string;
      estimated_hours: number;
      priority: DailyTaskRead["priority"];
    }) =>
      apiPatch<DailyTaskRead>(`/api/tasks/${taskId}/content`, {
        description: description.trim(),
        estimated_hours,
        priority,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-week", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["progress", goalId] });
      setEditingTaskId(null);
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

  function beginEditPlan(day: DailyPlanRead) {
    setEditingTaskId(null);
    setEditingPlanId(day.id);
    setPlanDraft({
      theme: day.theme ?? "",
      buffer_percent: day.buffer_percent,
    });
  }

  function cancelEditPlan() {
    setEditingPlanId(null);
  }

  async function savePlan(dailyPlanId: number) {
    if (planDraft.buffer_percent < 0 || planDraft.buffer_percent > 100) {
      alert("缓冲比例需在 0–100 之间");
      return;
    }
    try {
      await updateDailyPlanMutation.mutateAsync({
        dailyPlanId,
        theme: planDraft.theme,
        buffer_percent: planDraft.buffer_percent,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    }
  }

  function beginEditTask(task: DailyTaskRead) {
    setEditingPlanId(null);
    setEditingTaskId(task.id);
    setTaskDraft({
      description: task.description,
      estimated_hours: String(task.estimated_hours),
      priority: task.priority,
    });
  }

  function cancelEditTask() {
    setEditingTaskId(null);
  }

  async function saveTask(taskId: number) {
    const hours = Number(taskDraft.estimated_hours);
    if (!taskDraft.description.trim()) {
      alert("任务描述不能为空");
      return;
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      alert("预计工时须为大于 0 的数字");
      return;
    }
    try {
      await updateTaskContentMutation.mutateAsync({
        taskId,
        description: taskDraft.description,
        estimated_hours: hours,
        priority: taskDraft.priority,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    }
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
            {editingPlanId === day.id ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  {day.date} · {weekdayMap[day.day_of_week] ?? "未知星期"}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">当日主题</span>
                    <input
                      type="text"
                      value={planDraft.theme}
                      onChange={(event) =>
                        setPlanDraft((draft) => ({ ...draft, theme: event.target.value }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="主题（可留空）"
                    />
                  </label>
                  <label className="flex w-28 flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">缓冲比例 %</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={planDraft.buffer_percent}
                      onChange={(event) =>
                        setPlanDraft((draft) => ({
                          ...draft,
                          buffer_percent: Number(event.target.value),
                        }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void savePlan(day.id)}
                    disabled={
                      updateDailyPlanMutation.isPending || updateTaskContentMutation.isPending
                    }
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateDailyPlanMutation.isPending ? "保存中..." : "保存"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditPlan}
                    disabled={updateDailyPlanMutation.isPending}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {day.date} · {weekdayMap[day.day_of_week] ?? "未知星期"}
                    {day.theme ? ` · ${day.theme}` : ""}
                  </h2>
                  <p className="text-xs text-slate-500">缓冲比例：{day.buffer_percent}%</p>
                </div>
                <button
                  type="button"
                  onClick={() => beginEditPlan(day)}
                  disabled={
                    updateDailyPlanMutation.isPending ||
                    updateTaskContentMutation.isPending ||
                    editingTaskId !== null
                  }
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  编辑日主题
                </button>
              </div>
            )}
          </header>

          <div className="space-y-3">
            {day.daily_tasks
              .slice()
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => {
                const expanded = expandedTaskIds[task.id] ?? false;
                const isCompleted = task.status === "completed";
                const isEditingTask = editingTaskId === task.id;
                const savingThisTask =
                  updateTaskContentMutation.isPending &&
                  updateTaskContentMutation.variables?.taskId === task.id;
                const lockRowForOtherEdit =
                  editingPlanId !== null ||
                  (editingTaskId !== null && editingTaskId !== task.id);
                const saveContentLocked =
                  updateDailyPlanMutation.isPending ||
                  savingThisTask ||
                  updateTaskStatusMutation.isPending ||
                  updateCriteriaMutation.isPending;

                return (
                  <article
                    key={task.id}
                    className={`rounded-lg border p-4 ${taskStyleMap[task.status] ?? "bg-white border-slate-200"}`}
                  >
                    {isEditingTask ? (
                      <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-600">
                          任务描述
                          <textarea
                            value={taskDraft.description}
                            onChange={(event) =>
                              setTaskDraft((draft) => ({
                                ...draft,
                                description: event.target.value,
                              }))
                            }
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                          />
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            预计工时（小时）
                            <input
                              type="number"
                              min={0.1}
                              step={0.5}
                              value={taskDraft.estimated_hours}
                              onChange={(event) =>
                                setTaskDraft((draft) => ({
                                  ...draft,
                                  estimated_hours: event.target.value,
                                }))
                              }
                              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            优先级
                            <select
                              value={taskDraft.priority}
                              onChange={(event) =>
                                setTaskDraft((draft) => ({
                                  ...draft,
                                  priority: event.target.value as DailyTaskRead["priority"],
                                }))
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            >
                              <option value="high">high</option>
                              <option value="medium">medium</option>
                              <option value="low">low</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void saveTask(task.id)}
                            disabled={saveContentLocked}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingThisTask ? "保存中..." : "保存"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTask}
                            disabled={savingThisTask}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
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

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => beginEditTask(task)}
                            disabled={
                              lockRowForOtherEdit ||
                              updateDailyPlanMutation.isPending ||
                              savingThisTask
                            }
                            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            编辑内容
                          </button>
                          <select
                            value={task.status}
                            onChange={(event) =>
                              void handleTaskStatusChange(task.id, event.target.value)
                            }
                            disabled={
                              isEditingTask ||
                              updateDailyPlanMutation.isPending ||
                              (updateTaskStatusMutation.isPending &&
                                updateTaskStatusMutation.variables?.taskId === task.id)
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="not_started">{statusLabelMap.not_started}</option>
                            <option value="in_progress">{statusLabelMap.in_progress}</option>
                            <option value="completed">{statusLabelMap.completed}</option>
                            <option value="blocked">{statusLabelMap.blocked}</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => toggleTaskExpand(task.id)}
                            disabled={isEditingTask || updateDailyPlanMutation.isPending}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {expanded ? "收起验收" : "展开验收"}
                          </button>
                        </div>
                      </div>
                    )}

                    {!isEditingTask && expanded ? (
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
