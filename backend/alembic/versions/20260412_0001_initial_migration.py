"""initial migration

Revision ID: 20260412_0001
Revises:
Create Date: 2026-04-12 18:30:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260412_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    weekly_goal_status = sa.Enum(
        "draft",
        "active",
        "completed",
        name="weekly_goal_status",
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "weekly_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("status", weekly_goal_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weekly_goals_user_id", "weekly_goals", ["user_id"], unique=False)
    op.create_index(
        "ix_weekly_goals_week_start_date",
        "weekly_goals",
        ["week_start_date"],
        unique=False,
    )

    op.create_table(
        "daily_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("weekly_goal_id", sa.Integer(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("theme", sa.String(length=255), nullable=True),
        sa.Column("buffer_percent", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["weekly_goal_id"], ["weekly_goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_daily_plans_weekly_goal_id", "daily_plans", ["weekly_goal_id"], unique=False)

    op.create_table(
        "daily_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("daily_plan_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("estimated_hours", sa.Float(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["daily_plan_id"], ["daily_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_daily_tasks_daily_plan_id", "daily_tasks", ["daily_plan_id"], unique=False)

    op.create_table(
        "acceptance_criteria",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("daily_task_id", sa.Integer(), nullable=False),
        sa.Column("metric_name", sa.String(length=255), nullable=False),
        sa.Column("target_value", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=True),
        sa.Column("is_met", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["daily_task_id"], ["daily_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_acceptance_criteria_daily_task_id",
        "acceptance_criteria",
        ["daily_task_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_acceptance_criteria_daily_task_id", table_name="acceptance_criteria")
    op.drop_table("acceptance_criteria")

    op.drop_index("ix_daily_tasks_daily_plan_id", table_name="daily_tasks")
    op.drop_table("daily_tasks")

    op.drop_index("ix_daily_plans_weekly_goal_id", table_name="daily_plans")
    op.drop_table("daily_plans")

    op.drop_index("ix_weekly_goals_week_start_date", table_name="weekly_goals")
    op.drop_index("ix_weekly_goals_user_id", table_name="weekly_goals")
    op.drop_table("weekly_goals")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    if op.get_bind().dialect.name == "postgresql":
        sa.Enum(name="weekly_goal_status").drop(op.get_bind(), checkfirst=True)
