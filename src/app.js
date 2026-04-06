require('dotenv').config();
const express = require('express');
const logger = require('./logger');
const { formatUTC8ISO } = require('./utils/time');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介層
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 請求日誌
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms from ${req.ip}`);
  });
  next();
});

// 路由
app.use('/api/prompts', require('./routes/prompts'));
app.use('/api/admin', require('./routes/admin'));

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: formatUTC8ISO() });
});

// 404 處理
app.use((req, res) => {
  res.status(404).json({ error: '找不到該路徑' });
});

// 全域錯誤處理
app.use((err, req, res, next) => {
  logger.error(`未捕捉的錯誤: ${err.message}`);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

app.listen(PORT, () => {
  logger.info(`PromptLog 伺服器已啟動，監聽埠 ${PORT}`);
});

// 優雅關閉：確保 SQLite WAL checkpoint 完成後再退出，防止資料遺失
const db = require('./db');

function gracefulShutdown(signal) {
  logger.info(`收到 ${signal}，正在優雅關閉...`);
  try {
    // 明確執行 TRUNCATE checkpoint，確保所有 WAL frames 寫入主 DB
    // db.close() 只觸發 PASSIVE checkpoint，無法保證全部資料寫入
    const result = db.pragma('wal_checkpoint(TRUNCATE)');
    logger.info(`WAL checkpoint 完成: ${JSON.stringify(result)}`);
    db.close();
    logger.info('資料庫連線已安全關閉（WAL 已合併）');
  } catch (err) {
    logger.error(`關閉資料庫時發生錯誤: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

module.exports = app;
