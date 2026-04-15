from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.dependencies import get_current_user
from app.models.acceptance_criteria import AcceptanceCriteria
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask, TaskStatus
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.schemas.daily_plan import (
    AcceptanceCriteriaContentUpdate,
    AcceptanceCriteriaCreate,
    AcceptanceCriteriaRead,
    CriteriaUpdate,
    DailyTaskRead,
    TaskCreate,
    TaskContentUpdate,
    TaskStatusUpdate,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _task_statement(task_id: int, user_id: int) -> object:
    return (
        select(DailyTask)
        .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyTask.id == task_id,
            WeeklyGoal.user_id == user_id,
        )
        .options(selectinload(DailyTask.acceptance_criteria))
    )


def _criterion_statement(task_id: int, criterion_id: int, user_id: int) -> object:
    return (
        select(AcceptanceCriteria)
        .join(DailyTask, AcceptanceCriteria.daily_task_id == DailyTask.id)
        .join(DailyPlan, DailyTask.daily_plan_id == DailyPlan.id)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            AcceptanceCriteria.id == criterion_id,
            DailyTask.id == task_id,
            WeeklyGoal.user_id == user_id,
        )
    )


@router.post("", response_model=DailyTaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DailyTask:
    plan = session.exec(
        select(DailyPlan)
        .join(WeeklyGoal, DailyPlan.weekly_goal_id == WeeklyGoal.id)
        .where(
            DailyPlan.id == payload.daily_plan_id,
            WeeklyGoal.user_id == current_user.id,
        )
    ).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily plan not found")

    max_order_index = session.exec(
        select(func.max(DailyTask.order_index)).where(DailyTask.daily_plan_id == payload.daily_plan_id)
    ).first()
    next_order_index = (max_order_index if max_order_index is not None else -1) + 1

    task = DailyTask(
        daily_plan_id=payload.daily_plan_id,
        description=payload.description,
        priority=payload.priority,
        estimated_hours=payload.estimated_hours,
        status=payload.status,
        is_completed=payload.status == TaskStatus.completed,
        order_index=next_order_index,
    )
    session.add(task)
    session.flush()

    for criterion in payload.acceptance_criteria:
        session.add(
            AcceptanceCriteria(
                daily_task_id=task.id,
                metric_name=criterion.metric_name,
                target_value=criterion.target_value,
                unit=criterion.unit,
            )
        )

    session.commit()

    refreshed = session.exec(_task_statement(task.id, current_user.id)).first()
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return refreshed


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

    statement = _task_statement(task_id, current_user.id)
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
    statement = _task_statement(task_id, current_user.id)
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
    statement = _criterion_statement(task_id, criterion_id, current_user.id)
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


@router.patch("/{task_id}/criteria/{criterion_id}/content", response_model=AcceptanceCriteriaRead)
def update_criteria_content(
    task_id: int,
    criterion_id: int,
    payload: AcceptanceCriteriaContentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AcceptanceCriteria:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    if "metric_name" in data and data["metric_name"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="metric_name cannot be empty",
        )
    if "target_value" in data and data["target_value"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_value cannot be empty",
        )

    criterion = session.exec(_criterion_statement(task_id, criterion_id, current_user.id)).first()
    if criterion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance criterion not found",
        )

    if "metric_name" in data:
        criterion.metric_name = data["metric_name"]
    if "target_value" in data:
        criterion.target_value = data["target_value"]
    if "unit" in data:
        criterion.unit = data["unit"]

    session.add(criterion)
    session.commit()
    session.refresh(criterion)
    return criterion


@router.post("/{task_id}/criteria", response_model=AcceptanceCriteriaRead, status_code=status.HTTP_201_CREATED)
def create_criterion(
    task_id: int,
    payload: AcceptanceCriteriaCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AcceptanceCriteria:
    task = session.exec(_task_statement(task_id, current_user.id)).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    criterion = AcceptanceCriteria(
        daily_task_id=task_id,
        metric_name=payload.metric_name,
        target_value=payload.target_value,
        unit=payload.unit,
    )
    session.add(criterion)
    session.commit()
    session.refresh(criterion)
    return criterion


@router.delete("/{task_id}/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_criterion(
    task_id: int,
    criterion_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    criterion = session.exec(_criterion_statement(task_id, criterion_id, current_user.id)).first()
    if criterion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance criterion not found",
        )

    session.delete(criterion)
    session.commit()
