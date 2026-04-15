from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.dependencies import get_current_user
from app.models.acceptance_criteria import AcceptanceCriteria
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask, TaskStatus
from app.models.user import User
from app.models.weekly_goal import GoalGenerationStatus, WeeklyGoal, WeeklyGoalStatus
from app.schemas.progress import ProgressResponse
from app.schemas.weekly_goal import WeeklyGoalCreate, WeeklyGoalRead

# Phase 2 修改
router = APIRouter(prefix="/api/weekly-goals", tags=["weekly-goals"])


@router.post("", response_model=WeeklyGoalRead)
def create_weekly_goal(
    payload: WeeklyGoalCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> WeeklyGoal:
    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user",
        )

    weekly_goal = WeeklyGoal(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        week_start_date=payload.week_start_date,
        status=payload.status,
    )
    session.add(weekly_goal)
    session.commit()
    session.refresh(weekly_goal)
    return weekly_goal


@router.get("", response_model=list[WeeklyGoalRead])
def list_weekly_goals(
    status: WeeklyGoalStatus | None = Query(default=None),
    week_start_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[WeeklyGoal]:
    statement = select(WeeklyGoal).where(WeeklyGoal.user_id == current_user.id)

    if status is not None:
        statement = statement.where(WeeklyGoal.status == status)
    if week_start_date is not None:
        statement = statement.where(WeeklyGoal.week_start_date == week_start_date)

    statement = statement.order_by(WeeklyGoal.week_start_date.desc(), WeeklyGoal.id.desc())
    return list(session.exec(statement).all())


# Phase 4A 新增
@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_goal(
    goal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    goal = session.exec(
        select(WeeklyGoal).where(
            WeeklyGoal.id == goal_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")
    if goal.generation_status == GoalGenerationStatus.generating:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该周目标正在生成计划，请稍后再删除",
        )

    session.delete(goal)
    session.commit()


@router.get("/{goal_id}", response_model=WeeklyGoalRead)
def get_weekly_goal(
    goal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> WeeklyGoal:
    goal = session.exec(
        select(WeeklyGoal).where(
            WeeklyGoal.id == goal_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")
    return goal


@router.get("/{goal_id}/progress", response_model=ProgressResponse)
def get_goal_progress(
    goal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProgressResponse:
    goal = session.exec(
        select(WeeklyGoal).where(
            WeeklyGoal.id == goal_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly goal not found")

    statuses = list(
        session.exec(
            select(DailyTask.status)
            .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
            .where(DailyPlan.weekly_goal_id == goal_id)
        ).all()
    )
    status_counts = {
        TaskStatus.not_started.value: 0,
        TaskStatus.in_progress.value: 0,
        TaskStatus.completed.value: 0,
        TaskStatus.blocked.value: 0,
    }
    for item in statuses:
        key = item.value if isinstance(item, TaskStatus) else str(item)
        status_counts[key] = status_counts.get(key, 0) + 1

    total_tasks = len(statuses)
    completed_count = status_counts[TaskStatus.completed.value]
    completion_rate = round((completed_count / total_tasks) * 100, 1) if total_tasks > 0 else 0.0

    criteria_flags = list(
        session.exec(
            select(AcceptanceCriteria.is_met)
            .join(DailyTask, AcceptanceCriteria.daily_task_id == DailyTask.id)
            .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
            .where(DailyPlan.weekly_goal_id == goal_id)
        ).all()
    )
    total_criteria = len(criteria_flags)
    met_criteria = sum(1 for flag in criteria_flags if flag)
    criteria_met_rate = (
        round((met_criteria / total_criteria) * 100, 1) if total_criteria > 0 else 0.0
    )

    return ProgressResponse(
        weekly_goal_id=goal_id,
        total_tasks=total_tasks,
        status_counts=status_counts,
        total_criteria=total_criteria,
        met_criteria=met_criteria,
        completion_rate=completion_rate,
        criteria_met_rate=criteria_met_rate,
    )
