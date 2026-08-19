/**
 * The Rajasthan caste certificate application, stamped with the citizen's answers.
 *
 * One template, two different blanks. Rajasthan prints this form once per
 * category: SC and ST share परिशिष्ट-अ, OBC and SBC get परिशिष्ट-ध, and the two are
 * not the same paper. The `category` answer picks the blank, which is why this
 * module declares `variants` rather than a single `pdfPath` — the PDF is fetched
 * and the Stamper built before `fill` ever runs, so the choice cannot be made
 * inside it.
 *
 * What differs between them is not cosmetic. The SC/ST form's जाति box is
 * PRE-PRINTED with the category and must never be written to; the OBC one is
 * blank and must be. SC/ST asks the father's religion, caste and sub-caste and
 * which caste the applicant has recorded in school and business papers; OBC asks
 * none of that and wants the caste's serial number in the state list instead.
 * Read `caste-scst-slots-spec.json` first and the OBC one after — the judgement
 * and the findings live there, including the tick habit, which is the reverse of
 * PMUY's: here the box comes BEFORE its printed word.
 *
 * Almost nothing here is a comb. The form was drawn in Word, so every field is
 * one wide box holding free text, and the dates are printed ____/____/______
 * guides that have to be written run by run.
 *
 * The creamy-layer table, the patwari's report and the witness pages are left
 * alone on purpose, and each says why in NOTES.
 */

import obcBoxes from '../../data/official/caste-obc-boxes.json'
import scstBoxes from '../../data/official/caste-scst-boxes.json'
import { SHARED_NOTES, digitsOf, todayDdMmYyyy, toBoxText } from './stamper.js'

/** Which blank each category is printed on. SC and ST share one. */
const BLANK_FOR = { SC: 'scst', ST: 'scst', OBC: 'obc' }

const VARIANTS = {
  scst: { pdfPath: 'forms/caste-raj-scst.pdf', boxes: scstBoxes },
  obc: { pdfPath: 'forms/caste-raj-obc.pdf', boxes: obcBoxes },
}

/**
 * Ticks. The slot names are deliberately identical across the two blanks even
 * though the geometry is not: SC/ST draws हाँ and नहीं as two separate rows,
 * OBC as two cells of one row. The specs absorb that difference so this code
 * does not have to know about it.
 */
const GENDER_SLOT = { Male: 'gender.male', Female: 'gender.female' }
const MARITAL_SLOT = { Married: 'marital.married', Unmarried: 'marital.unmarried' }
const NATIVE_SLOT = { Yes: 'native.yes', No: 'native.no' }

/**
 * What this form might have to tell the citizen, on top of the shared notes.
 *
 * Nearly every box on page 1 is marked with an asterisk, which on this form
 * means mandatory — so a blank the citizen does not know about comes back as a
 * rejection weeks later. Anything left empty is reported here.
 */
const NOTES = {
  ...SHARED_NOTES,
  photo: {
    kind: 'blank',
    label: { en: 'Your photograph', hi: 'आपकी फोटो' },
    detail: {
      en: 'A passport size photograph goes in the box at the top right. The form asks for it to be attested by the responsible person who recommends your application, so get that done before you hand it in.',
      hi: 'ऊपर दाईं ओर बने खाने में पासपोर्ट साइज़ फोटो लगानी है। फॉर्म कहता है कि जो ज़िम्मेदार व्यक्ति आपकी सिफ़ारिश कर रहे हैं, उनसे फोटो सत्यापित करवानी है — जमा करने से पहले यह करा लीजिए।',
    },
  },
  patwariReport: {
    kind: 'blank',
    label: { en: 'The patwari’s report', hi: 'पटवारी की रिपोर्ट' },
    detail: {
      en: 'Section 2 is the halka patwari’s enquiry report, not yours. Leave it exactly as it is — the patwari fills and signs it after checking your papers.',
      hi: 'हिस्सा 2 हल्का पटवारी की जाँच रिपोर्ट है, आपका नहीं। उसे वैसा ही रहने दीजिए — पटवारी आपके कागज़ देखकर खुद भरेंगे और दस्तखत करेंगे।',
    },
  },
  witnessPages: {
    kind: 'blank',
    label: { en: 'The witness pages', hi: 'गवाहों वाले पन्ने' },
  },
  affidavitPage: {
    kind: 'blank',
    label: { en: 'The affidavit page', hi: 'शपथ-पत्र वाला पन्ना' },
    detail: {
      en: 'The affidavit repeats your name, your father’s name, where you live and your caste, and those have been filled in for you. It still has to go on stamp paper and be sworn before a notary or an oath commissioner — printing it is not enough.',
      hi: 'शपथ-पत्र में आपका नाम, पिता का नाम, निवास और जाति दोबारा आते हैं, वे भर दिए गए हैं। फिर भी इसे स्टाम्प पेपर पर लेना है और नोटरी या शपथ आयुक्त के सामने शपथ लेनी है — सिर्फ़ छाप देना काफ़ी नहीं है।',
    },
  },
  creamyTable: {
    kind: 'blank',
    label: { en: 'Your parents’ and husband’s work and income', hi: 'माता-पिता और पति के काम और आय' },
    detail: {
      en: 'The table asking for your mother’s, father’s and husband’s employer, post, pay scale and property was left empty, and so was the family income line below it. This table is what decides whether you count as non-creamy-layer, so a wrong figure here is worse than a blank one. Fill it in yourself with the exact figures, or ask at the eMitra counter.',
      hi: 'माता, पिता और पति के काम की जगह, पद, वेतनमान और सम्पत्ति वाली तालिका खाली छोड़ी गई है, और उसके नीचे परिवार की आय वाली पंक्ति भी। इसी तालिका से तय होता है कि आप नॉन-क्रीमी लेयर में आते हैं या नहीं, इसलिए यहाँ गलत आँकड़ा खाली से भी बुरा है। सही आँकड़े खुद भरिए, या ईमित्र वाले से पूछ लीजिए।',
    },
  },
  disabilitySection: {
    kind: 'blank',
    label: { en: 'The death or disability section', hi: 'मृत्यु या स्थाई अक्षमता वाला हिस्सा' },
    detail: {
      en: 'Section 3 asks about a death or permanent disability in the family. The form itself says to skip it if it does not apply to you, so it was left empty. If it does apply, write the date and the details there by hand.',
      hi: 'हिस्सा 3 परिवार में मृत्यु या स्थाई अक्षमता के बारे में पूछता है। फॉर्म खुद कहता है कि लागू न हो तो छोड़ दीजिए, इसलिए खाली छोड़ा गया है। अगर लागू होता है तो वहाँ तारीख और ब्यौरा हाथ से लिख दीजिए।',
    },
  },
  nativeAskedTwice: {
    kind: 'blank',
    label: { en: 'The Rajasthan question, asked twice', hi: 'राजस्थान वाला सवाल, दो बार' },
    detail: {
      en: 'This form asks whether you are a native of Rajasthan in two places. Item 9 has boxes and has been ticked for you. Item 11 asks the same thing again on a printed line with no box, so nothing could be written there — copy the same answer, हाँ or नहीं, onto that line by hand.',
      hi: 'यह फॉर्म दो जगह पूछता है कि आप राजस्थान के मूल निवासी हैं या नहीं। बिंदु 9 में खाने बने हैं और वहाँ निशान लगा दिया गया है। बिंदु 11 वही बात दोबारा पूछता है, पर वहाँ खाना नहीं, सिर्फ़ एक लकीर है, इसलिए कुछ लिखा नहीं जा सका — वही जवाब, हाँ या नहीं, उस लकीर पर हाथ से लिख दीजिए।',
    },
  },
  bothAddresses: {
    kind: 'assumed',
    label: { en: 'Current and permanent address', hi: 'वर्तमान और स्थाई पता' },
    detail: {
      en: 'The form asks for a current address and a permanent address separately. We hold only one address for you, so the same one was written into both. A caste certificate is issued where your family belongs — if your family’s permanent address is different, correct the second line before handing the form in.',
      hi: 'फॉर्म वर्तमान पता और स्थाई पता अलग-अलग माँगता है। हमारे पास आपका एक ही पता है, इसलिए वही दोनों जगह लिख दिया गया है। जाति प्रमाण पत्र वहीं बनता है जहाँ आपका परिवार का मूल है — अगर परिवार का स्थाई पता अलग है, तो फॉर्म देने से पहले दूसरी पंक्ति सुधार लीजिए।',
    },
  },
  ageFromDob: {
    kind: 'assumed',
    label: { en: 'Your age', hi: 'आपकी उम्र' },
  },
  placeFromVillage: {
    kind: 'assumed',
    label: { en: 'Place of signing', hi: 'दस्तखत की जगह' },
  },
  genderNotOnForm: {
    kind: 'blank',
    label: { en: 'Gender box', hi: 'लिंग का खाना' },
    detail: {
      en: 'This form prints only two boxes, पुरुष and महिला, so neither was ticked. Write your answer beside them by hand.',
      hi: 'इस फॉर्म में सिर्फ़ दो खाने छपे हैं, पुरुष और महिला, इसलिए किसी पर निशान नहीं लगाया गया। अपना जवाब उनके पास हाथ से लिख दीजिए।',
    },
  },
  bhamashah: {
    kind: 'blank',
    label: { en: 'Bhamashah card number', hi: 'भामाशाह कार्ड संख्या' },
    detail: {
      en: 'You did not give one, so the box at the top was left empty. It asks for the Bhamashah number of the head of your family. Fill it in if your family has the card.',
      hi: 'आपने नहीं बताया, इसलिए ऊपर वाला खाना खाली छोड़ा गया है। इसमें परिवार के मुखिया की भामाशाह संख्या भरनी होती है। अगर आपके परिवार के पास कार्ड है तो भर दीजिए।',
    },
  },
  listSerial: {
    kind: 'blank',
    label: { en: 'Caste serial number in the state list', hi: 'राज्य सूची में जाति का क्रमांक' },
    detail: {
      en: 'Item 8 wants the number your caste carries in Rajasthan’s OBC list. You did not have it, so it was left empty. The eMitra counter can look it up from your caste name.',
      hi: 'बिंदु 8 में वह क्रमांक चाहिए जो राजस्थान की ओबीसी सूची में आपकी जाति का है। आपके पास नहीं था, इसलिए खाली छोड़ा गया है। ईमित्र वाले आपकी जाति के नाम से देखकर बता देंगे।',
    },
  },
}

/** Whole years completed, for the उम्र box the form asks for beside the date. */
function ageFromDob(dob, now = new Date()) {
  const d = digitsOf(dob)
  if (d.length !== 8) return null
  const day = Number(d.slice(0, 2))
  const month = Number(d.slice(2, 4))
  const year = Number(d.slice(4))
  let age = now.getFullYear() - year
  const monthNow = now.getMonth() + 1
  if (monthNow < month || (monthNow === month && now.getDate() < day)) age -= 1
  return age >= 0 && age < 130 ? String(age) : null
}

/** 234567890124 → 2345 6789 0124, for a wide box rather than a comb. */
const inFours = (digits) => digits.replace(/(\d{4})(?=\d)/g, '$1 ')

function fill(s, answers) {
  const isObc = answers.category === 'OBC'

  const NAME_LABEL = { en: 'Your name', hi: 'आपका नाम' }
  const FATHER_LABEL = { en: 'Your father’s name', hi: 'आपके पिता का नाम' }
  const ADDRESS_LABEL = { en: 'Your address', hi: 'आपका पता' }
  const VILLAGE_LABEL = { en: 'Village or town', hi: 'गाँव या शहर' }
  const TEHSIL_LABEL = { en: 'Tehsil', hi: 'तहसील' }
  const DISTRICT_LABEL = { en: 'District', hi: 'ज़िला' }
  const BIRTHPLACE_LABEL = { en: 'Place of birth', hi: 'जन्म स्थान' }
  const RELIGION_LABEL = { en: 'Your religion', hi: 'आपका धर्म' }
  const CASTE_LABEL = { en: 'Your caste', hi: 'आपकी जाति' }
  const SUBCASTE_LABEL = { en: 'Your sub-caste', hi: 'आपकी उपजाति' }

  // Devanagari cannot go into these boxes at all — the form is stamped with
  // Helvetica, which has no glyphs for it. That matters far more here than on
  // the LPG form: caste, sub-caste, village and birthplace are exactly the
  // answers a citizen gives in Hindi. Rather than fire one identical note per
  // box, the labels are collected and reported once, naming every box affected.
  const unwritable = []

  /** Every field on this form is one wide box holding free text, never a comb. */
  const write = (slot, value, label) => {
    const text = toBoxText(value)
    if (text) return s.free(slot, text, label)
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      unwritable.push(label)
    }
    return false
  }

  // ── The header: Aadhaar and Bhamashah ───────────────────────────────────
  const aadhaar = digitsOf(answers.aadhaar)
  if (aadhaar.length === 12) {
    s.free('aadhaar', inFours(aadhaar), { en: 'Aadhaar number', hi: 'आधार संख्या' })
  } else if (answers.aadhaar) {
    s.note('badValue', { en: 'Aadhaar number', hi: 'आधार संख्या' })
  }

  const bhamashah = digitsOf(answers.bhamashah)
  if (bhamashah) s.free('bhamashah', bhamashah, { en: 'Bhamashah number', hi: 'भामाशाह संख्या' })
  else s.note('bhamashah')

  // ── Items 1-4: who and where ────────────────────────────────────────────
  write('applicantName', answers.applicant_name, NAME_LABEL)
  write('fatherName', answers.father_name, FATHER_LABEL)

  // The form wants a current address and a permanent one. We hold a single
  // address string, so both get it and the citizen is told to check the second.
  if (write('address.present', answers.address, ADDRESS_LABEL)) {
    write('address.permanent', answers.address, ADDRESS_LABEL)
    s.note('bothAddresses')
  }

  write('address.village', answers.village, VILLAGE_LABEL)
  write('address.tehsil', answers.tehsil, TEHSIL_LABEL)
  write('address.district', answers.district, DISTRICT_LABEL)

  // ── Item 5: birth ───────────────────────────────────────────────────────
  // Not a box. The form prints ____/____/______ inside one, so each part goes
  // on its own run and the printed slashes are left standing.
  const dob = String(answers.dob ?? '').split('/')
  if (dob.length === 3 && s.guide('dob', dob)) {
    const age = ageFromDob(answers.dob)
    if (age) {
      s.free('age', age, { en: 'Age', hi: 'उम्र' })
      s.note('ageFromDob', {
        en: `Your age was worked out as ${age} from your date of birth. Check it against the day you hand the form in.`,
        hi: `आपकी जन्म तिथि से उम्र ${age} साल निकाली गई है। फॉर्म जमा करने के दिन के हिसाब से जाँच लीजिए।`,
      })
    }
  } else if (answers.dob) {
    s.note('badValue', { en: 'Date of birth', hi: 'जन्म तिथि' })
  }

  write('birthPlace', answers.birthplace, BIRTHPLACE_LABEL)

  // ── Item 6: gender and marital status ───────────────────────────────────
  if (GENDER_SLOT[answers.gender]) s.tick(GENDER_SLOT[answers.gender])
  else if (answers.gender) s.note('genderNotOnForm')

  if (MARITAL_SLOT[answers.marital_status]) s.tick(MARITAL_SLOT[answers.marital_status])

  // ── Items 7-9: religion, caste, sub-caste — where the two forms part ────
  if (isObc) {
    // OBC asks these once, of the applicant, and its जाति box is genuinely
    // blank. Item 8 wants the caste's serial number in the state OBC list.
    write('religion', answers.religion, RELIGION_LABEL)
    write('caste', answers.caste_name, CASTE_LABEL)
    write('subCaste', answers.sub_caste, SUBCASTE_LABEL)
    if (!write('listSerial', answers.list_serial, { en: 'Serial number in the state list', hi: 'राज्य सूची में क्रमांक' })) {
      s.note('listSerial')
    }
  } else {
    // SC/ST asks them twice — item 7 of the applicant, item 8 of the father —
    // then asks at item 9 which caste and religion appear in the applicant's
    // school and business records. Item 7's जाति box is NOT filled: it is
    // pre-printed "अनुसूचित जाति/जन जाति", the form saying which category it
    // serves. Writing into it would strike through the form's own text.
    write('religion.applicant', answers.religion, RELIGION_LABEL)
    write('subCaste.applicant', answers.sub_caste, SUBCASTE_LABEL)
    write('religion.father', answers.father_religion, { en: 'Father’s religion', hi: 'पिता का धर्म' })
    write('caste.father', answers.father_caste, { en: 'Father’s caste', hi: 'पिता की जाति' })
    write('subCaste.father', answers.father_sub_caste, { en: 'Father’s sub-caste', hi: 'पिता की उपजाति' })
    write('recordedCaste', answers.recorded_caste, {
      en: 'Caste recorded in your school and work papers',
      hi: 'शिक्षा और व्यवसाय के कागज़ों में दर्ज जाति',
    })
  }

  // ── The Rajasthan native question, and the mobile ────────────────────────
  if (NATIVE_SLOT[answers.native_of_rajasthan]) {
    s.tick(NATIVE_SLOT[answers.native_of_rajasthan])
    // OBC prints the same question a second time at item 11, on a bare line
    // with no box around it, so there is nothing to write into.
    if (isObc) s.note('nativeAskedTwice')
  }

  const mobile = digitsOf(answers.mobile)
  if (mobile.length === 10) s.free('mobile', mobile, { en: 'Mobile number', hi: 'मोबाइल नंबर' })
  else if (answers.mobile) s.note('badValue', { en: 'Mobile number', hi: 'मोबाइल नंबर' })

  // ── The declaration under page 1 ────────────────────────────────────────
  s.guide('declarationDate', todayDdMmYyyy().split('/'))
  if (write('declarationPlace', answers.village, { en: 'Place', hi: 'स्थान' })) {
    s.note('placeFromVillage', {
      en: 'The place beside the date was filled in with your village or town. If you sign the form somewhere else, change it.',
      hi: 'तारीख के साथ वाली जगह में आपका गाँव या शहर लिख दिया गया है। अगर आप कहीं और दस्तखत कर रहे हैं तो बदल दीजिए।',
    })
  }

  // ── The affidavit, which repeats page 1 from the same answers ───────────
  write('affidavit.name', answers.applicant_name, NAME_LABEL)
  write('affidavit.fatherName', answers.father_name, FATHER_LABEL)
  write('affidavit.resident', answers.address, ADDRESS_LABEL)
  write('affidavit.village', answers.village, VILLAGE_LABEL)
  write('affidavit.tehsil', answers.tehsil, TEHSIL_LABEL)
  write('affidavit.district', answers.district, DISTRICT_LABEL)
  write('affidavit.caste', answers.caste_name, CASTE_LABEL)

  // ── What could not be written, and what is still left to do on paper ────
  if (unwritable.length) {
    const en = [...new Set(unwritable.map((l) => l.en))].join(', ')
    const hi = [...new Set(unwritable.map((l) => l.hi))].join(', ')
    s.note('notLatin', {
      en: `These were left blank because the form only takes English letters: ${en}. Write them in yourself in English capitals, spelled the way Rajasthan’s list spells them.`,
      hi: `ये खाली छोड़े गए हैं क्योंकि फॉर्म में सिर्फ़ अंग्रेज़ी अक्षर चलते हैं: ${hi}। इन्हें खुद अंग्रेज़ी के बड़े अक्षरों में लिखिए, वैसी ही वर्तनी में जैसी राजस्थान की सूची में है।`,
    })
  }

  s.note('photo')
  s.note('signature')
  s.note('affidavitPage')
  s.note('patwariReport')
  s.note('witnessPages', isObc
    ? {
        en: 'Pages 2 and 3 are both for witnesses, and neither is optional. Section 4 on page 2 is for an applicant who can show an income tax return or a government pay slip; section 6 on page 3 is for one who can show neither. Get the one that fits you signed by the responsible person named on it.',
        hi: 'पन्ना 2 और पन्ना 3, दोनों गवाहों के लिए हैं, और दोनों में से कोई छोड़ना नहीं है। पन्ने 2 का हिस्सा 4 उनके लिए है जो आयकर रिटर्न या सरकारी वेतन पर्ची दिखा सकते हैं; पन्ने 3 का हिस्सा 6 उनके लिए जो दोनों में से कुछ नहीं दिखा सकते। जो आप पर लागू हो, उस पर वहाँ लिखे ज़िम्मेदार व्यक्ति से दस्तखत करवाइए।',
      }
    : {
        en: 'Page 2 is the certificate two responsible people have to sign for you. Take it to them with your papers — the form is not complete without their signatures.',
        hi: 'पन्ना 2 वह प्रमाण-पत्र है जिस पर दो ज़िम्मेदार व्यक्तियों के दस्तखत होने हैं। अपने कागज़ों के साथ उनके पास ले जाइए — उनके दस्तखत के बिना फॉर्म पूरा नहीं है।',
      })

  if (isObc) {
    s.note('creamyTable')
    s.note('disabilitySection')
  }
}

export default {
  id: 'caste-certificate',
  variants: VARIANTS,
  /** Which blank to print on. Throws rather than guess: the wrong caste form is worse than none. */
  variant(answers) {
    const key = BLANK_FOR[answers.category]
    if (!key) throw new Error(`caste-certificate: no blank for category "${answers.category}"`)
    return key
  },
  notes: NOTES,
  fill,
}
