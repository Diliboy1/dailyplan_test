from datetime import date as DateType

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.agent.schemas import WeekPlanResult
from app.models.acceptance_criteria import AcceptanceCriteria
from app.models.daily_plan import DailyPlan
from app.models.daily_task import DailyTask


def save_week_plan(session: Session, plan: WeekPlanResult) -> list[DailyPlan]:
    """
    将 WeekPlanResult 写入 daily_plans / daily_tasks / acceptance_criteria 三张表。
    在单个事务中完成。返回已持久化（带 id）的 DailyPlan 列表。
    """
    try:
        for day in plan.days:
            daily_plan = DailyPlan(
                weekly_goal_id=plan.weekly_goal_id,
                day_of_week=day.day_of_week,
                date=DateType.fromisoformat(day.date),
                theme=day.theme,
                buffer_percent=day.buffer_percent,
            )
            session.add(daily_plan)
            session.flush()

            for task in day.tasks:
                daily_task = DailyTask(
                    daily_plan_id=daily_plan.id,
                    description=task.description,
                    priority=task.priority,
                    estimated_hours=task.estimated_hours,
                    order_index=task.order_index,
                )
                session.add(daily_task)
                session.flush()

                for criterion in task.acceptance_criteria:
                    acceptance_criteria = AcceptanceCriteria(
                        daily_task_id=daily_task.id,
                        metric_name=criterion.metric_name,
                        target_value=criterion.target_value,
                        unit=criterion.unit,
                    )
                    session.add(acceptance_criteria)

        session.commit()
    except Exception:
        session.rollback()
        raise

    statement = (
        select(DailyPlan)
        .where(DailyPlan.weekly_goal_id == plan.weekly_goal_id)
        .order_by(DailyPlan.day_of_week.asc(), DailyPlan.id.asc())
        .options(
            selectinload(DailyPlan.daily_tasks).selectinload(DailyTask.acceptance_criteria),
        )
    )
    return list(session.exec(statement).all())
