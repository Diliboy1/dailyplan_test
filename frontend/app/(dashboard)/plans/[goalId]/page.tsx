"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  AcceptanceCriteriaCreateInput,
  AcceptanceCriteriaRead,
  AcceptanceCriteriaContentUpdateInput,
  DailyPlanRead,
  DailyTaskRead,
  PlanWeekResponse,
  TaskCreateInput,
  WeeklyGoalRead,
} from "@/lib/types";

const weekdayMap: Record<number, string> = {
  0: "周一",
  1: "周二",
  2: "周三",
  3: "周四",
  4: "周五",
  5: "周六",
  6: "周日",
};

const statusLabelMap: Record<DailyTaskRead["status"], string> = {
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

type CriterionDraft = {
  metric_name: string;
  target_value: string;
  unit: string;
};

type CreateTaskDraft = {
  description: string;
  priority: DailyTaskRead["priority"];
  estimated_hours: string;
  status: DailyTaskRead["status"];
  acceptance_criteria: CriterionDraft[];
};

const emptyCriterionDraft = (): CriterionDraft => ({
  metric_name: "",
  target_value: "",
  unit: "",
});

const emptyCreateTaskDraft = (): CreateTaskDraft => ({
  description: "",
  estimated_hours: "1",
  priority: "medium",
  status: "not_started",
  acceptance_criteria: [emptyCriterionDraft()],
});

function normalizeCriterionDraft(
  draft: CriterionDraft,
): AcceptanceCriteriaCreateInput | null {
  const metric_name = draft.metric_name.trim();
  const target_value = draft.target_value.trim();
  const unit = draft.unit.trim();

  if (!metric_name && !target_value && !unit) {
    return null;
  }

  if (!metric_name || !target_value) {
    throw new Error("每条验收标准都需要填写“指标名称”和“目标值”");
  }

  return {
    metric_name,
    target_value,
    unit: unit || null,
  };
}

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

  const [creatingTaskDayId, setCreatingTaskDayId] = useState<number | null>(null);
  const [createTaskDraft, setCreateTaskDraft] = useState<CreateTaskDraft>(
    emptyCreateTaskDraft(),
  );

  const [editingCriterionId, setEditingCriterionId] = useState<number | null>(null);
  const [criterionDraft, setCriterionDraft] = useState<CriterionDraft>(
    emptyCriterionDraft(),
  );

  const [creatingCriterionTaskId, setCreatingCriterionTaskId] = useState<number | null>(null);
  const [newCriterionDraft, setNewCriterionDraft] = useState<CriterionDraft>(
    emptyCriterionDraft(),
  );

  const goalQuery = useQuery({
    queryKey: ["weekly-goal", goalId],
    queryFn: () => apiGet<WeeklyGoalRead>(`/api/weekly-goals/${goalId}`),
    enabled: Number.isFinite(goalId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.generation_status === "generating" ? 3000 : false,
  });

  const planQuery = useQuery({
    queryKey: ["plan-week", goalId],
    queryFn: () => apiGet<PlanWeekResponse>(`/api/agent/plan-week/${goalId}`),
    enabled: Number.isFinite(goalId),
    retry: false,
    refetchInterval: () =>
      goalQuery.data?.generation_status === "generating" ? 3000 : false,
  });

  const invalidatePlanRelatedQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["plan-week", goalId] });
    await queryClient.invalidateQueries({ queryKey: ["progress", goalId] });
  };

  const updateTaskStatusMutation = useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: number;
      status: DailyTaskRead["status"];
    }) => apiPatch(`/api/tasks/${taskId}/status`, { status }),
    onSuccess: invalidatePlanRelatedQueries,
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
      await invalidatePlanRelatedQueries();
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
      await invalidatePlanRelatedQueries();
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
    onSuccess: invalidatePlanRelatedQueries,
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: TaskCreateInput) => apiPost<DailyTaskRead>("/api/tasks", payload),
    onSuccess: async () => {
      await invalidatePlanRelatedQueries();
      setCreatingTaskDayId(null);
      setCreateTaskDraft(emptyCreateTaskDraft());
    },
  });

  const updateCriterionContentMutation = useMutation({
    mutationFn: ({
      taskId,
      criterionId,
      payload,
    }: {
      taskId: number;
      criterionId: number;
      payload: AcceptanceCriteriaContentUpdateInput;
    }) =>
      apiPatch<AcceptanceCriteriaRead>(
        `/api/tasks/${taskId}/criteria/${criterionId}/content`,
        payload,
      ),
    onSuccess: async () => {
      await invalidatePlanRelatedQueries();
      setEditingCriterionId(null);
      setCriterionDraft(emptyCriterionDraft());
    },
  });

  const createCriterionMutation = useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number;
      payload: AcceptanceCriteriaCreateInput;
    }) => apiPost<AcceptanceCriteriaRead>(`/api/tasks/${taskId}/criteria`, payload),
    onSuccess: async () => {
      await invalidatePlanRelatedQueries();
      setCreatingCriterionTaskId(null);
      setNewCriterionDraft(emptyCriterionDraft());
    },
  });

  const deleteCriterionMutation = useMutation({
    mutationFn: ({ taskId, criterionId }: { taskId: number; criterionId: number }) =>
      apiDelete(`/api/tasks/${taskId}/criteria/${criterionId}`),
    onSuccess: invalidatePlanRelatedQueries,
  });

  const sortedDays = useMemo(() => {
    return [...(planQuery.data?.days ?? [])].sort((a, b) => a.day_of_week - b.day_of_week);
  }, [planQuery.data?.days]);

  function toggleTaskExpand(taskId: number) {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  async function handleTaskStatusChange(taskId: number, status: DailyTaskRead["status"]) {
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
    setCreatingTaskDayId(null);
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
      alert("缓冲比例需在 0-100 之间");
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
    setCreatingTaskDayId(null);
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

  function beginCreateTask(dayId: number) {
    setEditingPlanId(null);
    setEditingTaskId(null);
    setEditingCriterionId(null);
    setCreatingCriterionTaskId(null);
    setCreatingTaskDayId(dayId);
    setCreateTaskDraft(emptyCreateTaskDraft());
  }

  function cancelCreateTask() {
    setCreatingTaskDayId(null);
    setCreateTaskDraft(emptyCreateTaskDraft());
  }

  function updateCreateTaskCriterion(
    index: number,
    field: keyof CriterionDraft,
    value: string,
  ) {
    setCreateTaskDraft((prev) => ({
      ...prev,
      acceptance_criteria: prev.acceptance_criteria.map((criterion, criterionIndex) =>
        criterionIndex === index ? { ...criterion, [field]: value } : criterion,
      ),
    }));
  }

  function addCreateTaskCriterion() {
    setCreateTaskDraft((prev) => ({
      ...prev,
      acceptance_criteria: [...prev.acceptance_criteria, emptyCriterionDraft()],
    }));
  }

  function removeCreateTaskCriterion(index: number) {
    setCreateTaskDraft((prev) => {
      if (prev.acceptance_criteria.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        acceptance_criteria: prev.acceptance_criteria.filter(
          (_, criterionIndex) => criterionIndex !== index,
        ),
      };
    });
  }

  async function saveCreateTask(dayId: number) {
    const description = createTaskDraft.description.trim();
    const hours = Number(createTaskDraft.estimated_hours);
    if (!description) {
      alert("任务描述不能为空");
      return;
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      alert("预计工时须为大于 0 的数字");
      return;
    }

    let normalizedCriteria: AcceptanceCriteriaCreateInput[];
    try {
      normalizedCriteria = createTaskDraft.acceptance_criteria
        .map((criterion) => normalizeCriterionDraft(criterion))
        .filter((criterion): criterion is AcceptanceCriteriaCreateInput => criterion !== null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "验收标准格式不正确");
      return;
    }

    if (normalizedCriteria.length === 0) {
      alert("请至少填写 1 条验收标准");
      return;
    }

    try {
      await createTaskMutation.mutateAsync({
        daily_plan_id: dayId,
        description,
        priority: createTaskDraft.priority,
        estimated_hours: hours,
        status: createTaskDraft.status,
        acceptance_criteria: normalizedCriteria,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "新增任务失败");
    }
  }

  function beginEditCriterion(taskId: number, criterion: AcceptanceCriteriaRead) {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: true }));
    setCreatingCriterionTaskId(null);
    setEditingCriterionId(criterion.id);
    setCriterionDraft({
      metric_name: criterion.metric_name,
      target_value: criterion.target_value,
      unit: criterion.unit ?? "",
    });
  }

  function cancelEditCriterion() {
    setEditingCriterionId(null);
    setCriterionDraft(emptyCriterionDraft());
  }

  async function saveCriterionContent(taskId: number, criterionId: number) {
    const metricName = criterionDraft.metric_name.trim();
    const targetValue = criterionDraft.target_value.trim();
    const unit = criterionDraft.unit.trim();

    if (!metricName || !targetValue) {
      alert("指标名称和目标值不能为空");
      return;
    }

    const payload: AcceptanceCriteriaContentUpdateInput = {
      metric_name: metricName,
      target_value: targetValue,
      unit: unit || null,
    };

    try {
      await updateCriterionContentMutation.mutateAsync({
        taskId,
        criterionId,
        payload,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "更新验收标准失败");
    }
  }

  function beginCreateCriterion(taskId: number) {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: true }));
    setEditingCriterionId(null);
    setCreatingCriterionTaskId(taskId);
    setNewCriterionDraft(emptyCriterionDraft());
  }

  function cancelCreateCriterion() {
    setCreatingCriterionTaskId(null);
    setNewCriterionDraft(emptyCriterionDraft());
  }

  async function saveCreateCriterion(taskId: number) {
    const metricName = newCriterionDraft.metric_name.trim();
    const targetValue = newCriterionDraft.target_value.trim();
    const unit = newCriterionDraft.unit.trim();

    if (!metricName || !targetValue) {
      alert("指标名称和目标值不能为空");
      return;
    }

    try {
      await createCriterionMutation.mutateAsync({
        taskId,
        payload: {
          metric_name: metricName,
          target_value: targetValue,
          unit: unit || null,
        },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "新增验收标准失败");
    }
  }

  async function handleDeleteCriterion(taskId: number, criterionId: number) {
    if (!window.confirm("确定删除该条验收标准吗？删除后不可恢复。")) {
      return;
    }

    try {
      await deleteCriterionMutation.mutateAsync({ taskId, criterionId });
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除验收标准失败");
    }
  }

  if (goalQuery.isLoading || planQuery.isLoading) {
    return (
      <main className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
        正在加载计划...
      </main>
    );
  }

  if (goalQuery.isError) {
    const message = goalQuery.error instanceof Error ? goalQuery.error.message : "加载失败";
    return (
      <main className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">
        周目标加载失败：{message}
      </main>
    );
  }

  if (planQuery.isError) {
    const message = planQuery.error instanceof Error ? planQuery.error.message : "加载失败";
    const isNotFound =
      (planQuery.error instanceof ApiError && planQuery.error.status === 404) ||
      message.toLowerCase().includes("not found") ||
      message.includes("找不到");
    const generationStatus = goalQuery.data?.generation_status;

    if (isNotFound) {
      if (generationStatus === "generating") {
        return (
          <main className="rounded-xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-blue-900">计划正在生成中</h1>
            <p className="mt-2 text-blue-800">
              已收到生成请求，系统正在处理。页面会自动轮询刷新，也可以稍后再回来查看。
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => void planQuery.refetch()}
                className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-800 hover:bg-blue-100"
              >
                立即刷新
              </button>
              <button
                type="button"
                onClick={() => router.push("/goals")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                返回周目标
              </button>
            </div>
          </main>
        );
      }
      if (generationStatus === "failed") {
        return (
          <main className="rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-rose-900">计划生成失败</h1>
            <p className="mt-2 text-rose-800">
              {goalQuery.data?.generation_error ?? "请返回周目标页重试生成计划。"}
            </p>
            <button
              type="button"
              onClick={() => router.push("/goals")}
              className="mt-4 rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-100"
            >
              返回周目标重试
            </button>
          </main>
        );
      }
      return (
        <main className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">暂无计划数据</h1>
          <p className="mt-2 text-slate-600">
            该周目标尚未生成计划，请先返回周目标页执行生成。
          </p>
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

      {sortedDays.map((day) => {
        const isBeforeStartDate = goalQuery.data
          ? day.date < goalQuery.data.week_start_date
          : false;
        const isWeekend = day.day_of_week >= 5;
        const creatingTaskForThisDay = creatingTaskDayId === day.id;
        const createTaskSavingForThisDay =
          createTaskMutation.isPending &&
          createTaskMutation.variables?.daily_plan_id === day.id;

        return (
          <section
            key={day.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => beginCreateTask(day.id)}
                      disabled={
                        updateDailyPlanMutation.isPending ||
                        updateTaskContentMutation.isPending ||
                        createTaskMutation.isPending
                      }
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      新增任务
                    </button>
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
                </div>
              )}
            </header>

            <div className="space-y-3">
              {creatingTaskForThisDay ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-slate-600">
                      任务描述
                      <textarea
                        value={createTaskDraft.description}
                        onChange={(event) =>
                          setCreateTaskDraft((draft) => ({
                            ...draft,
                            description: event.target.value,
                          }))
                        }
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        placeholder="填写任务描述"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                        优先级
                        <select
                          value={createTaskDraft.priority}
                          onChange={(event) =>
                            setCreateTaskDraft((draft) => ({
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

                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                        预计工时（小时）
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={createTaskDraft.estimated_hours}
                          onChange={(event) =>
                            setCreateTaskDraft((draft) => ({
                              ...draft,
                              estimated_hours: event.target.value,
                            }))
                          }
                          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                        初始状态
                        <select
                          value={createTaskDraft.status}
                          onChange={(event) =>
                            setCreateTaskDraft((draft) => ({
                              ...draft,
                              status: event.target.value as DailyTaskRead["status"],
                            }))
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        >
                          <option value="not_started">{statusLabelMap.not_started}</option>
                          <option value="in_progress">{statusLabelMap.in_progress}</option>
                          <option value="completed">{statusLabelMap.completed}</option>
                          <option value="blocked">{statusLabelMap.blocked}</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-600">验收标准</p>
                        <button
                          type="button"
                          onClick={addCreateTaskCriterion}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          新增一条
                        </button>
                      </div>

                      {createTaskDraft.acceptance_criteria.map((criterion, index) => (
                        <div key={index} className="grid gap-2 rounded border border-slate-200 p-2 sm:grid-cols-12">
                          <input
                            type="text"
                            value={criterion.metric_name}
                            onChange={(event) =>
                              updateCreateTaskCriterion(index, "metric_name", event.target.value)
                            }
                            placeholder="指标名称"
                            className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          />
                          <input
                            type="text"
                            value={criterion.target_value}
                            onChange={(event) =>
                              updateCreateTaskCriterion(index, "target_value", event.target.value)
                            }
                            placeholder="目标值"
                            className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          />
                          <input
                            type="text"
                            value={criterion.unit}
                            onChange={(event) =>
                              updateCreateTaskCriterion(index, "unit", event.target.value)
                            }
                            placeholder="单位（可选）"
                            className="sm:col-span-3 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeCreateTaskCriterion(index)}
                            disabled={createTaskDraft.acceptance_criteria.length <= 1}
                            className="sm:col-span-1 rounded border border-rose-200 px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveCreateTask(day.id)}
                        disabled={createTaskSavingForThisDay}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {createTaskSavingForThisDay ? "保存中..." : "保存新增任务"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelCreateTask}
                        disabled={createTaskSavingForThisDay}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {day.daily_tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  <p>
                    {isBeforeStartDate
                      ? "该日早于开始执行日，系统未自动安排任务。"
                      : isWeekend
                        ? "周末默认不自动安排任务。"
                        : "该日暂无任务。"}
                  </p>
                  <p className="mt-1">你可以点击上方“新增任务”手动补充计划。</p>
                </div>
              ) : null}

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

                  const creatingCriterionForThisTask = creatingCriterionTaskId === task.id;

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
                                void handleTaskStatusChange(
                                  task.id,
                                  event.target.value as DailyTaskRead["status"],
                                )
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
                        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-600">验收标准</p>
                            <button
                              type="button"
                              onClick={() => beginCreateCriterion(task.id)}
                              disabled={createCriterionMutation.isPending}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              新增验收标准
                            </button>
                          </div>

                          {task.acceptance_criteria.length === 0 ? (
                            <p className="text-sm text-slate-500">暂无验收标准，请新增。</p>
                          ) : null}

                          {task.acceptance_criteria.map((criterion) => {
                            const isEditingCriterion = editingCriterionId === criterion.id;
                            const savingCriterion =
                              updateCriterionContentMutation.isPending &&
                              updateCriterionContentMutation.variables?.criterionId ===
                                criterion.id;
                            const deletingCriterion =
                              deleteCriterionMutation.isPending &&
                              deleteCriterionMutation.variables?.criterionId === criterion.id;

                            return (
                              <div
                                key={criterion.id}
                                className="rounded border border-slate-200 bg-white p-2"
                              >
                                {isEditingCriterion ? (
                                  <div className="space-y-2">
                                    <div className="grid gap-2 sm:grid-cols-12">
                                      <input
                                        type="text"
                                        value={criterionDraft.metric_name}
                                        onChange={(event) =>
                                          setCriterionDraft((draft) => ({
                                            ...draft,
                                            metric_name: event.target.value,
                                          }))
                                        }
                                        placeholder="指标名称"
                                        className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                      />
                                      <input
                                        type="text"
                                        value={criterionDraft.target_value}
                                        onChange={(event) =>
                                          setCriterionDraft((draft) => ({
                                            ...draft,
                                            target_value: event.target.value,
                                          }))
                                        }
                                        placeholder="目标值"
                                        className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                      />
                                      <input
                                        type="text"
                                        value={criterionDraft.unit}
                                        onChange={(event) =>
                                          setCriterionDraft((draft) => ({
                                            ...draft,
                                            unit: event.target.value,
                                          }))
                                        }
                                        placeholder="单位（可选）"
                                        className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void saveCriterionContent(task.id, criterion.id)
                                        }
                                        disabled={savingCriterion}
                                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {savingCriterion ? "保存中..." : "保存"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditCriterion}
                                        disabled={savingCriterion}
                                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => beginEditCriterion(task.id, criterion)}
                                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                      >
                                        编辑
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleDeleteCriterion(task.id, criterion.id)
                                        }
                                        disabled={deletingCriterion}
                                        className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {deletingCriterion ? "删除中..." : "删除"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {creatingCriterionForThisTask ? (
                            <div className="rounded border border-dashed border-slate-300 bg-white p-2">
                              <div className="grid gap-2 sm:grid-cols-12">
                                <input
                                  type="text"
                                  value={newCriterionDraft.metric_name}
                                  onChange={(event) =>
                                    setNewCriterionDraft((draft) => ({
                                      ...draft,
                                      metric_name: event.target.value,
                                    }))
                                  }
                                  placeholder="指标名称"
                                  className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                />
                                <input
                                  type="text"
                                  value={newCriterionDraft.target_value}
                                  onChange={(event) =>
                                    setNewCriterionDraft((draft) => ({
                                      ...draft,
                                      target_value: event.target.value,
                                    }))
                                  }
                                  placeholder="目标值"
                                  className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                />
                                <input
                                  type="text"
                                  value={newCriterionDraft.unit}
                                  onChange={(event) =>
                                    setNewCriterionDraft((draft) => ({
                                      ...draft,
                                      unit: event.target.value,
                                    }))
                                  }
                                  placeholder="单位（可选）"
                                  className="sm:col-span-4 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                                />
                              </div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveCreateCriterion(task.id)}
                                  disabled={createCriterionMutation.isPending}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {createCriterionMutation.isPending ? "保存中..." : "保存新增"}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelCreateCriterion}
                                  disabled={createCriterionMutation.isPending}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
