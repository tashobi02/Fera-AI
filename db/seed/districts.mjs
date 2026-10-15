// TASK-009 (DEP-004, A-013): the 64-district reference set and its loader.
// Data lives in data/districts.json (district-level names and approximate centroids
// only — never a person or case location, DECISION-013). The loader needs the owner
// connection: fera_app has SELECT on these tables and nothing else (db/roles.sql).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DISTRICT_COUNT = 64;
const DATA_PATH = fileURLToPath(new URL("../../data/districts.json", import.meta.url));
const LAT = [20, 27]; // districts.lat CHECK
const LNG = [88, 93]; // districts.lng CHECK
export const DIVISIONS = ["Barishal", "Chattogram", "Dhaka", "Khulna", "Mymensingh", "Rajshahi", "Rangpur", "Sylhet"];
// A Bengali-block name: starts with a letter; no digits, danda, doubled or trailing hasanta,
// and no zero-width characters (anything outside U+0980-09FF fails the class).
const BANGLA_NAME = /^[\u0985-\u09B9\u09DC-\u09DF](?:(?!\u09CD\u09CD)[\u0980-\u09E5\u09F0-\u09FF])*$/u;

export function loadDistrictData(path = DATA_PATH) {
  return validateDistricts(JSON.parse(readFileSync(path, "utf8")));
}

// Throws on the first problem; returns the data unchanged so callers can chain.
export function validateDistricts(data) {
  const list = data?.districts;
  if (!Array.isArray(list) || list.length !== DISTRICT_COUNT) {
    throw new Error(`expected ${DISTRICT_COUNT} districts, found ${Array.isArray(list) ? list.length : "none"}`);
  }
  const byCode = new Map();
  const en = new Set();
  const bn = new Set();
  for (const d of list) {
    if (!Number.isInteger(d.code) || d.code < 1 || d.code > DISTRICT_COUNT) throw new Error(`bad district code ${d.code}`);
    if (byCode.has(d.code)) throw new Error(`duplicate district code ${d.code}`);
    byCode.set(d.code, d);
    for (const [key, seen] of [["name_en", en], ["name_bn", bn]]) {
      if (typeof d[key] !== "string" || d[key].trim() === "") throw new Error(`district ${d.code}: ${key} is empty`);
      if (seen.has(d[key])) throw new Error(`duplicate ${key} ${d[key]}`);
      seen.add(d[key]);
    }
    if (d.name_bn !== d.name_bn.normalize("NFC") || !BANGLA_NAME.test(d.name_bn) || d.name_bn.endsWith("\u09CD")) {
      throw new Error(`district ${d.code}: name_bn is not a clean NFC Bengali name`);
    }
    if (!DIVISIONS.includes(d.division_en)) throw new Error(`district ${d.code}: unknown division_en ${d.division_en}`);
    if (typeof d.lat !== "number" || !(d.lat >= LAT[0] && d.lat <= LAT[1])) throw new Error(`district ${d.code}: lat ${d.lat} out of range`);
    if (typeof d.lng !== "number" || !(d.lng >= LNG[0] && d.lng <= LNG[1])) throw new Error(`district ${d.code}: lng ${d.lng} out of range`);
    if (!Array.isArray(d.neighbours) || d.neighbours.length === 0) throw new Error(`district ${d.code}: neighbours missing`);
  }
  for (const d of list) {
    if (new Set(d.neighbours).size !== d.neighbours.length) throw new Error(`district ${d.code}: duplicate neighbour`);
    for (const n of d.neighbours) {
      if (n === d.code) throw new Error(`district ${d.code} lists itself as a neighbour`);
      const other = byCode.get(n);
      if (!other) throw new Error(`district ${d.code}: unknown neighbour ${n}`);
      if (!other.neighbours.includes(d.code)) throw new Error(`adjacency is not symmetric (reciprocal missing): ${d.code} -> ${n}`);
    }
  }
  return data;
}

// Directed [district_code, neighbour_code] pairs, both directions stored (D2A ENTITY-011).
export function buildNeighbourRows(districts) {
  return districts.flatMap((d) => d.neighbours.map((n) => [d.code, n]));
}

// Idempotent: upserts the districts, then replaces the adjacency set, in one transaction.
// `client` is an already-connected pg client with write access (owner role) that is NOT
// already inside a transaction. Codes are frozen identifiers: if a code already exists
// with a different English name the seed refuses (cases and users reference the code)
// unless `allowRecode` is set.
export async function seedDistricts(client, data = loadDistrictData(), { allowRecode = false } = {}) {
  validateDistricts(data);
  const list = data.districts;
  const edges = buildNeighbourRows(list);
  const existing = await client.query("SELECT code, name_en FROM districts");
  const wanted = new Map(list.map((d) => [d.code, d.name_en]));
  const drift = existing.rows.filter((r) => wanted.has(r.code) && wanted.get(r.code) !== r.name_en);
  if (drift.length > 0 && !allowRecode) {
    throw new Error(`refusing to recode ${drift.length} existing district code(s) (first: ${drift[0].code}); codes are frozen. Pass --allow-recode only for a deliberate change`);
  }
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO districts (code, name_en, name_bn, division_en, lat, lng)
       SELECT * FROM unnest($1::smallint[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::numeric[])
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_bn = EXCLUDED.name_bn,
         division_en = EXCLUDED.division_en, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
      [list.map((d) => d.code), list.map((d) => d.name_en), list.map((d) => d.name_bn),
        list.map((d) => d.division_en), list.map((d) => d.lat), list.map((d) => d.lng)],
    );
    await client.query("DELETE FROM district_neighbours");
    await client.query(
      `INSERT INTO district_neighbours (district_code, neighbour_code)
       SELECT * FROM unnest($1::smallint[], $2::smallint[])`,
      [edges.map((e) => e[0]), edges.map((e) => e[1])],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return { districts: list.length, neighbours: edges.length };
}
