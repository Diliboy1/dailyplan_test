"""add goal generation status

Revision ID: 20260414_0002
Revises: 4c0a725afdee
Create Date: 2026-04-14 20:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260414_0002"
down_revision: str | None = "4c0a725afdee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    generation_status = sa.Enum(
        "idle",
        "generating",
        "completed",
        "failed",
        name="weekly_goal_generation_status",
    )
    generation_status.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "weekly_goals",
        sa.Column(
            "generation_status",
            generation_status,
            nullable=False,
            server_default="idle",
        ),
    )
    op.add_column(
        "weekly_goals",
        sa.Column("generation_error", sa.Text(), nullable=True),
    )

    op.execute(
        """
        UPDATE weekly_goals
        SET generation_status = 'completed', generation_error = NULL
        WHERE EXISTS (
            SELECT 1
            FROM daily_plans
            WHERE daily_plans.weekly_goal_id = weekly_goals.id
        )
        """
    )


def downgrade() -> None:
    op.drop_column("weekly_goals", "generation_error")
    op.drop_column("weekly_goals", "generation_status")

    if op.get_bind().dialect.name == "postgresql":
        sa.Enum(name="weekly_goal_generation_status").drop(op.get_bind(), checkfirst=True)
