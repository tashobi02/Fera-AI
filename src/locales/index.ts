// Bilingual UI strings. Bangla is the parent default (FR-033); exact copy comes
// from D3/D4 where it exists. Bangla strings use Bangla numerals.
//
// Per PHASE_3_PLAN.md §5, after P3-001 new strings live in per-area files
// (src/locales/areas/*.ts) so waves can edit them without touching this root.
// Area files export empty objects today; the spread keeps the keyspace stable
// while allowing waves to add entries in their own area file.
import { parentIntakeBn, parentIntakeEn } from "./areas/parent-intake";
import { parentFormBn, parentFormEn } from "./areas/parent-form";
import { parentStatusBn, parentStatusEn } from "./areas/parent-status";
import { staffDisasterBn, staffDisasterEn } from "./areas/staff-disaster";
import { officerQueueBn, officerQueueEn } from "./areas/officer-queue";
import { officerCaseBn, officerCaseEn } from "./areas/officer-case";
import { officerMapBn, officerMapEn } from "./areas/officer-map";
import { officerMatchBn, officerMatchEn } from "./areas/officer-match";
import { officerDuplicatesBn, officerDuplicatesEn } from "./areas/officer-duplicates";
import { adminImportBn, adminImportEn } from "./areas/admin-import";

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
  // SCREEN-003 TASK-022: new strings need human Bangla review (OD-022-13).
  reviewAgeHint: "বয়স জানা থাকলে সঠিক বয়স দিন, অথবা আনুমানিক বয়সের দুই সীমা দিন।", // needs human Bangla review
  reviewRequired: "প্রয়োজনীয়", // needs human Bangla review
  reviewRequiredSummary: "জমা দেওয়ার আগে নিচের তথ্যগুলো পূরণ বা ঠিক করুন।", // needs human Bangla review
  reviewStorageUnreadable: "এই ডিভাইসের সংরক্ষিত খসড়া পড়া যাচ্ছে না। ব্রাউজারের সংরক্ষণের অনুমতি দেখে আবার খুলুন।", // needs human Bangla review
  reviewTitle: "তথ্যগুলো যাচাই করুন",
  reviewIntro: "প্রতিটি তথ্য দেখে ভুল থাকলে ঠিক করুন। না জানলে অজানা রাখুন।",
  reviewEmpty: "এই ডিভাইসে যাচাই করার মতো খসড়া নেই।",
  reviewBack: "আপনার কথায় ফিরুন",
  reviewChecked: "আমি যাচাই করেছি", // D3 SCREEN-003
  reviewSubmit: "যাচাই করে জমা দিন", // D3 ACT-008
  reviewSubmitting: "জমা হচ্ছে…", // D3 SCREEN-003
  reviewSubmitted: "রিপোর্ট জমা হয়েছে। রেফারেন্স: {ref}",
  reviewSource: "আপনার পুরো লেখা",
  reviewExtraSource: "আপনার আরও লেখা — এগুলো নিজে দেখে তথ্যের ঘরে যোগ করুন",
  reviewEdited: "আপনি সংশোধন করেছেন",
  reviewNoSpan: "এই তথ্যের উৎসের অংশ চিহ্নিত নেই। আপনার লেখার সঙ্গে মিলিয়ে দেখুন।",
  reviewLocal: "খসড়া এই ডিভাইসে রাখা হয়। একই ডিভাইসের অন্য কেউ এটি দেখতে পারেন। কাজ শেষে এই ডিভাইস থেকে মুছে দিন।",
  reviewStorageFailed: "এই ডিভাইসে খসড়া রাখা যায়নি। পাতা বন্ধ করলে তথ্য হারিয়ে যেতে পারে।",
  reviewClearFailed: "ডিভাইসের সংরক্ষিত কপি মোছা যায়নি। এই ব্রাউজারের সাইটের তথ্য নিজে মুছে দিন।",
  reviewDiscardDevice: "এই ডিভাইস থেকে খসড়া মুছুন",
  reviewErrorSummary: "চিহ্নিত তথ্যগুলো ঠিক করে আবার যাচাই করুন।",
  reviewFieldInvalid: "এই তথ্যটি দিন বা ঠিক করুন। না জানলে আন্দাজ করবেন না।",
  reviewAgeInvalid: "বয়স ০ থেকে ১৭-এর মধ্যে দিন", // D4 §11
  reviewPhoneInvalid: "০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন", // D4 §11
  reviewTimeInvalid: "সঠিক সময় ও সীমা দিন। ভবিষ্যতের সময় দেওয়া যাবে না।",
  reviewTimeHint: "তারিখ: বছর-মাস-দিন। সময়: ঘণ্টা:মিনিট (২৪ ঘণ্টা)। সঠিক সময় হলে দুই সীমাতেও একই সময় দিন।", // needs human Bangla review
  reviewDistrictCode: "জেলা",
  reviewDistrictHint: "শেষবার যেখানে দেখা গিয়েছিল সেই জেলা নিশ্চিত করে বাছাই করুন। না জানলে আন্দাজ করবেন না; জেলা ছাড়া এই ফর্ম জমা দেওয়া যাবে না।",
  reviewAgeMin: "বয়সের নিচের সীমা (বছর)",
  reviewAgeMax: "বয়সের উপরের সীমা (বছর)",
  reviewTimeLower: "শেষবার দেখার সময়ের নিচের সীমা",
  reviewTimeUpper: "শেষবার দেখার সময়ের উপরের সীমা",
  reviewApprox: "শেষবার দেখার সময় আনুমানিক",
  reviewConflict: "এই জমার নম্বরে ভিন্ন তথ্য আগে জমা হয়েছে। আবার দেখে নতুন নম্বরে জমা দিতে পারেন। এতে আলাদা রিপোর্ট হতে পারে।",
  reviewNewId: "আবার দেখে নতুন নম্বরে জমা দিন",
  reviewSession: "সেশনের সময় শেষ হয়েছে। খসড়া এই ডিভাইসে আছে। আপনার কথার পাতায় ফিরে সেশন শুরু করুন।",
  reviewSessionExpired: "আপনার খসড়ার সময় শেষ। নতুন করে শুরু করুন।", // D3:333 / catalogue E-019, needs human Bangla review
  reviewRetryFrozen: "ফল জানা যায়নি। একই তথ্য ও জমার নম্বর রেখে আবার চেষ্টা করুন।",
  reviewPlannedManual: "নিজে পূরণ করার ফর্ম", // planned label wraps it; needs human Bangla review
  reviewExpired: "আপনার খসড়ার সময় শেষ। নতুন করে শুরু করুন।", // D3:333 / catalogue E-019, needs human Bangla review
  reviewUnknownAdd: "অজানা — যোগ করুন", // needs human Bangla review
  reviewDiscardWarn: "এই খসড়া জমা দেওয়ার চেষ্টা হয়েছে। সার্ভারে ইতিমধ্যে পৌঁছে থাকতে পারে — মুছলে আর ডিভাইসে খুঁজে পাবেন না।", // needs human Bangla review
  reviewMockSubmit: "[MOCK] পূর্বপ্রস্তুত: জমা দেওয়া সক্রিয় নয়, আসল API যুক্ত হলে কাজ করবে", // needs human Bangla review
  reviewMockSubmitButton: "[MOCK] জমা দিন (অকার্যকর)", // needs human Bangla review
  reviewSourceExcerpt: "উৎসের অংশ", // needs human Bangla review
  reviewSourceLink: "পুরো লেখায় দেখুন", // needs human Bangla review
  reviewAgeMode: "বয়স কীভাবে জানাবেন?", // needs human Bangla review
  reviewAgeEstimate: "আনুমানিক বয়সের সীমা", // needs human Bangla review
  reviewAgeExactHint: "সঠিক বয়স জানা থাকলে বছরে লিখুন।", // needs human Bangla review
  reviewAgeRangeHint: "আনুমানিক বয়সের নিচের ও উপরের সীমা বছরে লিখুন।", // needs human Bangla review
  reviewClockLabel: "সময় (২৪ ঘণ্টা)", // needs human Bangla review
  reviewDateNotApplied: "এই তারিখ এখনো প্রয়োগ হয়নি। সময়ের অংশ বাছুন, অথবা নিচে প্রতিটি সময়ের তারিখ বদলান।", // needs human Bangla review
  reviewFutureClamped: "ভবিষ্যতের অংশ বাদ দিয়ে উপরের সীমা বর্তমান সময় পর্যন্ত রাখা হয়েছে। তারিখ ও সময় যাচাই করুন।", // needs human Bangla review
  reviewDateHint: "তারিখ লিখুন: ২০২৫-১২-৩১। একটি সময়ের অংশ বাছলে সীমা পূরণ হবে; পরে বদলাতে পারবেন।", // needs human Bangla review
  reviewDateInvalid: "সঠিক তারিখ লিখুন: বছর-মাস-দিন।", // needs human Bangla review
  reviewTimeBoundHint: "তারিখ: বছর-মাস-দিন। সময়: ঘণ্টা:মিনিট (২৪ ঘণ্টা)। সঠিক সময় হলে তিনটি সময় একই রাখুন।", // needs human Bangla review
  ageExact: "সঠিক বয়স", // needs human Bangla review
  timeExact: "সঠিক সময়", // needs human Bangla review
  // Part-of-day time chips (D4 §11)
  timePartMorning: "সকাল", // needs human Bangla review
  timePartMidday: "দুপুর", // needs human Bangla review
  timePartAfternoon: "বিকেল", // needs human Bangla review
  timePartEvening: "সন্ধ্যা", // needs human Bangla review
  timePartNight: "রাত", // needs human Bangla review
  timeDateLabel: "শেষবার দেখার তারিখ", // needs human Bangla review
  timeDateShort: "তারিখ", // needs human Bangla review
  timeDateHint: "সঠিক তারিখ জানা না থাকলে খালি রাখুন।", // needs human Bangla review
  timePartLabel: "দিনের কোন সময়", // needs human Bangla review
  earlierDraftFound: "আগের খসড়া পাওয়া গেছে — চালিয়ে যাবেন?", // D3:309; needs human Bangla review
  earlierDraftContinue: "আগের খসড়া চালিয়ে যান", // needs human Bangla review
  earlierDraftReplace: "নতুন তথ্য দিয়ে শুরু করুন", // needs human Bangla review
  reviewCorruptAttempted: "পূর্বের জমার চেষ্টা পড়া যায়নি, তবে জমার নম্বর রাখা হয়েছে।", // needs human Bangla review
  // SCREEN-013 admin data tools (TASK-032, COMP-043). D3 strings: redactAction (ACT-027),
  // redactEmpty, redactSuccess. "[MOCK]" stays in every verification label (BR-024).
  adminTitle: "অ্যাডমিন ডেটা টুল",
  adminIntro: "এখানে শিশু বা সম্ভাব্য মিলের কোনো তথ্য দেখানো হয় না। সব অ্যাকাউন্ট ও রিপোর্ট সিনথেটিক।",
  syntheticLabel: "সিনথেটিক",
  redactTitle: "পরিচয় তথ্য অপসারণ",
  redactEligible: "উপযুক্ত বন্ধ বা রেফারেল হওয়া রিপোর্ট",
  redactKeeps: "যা থেকে যায়: রেফারেন্স ও আইডি, তারিখ, জেলা, অবস্থা ও বয়সের মোটামুটি পরিসর। এটি ছদ্মনামকরণ, পূর্ণ বেনামীকরণ নয়।",
  redactExternal: "ফেরার বাইরের কপি (ব্যাকআপ, ডাউনলোড করা বা সেবাদাতার কাছে থাকা কপি) এই কাজে মুছে ফেলা হয় না।",
  redactEvidenceRule: "নিশ্চিত মিলের ক্ষেত্রে, খুঁজে পাওয়া শিশুর রিপোর্ট তার নিখোঁজ রিপোর্ট বন্ধ না হওয়া পর্যন্ত রাখা হয়।",
  redactConfirmLabel: "নিশ্চিত করতে লিখুন: {word}",
  redactConfirmHint: "এই কাজ আর ফেরানো যায় না। শব্দটি পেস্টও করতে পারেন।",
  redactConfirmMismatch: "ঠিক এভাবে লিখুন: {word}",
  redactAction: "বন্ধ কেস বেনামী করুন", // D3 ACT-027
  redacting: "পরিচয় তথ্য অপসারণ চলছে…",
  redactEmpty: "পরিচয় তথ্য অপসারণের জন্য উপযুক্ত রিপোর্ট নেই", // D3 SCREEN-013 empty
  redactSuccess: "{n}টি রিপোর্টের পরিচয় তথ্য অপসারণ করা হয়েছে", // D3 SCREEN-013 success
  redactSkipped: "{n}টি রিপোর্ট বাদ পড়েছে, কারণ সেগুলো এখন আর উপযুক্ত নয়।",
  redactCountUnavailable: "উপযুক্ত রিপোর্টের সংখ্যা এখন দেখানো যাচ্ছে না। পরে আবার চেষ্টা করুন।",
  verifyTitle: "কর্মকর্তা যাচাই",
  verifyMockNote: "সিমুলেশন: এখানে যাচাই মানে শুধু ডেমো অ্যাকাউন্টে একটি চিহ্ন বসানো। বাস্তবে কারও পরিচয় যাচাই করা হয় না।",
  usersCaption: "ব্যবহারকারীদের তালিকা",
  colRole: "ভূমিকা",
  colStatus: "অবস্থা",
  roleStaff: "স্টাফ",
  roleOfficer: "কর্মকর্তা",
  roleAdmin: "অ্যাডমিন",
  statusVerified: "যাচাইকৃত",
  statusUnverified: "অযাচাইকৃত",
  statusInactive: "নিষ্ক্রিয়",
  statusNotOfficer: "প্রযোজ্য নয়",
  verifyAction: "যাচাই করুন",
  unverifyAction: "যাচাই বাতিল করুন",
  verifySaving: "সংরক্ষণ হচ্ছে…",
  verifyDone: "{name}: যাচাই করা হয়েছে [MOCK]",
  unverifyDone: "{name}: যাচাই বাতিল হয়েছে [MOCK]",
  usersEmpty: "কোনো ব্যবহারকারী নেই",
  usersLoadMore: "আরও দেখুন",
  usersLoading: "লোড হচ্ছে…",
  usersLoaded: "আরও {n}জন ব্যবহারকারী দেখানো হলো",
  usersUnavailable: "ব্যবহারকারীর তালিকা এখন দেখানো যাচ্ছে না। পরে আবার চেষ্টা করুন।",
  importTitle: "সিনথেটিক ইমপোর্ট",
  importPlanned: "এখনো চালু হয়নি। পরে যুক্ত হবে।",
  // SCREEN-004 case submitted and outputs (TASK-024, COMP-030/031/033). D3/D4 strings:
  // statusGroup* (D3 S-006), outputDraftLabel, outputGd/Poster/Helpline (ACT-009–011),
  // outputPreparing, copied, matchingWillCheck/Checked (D4 §10, S-007), matchingFailed and
  // posterShareNotice (D4 §15.1), noFiling (D4 §15.1 "Before submit").
  reportTitle: "রিপোর্ট জমা হয়েছে",
  reportReference: "রেফারেন্স নম্বর",
  statusGroupOpen: "খোলা",
  statusGroupMatched: "যাচাই চলছে",
  statusGroupClosed: "বন্ধ",
  matchingWillCheck: "মিল খোঁজা হবে",
  matchingRunning: "মিল খোঁজা চলছে",
  matchingChecked: "মিল খোঁজা হয়েছে",
  matchingFailed: "প্রতিবেদন জমা হয়েছে। মিল খোঁজা সম্পূর্ণ হয়নি; আবার চেষ্টা করুন।",
  outputsHeading: "আপনার জন্য তৈরি খসড়া",
  outputDraftLabel: "খসড়া — নিজে জমা দিন",
  noFiling: "ফেরা পুলিশে জিডি জমা দেয় না।",
  outputGd: "জিডি খসড়া",
  outputPoster: "পোস্টার",
  outputHelpline: "১৩২১৯ সারাংশ",
  outputGdTitle: "থানায় জমা দেওয়ার জিডির খসড়া",
  outputPosterTitle: "নিখোঁজ শিশুর পোস্টার",
  outputHelplineTitle: "১৩২১৯-এ বলার জন্য সারাংশ",
  outputBanglaNote: "খসড়ার লেখা বাংলায়।",
  outputPreparing: "তৈরি হচ্ছে…",
  outputReady: "লেখা তৈরি হয়েছে",
  copyAction: "কপি করুন",
  copied: "কপি হয়েছে",
  copyManual: "লেখাটি সিলেক্ট করা আছে। এখন নিজে কপি করে নিন।",
  retry: "আবার চেষ্টা করুন",
  outputsLocked: "এই রিপোর্টের খসড়া আর দেখানো যাবে না। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  outputsSessionExpired: "এই ফোনে রিপোর্টটি আর খোলা যাচ্ছে না। রেফারেন্স নম্বরটি রেখে দিন; সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  posterShareNotice: "প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন। ডাউনলোড করা কপি ফেরা মুছতে পারে না।",
  posterContactLegend: "পোস্টারে আপনার ফোন নম্বর থাকবে?",
  posterContactInclude: "হ্যাঁ, নম্বর রাখুন",
  posterContactOmit: "না, নম্বর বাদ দিন",
  posterAckLabel: "আমি বুঝেছি: পোস্টারে শিশুর তথ্য, যেখানে শেষবার দেখা গিয়েছিল তা এবং (রাখলে) আমার ফোন নম্বর থাকবে। ডাউনলোড করা কপি ফেরা মুছতে পারে না।",
  posterNeedChoice: "ফোন নম্বর রাখবেন কি না বেছে নিন।",
  posterNeedAck: "বুঝেছেন জানাতে বাক্সে টিক দিন।",
  posterMake: "ডাউনলোডের জন্য পোস্টার তৈরি করুন",
  posterRendering: "পোস্টার তৈরি হচ্ছে…",
  posterReady: "পোস্টার ডাউনলোডের জন্য তৈরি",
  posterDownload: "পোস্টার ডাউনলোড করুন",
  posterCopyText: "পোস্টারের লেখা কপি করুন",
  posterTextHeading: "পোস্টারের লেখা",
  posterImageLabel: "পোস্টারের নমুনা। এর লেখা ওপরের অংশে দেওয়া আছে।",
  posterFontError: "বাংলা ফন্ট লোড হয়নি, তাই পোস্টার তৈরি হয়নি। লেখাটি কপি করে ব্যবহার করুন।",
  posterFailed: "এখন পোস্টার তৈরি করা গেল না। আবার চেষ্টা করুন বা লেখাটি কপি করে ব্যবহার করুন।",
  posterTooLong: "লেখাটি একটি পোস্টারে ধরছে না। লেখাটি কপি করে ব্যবহার করুন।",
  posterBlocked: "লেখার মধ্যে এখনও একটি ফোন নম্বর আছে, তাই পোস্টার তৈরি হয়নি। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  ...parentIntakeBn,
  ...parentFormBn,
  ...parentStatusBn,
  ...staffDisasterBn,
  ...officerQueueBn,
  ...officerCaseBn,
  ...officerMapBn,
  ...officerMatchBn,
  ...officerDuplicatesBn,
  ...adminImportBn,
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
  reviewAgeHint: "Enter the exact age or both bounds of an estimated age range.",
  reviewRequired: "Required",
  reviewRequiredSummary: "Complete or correct these details before submitting.",
  reviewStorageUnreadable: "Saved drafts on this device cannot be read. Check browser storage permissions and reopen this page.",
  reviewTitle: "Check each detail",
  reviewIntro: "Check and correct each detail. Leave unknown details unknown.",
  reviewEmpty: "There is no draft to review on this device.",
  reviewBack: "Back to your words",
  reviewChecked: "I have checked",
  reviewSubmit: "Check and submit",
  reviewSubmitting: "Submitting…",
  reviewSubmitted: "Report submitted. Reference: {ref}",
  reviewSource: "Your full text",
  reviewExtraSource: "Your additional words — review and add these to the fields yourself",
  reviewEdited: "Edited by you",
  reviewNoSpan: "No source span is marked for this detail. Check it against your words.",
  reviewLocal: "This draft is kept on this device. Someone else using it may see it. Delete it from this device when you finish.",
  reviewStorageFailed: "The draft could not be saved on this device. Closing this page may lose your work.",
  reviewClearFailed: "The saved copy could not be deleted. Clear this browser’s site data yourself.",
  reviewDiscardDevice: "Delete draft from this device",
  reviewErrorSummary: "Correct the marked details, then check again.",
  reviewFieldInvalid: "Add or correct this detail. Do not guess if you do not know.",
  reviewAgeInvalid: "Enter an age from 0 to 17",
  reviewPhoneInvalid: "Enter an 11-digit number starting 01",
  reviewTimeInvalid: "Enter a valid time and bounds. The time cannot be in the future.",
  reviewTimeHint: "Date: year-month-day. Time: HH:mm (24-hour). For an exact time, use the same time in both bounds.", // needs human Bangla review
  reviewDistrictCode: "District",
  reviewDistrictHint: "Confirm the district where last seen. Do not guess; this form cannot be submitted without a district.",
  reviewAgeMin: "Lower age bound (years)",
  reviewAgeMax: "Upper age bound (years)",
  reviewTimeLower: "Earliest last-seen time",
  reviewTimeUpper: "Latest last-seen time",
  reviewApprox: "Last-seen time is approximate",
  reviewConflict: "Different details were already submitted under this submission ID. You can review and submit with a new ID. This may create a separate report.",
  reviewNewId: "Review and submit with a new ID",
  reviewSession: "Your session has expired. The draft is kept on this device. Open your words to start a session.",
  reviewSessionExpired: "Your draft has expired. Please start again.", // D3:333 / catalogue E-019
  reviewRetryFrozen: "The result is unknown. Retry with the same details and submission ID.",
  reviewPlannedManual: "Manual form", // planned label wraps it; needs human Bangla review
  reviewExpired: "Your draft has expired. Please start again.", // D3:333 / catalogue E-019
  reviewUnknownAdd: "Unknown — add",
  reviewDiscardWarn: "This draft was already attempted. The server may have received it — deleting it removes the device copy.",
  reviewMockSubmit: "[MOCK] prepared: submit is not active, it will work once the real API is connected",
  reviewMockSubmitButton: "[MOCK] submit (inactive)",
  reviewSourceExcerpt: "Source excerpt",
  reviewSourceLink: "See in full text",
  reviewAgeMode: "How will you enter the age?",
  reviewAgeEstimate: "Estimated age range",
  reviewAgeExactHint: "Enter the known exact age in years.",
  reviewAgeRangeHint: "Enter both the lower and upper estimated ages in years.",
  reviewClockLabel: "Time (24-hour)", // needs human Bangla review
  reviewDateNotApplied: "This date has not been applied. Choose a part of day, or change each time’s date below.", // needs human Bangla review
  reviewFutureClamped: "The future part of this period was removed: the upper bound is now the current time. Check the date and time.", // needs human Bangla review
  reviewDateHint: "Use year-month-day. Choose a part of day to fill the bounds; you can edit them afterwards.", // needs human Bangla review
  reviewDateInvalid: "Enter a valid date as year-month-day.",
  reviewTimeBoundHint: "Date: year-month-day. Time: HH:mm (24-hour). For an exact time, keep all three times equal.", // needs human Bangla review
  ageExact: "Exact age",
  timeExact: "Exact time",
  timePartMorning: "Morning",
  timePartMidday: "Midday",
  timePartAfternoon: "Afternoon",
  timePartEvening: "Evening",
  timePartNight: "Night",
  timeDateLabel: "Date last seen",
  timeDateShort: "Date",
  timeDateHint: "Leave empty if you are not sure of the date.",
  timePartLabel: "Part of day",
  earlierDraftFound: "Earlier draft found — continue?", // D3:309
  earlierDraftContinue: "Continue earlier draft",
  earlierDraftReplace: "Start with new details",
  reviewCorruptAttempted: "Previous submission attempt could not be read, but its submission ID has been kept.",
  adminTitle: "Admin data tools",
  adminIntro: "No child or candidate details are shown here. All accounts and reports are synthetic.",
  syntheticLabel: "Synthetic",
  redactTitle: "Redact identifying payloads",
  redactEligible: "Eligible closed or referred reports",
  redactKeeps: "Kept: reference and IDs, dates, district, status and a coarse age band. This is pseudonymisation, not full anonymisation.",
  redactExternal: "Copies outside Fera (backups, downloads or provider copies) are not removed by this.",
  redactEvidenceRule: "A found report in a confirmed pair is kept until its missing report is closed.",
  redactConfirmLabel: "Type {word} to confirm",
  redactConfirmHint: "This can't be undone. You can paste the word.",
  redactConfirmMismatch: "Type exactly: {word}",
  redactAction: "Redact identifying payloads from eligible terminal cases", // D3 ACT-027
  redacting: "Redacting identifying payloads…",
  redactEmpty: "No eligible reports for payload redaction", // D3 SCREEN-013 empty
  redactSuccess: "{n} cases payload-redacted", // D3 SCREEN-013 success
  redactSkipped: "{n} reports skipped because they are no longer eligible.",
  redactCountUnavailable: "The eligible report count isn't available right now. Try again later.",
  verifyTitle: "Verify officers",
  verifyMockNote: "Simulation: verifying here only sets a flag on a seeded account. Nobody's real identity is checked.",
  usersCaption: "User list",
  colRole: "Role",
  colStatus: "Status",
  roleStaff: "Staff",
  roleOfficer: "Officer",
  roleAdmin: "Admin",
  statusVerified: "Verified",
  statusUnverified: "Not verified",
  statusInactive: "Inactive",
  statusNotOfficer: "Not applicable",
  verifyAction: "Verify",
  unverifyAction: "Remove verification",
  verifySaving: "Saving…",
  verifyDone: "{name}: verified [MOCK]",
  unverifyDone: "{name}: verification removed [MOCK]",
  usersEmpty: "No users",
  usersLoadMore: "Show more",
  usersLoading: "Loading…",
  usersLoaded: "{n} more users shown",
  usersUnavailable: "The user list isn't available right now. Try again later.",
  importTitle: "Synthetic import",
  importPlanned: "Not available yet. It will be added later.",
  reportTitle: "Report submitted",
  reportReference: "Reference number",
  statusGroupOpen: "Open",
  statusGroupMatched: "Being checked",
  statusGroupClosed: "Closed",
  matchingWillCheck: "Matches will be checked",
  matchingRunning: "Matching is in progress",
  matchingChecked: "Matches have been checked",
  matchingFailed: "Report saved. Matching is incomplete; retry.",
  outputsHeading: "Drafts prepared for you",
  outputDraftLabel: "Draft — submit it yourself",
  noFiling: "Fera does not file a police GD.",
  outputGd: "GD draft",
  outputPoster: "Poster",
  outputHelpline: "13219 summary",
  outputGdTitle: "GD draft to take to the police station",
  outputPosterTitle: "Missing child poster",
  outputHelplineTitle: "Summary to read out on 13219",
  outputBanglaNote: "The draft text is in Bangla.",
  outputPreparing: "Preparing…",
  outputReady: "Text ready",
  copyAction: "Copy",
  copied: "Copied",
  copyManual: "The text is selected. Please copy it yourself.",
  retry: "Try again",
  outputsLocked: "Drafts for this report can no longer be shown. Call 13219 if you need help.",
  outputsSessionExpired: "This report can no longer be opened on this phone. Keep the reference number, and call 13219 if you need help.",
  posterShareNotice: "Review phone/location before sharing. Fera cannot remove downloaded copies.",
  posterContactLegend: "Put your phone number on the poster?",
  posterContactInclude: "Yes, include it",
  posterContactOmit: "No, leave it out",
  posterAckLabel: "I understand: the poster shows the child's details, where they were last seen and (if I keep it) my phone number. Fera cannot remove downloaded copies.",
  posterNeedChoice: "Choose whether to include your phone number.",
  posterNeedAck: "Tick the box to confirm you understand.",
  posterMake: "Prepare the poster for download",
  posterRendering: "Preparing the poster…",
  posterReady: "Poster ready to download",
  posterDownload: "Download poster",
  posterCopyText: "Copy poster text",
  posterTextHeading: "Poster text",
  posterImageLabel: "Poster preview. Its text is in the section above.",
  posterFontError: "The Bangla font didn't load, so no poster was made. Copy the text instead.",
  posterFailed: "The poster couldn't be made right now. Try again, or copy the text instead.",
  posterTooLong: "The text doesn't fit on one poster. Copy the text instead.",
  posterBlocked: "A phone number is still in the text, so no poster was made. Call 13219 if you need help.",
  ...parentIntakeEn,
  ...parentFormEn,
  ...parentStatusEn,
  ...staffDisasterEn,
  ...officerQueueEn,
  ...officerCaseEn,
  ...officerMapEn,
  ...officerMatchEn,
  ...officerDuplicatesEn,
  ...adminImportEn,
} as const satisfies Record<MessageKey, string>;

export const locales = { bn, en } as const;

export type Locale = keyof typeof locales;

// COMP-022 toggle options: each language is named in its own script in both modes
// (D3 §1: "বাংলা | English").
export const languageNames = { bn: "বাংলা", en: "English" } as const satisfies Record<Locale, string>;
