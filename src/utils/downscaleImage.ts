// 画像(data URL)を最大辺 maxSize に収まるよう縮小し、JPEGで再エンコードして返す。
// アバターの巨大base64を抑え、読み込み・描画・メモリを軽くするため。
export async function downscaleImage(
  src: string,
  maxSize = 1024,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const longest = Math.max(img.width, img.height)
      const scale = Math.min(1, maxSize / longest)
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 2d context を取得できません'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}
