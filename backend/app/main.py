from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent import router as agent_router
from app.api.auth import router as auth_router
from app.api.daily_plans import router as daily_plans_router
from app.api.health import router as health_router
from app.api.tasks import router as tasks_router
from app.api.weekly_goals import router as weekly_goals_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.app_debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(weekly_goals_router)
app.include_router(daily_plans_router)
# Phase 4A 修改
app.include_router(tasks_router)
app.include_router(agent_router)
