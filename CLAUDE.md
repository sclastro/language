# CLAUDE.md

給 Claude Code 參考的專案說明。每次開新 session 會自動讀取此檔,免得重新摸索。

## 這是什麼

**英文對話練習工具**：中文母語者以英文與 AI 對話,即時糾正語法/用詞(糾正解釋用繁中),
另有語音、收藏、間隔重複複習、情境對話、生字簿等學習功能,以及**中譯英**(把打出來的中文,
包括廣東話口語句式,變成即時可用的簡單口語英文)、**主題句庫**(AI 按主題提供句子,用戶被動地讀、聽、
揀句收藏)、**Quiz**,以及**篇章轉語音**(貼上英文,原文照讀)。個人使用,部署於 Vercel。

- 技術:**Next.js (App Router) + TypeScript**,無資料庫(狀態存於 browser)。
- AI:全部經 **Poe API**(OpenAI-compatible),一條 key 涵蓋 chat 及語音。
- 線上:`cc-language.vercel.app`。

## 指令

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest 單元測試(只測 src/lib 的純函數,見 test/)
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
  會令長訊息的 JSON 中途被截斷,`JSON.parse` 失敗;加入 `natural` 後現為 2400,並有搶救機制(見 `tutorJson`)。
- 更換 key 的方式:在 poe.com/api/keys **新增**一條不會令舊的失效;**regenerate** 才會令舊的失效。
  可多條並存,建議「一用途一 key」。

## 架構重點

**所有狀態存於 browser,沒有 server DB。** key 只在 server 端 route 讀取,永不傳至 client。

### API routes(`src/app/api/*`,全部 `runtime=nodejs`)
- `chat` — **SSE 串流**。由未完成的 JSON 抽出 `reply` 逐字傳送(`{t:"r"}`),完成時傳送
  `{t:"f", reply, corrections, polish, rewrite, natural, truncated, usage}`。串流失敗會自動退回一次過模式。接受 `scenario`。
- `tts` — 預設回傳 `{url}`;`{raw:true}` 則直接回傳音訊 bytes + `x-audio-url` header(供前端存入 IndexedDB)。
- `stt` — 接收 base64 音訊,回傳 `{text}`。
- `vocab` — 查詢生字,回傳 `{meaning(英文), example}`。
- `translate` — 中文 → 簡單口語英文,回傳 `{english, alternatives(0–2 個), usage}`。非串流。
  輸入上限 `MAX_INPUT_CHARS`(**3000** 字元)。超過 `CHUNK_CHARS`(1000)就由 `splitForTranslation()`
  在換行或句末切段,**各段併發翻譯**再按原本的分隔接回(`joinTranslations`);每段 `max_tokens` 2500,
  `maxDuration` 60。一次過譯 3000 字會超出 serverless 時限,所以要分段。分段時 `alternatives` 一律為空。
  沿用對話頁揀選的模型。
- `phrases` — 主題句庫,回傳 `{title, items, truncated, usage}`。接受 `avoid`(同主題已出過的句子),
  否則「＋ More」只會得到差不多的十句。被截斷時搶救括號完整的項目(`parsePhraseSet`)。
- `quiz` — 為多項選擇題整批生成干擾項,回傳 `{distractors: (string[] | null)[]}`,按輸入次序對齊。
- `export` — 將多句 TTS **去除 ID3 後串接成一個 MP3** 下載(重用 client 快取 URL 以節省 points)。
  上限 40 項(篇章轉語音一篇最多約 34 段)。
- `sync` — 雲端同步(Upstash),未設定時回傳 `{configured:false}`。v3 payload:
  `{items, tombstones, convos, convoTombstones}` —— **收藏同對話都會同步**。
  超過 900KB 會捨棄 convos 只同步收藏並回一個 `warning`(寧願少同步,好過成次失敗)。
- `login` / `logout` — 密碼閘,cookie 存 `sha256(密碼+salt)`。

### 前端狀態(`src/lib/*`,以 `useSyncExternalStore` 實作輕量 store)
- `convoStore` — 多對話(各自帶 scenario/items),自動由舊版單一對話遷移;
  含刪除記錄,可同步/備份(逐個對話 last-write-wins;空白對話不同步;上限 30 個)。
  `migrateConvos()` 在載入時修復舊資料:曾被當成訊息儲存的原始 JSON,以及中文舊標題。
  是 idempotent 的,見 `test/migrate.test.ts`。
- `savedStore` — 收藏(correction/polish/rewrite/reply/vocab/translation/phrase),含 SRS 狀態及刪除記錄(tombstone);支援 JSON 匯出入、雲端 merge。
  **新增類別時必須同時更新 `isKind()` 白名單**,否則匯入備份及雲端合併都會把它默默改成 `"reply"`。
  更正/完整句會一併存 `original`(你當時寫錯的版本)同 `explanation`,**複習時才有題目可出**。
- `srs` — 間隔重複(1→3→7→14→30→60 日)。
  `savedStore` 另設**每日新卡上限**(`DAILY_NEW_LIMIT`):已排程的到期卡全出,
  未複習過的新卡則受配額限制。沒有上限的話,收藏 60 項就有 51 項堆在同一日。
- `usage` — 每日 token/TTS/STT 計數,附每日/每月預算提示。
- `tts` — 三層語音快取:記憶體 → IndexedDB(`audioCache`)→ 網絡;全 app 單一播放。
  另管理**朗讀速度**(`SPEECH_RATES`,存 localStorage):在 `playExclusive` 套用 `playbackRate`,
  所以凡經它播放的都會跟。**只影響 app 內播放** —— 匯出的 MP3 速度已固定在音訊裡。
- `ttsLimit` — 語音長度上限 **2000 個英文字**(不是字元)。`/api/tts` 同 `/api/export`
  **必須用同一個上限**:曾經一邊 600 字元、一邊冇上限,而匯出又會重用播放時的快取,
  導致同一句「播過先匯出」同「未播過就匯出」出到唔同音訊。截斷時要回報,不可靜靜截短。
- `pron` — 跟讀評分(LCS 逐字比對,純本地)。
- `translate` — 中譯英的 prompt、解析(`parseTranslation`)及歷史處理(`addToHistory`、`sanitizeHistory`),
  全部是純函數。**輸入是打出來的中文文字,不涉及語音辨識**;prompt 要求看得懂廣東話口語(唔/咗/嘅/冇…)。
  風格:日常口語、短句、常用字(約 B1),自然但不浮誇,保留語氣,只翻譯、不回答句中的問題。
  被截斷時只取完整的 `english`,不可顯示原始 JSON 或半句。
  **不可猜性別**:分段翻譯時同一位「陳老師」曾一段譯成 Mr、一段譯成 Miss;未知性別一律寫「Mr/Ms Chan」。
  **長訊息(多段、分項)曾被拆成兩半**:模型只譯第一段就收尾,再「Wait, let me give the full translation」
  輸出第二個物件;或把後半段塞進 `alternatives`。現時 prompt 要求整段放入 `english`、只輸出一個物件、
  長訊息的 `alternatives` 必須為空;`parseTranslation` 亦會逐個拆開頂層物件,**取最後一個有效的**。
  `.tr-text` 用 `white-space: pre-wrap`,否則分段與 1. 2. 3. 會擠成一段。
  翻譯歷史只存本機(`english-tutor-translations-v1`,上限 50 項,不同步);值得留低的用 ☆ 收藏。
  收藏為 `translation` 類別:`text` 是英文、`original` 是中文 → 複習時顯示中文,
  提示「Say it in English」,原文不加紅色(它不是寫錯)。
  **輸入框不可設 `maxLength`**:曾經設為 1000,貼上長文時瀏覽器把超出部分靜靜刪去,用戶只見到
  譯文「中間被 cut 咗」。現在接近上限才顯示字數,超出就停用「Translate」並說明。
- `phrases` — 主題句庫的 prompt、解析及本機清單處理(純函數)。三種形式:`sentences`(10 句)、
  `dialogue`(8–12 行,有 `speaker`)、`patterns`(5 個句式,各附 2–3 個 `examples`)。
  `zh` 用繁體**書面語**(不是廣東話口語),`note` 是一句繁中用法提示 —— 與糾正解釋一樣屬學習鷹架,
  所以是介面一律英文的例外。句庫存本機(`english-tutor-phrasesets-v1`,上限 50 批,不同步);
  ☆ 收藏為 `phrase` 類別:`text` 英文、`original` 中文、`explanation` 提示,複習方式同 `translation`。
- `quiz` — 三種題型:`recall`(看中文打英文,LCS 比對後自評)、`cloze`(挖去一個關鍵字,本地評分)、
  `mcq`(四揀一)。**只有 `translation`/`phrase` 的 `original` 是中文**;其他類別的 `original`
  是用戶寫錯的英文,絕不可當成中文提示。生字不出題。干擾項快取於本機(`english-tutor-quiz-distractors-v1`,
  上限 500 句),同一句不再扣 points。實測模型會只改時態(wanted → want)或換介詞(during → in),
  結果仍是正確英文,所以 prompt 要求逐個自我檢查;缺干擾項的題目改出其他題型,寧願少一題也不出只有一個選項的題。
  結果頁「Review these sooner」:已收藏的排回今日複習(`reviewItem(id, false)`),未收藏的收藏起來。
- `listen` — 篇章轉語音的分段(`splitPassage`)。實測 elevenlabs-v3 生成 180 字約 26 秒(約 76 秒語音),
  所以**第一段刻意短**(`FIRST_CHUNK_WORDS` 50 字,以句末為界,最少一句),撳 Play 後數秒便有聲。
  其餘每段最多 `CHUNK_WORDS`(180)字,短段落合併、
  過長段落在「句末標點 + 空白」處切(所以 3.5 不會變成 "3. 5")。**只可改動空白,不可改動任何字**,
  測試會逐字比對。前端三段併發生成、第一段好了就開始播;歷史只存本機(上限 20 篇),
  語音已在 IndexedDB,重聽不扣 points。上限 `MAX_PASSAGE_WORDS`(3000 字)。
- `fontScale` — 全 app 字體大小(S/M/L/XL,預設 L)。見下文「慣例」。
- `scenarios` — 情境 role-play 清單。
- `backup` — 組裝/還原備份檔(收藏 + 對話)。特意由頁面抽出來,方便測試。
- `textExport` — 將**用戶在清單上揀選的收藏**匯出成純文字(一項一段,只有句子本身)。
  同 Play selected／MP3 一樣以選取為準:**不要由程式猜「哪些算已改好」**。
  曾經試過自動由對話抽句子,結果把未改好的錯句都帶了出來(截斷的訊息是連
  `corrections: []` 同 `rewrite: ""` 一齊存的,被誤判為「本來正確」)。
  下載時加 CRLF + UTF-8 BOM,否則 Windows 記事本會擠成一行或把中文變亂碼。
- `fullRewrite` — 取得「完整正確版本」。**不可以純粹相信模型回的 `rewrite`**:
  訊息長而只有一處錯時,它有時只回改動過的那一句,結果卡片同 ★ 收藏都只有一句。
  `rewrite` 明顯短過原文就改為用 `corrections` 把 original→corrected 套用回原訊息;
  片段對不上就寧願用模型那份,不會亂砌。
  `naturalVersion()` 決定卡片上的整段地道版本是否顯示(見下文 `natural`)。
- `tutorJson` — 解析模型回覆的 JSON。**被 `max_tokens` 截斷時要搶救**(抽出 reply、
  rewrite 及所有括號完整的糾正/地道建議),並回 `truncated: true`。切勿把原始 JSON 顯示給用戶。
  沒有 `polish` 欄位的舊回覆一律補回空陣列,`natural` 則補回空字串,絕不可以是 `undefined`。
  **`natural` 被截斷就整個丟棄**(`extractClosedJsonString`):半段示範答案會令人以為後半段可以刪去。

### 「糾正」與「可以更地道」是兩回事
模型單看文法的話,只要句子文法正確就甚麼都不說,實際上只做了 grammar check。
中文母語者寫的英文往往文法無誤卻生硬(逐字直譯、搭配不自然、過於書面)。
因此 `prompt.ts` 要求**五個欄位**(`reply` 以外四個),並把兩種回饋分開:

- `corrections` —— **真正的錯**(文法、時態、一致性、用錯字)。
- `polish` —— 文法本來正確,但母語者不會這樣講;`{original, suggestion, explanation}`,
  每次一至三條,並明確指示「不要因為文法沒錯就甚麼都不說」。
- `rewrite` —— **只套用 `corrections`,不可套用 `polish`**。否則「完整正確版本」會變成
  模型自己的口吻,★ 收藏到的就不再是你自己寫的句子。
- `natural` —— **整段**改寫成母語者的講法(改錯 + 套用地道建議 + 理順句與句之間的銜接),
  保留原意與所有句子。卡片上顯示為「🌟 How a native speaker might say it」,★ 存成 `polish`
  類別並附原文,複習時出「Say it in a more natural way」。已經夠自然就回空字串。
  顯示規則在 `naturalVersion()`:沒有糾正亦沒有建議時不顯示(卡片正寫着 sounds natural),
  與完整正確版本實質相同時亦不顯示。**不可與 `rewrite` 合併**,理由同上。

**不要為了省事把 polish 塞進 corrections**:那樣每句都像滿是錯誤,既打擊信心,
亦分不清「必須改」同「可以更好」。介面上兩者亦分色(琥珀 vs `--info` 藍),
複習時 polish 的原句不加紅色/刪除線,提示語是「Say it in a more natural way」。

### 頁面
- `/` 對話(串流、情境、多對話、點字查生字、用量列)
- `/saved` 收藏(揀選後播放/匯出 MP3/匯出純文字、備份 JSON、雲端同步)
- `/review` 今日複習(SRS 卡 + 跟讀評分)
- `/translate` 中譯英(結果卡附 🔊 ☆ 📋;最新一項貼近輸入框;「Clear history」放清單末端,不放頂部)
- `/learn` 主題句庫(揀主題/自訂主題、形式、難度 → 一批句子;▶ Play all、☆ Save all、📝 Quiz、＋ More)
- `/quiz` Quiz(來源:全部收藏或某一批句庫;`/quiz?set=<id>` 由句庫直接進入)
- `/listen` 篇章轉語音(貼上英文 → 分段生成、連續播放、調速、⬇ MP3、本機歷史)
- `/login` 密碼閘

`middleware.ts` 保護頁面及成本較高的 API;新增受保護 route 記得加入 matcher。

每頁頂部都有 **Aa**(字體大小)及 **☰**(`NavMenu`,列出所有頁面及登出)。頁面多了,
逐個掣放在頂部的話,手機標題列會擠到看不見標題,所以次要頁面及登出都放在 ☰ 內。
新增頁面時記得加入 `NavMenu` 的 `PAGES`。

## 慣例
- **介面文字一律用英文**(按鈕、提示、錯誤訊息、metadata、manifest 全部)。
  **唯一例外:糾正解釋(`corrections[].explanation`)保持繁體中文書面語** —— 這是給學習者的
  鷹架,見 `prompt.ts` 中的指示。生字釋義(`api/vocab`)則用英文。
- 程式註解仍為繁體中文書面語,不要用廣東話口語(嘅/咗/喺/唔/冇/啲/嗰/俾)。
- **凡在 render 途中判斷瀏覽器能力(如 `navigator.mediaDevices`)都要搬入 `useEffect`**,
  否則 server 同 client 首次繪製不一致,React 會判定 hydration 失敗並把整棵樹重繪。
  麥克風掣就中過這一項。
- 「Full corrected version」與「How a native speaker might say it」各有 🔊 ☆ 📋 三個掣。
  📋 經 `lib/clipboard.ts` 複製(`navigator.clipboard` 失敗時退回 `execCommand`,照顧舊版 iOS/PWA)。
  手機上句子獨佔一行、掣移到下一行,否則句子只剩約 150px 闊。
- **中文輸入框按 Enter 送出時,必須略過輸入法選字**(`e.nativeEvent.isComposing` 或 `keyCode === 229`),
  否則用倉頡/速成/拼音選字時一按 Enter 就會送出半句。見 `translate/page.tsx`。
- `.ghost-btn` 有全域基本樣式,`a.ghost-btn` 另設去底線;以 `<Link>` 做的掣否則會變成藍色底線連結。
- **只靠 `:hover` 的視覺提示在手機上等於沒有**(觸控無 hover)。可點按的字要有靜態樣式。
- **字體一律用 `rem`,不要寫 `px`**。Aa 掣只改 `<html>` 的字號(`data-font`,見 `lib/fontScale.ts`),
  寫死 `px` 的字不會跟着放大。M = 舊版大小(16px 根字號),預設 L(18px)—— 舊版在 Galaxy Fold 外屏
  (約 410px 闊)上偏細。`layout.tsx` 有 inline script 在首次繪製前設好 `data-font`,免得頁面先細後大。
  padding、圓角等仍用 `px` 無妨。
- **樣式必須顧及手機**。`globals.css` 設有 `@media (max-width: 640px)` 區塊,將頂部各列壓成單行、
  收起次要資訊。曾經整份樣式表沒有任何 media query,結果介面在 390px 手機上佔去五至七成螢幕高度。
- 新增 Poe 相關功能前,**先用 curl 實測 endpoint/model 名稱**再寫 code(此 codebase 許多決定都是這樣驗證得來)。
- 出 PR 前 `npm test` 與 `npm run build` 都要綠。
- 專案**沒有 ESLint 設定**;`npx next lint` 會彈出互動設定精靈,非互動環境不要執行。
  型別檢查靠 `npm run build`。
- 改動 prompt 之後,最好以真實 API 試一兩句(`npm run build && npx next start`,再 curl `/api/chat`),
  單元測試只驗 prompt 的字眼,驗不到模型實際會否照做。
- **在 Claude Code 雲端環境實測**:Poe key 以 Network secret(Bearer)由代理注入,不在容器內,
  所以 `.env.local`(已 gitignore)只放佔位值 `QM_POE9_KEY=placeholder`,代理會換上真正的 key。
  容器只能經 HTTPS 代理連外,而 openai SDK v4 自帶的 node-fetch 不讀代理設定,
  必須以 `NODE_USE_ENV_PROXY=1 npx next start` 啟動(`poe.ts` 見到此變數便改用 Node 內建 fetch)。
  `api.poe.com` 及 `*.poecdn.net`(語音檔)都要在環境的網絡設定中允許。
- **改動收藏或對話資料的形狀就必須加測試**(`test/savedStore.test.ts`、`test/backup.test.ts`)。
  曾有兩個同類 bug:① 匯入備份遺失 `srs`/`meaning`/`example`;② 對話根本沒有備份到。
  單靠計算項目數量抓不到,必須驗欄位。
- **同步的刪除邏輯特別易錯**:另一部機刪除後,雲端會回「空清單 + 一條刪除記錄」。
  合併函數若在 incoming 為空時提早返回,本機副本就永遠清不走,項目會「翻生」。
  收藏與對話各有迴歸測試守住這一點。
- 錯誤須經 `friendlyError()`(`lib/poe.ts`)轉成清楚的英文訊息再顯示給用戶,不要直接彈出 Poe 的原始錯誤。

## Git / 部署
- 每個 Claude Code session 各自開 `claude/*` branch。修改 → PR → merge 至 `main`。
- Vercel 連接 `main`,push 後自動 redeploy。修改 env 之後需手動 redeploy。
- 有 service worker,線上更新後需 hard-refresh(手機 PWA 則完全關閉再開啟)。
