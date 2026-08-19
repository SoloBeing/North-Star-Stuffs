/**
 * The Ujjwala KYC application, stamped with the citizen's answers.
 *
 * Page 1 only, and deliberately. Page 2's header reads "To be filled by
 * Dealer/Distributor" — the category table, the LPG ID and the acknowledgement
 * slip are all the distributor's, so FormMitra leaves that page untouched and
 * says so in a note rather than filling boxes that are not the citizen's.
 *
 * The geometry in `lpg-boxes.json` is generated from `lpg-slots-spec.json`,
 * which is where the judgement lives — which row, which cells, and why. Read
 * that file before changing anything here; it records what the form turned out
 * to be, including its habit of putting a tick in the narrow cell that follows
 * the cell holding its printed word.
 *
 * The household table is 24 of this page's 66 slots and is not filled. Asking
 * six people's names, genders and Aadhaar numbers through a voice flow would
 * nearly triple the questions, and each of them has to sign the form by hand
 * anyway. It is reported as work the citizen still has to do.
 */

import boxes from '../../data/official/lpg-boxes.json'
import {
  LABELS,
  SHARED_NOTES,
  digitsOf,
  splitAddress,
  toBoxText,
} from './stamper.js'

/**
 * What this form might have to tell the citizen, on top of the shared notes.
 * Every one of these is a box left empty on purpose — this form declares that
 * all its fields are mandatory, so a blank the citizen does not know about is
 * a rejected application.
 */
const NOTES = {
  ...SHARED_NOTES,
  photo: {
    kind: 'blank',
    label: { en: 'Your photograph', hi: 'आपकी फोटो' },
    detail: {
      en: 'A photograph has to be pasted in the box at the top right of the form. Do that before you hand it in.',
      hi: 'फॉर्म के ऊपर दाईं ओर बने खाने में एक फोटो चिपकानी है। जमा करने से पहले चिपका दीजिए।',
    },
  },
  household: {
    kind: 'blank',
    label: { en: 'Household members', hi: 'घर के सदस्य' },
    detail: {
      en: 'The table asking for every household member above 18 was left empty. Write in each person’s relation to you, their name, M or F, and their Aadhaar number, and have each of them sign beside it. Use black ink and capital letters, as the form asks.',
      hi: 'घर के 18 साल से बड़े सदस्यों वाली तालिका खाली छोड़ी गई है। हर सदस्य का आपसे रिश्ता, नाम, M या F, और आधार नंबर लिखिए, और हर एक के दस्तखत साथ में करवाइए। फॉर्म के कहे अनुसार काली स्याही और बड़े अक्षरों में लिखिए।',
    },
  },
  contactMobile: {
    kind: 'blank',
    label: { en: 'Second mobile box', hi: 'दूसरा मोबाइल खाना' },
    detail: {
      en: 'Your number was written into the Mobile row at the top. The address section has a second Mobile No. box, and its boxes do not line up with that label, so it was left empty rather than filled with a guess. Copy your number into it by hand.',
      hi: 'आपका नंबर ऊपर वाली मोबाइल पंक्ति में लिख दिया गया है। पते वाले हिस्से में एक और मोबाइल नंबर का खाना है, पर वहाँ खाने उसके नाम से मेल नहीं खाते, इसलिए अंदाज़े से भरने के बजाय खाली छोड़ा गया है। अपना नंबर वहाँ हाथ से लिख दीजिए।',
    },
  },
  poaCode: {
    kind: 'blank',
    label: { en: 'Address proof code', hi: 'पते के प्रमाण का कोड' },
    detail: {
      en: 'You chose a document that was not in our list, so the two digit code was left empty. The full list of twenty-five documents is printed at the bottom of the form — find yours and copy the two digits after its name.',
      hi: 'आपने ऐसा दस्तावेज़ चुना जो हमारी सूची में नहीं था, इसलिए दो अंकों का कोड खाली छोड़ा गया है। पच्चीस दस्तावेज़ों की पूरी सूची फॉर्म के नीचे छपी है — अपना दस्तावेज़ ढूँढिए और उसके नाम के आगे लिखे दो अंक भर दीजिए।',
    },
  },
  distributorPage: {
    kind: 'blank',
    label: { en: 'The second page', hi: 'दूसरा पन्ना' },
    detail: {
      en: 'The whole second page belongs to the gas distributor, not to you. Leave it exactly as it is — they fill it when they accept your form.',
      hi: 'पूरा दूसरा पन्ना गैस डिस्ट्रीब्यूटर का है, आपका नहीं। उसे वैसा ही रहने दीजिए — फॉर्म लेते समय वही भरेंगे।',
    },
  },
  email: {
    kind: 'blank',
    label: { en: 'Email address', hi: 'ईमेल पता' },
    detail: {
      en: 'You said you do not have one, so it was left empty. Every message about your connection comes to your mobile anyway.',
      hi: 'आपने कहा था कि आपका ईमेल नहीं है, इसलिए खाली छोड़ा गया है। कनेक्शन का हर संदेश वैसे भी आपके मोबाइल पर ही आएगा।',
    },
  },
}

/** Which tick box a stored choice maps to. Ticks sit in the narrow cell after the printed word. */
const CASTE_SLOT = { SC: 'caste.sc', ST: 'caste.st', Others: 'caste.others' }
const MIGRANT_SLOT = { Yes: 'migrant.yes', No: 'migrant.no' }
const MIGRANT_CERT_SLOT = {
  Yes: 'migrantCertificate.yes',
  No: 'migrantCertificate.no',
}
const DECLARATION_SLOT = {
  Yes: 'declaration14Point.yes',
  No: 'declaration14Point.no',
}
const CYLINDER_SLOT = { '5 kg': 'cylinder.5kg', '14.2 kg': 'cylinder.14kg' }
const BURNER_SLOT = { '1 - Burner': 'burner.single', '2 - Burner': 'burner.double' }

function fill(s, answers) {
  const BANK_LABEL = { en: 'Your bank details', hi: 'आपके बैंक की जानकारी' }

  // ── a) Consumer details ─────────────────────────────────────────────────
  s.name(
    ['name.first', 'name.middle', 'name.last'],
    answers.full_name,
    LABELS.name,
  )

  s.digits(answers.aadhaar, 12, LABELS.aadhaar, (d) => s.comb('aadhaar', d))

  // The form prints D D M M Y Y Y Y over eight boxes, which is how we store it.
  s.digits(answers.dob, 8, LABELS.dob, (d) => s.comb('dob', d))

  s.digits(answers.mobile, 10, LABELS.mobile, (d) => s.comb('mobile', d))

  if (CASTE_SLOT[answers.caste]) s.tick(CASTE_SLOT[answers.caste])
  if (MIGRANT_SLOT[answers.migrant]) s.tick(MIGRANT_SLOT[answers.migrant])

  // ── b) Address for LPG connection / contact information ─────────────────
  // The form wants the two digit code, not the document's name, so the
  // template's option values are the codes themselves. "other" means the
  // citizen holds something off our list and has to read the code off the
  // form's own footnote.
  const poa = answers.poa_code
  if (poa && poa !== 'other') s.comb('poa.code', poa)
  else if (poa === 'other') s.note('poaCode')

  // The address arrives from DigiLocker as one comma-separated string, but this
  // form has eleven separately labelled address rows — far finer than the
  // string can be split into without inventing which part is a village and
  // which a city. Only the four that can be assigned from position are filled.
  const addr = splitAddress(answers.address)
  if (addr) {
    s.comb('address.houseNo', toBoxText(addr.flat), LABELS.address)
    s.comb('address.street', toBoxText(addr.road), LABELS.address)
    s.comb('address.areaPostOffice', toBoxText(addr.area), LABELS.address)
    s.comb('address.district', toBoxText(addr.district), LABELS.address)
    s.comb('address.state', toBoxText(addr.state), LABELS.address)
    s.note('addressSplit', {
      en: 'Your address was split across the house number, street, area, district and state rows. The rows for city, village, block, building, floor and landmark were left empty, because your address does not say which part is which. Check every line and write in what is missing.',
      hi: 'आपका पता मकान नंबर, गली, इलाका, ज़िला और राज्य वाली पंक्तियों में बाँटा गया है। शहर, गाँव, ब्लॉक, इमारत, मंज़िल और लैंडमार्क वाली पंक्तियाँ खाली छोड़ी गई हैं, क्योंकि आपके पते से यह पता नहीं चलता कि कौन सा हिस्सा कौन सा है। हर पंक्ति जाँचिए और छूटी हुई जानकारी लिख दीजिए।',
    })
  }

  s.comb('address.pincode', digitsOf(answers.pincode), LABELS.pincode)

  // Case is preserved here alone: every other box on this form wants block
  // capitals, but the local part of an address is case-sensitive by the spec.
  if (!s.free('address.email', toBoxText(answers.email, { upper: false }))) {
    s.note('email')
  }

  // The address section carries a second "Mobile No." box whose cells do not
  // line up with its printed label — four boxes sit between the label and the
  // gutter, and an unlabelled run of twelve sits after it. Ten digits fit
  // neither cleanly, so nothing is written there. See lpg-slots-spec.json.
  s.note('contactMobile')

  // ── d) Bank account ─────────────────────────────────────────────────────
  s.comb('bank.accountName', toBoxText(answers.account_name), BANK_LABEL)
  s.comb('bank.bankName', toBoxText(answers.bank_name), BANK_LABEL)
  s.comb('bank.branchName', toBoxText(answers.branch_name), BANK_LABEL)
  s.comb('bank.accountNumber', toBoxText(answers.bank_account), BANK_LABEL)

  // The row has ten boxes for an eleven character IFSC code. That is the form's
  // own defect, not a mapping error, so the truncation note is left to fire.
  s.comb('bank.ifsc', toBoxText(answers.ifsc), {
    en: 'IFSC code',
    hi: 'आईएफएससी कोड',
  })

  // ── e) Ration card ──────────────────────────────────────────────────────
  const RATION_LABEL = { en: 'Ration card', hi: 'राशन कार्ड' }
  s.comb('ration.stateOfIssue', toBoxText(answers.ration_state), RATION_LABEL)
  s.comb('ration.number', toBoxText(answers.ration_number), RATION_LABEL)

  // ── f) and g) The two declarations ──────────────────────────────────────
  if (DECLARATION_SLOT[answers.declaration_14point]) {
    s.tick(DECLARATION_SLOT[answers.declaration_14point])
  }
  // Only asked of someone who said they had moved here, so an absent answer is
  // the question never applying rather than a gap.
  if (MIGRANT_CERT_SLOT[answers.migrant_certificate]) {
    s.tick(MIGRANT_CERT_SLOT[answers.migrant_certificate])
  }

  // ── Equipment selection ─────────────────────────────────────────────────
  if (CYLINDER_SLOT[answers.cylinder]) s.tick(CYLINDER_SLOT[answers.cylinder])
  if (BURNER_SLOT[answers.burner]) s.tick(BURNER_SLOT[answers.burner])

  // ── What the citizen still has to do on paper ───────────────────────────
  s.note('household')
  s.note('photo')
  s.note('signature')
  s.note('distributorPage')
}

export default {
  id: 'ujjwala-kyc',
  pdfPath: 'forms/lpg-pmuy-kyc.pdf',
  boxes,
  notes: NOTES,
  fill,
}
