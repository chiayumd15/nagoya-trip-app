# OpenAI 中繼 Worker 設定（約 10 分鐘，免費）

目的：OpenAI key 只放在 Cloudflare，app 不含 key；家人輸入一次「家族密碼」就能用 AI 小幫手。

## A. 拿 OpenAI API key
1. https://platform.openai.com/settings/organization/billing/overview → Add payment / 加值 US$5–10
2. https://platform.openai.com/settings/organization/limits → 設每月上限（例如 US$10）
3. https://platform.openai.com/api-keys → Create new secret key → 命名 `nagoya-trip` → 複製（只會顯示一次）

## B. 建 Worker（用網頁，不用裝東西）
1. https://dash.cloudflare.com → 註冊／登入 → 左側 **Workers & Pages** → **Create** → **Create Worker**
2. 名稱改成 `nagoya-ai`（網址會是 `https://nagoya-ai.<你的帳號>.workers.dev`）→ **Deploy**
3. 點 **Edit code** → 全選刪掉 → 貼上本資料夾 `worker.js` 全部內容 → **Deploy**
4. 回 Worker 頁 → **Settings** → **Variables and Secrets** → **Add**：
   - `OPENAI_API_KEY`  類型 Secret  值＝步驟 A 的 key
   - `FAMILY_PASSWORD` 類型 Secret  值＝你自訂的家族密碼（例如 `nagoya1013`）
   - （選填）`ALLOWED_ORIGIN` 類型 Text  值＝app 網址（例如 `https://xxx.netlify.app`，結尾不加斜線）
   → **Deploy**
5. 瀏覽器打開 `https://nagoya-ai.<帳號>.workers.dev` 看到 `{"ok":true,...}` 就成功

## C. 填回 app
`js/config.js`：
```js
AI_PROXY_URL: 'https://nagoya-ai.<帳號>.workers.dev',
FAMILY_PASSWORD: '',   // 留空＝家人在 app 內自己輸入一次（建議）；填了＝全部人免輸入（僅在 app 網址不公開時）
```
重新部署 app。家人第一次按 AI 小幫手會被問「家族密碼」，輸入一次就記住。

## 費用與安全
- gpt-4o-mini 每題約 NT$0.05；Worker 免費額度每天 10 萬次請求。
- 每次回答上限 1,200 tokens、模型白名單、家族密碼、可鎖來源網址，都在 worker.js 內。
- 旅行結束後：OpenAI 後台刪掉 key 即可。
