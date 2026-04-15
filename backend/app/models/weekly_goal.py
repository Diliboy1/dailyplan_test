from datetime import date, datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Column, Date, DateTime, Enum as SQLEnum, ForeignKey, String, Text
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.daily_plan import DailyPlan
    from app.models.user import User


class WeeklyGoalStatus(str, Enum):
    draft = "draft"
    active = "active"
    completed = "completed"


class GoalGenerationStatus(str, Enum):
    idle = "idle"
    generating = "generating"
    completed = "completed"
    failed = "failed"


class WeeklyGoal(SQLModel, table=True):
    __tablename__ = "weekly_goals"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    description: str = Field(sa_column=Column(Text, nullable=False))
    week_start_date: date = Field(sa_column=Column(Date, nullable=False, index=True))
    status: WeeklyGoalStatus = Field(
        default=WeeklyGoalStatus.draft,
        sa_column=Column(
            SQLEnum(WeeklyGoalStatus, name="weekly_goal_status"),
            nullable=False,
            default=WeeklyGoalStatus.draft,
        ),
    )
    generation_status: GoalGenerationStatus = Field(
        default=GoalGenerationStatus.idle,
        sa_column=Column(
            SQLEnum(
                GoalGenerationStatus,
                name="weekly_goal_generation_status",
            ),
            nullable=False,
            default=GoalGenerationStatus.idle,
            server_default=GoalGenerationStatus.idle.value,
        ),
    )
    generation_error: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            onupdate=lambda: datetime.now(timezone.utc),
        ),
    )

    user: "User" = Relationship(back_populates="weekly_goals")
    daily_plans: list["DailyPlan"] = Relationship(
        back_populates="weekly_goal",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
