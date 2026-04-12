from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, ForeignKey, String
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.daily_task import DailyTask


class AcceptanceCriteria(SQLModel, table=True):
    __tablename__ = "acceptance_criteria"

    id: int | None = Field(default=None, primary_key=True)
    daily_task_id: int = Field(
        sa_column=Column(
            ForeignKey("daily_tasks.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    metric_name: str = Field(sa_column=Column(String(255), nullable=False))
    target_value: str = Field(sa_column=Column(String(255), nullable=False))
    unit: str | None = Field(default=None, sa_column=Column(String(50), nullable=True))
    is_met: bool = Field(default=False, sa_column=Column(Boolean, nullable=False))

    daily_task: "DailyTask" = Relationship(back_populates="acceptance_criteria")
