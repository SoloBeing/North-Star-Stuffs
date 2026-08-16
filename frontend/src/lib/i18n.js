/**
 * UI strings, in both languages.
 *
 * Flat keys, no library. Every word a screen shows or speaks lives here, so a
 * missing translation is a visible gap in one file rather than a hunt through
 * twenty components. PDF text and validator messages are their own systems and
 * deliberately not here.
 *
 * A string that needs a value written into it uses a `{name}` placeholder and
 * is called as `t('key', lang, { name })`. Both languages must carry the same
 * placeholders; check:text fails the build when they drift apart.
 */

export const STRINGS = {
  appName: { en: 'FormMitra', hi: 'फॉर्ममित्र' },
  tagline: {
    en: 'Fill any government form by speaking',
    hi: 'बोलकर कोई भी सरकारी फॉर्म भरें',
  },

  // Consent
  consentTitle: { en: 'Before we begin', hi: 'शुरू करने से पहले' },
  consentBody: {
    en: 'FormMitra fills forms on your phone. Your answers stay on this device and are never sent to us or stored on any server.',
    hi: 'फॉर्ममित्र आपके फोन पर ही फॉर्म भरता है। आपके जवाब इसी फोन में रहते हैं, हमें या किसी सर्वर पर नहीं भेजे जाते।',
  },
  consentPoint1: {
    en: 'Nothing you fill is saved on our servers',
    hi: 'आपकी भरी हुई जानकारी हमारे सर्वर पर नहीं रखी जाती',
  },
  consentPoint2: {
    en: 'We never see your Aadhaar number or OTP',
    hi: 'हम आपका आधार नंबर या ओटीपी कभी नहीं देखते',
  },
  consentPoint3: {
    en: 'You can erase everything with one tap, any time',
    hi: 'आप एक टैप से कभी भी सब कुछ मिटा सकते हैं',
  },
  agree: { en: 'I agree, continue', hi: 'मैं सहमत हूँ, आगे बढ़ें' },
  chooseLanguage: { en: 'Choose your language', hi: 'अपनी भाषा चुनें' },

  // Home
  pickForm: { en: 'Which form do you need?', hi: 'आपको कौन सा फॉर्म चाहिए?' },
  scanAny: { en: 'Scan any form', hi: 'कोई भी फॉर्म स्कैन करें' },
  scanAnyHint: {
    en: 'Take a photo and we will recognise it',
    hi: 'फोटो लीजिए, हम पहचान लेंगे',
  },
  loginDigilocker: { en: 'Login with DigiLocker', hi: 'डिजिलॉकर से लॉगिन करें' },
  loginHint: {
    en: 'Fills your name, date of birth and address automatically',
    hi: 'आपका नाम, जन्म तिथि और पता अपने आप भर देता है',
  },
  loginNeedsInternet: {
    en: 'Login needs internet — everything else works without it.',
    hi: 'लॉगिन के लिए इंटरनेट चाहिए — बाकी सब बिना इंटरनेट चलता है।',
  },
  // What the citizen sees instead of a raw exception message. The technical
  // text goes to the console, where it is useful to us and to nobody else.
  loginCancelled: {
    en: 'The DigiLocker login was not completed. Try again, or fill the form without it.',
    hi: 'डिजिलॉकर लॉगिन पूरा नहीं हुआ। दोबारा कोशिश कीजिए, या बिना लॉगिन के फॉर्म भरिए।',
  },
  loginFailed: {
    en: 'DigiLocker could not sign you in just now. Please try again in a little while.',
    hi: 'डिजिलॉकर अभी लॉगिन नहीं कर पाया। थोड़ी देर बाद फिर कोशिश कीजिए।',
  },
  tryAgain: { en: 'Try again', hi: 'फिर से कोशिश करें' },
  loggedInAs: { en: 'Signed in as', hi: 'साइन इन:' },
  verified: { en: 'DigiLocker verified', hi: 'डिजिलॉकर से सत्यापित' },
  clearAll: { en: 'Erase my data', hi: 'मेरा डेटा मिटाएँ' },
  offlineReady: { en: 'Works offline', hi: 'बिना इंटरनेट चलता है' },

  // Scan
  scanTitle: { en: 'Photograph the form', hi: 'फॉर्म की फोटो लीजिए' },
  scanHint: {
    en: 'Hold the phone steady above the whole page, in good light',
    hi: 'फोन को पूरे पन्ने के ऊपर सीधा पकड़ें, अच्छी रोशनी में',
  },
  takePhoto: { en: 'Open camera', hi: 'कैमरा खोलें' },
  choosePhoto: { en: 'Choose a photo', hi: 'फोटो चुनें' },
  reading: { en: 'Reading the form…', hi: 'फॉर्म पढ़ा जा रहा है…' },
  scanPrivacy: {
    en: 'This is happening on your phone — the photo is not being sent anywhere.',
    hi: 'यह आपके फोन पर ही हो रहा है — फोटो कहीं नहीं भेजी जा रही।',
  },
  recognised: { en: 'This looks like', hi: 'यह लगता है' },
  scanConfidence: {
    en: '{percent}% match · {hits} keywords found',
    hi: '{percent}% मिलान · {hits} संकेत मिले',
  },
  notRecognised: {
    en: 'We could not recognise this form',
    hi: 'हम इस फॉर्म को पहचान नहीं पाए',
  },
  pickManually: {
    en: 'Please choose it from the list instead',
    hi: 'कृपया सूची में से चुन लीजिए',
  },
  yesCorrect: { en: 'Yes, that is right', hi: 'हाँ, यही है' },
  noPickAnother: { en: 'No, choose another', hi: 'नहीं, दूसरा चुनें' },

  // Form overview
  tapToUnderstand: {
    en: 'Tap any field to hear what it means',
    hi: 'किसी भी जगह पर टैप करके सुनिए कि उसका क्या मतलब है',
  },
  fieldsTotal: { en: 'fields in this form', hi: 'जगह इस फॉर्म में' },
  autoFilled: { en: 'already filled from DigiLocker', hi: 'डिजिलॉकर से पहले ही भरे' },
  weWillAsk: { en: 'we will ask you', hi: 'हम आपसे पूछेंगे' },
  prefilledNotice: {
    en: '{count} fields are already filled from DigiLocker — you will not be asked those.',
    hi: 'डिजिलॉकर से {count} जगह पहले ही भर दी गई हैं — वे आपसे नहीं पूछी जाएँगी।',
  },
  startFilling: { en: 'Start filling', hi: 'भरना शुरू करें' },
  listen: { en: 'Listen', hi: 'सुनिए' },

  // Guided fill
  question: { en: 'Question', hi: 'सवाल' },
  of: { en: 'of', hi: 'में से' },
  tapToSpeak: { en: 'Tap and speak', hi: 'टैप करके बोलिए' },
  listening: { en: 'Listening…', hi: 'सुन रहे हैं…' },
  typeInstead: { en: 'Or type it', hi: 'या टाइप कीजिए' },
  repeatQuestion: { en: 'Say it again', hi: 'फिर से बोलिए' },
  whatIsThis: { en: 'What is this?', hi: 'यह क्या है?' },
  next: { en: 'Next', hi: 'आगे' },
  back: { en: 'Back', hi: 'पीछे' },
  skip: { en: 'I do not have this', hi: 'यह मेरे पास नहीं है' },
  optional: { en: 'You may leave this empty', hi: 'इसे खाली छोड़ सकते हैं' },
  example: { en: 'Example', hi: 'उदाहरण' },
  micBlocked: {
    en: 'Microphone is not available. Please type your answer.',
    hi: 'माइक्रोफोन उपलब्ध नहीं है। कृपया अपना जवाब टाइप कीजिए।',
  },
  didNotHear: {
    en: 'We did not hear anything. Please try again or type it.',
    hi: 'हमें कुछ सुनाई नहीं दिया। फिर कोशिश कीजिए या टाइप कीजिए।',
  },
  chooseFromOptions: {
    en: 'Please pick or say one of the given options.',
    hi: 'कृपया दिए गए विकल्पों में से एक चुनें या बोलिए।',
  },

  // Confirm
  confirmTitle: { en: 'Please check your answers', hi: 'कृपया अपने जवाब जाँच लें' },
  confirmHint: {
    en: 'We will read each one aloud. Tap any answer to change it.',
    hi: 'हम हर जवाब पढ़कर सुनाएँगे। बदलने के लिए किसी भी जवाब पर टैप कीजिए।',
  },
  readAloud: { en: 'Read everything aloud', hi: 'सब कुछ पढ़कर सुनाएँ' },
  stopReading: { en: 'Stop', hi: 'रोकें' },
  isThisCorrect: { en: 'is this correct?', hi: 'सही है?' },
  change: { en: 'Change', hi: 'बदलें' },
  allCorrect: { en: 'Everything is correct', hi: 'सब सही है' },

  // Checklist
  checklistTitle: { en: 'Documents to carry', hi: 'साथ ले जाने वाले दस्तावेज़' },
  checklistHint: {
    en: 'Take these with you when you submit the form',
    hi: 'फॉर्म जमा करते समय ये साथ ले जाइए',
  },
  docsAlreadyHave: {
    en: '{count} of these are already in your DigiLocker',
    hi: '{count} दस्तावेज़ आपके डिजिलॉकर में पहले से मौजूद हैं',
  },
  docsNoNeedToArrange: {
    en: 'You do not need to arrange these — you can show them from the DigiLocker app.',
    hi: 'इन्हें कहीं से बनवाने की ज़रूरत नहीं — डिजिलॉकर ऐप से दिखा सकते हैं।',
  },
  youHaveThis: { en: 'You already have this in DigiLocker', hi: 'यह आपके डिजिलॉकर में पहले से है' },
  needToArrange: { en: 'You need to arrange this', hi: 'यह आपको जुटाना होगा' },

  // Done
  downloadPdf: { en: 'Download filled form', hi: 'भरा हुआ फॉर्म डाउनलोड करें' },
  creatingPdf: { en: 'Creating your form…', hi: 'आपका फॉर्म बन रहा है…' },
  doneTitle: { en: 'Your form is ready', hi: 'आपका फॉर्म तैयार है' },
  doneBody: {
    en: 'The file has been saved to this phone. Print it, sign it, and submit it with the documents listed.',
    hi: 'फाइल इसी फोन में सहेज ली गई है। इसे छापिए, हस्ताक्षर कीजिए, और बताए गए दस्तावेज़ों के साथ जमा कीजिए।',
  },
  fillAnother: { en: 'Fill another form', hi: 'दूसरा फॉर्म भरें' },
  startOver: { en: 'Start again', hi: 'फिर से शुरू करें' },
  notSubmitted: {
    en: 'This is a filled printable form, not an online submission. You still need to submit it at the office.',
    hi: 'यह भरा हुआ छापने योग्य फॉर्म है, ऑनलाइन जमा नहीं हुआ है। आपको इसे कार्यालय में जमा करना होगा।',
  },

  // The official government form, filled in its own boxes
  officialFormTitle: {
    en: 'The real government form, filled',
    hi: 'असली सरकारी फॉर्म, भरा हुआ',
  },
  officialFormBody: {
    en: 'This is the department’s own form with your answers written into its boxes. Print this one and hand it in.',
    hi: 'यह विभाग का अपना फॉर्म है, जिसके खानों में आपके जवाब लिखे गए हैं। इसी को छापकर जमा कीजिए।',
  },
  summarySheetLabel: {
    en: 'Your answers in easy language',
    hi: 'आपके जवाब आसान भाषा में',
  },
  summarySheetBody: {
    en: 'Keep this for yourself. It is not the form to submit.',
    hi: 'यह अपने पास रखिए। यह जमा करने वाला फॉर्म नहीं है।',
  },
  downloadOfficial: {
    en: 'Download the government form',
    hi: 'सरकारी फॉर्म डाउनलोड करें',
  },
  // Distinct from downloadPdf: once both documents exist, "Download filled
  // form" no longer says which of the two it means.
  downloadSummary: {
    en: 'Download your answers sheet',
    hi: 'अपने जवाबों की शीट डाउनलोड करें',
  },
  checkTheseTitle: {
    en: 'Please check these before you submit',
    hi: 'जमा करने से पहले ये ज़रूर देख लें',
  },
  stillToFillTitle: {
    en: 'You must still fill these by hand',
    hi: 'ये आपको हाथ से भरने होंगे',
  },
  tooLongTitle: {
    en: 'Too long for the form’s boxes — shorten by hand',
    hi: 'फॉर्म के खानों के लिए बहुत लंबा — हाथ से छोटा कीजिए',
  },
}

export function t(key, lang = 'hi', values = null) {
  const entry = STRINGS[key]
  if (!entry) return key
  const text = entry[lang] ?? entry.en
  if (!values) return text
  // An unsupplied placeholder is left standing rather than printed as
  // "undefined" — visibly wrong in review, still readable to a citizen.
  return text.replace(/\{(\w+)\}/g, (placeholder, name) =>
    name in values ? String(values[name]) : placeholder,
  )
}
