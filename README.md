# 名古屋・上高地 兩家旅 — 旅遊手帳 app（PWA）

2026/10/10–10/19 楊家 5 人＋姑姑家 6 人，共 11 人。溫馨手繪風、可加到 iPhone 主畫面的網頁 app。

## 功能
- 行程：10 天逐時段時間軸（含 10/13 兩家分頭移動、10/17 名古屋祭已對調）、每日雨備、備忘、一鍵 Google Maps 導航
- 指南：景點攻略＋拍照點、餐廳（隨便吃／自由安排已排推薦、待確認標記）、必吃必買必拍、交通、住宿（房號、費用、報價單）、天氣、雨備、消息、緊急聯絡與日文
- 天氣：Open-Meteo 16 天預報（進入預報範圍前顯示 10 月中旬氣候平均）
- 記帳：即時匯率（open.er-api.com）換算、記一筆、全部／楊家／陳家／自選分帳、最少轉帳次數結算、住宿費一鍵加入
- 聊天：家族群聊（需 Firebase 才能 11 人同步）、AI 小幫手（OpenAI ChatGPT，帶完整行程脈絡、天氣、匯率、GPS 即時回答）
- 更多：行李 checklist（每人分開）、11 人名單房號、自駕模式（景點自動顯示停車場／加油站、我附近搜尋）、深色模式

## 本機預覽
```bash
cd nagoya-trip-app && python3 -m http.server 8765
# 瀏覽器開 http://127.0.0.1:8765
```

## 部署到 GitHub Pages（讓 11 支手機都能開）
```bash
cd nagoya-trip-app
git init && git add . && git commit -m "Nagoya trip app"
gh repo create nagoya-trip-app --public --source=. --push
gh api -X POST repos/chiayumd15/nagoya-trip-app/pages -f build_type=legacy -f source[branch]=main -f source[path]=/
# 幾分鐘後網址：https://chiayumd15.github.io/nagoya-trip-app/
```
> 注意：repo 為公開時，data.js 內的家人姓名也會公開。想私密可改用 Netlify Drop（拖曳資料夾上傳，網址隨機）或 Cloudflare Pages。

## iPhone 加到主畫面
Safari 開網址 → 分享 ⬆️ → 加入主畫面。之後全螢幕開啟、離線可看行程。

## 開啟 11 人同步（記帳＋群聊）— Firebase，免費
1. https://console.firebase.google.com 建專案
2. Realtime Database → 建立 → 地區 asia-southeast1 → 測試模式
3. 專案設定 → 您的應用程式 → Web → 複製 `firebaseConfig`
4. 貼到 `js/config.js` 的 `firebase:{...}` → 重新部署

## AI 小幫手（ChatGPT）
- **推薦**：Cloudflare Worker 中繼，key 不放在 app，家人輸入一次家族密碼即可。設定步驟見 `cloudflare-worker/README.md`，完成後在 `js/config.js` 填 `AI_PROXY_URL`。
- 其他：每人在 app「更多 → 設定」貼自己的 OpenAI API key；或在 config.js 填 `OPENAI_API_KEY` 共用（網址公開時 key 會被看見，不建議）

## 改資料
所有行程、餐廳、景點、名單都在 `js/data.js`，直接改文字即可；標 `verify:true` 的會顯示「待確認」。
