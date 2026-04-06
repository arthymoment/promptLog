require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/promptlog.db';

// 確保資料庫目錄存在
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 啟動前清理殘留 SHM 檔案：當 WAL 為空（上次正常關閉）但 SHM 仍存在時，
// 舊 SHM 的 WAL 索引可能造成 SQLite 誤讀 WAL 狀態，刪除後 SQLite 會自動重建。
const resolvedDbPath = path.resolve(DB_PATH);
const walPath = resolvedDbPath + '-wal';
const shmPath = resolvedDbPath + '-shm';
const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
if (walSize === 0 && fs.existsSync(shmPath)) {
  try {
    fs.unlinkSync(shmPath);
  } catch (_) {}
}

const db = new Database(DB_PATH);

// 啟動時強制 WAL checkpoint，確保前次未合併的 WAL 資料寫入主 db
// 防止容器重啟後因 WAL/SHM 狀態不一致導致資料遺失
db.pragma('wal_checkpoint(TRUNCATE)');

// 啟用 WAL 模式以提升並發效能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建立資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    project_id INTEGER NOT NULL,
    label TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user TEXT,
    model TEXT,
    prompt TEXT NOT NULL,
    prompt_tokens INTEGER,
    total_tokens INTEGER,
    extra TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_user ON prompts(user);
  CREATE INDEX IF NOT EXISTS idx_prompts_model ON prompts(model);
  CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
`);

module.exports = db;
