export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserRead {
  id: number;
  email: string;
  created_at: string;
}

export interface WeeklyGoalRead {
  id: number;
  title: string;
  description: string;
  week_start_date: string;
  status: "draft" | "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface AcceptanceCriteriaRead {
  id: number;
  metric_name: string;
  target_value: string;
  unit: string | null;
  is_met: boolean;
}

export interface DailyTaskRead {
  id: number;
  description: string;
  priority: "high" | "medium" | "low";
  estimated_hours: number;
  order_index: number;
  is_completed: boolean;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  acceptance_criteria: AcceptanceCriteriaRead[];
}

export interface DailyPlanRead {
  id: number;
  day_of_week: number;
  date: string;
  theme: string | null;
  buffer_percent: number;
  daily_tasks: DailyTaskRead[];
}

export interface PlanWeekResponse {
  weekly_goal_id: number;
  days: DailyPlanRead[];
}

export interface ProgressResponse {
  weekly_goal_id: number;
  total_tasks: number;
  status_counts: Record<string, number>;
  total_criteria: number;
  met_criteria: number;
  completion_rate: number;
  criteria_met_rate: number;
}
