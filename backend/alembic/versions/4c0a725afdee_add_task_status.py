"""add_task_status

Revision ID: 4c0a725afdee
Revises: 20260412_0001
Create Date: 2026-04-12 21:26:52.755333
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c0a725afdee'
down_revision: str | None = '20260412_0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    task_status = sa.Enum(
        "not_started",
        "in_progress",
        "completed",
        "blocked",
        name="task_status",
    )
    task_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "daily_tasks",
        sa.Column(
            "status",
            task_status,
            nullable=False,
            server_default="not_started",
        ),
    )


def downgrade() -> None:
    op.drop_column("daily_tasks", "status")
    if op.get_bind().dialect.name == "postgresql":
        sa.Enum(name="task_status").drop(op.get_bind(), checkfirst=True)
