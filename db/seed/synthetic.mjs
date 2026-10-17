// npm run synth [-- --check] — deterministic synthetic report set (TASK-010, A-039, BR-026).
//
// Writes data/synthetic/{records.jsonl,ground_truth.json,records.sha256,ground_truth.sha256}.
// Every record is a SYNTHETIC submission draft (it parses with the missing/found submission
// schemas); no real child, photo, ID document or exact coordinate is involved. Phones are
// format-valid fictional numbers in the block 0120000NNNN; they are NOT verified as
// unassigned (OD-010-6), so never present them as reserved or non-routable.
//
// Composition (OD-010-1 records the reading of A-039 used here):
//   80 missing = 60 paired queries + 15 no-match identities + 5 duplicate missing reports
//   80 found   = 60 paired + 20 duplicate found logs of paired children
//   40 decoys  = 30 found + 10 missing near-misses, each pointing at the record it imitates
//   200 total; 60 true pairs; 20 no-match missing queries (15 identities + 5 duplicates of them);
//   25 duplicate links (20 found + 5 missing). The dev/test split is TASK-064's job; this file
//   only writes `split_group_id`, the connected component that a split must keep together.
//
// Leakage rules (RISK-007): records.jsonl carries an opaque id and no label; record order is
// shuffled; every role draws its text variant, name-known, time offset and phone from the same
// distributions; true pairs sometimes share a contact and found desks reuse a few phones.
//
// SEED and the order of random draws are FROZEN once TASK-064 freezes the manifest: any new
// draw reshuffles every later record and changes both hashes. `--check` fails if the committed
// files differ from what this file would write (it also records the districts.json hash).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDistrictData } from "./districts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "data", "synthetic");
export const GROUND_TRUTH_REVISION = "gt-1";
export const GENERATOR_REVISION = "synth-2";
export const SEED = 1010;

/* ---------- deterministic helpers ---------- */

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const uuidFor = (key) => {
  const h = sha256(`fera-synthetic:${GROUND_TRUTH_REVISION}:${SEED}:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnNum = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const nfc = (v) => (typeof v === "string" ? v.normalize("NFC") : Array.isArray(v) ? v.map(nfc) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nfc(x)])) : v);

/* ---------- reference pools ---------- */

// [bn, latin, confusable bn, confusable latin] — the confusable has the same sex and a close sound/spelling
const MALE = [
  ["রাকিব", "Rakib", "রাকিবুল", "Rakibul"], ["হাসান", "Hasan", "হাসিব", "Hasib"], ["সাকিব", "Sakib", "শাকিব", "Shakib"],
  ["তানভীর", "Tanvir", "তানজির", "Tanjir"], ["ইমরান", "Imran", "ইমন", "Imon"], ["আরিফ", "Arif", "আরিফুল", "Ariful"],
  ["শাকিল", "Shakil", "সাকিল", "Sakil"], ["জুয়েল", "Jewel", "জুবেল", "Jubel"], ["নয়ন", "Nayan", "নাঈম", "Naim"],
  ["রাসেল", "Rasel", "রাশেদ", "Rashed"], ["আসিফ", "Asif", "আশিক", "Ashik"], ["ফাহিম", "Fahim", "ফয়সাল", "Faisal"],
  ["সজীব", "Sajib", "সজল", "Sajal"], ["মামুন", "Mamun", "মাসুম", "Masum"], ["শুভ", "Shuvo", "শুভ্র", "Shuvro"],
  ["জাহিদ", "Jahid", "জাবেদ", "Jabed"], ["অনিক", "Anik", "অর্নব", "Arnab"], ["সুমন", "Suman", "সুজন", "Sujon"],
];
const FEMALE = [
  ["সুমাইয়া", "Sumaiya", "সুমাইরা", "Sumaira"], ["তানিয়া", "Tania", "তান্নি", "Tanni"], ["নুসরাত", "Nusrat", "নুসরিন", "Nusrin"],
  ["রিয়া", "Riya", "রিয়ানা", "Riana"], ["ফারিয়া", "Faria", "ফারিহা", "Fariha"], ["জান্নাত", "Jannat", "জান্নাতুল", "Jannatul"],
  ["আয়েশা", "Ayesha", "আইশা", "Aisha"], ["সাদিয়া", "Sadia", "সাবিয়া", "Sabia"], ["লাবণী", "Labony", "লাবিবা", "Labiba"],
  ["পারভীন", "Parvin", "পারুল", "Parul"], ["শিউলি", "Shiuli", "শিমুল", "Shimul"], ["মারিয়া", "Maria", "মরিয়ম", "Moriom"],
  ["রূপা", "Rupa", "রূপালী", "Rupali"], ["প্রিয়া", "Priya", "প্রিয়াঙ্কা", "Priyanka"], ["মিতা", "Mita", "মিনা", "Mina"],
];
const COLOURS = [
  ["নীল", "blue"], ["লাল", "red"], ["সবুজ", "green"], ["হলুদ", "yellow"], ["সাদা", "white"],
  ["কালো", "black"], ["কমলা", "orange"], ["বেগুনি", "purple"], ["ধূসর", "grey"],
];
const TOPS_M = [["শার্ট", "shirt"], ["গেঞ্জি", "t-shirt"], ["পাঞ্জাবি", "panjabi"]];
const BOTTOMS_M = [["হাফ প্যান্ট", "shorts"], ["জিন্স", "jeans"], ["প্যান্ট", "trousers"]];
const TOPS_F = [["জামা", "dress top"], ["ফ্রক", "frock"], ["কুর্তি", "kurti"]];
const BOTTOMS_F = [["পায়জামা", "pyjamas"], ["জিন্স", "jeans"], ["লেগিংস", "leggings"]];
const MARKS = [
  ["বাম হাতে কাটা দাগ", "scar on the left hand"], ["ডান গালে তিল", "mole on the right cheek"],
  ["কপালে সেলাইয়ের দাগ", "stitch scar on the forehead"], ["বাম পায়ে জন্মদাগ", "birthmark on the left leg"],
  ["সামনের দাঁত ভাঙা", "broken front tooth"], ["ডান হাতে কালো সুতো", "black thread on the right wrist"],
  ["চোখের নিচে কালো দাগ", "dark mark under the eye"],
];
// English entries are full prepositional phrases so templates never double a preposition.
const FOUND_PLACES = [
  ["রেলস্টেশন", "at the railway station"], ["বাসস্ট্যান্ড", "at the bus stand"], ["বাজার", "at the market"], ["মসজিদের সামনে", "outside the mosque"],
  ["লঞ্চঘাট", "at the launch ghat"], ["স্কুলের কাছে", "near the school"], ["হাসপাতালের সামনে", "outside the hospital"], ["মেলা প্রাঙ্গণ", "at the fairground"],
  ["ফেরিঘাট", "at the ferry ghat"], ["চায়ের দোকানের সামনে", "outside a tea stall"],
];
const HOME_PLACES = [
  ["বাসার কাছে", "near home"], ["মাদ্রাসার কাছে", "near the madrasa"], ["খেলার মাঠ", "at the playground"], ["বাজার", "at the market"],
  ["স্কুলের সামনে", "outside the school"], ["মসজিদের কাছে", "near the mosque"], ["পুকুরপাড়", "by the pond"], ["বাস্তুহারা কলোনির মোড়", "at the colony crossing"],
];
const CIRCUMSTANCES = [
  ["একা ঘুরছিল", "was wandering alone"], ["কাঁদছিল", "was crying"], ["নিজের বাড়ির ঠিকানা বলতে পারছিল না", "could not give a home address"],
  ["ভয় পেয়ে চুপ করে ছিল", "was frightened and quiet"], ["ক্ষুধার্ত ছিল", "was hungry"],
];
const RELATIONS = [
  ["মা", { m: "ছেলে", f: "মেয়ে" }], ["বাবা", { m: "ছেলে", f: "মেয়ে" }], ["চাচা", { m: "ভাতিজা", f: "ভাতিজি" }],
  ["মামা", { m: "ভাগ্নে", f: "ভাগ্নি" }], ["ভাই", { m: "ছোট ভাই", f: "ছোট বোন" }],
];
const BN_MONTH = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const EN_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BIG = ["Dhaka", "Chattogram", "Gazipur", "Narayanganj", "Sylhet", "Rajshahi", "Khulna", "Cumilla", "Barishal", "Rangpur", "Mymensingh"];

const HOUR = 3600e3;
const toIso = (ms) => new Date(ms + 6 * HOUR).toISOString().replace("Z", "+06:00");
const dhakaParts = (ms) => {
  const d = new Date(ms + 6 * HOUR);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), hour: d.getUTCHours() };
};
const todBn = (h) => (h < 4 ? "রাতে" : h < 6 ? "ভোরে" : h < 12 ? "সকালে" : h < 15 ? "দুপুরে" : h < 18 ? "বিকেলে" : h < 20 ? "সন্ধ্যায়" : "রাতে");
const todEn = (h) => (h < 4 ? "at night" : h < 6 ? "at dawn" : h < 12 ? "in the morning" : h < 15 ? "at midday" : h < 18 ? "in the afternoon" : h < 20 ? "in the evening" : "at night");
const aOrAn = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
// Genitive attached to a place name: vowel ending takes র, consonant ending takes ের.
const genBn = (name) => (/[অ-ঔা-ৌ]$/u.test(name) ? `${name}র` : `${name}ের`);
const fromBn = (place) => `${place[0].replace(/কাছে$/, "কাছ")} থেকে`;
const he = (sex) => (sex === "male" ? "He" : "She");

const DECOY_FOUND_TYPES = [
  ...Array(5).fill("wrong_district"), ...Array(5).fill("similar_name"), ...Array(5).fill("same_clothing_diff_age"),
  ...Array(5).fill("contradiction"), ...Array(4).fill("unknown_age"), ...Array(3).fill("overlapping_time"), ...Array(3).fill("shared_phone"),
];
const DECOY_MISSING_TYPES = ["similar_name", "similar_name", "similar_name", "wrong_district", "wrong_district", "wrong_district", "shared_phone", "shared_phone", "shared_phone", "shared_phone"];

/* ---------- generator ---------- */

export function generate(districtData, districtsSha256 = "") {
  const rng = mulberry32(SEED);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const chance = (p) => rng() < p;
  const shuffle = (a) => {
    const x = [...a];
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  const districts = districtData.districts;
  const byEn = (n) => districts.find((d) => d.name_en === n);
  const byCode = new Map(districts.map((d) => [d.code, d]));
  const big = districts.filter((d) => BIG.includes(d.name_en));
  const pickDistrict = () => (chance(0.6) ? pick(big) : pick(districts));
  const farFrom = (d) => {
    const near = new Set([d.code, ...d.neighbours]);
    return pick(districts.filter((x) => !near.has(x.code)));
  };
  const nearOf = (d) => (chance(0.8) || d.neighbours.length === 0 ? d : byCode.get(pick(d.neighbours)));
  let phoneSeq = 0;
  const newPhone = () => `0120000${String(++phoneSeq).padStart(4, "0")}`;
  const DESK_PHONES = Array.from({ length: 8 }, newPhone); // found-log desks reuse a few numbers
  const heightFor = (age) => Math.round(age * 5.5 + 75 + int(-6, 6));

  function newTruth(over = {}) {
    const sex = over.sex ?? (chance(0.55) ? "male" : "female");
    const name = pick(sex === "male" ? MALE : FEMALE);
    const age = over.age ?? int(4, 16);
    const [tops, bottoms] = sex === "male" ? [TOPS_M, BOTTOMS_M] : [TOPS_F, BOTTOMS_F];
    const topC = pick(COLOURS);
    let botC = pick(COLOURS);
    if (botC === topC) botC = COLOURS[(COLOURS.indexOf(topC) + 3) % COLOURS.length];
    return {
      sex, name, age, district: pickDistrict(),
      clothing: { topC, top: pick(tops), botC, bottom: pick(bottoms) },
      mark: chance(0.55) ? pick(MARKS) : null, height: heightFor(age), relation: pick(RELATIONS), phone: newPhone(),
      missingAt: Date.parse("2026-09-25T06:00:00+06:00") + int(0, 14 * 24 + 15) * HOUR,
      ...over,
    };
  }
  const lite = (c) => (c[1] === "white" || c[1] === "black" ? "" : chance(0.25) ? "হালকা " : "");
  const clothesBn = (c, hint = false) => `${hint ? lite(c.topC) : ""}${c.topC[0]} ${c.top[0]} ও ${c.botC[0]} ${c.bottom[0]}`;
  const clothesEn = (c) => `${aOrAn(c.topC[1])} ${c.topC[1]} ${c.top[1]} and ${c.botC[1]} ${c.bottom[1]}`;
  const dateBn = (ms) => { const p = dhakaParts(ms); return `${bnNum(p.day)} ${BN_MONTH[p.month]}`; };
  const dateEn = (ms) => { const p = dhakaParts(ms); return `${p.day} ${EN_MONTH[p.month]}`; };
  const otherColour = (c) => COLOURS[(COLOURS.indexOf(c) + 2 + int(0, 3)) % COLOURS.length];

  function missingRecord(t, variant, over = {}) {
    const d = over.district ?? t.district;
    const place = over.place ?? pick(HOME_PLACES);
    const at = over.at ?? t.missingAt;
    const exact = over.exact ?? chance(0.25);
    const [rel, terms] = t.relation;
    const child = t.sex === "male" ? terms.m : terms.f;
    const phone = over.phone ?? t.phone;
    const phoneText = chance(0.25) ? bnNum(phone) : phone; // some parents type Bangla digits
    const hour = dhakaParts(at).hour;
    const marksBn = t.mark ? ` ${t.mark[0]} আছে।` : "";
    const marksEn = t.mark ? ` ${he(t.sex)} has a ${t.mark[1]}.` : "";
    const [nameBn, nameEn] = t.name;
    let text;
    if (variant === "en") {
      text = `My ${t.sex === "male" ? "son" : "daughter"} ${nameEn}, ${t.age} years old, went missing ${place[1]} in ${d.name_en} on ${dateEn(at)} ${todEn(hour)}. ${he(t.sex)} was wearing ${clothesEn(t.clothing)}.${marksEn} Please call ${phone}.`;
    } else if (variant === "mixed") {
      text = `আমার ${child} ${nameBn} (${nameEn}), বয়স ${bnNum(t.age)}, ${dateBn(at)} ${todBn(hour)} ${genBn(d.name_bn)} ${fromBn(place)} missing। ${t.clothing.topC[1]} ${t.clothing.top[1]} আর ${t.clothing.botC[1]} ${t.clothing.bottom[1]} পরা ছিল।${marksBn} ফোন ${phone}`;
    } else if (variant === "public_post") {
      text = `জরুরি: ${bnNum(t.age)} বছরের একটি ${t.sex === "male" ? "ছেলে" : "মেয়ে"}, নাম ${nameBn}, ${dateBn(at)} ${genBn(d.name_bn)} ${fromBn(place)} নিখোঁজ। পরনে ${clothesBn(t.clothing, true)}।${marksBn} খোঁজ পেলে ${phoneText} নম্বরে জানান।`;
    } else {
      text = `আমার ${child} ${nameBn}, বয়স ${bnNum(t.age)} বছর। ${dateBn(at)} ${todBn(hour)} ${genBn(d.name_bn)} ${fromBn(place)} হারিয়ে গেছে। পরনে ${clothesBn(t.clothing)} ছিল।${marksBn} যোগাযোগ: ${phoneText}`;
    }
    const draft = {
      kind: "missing", source_text: text,
      child: { name: nameBn, name_latin: nameEn, sex: t.sex, height_cm: t.height, clothing: clothesBn(t.clothing), marks: t.mark ? t.mark[0] : null, age_years: t.age, age_min: t.age, age_max: t.age },
      event: { at_approx: !exact, thana: null, circumstances: null, at: toIso(at), at_lower: toIso(exact ? at : at - 2 * HOUR), at_upper: toIso(exact ? at : at + 2 * HOUR), place_text: `${d.name_bn} ${place[0]}`, district_text: null, district_code: d.code },
      reporter: { relation: rel, phone }, evidence: {},
    };
    return { kind: "missing", draft, variant, truth: t, meta: { district: d, place, at } };
  }

  function foundRecord(t, variant, over = {}) {
    const d = over.district ?? nearOf(t.district);
    const place = over.place ?? pick(FOUND_PLACES);
    const at = over.at ?? t.missingAt + int(0, 72) * HOUR;
    const hour = dhakaParts(at).hour;
    const age = over.age ?? t.age;
    const ageUnknown = over.ageUnknown ?? false;
    const lo = over.lo ?? Math.max(0, age - int(1, 2));
    const hi = over.hi ?? Math.min(25, age + int(1, 2));
    const sex = over.sex ?? t.sex;
    const nameKnown = over.nameKnown ?? chance(0.35);
    const name = over.name ?? t.name;
    const clothing = over.clothing ?? t.clothing;
    const mark = over.mark === undefined ? t.mark : over.mark;
    const circ = over.circ ?? pick(CIRCUMSTANCES);
    const baseHeight = over.age !== undefined ? heightFor(over.age) : t.height;
    const height = ageUnknown ? null : chance(0.5) ? baseHeight + int(-3, 3) : null;
    const phone = over.phone ?? (chance(0.5) ? pick(DESK_PHONES) : newPhone());
    const rangeStyle = chance(0.3);
    const childBn = sex === "male" ? "ছেলে" : "মেয়ে";
    const ageBn = ageUnknown ? "বয়স বলতে পারছে না।" : rangeStyle ? `আনুমানিক ${bnNum(lo)} থেকে ${bnNum(hi)} বছর বয়স।` : `আনুমানিক বয়স ${bnNum(lo)}–${bnNum(hi)} বছর।`;
    const nameBnS = nameKnown ? ` নিজের নাম ${name[0]} বলছে।` : "";
    const marksBn = mark ? ` ${mark[0]} আছে।` : "";
    let text;
    if (variant === "en") {
      text = `A ${sex === "male" ? "boy" : "girl"} was found ${todEn(hour)} on ${dateEn(at)} ${place[1]} in ${d.name_en}. ${ageUnknown ? "Age unknown." : `Estimated age ${lo}-${hi} years.`}${nameKnown ? ` Says the name is ${name[1]}.` : ""} Wearing ${clothesEn(clothing)}.${mark ? ` ${he(sex)} has a ${mark[1]}.` : ""} ${he(sex)} ${circ[1]}.`;
    } else if (variant === "short") {
      text = `${place[0]}, ${d.name_bn}। ${childBn}${nameKnown ? ` (নাম ${name[0]})` : ""}, ${ageUnknown ? "বয়স অজানা" : `আনুমানিক ${bnNum(lo)}-${bnNum(hi)} বছর`}, ${clothesBn(clothing)}।${marksBn} ${circ[0]}।`;
    } else {
      text = `${dateBn(at)} ${todBn(hour)} ${genBn(d.name_bn)} ${fromBn(place)} একটি ${childBn}কে পাওয়া গেছে। ${ageBn}${nameBnS} পরনে ${clothesBn(clothing, true)}।${marksBn} ${circ[0]}।`;
    }
    const draft = {
      kind: "found", source_text: text,
      child: { name: nameKnown ? name[0] : null, name_latin: nameKnown ? name[1] : null, sex, height_cm: height, clothing: clothesBn(clothing), marks: mark ? mark[0] : null, age_years: null, age_min: ageUnknown ? null : lo, age_max: ageUnknown ? null : hi },
      event: { at_approx: false, thana: null, circumstances: circ[0], at: toIso(at), at_lower: toIso(at), at_upper: toIso(at), place_text: `${d.name_bn} ${place[0]}`, district_text: null, district_code: d.code },
      reporter: { relation: "স্টাফ", phone }, evidence: {},
    };
    return { kind: "found", draft, variant, truth: t, meta: { district: d, place, at } };
  }

  const missingVariant = () => pick(["bn", "bn", "en", "mixed", "public_post"]);
  const foundVariant = () => pick(["bn", "bn", "en", "short"]);

  /* ----- assemble ----- */
  const out = [];
  const counters = { M: 0, F: 0, DM: 0, DF: 0 };
  const add = (kindKey, rec, extra) => {
    const label = `SYN-${kindKey}-${String(++counters[kindKey]).padStart(3, "0")}`;
    const row = { label, kind: rec.kind, draft: rec.draft, variant: rec.variant, partners: [], group: null, noMatch: false, decoyType: null, targets: [], demo: null, meta: rec.meta, ...extra };
    out.push(row);
    return row;
  };

  // 60 paired identities. Index 0 is the Rafi / Kamalapur demo pair (D6 §9.2).
  const pairs = [];
  for (let i = 0; i < 60; i++) {
    const identity = `ID-P-${String(i + 1).padStart(3, "0")}`;
    let t, m, f;
    if (i === 0) {
      t = newTruth({ sex: "male", name: ["রাফি", "Rafi", "রাফিন", "Rafin"], age: 13, district: byEn("Dhaka"), clothing: { topC: ["নীল", "blue"], top: ["শার্ট", "shirt"], botC: ["কালো", "black"], bottom: ["হাফ প্যান্ট", "shorts"] }, mark: MARKS[0], height: 148, missingAt: Date.parse("2026-10-08T16:00:00+06:00"), relation: RELATIONS[0] });
      m = missingRecord(t, "bn", { place: ["মিরপুর মাদ্রাসার কাছে", "near the Mirpur madrasa"], exact: false });
      f = foundRecord(t, "bn", { district: byEn("Dhaka"), place: ["কমলাপুর রেলস্টেশন", "at Kamalapur railway station"], at: Date.parse("2026-10-09T07:30:00+06:00"), lo: 12, hi: 14, nameKnown: false, circ: CIRCUMSTANCES[0] });
    } else {
      t = newTruth();
      m = missingRecord(t, missingVariant());
      f = foundRecord(t, foundVariant(), chance(0.3) ? { phone: t.phone } : {}); // some families relay their own number
    }
    const M = add("M", m, { role: "pair_query", identity, demo: i === 0 ? "rafi" : null });
    const F = add("F", f, { role: "pair_found", identity, demo: i === 0 ? "kamalapur_boy" : null });
    M.partners.push(F); F.partners.push(M);
    pairs.push({ M, F, t });
  }
  // 20 duplicate found logs: the same child logged again by another staff member
  const dupFoundIdx = shuffle([...Array(59).keys()].map((i) => i + 1)).slice(0, 20);
  dupFoundIdx.forEach((pi, n) => {
    const { M, F, t } = pairs[pi];
    const g = `DUP-F-${String(n + 1).padStart(3, "0")}`;
    const sameSpot = chance(0.5);
    const f2 = foundRecord(t, foundVariant(), {
      district: sameSpot ? F.meta.district : nearOf(F.meta.district),
      place: sameSpot ? F.meta.place : pick(FOUND_PLACES),
      at: F.meta.at + int(1, 40) * HOUR,
      nameKnown: chance(0.35),
    });
    const F2 = add("F", f2, { role: "dup_found", identity: F.identity });
    F.group = g; F2.group = g; F2.partners.push(M); M.partners.push(F2);
  });
  // 15 no-match identities; Mim (with a duplicate) and Sabbir are the demo ones. Three pairs of
  // different children share a parent contact (siblings / neighbours).
  const noMatch = [];
  for (let i = 0; i < 15; i++) {
    const identity = `ID-N-${String(i + 1).padStart(3, "0")}`;
    let t, m, demo = null;
    if (i === 0) {
      t = newTruth({ sex: "female", name: ["মীম", "Mim", "মিমি", "Mimi"], age: 11, district: byEn("Gazipur"), missingAt: Date.parse("2026-10-06T15:00:00+06:00") });
      m = missingRecord(t, "bn", { place: ["টঙ্গী বাজার", "at Tongi bazaar"] });
      demo = "mim";
    } else if (i === 1) {
      t = newTruth({ sex: "male", name: ["সাব্বির", "Sabbir", "সাদ্দাম", "Saddam"], age: 15, district: byEn("Chattogram"), missingAt: Date.parse("2026-10-05T10:00:00+06:00") });
      m = missingRecord(t, "bn", { place: ["বাসস্ট্যান্ড", "at the bus stand"] });
      demo = "sabbir";
    } else {
      t = newTruth([3, 5, 7].includes(i) ? { phone: noMatch[i - 1].t.phone } : {});
      m = missingRecord(t, missingVariant());
    }
    noMatch.push({ M: add("M", m, { role: "no_match_query", identity, noMatch: true, demo }), t });
  }
  // 5 duplicate missing reports (Mim + 4 others, never Sabbir); the second report often uses another contact
  [0, ...shuffle([...Array(13).keys()].map((i) => i + 2)).slice(0, 4)].forEach((ni, n) => {
    const { M, t } = noMatch[ni];
    const g = `DUP-M-${String(n + 1).padStart(3, "0")}`;
    const sameSpot = chance(0.5);
    const m2 = missingRecord(t, ni === 0 ? "public_post" : missingVariant(), {
      district: M.meta.district, place: sameSpot ? M.meta.place : pick(HOME_PLACES), at: M.meta.at + int(1, 20) * HOUR, exact: false,
      phone: chance(0.6) ? t.phone : newPhone(),
    });
    const M2 = add("M", m2, { role: "dup_missing", identity: M.identity, noMatch: true, demo: ni === 0 ? "mim_public_post" : null });
    M.group = g; M2.group = g;
  });

  // 40 decoys. Found decoys: Narayanganj first (aimed at Rafi), then 12 aimed at no-match queries, the rest at paired queries.
  const queries = { noMatch: shuffle(noMatch).slice(0, 12), paired: shuffle(pairs.slice(1)) };
  // The Narayanganj demo decoy (a neighbouring district, ranks 2-3 in D6 §9.2) is a clothing/mark contradiction.
  const restTypes = [...DECOY_FOUND_TYPES];
  restTypes.splice(restTypes.indexOf("contradiction"), 1);
  const foundTypes = ["contradiction", ...shuffle(restTypes)];
  for (let i = 0; i < 30; i++) {
    const type = foundTypes[i];
    const target = i === 0 ? { M: pairs[0].M, t: pairs[0].t } : i <= 12 ? queries.noMatch[i - 1] : queries.paired[i - 13];
    const t = target.t;
    const sameSexName = () => pick(t.sex === "male" ? MALE : FEMALE);
    // Unrelated names so "name known" does not single out similar_name decoys.
    const over = type === "similar_name" ? {} : { nameKnown: chance(0.2), name: sameSexName() };
    let narayanganj = false;
    if (i === 0) {
      Object.assign(over, { district: byEn("Narayanganj"), place: ["বাসস্ট্যান্ড", "at the bus stand"], clothing: { ...t.clothing, topC: ["লাল", "red"] }, mark: null, age: 13, at: Date.parse("2026-10-09T09:00:00+06:00") });
      narayanganj = true;
    } else if (type === "wrong_district") {
      over.district = farFrom(t.district);
    } else if (type === "similar_name") {
      Object.assign(over, { name: [t.name[2], t.name[3]], nameKnown: true, age: Math.max(1, t.age + (chance(0.5) ? 1 : -1)), clothing: { ...t.clothing, botC: otherColour(t.clothing.botC) }, mark: null, district: nearOf(t.district) });
    } else if (type === "same_clothing_diff_age") {
      over.age = Math.min(16, Math.max(1, t.age + (t.age > 9 ? -1 : 1) * int(4, 6)));
      over.mark = chance(0.5) ? pick(MARKS) : null;
    } else if (type === "contradiction") {
      if (chance(0.5)) {
        over.sex = t.sex === "male" ? "female" : "male";
        over.name = pick(over.sex === "male" ? MALE : FEMALE);
        over.clothing = { ...newTruth({ sex: over.sex }).clothing, topC: t.clothing.topC };
      } else {
        over.mark = pick(MARKS.filter((m) => m !== t.mark));
      }
    } else if (type === "unknown_age") {
      over.ageUnknown = true; over.mark = null; over.nameKnown = false;
    } else if (type === "overlapping_time") {
      over.at = t.missingAt + int(0, 2) * HOUR;
      over.age = Math.min(16, Math.max(1, t.age + (chance(0.5) ? 2 : -2)));
      over.clothing = { ...t.clothing, botC: otherColour(t.clothing.botC) };
    } else if (type === "shared_phone") {
      Object.assign(over, { age: Math.min(16, Math.max(1, t.age + (chance(0.5) ? 1 : -1))), clothing: { ...newTruth({ sex: t.sex }).clothing, topC: t.clothing.topC }, mark: pick(MARKS.filter((m) => m !== t.mark)), district: nearOf(t.district), phone: t.phone });
    }
    const rec = foundRecord(t, narayanganj ? "bn" : foundVariant(), over);
    add("DF", rec, { role: "decoy", identity: `ID-D-${String(i + 1).padStart(3, "0")}`, decoyType: type, targets: [target.M], demo: narayanganj ? "narayanganj_decoy" : null });
  }
  // Missing decoys aimed at found records of paired identities.
  const fTargets = shuffle(pairs.slice(1)).slice(0, 10);
  DECOY_MISSING_TYPES.forEach((type, i) => {
    const { F, t } = fTargets[i];
    const near = { missingAt: t.missingAt + int(-12, 12) * HOUR };
    let t2;
    if (type === "similar_name") {
      t2 = newTruth({ sex: t.sex, name: [t.name[2], t.name[3], t.name[0], t.name[1]], age: Math.max(1, Math.min(16, t.age + (chance(0.5) ? 1 : -1))), district: nearOf(t.district), clothing: { ...t.clothing, botC: otherColour(t.clothing.botC) }, ...near });
    } else if (type === "wrong_district") {
      t2 = newTruth({ sex: t.sex, name: pick(t.sex === "male" ? MALE : FEMALE), age: t.age, clothing: t.clothing, mark: t.mark, district: farFrom(t.district), ...near });
    } else {
      t2 = newTruth({ sex: t.sex, phone: F.draft.reporter.phone, age: Math.max(1, Math.min(16, t.age + (chance(0.5) ? 1 : -1))), district: nearOf(t.district), ...near });
    }
    add("DM", missingRecord(t2, missingVariant()), { role: "decoy", identity: `ID-D-${String(31 + i).padStart(3, "0")}`, decoyType: type, targets: [F] });
  });

  /* ----- groups a split must keep together (TASK-064): identity, duplicate group, decoy and its target ----- */
  const parent = new Map(out.map((r) => [r.label, r.label]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  const byIdentity = new Map();
  for (const r of out) {
    if (byIdentity.has(r.identity)) union(r.label, byIdentity.get(r.identity)); else byIdentity.set(r.identity, r.label);
    for (const p of r.partners) union(r.label, p.label);
    for (const tg of r.targets) union(r.label, tg.label);
  }
  const groupNo = new Map();
  for (const r of out) { const root = find(r.label); if (!groupNo.has(root)) groupNo.set(root, `SG-${String(groupNo.size + 1).padStart(3, "0")}`); }

  /* ----- emit (shuffled so file order carries no information; no label in records.jsonl) ----- */
  const idOf = (row) => uuidFor(row.label);
  const order = shuffle(out);
  const records = order.map((r) => nfc({ record_id: idOf(r), kind: r.kind, is_synthetic: true, draft: r.draft }));
  const phoneOwners = new Map();
  for (const r of order) phoneOwners.set(r.draft.reporter.phone, [...(phoneOwners.get(r.draft.reporter.phone) ?? []), r]);
  const truth = order.map((r) => ({
    record_id: idOf(r), label: r.label, kind: r.kind, role: r.role, identity_id: r.identity, duplicate_group_id: r.group,
    split_group_id: groupNo.get(find(r.label)),
    true_partner_ids: r.partners.map(idOf), no_match: r.noMatch,
    decoy_type: r.decoyType, decoy_target_ids: r.targets.map(idOf), source_variant: r.variant, demo_role: r.demo,
    phone_shared_with_other_identities: (phoneOwners.get(r.draft.reporter.phone) ?? []).filter((o) => o.identity !== r.identity).map(idOf),
    speaker_id: null, ground_truth_revision: GROUND_TRUTH_REVISION,
  }));
  const count = (f) => truth.filter(f).length;
  const distinct = (f) => new Set(truth.filter(f).map((r) => r.identity_id)).size;
  const summary = {
    total: truth.length,
    missing_canonical: count((r) => r.kind === "missing" && r.decoy_type === null),
    found_canonical: count((r) => r.kind === "found" && r.decoy_type === null),
    decoys: count((r) => r.decoy_type !== null),
    true_pairs: distinct((r) => r.role === "pair_query"),
    no_match_queries: count((r) => r.kind === "missing" && r.no_match),
    duplicate_links: new Set(truth.filter((r) => r.duplicate_group_id).map((r) => r.duplicate_group_id)).size,
    shared_phone_decoys: count((r) => r.decoy_type === "shared_phone"),
    // Denominators by identity (effective sample size is smaller than the record counts).
    no_match_identities: distinct((r) => r.kind === "missing" && r.no_match),
    pair_identities_with_duplicate_found: distinct((r) => r.role === "dup_found"),
    split_groups: groupNo.size,
    records_sharing_a_phone_across_identities: count((r) => r.phone_shared_with_other_identities.length > 0),
  };
  const expect = { total: 200, missing_canonical: 80, found_canonical: 80, decoys: 40, true_pairs: 60, no_match_queries: 20, duplicate_links: 25, shared_phone_decoys: 7, no_match_identities: 15, pair_identities_with_duplicate_found: 20 };
  for (const [k, v] of Object.entries(expect)) if (summary[k] !== v) throw new Error(`synthetic set: ${k} is ${summary[k]}, expected ${v}`);
  return {
    recordsJsonl: `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
    groundTruthJson: `${JSON.stringify({ ground_truth_revision: GROUND_TRUTH_REVISION, generator_revision: GENERATOR_REVISION, seed: SEED, synthetic: true, inputs: { districts_json_sha256: districtsSha256 }, counts: summary, records: truth }, null, 2)}\n`,
  };
}

export function outputs(districtData = loadDistrictData(), districtsSha256 = sha256(readFileSync(join(ROOT, "data", "districts.json")))) {
  const { recordsJsonl, groundTruthJson } = generate(districtData, districtsSha256);
  return {
    "records.jsonl": recordsJsonl,
    "ground_truth.json": groundTruthJson,
    "records.sha256": `${sha256(recordsJsonl)}  records.jsonl\n`,
    "ground_truth.sha256": `${sha256(groundTruthJson)}  ground_truth.json\n`,
  };
}

function main(argv) {
  const known = new Set(["--check"]);
  for (const a of argv) {
    if (a === "--") continue;
    if (!known.has(a)) { console.error(`synth: unknown argument ${a}`); process.exit(1); }
  }
  const files = outputs();
  if (argv.includes("--check")) {
    const stale = Object.entries(files).filter(([n, c]) => !existsSync(join(OUT, n)) || readFileSync(join(OUT, n), "utf8") !== c).map(([n]) => n);
    if (stale.length) { console.error(`synth --check: out of date: ${stale.join(", ")}`); process.exit(1); }
    console.log("synth --check: committed synthetic set matches the generator");
    return;
  }
  mkdirSync(OUT, { recursive: true });
  for (const [n, c] of Object.entries(files)) writeFileSync(join(OUT, n), c);
  console.log(`wrote ${Object.keys(files).length} files to data/synthetic (${files["ground_truth.sha256"].trim()})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
