// TASK-021: SCREEN-001/002 strings exist in both languages and keep the D3/D4 copy.
import { describe, expect, it } from "vitest";
import { locales, type MessageKey } from "@/locales";

const KEYS = [
  "welcomeLead", "welcomeNoAlerts", "noticeTitle", "providerNotice", "noticeReviewFirst", "noticeWhoSees",
  "startAction", "callHelpline", "noticeAckAction", "syntheticBadge", "mockReplies", "cachedBadge", "intakeTitle",
  "intakeEmptyPrompt", "intakeExample", "conversationLabel", "speakerParent", "messageSending", "messageFailed",
  "recordAction", "stopAction", "recordHint", "recordingTime", "micRequesting", "listening", "sending",
  "understanding", "stillWorking", "useFormLink", "textLabel", "transcriptLabel", "answerLabel", "sendAction",
  "transcriptSend", "textTooShort", "answerRequired", "sexMale", "sexFemale", "sexOther", "sexUnknown",
  "understoodTitle", "unknownValue", "fieldName", "fieldAge", "fieldSex", "fieldClothing", "fieldMarks",
  "fieldLastSeenAt", "fieldPlace", "fieldDistrict", "fieldPhone", "ageYears", "ageRange", "approxTime",
  "readyTitle", "beforeSubmit", "reviewAction", "manualTitle", "stillUnknown", "openFormAction",
  "discardAction", "discardConfirm", "retryAction", "startAgainAction", "recordingStopped", "textLimitReached",
  "discardYes", "discardNo", "fieldHeight", "fieldNameLatin", "fieldThana", "fieldCircumstances", "fieldRelation", "heightCm", "timeWindow",
  "questionAge", "questionDistrict", "questionAt", "questionPhone", "questionPlace",
  "timeAfter", "timeBefore", "recordingNotSent", "finishRecordingFirst",
] as const satisfies readonly MessageKey[];

const exact: [MessageKey, string, string][] = [
  ["providerNotice", "কথা বা লেখা বোঝার জন্য বাইরের এআই সেবা ব্যবহার হতে পারে। এই সংস্করণে বাস্তব শিশুর তথ্য দেবেন না।", "External AI may process audio/text. Do not enter real child information in this version."], // D4 §15.1
  ["beforeSubmit", "জমা দেওয়ার আগে তথ্য যাচাই করুন। ফেরা পুলিশে জিডি জমা দেয় না।", "Review before submission. Fera does not file a police GD."], // D4 §15.1
  ["cachedBadge", "ক্যাশ · পূর্বপ্রস্তুত সিনথেটিক উদাহরণ", "Cached · prepared synthetic example"], // D4 §15.1
  ["welcomeLead", "ফেরা আপনার কথা থেকে নিখোঁজ শিশুর রিপোর্ট তৈরি করে।", "Fera turns what you say into a missing-child report."], // D3
  ["welcomeNoAlerts", "ফেরা পুলিশ বা সিআইডি-কে সতর্কবার্তা পাঠায় না। জরুরি হলে ১৩২১৯-এ কল করুন।", "Fera does not alert police or CID. In an emergency, call 13219."], // D4 §10
  ["startAction", "শুরু করুন", "Start"], // D3 ACT-001
  ["callHelpline", "১৩২১৯-এ কল করুন", "Call 13219"], // D3
  ["intakeEmptyPrompt", "আপনার শিশুর কথা বলুন বা লিখুন", "Tell us about your child, by voice or text."], // D3
  ["listening", "শুনছি…", "Listening…"], // D3
  ["understanding", "বুঝে নিচ্ছি…", "Understanding…"], // D3
  ["stillWorking", "এখনও কাজ চলছে, একটু অপেক্ষা করুন", "Still working, please wait"], // D3
  ["sending", "পাঠাচ্ছি…", "Sending…"], // D4 §9
  ["transcriptSend", "ঠিক আছে, পাঠান", "OK, send"], // D4 §9
  ["discardConfirm", "খসড়া মুছে ফেলবেন?", "Delete this draft?"], // D3 §7
  ["unknownValue", "অজানা", "Unknown"], // D3
];

describe("TASK-021 locale keys", () => {
  it.each(KEYS)("defines %s in Bangla and English", (key) => {
    expect(locales.bn[key].trim()).not.toBe("");
    expect(locales.en[key].trim()).not.toBe("");
    expect(locales.bn[key]).not.toMatch(/[0-9]/);
    expect(locales.bn[key].normalize("NFC")).toBe(locales.bn[key]);
  });

  it.each(exact)("keeps the spec copy for %s", (key, bn, en) => {
    expect([locales.bn[key], locales.en[key]]).toEqual([bn, en]);
  });

  it("uses no alarm, rescue or runaway wording (D4 §2, §10)", () => {
    for (const key of KEYS) {
      expect(locales.bn[key]).not.toMatch(/পালিয়ে|উদ্ধার|সতর্ক(?!বার্তা পাঠায় না)/);
      expect(locales.en[key]).not.toMatch(/runaway|ran away|rescue|(?<!does not )alert|!/i);
    }
  });
});
