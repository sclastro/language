# CLAUDE.md

俾 Claude Code 睇嘅專案說明。每次開新 session 會自動讀呢個檔,等唔使重新摸索。

## 呢個係咩

**英文對話練習工具**：中文母語者用英文同 AI 傾偈,即時糾正語法/用詞(繁中解釋),
加埋語音、收藏、間隔重複複習、情境對話、生字簿等學習功能。個人使用,部署喺 Vercel。

- 技術:**Next.js (App Router) + TypeScript**,無資料庫(狀態存 browser)。
- AI:全部經 **Poe API**(OpenAI-compatible),一條 key 用晒 chat / 語音。
- 線上:`cc-language.vercel.app`。

## 指令

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 出 PR 前一定要 build 過(等於 typecheck)
npm start        # 行 production build
```

## 環境變數(`.env.local`,已 gitignore)

| 變數 | 用途 | 必須 |
|---|---|---|
| `QM_POE9_KEY` | Poe API key(讀唔到就 fallback `POE_API_KEY`)| ✅ |
| `APP_PASSWORD` | 設咗就開密碼閘;留空 = 唔啟用(本機開發)| 選 |
| `POE_MODEL` | 對話預設模型,預設 `claude-opus-4.8` | 選 |
| `POE_TTS_MODEL` | 預設 `elevenlabs-v3` | 選 |
| `POE_STT_MODEL` | 預設 `cartesia-ink-whisper` | 選 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis,設咗先開雲端同步 | 選 |

> Vercel 個 env 變數名叫 `QM_POE9_KEY`(用戶喺 Poe 改嘅 key 名),所以 code 首選讀呢個。

## ⚠️ Poe API 關鍵知識(唔記得就會撞板)

- Base URL:`https://api.poe.com/v1`,用 `openai` SDK 指過去(見 `src/lib/poe.ts`)。
- **Model ID 全部細楷**:`claude-opus-4.8`、`claude-sonnet-4.6`、`gpt-5.4-pro`、`gemini-3.1-pro`。
- **Poe app 有嘅 model 唔一定喺 API 有**(例如 GPT-5.6 系列 app 有、API 冇)。加新 model 前先 `curl /v1/models` 確認。
- **`/v1/models` 唔使 key 都回 200** → 唔可以攞佢嚟驗證 key。驗 key 要打 `/v1/chat/completions`。
- **TTS 冇 `/v1/audio/speech`**(404)。做法:chat completions 用 TTS bot(`elevenlabs-v3`),
  佢回一條 **poecdn 音訊 URL**(公開可播,唔使 auth)。見 `api/tts`。
- **STT 都係經 chat completions**:用 `cartesia-ink-whisper`(快,1–4 秒),音訊用
  `file` content-part 嘅 base64 data URL 傳。**唔好用 `whisper-v3-large-t`**(inline 音訊會 hang 幾分鐘)。
  亦**唔好用 `image_url` 傳音訊**(淨係收 image)、`input_audio` 會 hang。
- 每次呼叫都扣同一個 points 池(約 1M/月)。所以要慳:裁剪歷史、cap max_tokens、快取語音。
- Key 換法:喺 poe.com/api/keys **新增**一條唔會令舊嘅作廢;**regenerate** 先會作廢舊嗰條。
  可以多條並存,建議「一用途一 key」。

## 架構重點

**所有狀態存 browser,冇 server DB。** key 只喺 server 端 route 讀,永不落 client。

### API routes(`src/app/api/*`,全部 `runtime=nodejs`)
- `chat` — **SSE 串流**。由未完成 JSON 抽 `reply` 逐字送(`{t:"r"}`),完成送 `{t:"f", reply, corrections, rewrite, usage}`。串流失敗自動退返一次過模式。食 `scenario`。
- `tts` — 預設回 `{url}`;`{raw:true}` 就直接回音訊 bytes + `x-audio-url` header(俾前端存 IndexedDB)。
- `stt` — 收 base64 音訊,回 `{text}`。
- `vocab` — 查生字,回 `{meaning(繁中), example}`。
- `export` — 將多句 TTS **strip ID3 後串接成一個 MP3** 下載(重用 client 快取 URL 慳 points)。
- `sync` — 雲端同步(Upstash),未設定回 `{configured:false}`。
- `login` / `logout` — 密碼閘,cookie 存 `sha256(密碼+salt)`。

### 前端狀態(`src/lib/*`,用 `useSyncExternalStore` 做輕量 store）
- `convoStore` — 多對話(每個有 scenario/items),自動由舊版單一對話遷移。
- `savedStore` — 收藏(correction/rewrite/reply/vocab),含 SRS 狀態;匯出入 JSON、雲端 merge。
- `srs` — 間隔重複(1→3→7→14→30→60 日)。
- `usage` — 每日 token/TTS/STT 計數。
- `tts` — 三層語音快取:記憶體 → IndexedDB(`audioCache`)→ 網絡。
- `pron` — 跟讀評分(LCS 逐字比對,純本地)。
- `scenarios` — 情境 role-play 清單。

### 頁面
- `/` 對話(串流、情境、多對話、撳字查生字、用量列)
- `/saved` 收藏(播放/匯出 MP3、備份 JSON、雲端同步)
- `/review` 今日複習(SRS 卡 + 跟讀評分)
- `/login` 密碼閘

`middleware.ts` gate 住頁面同貴嘅 API;新增受保護 route 記得加入 matcher。

## 慣例
- 註解同 UI 文字用**廣東話/繁中**(跟返現有風格)。
- 加 Poe 相關功能前,**用 curl 真機試個 endpoint/model 名先**至寫 code(呢個 codebase 好多決定都係咁驗返嚟)。
- 出 PR 前 `npm run build` 要綠。

## Git / 部署
- 開發 branch:`claude/poe-api-language-learning-mfhxur`。改嘢 → PR → merge 落 `main`。
- Vercel 連住 `main`,push 就自動 redeploy。改 env 之後要手動 redeploy。
- 有 service worker,線上更新後要 hard-refresh(手機 PWA 就完全閂再開)。
