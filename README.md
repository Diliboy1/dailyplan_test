# DailyPlan Full-Stack Starter

最小可运行闭环：Next.js 14（前端）+ FastAPI（后端）+ PostgreSQL/Redis（Docker）。

## 1) 环境要求

- Node.js >= 20（建议 LTS）
- pnpm >= 9
- Python >= 3.11
- [uv](https://docs.astral.sh/uv/)（Python 包管理）
- Docker + Docker Compose（`docker compose` 命令可用）

## 2) 项目结构

```text
project-root/
├── frontend/                 # Next.js 应用
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   ├── lib/
│   ├── .env.local
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/                  # FastAPI 应用
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── health.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   └── models/
│   │       └── __init__.py
│   ├── .env
│   ├── .env.example
│   └── pyproject.toml
├── scripts/
│   └── dev.sh               # 一键启动脚本
├── docker-compose.yml
├── .gitignore
└── README.md
```

## 3) 一键启动（推荐）

在项目根目录执行：

```bash
./scripts/dev.sh
```

此命令会自动完成：

1. 启动 Docker 中的 PostgreSQL 和 Redis
2. 使用 `uv` 安装后端依赖并启动 FastAPI（`http://localhost:8000`）
3. 使用 `pnpm` 安装前端依赖并启动 Next.js（`http://localhost:3000`）

## 4) 手动启动（可选）

### 4.1 启动基础设施

```bash
docker compose up -d
```

### 4.2 启动后端

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4.3 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

## 5) 运行验证

### 后端验证

访问：

```text
http://localhost:8000/health
```

应返回：

```json
{"status":"ok","database":"connected"}
```

### 前端验证

访问：

```text
http://localhost:3000
```

页面应显示欢迎语，以及“后端连接正常”状态（并展示 `/health` 返回内容）。

## 6) 环境变量说明

### `backend/.env`

- `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`：PostgreSQL 连接参数
- `BACKEND_CORS_ORIGINS`：允许跨域来源（默认包含 `http://localhost:3000`）

### `frontend/.env.local`

- `NEXT_PUBLIC_API_BASE_URL`：后端 API 地址，默认 `http://localhost:8000`
