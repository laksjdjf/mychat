// ComfyUI Irodori-TTS のチャット用ワークフロー（本番確定版）
//
// 元になった ComfyUI ワークフロー `irodori-tts.json` から、チャット向けに以下を調整:
//   - AnimeWhisper の文字起こし(QA)ブランチを削除
//   - IrodoriEmptyLatent.batch_size を 4 → 1
//   - 話者埋め込みを直接 IrodoriEmptyLatent / IrodoriTextEncode に接続
//   - 出力を SaveAudio(FLAC, deprecated) → SaveAudioMP3(320k) に変更
//     （FLAC は Firefox の decodeAudioData で再生不可のことがあるため）
//
// 実測(RTX 3090 / 20step / 1行≈30字):
//   - コールド(セッション初回): ~12s  ← checkpoint + DACVAEコーデックのロード込み
//   - ウォーム(2回目以降):      ~2.4s ← モデル常駐後の純生成（MP3エンコード込み）
//
// 投入の流れ:
//   1. このワークフローを深いコピー
//   2. IRODORI_CHAT_NODES のノードへ text / 話者 / noise seed をパッチ（下記参照）
//   3. POST /comfy/prompt { prompt, client_id }
//   4. /comfy/history/{prompt_id} をポーリングし done を待つ
//   5. outputs[OUTPUT].audio[0] の {filename, subfolder, type} を取得
//   6. GET /comfy/view?filename=...&subfolder=...&type=output で MP3 を ArrayBuffer 取得
//
// ※ 文字列の {{placeholder}} 置換ではなく、オブジェクトのフィールドを直接
//    書き換える（ノードID指定）方式にすること。改行や引用符のエスケープ事故を避ける。

import type { ComfyWorkflow } from './types'

/** パッチ対象ノードID（このワークフロー内での固定値） */
export const IRODORI_CHAT_NODES = {
  /** PrimitiveStringMultiline.value — 読み上げる1行のテキスト */
  text: '21',
  /** IrodoriSpeakerEmbedLoader.embed_name — キャラの声（models/speaker_embeddings/*.safetensors） */
  speakerEmbed: '28',
  /** RandomNoise.noise_seed — 生成のゆらぎ（再生成時に変えると別テイクになる） */
  noiseSeed: '7',
  /** SaveAudioMP3 — 完成音声の出力ノード。/history からこのノードの audio を読む */
  output: '12',
} as const

// 声の一覧は実行時に ComfyUI(/object_info)から取得する（comfyProvider.fetchSpeakerEmbeds）。
// 声の名前（実在キャラ名）をソースに残さないため、ここは空のフォールバックにしている。
export const IRODORI_SPEAKER_EMBEDS: readonly string[] = []

/** チャット用 Irodori-TTS ワークフロー（ComfyUI API 形式） */
export const irodoriChatWorkflow: ComfyWorkflow = {
  '5': {
    class_type: 'IrodoriCFGGuider',
    inputs: {
      cfg_min_t: 0.5,
      cfg_max_t: 1,
      scale_1: 3,
      scale_2: 5,
      scale_3: 3,
      model: ['18', 0],
      cond: ['36', 0],
      uncond_1: ['36', 1],
      uncond_2: ['36', 2],
    },
  },
  '6': {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['7', 0],
      guider: ['5', 0],
      sampler: ['8', 0],
      sigmas: ['9', 0],
      latent_image: ['22', 0],
    },
  },
  '7': {
    class_type: 'RandomNoise',
    inputs: { noise_seed: 4545 },
  },
  '8': {
    class_type: 'KSamplerSelect',
    inputs: { sampler_name: 'dpmpp_2s_ancestral' },
  },
  '9': {
    class_type: 'BasicScheduler',
    inputs: { scheduler: 'sgm_uniform', steps: 20, denoise: 1, model: ['18', 0] },
  },
  '11': {
    class_type: 'VAEDecodeAudio',
    inputs: { samples: ['38', 0], vae: ['18', 1] },
  },
  '12': {
    class_type: 'SaveAudioMP3',
    inputs: { filename_prefix: 'audio/mychat', quality: '320k', audio: ['11', 0] },
  },
  '18': {
    class_type: 'IrodoriCheckpointLoader',
    inputs: {
      ckpt_name: 'Irodori-TTS-V3.safetensors',
      codec_repo: 'Aratako/Semantic-DACVAE-Japanese-32dim',
      device: 'auto',
      dtype: 'bf16',
    },
  },
  '21': {
    class_type: 'PrimitiveStringMultiline',
    inputs: { value: 'こんにちは。' }, // ← 実行時に IRODORI_CHAT_NODES.text へパッチ
  },
  '22': {
    class_type: 'IrodoriEmptyLatent',
    inputs: {
      text: ['21', 0],
      seconds: 0, // 0 = テキストから長さ自動予測
      duration_scale: 1,
      batch_size: 1,
      model: ['18', 0],
      vae: ['18', 1],
      speaker_embed: ['28', 0],
    },
  },
  '28': {
    class_type: 'IrodoriSpeakerEmbedLoader',
    // 実行時に persona の声、または ComfyUI から取得した先頭の声でパッチする。
    // 名前をソースに残さないため既定は空。
    inputs: { embed_name: '' },
  },
  '36': {
    class_type: 'IrodoriTextEncode',
    inputs: {
      text: ['21', 0],
      speaker_uncond_mode: 'mask',
      caption: '',
      model: ['18', 0],
      speaker_embed: ['28', 0],
    },
  },
  '38': {
    class_type: 'IrodoriTrimTail',
    inputs: {
      window_size: 20,
      std_threshold: 0.05,
      mean_threshold: 0.1,
      vae: ['18', 1],
      samples: ['6', 1],
    },
  },
}
