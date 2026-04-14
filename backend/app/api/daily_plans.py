from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.dependencies import get_current_user
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.schemas.daily_plan import DailyPlanRead, DailyPlanUpdate

router = APIRouter(prefix="/api/daily-plans", tags=["daily-plans"])


@router.patch("/{daily_plan_id}", response_model=DailyPlanRead)
def update_daily_plan(
    daily_plan_id: int,
    payload: DailyPlanUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DailyPlan:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    plan = session.exec(
        select(DailyPlan)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyPlan.id == daily_plan_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily plan not found")

    if "theme" in data:
        plan.theme = data["theme"]
    if "buffer_percent" in data:
        plan.buffer_percent = data["buffer_percent"]

    session.add(plan)
    session.commit()

    refreshed = session.exec(
        select(DailyPlan)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyPlan.id == daily_plan_id,
            WeeklyGoal.user_id == current_user.id,
        )
        .options(
            selectinload(DailyPlan.daily_tasks).selectinload(DailyTask.acceptance_criteria),
        )
    ).first()
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily plan not found")
    return refreshed
