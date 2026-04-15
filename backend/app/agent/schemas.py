from typing import Literal

from pydantic import BaseModel, Field


class CriterionItem(BaseModel):
    metric_name: str = Field(min_length=1, max_length=255)
    target_value: str = Field(min_length=1, max_length=255)
    unit: str | None = None


class TaskItem(BaseModel):
    description: str = Field(min_length=1)
    priority: Literal["high", "medium", "low"]
    estimated_hours: float = Field(gt=0)
    order_index: int = Field(ge=0)
    acceptance_criteria: list[CriterionItem] = Field(min_length=1, max_length=3)


class DayPlan(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    date: str
    theme: str | None = None
    buffer_percent: int = Field(ge=15, le=20)
    tasks: list[TaskItem] = Field(min_length=0, max_length=6)


class DraftDayPlan(BaseModel):
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    date: str | None = None
    theme: str | None = None
    buffer_percent: int = Field(ge=15, le=20)
    tasks: list[TaskItem] = Field(min_length=0, max_length=6)


class WeekPlanDraft(BaseModel):
    weekly_goal_id: int
    days: list[DraftDayPlan] = Field(min_length=1, max_length=7)


class WeekPlanResult(BaseModel):
    weekly_goal_id: int
    days: list[DayPlan] = Field(min_length=7, max_length=7)
