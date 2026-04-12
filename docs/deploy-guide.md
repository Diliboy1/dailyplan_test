# DailyPlan 生产环境部署与最小运维手册

> 本文档指导你将 DailyPlan（FastAPI + Next.js + PostgreSQL）部署到阿里云，实现公网 HTTPS 访问、10-30 并发稳定运行、基本容灾能力。
>
> 预计总耗时：约 2 小时（含等待资源创建的时间）。

---

## 第一章：云资源购买与组网（预计 20 分钟）

### 1.1 创建 VPC 专有网络

**操作目的**：所有云资源放在同一个 VPC 内，ECS 与 RDS 通过内网通信，不走公网，既安全又免流量费。

**控制台路径**：阿里云控制台 → 专有网络 VPC → 创建专有网络

```
网络名称：dailyplan-vpc
IPv4 网段：172.16.0.0/16

交换机：
  名称：dailyplan-vsw
  可用区：选择和后续 ECS/RDS 相同的可用区（如 华东1 可用区 K）
  网段：172.16.1.0/24
```

### 1.2 创建安全组

**操作目的**：控制入站流量，只开放必要端口。

**控制台路径**：ECS 控制台 → 网络与安全 → 安全组 → 创建安全组

```
安全组名称：dailyplan-sg
网络类型：VPC（选择刚创建的 dailyplan-vpc）
```

创建后，点击「配置规则」，添加以下 **入方向规则**：

| 优先级 | 协议 | 端口范围 | 授权对象 | 说明 |
|--------|------|----------|----------|------|
| 1 | TCP | 22/22 | 你的本机公网 IP/32 | SSH 登录（**强烈建议限制为你的 IP**） |
| 1 | TCP | 80/80 | 0.0.0.0/0 | HTTP（Nginx 会 301 到 HTTPS） |
| 1 | TCP | 443/443 | 0.0.0.0/0 | HTTPS |

> **注意**：不要开放 5432（数据库）和 8000/3000（应用端口）到公网。RDS 通过内网访问，应用端口由 Nginx 反向代理。

### 1.3 创建 RDS PostgreSQL

**操作目的**：使用阿里云托管数据库，免去自建运维、自动备份、高可用。

**控制台路径**：阿里云控制台 → 云数据库 RDS → 创建实例

```
数据库引擎：PostgreSQL 16
系列：基础版（单节点，MVP 足够）
规格：pg.n2.small.1（1核 2GB）—— 10-30 并发足够
存储：20GB ESSD 云盘（按量付费，用多少算多少）
网络类型：VPC（选择 dailyplan-vpc / dailyplan-vsw）
```

实例创建完成后（约 5-10 分钟），执行以下操作：

#### 1.3.1 设置白名单

**控制台路径**：RDS 实例详情 → 数据安全性 → 白名单设置

```
分组名称：dailyplan_ecs
白名单：172.16.0.0/16（整个 VPC 网段，或填 ECS 私网 IP 更精确）
```

#### 1.3.2 创建数据库账号

**控制台路径**：RDS 实例详情 → 账号管理 → 创建账号

```
账号名：dailyplan
账号类型：高权限账号
密码：{{ YOUR_DB_PASSWORD }}
```

> **⚠️ 请将 `{{ YOUR_DB_PASSWORD }}` 替换为一个强密码（至少 16 位，含大小写字母+数字+特殊字符），并妥善记录。**

#### 1.3.3 创建数据库

**控制台路径**：RDS 实例详情 → 数据库管理 → 创建数据库

```
数据库名：dailyplan
字符集：UTF-8
授权账号：dailyplan
```

#### 1.3.4 记录 RDS 内网连接地址

在 RDS 实例详情 → 数据库连接 → 内网地址，记录下类似：

```
pgm-xxxxxxxxxxxxx.pg.rds.aliyuncs.com
端口：5432
```

> 后续配置中用 `{{ YOUR_RDS_INTERNAL_HOST }}` 表示。

### 1.4 购买 ECS 实例

**操作目的**：运行 Docker 容器的计算节点。

**控制台路径**：ECS 控制台 → 实例 → 创建实例

```
地域/可用区：与 RDS 相同（如 华东1 可用区 K）
规格：ecs.c7.large（2 vCPU / 4 GiB）—— 推荐最低规格
镜像：Alibaba Cloud Linux 3.2104 LTS 64位
系统盘：40GB ESSD
网络：dailyplan-vpc / dailyplan-vsw
安全组：dailyplan-sg
公网 IP：勾选「分配公网 IPv4 地址」
带宽：按使用流量计费，带宽峰值 5Mbps
登录凭证：SSH 密钥对（推荐）或密码
```

创建完成后，记录：
- **公网 IP**：`{{ YOUR_ECS_PUBLIC_IP }}`
- **私网 IP**：`{{ YOUR_ECS_PRIVATE_IP }}`

---

## 第二章：域名解析与 HTTPS 证书（预计 15 分钟）

### 2.1 添加域名 A 记录

**操作目的**：将你的域名指向 ECS 公网 IP。

**控制台路径**：阿里云控制台 → 云解析 DNS → 你的域名 → 添加记录

```
记录类型：A
主机记录：@（根域名）或 app（子域名 app.yourdomain.com）
记录值：{{ YOUR_ECS_PUBLIC_IP }}
TTL：10 分钟
```

> 如果想同时解析 `www`，再添加一条主机记录为 `www` 的 A 记录指向同一 IP。

### 2.2 申请免费 SSL 证书

**操作目的**：启用 HTTPS，加密传输数据。

**控制台路径**：阿里云控制台 → 数字证书管理服务 → SSL 证书 → 免费证书

```
1. 点击「免费证书」→「创建证书」
2. 证书申请：
   域名：{{ YOUR_DOMAIN }}
   验证方式：DNS 验证（自动添加 CNAME 记录）
3. 等待签发（通常 5-10 分钟）
4. 签发后点击「下载」→ 选择 Nginx 格式
5. 下载得到两个文件：
   - {{ YOUR_DOMAIN }}.pem（证书文件）
   - {{ YOUR_DOMAIN }}.key（私钥文件）
```

> **⚠️ 后续步骤中需要将这两个文件上传到 ECS。**

---

## 第三章：ECS 环境初始化与 Docker 部署（预计 30 分钟）

### 3.1 SSH 登录 ECS 并初始化环境

```bash
ssh root@{{ YOUR_ECS_PUBLIC_IP }}
```

#### 3.1.1 安装 Docker + Docker Compose

> **注意**：Alibaba Cloud Linux 3 默认 `dnf install docker` 会安装 Podman 兼容层，不是真正的 Docker。必须从阿里云 Docker CE 镜像源安装。

```bash
# 如果之前误装了 podman-docker，先卸载
dnf remove -y podman-docker podman 2>/dev/null || true

# 添加 Docker CE 阿里云镜像源
dnf install -y dnf-utils
dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

# 安装 Docker Engine + Compose 插件
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动并设为开机自启
systemctl enable docker
systemctl start docker

# 验证
docker --version
docker compose version
```

#### 3.1.3 安装 Git

```bash
dnf install -y git
```

#### 3.1.4 克隆项目代码

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/{{ YOUR_GITHUB_USER }}/DailyPlan.git
cd DailyPlan
```

> **⚠️ 将 `{{ YOUR_GITHUB_USER }}` 替换为你的 GitHub 用户名（或组织名）。** 如果是私有仓库，需要配置 SSH Key 或使用 Personal Access Token。

#### 3.1.5 创建 SSL 证书目录并上传证书

在 ECS 上：

```bash
mkdir -p /opt/DailyPlan/deploy/ssl
```

在**你的本机**（另开一个终端）：

```bash
scp {{ YOUR_DOMAIN }}.pem root@{{ YOUR_ECS_PUBLIC_IP }}:/opt/DailyPlan/deploy/ssl/cert.pem
scp {{ YOUR_DOMAIN }}.key root@{{ YOUR_ECS_PUBLIC_IP }}:/opt/DailyPlan/deploy/ssl/cert.key
```

### 3.2 创建 `backend/Dockerfile`

**操作目的**：将后端打包为 Docker 镜像。基于 `python:3.11-slim`，使用 `uv` 安装依赖，启动时自动执行数据库迁移。

**文件路径**：`backend/Dockerfile`

```dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
COPY uv.lock ./

RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY app/ ./app/

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --log-level info"]
```

> **说明**：
> - `--workers 2`：2 个 Uvicorn worker 进程，匹配 2 核 CPU，充分利用多核。
> - 启动时先执行 `alembic upgrade head` 自动迁移数据库，再启动应用。

### 3.3 创建 `frontend/Dockerfile`

**操作目的**：多阶段构建前端镜像。第一阶段编译 Next.js，第二阶段用精简镜像运行。

**文件路径**：`frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN pnpm build

# --- 运行阶段 ---
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["pnpm", "start", "-p", "3000"]
```

> **说明**：`NEXT_PUBLIC_API_BASE_URL` 在构建阶段通过 `--build-arg` 注入，因为 Next.js 的 `NEXT_PUBLIC_` 变量在 `build` 时烘焙到客户端 JS 中。

### 3.4 创建 Nginx 配置

**操作目的**：Nginx 作为反向代理，将 `/api` 开头的请求转发给后端，其余转发给前端。

**文件路径**：`deploy/nginx.conf`

> 以下为**纯 HTTP 版本**（无域名 / 无 HTTPS），通过 ECS 公网 IP 直接访问。后续如需上线域名和 HTTPS，再添加 SSL 配置即可。

```nginx
upstream backend {
    server backend:8000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name _;

    server_tokens off;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    proxy_connect_timeout 30s;
    proxy_read_timeout    120s;
    proxy_send_timeout    30s;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # --- 后端 API 路由 ---
    location /api/ {
        proxy_pass http://backend;
    }

    location /health {
        proxy_pass http://backend;
    }

    location /docs {
        proxy_pass http://backend;
    }

    location /openapi.json {
        proxy_pass http://backend;
    }

    location /redoc {
        proxy_pass http://backend;
    }

    # --- 前端路由 ---
    location / {
        proxy_pass http://frontend;
    }

    location /_next/ {
        proxy_pass http://frontend;
    }
}
```

### 3.5 创建 `docker-compose.prod.yml`

**文件路径**：项目根目录 `docker-compose.prod.yml`

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: dailyplan-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env.prod
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - internal

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: "http://{{ YOUR_ECS_PUBLIC_IP }}"
    container_name: dailyplan-frontend
    restart: unless-stopped
    networks:
      - internal

  nginx:
    image: nginx:1.27-alpine
    container_name: dailyplan-nginx
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_started
    networks:
      - internal

networks:
  internal:
    driver: bridge
```

> **⚠️ 将 `{{ YOUR_ECS_PUBLIC_IP }}` 替换为你的 ECS 公网 IP（如 `47.98.163.97`）。**

### 3.6 创建后端生产环境变量文件

**文件路径**：`backend/.env.prod`（**此文件不要提交到 Git**）

```bash
APP_NAME=DailyPlan API
APP_ENV=production
APP_DEBUG=false
BACKEND_CORS_ORIGINS=["http://{{ YOUR_ECS_PUBLIC_IP }}"]

DB_HOST={{ YOUR_RDS_INTERNAL_HOST }}
DB_PORT=5432
DB_USER=dailyplan
DB_PASSWORD={{ YOUR_DB_PASSWORD }}
DB_NAME=dailyplan
DB_ECHO=false

JWT_SECRET_KEY={{ YOUR_JWT_SECRET }}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

LLM_API_KEY={{ YOUR_LLM_API_KEY }}
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=4096
```

> **⚠️ 必须替换以下占位符：**
> - **`{{ YOUR_ECS_PUBLIC_IP }}`**：你的 ECS 公网 IP（如 `47.98.163.97`）
> - **`{{ YOUR_RDS_INTERNAL_HOST }}`**：RDS 内网连接地址
> - **`{{ YOUR_DB_PASSWORD }}`**：RDS 数据库密码
> - **`{{ YOUR_JWT_SECRET }}`**：一个随机强密钥，可用 `openssl rand -hex 32` 生成
> - **`{{ YOUR_LLM_API_KEY }}`**：通义千问 API Key

确保 `.gitignore` 中已包含 `.env.prod`（当前 `.gitignore` 已有 `.env.*` 规则，已覆盖）。

### 3.7 首次启动

在 ECS 上的项目目录下：

```bash
cd /opt/DailyPlan

# 构建并启动所有容器（首次较慢，约 3-5 分钟）
docker compose -f docker-compose.prod.yml up -d --build

# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看后端日志（确认迁移和启动正常）
docker logs -f dailyplan-backend
```

预期看到：

```
INFO  [alembic.runtime.migration] Running upgrade  -> 20260412_0001, initial_migration
INFO  [alembic.runtime.migration] Running upgrade 20260412_0001 -> 4c0a725afdee, add_task_status
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

然后浏览器访问 `https://{{ YOUR_DOMAIN }}/health`，应返回：

```json
{"status": "ok", "database": "connected"}
```

---

## 第四章：日志、备份与告警（预计 20 分钟）

### 4.1 日志查看方案

**操作目的**：快速定位问题，区分不同类型的日志。

#### 常用命令

```bash
# 查看后端实时日志（请求日志 + 错误日志 + Agent 调用日志）
docker logs -f --tail 100 dailyplan-backend

# 查看前端日志
docker logs -f --tail 100 dailyplan-frontend

# 查看 Nginx 访问日志（含请求状态码）
docker logs -f --tail 100 dailyplan-nginx

# 筛选后端错误日志
docker logs dailyplan-backend 2>&1 | grep -i "error\|traceback\|exception"

# 筛选 5xx 错误
docker logs dailyplan-nginx 2>&1 | grep '" 5[0-9][0-9] '
```

#### 日志持久化（可选增强）

Docker 默认日志驱动会将日志写入宿主机 `/var/lib/docker/containers/`。若需限制磁盘占用，在 `/etc/docker/daemon.json` 中添加：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

修改后重启 Docker：

```bash
systemctl restart docker
```

### 4.2 RDS 自动备份

**操作目的**：确保数据库可恢复到任意时间点。

**控制台路径**：RDS 实例详情 → 备份恢复 → 备份设置

```
确认以下配置：
  数据备份：已开启（默认开启）
  备份周期：每天
  备份保留天数：7 天
  日志备份：已开启
  日志备份保留天数：7 天
```

**验证**：在「备份恢复」→「数据备份」标签页中，应能看到每天的备份记录。

### 4.3 云监控告警

**操作目的**：在 CPU 打满、内存不足或出现大量 5xx 错误时，自动短信/邮件通知你。

**控制台路径**：阿里云控制台 → 云监控 → 报警服务 → 报警规则 → 创建报警规则

#### 告警规则 1：ECS CPU

```
产品：ECS
资源：选择你的 ECS 实例
规则名称：dailyplan-cpu-high
指标：CPU 使用率
阈值：平均值 > 80%，持续 3 个周期（每周期 1 分钟）
通知方式：邮件 + 短信（需先在「报警联系人」中添加手机号和邮箱）
```

#### 告警规则 2：ECS 内存

```
规则名称：dailyplan-memory-high
指标：内存使用率
阈值：平均值 > 80%，持续 3 个周期
```

#### 告警规则 3：5xx 错误监控

由于没有使用 SLB，5xx 监控通过定时检查 Nginx 日志实现。在 ECS 上创建一个简单的 cron 任务：

```bash
cat > /opt/DailyPlan/deploy/check_5xx.sh << 'EOF'
#!/bin/bash
# 统计最近 5 分钟的 5xx 错误数
COUNT=$(docker logs --since 5m dailyplan-nginx 2>&1 | grep -c '" 5[0-9][0-9] ')
if [ "$COUNT" -gt 10 ]; then
    echo "[ALERT] $(date): $COUNT 5xx errors in last 5 minutes" >> /var/log/dailyplan-alert.log
    # 可选：接入钉钉/企业微信 Webhook 推送
fi
EOF

chmod +x /opt/DailyPlan/deploy/check_5xx.sh

# 每 5 分钟执行一次
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/DailyPlan/deploy/check_5xx.sh") | crontab -
```

---

## 第五章：GitHub Actions 自动部署（预计 20 分钟）

**操作目的**：Push 代码到 `main` 分支后，自动部署到 ECS，无需手动 SSH 操作。

### 5.1 生成 SSH 密钥对

在**你的本机**执行：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/dailyplan_deploy -N ""
```

将**公钥**添加到 ECS 的 `authorized_keys`：

```bash
ssh-copy-id -i ~/.ssh/dailyplan_deploy.pub root@{{ YOUR_ECS_PUBLIC_IP }}
```

### 5.2 配置 GitHub Secrets

**路径**：GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret

添加以下 3 个 Secret：

| Secret 名称 | 值 |
|-------------|------|
| `ECS_HOST` | `{{ YOUR_ECS_PUBLIC_IP }}` |
| `ECS_USERNAME` | `root` |
| `SSH_PRIVATE_KEY` | `~/.ssh/dailyplan_deploy` 文件的**完整内容**（包含 `-----BEGIN` 和 `-----END` 行） |

### 5.3 创建 Workflow 文件

**文件路径**：`.github/workflows/deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Aliyun ECS
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ECS_HOST }}
          username: ${{ secrets.ECS_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script_stop: true
          script: |
            cd /opt/DailyPlan

            echo "==> Pulling latest code..."
            git pull origin main

            echo "==> Building and restarting containers..."
            docker compose -f docker-compose.prod.yml up -d --build

            echo "==> Cleaning up old images..."
            docker image prune -f

            echo "==> Waiting for health check..."
            sleep 15
            curl -sf http://localhost:8000/health || (echo "Health check failed!" && exit 1)

            echo "==> Deployment complete!"
```

> **说明**：
> - 使用 `appleboy/ssh-action` 免去自己管理 SSH 连接。
> - 部署后等待 15 秒，执行健康检查确认服务正常，否则标记 CI 失败。
> - `docker image prune -f` 清理旧镜像，避免磁盘占满。

### 5.4 验证 CI/CD

```bash
# 在本地做一个小改动并推送
git add .
git commit -m "ci: add production deployment workflow"
git push origin main
```

在 GitHub 仓库 → Actions 标签页查看运行状态，预期 2-3 分钟内完成。

---

## 第六章：验收测试 Checklist

部署完成后，逐项验证：

- [ ] **HTTPS 访问前端**：浏览器访问 `https://{{ YOUR_DOMAIN }}`，显示 DailyPlan 前端页面
- [ ] **HTTP 自动跳转**：访问 `http://{{ YOUR_DOMAIN }}`，自动 301 跳转到 HTTPS
- [ ] **Swagger 文档**：访问 `https://{{ YOUR_DOMAIN }}/docs`，显示 FastAPI Swagger UI
- [ ] **健康检查**：`curl https://{{ YOUR_DOMAIN }}/health` 返回 `{"status":"ok","database":"connected"}`
- [ ] **注册接口**：通过 Swagger 或 curl 调用 `POST /api/auth/register` 成功创建用户
- [ ] **登录接口**：调用 `POST /api/auth/login` 返回 JWT Token
- [ ] **数据写入 RDS**：在 RDS 控制台 → DMS 登录，确认 `users` 表有新注册的数据
- [ ] **Agent 调用**：创建周目标后调用 `POST /api/agent/plan-week`，能返回 7 天计划
- [ ] **并发测试**：安装 `ab`（Apache Bench），模拟 20 并发

```bash
# 在 ECS 上安装
dnf install -y httpd-tools

# 20 并发，共 200 个请求，测试健康检查端点
ab -n 200 -c 20 https://{{ YOUR_DOMAIN }}/health

# 预期结果：
# - Failed requests: 0
# - Non-2xx responses: 0
# - Requests per second: > 50
```

- [ ] **RDS 备份可查**：RDS 控制台 → 备份恢复 → 数据备份，确认有备份记录
- [ ] **告警配置**：云监控 → 报警规则，确认 CPU 和内存告警规则为「已启用」状态
- [ ] **CI/CD 正常**：Push 到 main 分支后，GitHub Actions 绿色通过，ECS 上容器已更新

---

## 常用运维命令速查

```bash
# === 容器管理 ===
cd /opt/DailyPlan

# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 重启某个服务
docker compose -f docker-compose.prod.yml restart backend

# 完全重建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 停止所有容器
docker compose -f docker-compose.prod.yml down

# === 日志 ===
docker logs -f --tail 200 dailyplan-backend
docker logs -f --tail 200 dailyplan-nginx

# === 进入容器排查 ===
docker exec -it dailyplan-backend bash
docker exec -it dailyplan-nginx sh

# === 数据库迁移（手动执行） ===
docker exec -it dailyplan-backend sh -c "uv run alembic upgrade head"

# === 磁盘清理 ===
docker system prune -af  # 清理所有未使用的镜像、容器、网络
```

---

## 月度成本估算

| 资源 | 规格 | 月费（包年包月参考价） |
|------|------|----------------------|
| ECS | ecs.c7.large（2C4G） | ≈ 150-200 元/月 |
| RDS PostgreSQL | pg.n2.small.1（1C2G，20GB ESSD） | ≈ 80-120 元/月 |
| 公网流量 | 按量付费，预估 10GB/月 | ≈ 8 元/月 |
| 域名 | .com 域名 | ≈ 5 元/月（年付 55 元） |
| SSL 证书 | 阿里云免费 DV 证书 | 0 元 |
| 云监控 | 基础版 | 0 元 |
| **合计** | | **≈ 250-340 元/月** |

> 新用户首购 ECS + RDS 通常有优惠活动，实际首年成本可低至 **100-150 元/月**。按量付费适合试用阶段，包年包月适合长期运行。
