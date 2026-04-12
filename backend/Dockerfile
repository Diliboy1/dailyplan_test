FROM python:3.11-slim AS base

WORKDIR /app

RUN pip install --no-cache-dir uv -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

COPY pyproject.toml ./
COPY uv.lock ./

ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY app/ ./app/

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --log-level info"]
