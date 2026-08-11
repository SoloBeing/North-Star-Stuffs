/**
 * Filled-form PDF generation, entirely in the browser.
 *
 * ── Why the page is drawn on a canvas ──────────────────────────────────────
 * pdf-lib can embed a TrueType font, but it has no text *shaping* engine. Hindi
 * needs shaping: matras reorder around their consonant and conjuncts fuse into
 * single glyphs. Handing Devanagari straight to pdf-lib produces text that is
 * subtly wrong in a way any Hindi reader spots immediately — which would
 * undercut the entire "in your own language" promise on the one artefact the
 * citizen actually carries to the counter.
 *
 * So we let the browser do what it is already excellent at: lay the page out on
 * a canvas, where Chrome shapes Devanagari (and any other script) correctly,
 * then have pdf-lib wrap that rendering into a real A4 PDF.
 *
 * Trade-off, stated plainly: the text is not selectable in the resulting PDF.
 * For a form that gets printed and handed across a counter this costs nothing,
 * and it buys guaranteed-correct rendering in every language we will ever add.
 */

// A4 at 150 DPI. Comfortably sharp when printed, and not a huge file.
const PAGE_W = 1240
const PAGE_H = 1754
const MARGIN = 90

const FONT = "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif"

const INK = '#10151f'
const SOFT = '#5a6480'
const LINE = '#c8cfdd'
const BRAND = '#1e40af'
const SAFFRON = '#c96a0e'

/** Wrap text to a pixel width, returning the lines. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word
    if (ctx.measureText(attempt).width <= maxWidth) {
      line = attempt
    } else {
      if (line) lines.push(line)
      // A single word longer than the line (a long address, an account number)
      // still has to go somewhere — break it by character.
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth) {
            lines.push(chunk)
            chunk = ch
          } else chunk += ch
        }
        line = chunk
      } else line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

class PageWriter {
  constructor() {
    this.pages = []
    this.newPage()
  }

  newPage() {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_W
    canvas.height = PAGE_H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    ctx.textBaseline = 'top'
    this.canvas = canvas
    this.ctx = ctx
    this.y = MARGIN
    this.pages.push(canvas)
    return ctx
  }

  ensure(space) {
    if (this.y + space > PAGE_H - MARGIN) this.newPage()
  }

  text(value, { size = 22, colour = INK, weight = '400', indent = 0 } = {}) {
    const ctx = this.ctx
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.fillStyle = colour
    const lines = wrap(ctx, value, PAGE_W - MARGIN * 2 - indent)
    for (const line of lines) {
      this.ensure(size * 1.5)
      this.ctx.font = `${weight} ${size}px ${FONT}`
      this.ctx.fillStyle = colour
      this.ctx.fillText(line, MARGIN + indent, this.y)
      this.y += size * 1.42
    }
  }

  gap(px) {
    this.y += px
  }

  /**
   * Pin the footer to the bottom of the *last* page.
   *
   * Letting the footer flow with the content produced a second page holding
   * nothing but two lines of small print — which looks like a printing error
   * to somebody about to hand this across a counter, and wastes a sheet of
   * paper they may be paying ₹2 for.
   */
  footer(lines) {
    // Sits in the bottom margin band rather than in the content flow. The
    // margin is dead space on every page anyway, and reserving flow space for
    // two lines of small print was enough to push them onto a page of their
    // own whenever content happened to end near the boundary.
    //
    // Drawn directly rather than through text()/rule(), because those call
    // ensure(), which treats anything below PAGE_H - MARGIN as an overflow and
    // would helpfully start the very page this method exists to avoid.
    const height = lines.length * 26 + 22
    let y = PAGE_H - 34 - height
    if (this.y > y) {
      this.newPage()
      y = PAGE_H - 34 - height
    }

    const ctx = this.ctx
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(MARGIN, y)
    ctx.lineTo(PAGE_W - MARGIN, y)
    ctx.stroke()
    y += 16

    for (const { text, size, colour } of lines) {
      ctx.font = `400 ${size}px ${FONT}`
      ctx.fillStyle = colour
      for (const line of wrap(ctx, text, PAGE_W - MARGIN * 2)) {
        ctx.fillText(line, MARGIN, y)
        y += size * 1.42
      }
    }
    this.y = y
  }

  rule(colour = LINE) {
    this.ensure(20)
    this.ctx.strokeStyle = colour
    this.ctx.lineWidth = 1.5
    this.ctx.beginPath()
    this.ctx.moveTo(MARGIN, this.y)
    this.ctx.lineTo(PAGE_W - MARGIN, this.y)
    this.ctx.stroke()
    this.y += 18
  }
}

/**
 * Build the filled form PDF.
 *
 * @param {object}  form     the template
 * @param {object}  answers  { fieldId: value }
 * @param {string}  lang     'hi' | 'en'
 * @param {object}  meta     { digilockerUsed: boolean }
 * @returns {Promise<Blob>}
 */
export async function buildFilledPdf(form, answers, lang = 'hi', meta = {}) {
  const w = new PageWriter()
  const t = (obj) => obj?.[lang] ?? obj?.en ?? ''

  // ── Header ───────────────────────────────────────────────────────────────
  w.ctx.fillStyle = BRAND
  w.ctx.fillRect(0, 0, PAGE_W, 14)

  w.text(t(form.name), { size: 40, weight: '700' })
  if (lang !== 'en') w.text(form.name.en, { size: 24, colour: SOFT })
  w.gap(8)
  w.text(t(form.issuer), { size: 21, colour: SOFT })
  w.gap(14)
  w.rule(BRAND)
  w.gap(10)

  // ── Answers ──────────────────────────────────────────────────────────────
  w.text(
    lang === 'hi' ? 'भरी गई जानकारी' : 'Filled details',
    { size: 26, weight: '700' },
  )
  w.gap(16)

  for (const field of form.fields) {
    const raw = answers[field.id]
    if (raw === undefined || raw === '') continue

    // Choice fields store a code ("BSBDA"); print the human label.
    let shown = raw
    if (field.rule === 'choice') {
      const option = field.options?.find((o) => o.value === raw)
      if (option) shown = t(option)
    } else if (field.rule === 'amount' && /^\d+$/.test(raw)) {
      // Indian grouping: a clerk reading "₹1,80,000" checks it at a glance,
      // where "180000" has to be counted digit by digit.
      shown = `₹${Number(raw).toLocaleString('en-IN')}`
    }

    w.ensure(110)
    const labelTop = w.y

    w.text(t(field.label), { size: 19, colour: SOFT })
    w.text(shown, { size: 27, weight: '600' })

    // Mark which fields came from a verified source rather than being typed.
    if (field.source === 'digilocker' && meta.digilockerUsed) {
      w.ctx.font = `600 16px ${FONT}`
      w.ctx.fillStyle = BRAND
      w.ctx.fillText('✓ DigiLocker verified', PAGE_W - MARGIN - 210, labelTop + 2)
    }

    w.gap(6)
    w.rule()
  }

  // ── Document checklist ───────────────────────────────────────────────────
  w.gap(20)
  w.ensure(200)
  w.text(
    lang === 'hi' ? 'साथ ले जाने वाले दस्तावेज़' : 'Documents to carry',
    { size: 26, weight: '700' },
  )
  w.gap(14)

  for (const doc of form.documents) {
    w.ensure(50)
    const boxY = w.y + 3
    w.ctx.strokeStyle = SOFT
    w.ctx.lineWidth = 2
    w.ctx.strokeRect(MARGIN, boxY, 22, 22)
    w.text(t(doc), { size: 21, indent: 44 })
    w.gap(8)
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  w.footer([
    {
      text:
        lang === 'hi'
          ? 'यह फॉर्म FormMitra से भरा गया है। जमा करने से पहले हर जानकारी एक बार जाँच लें।'
          : 'This form was filled using FormMitra. Please check every detail once before submitting.',
      size: 18,
      colour: SAFFRON,
    },
    {
      text: `${lang === 'hi' ? 'बनाया गया' : 'Generated'}: ${new Date().toLocaleString(
        lang === 'hi' ? 'hi-IN' : 'en-IN',
      )}`,
      size: 17,
      colour: SOFT,
    },
  ])

  // ── Wrap the rendered pages into a real PDF ──────────────────────────────
  // Dynamic import keeps pdf-lib out of the initial bundle — it is only needed
  // on the very last screen, long after the app has to feel responsive.
  const { PDFDocument } = await import('pdf-lib')

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${form.name.en} — FormMitra`)
  pdf.setCreator('FormMitra')
  pdf.setProducer('FormMitra (pdf-lib)')

  for (const canvas of w.pages) {
    const dataUrl = canvas.toDataURL('image/png')
    const png = await pdf.embedPng(dataUrl)
    // 595.28 x 841.89 pt is A4; the canvas is the same shape at 150 DPI.
    const page = pdf.addPage([595.28, 841.89])
    page.drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 })
  }

  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Trigger a download. The file never touches a server. */
export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
