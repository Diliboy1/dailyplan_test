"use client";

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import type { ProgressResponse, WeeklyGoalRead } from "@/lib/types";

const statusChipClass: Record<string, string> = {
  not_started: "bg-slate-400",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
  blocked: "bg-rose-500",
};

function ProgressCard({ goal }: { goal: WeeklyGoalRead }) {
  const progressQuery = useQuery({
    queryKey: ["progress", goal.id],
    queryFn: () => apiGet<ProgressResponse>(`/api/weekly-goals/${goal.id}/progress`),
    retry: false,
  });

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{goal.title}</h2>
          <p className="text-sm text-slate-500">周起始日期：{goal.week_start_date}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {goal.status}
        </span>
      </div>

      {progressQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-600">正在计算进度...</p>
      ) : null}

      {progressQuery.isError ? (
        <p className="mt-4 text-sm text-slate-600">暂无计划数据</p>
      ) : null}

      {progressQuery.data ? (
        <div className="mt-5 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-700">任务完成率</span>
              <span className="font-medium text-slate-900">{progressQuery.data.completion_rate}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progressQuery.data.completion_rate}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {Object.entries(progressQuery.data.status_counts).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    statusChipClass[status] ?? "bg-slate-400"
                  }`}
                />
                <span className="text-slate-700">{status}</span>
                <span className="font-semibold text-slate-900">{count}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-700">验收达标率</span>
              <span className="font-medium text-slate-900">
                {progressQuery.data.criteria_met_rate}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all"
                style={{ width: `${progressQuery.data.criteria_met_rate}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function ProgressPage() {
  const weeklyGoalsQuery = useQuery({
    queryKey: ["weekly-goals"],
    queryFn: () => apiGet<WeeklyGoalRead[]>("/api/weekly-goals"),
  });

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">进度概览</h1>
        <p className="mt-1 text-slate-600">按周目标查看任务完成率与验收标准达标率。</p>
      </header>

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
      (weeklyGoalsQuery.data?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          暂无周目标数据。
        </div>
      ) : null}

      <div className="grid gap-4">
        {(weeklyGoalsQuery.data ?? []).map((goal) => (
          <ProgressCard key={goal.id} goal={goal} />
        ))}
      </div>
    </section>
  );
}
