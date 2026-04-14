# Phase 4A 新增
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.dependencies import get_current_user
from app.models.acceptance_criteria import AcceptanceCriteria
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask, TaskStatus
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.schemas.daily_plan import (
    AcceptanceCriteriaRead,
    CriteriaUpdate,
    DailyTaskRead,
    TaskContentUpdate,
    TaskStatusUpdate,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.patch("/{task_id}/content", response_model=DailyTaskRead)
def update_task_content(
    task_id: int,
    payload: TaskContentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DailyTask:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    if "description" in data and data["description"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="description cannot be empty",
        )

    statement = (
        select(DailyTask)
        .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyTask.id == task_id,
            WeeklyGoal.user_id == current_user.id,
        )
        .options(selectinload(DailyTask.acceptance_criteria))
    )
    task = session.exec(statement).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if "description" in data:
        task.description = data["description"]
    if "estimated_hours" in data:
        task.estimated_hours = data["estimated_hours"]
    if "priority" in data:
        task.priority = data["priority"]

    session.add(task)
    session.commit()

    refreshed = session.exec(statement).first()
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return refreshed


@router.patch("/{task_id}/status", response_model=DailyTaskRead)
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DailyTask:
    statement = (
        select(DailyTask)
        .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyTask.id == task_id,
            WeeklyGoal.user_id == current_user.id,
        )
        .options(selectinload(DailyTask.acceptance_criteria))
    )
    task = session.exec(statement).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task.status = payload.status
    task.is_completed = payload.status == TaskStatus.completed
    session.add(task)
    session.commit()

    refreshed = session.exec(statement).first()
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return refreshed


@router.patch("/{task_id}/criteria/{criterion_id}", response_model=AcceptanceCriteriaRead)
def update_criteria_status(
    task_id: int,
    criterion_id: int,
    payload: CriteriaUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AcceptanceCriteria:
    statement = (
        select(AcceptanceCriteria)
        .join(DailyTask, AcceptanceCriteria.daily_task_id == DailyTask.id)
        .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            AcceptanceCriteria.id == criterion_id,
            DailyTask.id == task_id,
            WeeklyGoal.user_id == current_user.id,
        )
    )
    criterion = session.exec(statement).first()
    if criterion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance criterion not found",
        )

    criterion.is_met = payload.is_met
    session.add(criterion)
    session.commit()
    session.refresh(criterion)
    return criterion
