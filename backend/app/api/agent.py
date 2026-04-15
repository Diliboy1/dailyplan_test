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
from app.models.weekly_goal import GoalGenerationStatus, WeeklyGoal
from app.schemas.daily_plan import PlanWeekResponse

router = APIRouter(prefix="/api/agent", tags=["agent"])
MAX_GENERATION_ERROR_LENGTH = 2000


class PlanWeekRequest(BaseModel):
    weekly_goal_id: int


def _load_week_plan_days(session: Session, weekly_goal_id: int) -> list[DailyPlan]:
    plans = list(
        session.exec(
            select(DailyPlan)
            .where(DailyPlan.weekly_goal_id == weekly_goal_id)
            .order_by(DailyPlan.date.asc(), DailyPlan.id.asc())
            .options(
                selectinload(DailyPlan.daily_tasks).selectinload(
                    DailyTask.acceptance_criteria
                ),
            )
        ).all()
    )

    has_corrected_weekday = False
    for plan in plans:
        expected_weekday = plan.date.weekday()
        if plan.day_of_week != expected_weekday:
            plan.day_of_week = expected_weekday
            session.add(plan)
            has_corrected_weekday = True

    if has_corrected_weekday:
        session.commit()

    return plans


def _mark_generation_failed(
    session: Session,
    *,
    weekly_goal_id: int,
    user_id: int | None,
    message: str,
) -> None:
    if user_id is None:
        return

    goal = session.exec(
        select(WeeklyGoal).where(
            WeeklyGoal.id == weekly_goal_id,
            WeeklyGoal.user_id == user_id,
        )
    ).first()
    if goal is None:
        return

    goal.generation_status = GoalGenerationStatus.failed
    goal.generation_error = message[:MAX_GENERATION_ERROR_LENGTH]
    session.add(goal)
    session.commit()


@router.post("/plan-week", response_model=PlanWeekResponse)
def plan_week_endpoint(
    payload: PlanWeekRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PlanWeekResponse:
    statement = select(WeeklyGoal).where(
        WeeklyGoal.id == payload.weekly_goal_id,
        WeeklyGoal.user_id == current_user.id,
    ).with_for_update()
    goal = session.exec(statement).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")

    if goal.generation_status == GoalGenerationStatus.generating:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该周目标正在生成计划，请稍后查看结果",
        )

    existing_plan = session.exec(
        select(DailyPlan.id).where(DailyPlan.weekly_goal_id == goal.id)
    ).first()
    if existing_plan is not None or goal.generation_status == GoalGenerationStatus.completed:
        if existing_plan is not None and goal.generation_status != GoalGenerationStatus.completed:
            goal.generation_status = GoalGenerationStatus.completed
            goal.generation_error = None
            session.add(goal)
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该周目标已生成过计划，请先删除旧计划或创建新的周目标",
        )

    goal.generation_status = GoalGenerationStatus.generating
    goal.generation_error = None
    session.add(goal)
    session.commit()

    try:
        plan = plan_week(goal)
    except Exception as exc:
        _mark_generation_failed(
            session,
            weekly_goal_id=payload.weekly_goal_id,
            user_id=current_user.id,
            message=f"Failed to generate weekly plan: {exc}",
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate weekly plan: {exc}",
        ) from exc

    try:
        save_week_plan(session, plan)
        locked_goal = session.exec(statement).first()
        if locked_goal is None:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Weekly goal not found",
            )

        locked_goal.generation_status = GoalGenerationStatus.completed
        locked_goal.generation_error = None
        session.add(locked_goal)
        session.commit()
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        _mark_generation_failed(
            session,
            weekly_goal_id=payload.weekly_goal_id,
            user_id=current_user.id,
            message=f"Failed to persist weekly plan: {exc}",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist weekly plan: {exc}",
        ) from exc

    persisted_days = _load_week_plan_days(session, plan.weekly_goal_id)
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

    plans = _load_week_plan_days(session, weekly_goal_id)
    if not plans:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly plan not found")

    return PlanWeekResponse(weekly_goal_id=weekly_goal_id, days=plans)
