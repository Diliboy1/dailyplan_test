from datetime import date as DateType
from typing import TYPE_CHECKING

from sqlalchemy import Column, Date, ForeignKey, Integer, String
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.daily_task import DailyTask
    from app.models.weekly_goal import WeeklyGoal


class DailyPlan(SQLModel, table=True):
    __tablename__ = "daily_plans"

    id: int | None = Field(default=None, primary_key=True)
    weekly_goal_id: int = Field(
        sa_column=Column(
            ForeignKey("weekly_goals.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    day_of_week: int = Field(sa_column=Column(Integer, nullable=False))
    date: DateType = Field(sa_column=Column(Date, nullable=False))
    theme: str | None = Field(default=None, sa_column=Column(String(255), nullable=True))
    buffer_percent: int = Field(default=20, sa_column=Column(Integer, nullable=False))

    weekly_goal: "WeeklyGoal" = Relationship(back_populates="daily_plans")
    daily_tasks: list["DailyTask"] = Relationship(
        back_populates="daily_plan",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
