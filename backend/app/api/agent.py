from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.agent.persistence import save_week_plan
from app.agent.planner import plan_week
from app.core.database import get_session
from app.core.dependencies import get_current_user
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.schemas.daily_plan import PlanWeekResponse

router = APIRouter(prefix="/api/agent", tags=["agent"])


class PlanWeekRequest(BaseModel):
    weekly_goal_id: int


@router.post("/plan-week", response_model=PlanWeekResponse)
def plan_week_endpoint(
    payload: PlanWeekRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PlanWeekResponse:
    statement = select(WeeklyGoal).where(
        WeeklyGoal.id == payload.weekly_goal_id,
        WeeklyGoal.user_id == current_user.id,
    )
    goal = session.exec(statement).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")

    existing_plan = session.exec(
        select(DailyPlan.id).where(DailyPlan.weekly_goal_id == goal.id)
    ).first()
    if existing_plan is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该周目标已生成过计划，请先删除旧计划或创建新的周目标",
        )

    try:
        plan = plan_week(goal)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate weekly plan: {exc}",
        ) from exc

    try:
        persisted_days = save_week_plan(session, plan)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist weekly plan: {exc}",
        ) from exc

    return PlanWeekResponse(weekly_goal_id=plan.weekly_goal_id, days=persisted_days)


@router.get("/plan-week/{weekly_goal_id}", response_model=PlanWeekResponse)
def get_plan_week(
    weekly_goal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PlanWeekResponse:
    goal = session.exec(
        select(WeeklyGoal).where(
            WeeklyGoal.id == weekly_goal_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")

    plans = list(
        session.exec(
            select(DailyPlan)
            .where(DailyPlan.weekly_goal_id == weekly_goal_id)
            .order_by(DailyPlan.day_of_week.asc(), DailyPlan.id.asc())
            .options(
                selectinload(DailyPlan.daily_tasks).selectinload(
                    DailyTask.acceptance_criteria
                ),
            )
        ).all()
    )
    if not plans:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly plan not found")

    return PlanWeekResponse(weekly_goal_id=weekly_goal_id, days=plans)
