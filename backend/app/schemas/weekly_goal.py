# Phase 2 新增
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.weekly_goal import WeeklyGoalStatus


class WeeklyGoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    week_start_date: date
    status: WeeklyGoalStatus = WeeklyGoalStatus.draft


class WeeklyGoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    week_start_date: date
    status: WeeklyGoalStatus
    created_at: datetime
    updated_at: datetime
