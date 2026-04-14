from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class DailyPlanUpdate(BaseModel):
    theme: str | None = None
    buffer_percent: int | None = Field(default=None, ge=0, le=100)

    @field_validator("theme", mode="before")
    @classmethod
    def normalize_theme(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


class TaskContentUpdate(BaseModel):
    description: str | None = None
    estimated_hours: float | None = Field(default=None, gt=0)
    priority: Literal["high", "medium", "low"] | None = None

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value
