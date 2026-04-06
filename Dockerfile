FROM node:20-alpine

WORKDIR /app

# 安裝 better-sqlite3 編譯所需工具
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

# 建立必要目錄
RUN mkdir -p logs/system logs/prompt data

EXPOSE 3000

CMD ["node", "src/app.js"]
