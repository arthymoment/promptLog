const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const logger = require('../logger');
const { adminAuthMiddleware } = require('../middleware/auth');
const { convertToUTC8 } = require('../utils/time');

// 所有管理路由皆需 Admin Key
router.use(adminAuthMiddleware);

// ─── 專案管理 ───────────────────────────────────────────────

/**
 * POST /api/admin/projects
 * 建立新專案
 * Body: { name, description }
 */
router.post('/projects', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '`name` 欄位為必填' });
    }

    const result = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)').run(name.trim(), description || null);
    logger.info(`[ADMIN] 建立專案 id=${result.lastInsertRowid} name=${name}`);
    return res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), description: description || null });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '專案名稱已存在' });
    }
    logger.error(`[ADMIN] 建立專案失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * GET /api/admin/projects
 * 列出所有專案（含 API Key 數量與 Prompt 數量）
 */
router.get('/projects', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.description, p.created_at,
             (SELECT COUNT(*) FROM api_keys k WHERE k.project_id = p.id AND k.is_active = 1) as active_keys,
             (SELECT COUNT(*) FROM prompts pr WHERE pr.project_id = p.id) as prompt_count
      FROM projects p
      ORDER BY p.created_at DESC
    `).all();
    return res.json(rows);
  } catch (err) {
    logger.error(`[ADMIN] 列出專案失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * DELETE /api/admin/projects/:id
 * 刪除專案（同時刪除其 API Keys 與 Prompts）
 */
router.delete('/projects/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '無效的 ID' });

    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: '找不到該專案' });

    logger.info(`[ADMIN] 刪除專案 id=${id}`);
    return res.json({ message: '專案已刪除' });
  } catch (err) {
    logger.error(`[ADMIN] 刪除專案失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

// ─── API Key 管理 ────────────────────────────────────────────

/**
 * POST /api/admin/keys
 * 產生新 API Key
 * Body: { project_id, label }
 */
router.post('/keys', (req, res) => {
  try {
    const { project_id, label } = req.body;
    if (!project_id) return res.status(400).json({ error: '`project_id` 欄位為必填' });

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) return res.status(404).json({ error: '找不到指定的專案' });

    const newKey = `plk_${uuidv4().replace(/-/g, '')}`;
    const result = db.prepare('INSERT INTO api_keys (key, project_id, label) VALUES (?, ?, ?)').run(newKey, project_id, label || null);

    logger.info(`[ADMIN] 產生 API Key id=${result.lastInsertRowid} project_id=${project_id} label=${label || '-'}`);
    return res.status(201).json({
      id: result.lastInsertRowid,
      key: newKey,
      project_id,
      label: label || null,
      is_active: 1
    });
  } catch (err) {
    logger.error(`[ADMIN] 產生 API Key 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * GET /api/admin/keys
 * 列出所有 API Key（隱藏完整 key，只顯示前 12 碼）
 * Query: project_id (可選過濾)
 */
router.get('/keys', (req, res) => {
  try {
    const { project_id } = req.query;
    let query = `
      SELECT k.id, substr(k.key, 1, 12) || '...' as key_preview, k.project_id,
             p.name as project_name, k.label, k.is_active, k.created_at
      FROM api_keys k JOIN projects p ON k.project_id = p.id
    `;
    const params = [];
    if (project_id) {
      query += ' WHERE k.project_id = ?';
      params.push(parseInt(project_id));
    }
    query += ' ORDER BY k.created_at DESC';

    return res.json(db.prepare(query).all(...params));
  } catch (err) {
    logger.error(`[ADMIN] 列出 API Key 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * PATCH /api/admin/keys/:id
 * 啟用或停用 API Key
 * Body: { is_active: 0 | 1 }
 */
router.patch('/keys/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { is_active } = req.body;
    if (!id) return res.status(400).json({ error: '無效的 ID' });
    if (is_active !== 0 && is_active !== 1) return res.status(400).json({ error: '`is_active` 須為 0 或 1' });

    const result = db.prepare('UPDATE api_keys SET is_active = ? WHERE id = ?').run(is_active, id);
    if (result.changes === 0) return res.status(404).json({ error: '找不到該 API Key' });

    logger.info(`[ADMIN] API Key id=${id} 狀態更新為 is_active=${is_active}`);
    return res.json({ message: `API Key 已${is_active ? '啟用' : '停用'}` });
  } catch (err) {
    logger.error(`[ADMIN] 更新 API Key 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * DELETE /api/admin/keys/:id
 * 刪除 API Key
 */
router.delete('/keys/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '無效的 ID' });

    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: '找不到該 API Key' });

    logger.info(`[ADMIN] 刪除 API Key id=${id}`);
    return res.json({ message: 'API Key 已刪除' });
  } catch (err) {
    logger.error(`[ADMIN] 刪除 API Key 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

// ─── Prompt 管理 ────────────────────────────────────────────

/**
 * GET /api/admin/prompts
 * 列出所有 Prompts（支援跨專案過濾與分頁）
 *
 * Query 參數：
 *   - project_id: 指定專案 ID（可選）
 *   - user: 使用者識別（模糊比對）
 *   - model: 模型名稱（模糊比對）
 *   - keyword: Prompt 內容關鍵字（模糊比對）
 *   - start_date: 開始日期（YYYY-MM-DD）
 *   - end_date: 結束日期（YYYY-MM-DD）
 *   - page: 頁碼（預設 1）
 *   - limit: 每頁筆數（預設 20，最大 100）
 */
router.get('/prompts', (req, res) => {
  try {
    const { project_id, user, model, keyword, start_date, end_date, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // 選擇性過濾專案
    if (project_id) {
      conditions.push('p.project_id = ?');
      params.push(parseInt(project_id));
    }

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

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM prompts p${where}`).get(...params).cnt;
    const rows = db.prepare(`
      SELECT p.id, p.project_id, pr.name as project_name, p.user, p.model,
             p.prompt, p.prompt_tokens, p.total_tokens, p.extra, p.created_at
      FROM prompts p
      JOIN projects pr ON p.project_id = pr.id
      ${where}
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
    logger.error(`[ADMIN] 查詢 Prompts 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

/**
 * DELETE /api/admin/prompts/:id
 * 刪除指定 Prompt 記錄（跨專案）
 */
router.delete('/prompts/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '無效的 ID' });

    const prompt = db.prepare('SELECT project_id FROM prompts WHERE id = ?').get(id);
    if (!prompt) return res.status(404).json({ error: '找不到該 Prompt 記錄' });

    const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);

    logger.info(`[ADMIN] 刪除 Prompt id=${id} project_id=${prompt.project_id}`);
    return res.json({ message: 'Prompt 已刪除' });
  } catch (err) {
    logger.error(`[ADMIN] 刪除 Prompt 失敗: ${err.message}`);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

module.exports = router;
