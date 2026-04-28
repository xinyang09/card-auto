#!/bin/bash

set -u

# Card Auto 本地停止脚本

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
NODE_PID_FILE="$RUN_DIR/node.pid"
PYTHON_PID_FILE="$RUN_DIR/python.pid"

stop_service() {
    local name="$1"
    local pid_file="$2"

    if [ ! -f "$pid_file" ]; then
        echo "${name}: 未找到 PID 文件，跳过"
        return 0
    fi

    local pid
    pid="$(tr -d '[:space:]' < "$pid_file")"

    if [ -z "$pid" ]; then
        rm -f "$pid_file"
        echo "${name}: PID 文件为空，已清理"
        return 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "${name}: 进程已不存在，已清理 PID 文件"
        return 0
    fi

    echo "${name}: 正在停止 PID ${pid}"
    kill "$pid"

    for _ in $(seq 1 10); do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$pid_file"
            echo "${name}: 已停止"
            return 0
        fi
        sleep 1
    done

    echo "${name}: 未在预期时间内退出，请手动检查 PID ${pid}"
    return 1
}

overall_status=0

stop_service "Node 服务" "$NODE_PID_FILE" || overall_status=1
stop_service "Python 支付服务" "$PYTHON_PID_FILE" || overall_status=1

exit "$overall_status"
