// frontend/src/lib/rtipdf.js
// Stamps the citizen's RTI answers into the official Form A blank.
//
// Every position below was measured off the real blank (US Letter, 612x792pt).
// `y` is the printed rule's own position; text is lifted LIFT points above it so
// the letters sit ON the line the way a pen would, rather than through it.
// `w` is the usable width of that rule — text is shrunk to fit rather than
// allowed to run past the end into the next printed label.
//
// Privacy: nothing is uploaded. pdf-lib runs entirely in the browser.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/** Flip to true to re-draw the calibration grid. */
const DEBUG_GRID = false;

/** How far above the printed rule the text baseline sits. */
const LIFT = 3;

const F = {
  pio_l1: { x: 70, y: 590, w: 116, size: 9.5 },
  pio_l2: { x: 70, y: 575, w: 116, size: 9.5 },
  name: { x: 295, y: 552, w: 164, size: 10 },
  addr_l1: { x: 295, y: 535, w: 163, size: 9.5 },
  addr_l2: { x: 295, y: 520, w: 164, size: 9.5 },
  district: { x: 320, y: 500, w: 42, size: 9 },
  state: { x: 400, y: 500, w: 64, size: 9 },
  mobile: { x: 370, y: 467, w: 78, size: 9.5 },
  email: { x: 350, y: 450, w: 104, size: 9 },
  bpl: { x: 340, y: 432, w: 124, size: 10 },
  fee_ref: { x: 70, y: 320, w: 118, size: 8.5 },
  fee_date: { x: 200, y: 320, w: 68, size: 8.5 },
  fee_bank: { x: 310, y: 320, w: 145, size: 8.5 },
  fee_amt: { x: 430, y: 320, w: 88, size: 8.5 },
  info_l1: { x: 73, y: 270, w: 430, size: 9.5 },
  info_l2: { x: 73, y: 260, w: 430, size: 9.5 },
  info_l3: { x: 73, y: 250, w: 430, size: 9.5 },
  decl_name: { x: 274, y: 170, w: 136, size: 9.5 },
  guardian: { x: 84, y: 155, w: 181, size: 9.5 },
  date_place: { x: 145, y: 85, w: 240, size: 9.5 },
};

/** Left edge of each printed option on the "Please tick" line. */
const DELIVERY_X = { post: 154, email: 225, fax: 300, person: 365 };
const DELIVERY_Y = 227;

const INK = rgb(0.09, 0.16, 0.42);

// ── text fitting ──────────────────────────────────────────────────────────────

/** Largest size at or below slot.size that keeps `text` inside slot.w. */
function fitSize(font, text, slot) {
  let size = slot.size;
  while (size > 5.5 && font.widthOfTextAtSize(text, size) > slot.w)
    size -= 0.25;
  return size;
}

/** Greedily fill each slot with as many whole words as its width allows. */
function flow(font, text, slots) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let i = 0;
  for (const slot of slots) {
    let line = "";
    while (i < words.length) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (font.widthOfTextAtSize(next, slot.size) > slot.w) break;
      line = next;
      i += 1;
    }
    // A single word longer than the slot would loop forever — force it in.
    if (!line && i < words.length) {
      line = words[i];
      i += 1;
    }
    lines.push(line);
    if (i >= words.length) break;
  }
  return { lines, leftover: words.slice(i).join(" ") };
}

export async function buildRtiOfficialPdf(answers, lang = "hi") {
  const notes = [];

  const formUrl = "/forms/rti-form-a.pdf";
  let blankBytes;
  try {
    const resp = await fetch(formUrl);
    if (!resp.ok) throw new Error("Form not found");
    blankBytes = await resp.arrayBuffer();
  } catch {
    notes.push({
      kind: "blank",
      field: "form",
      message:
        "Could not load the blank RTI form — only the summary sheet was made.",
    });
    return { blob: null, notes };
  }

  const pdfDoc = await PDFDocument.load(blankBytes);
  const page = pdfDoc.getPages()[0];
  const { width: PW, height: PH } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (DEBUG_GRID) {
    for (let y = 10; y < PH; y += 10) {
      const major = y % 50 === 0;
      page.drawLine({
        start: { x: 0, y },
        end: { x: PW, y },
        thickness: major ? 0.6 : 0.2,
        color: rgb(0.85, 0.85, 0.85),
      });
      page.drawText(major ? `y=${y}` : `${y}`, {
        x: 3,
        y: y + 1,
        size: major ? 6 : 4,
        font,
        color: rgb(0.8, 0.2, 0.2),
      });
    }
    for (let x = 10; x < PW; x += 10) {
      const major = x % 50 === 0;
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: PH },
        thickness: major ? 0.6 : 0.2,
        color: rgb(0.75, 0.75, 1),
      });
      page.drawText(major ? `x=${x}` : `${x}`, {
        x: x + 1,
        y: PH - 12,
        size: major ? 6 : 4,
        font,
        color: rgb(0.2, 0.2, 0.8),
      });
    }
  }

  /** Draw one value on one printed rule, shrinking it to fit. */
  function put(slot, text, bold = false) {
    const value = String(text ?? "").trim();
    if (!value) return;
    const f = bold ? boldFont : font;
    page.drawText(value, {
      x: slot.x,
      y: slot.y + LIFT,
      size: fitSize(f, value, slot),
      font: f,
      color: INK,
    });
  }

  // ── To: the Public Information Officer ──────────────────────────────────────
  if (answers.public_authority) {
    const { lines, leftover } = flow(font, answers.public_authority, [
      F.pio_l1,
      F.pio_l2,
    ]);
    put(F.pio_l1, lines[0], true);
    put(F.pio_l2, lines[1], true);
    notes.push({
      kind: "assumed",
      field: "public_authority",
      message: `Addressed to "${answers.public_authority}". Write the PIO's name and full office address in by hand if you know them — it reaches the right desk faster.`,
    });
    if (leftover) {
      notes.push({
        kind: "truncated",
        field: "public_authority",
        message:
          "The office address was longer than the two printed lines. Check what fits before you submit.",
      });
    }
  } else {
    notes.push({
      kind: "blank",
      field: "public_authority",
      message:
        "The 'To' lines are blank — fill in the PIO's name and office address by hand.",
    });
  }

  // ── 1. Name ─────────────────────────────────────────────────────────────────
  put(F.name, (answers.applicant_name || "").toUpperCase());

  // ── 2. Address, then Distt. / State ─────────────────────────────────────────
  const addr = flow(font, (answers.address || "").toUpperCase(), [
    F.addr_l1,
    F.addr_l2,
  ]);
  put(F.addr_l1, addr.lines[0]);
  put(F.addr_l2, addr.lines[1]);
  if (addr.leftover) {
    notes.push({
      kind: "truncated",
      field: "address",
      message:
        "Your address did not fit the two address lines. Check the printed form and shorten it if needed — the reply is posted here.",
    });
  }

  put(F.district, (answers.district || "").toUpperCase());
  put(F.state, (answers.state || "").toUpperCase());
  if (!answers.district || !answers.state) {
    notes.push({
      kind: "blank",
      field: "district_state",
      message:
        "District and State are blank — write them in by hand next to Distt. and State.",
    });
  }

  put(F.mobile, answers.mobile || "");
  put(F.email, answers.email || "");

  // ── 3. BPL ──────────────────────────────────────────────────────────────────
  const isBpl = answers.bpl_status === "Yes";
  put(F.bpl, isBpl ? "YES - BPL card attached" : "NO");

  // ── 4. Fee ──────────────────────────────────────────────────────────────────
  if (isBpl) {
    put(F.fee_ref, "BPL - exempt");
    put(F.fee_amt, "Nil");
    notes.push({
      kind: "assumed",
      field: "bpl_status",
      message:
        "No fee is payable. Attach a copy of your BPL card — without it the office will ask for Rs.10.",
    });
  } else {
    put(F.fee_ref, answers.fee_ref || "");
    put(F.fee_date, answers.fee_date || "");
    put(F.fee_bank, answers.fee_bank || "Cash");
    put(F.fee_amt, "10");
    if (!answers.fee_ref) {
      notes.push({
        kind: "blank",
        field: "fee",
        message:
          "The receipt number and date are blank. Pay Rs.10 at the counter first, then write the receipt / DD / IPO number into that row.",
      });
    }
  }

  // ── 5. Particulars of information required ──────────────────────────────────
  const request = [
    answers.information_sought,
    answers.period_of_information
      ? `Period: ${answers.period_of_information}`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  const info = flow(font, request, [F.info_l1, F.info_l2, F.info_l3]);
  put(F.info_l1, info.lines[0]);
  put(F.info_l2, info.lines[1]);
  put(F.info_l3, info.lines[2]);

  if (info.leftover) {
    page.drawText("(continued on the attached sheet)", {
      x: F.info_l3.x,
      y: F.info_l3.y - 11,
      size: 8,
      font,
      color: rgb(0.55, 0.1, 0.1),
    });
    notes.push({
      kind: "assumed",
      field: "information_sought",
      message:
        "Your request was longer than the box, so a second sheet was added. Print both pages and hand them in together.",
    });

    const sheet = pdfDoc.addPage([PW, PH]);
    sheet.drawText("Annexure to Item 5 - Particulars of Information Required", {
      x: 72,
      y: PH - 64,
      size: 12,
      font: boldFont,
      color: INK,
    });
    sheet.drawText(
      `Applicant: ${(answers.applicant_name || "").toUpperCase()}`,
      {
        x: 72,
        y: PH - 86,
        size: 10,
        font,
        color: INK,
      },
    );
    sheet.drawText(`Addressed to: ${answers.public_authority || ""}`, {
      x: 72,
      y: PH - 101,
      size: 10,
      font,
      color: INK,
    });
    sheet.drawLine({
      start: { x: 72, y: PH - 112 },
      end: { x: PW - 72, y: PH - 112 },
      thickness: 0.6,
      color: INK,
    });

    let y = PH - 136;
    const full = flow(
      font,
      request,
      Array(40).fill({ x: 72, y: 0, w: PW - 144, size: 11 }),
    );
    for (const line of full.lines) {
      if (!line) break;
      sheet.drawText(line, { x: 72, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= 17;
    }

    sheet.drawText("Signature of Applicant: ______________________", {
      x: 72,
      y: 110,
      size: 10,
      font,
      color: INK,
    });
  }

  // ── 6. Tick the delivery option ─────────────────────────────────────────────
  // Two strokes rather than a glyph: no symbol font to embed, and nothing that
  // can fail to render on whichever printer the citizen ends up using.
  const tx = (DELIVERY_X[answers.delivery_mode] ?? DELIVERY_X.post) - 11;
  const ty = DELIVERY_Y + LIFT;
  page.drawLine({
    start: { x: tx, y: ty + 2 },
    end: { x: tx + 3, y: ty - 2 },
    thickness: 1.2,
    color: INK,
  });
  page.drawLine({
    start: { x: tx + 3, y: ty - 2 },
    end: { x: tx + 9, y: ty + 6 },
    thickness: 1.2,
    color: INK,
  });

  // ── Declaration ─────────────────────────────────────────────────────────────
  put(F.decl_name, (answers.applicant_name || "").toUpperCase());
  put(F.guardian, (answers.guardian_name || "").toUpperCase());
  put(F.date_place, answers.submission_place || "");

  notes.push({
    kind: "blank",
    field: "date",
    message:
      "The date is deliberately blank — write the date on the day you actually hand the form in.",
  });
  notes.push({
    kind: "blank",
    field: "signature",
    message:
      "Sign at the bottom right, above 'Signature of Applicant'. The form is not valid without it.",
  });

  const bytes = await pdfDoc.save();
  return { blob: new Blob([bytes], { type: "application/pdf" }), notes };
}
