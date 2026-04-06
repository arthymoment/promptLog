# PromptLog 故障排除指南

## 問題：POST 新增 Prompt 成功，但 GET 查詢看不到

### 症狀
- 透過 `POST /api/prompts` 新增 Prompt 時，伺服器返回 `201 Created` 並顯示記錄 ID
- 日誌中出現 `[PROMPTS] 新增 id=25 project=apigee-stats ...` 
- 但透過 `GET /api/prompts` 無法查詢到該記錄

### 根本原因

PromptLog 採用**多租戶（Multi-tenant）架構**，每個 API Key 只能存取其所屬專案的資料。

**常見情況：**
- **POST 時使用 API Key A**（對應專案 X）→ Prompt 存儲在專案 X
- **GET 時使用 API Key B**（對應專案 Y）→ 只能查詢專案 Y 的資料
- **結果：** 看不到專案 X 的記錄

**驗證方式：**
```bash
# 檢查日誌中的專案名稱
tail -f logs/system/system_*.log | grep "新增 id="

# 看到類似輸出：
# [PROMPTS] 新增 id=25 project=apigee-stats ...

# 再看 GET 請求的認證信息（檢查使用的 API Key）
```

### 解決方案

#### 方案 1：確認使用相同的 API Key（推薦）
確保 POST 和 GET 請求都使用**同一個** API Key：

```bash
# 都用同一把 key
API_KEY="plk_3d32xxxxxxxxxxxx"

# POST
curl -X POST https://promptlog.arthymoment.dsmynas.org/api/prompts \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "測試"}'

# GET - 用同一把 key
curl https://promptlog.arthymoment.dsmynas.org/api/prompts \
  -H "X-API-Key: $API_KEY"
```

#### 方案 2：使用 Admin API 跨專案查詢（高級用戶）
如果需要查詢所有專案的記錄，使用 **Admin API**：

```bash
ADMIN_KEY="your_admin_key"

# 查詢所有 Prompts（不受專案限制）
curl https://promptlog.arthymoment.dsmynas.org/api/admin/prompts \
  -H "X-Admin-Key: $ADMIN_KEY"

# 查詢特定專案
curl "https://promptlog.arthymoment.dsmynas.org/api/admin/prompts?project_id=3" \
  -H "X-Admin-Key: $ADMIN_KEY"

# 查詢含日期範圍
curl "https://promptlog.arthymoment.dsmynas.org/api/admin/prompts?start_date=2026-03-04&end_date=2026-03-04" \
  -H "X-Admin-Key: $ADMIN_KEY"
```

### 查詢當前 API Key 配置

使用 Admin API 檢查各個 API Key 對應的專案：

```bash
ADMIN_KEY="your_admin_key"

# 列出所有 API Key 及其專案
curl https://promptlog.arthymoment.dsmynas.org/api/admin/keys \
  -H "X-Admin-Key: $ADMIN_KEY"

# 輸出示例：
# [
#   {
#     "id": 3,
#     "key_preview": "plk_3d32...",
#     "project_id": 3,
#     "project_name": "apigee-stats",
#     "is_active": 1
#   },
#   {
#     "id": 1,
#     "key_preview": "plk_50ca...",
#     "project_id": 1,
#     "project_name": "promptLog",
#     "is_active": 1
#   }
# ]
```

### 檢查資料庫狀態

若懷疑資料真的遺失，可在伺服器上檢查資料庫：

```bash
# 檢查所有 Prompts 記錄
sqlite3 /app/data/promptlog.db "SELECT id, project_id, created_at FROM prompts ORDER BY id DESC LIMIT 10;"

# 檢查 API Key 與專案的對應關係
sqlite3 /app/data/promptlog.db "SELECT k.id, k.key, p.name FROM api_keys k JOIN projects p ON k.project_id = p.id;"
```

---

## API Key 與專案隔離說明

### 架構設計
- **projects** 表：存儲所有專案
- **api_keys** 表：每把 API Key 綁定一個 `project_id`
- **prompts** 表：每筆 Prompt 記錄綁定一個 `project_id`

### 存取規則

| 端點 | 存取範圍 | 所需驗證 |
|------|--------|--------|
| `POST /api/prompts` | 該 API Key 所屬專案 | X-API-Key header |
| `GET /api/prompts` | 該 API Key 所屬專案 | X-API-Key header |
| `GET /api/admin/prompts` | 所有專案（Admin 專用） | X-Admin-Key header |
| `GET /api/admin/projects` | 所有專案（Admin 專用） | X-Admin-Key header |

---

## 相關文件
- [API 文件](./api.md) - 完整 API 端點說明
- [部署指南](../README.md) - 環境變數與設定
