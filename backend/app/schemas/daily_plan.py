from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.daily_task import TaskStatus


# Phase 4A 修改
class AcceptanceCriteriaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    metric_name: str
    target_value: str
    unit: str | None
    is_met: bool


class DailyTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    priority: str
    status: str
    estimated_hours: float
    order_index: int
    is_completed: bool
    acceptance_criteria: list[AcceptanceCriteriaRead]


class DailyPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_of_week: int
    date: date
    theme: str | None
    buffer_percent: int
    daily_tasks: list[DailyTaskRead]


class PlanWeekResponse(BaseModel):
    weekly_goal_id: int
    days: list[DailyPlanRead]


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class CriteriaUpdate(BaseModel):
    is_met: bool
