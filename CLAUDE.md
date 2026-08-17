# CLAUDE.md

給 Claude Code 參考的專案說明。每次開新 session 會自動讀取此檔,免得重新摸索。

## 這是什麼

**英文對話練習工具**：中文母語者以英文與 AI 對話,即時糾正語法/用詞(糾正解釋用繁中),
另有語音、收藏、間隔重複複習、情境對話、生字簿等學習功能。個人使用,部署於 Vercel。

- 技術:**Next.js (App Router) + TypeScript**,無資料庫(狀態存於 browser)。
- AI:全部經 **Poe API**(OpenAI-compatible),一條 key 涵蓋 chat 及語音。
- 線上:`cc-language.vercel.app`。

## 指令

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest 單元測試(純函數:srs / pron / savedStore)
npm run build    # 出 PR 前必須 build 過(等同 typecheck)
npm start        # 執行 production build
```

## 環境變數(`.env.local`,已 gitignore)

| 變數 | 用途 | 必須 |
|---|---|---|
| `QM_POE9_KEY` | Poe API key(讀不到則 fallback `POE_API_KEY`)| ✅ |
| `APP_PASSWORD` | 設定後啟用密碼閘;留空 = 不啟用(本機開發)| 選 |
| `POE_MODEL` | 對話預設模型,預設 `claude-opus-4.8` | 選 |
| `POE_TTS_MODEL` | 預設 `elevenlabs-v3` | 選 |
| `POE_STT_MODEL` | 預設 `cartesia-ink-whisper` | 選 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis,設定後才啟用雲端同步 | 選 |

> Vercel 的 env 變數名為 `QM_POE9_KEY`(用戶在 Poe 設定的 key 名稱),故 code 優先讀取此項。

## ⚠️ Poe API 關鍵知識(忘記就會踩坑)

- Base URL:`https://api.poe.com/v1`,以 `openai` SDK 指向該處(見 `src/lib/poe.ts`)。
- **Model ID 全部小寫**:`claude-opus-4.8`、`claude-sonnet-4.6`、`gpt-5.4-pro`、`gemini-3.1-pro`。
- **Poe app 有的 model 未必在 API 上架**(例如 GPT-5.6 系列 app 有、API 沒有)。新增 model 前先 `curl /v1/models` 確認。
- **`/v1/models` 不需 key 亦回 200** → 不可用它驗證 key。驗證 key 須呼叫 `/v1/chat/completions`。
- **TTS 沒有 `/v1/audio/speech`**(404)。做法:以 chat completions 呼叫 TTS bot(`elevenlabs-v3`),
  它會回傳一條 **poecdn 音訊 URL**(公開可播,不需 auth)。見 `api/tts`。
- **STT 同樣經 chat completions**:使用 `cartesia-ink-whisper`(快,1–4 秒),音訊以
  `file` content-part 的 base64 data URL 傳送。**不要用 `whisper-v3-large-t`**(inline 音訊會 hang 數分鐘)。
  亦**不要用 `image_url` 傳送音訊**(只接受 image)、`input_audio` 會 hang。
- 每次呼叫均扣同一個 points 池(約 1M/月)。因此須節省:裁剪歷史、快取語音。
- **`max_tokens` 是上限而非收費**,只有真正生成出來的 token 才扣 points。設得太細(曾用 600)
  會令長訊息的 JSON 中途被截斷,`JSON.parse` 失敗;現為 1600,並有搶救機制(見 `tutorJson`)。
- 更換 key 的方式:在 poe.com/api/keys **新增**一條不會令舊的失效;**regenerate** 才會令舊的失效。
  可多條並存,建議「一用途一 key」。

## 架構重點

**所有狀態存於 browser,沒有 server DB。** key 只在 server 端 route 讀取,永不傳至 client。

### API routes(`src/app/api/*`,全部 `runtime=nodejs`)
- `chat` — **SSE 串流**。由未完成的 JSON 抽出 `reply` 逐字傳送(`{t:"r"}`),完成時傳送 `{t:"f", reply, corrections, rewrite, truncated, usage}`。串流失敗會自動退回一次過模式。接受 `scenario`。
- `tts` — 預設回傳 `{url}`;`{raw:true}` 則直接回傳音訊 bytes + `x-audio-url` header(供前端存入 IndexedDB)。
- `stt` — 接收 base64 音訊,回傳 `{text}`。
- `vocab` — 查詢生字,回傳 `{meaning(英文), example}`。
- `export` — 將多句 TTS **去除 ID3 後串接成一個 MP3** 下載(重用 client 快取 URL 以節省 points)。
- `sync` — 雲端同步(Upstash),未設定時回傳 `{configured:false}`。v3 payload:
  `{items, tombstones, convos, convoTombstones}` —— **收藏同對話都會同步**。
  超過 900KB 會捨棄 convos 只同步收藏並回一個 `warning`(寧願少同步,好過成次失敗)。
- `login` / `logout` — 密碼閘,cookie 存 `sha256(密碼+salt)`。

### 前端狀態(`src/lib/*`,以 `useSyncExternalStore` 實作輕量 store)
- `convoStore` — 多對話(各自帶 scenario/items),自動由舊版單一對話遷移;
  含刪除記錄,可同步/備份(逐個對話 last-write-wins;空白對話不同步;上限 30 個)。
  `migrateConvos()` 在載入時修復舊資料:曾被當成訊息儲存的原始 JSON,以及中文舊標題。
  是 idempotent 的,見 `test/migrate.test.ts`。
- `savedStore` — 收藏(correction/rewrite/reply/vocab),含 SRS 狀態及刪除記錄(tombstone);支援 JSON 匯出入、雲端 merge。
- `srs` — 間隔重複(1→3→7→14→30→60 日)。
- `usage` — 每日 token/TTS/STT 計數,附每日/每月預算提示。
- `tts` — 三層語音快取:記憶體 → IndexedDB(`audioCache`)→ 網絡;全 app 單一播放。
- `pron` — 跟讀評分(LCS 逐字比對,純本地)。
- `scenarios` — 情境 role-play 清單。
- `backup` — 組裝/還原備份檔(收藏 + 對話)。特意由頁面抽出來,方便測試。
- `textExport` — 將**用戶在清單上揀選的收藏**匯出成純文字(一項一段,只有句子本身)。
  同 Play selected／MP3 一樣以選取為準:**不要由程式猜「哪些算已改好」**。
  曾經試過自動由對話抽句子,結果把未改好的錯句都帶了出來(截斷的訊息是連
  `corrections: []` 同 `rewrite: ""` 一齊存的,被誤判為「本來正確」)。
  下載時加 CRLF + UTF-8 BOM,否則 Windows 記事本會擠成一行或把中文變亂碼。
- `tutorJson` — 解析模型回覆的 JSON。**被 `max_tokens` 截斷時要搶救**(抽出 reply、
  rewrite 及所有括號完整的糾正),並回 `truncated: true`。切勿把原始 JSON 顯示給用戶。

### 頁面
- `/` 對話(串流、情境、多對話、點字查生字、用量列)
- `/saved` 收藏(揀選後播放/匯出 MP3/匯出純文字、備份 JSON、雲端同步)
- `/review` 今日複習(SRS 卡 + 跟讀評分)
- `/login` 密碼閘

`middleware.ts` 保護頁面及成本較高的 API;新增受保護 route 記得加入 matcher。

## 慣例
- **介面文字一律用英文**(按鈕、提示、錯誤訊息、metadata、manifest 全部)。
  **唯一例外:糾正解釋(`corrections[].explanation`)保持繁體中文書面語** —— 這是給學習者的
  鷹架,見 `prompt.ts` 中的指示。生字釋義(`api/vocab`)則用英文。
- 程式註解仍為繁體中文書面語,不要用廣東話口語(嘅/咗/喺/唔/冇/啲/嗰/俾)。
- **樣式必須顧及手機**。`globals.css` 設有 `@media (max-width: 640px)` 區塊,將頂部各列壓成單行、
  收起次要資訊。曾經整份樣式表沒有任何 media query,結果介面在 390px 手機上佔去五至七成螢幕高度。
- 新增 Poe 相關功能前,**先用 curl 實測 endpoint/model 名稱**再寫 code(此 codebase 許多決定都是這樣驗證得來)。
- 出 PR 前 `npm test` 與 `npm run build` 都要綠。
- **改動收藏或對話資料的形狀就必須加測試**(`test/savedStore.test.ts`、`test/backup.test.ts`)。
  曾有兩個同類 bug:① 匯入備份遺失 `srs`/`meaning`/`example`;② 對話根本沒有備份到。
  單靠計算項目數量抓不到,必須驗欄位。
- **同步的刪除邏輯特別易錯**:另一部機刪除後,雲端會回「空清單 + 一條刪除記錄」。
  合併函數若在 incoming 為空時提早返回,本機副本就永遠清不走,項目會「翻生」。
  收藏與對話各有迴歸測試守住這一點。
- 錯誤須經 `friendlyError()`(`lib/poe.ts`)轉成清楚的英文訊息再顯示給用戶,不要直接彈出 Poe 的原始錯誤。

## Git / 部署
- 開發 branch:`claude/poe-api-language-learning-mfhxur`。修改 → PR → merge 至 `main`。
- Vercel 連接 `main`,push 後自動 redeploy。修改 env 之後需手動 redeploy。
- 有 service worker,線上更新後需 hard-refresh(手機 PWA 則完全關閉再開啟)。
