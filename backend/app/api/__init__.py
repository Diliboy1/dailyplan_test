from app.api.agent import router as agent_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.tasks import router as tasks_router
from app.api.weekly_goals import router as weekly_goals_router

# Phase 4A 修改
__all__ = ["agent_router", "auth_router", "health_router", "tasks_router", "weekly_goals_router"]

