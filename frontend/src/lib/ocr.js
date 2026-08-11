/**
 * Reading a photographed form with Tesseract.js.
 *
 * Runs entirely in the browser via WebAssembly — the image never leaves the
 * phone, which is both a privacy property and what makes offline scanning work.
 *
 * The language model (~4MB) downloads on first use and is then cached by the
 * service worker, so the second visit needs no network at all.
 */

import { identifyForm } from '../data/forms'

let workerPromise = null

/**
 * One worker, created lazily and reused.
 *
 * We load English only. Government form *headings* — the text identification
 * relies on — are almost always printed in English even on Hindi forms, and
 * adding the Hindi model would double the offline download for very little
 * gain. Revisit if field-survey photos say otherwise.
 */
function getWorker(onProgress) {
  if (!workerPromise) {
    // Imported dynamically so Tesseract's ~400KB stays out of the initial
    // bundle. Most sessions pick a form from the grid and never scan anything;
    // they should not pay for the OCR engine on a 2G connection.
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress ?? 0)
          else if (
            m.status?.includes('loading') ||
            m.status?.includes('download')
          ) {
            onProgress?.(0, m.status)
          }
        },
      }),
    )
  }
  return workerPromise
}

/**
 * Clean up a phone photo before OCR.
 *
 * Tesseract is much happier with high-contrast black-on-white than with a
 * shadowed, slightly yellow photo taken in a CSC. Three cheap fixes: cap the
 * resolution (bigger is slower, not better), convert to greyscale, then push
 * contrast hard around the midpoint.
 */
async function preprocess(fileOrBlob, maxWidth = 1600) {
  const bitmap = await createImageBitmap(fileOrBlob)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    // Rec. 601 luma — matches how the eye weights the channels.
    const grey = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    // Contrast stretch around mid-grey, then clamp.
    const boosted = Math.max(0, Math.min(255, (grey - 128) * 1.6 + 128))
    px[i] = boosted
    px[i + 1] = boosted
    px[i + 2] = boosted
  }
  ctx.putImageData(image, 0, 0)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * Scan a photo and work out which form it is.
 *
 * @param {Blob|File} image
 * @param {function} onProgress  called with (0..1, statusLabel)
 * @returns {Promise<{text: string, matches: Array, best: object|null}>}
 */
export async function scanForm(image, onProgress) {
  onProgress?.(0, 'preparing')
  const cleaned = await preprocess(image)

  const worker = await getWorker(onProgress)
  onProgress?.(0.05, 'reading')

  const {
    data: { text },
  } = await worker.recognize(cleaned)

  onProgress?.(1, 'done')

  const matches = identifyForm(text)
  return {
    text,
    matches,
    // Below this, the keyword evidence is too thin to auto-select a form; the
    // UI shows a chooser instead of guessing. Better to ask than to fill the
    // wrong form for someone who cannot read the result.
    best: matches.length && matches[0].confidence >= 0.15 ? matches[0] : null,
  }
}

/** Free the worker and its ~4MB of memory. */
export async function releaseOcr() {
  if (!workerPromise) return
  const worker = await workerPromise
  await worker.terminate()
  workerPromise = null
}
