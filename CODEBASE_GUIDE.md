# MyChat コードベース 読み込みガイド

ローカルLLM向けチャットUI。Vue 3 + TypeScript製。ペルソナ設定・ビジュアルノベルモード・TTSを備える。

---

## ディレクトリ構成

```
mychat/
├── src/
│   ├── components/
│   │   ├── chat/          # チャットUI (ChatArea, ChatInput, MessageList, MessageBubble, VNMode)
│   │   ├── layout/        # 画面レイアウト (AppLayout, LeftSidebar, RightPanel)
│   │   └── persona/       # ペルソナ管理 (PersonaSelector, PersonaEditor)
│   ├── stores/            # Pinia ストア (chatStore, personaStore, settingsStore)
│   ├── services/          # APIクライアント (dataApi, llmApi, ttsApi)
│   ├── composables/       # ロジック (useStreamingChat, useTts)
│   ├── types/index.ts     # TypeScript型定義
│   ├── utils/id.ts        # UUID生成
│   ├── App.vue            # ルートコンポーネント (初期化・ローディング制御)
│   ├── main.ts            # Vue/Piniaセットアップ
│   └── style.css          # グローバルCSS変数・テーマ
├── data/
│   ├── personas/          # ペルソナJSON (UUID.json)
│   ├── templates/         # システムプロンプトテンプレートJSON
│   └── audios/            # (旧)TTS参照音声 *.wav — 現行のComfyUI TTSでは未使用
├── vite.config.ts         # Viteサーバー設定 + /store APIミドルウェア
└── index.html             # エントリHTML
```

---

## アーキテクチャ全体像

```
[ Vue Components ]
      |
      ↓
[ Composables ]         useStreamingChat  /  useTts
      |
      ↓
[ Pinia Stores ]        chatStore / personaStore / settingsStore
      |
      ↓
[ Services (APIクライアント) ]
      |
      ↓  HTTP (Vite proxy / middleware)
[ 外部サービス ]
   - LLM API    → LLAMA_HOST:8080  (/api/v1/chat/completions)
   - TTS        → COMFY_HOST:8188  (ComfyUI /prompt・/history・/view, Irodori-TTS)
   - ファイル    → /data/          (/store/personas, /store/templates)
```

---

## 読み込む順番（推奨）

### Step 1 — 型定義を把握する
**`src/types/index.ts`**

全データ構造の基点。まずここを読む。

```typescript
Message          // role / content / reasoning / timestamp
ChatSession      // messages[] + personaId
Persona          // name / personality / scenario / avatarUrl / ttsSpeakerEmbed / customFields
SystemPromptTemplate  // name + template文字列({{name}}等のプレースホルダー)
LlmRequestMessage    // LLM APIに送る形式
```

---

### Step 2 — 状態管理の全体を把握する
**`src/stores/`**

| ファイル | 役割 | 永続化先 |
|---------|------|---------|
| `chatStore.ts` | セッション・メッセージ管理 | `localStorage` |
| `personaStore.ts` | ペルソナ一覧・選択中ペルソナ | サーバー (`/data/personas/`) |
| `settingsStore.ts` | テンプレート・APIエンドポイント・TTS設定 + `resolvedSystemPrompt` 算出 | テンプレートはサーバー、設定はlocalStorage |

重要な算出プロパティ:
- `chatStore.activeMessages` — 現在のセッションのメッセージ列
- `personaStore.activePersona` — 選択中ペルソナオブジェクト
- `settingsStore.resolvedSystemPrompt` — テンプレート + ペルソナ変数を展開したシステムプロンプト

---

### Step 3 — メッセージ送受信の流れ
**`src/composables/useStreamingChat.ts`**

チャットの核心ロジック。

```
1. sendMessage(userContent)
   └─ chatStore.addMessage({ role: 'user', content })
   └─ generateAssistantResponse()
       └─ buildApiMessages()       ← システムプロンプト + 全会話履歴を組み立て
       └─ chatStore.addMessage({ role: 'assistant', content: '' })  ← 空メッセージを先に追加
       └─ streamChatCompletion()   ← SSEストリームを順次受信
           └─ chunk.reasoning → chatStore.appendReasoningToLastAssistant()
           └─ chunk.content   → chatStore.appendToLastAssistant()
```

エラー時は空のアシスタントメッセージを削除し、エラーバーを表示する。

---

### Step 4 — APIクライアント
**`src/services/`**

| ファイル | エンドポイント | 内容 |
|---------|--------------|------|
| `llmApi.ts` | `POST /api/v1/chat/completions` | SSEストリーミング。`delta.content` と `delta.reasoning_content` を分離してyield |
| `ttsApi.ts` → `tts/comfyProvider.ts` | `POST /comfy/prompt` → `/history` → `/view` | ComfyUI(Irodori-TTS)にワークフロー投入し1行分のMP3を `ArrayBuffer` で取得 |
| `dataApi.ts` | `GET/PUT/DELETE /store/personas`, `/store/templates` | Viteミドルウェアが `/data/` 以下のJSONを読み書き |

---

### Step 5 — TTS（ComfyUI / Irodori-TTS）
**`src/composables/useTts.ts` + `src/services/tts/`**

```
speak(text, messageId, personaId)
  └─ テキストを二重改行・括弧無視で分割 (splitLines)
  └─ persona.ttsSpeakerEmbed を声(ComfyVoice)に
  └─ 各行を fetchTtsAudio → comfyProvider.synthesizeViaComfy
  │     └─ irodoriChatWorkflow を複製しノードIDで text/声/noise seed をパッチ
  │     └─ POST /comfy/prompt → /comfy/history ポーリング → /comfy/view でMP3取得
  └─ Web Audio API で AudioBuffer にデコード
  └─ 順番に再生 (チャンク間1秒ポーズ)・再生中に次行を先読み
  └─ messageId ごとにキャッシュ (再生ボタン用)
```

声の一覧は `comfyProvider.fetchSpeakerEmbeds()` が ComfyUI `/object_info` から動的取得する
（実在キャラ名をソースに持たないため固定リストは空フォールバックのみ）。

---

### Step 6 — コンポーネント構成
**`src/components/`**

```
App.vue
└─ AppLayout.vue           (3カラム / 768pxでモバイル切替)
    ├─ LeftSidebar.vue     (セッション一覧・新規作成)
    ├─ ChatArea.vue        (モード切替: 通常 or VNモード)
    │   ├─ VNMode.vue      (全画面アバター + 吹き出し)
    │   ├─ MessageList.vue
    │   │   └─ MessageBubble.vue  (thinkingトグル + markdown + TTSボタン)
    │   └─ ChatInput.vue   (Shift+Enter で送信)
    └─ RightPanel.vue      (3タブ: Persona / System / Settings)
        ├─ PersonaSelector.vue
        └─ PersonaEditor.vue  (アバター・フォーカルポイント・カスタムフィールド)
```

---

### Step 7 — Viteサーバー設定
**`vite.config.ts`**

- `/api` → `http://LLAMA_HOST:LLAMA_PORT` へプロキシ
- `/comfy` → `http://COMFY_HOST:COMFY_PORT` へプロキシ（Origin書き換えでComfyUIの403回避）
- `/store/*` → カスタムミドルウェアで `/data/` 以下のJSONファイルを CRUD
- `host: '0.0.0.0'` でLAN公開（スマホから利用するため。自宅LAN前提）

環境変数 (省略時はデフォルト値):
```
LLAMA_HOST=localhost  LLAMA_PORT=8080
COMFY_HOST=localhost  COMFY_PORT=8188
```

---

## 主要な設計判断

| テーマ | 実装方針 |
|--------|---------|
| **永続化の分離** | チャット履歴はlocalStorage (ブラウザローカル)、ペルソナ/テンプレートはサーバーファイル (共有可能) |
| **ストリーミング** | SSEを `ReadableStream` で読み、`AbortController` でキャンセル可能 |
| **Thinkingタグ** | `<think>...</think>` と `<\|channel>...<channel\|>` の2形式に対応、ストリーム途中でも解析 |
| **TTSキャッシュ** | `Map<messageId, AudioBuffer[]>` でデコード済み音声をキャッシュ |
| **テンプレート変数** | `{{name}}` `{{personality}}` `{{scenario}}` + カスタムフィールドをregexで展開 |
| **レスポンシブ** | 768px以下でサイドバーをオーバーレイ表示 |
| **保存デバウンス** | ペルソナ/テンプレート編集は600msデバウンスでサーバー書き込み |

---

## グローバルCSS変数 (`src/style.css`)

```css
--bg-primary / --bg-secondary / --bg-tertiary   /* 背景3段階 */
--text-primary / --text-secondary               /* テキスト */
--accent: #7c5cbf                               /* アクセントカラー (紫) */
--border: #dee2e6
--msg-user-bg / --msg-assistant-bg              /* バブル背景 */
--danger: #e03131
```

全コンポーネントがこれらを使用。テーマ変更はここを編集すれば一括適用。

---

## よくある変更箇所

| やりたいこと | 見るファイル |
|------------|------------|
| LLMへ送るメッセージ構造を変えたい | `useStreamingChat.ts` > `buildApiMessages()` |
| Thinkingの表示を変えたい | `MessageBubble.vue` |
| ペルソナに新フィールドを追加したい | `types/index.ts` > `Persona` + `PersonaEditor.vue` + テンプレートのプレースホルダー |
| TTSの分割ロジックを変えたい | `useTts.ts` > `splitLines()` |
| テーマカラーを変えたい | `src/style.css` |
| データの保存先を変えたい | `vite.config.ts` > `/store` ミドルウェア |
| LLMエンドポイントを変えたい | UIの設定タブ or `settingsStore.ts` のデフォルト値 |
