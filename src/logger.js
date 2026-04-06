require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const { formatUTC8Display, formatUTC8Ts } = require('./utils/time');

// 確保 log 目錄存在
const logSystemDir = path.resolve('./logs/system');
const logPromptDir = path.resolve('./logs/prompt');
[logSystemDir, logPromptDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 以啟動時間命名 log 檔案（UTC+8）
const ts = formatUTC8Ts();

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: () => formatUTC8Display() }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logSystemDir, `system_${ts}.log`) })
  ]
});

module.exports = logger;
