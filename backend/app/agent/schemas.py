from pydantic import BaseModel, Field


class CriterionItem(BaseModel):
    metric_name: str
    target_value: str
    unit: str | None = None


class TaskItem(BaseModel):
    description: str
    priority: str
    estimated_hours: float
    order_index: int
    acceptance_criteria: list[CriterionItem]


class DayPlan(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    date: str
    theme: str | None = None
    buffer_percent: int = Field(ge=15, le=20)
    tasks: list[TaskItem] = Field(min_length=1, max_length=6)


class WeekPlanResult(BaseModel):
    weekly_goal_id: int
    days: list[DayPlan] = Field(min_length=7, max_length=7)
