// Bilingual UI strings. Bangla is the parent default (FR-033); exact copy comes
// from D3/D4 where it exists. Bangla strings use Bangla numerals.
const bn = {
  appName: "ফেরা",
  demoBanner: "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", // D4 §15.1 demo banner
  metaDescription: "নিখোঁজ ও খুঁজে পাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক তথ্যভিত্তিক প্রোটোটাইপ",
  demoBannerRegion: "ডেমো নোটিশ",
  languageToggleLabel: "ভাষা",
  skipToContent: "মূল অংশে যান",
  homeLink: "ফেরা — শুরুর পাতা",
  plannedLabel: "পরিকল্পিত",
  homePlaceholder: "অভিভাবক, স্টাফ ও কর্মকর্তার স্ক্রিন পরের কাজগুলোতে যুক্ত হবে।",
  // SCREEN-008 sign-in (COMP-047). D3 strings: signInAction, signInErrorCredentials.
  signInTitle: "সাইন ইন",
  signInTitleStaff: "স্টাফ সাইন ইন",
  signInTitleOfficer: "কর্মকর্তা সাইন ইন", // D4 §14
  signInTitleAdmin: "অ্যাডমিন সাইন ইন",
  signInIntro: "স্টাফ, কর্মকর্তা ও অ্যাডমিনের জন্য। অভিভাবকদের অ্যাকাউন্ট লাগে না।",
  signInReturnNote: "সাইন ইন করার পর, আপনার অনুমতি থাকলে আপনি সেই পাতায় ফিরে যাবেন।",
  usernameLabel: "ইউজারনেম",
  passwordLabel: "পাসওয়ার্ড",
  usernameRequired: "ইউজারনেম লিখুন।",
  passwordRequired: "পাসওয়ার্ড লিখুন।",
  showPasswordButton: "দেখান",
  hidePasswordButton: "লুকান",
  showPasswordLabel: "পাসওয়ার্ড দেখান",
  hidePasswordLabel: "পাসওয়ার্ড লুকান",
  signInAction: "সাইন ইন", // D3 ACT-018
  signingIn: "সাইন ইন হচ্ছে…",
  signedInRedirecting: "সাইন ইন হয়েছে। পাতা খুলছে…",
  signInErrorCredentials: "ইউজারনেম বা পাসওয়ার্ড ঠিক নয়", // D3 SCREEN-008 (E-002)
  signInErrorRateLimited: "{s} সেকেন্ড পরে আবার চেষ্টা করুন।", // D2B §13 E-007
  signInErrorRateLimitedSoon: "একটু পরে আবার চেষ্টা করুন।",
  signInErrorGeneric: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।", // D2B §13 E-021
  demoAccountsTitle: "ডেমো অ্যাকাউন্ট",
  mockLabel: "[MOCK]", // honest label, same in both languages
  demoAccountsNote: "সিনথেটিক অ্যাকাউন্ট। নামে চাপ দিলে ইউজারনেম বসে যাবে। পাসওয়ার্ড এখানে দেখানো হয় না।",
  demoAccountFill: "ইউজারনেম বসান:",
  demoFilled: "ইউজারনেম বসানো হয়েছে: {u}",
  demoRoleStaff: "স্টাফ",
  demoRoleOfficer: "যাচাইকৃত কর্মকর্তা",
  demoRoleOfficerUnverified: "অযাচাইকৃত কর্মকর্তা · স্টাফের সমান অনুমতি",
  demoRoleAdmin: "অ্যাডমিন",
  // ACT-029 sign-out (D4 §5 officer nav).
  signOutAction: "সাইন আউট",
  signingOut: "সাইন আউট হচ্ছে…",
  // SCREEN-016 not found / not allowed (COMP-045). notFoundTitle is the D3 copy.
  notFoundTitle: "তথ্যটি পাওয়া যায়নি।",
  notFoundHome: "শুরুর পাতায় ফিরুন",
  // SCREEN-001 welcome and SCREEN-002 intake (TASK-021). Sources noted per line;
  // Lines without a D3/D4 source are new copy, pending human Bangla review (OD-021-3).
  welcomeLead: "ফেরা আপনার কথা থেকে নিখোঁজ শিশুর রিপোর্ট তৈরি করে।", // D3 SCREEN-001
  welcomeNoAlerts: "ফেরা পুলিশ বা সিআইডি-কে সতর্কবার্তা পাঠায় না। জরুরি হলে ১৩২১৯-এ কল করুন।", // D4 §10
  noticeTitle: "শুরু করার আগে জেনে নিন", // new
  providerNotice: "কথা বা লেখা বোঝার জন্য বাইরের এআই সেবা ব্যবহার হতে পারে। এই সংস্করণে বাস্তব শিশুর তথ্য দেবেন না।", // D4 §15.1
  noticeReviewFirst: "আপনি দেখে নিশ্চিত না করা পর্যন্ত প্রতিবেদন জমা হবে না।", // new
  noticeWhoSees: "জমা দেওয়ার পর সম্ভাব্য মিল শুধু যাচাইকৃত কর্মকর্তারা দেখেন।", // new
  startAction: "শুরু করুন", // D3 ACT-001
  callHelpline: "১৩২১৯-এ কল করুন", // D3 SCREEN-001
  noticeAckAction: "বুঝেছি, চালিয়ে যান", // new
  syntheticBadge: "সিনথেটিক", // D3 COMP-023
  mockReplies: "নমুনা উত্তর, আসল এআই নয়", // new
  cachedBadge: "ক্যাশ · পূর্বপ্রস্তুত সিনথেটিক উদাহরণ", // D4 §15.1
  intakeTitle: "আপনার শিশুর কথা বলুন", // D4 §10
  intakeEmptyPrompt: "আপনার শিশুর কথা বলুন বা লিখুন", // D3 SCREEN-002 empty
  intakeExample: "যেমন: আমার মেয়ে মীম, বয়স ১১, আজ সকালে স্কুলে যাওয়ার পথে…", // D3 §4
  conversationLabel: "কথোপকথন", // new
  speakerParent: "আপনি", // new
  messageSending: "পাঠানো হচ্ছে", // needs human Bangla review
  messageFailed: "পাঠানো যায়নি", // new
  recordAction: "রেকর্ড করুন", // new
  stopAction: "থামান", // new
  recordHint: "একবার চাপ দিলে রেকর্ড শুরু হবে, আবার চাপ দিলে থামবে। সর্বোচ্চ ২ মিনিট।", // new
  recordingTime: "রেকর্ডিংয়ের সময়", // new
  micRequesting: "মাইক্রোফোনের অনুমতি চাওয়া হচ্ছে…", // new
  listening: "শুনছি…", // D3 SCREEN-002
  sending: "পাঠাচ্ছি…", // D4 §9
  understanding: "বুঝে নিচ্ছি…", // D3 SCREEN-002
  stillWorking: "এখনও কাজ চলছে, একটু অপেক্ষা করুন", // D3 SCREEN-002, D4 §12
  useFormLink: "ফর্মে লিখুন", // D4 §12
  textLabel: "অথবা এখানে লিখুন", // new
  typeHere: "এখানে লিখুন", // needs human Bangla review
  questionChildObject: "শিশুটিকে", // needs human Bangla review
  questionChildPossessive: "শিশুটির", // needs human Bangla review
  questionChild: "শিশু", // needs human Bangla review
  transcriptLabel: "যা শুনেছি — ভুল থাকলে ঠিক করে দিন", // new
  answerLabel: "আপনার উত্তর", // new
  sendAction: "পাঠান", // new (ACT-005)
  transcriptSend: "ঠিক আছে, পাঠান", // D4 §9
  textTooShort: "আরও একটু বিস্তারিত লিখুন", // D4 §11
  answerRequired: "উত্তর লিখুন", // new
  sexMale: "ছেলে", // D3 COMP-009
  sexFemale: "মেয়ে",
  sexOther: "অন্য কিছু",
  sexUnknown: "জানি না",
  understoodTitle: "এ পর্যন্ত যা বুঝেছি", // new (D4 §14 "যা বুঝেছি")
  unknownValue: "অজানা", // D3 SCREEN-003
  fieldName: "নাম",
  fieldAge: "বয়স",
  fieldSex: "ছেলে না মেয়ে",
  fieldClothing: "পোশাক",
  fieldMarks: "চেনার চিহ্ন",
  fieldLastSeenAt: "শেষবার কখন দেখা গিয়েছিল",
  fieldPlace: "কোথায় দেখা গিয়েছিল",
  fieldDistrict: "জেলা",
  fieldPhone: "আপনার মোবাইল নম্বর",
  ageYears: "{n} বছর",
  ageRange: "{min}–{max} বছর",
  approxTime: "আনুমানিক {t}",
  readyTitle: "খসড়া তৈরি। এবার প্রতিটি তথ্য যাচাই করুন।", // new
  beforeSubmit: "জমা দেওয়ার আগে তথ্য যাচাই করুন। ফেরা পুলিশে জিডি জমা দেয় না।", // D4 §15.1
  reviewAction: "তথ্য যাচাই করুন", // new
  manualTitle: "বাকি তথ্য ফর্মে দিন। আপনার লেখা রাখা আছে।", // new (D3 §7 row 15)
  stillUnknown: "যা এখনও জানা নেই:", // new
  openFormAction: "ফর্ম খুলুন", // new (ACT-014)
  discardAction: "খসড়া মুছুন", // new (ACT-015)
  discardConfirm: "খসড়া মুছে ফেলবেন?", // D3 §7 row 11
  retryAction: "আবার চেষ্টা করুন", // new (ACT-031)
  // Review round 1 (TASK-021): all new, Bangla review pending (OD-021-3).
  recordingStopped: "রেকর্ড থেমেছে।",
  questionAge: "{নাম}-এর বয়স কত?", // D3 COMP-009; needs human Bangla review
  questionDistrict: "{নাম}-কে শেষবার কোন জেলায় দেখা গিয়েছিল?", // D3 COMP-009; needs human Bangla review
  questionAt: "শেষবার কবে, কখন দেখা গিয়েছিল?",
  questionPhone: "আপনার মোবাইল নম্বর দিন, যাতে খবর পেলে যোগাযোগ করা যায়।", // D3 COMP-009
  questionPlace: "{নাম}-কে শেষবার কোথায় দেখা গিয়েছিল?", // new template; needs human Bangla review
  textLimitReached: "সর্বোচ্চ ২,০০০ অক্ষর লেখা যায়।",
  discardYes: "মুছুন",
  discardNo: "রাখুন",
  fieldHeight: "উচ্চতা",
  fieldNameLatin: "নাম (ইংরেজি অক্ষরে)",
  fieldThana: "থানা",
  fieldCircumstances: "কী ঘটেছিল (আপনার কথায়)",
  fieldRelation: "শিশুর সাথে আপনার সম্পর্ক",
  heightCm: "{n} সেমি",
  timeWindow: "{from} থেকে {to}-এর মধ্যে (আনুমানিক)",
  startAgainAction: "নতুন করে শুরু করুন", // new
  timeAfter: "{t}-এর পরে (আনুমানিক)", // new, round 2: needs human Bangla review
  timeBefore: "{t}-এর আগে (আনুমানিক)", // new, round 2: needs human Bangla review
  recordingNotSent: "রেকর্ডিংটি পাঠানো যায়নি। আবার রেকর্ড করুন।", // new, round 2: needs human Bangla review
  finishRecordingFirst: "আগে রেকর্ডিং থামান, তারপর পাঠান।", // new, round 2: needs human Bangla review
} as const;

export type MessageKey = keyof typeof bn;

const en = {
  appName: "Fera",
  demoBanner: "Synthetic data · officer verification simulated", // D4 §15.1 demo banner
  metaDescription: "Synthetic-data prototype for missing and found child case coordination",
  demoBannerRegion: "Demo notice",
  languageToggleLabel: "Language",
  skipToContent: "Skip to main content",
  homeLink: "Fera — home",
  plannedLabel: "Planned",
  homePlaceholder: "Parent, staff and officer screens arrive in later tasks.",
  signInTitle: "Sign in",
  signInTitleStaff: "Staff sign-in",
  signInTitleOfficer: "Officer sign-in", // D4 §14
  signInTitleAdmin: "Admin sign-in",
  signInIntro: "For staff, officers and admins. Parents don't need an account.",
  signInReturnNote: "After signing in, you'll go back to that page if your role can open it.",
  usernameLabel: "Username",
  passwordLabel: "Password",
  usernameRequired: "Enter your username.",
  passwordRequired: "Enter your password.",
  showPasswordButton: "Show",
  hidePasswordButton: "Hide",
  showPasswordLabel: "Show password",
  hidePasswordLabel: "Hide password",
  signInAction: "Sign in", // D3 ACT-018
  signingIn: "Signing in…",
  signedInRedirecting: "Signed in. Opening your page…",
  signInErrorCredentials: "Username or password is incorrect", // D3 SCREEN-008 (E-002)
  signInErrorRateLimited: "Please try again in {s} seconds.", // D2B §13 E-007
  signInErrorRateLimitedSoon: "Please try again in a little while.",
  signInErrorGeneric: "Something went wrong. Please try again.", // D2B §13 E-021
  demoAccountsTitle: "Demo accounts",
  mockLabel: "[MOCK]",
  demoAccountsNote: "Synthetic accounts. Tap a name to fill the username. Passwords are not shown here.",
  demoAccountFill: "Fill username:",
  demoFilled: "Username set to {u}",
  demoRoleStaff: "Staff",
  demoRoleOfficer: "Verified officer",
  demoRoleOfficerUnverified: "Unverified officer · staff permissions",
  demoRoleAdmin: "Admin",
  signOutAction: "Sign out",
  signingOut: "Signing out…",
  notFoundTitle: "We couldn't find that.",
  notFoundHome: "Back to home",
  welcomeLead: "Fera turns what you say into a missing-child report.",
  welcomeNoAlerts: "Fera does not alert police or CID. In an emergency, call 13219.",
  noticeTitle: "Before you start",
  providerNotice: "External AI may process audio/text. Do not enter real child information in this version.",
  noticeReviewFirst: "The report is not submitted until you check and confirm it.",
  noticeWhoSees: "After you submit, only verified officers see possible matches.",
  startAction: "Start",
  callHelpline: "Call 13219",
  noticeAckAction: "I understand, continue",
  syntheticBadge: "Synthetic",
  mockReplies: "Sample replies, not real AI",
  cachedBadge: "Cached · prepared synthetic example",
  intakeTitle: "Tell us about your child",
  intakeEmptyPrompt: "Tell us about your child, by voice or text.",
  intakeExample: "For example: My daughter Mim, 11, this morning on the way to school…",
  conversationLabel: "Conversation",
  speakerParent: "You",
  messageSending: "Sending",
  messageFailed: "Not sent",
  recordAction: "Record",
  stopAction: "Stop",
  recordHint: "Press once to start recording, press again to stop. Up to 2 minutes.",
  recordingTime: "Recording time",
  micRequesting: "Asking for microphone permission…",
  listening: "Listening…",
  sending: "Sending…",
  understanding: "Understanding…",
  stillWorking: "Still working, please wait",
  useFormLink: "Use the form",
  textLabel: "Or type it here",
  typeHere: "Type it here",
  questionChildObject: "the child",
  questionChildPossessive: "the child",
  questionChild: "the child",
  transcriptLabel: "What we heard — fix anything wrong",
  answerLabel: "Your answer",
  sendAction: "Send",
  transcriptSend: "OK, send",
  textTooShort: "Please add a little more detail",
  answerRequired: "Type your answer",
  sexMale: "Boy",
  sexFemale: "Girl",
  sexOther: "Other",
  sexUnknown: "Don't know",
  understoodTitle: "What we understood so far",
  unknownValue: "Unknown",
  fieldName: "Name",
  fieldAge: "Age",
  fieldSex: "Boy or girl",
  fieldClothing: "Clothing",
  fieldMarks: "Identifying marks",
  fieldLastSeenAt: "When last seen",
  fieldPlace: "Where last seen",
  fieldDistrict: "District",
  fieldPhone: "Your mobile number",
  ageYears: "{n} years",
  ageRange: "{min}–{max} years",
  approxTime: "About {t}",
  readyTitle: "Draft ready. Now check each detail.",
  beforeSubmit: "Review before submission. Fera does not file a police GD.",
  reviewAction: "Check details",
  manualTitle: "Add the rest in the form. Your text is kept.",
  stillUnknown: "Still unknown:",
  openFormAction: "Open the form",
  discardAction: "Delete draft",
  discardConfirm: "Delete this draft?",
  retryAction: "Try again",
  recordingStopped: "Recording stopped.",
  questionAge: "How old is {name}?",
  questionDistrict: "In which district was {name} last seen?",
  questionAt: "When was {name} last seen?",
  questionPhone: "Your mobile number, so you can be contacted.",
  questionPlace: "Where was {name} last seen?",
  textLimitReached: "You can write up to 2,000 characters.",
  discardYes: "Delete",
  discardNo: "Keep",
  fieldHeight: "Height",
  fieldNameLatin: "Name (Latin letters)",
  fieldThana: "Thana (police station area)",
  fieldCircumstances: "What happened (your words)",
  fieldRelation: "Your relation to the child",
  heightCm: "{n} cm",
  timeWindow: "Between {from} and {to} (approximate)",
  startAgainAction: "Start again",
  timeAfter: "After {t} (approximate)",
  timeBefore: "Before {t} (approximate)",
  recordingNotSent: "The recording was not sent. Please record again.",
  finishRecordingFirst: "Stop the recording first, then send.",
} as const satisfies Record<MessageKey, string>;

export const locales = { bn, en } as const;

export type Locale = keyof typeof locales;

// COMP-022 toggle options: each language is named in its own script in both modes
// (D3 §1: "বাংলা | English").
export const languageNames = { bn: "বাংলা", en: "English" } as const satisfies Record<Locale, string>;
