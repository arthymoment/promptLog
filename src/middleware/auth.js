const db = require('../db');
const logger = require('../logger');

/**
 * API Key 驗證中介層
 * 從 X-API-Key header 取得 key，查 DB 驗證是否有效
 * 驗證成功後將 project_id 掛載至 req.projectId
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    logger.warn(`[AUTH] 缺少 X-API-Key header - ${req.method} ${req.originalUrl} from ${req.ip}`);
    return res.status(401).json({ error: '缺少 API Key，請在 X-API-Key header 中提供' });
  }

  const record = db.prepare(
    'SELECT k.id, k.project_id, k.is_active, p.name as project_name FROM api_keys k JOIN projects p ON k.project_id = p.id WHERE k.key = ?'
  ).get(apiKey);

  if (!record) {
    logger.warn(`[AUTH] 無效的 API Key: ${apiKey.substring(0, 8)}... from ${req.ip}`);
    return res.status(401).json({ error: '無效的 API Key' });
  }

  if (!record.is_active) {
    logger.warn(`[AUTH] 已停用的 API Key: ${apiKey.substring(0, 8)}... from ${req.ip}`);
    return res.status(401).json({ error: 'API Key 已停用' });
  }

  req.projectId = record.project_id;
  req.projectName = record.project_name;
  next();
}

/**
 * Admin Key 驗證中介層
 * 從 X-Admin-Key header 取得 key，與環境變數 ADMIN_KEY 比對
 */
function adminAuthMiddleware(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    logger.error('[ADMIN AUTH] ADMIN_KEY 未設定於環境變數中');
    return res.status(500).json({ error: '伺服器設定錯誤：ADMIN_KEY 未設定' });
  }

  if (!adminKey || adminKey !== expectedKey) {
    logger.warn(`[ADMIN AUTH] 無效的 Admin Key from ${req.ip}`);
    return res.status(401).json({ error: '無效的 Admin Key，請在 X-Admin-Key header 中提供' });
  }

  next();
}

module.exports = { authMiddleware, adminAuthMiddleware };
