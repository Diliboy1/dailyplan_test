from fastapi import APIRouter, HTTPException

from app.core.database import check_database_connection

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    try:
        is_connected = check_database_connection()
    except Exception as exc:  # pragma: no cover - for bootstrap visibility
        raise HTTPException(
            status_code=503,
            detail={"status": "error", "database": "disconnected", "reason": str(exc)},
        ) from exc

    if not is_connected:
        raise HTTPException(
            status_code=503,
            detail={"status": "error", "database": "disconnected"},
        )

    return {"status": "ok", "database": "connected"}
