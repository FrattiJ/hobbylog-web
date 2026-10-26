// Client-side image shrinking, in two output shapes.
//
// The Blob variants are what uploads use: photos and avatars go to Supabase
// Storage, and a Blob is both what the storage client wants and a third smaller
// than the same JPEG spelled as base64. The data-URL variants remain for custom
// entry covers, which are still inlined into the row.

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Center-crop to a square: an avatar is shown in a circle, so the edges of a
// portrait photo were never going to survive anyway.
function squareCanvas(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
  return canvas
}

// Scale down to fit a width, never up: a 400px photo blown up to 1200 costs
// three times the bytes to look worse.
function scaledCanvas(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, maxWidth / img.width)
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Square JPEG for a profile avatar, as a Blob to upload. */
export async function cropSquareAvatarBlob(file: File, size = 256, quality = 0.85): Promise<Blob> {
  return toBlob(squareCanvas(await loadImage(file), size), quality)
}

/** Shrunk JPEG for an entry photo, as a Blob to upload. */
export async function compressImageBlob(file: File, maxWidth = 1200, quality = 0.82): Promise<Blob> {
  return toBlob(scaledCanvas(await loadImage(file), maxWidth), quality)
}

/** Square JPEG as a data URL. */
export async function cropSquareAvatar(file: File, size = 256, quality = 0.85): Promise<string> {
  return squareCanvas(await loadImage(file), size).toDataURL('image/jpeg', quality)
}

/** Shrunk JPEG as a data URL — entry covers, which live in the row. */
export async function compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<string> {
  return scaledCanvas(await loadImage(file), maxWidth).toDataURL('image/jpeg', quality)
}
