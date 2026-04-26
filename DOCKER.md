# Docker 部署指南

## 快速启动

```bash
# 启动服务
./start.sh

# 停止服务
./stop.sh
```

## 手动启动

### 1. 配置环境变量

```bash
cp env.example .env
# 编辑.env文件，填入API密钥
vi .env
```

### 2. 启动服务

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `8000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `REAL_API_KEY` | API密钥 | - |
| `INVITER_CODE` | 邀请码 | - |
| `DEVICE_ID` | 设备ID | `browser-fingerprint` |

### 数据持久化

数据库文件 `redeem_history.db` 会自动挂载到宿主机，删除容器不会丢失数据。

## 健康检查

服务会自动进行健康检查，可以通过以下命令查看：

```bash
docker-compose ps
```

## 日志

日志文件会自动轮转，最大保存3个文件，每个文件最大10MB。

查看实时日志：

```bash
docker-compose logs -f
```

## 常见问题

### 端口被占用

```bash
# 查看端口占用
lsof -i :8000

# 或修改.env中的PORT变量后重启
docker-compose restart
```

### 构建失败

```bash
# 清理缓存重新构建
docker-compose build --no-cache
```
