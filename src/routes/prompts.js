const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const { authMiddleware } = require('../middleware/auth');
const { convertToUTC8 } = require('../utils/time');

// 所有路由皆需 API Key 驗證
router.use(authMiddleware);

/**
 * POST /api/prompts
 * 新增一筆 Prompt 記錄
 *
 * Body:
 *   - prompt (必填): Prompt 內容
 *   - model (可選): 模型名稱，如 gpt-4o
 *   - user (可選): 使用者識別
 *   - prompt_tokens (可選): Prompt token 數
 *   - total_tokens (可選): 總 token 數
 *   - extra (可選): 任意附加資訊 (JSON object)
 */
router.post('/', (req, res) => {
  try {
    const { prompt, model, user, prompt_tokens, total_tokens, extra } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: '`prompt` 欄位為必填且不可為空' });
    }

    const extraStr = extra ? JSON.stringify(extra) : null;

    const result = db.prepare(`
      INSERT INTO prompts (project_id, user, model, prompt, prompt_tokens, total_tokens, extra)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.projectId,
      user || null,
      model || null,
      prompt.trim(),
      Number.isInteger(prompt_tokens) ? prompt_tokens : null,
      Number.isInteger(total_tokens) ? total_tokens : null,
      extraStr
    );

    logger.info(`[PROMPTS] 新增 id=${result.lastInsertRowid} project=${req.projectName} model=${model || '-'} user=${user || '-'}`);

    return res.status(201).json({
      id: result.lastInsertRowid,
      message: '記錄成功'
    });
  } catch (err) {
    logger.error(`[PROMPTS] POST 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * GET /api/prompts
 * 查詢 Prompt 記錄（支援過濾與分頁）
 *
 * Query 參數：
 *   - user: 使用者識別（模糊比對）
 *   - model: 模型名稱（模糊比對）
 *   - keyword: Prompt 內容關鍵字（模糊比對）
 *   - start_date: 開始日期（YYYY-MM-DD）
 *   - end_date: 結束日期（YYYY-MM-DD）
 *   - project_id: 指定專案 ID（需同屬此 API Key 的專案，或 admin 用）
 *   - page: 頁碼（預設 1）
 *   - limit: 每頁筆數（預設 20，最大 100）
 */
router.get('/', (req, res) => {
  try {
    const { user, model, keyword, start_date, end_date, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['p.project_id = ?'];
    const params = [req.projectId];

    if (user) {
      conditions.push('p.user LIKE ?');
      params.push(`%${user}%`);
    }
    if (model) {
      conditions.push('p.model LIKE ?');
      params.push(`%${model}%`);
    }
    if (keyword) {
      conditions.push('p.prompt LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (start_date) {
      conditions.push("p.created_at >= ?");
      params.push(`${start_date} 00:00:00`);
    }
    if (end_date) {
      conditions.push("p.created_at <= ?");
      params.push(`${end_date} 23:59:59`);
    }

    const where = conditions.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM prompts p WHERE ${where}`).get(...params).cnt;
    const rows = db.prepare(`
      SELECT p.id, p.project_id, pr.name as project_name, p.user, p.model,
             p.prompt, p.prompt_tokens, p.total_tokens, p.extra, p.created_at
      FROM prompts p
      JOIN projects pr ON p.project_id = pr.id
      WHERE ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    // 解析 extra JSON 並轉換時間為 UTC+8
    const data = rows.map(r => ({
      ...r,
      created_at: convertToUTC8(r.created_at),
      extra: r.extra ? JSON.parse(r.extra) : null
    }));

    return res.json({
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum),
      data
    });
  } catch (err) {
    logger.error(`[PROMPTS] GET 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * GET /api/prompts/:id
 * 取得單筆 Prompt 記錄
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '無效的 ID' });

    const row = db.prepare(`
      SELECT p.*, pr.name as project_name
      FROM prompts p JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = ? AND p.project_id = ?
    `).get(id, req.projectId);

    if (!row) return res.status(404).json({ error: '找不到該記錄' });

    return res.json({
      ...row,
      created_at: convertToUTC8(row.created_at),
      extra: row.extra ? JSON.parse(row.extra) : null
    });
  } catch (err) {
    logger.error(`[PROMPTS] GET /:id 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * DELETE /api/prompts/:id
 * 刪除單筆 Prompt 記錄
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '無效的 ID' });

    const result = db.prepare('DELETE FROM prompts WHERE id = ? AND project_id = ?').run(id, req.projectId);

    if (result.changes === 0) return res.status(404).json({ error: '找不到該記錄或無權限刪除' });

    logger.info(`[PROMPTS] 刪除 id=${id} project=${req.projectName}`);
    return res.json({ message: '刪除成功' });
  } catch (err) {
    logger.error(`[PROMPTS] DELETE 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

module.exports = router;
