// ComfyUI API 形式ワークフローの最小型定義

/** 入力が別ノードの出力に接続されていることを表す [nodeId, outputIndex] */
export type ComfyConnection = [string, number]

export interface ComfyNode {
  class_type: string
  inputs: Record<string, unknown>
}

/** ノードID → ノード のマップ（ComfyUI の /prompt に送る形式） */
export type ComfyWorkflow = Record<string, ComfyNode>
