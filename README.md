\ufeff# PromptLog

一套讓 LLM 自動記錄每次 Prompt 的 API 服務系統。透過在 LLM 的系統提示詞中注入指令，LLM 每次收到使用者輸入後，會自動呼叫此 API 將 Prompt 及相關資訊儲存起來，以供後續分析。

---

## 主要功能

- 📝 **Prompt 記錄**：儲存 Prompt 內容、模型名稱、使用者識別、Token 數、時間戳記
- 🔑 **多專案/多使用者**：每個專案擁有獨立 API Key，隔離資料存取
- 🔍 **彈性查詢**：支援以專案、使用者、模型、關鍵字、日期範圍過濾，並分頁回傳
- 🔒 **API Key 驗證**：所有操作皆需驗證，管理操作需額外 Admin Key
- 🐳 **Docker 部署**：以 Docker Compose 運行，資料持久化於 Volume

---

## 快速開始

### 1. 環境設定

```bash
cp .env.example .env
# 編輯 .env，設定 ADMIN_KEY
```

### 2. 啟動服務

```bash
docker-compose up -d
```

### 3. 建立第一個專案與 API Key

```bash
# 建立專案
curl -X POST http://localhost:3000/api/admin/projects \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project", "description": "我的第一個專案"}'

# 產生 API Key (使用上一步回傳的 project_id)
curl -X POST http://localhost:3000/api/admin/keys \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "label": "主要使用"}'
```

---

## API 說明

### 認證方式

| 動作 | Header |
|------|--------|
| 一般 API | `X-API-Key: <your-api-key>` |
| 管理 API | `X-Admin-Key: <admin-key>` |

---

### Prompt API

#### `POST /api/prompts` — 新增 Prompt 記錄

**Header：** `X-API-Key`

**Request Body：**

```json
{
  "prompt": "使用者輸入的 Prompt 內容（必填）",
  "model": "gpt-4o",
  "user": "user-001",
  "prompt_tokens": 128,
  "total_tokens": 512,
  "extra": { "session_id": "abc123" }
}
```

**Response：**

```json
{ "id": 1, "message": "記錄成功" }
```

---

#### `GET /api/prompts` — 查詢 Prompt 記錄

**Header：** `X-API-Key`

**Query 參數：**

| 參數 | 說明 | 範例 |
|------|------|------|
| `user` | 使用者識別（模糊） | `user-001` |
| `model` | 模型名稱（模糊） | `gpt-4` |
| `keyword` | Prompt 內容關鍵字 | `翻譯` |
| `start_date` | 開始日期 | `2026-02-01` |
| `end_date` | 結束日期 | `2026-02-28` |
| `page` | 頁碼（預設 1） | `2` |
| `limit` | 每頁筆數（預設 20，最大 100） | `50` |

**Response：**

```json
{
  "total": 150,
  "page": 1,
  "limit": 20,
  "total_pages": 8,
  "data": [ { "id": 1, "prompt": "...", "model": "gpt-4o", ... } ]
}
```

---

#### `GET /api/prompts/:id` — 取得單筆記錄

**Header：** `X-API-Key`

---

#### `DELETE /api/prompts/:id` — 刪除單筆記錄

**Header：** `X-API-Key`

---

### 管理 API

所有管理 API 需帶 `X-Admin-Key` header。

#### 專案管理

| Method | 路徑 | 說明 |
|--------|------|------|
| `POST` | `/api/admin/projects` | 建立專案 |
| `GET` | `/api/admin/projects` | 列出所有專案 |
| `DELETE` | `/api/admin/projects/:id` | 刪除專案 |

#### API Key 管理

| Method | 路徑 | 說明 |
|--------|------|------|
| `POST` | `/api/admin/keys` | 產生 API Key |
| `GET` | `/api/admin/keys` | 列出所有 Key |
| `PATCH` | `/api/admin/keys/:id` | 啟用/停用 Key |
| `DELETE` | `/api/admin/keys/:id` | 刪除 Key |

#### Prompt 管理（跨專案查詢）

| Method | 路徑 | 說明 |
|--------|------|------|
| `GET` | `/api/admin/prompts` | 查詢所有 Prompt（支援跨專案過濾） |
| `DELETE` | `/api/admin/prompts/:id` | 刪除 Prompt 記錄 |

**`GET /api/admin/prompts` Query 參數：**

| 參數 | 說明 | 範例 |
|------|------|------|
| `project_id` | 過濾特定專案（可選） | `3` |
| `user` | 使用者識別（模糊） | `user-001` |
| `model` | 模型名稱（模糊） | `gpt-4` |
| `keyword` | Prompt 內容關鍵字 | `翻譯` |
| `start_date` | 開始日期 | `2026-02-01` |
| `end_date` | 結束日期 | `2026-02-28` |
| `page` | 頁碼（預設 1） | `2` |
| `limit` | 每頁筆數（預設 20，最大 100） | `50` |

---

### 健康檢查

```
GET /health
```

---

## LLM 系統提示詞範本

將以下內容加入 LLM 的「系統提示詞 (System Prompt)」，LLM 每次收到使用者 Prompt 後即會自動呼叫 API 記錄：

```
每當我收到使用者的輸入時，你必須在回應之前，以 HTTP POST 請求呼叫以下 API 記錄此次 Prompt：

URL: https://your-domain.com/api/prompts
Method: POST
Headers:
  X-API-Key: <your-api-key>
  Content-Type: application/json

Body（JSON）：
{
  "prompt": "<使用者輸入的完整內容>",
  "model": "<你目前使用的模型名稱>",
  "user": "<使用者識別，如有的話>",
  "prompt_tokens": <prompt token 數量，如可取得>,
  "total_tokens": <總 token 數量，如可取得>
}

呼叫成功後再繼續回應使用者。若 API 呼叫失敗，仍需正常回應使用者，並在回應末尾簡短告知記錄失敗。
```

---

## 目錄結構

```
promptLog/
├── src/
│   ├── app.js              # Express 主程式
│   ├── db.js               # SQLite 初始化與 schema
│   ├── logger.js           # Winston 日誌設定
│   ├── middleware/
│   │   └── auth.js         # API Key / Admin Key 驗證
│   └── routes/
│       ├── prompts.js      # Prompt CRUD
│       └── admin.js        # 管理端點
├── logs/
│   ├── system/             # 系統執行 log（system_YYYY_MMDD_HHmm_ss.log）
│   └── prompt/             # 備用 prompt log
├── docs/
│   └── version.md          # 版本記錄
├── data/                   # SQLite DB（docker volume 掛載）
├── .env.example            # 環境變數範本
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 常見問題與故障排除

### Q: POST 新增 Prompt 成功，但 GET 查詢看不到？

**A:** 這是因為 PromptLog 採用多租戶架構。每把 API Key 只能存取其所屬專案的資料。

**解決方式：**
1. **確認使用同一把 API Key** - POST 和 GET 必須用相同的 Key
2. **使用 Admin API 跨專案查詢** - 用 Admin Key 呼叫 `/api/admin/prompts` 端點查詢所有專案的資料

詳細說明請參閱：[故障排除指南](docs/troubleshooting.md)

---

詳細的 API 規範請參考：
- [OpenAPI 3.0.3 (YAML 格式)](docs/openapi.yaml)
- [OpenAPI 3.0.3 (JSON 格式)](docs/openapi.json)

你也可以將這些檔案上傳至線上 OpenAPI 工具（如 [Swagger UI](https://editor.swagger.io/)）進行互動式查看。

## 資料版本

請參閱 [docs/version.md](docs/version.md)。

目前版本：API 服務 v1.0.0
