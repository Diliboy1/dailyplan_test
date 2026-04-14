## Step 1 — 仓库中与「本地启动」相关的结论（给执行者/模型）
| 路径 | 作用 |
|------|------|
| `README.md` | 环境要求、一键/手动启动、健康检查 URL、环境变量说明 |
| `docker-compose.yml` | 本地 **PostgreSQL**（5432）与 **Redis**（6379），与 `backend/.env` 中默认库名/用户一致 |
| `scripts/dev.sh` | **推荐**：`docker compose up` → `backend` 下 `uv sync` → `frontend` 下 `pnpm install` → 后台起 **uvicorn :8000** 与 **pnpm dev :3000** |
| `backend/.env.example` | 复制为 `backend/.env`；含 DB、JWT、CORS、`LLM_*`（若需 AI 生成计划） |
| `frontend/.env.local.example` | 复制为 `frontend/.env.local`；`NEXT_PUBLIC_API_BASE_URL` 默认 `http://localhost:8000` |
| `deploy/` | **生产** Nginx 等，**本地验证一般不需要** |
| `docs/deploy-guide.md` | 云上部署，**本地验证不需要** |
**本地默认地址**
- 后端：`http://localhost:8000`（Swagger：`/docs`）
- 前端：`http://localhost:3000`
- 健康检查：`GET http://localhost:8000/health`（应含数据库连接状态）
---
## Step 2 — 实现任务用的提示词（复制给大模型或自用检查清单）
**角色**  
你是一名熟悉本仓库的开发者，目标是在**本机**同时跑起 **FastAPI 后端**与 **Next.js 前端**，并用可重复步骤**确认最近改动的代码已生效**。
**任务**  
1. 检查并满足运行前置条件。  
2. 用项目约定方式启动依赖与前后端。  
3. 按「验证清单」确认服务正常，并针对用户改动的功能做**定向验证**（若用户说明了改动点，则优先验证那些路径）。
**前置条件（须自检）**
- 已安装：**Node.js ≥ 20**、**pnpm ≥ 9**、**Python ≥ 3.11**、**uv**、**Docker**（且 `docker compose` 可用）。  
- 在项目根目录：存在 `backend/.env`（可由 `backend/.env.example` 复制并填写）；存在 `frontend/.env.local`（可由 `frontend/.env.local.example` 复制）。  
- **数据库**：若改动涉及表结构，已按项目方式执行 **Alembic 迁移**（`backend` 内 `alembic upgrade head` 或文档约定命令），避免 API 因缺列报错。  
- **端口**：本机 **8000**、**3000**、**5432**（若用默认 Docker Postgres）未被占用；若冲突，先释放端口或改配置（并同步改 `NEXT_PUBLIC_API_BASE_URL` / CORS）。
**启动方式 A（推荐）**
在项目根目录执行：
```bash
chmod +x ./scripts/dev.sh   # 仅需一次
./scripts/dev.sh
预期：docker compose 拉起 Postgres/Redis；后端监听 8000；前端开发服监听 3000。脚本退出时会尝试结束子进程；若需长期运行，可在两个终端手动启动（见 README「手动启动」）。

启动方式 B（手动，便于分终端看日志）

docker compose up -d（根目录）
cd backend && uv sync && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
cd frontend && pnpm install && pnpm dev
基础验证清单


curl -s http://localhost:8000/health
（或浏览器打开）返回
200
，且 JSON 中
database 为 connected
（或项目当前等价字段）。

浏览器打开
http://localhost:3000
，首页能加载；若首页会请求后端，
无 CORS/网络错误
（
BACKEND_CORS_ORIGINS
含
http://localhost:3000
）。

若改动涉及登录/鉴权：走一遍注册/登录，再访问改动涉及的页面或接口。

若改动涉及具体页面：在浏览器
硬刷新
或
无痕窗口
试一次，避免旧 bundle 缓存误判。
针对「验证改动是否生效」的额外要求

用一两句话说明你改了什么（页面路径、API 路径或行为）。
验证时打开开发者工具 Network，确认相关 XHR/fetch 指向 NEXT_PUBLIC_API_BASE_URL 且状态码与响应体符合预期。
若后端有 --reload，保存代码后应自动重载；前端 HMR 应反映 UI 变化。
若验证失败：记录 错误信息、请求 URL、状态码；检查 Docker 是否运行、.env 是否与 docker-compose.yml 中数据库账号一致、JWT/LLM 等可选配置是否影响该功能。
输出
用 Markdown 简短输出：启动是否成功、基础验证项结果、针对改动的验证步骤与结果；若失败，给出下一步排查（不超过 5 条）。