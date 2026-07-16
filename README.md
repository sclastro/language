# 英文對話練習 + 即時糾正 🗣️

一個用 [Poe API](https://creator.poe.com/docs/external-applications/openai-compatible-api) 做嘅英文學習工具:你用英文同 AI 傾偈,佢一方面自然咁回你,另一方面即時捉你嗰句嘅語法／用詞問題,**用繁體中文**解釋。

- **技術**:Next.js (App Router) + TypeScript
- **模型**:預設 `claude-opus-4.8`,UI 可以即時切去 `claude-sonnet-4.6` / `gpt-5.4` / `gemini-3.1-pro` 慳額度
- **私隱**:你嘅 Poe key 只留喺 server 端(`/api/chat`),永遠唔會落到 browser

## 點樣行

1. 裝 dependencies:
   ```bash
   npm install
   ```

2. 整 `.env.local`(唔會 commit):
   ```bash
   cp .env.local.example .env.local
   ```
   跟住去 <https://poe.com/api_key> 產生一個**新** key,填入 `POE_API_KEY`。
   > ⚠️ 之前貼過出街嘅 key 當已洩漏,請重新產生。

3. 開發模式:
   ```bash
   npm run dev
   ```
   開 <http://localhost:3000>,用英文打句嘢就得。

4. 正式 build:
   ```bash
   npm run build && npm start
   ```

## 用法

- 頂部可揀**難度**(初／中／高)同**模型**。
- 打錯咗嘅句會喺下面出一張糾正卡(原文 → 改正 + 中文解釋);啱嘅就顯示「冇問題」。
- 對話同設定會存喺 browser `localStorage`,refresh 都仲喺度;㩒「清除」重新開始。
- 底部會顯示今次 session 大約用咗幾多 token,方便睇住你嘅月額度。

## 語音(TTS + STT)

- **🔊 讀出嚟**:AI 回覆同「正確版本」旁邊有喇叭掣,用 ElevenLabs 讀出自然英文。
- **🎤 你講佢聽**:輸入框左邊麥克風掣,講完英文由 Cartesia Whisper 轉做文字。
- ⚠️ 兩者都會消耗 Poe points。可用 `POE_TTS_MODEL` / `POE_STT_MODEL` 換 model。

## 密碼保護

設定環境變數 `APP_PASSWORD` 就會啟用登入閘:入 app 要打密碼,`/api/*` 亦會擋(唔係淨係遮介面)。cookie 只存密碼嘅 sha256,唔存密碼本身。留空就唔啟用(方便本機開發)。部署到公開 URL 建議一定要設。

## 慳 Poe points 貼士

`claude-opus-4.8` 質素最好但最貴。日常大量練習可以揀 `claude-sonnet-4.6` 或 `gpt-5.4`,想深入先切返 Opus。API 端已經自動:只送最近 8 條對話、`max_tokens` 封頂、精簡 system prompt。

## 結構

```
src/
├─ app/
│  ├─ page.tsx            # 主聊天 UI(client)
│  ├─ layout.tsx / globals.css
│  └─ api/chat/route.ts   # server route:呼叫 Poe,回 {reply, corrections, usage}
├─ components/            # MessageBubble, CorrectionCard
└─ lib/
   ├─ poe.ts             # OpenAI client 指去 Poe(server-only)
   ├─ models.ts          # 模型清單(client-safe)
   ├─ prompt.ts          # system prompt
   └─ types.ts
```

## 之後可以加

生字卡 + 間隔重複(SRS)、閱讀理解、語音輸入、串流回覆、部署上 Vercel、轉手機 app。
