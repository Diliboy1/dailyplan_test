# Phase 4A 新增
from pydantic import BaseModel


class ProgressResponse(BaseModel):
    weekly_goal_id: int
    total_tasks: int
    status_counts: dict[str, int]
    total_criteria: int
    met_criteria: int
    completion_rate: float
    criteria_met_rate: float
