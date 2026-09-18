/* ===== 使用者設定（部署前填寫）=====
   1) Firebase：讓 11 支手機共用「記帳／分帳」與「家族群聊」。
      到 https://console.firebase.google.com 建專案 → 建立 Realtime Database（測試模式）→
      專案設定 → 「您的應用程式」新增 Web app → 把 firebaseConfig 貼到下面。
      沒填的話：記帳與聊天只存在各自手機（仍可用）。
   2) OpenAI：AI 小幫手（ChatGPT）即時回答旅遊問題。
      建議每個人在 app「更多 → 設定」自己貼 API key（存在自己手機）；
      若網站只有家人看得到，也可以直接填在下面 OPENAI_API_KEY 讓大家共用。 */
window.APP_CONFIG = {
  tripId: 'nagoya2026',
  firebase: {
    // apiKey: "AIza...", authDomain: "xxx.firebaseapp.com", databaseURL: "https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app",
    // projectId: "xxx", storageBucket: "xxx.appspot.com", messagingSenderId: "...", appId: "..."
  },
  // ── AI 小幫手：二選一 ──
  // (推薦) Cloudflare Worker 中繼：key 放在 Worker，app 只帶家族密碼。設定見 cloudflare-worker/README.md
  AI_PROXY_URL: 'https://nagoya-ai.bonnie801101.workers.dev',        // 例：'https://nagoya-ai.xxxx.workers.dev'
  FAMILY_PASSWORD: '',     // 留空＝家人在 app 內輸入一次；填了＝全部人免輸入（僅在 app 網址不公開時）
  // (不推薦) 直接把 OpenAI key 放這裡，任何打開網址的人都看得到
  OPENAI_API_KEY: '',
  OPENAI_MODEL: 'gpt-4o-mini',
  LINE_GROUP_URL: '',      // 選填：LINE 群組邀請連結，聊天頁會多一顆「開 LINE」按鈕
};
