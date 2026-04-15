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


class AcceptanceCriteriaCreate(BaseModel):
    metric_name: str = Field(min_length=1, max_length=255)
    target_value: str = Field(min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)

    @field_validator("metric_name", "target_value", mode="before")
    @classmethod
    def normalize_required_text(cls, value: object) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_unit(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


class AcceptanceCriteriaContentUpdate(BaseModel):
    metric_name: str | None = Field(default=None, min_length=1, max_length=255)
    target_value: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, max_length=50)

    @field_validator("metric_name", "target_value", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_optional_unit(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


class TaskCreate(BaseModel):
    daily_plan_id: int
    description: str = Field(min_length=1)
    priority: Literal["high", "medium", "low"] = "medium"
    estimated_hours: float = Field(default=1.0, gt=0)
    status: TaskStatus = TaskStatus.not_started
    acceptance_criteria: list[AcceptanceCriteriaCreate] = Field(default_factory=list, max_length=10)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_task_description(cls, value: object) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


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
