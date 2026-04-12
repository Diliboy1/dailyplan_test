from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, Enum as SQLEnum, Float, ForeignKey, Integer, String, Text
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.acceptance_criteria import AcceptanceCriteria
    from app.models.daily_plan import DailyPlan


class TaskStatus(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"
    blocked = "blocked"


# Phase 4A 修改
class DailyTask(SQLModel, table=True):
    __tablename__ = "daily_tasks"

    id: int | None = Field(default=None, primary_key=True)
    daily_plan_id: int = Field(
        sa_column=Column(
            ForeignKey("daily_plans.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    description: str = Field(sa_column=Column(Text, nullable=False))
    priority: str = Field(default="medium", sa_column=Column(String(20), nullable=False))
    status: TaskStatus = Field(
        default=TaskStatus.not_started,
        sa_column=Column(
            SQLEnum(TaskStatus, name="task_status"),
            nullable=False,
            default=TaskStatus.not_started,
            server_default=TaskStatus.not_started.value,
        ),
    )
    estimated_hours: float = Field(default=1.0, sa_column=Column(Float, nullable=False))
    order_index: int = Field(default=0, sa_column=Column(Integer, nullable=False))
    is_completed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False))

    daily_plan: "DailyPlan" = Relationship(back_populates="daily_tasks")
    acceptance_criteria: list["AcceptanceCriteria"] = Relationship(
        back_populates="daily_task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
