#!/bin/bash

set -u

# Card Auto 本地启动脚本

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
NODE_PID_FILE="$RUN_DIR/node.pid"
PYTHON_PID_FILE="$RUN_DIR/python.pid"
NODE_LOG_FILE="$LOG_DIR/node.log"
PYTHON_LOG_FILE="$LOG_DIR/python.log"
NODE_STARTED_BY_SCRIPT=0
PYTHON_STARTED_BY_SCRIPT=0

mkdir -p "$RUN_DIR" "$LOG_DIR"

echo -e "${GREEN}Card Auto 本地启动脚本${NC}"

if [ ! -f "$ROOT_DIR/.env" ]; then
    echo -e "${YELLOW}未找到 .env 文件，正在创建...${NC}"
    cp "$ROOT_DIR/env.example" "$ROOT_DIR/.env"
    echo -e "${GREEN}.env 文件已创建${NC}"
fi

read_env_value() {
    local key="$1"
    local default_value="$2"
    local raw_value

    raw_value="$(grep -E "^${key}=" "$ROOT_DIR/.env" | tail -n 1 | cut -d= -f2-)"
    raw_value="${raw_value%\"}"
    raw_value="${raw_value#\"}"
    raw_value="${raw_value%\'}"
    raw_value="${raw_value#\'}"

    if [ -n "$raw_value" ]; then
        printf '%s' "$raw_value"
    else
        printf '%s' "$default_value"
    fi
}

APP_PORT="$(read_env_value PORT 8000)"
BIND_HOST="${LOCAL_BIND_HOST:-127.0.0.1}"
PYTHON_PORT=5001
PAYMENT_PROXY_MODE_VALUE="$(read_env_value PAYMENT_PROXY_MODE direct)"
PAYMENT_PROXY_TEMPLATE_VALUE="$(read_env_value PAYMENT_PROXY_TEMPLATE "")"
PAYMENT_REQUEST_TIMEOUT_SECONDS_VALUE="$(read_env_value PAYMENT_REQUEST_TIMEOUT_SECONDS 12)"

command -v node >/dev/null 2>&1 || {
    echo -e "${RED}未找到 node，请先安装 Node.js${NC}"
    exit 1
}

command -v python3 >/dev/null 2>&1 || {
    echo -e "${RED}未找到 python3，请先安装 Python 3${NC}"
    exit 1
}

command -v curl >/dev/null 2>&1 || {
    echo -e "${RED}未找到 curl，无法进行启动健康检查${NC}"
    exit 1
}

python3 -c "import flask, tls_client" >/dev/null 2>&1 || {
    echo -e "${RED}Python 依赖未安装，请运行: pip3 install -r requirements-python.txt${NC}"
    exit 1
}

if [ ! -d "$ROOT_DIR/node_modules" ]; then
    echo -e "${RED}未找到 node_modules，请先运行: npm install${NC}"
    exit 1
fi

is_pid_running() {
    local pid="$1"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        tr -d '[:space:]' < "$pid_file"
    fi
}

clear_stale_pid() {
    local name="$1"
    local pid_file="$2"
    local pid
    pid="$(read_pid "$pid_file")"

    if [ -n "${pid:-}" ] && ! is_pid_running "$pid"; then
        rm -f "$pid_file"
        echo -e "${YELLOW}${name} 的旧 PID 已清理${NC}"
    fi
}

port_in_use() {
    local port="$1"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

pid_for_port() {
    local port="$1"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1
}

wait_for_http() {
    local url="$1"
    local attempts=20
    local probe_file="$RUN_DIR/.healthcheck.tmp"

    for _ in $(seq 1 "$attempts"); do
        if curl -fsS "$url" -o "$probe_file" 2>/dev/null; then
            rm -f "$probe_file"
            return 0
        fi
        sleep 1
    done

    rm -f "$probe_file"
    return 1
}

show_log_hint() {
    local log_file="$1"
    echo -e "${YELLOW}日志文件: ${log_file}${NC}"
    if [ -f "$log_file" ]; then
        echo -e "${YELLOW}最近日志:${NC}"
        tail -n 20 "$log_file"
    fi
}

stop_pid_file() {
    local pid_file="$1"
    local pid
    pid="$(read_pid "$pid_file")"

    if [ -n "${pid:-}" ] && is_pid_running "$pid"; then
        kill "$pid" >/dev/null 2>&1 || true
    fi

    rm -f "$pid_file"
}

start_node() {
    local pid
    pid="$(read_pid "$NODE_PID_FILE")"

    if [ -n "${pid:-}" ] && is_pid_running "$pid"; then
        echo -e "${YELLOW}Node 服务已在运行，PID: ${pid}${NC}"
        return 0
    fi

    if port_in_use "$APP_PORT"; then
        if wait_for_http "http://${BIND_HOST}:${APP_PORT}/api/status"; then
            pid="$(pid_for_port "$APP_PORT")"
            if [ -n "${pid:-}" ]; then
                echo "$pid" > "$NODE_PID_FILE"
            fi
            echo -e "${YELLOW}Node 服务已在端口 ${APP_PORT} 运行，直接复用${NC}"
            return 0
        fi

        echo -e "${RED}端口 ${APP_PORT} 已被其他进程占用，Node 服务未启动${NC}"
        return 1
    fi

    echo -e "${GREEN}正在启动 Node 服务...${NC}"
    nohup env HOST="$BIND_HOST" node "$ROOT_DIR/server.mjs" >> "$NODE_LOG_FILE" 2>&1 &
    echo $! > "$NODE_PID_FILE"
    NODE_STARTED_BY_SCRIPT=1

    if ! wait_for_http "http://${BIND_HOST}:${APP_PORT}/api/status"; then
        echo -e "${RED}Node 服务启动失败${NC}"
        stop_pid_file "$NODE_PID_FILE"
        show_log_hint "$NODE_LOG_FILE"
        return 1
    fi

    echo -e "${GREEN}Node 服务已启动，PID: $(read_pid "$NODE_PID_FILE")${NC}"
}

start_python() {
    local pid
    pid="$(read_pid "$PYTHON_PID_FILE")"

    if [ -n "${pid:-}" ] && is_pid_running "$pid"; then
        echo -e "${YELLOW}Python 支付服务已在运行，PID: ${pid}${NC}"
        return 0
    fi

    if port_in_use "$PYTHON_PORT"; then
        if wait_for_http "http://${BIND_HOST}:${PYTHON_PORT}/"; then
            pid="$(pid_for_port "$PYTHON_PORT")"
            if [ -n "${pid:-}" ]; then
                echo "$pid" > "$PYTHON_PID_FILE"
            fi
            echo -e "${YELLOW}Python 支付服务已在端口 ${PYTHON_PORT} 运行，直接复用${NC}"
            return 0
        fi

        echo -e "${RED}端口 ${PYTHON_PORT} 已被其他进程占用，Python 支付服务未启动${NC}"
        return 1
    fi

    echo -e "${GREEN}正在启动 Python 支付服务...${NC}"
    nohup env PAYMENT_SERVICE_HOST="$BIND_HOST" PAYMENT_SERVICE_PORT="$PYTHON_PORT" PAYMENT_PROXY_MODE="$PAYMENT_PROXY_MODE_VALUE" PAYMENT_PROXY_TEMPLATE="$PAYMENT_PROXY_TEMPLATE_VALUE" PAYMENT_REQUEST_TIMEOUT_SECONDS="$PAYMENT_REQUEST_TIMEOUT_SECONDS_VALUE" python3 "$ROOT_DIR/1.py" >> "$PYTHON_LOG_FILE" 2>&1 &
    echo $! > "$PYTHON_PID_FILE"
    PYTHON_STARTED_BY_SCRIPT=1

    if ! wait_for_http "http://${BIND_HOST}:${PYTHON_PORT}/"; then
        echo -e "${RED}Python 支付服务启动失败${NC}"
        stop_pid_file "$PYTHON_PID_FILE"
        show_log_hint "$PYTHON_LOG_FILE"
        return 1
    fi

    echo -e "${GREEN}Python 支付服务已启动，PID: $(read_pid "$PYTHON_PID_FILE")${NC}"
}

clear_stale_pid "Node 服务" "$NODE_PID_FILE"
clear_stale_pid "Python 支付服务" "$PYTHON_PID_FILE"

if ! start_node; then
    exit 1
fi

if ! start_python; then
    if [ "$NODE_STARTED_BY_SCRIPT" -eq 1 ]; then
        echo -e "${YELLOW}Python 启动失败，正在回滚本次启动的 Node 服务...${NC}"
        stop_pid_file "$NODE_PID_FILE"
    fi
    exit 1
fi

echo -e "${GREEN}✅ 本地服务启动成功${NC}"
echo -e "${GREEN}访问地址: http://${BIND_HOST}:${APP_PORT}${NC}"
echo -e "${GREEN}Python 支付服务: http://${BIND_HOST}:${PYTHON_PORT}${NC}"
echo -e "${YELLOW}Node 日志: ${NODE_LOG_FILE}${NC}"
echo -e "${YELLOW}Python 日志: ${PYTHON_LOG_FILE}${NC}"
echo -e "${YELLOW}停止服务: ./stop.sh${NC}"
