from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings
from app.models import (  # noqa: F401 - imported for SQLModel metadata registration
    AcceptanceCriteria,
    DailyPlan,
    DailyTask,
    User,
    WeeklyGoal,
)

settings = get_settings()

engine = create_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_pre_ping=True,
)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def check_database_connection() -> bool:
    with Session(engine) as session:
        session.exec(text("SELECT 1"))
    return True


def init_db() -> None:
    # Migrations are managed by Alembic.
    # Keep this helper for local fallback when needed.
    SQLModel.metadata.create_all(engine)
