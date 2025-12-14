# -----------------------------------------------------------------------------
# 核心改变：使用 Debian (bullseye-slim) 替代 Alpine
# 解决了 glibc 兼容性问题，下载的内核可以直接运行，无需 gcompat
# -----------------------------------------------------------------------------
FROM node:lts-bullseye-slim

# 设置工作目录
WORKDIR /usr/app

# 1. 安装基础工具
# ca-certificates: 必须！否则 axios 无法下载 https 链接
# curl/wget: 调试用
# iproute2: 部分网络工具需要
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    wget \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# 2. 复制依赖文件并安装
COPY package*.json ./
RUN npm install

# 3. 复制源码
COPY . .

# 4. 暴露端口
EXPOSE 3000

# 5. 关键步骤：创建并授权 tmp 目录
# 很多时候脚本运行失败是因为没有权限在容器里创建文件
# 这里直接建立文件夹并给满权限
RUN mkdir -p tmp && chmod 777 tmp

# 6. 启动命令
CMD ["node", "index.js"]
