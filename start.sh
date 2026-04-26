#!/bin/bash

# Card Auto Server 启动脚本

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Card Auto Server 启动脚本${NC}"

# 检查.env文件是否存在
if [ ! -f .env ]; then
    echo -e "${YELLOW}未找到.env文件，正在创建...${NC}"
    cp env.example .env
    echo -e "${GREEN}.env文件已创建，请编辑.env文件配置API密钥${NC}"
fi

# 构建并启动容器
echo -e "${GREEN}正在构建镜像...${NC}"
docker-compose build

echo -e "${GREEN}正在启动服务...${NC}"
docker-compose up -d

# 等待服务启动
echo -e "${GREEN}等待服务启动...${NC}"
sleep 3

# 检查服务状态
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ 服务启动成功！${NC}"
    echo -e "${GREEN}访问地址: http://localhost:8000${NC}"
    echo -e "${YELLOW}查看日志: docker-compose logs -f${NC}"
    echo -e "${YELLOW}停止服务: docker-compose down${NC}"
else
    echo -e "\033[0;31m❌ 服务启动失败，请检查日志: docker-compose logs${NC}"
fi
