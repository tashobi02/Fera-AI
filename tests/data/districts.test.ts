// TASK-009 / DEP-004 / A-013: the 64-district reference set that `npm run seed` loads.
// Synthetic-safe: district-level names and approximate centroids only, never a location
// of a person or case (DECISION-013). Pure data checks; no database needed.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { districtCodeSchema } from "@/contracts/primitives";
// @ts-expect-error -- plain ESM module without type declarations
import { DISTRICT_COUNT, buildNeighbourRows, loadDistrictData, validateDistricts } from "../../db/seed/districts.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { parseArgs } from "../../db/seed/index.mjs";

type District = {
  code: number; name_en: string; name_bn: string; division_en: string;
  lat: number; lng: number; neighbours: number[];
};
type Data = { districts: District[]; provenance: Record<string, string | null> };

const data = loadDistrictData() as Data;
const districts = data.districts;
const clone = (): Data => JSON.parse(JSON.stringify(data)) as Data;
const first = (d: Data): District => {
  const row = d.districts[0];
  if (!row) throw new Error("fixture has no districts");
  return row;
};

describe("district reference data (TASK-009)", () => {
  it("has exactly 64 districts with codes 1..64", () => {
    expect(DISTRICT_COUNT).toBe(64);
    expect(districts).toHaveLength(64);
    expect(districts.map((d) => d.code).sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    for (const d of districts) expect(districtCodeSchema.safeParse(d.code).success).toBe(true);
  });

  it("freezes the code-to-name mapping (codes are identifiers, never renumbered)", () => {
    const byCode = new Map(districts.map((d) => [d.code, d.name_en]));
    expect([byCode.get(1), byCode.get(14), byCode.get(64)]).toEqual(["Bagerhat", "Dhaka", "Thakurgaon"]);
    const sum = createHash("sha256").update(districts.map((d) => `${d.code}:${d.name_en}`).join("\n")).digest("hex");
    // A change here means a code now points at a different district: do it deliberately (--allow-recode).
    expect(sum).toBe("f23b4d65e91ea8db7c94ba0f79388b71da56f282d7b61a66290acf3d04614df8");
  });

  it("has unique, clean English and Bangla names", () => {
    expect(new Set(districts.map((d) => d.name_en)).size).toBe(64);
    expect(new Set(districts.map((d) => d.name_bn)).size).toBe(64);
    for (const d of districts) {
      expect(d.name_en.trim()).toBe(d.name_en);
      expect(d.name_en.length).toBeGreaterThan(2);
      expect(d.name_bn).toBe(d.name_bn.normalize("NFC"));
      // Bengali letters only: starts with a letter, no zero-width characters, no doubled or trailing hasanta.
      expect(d.name_bn).toMatch(/^[অ-হড়-য়][ঀ-৿]*$/u);
      expect(d.name_bn).not.toMatch(/্্|্$|[০-৯।॥]/u);
    }
  });

  it("groups the districts into the 8 divisions with the known sizes", () => {
    const sizes = new Map<string, number>();
    for (const d of districts) sizes.set(d.division_en, (sizes.get(d.division_en) ?? 0) + 1);
    expect(Object.fromEntries([...sizes].sort())).toEqual({
      Barishal: 6, Chattogram: 11, Dhaka: 13, Khulna: 10, Mymensingh: 4, Rajshahi: 8, Rangpur: 8, Sylhet: 4,
    });
  });

  it("keeps centroids inside Bangladesh's extent (tighter than the schema CHECK) at district precision", () => {
    for (const d of districts) {
      expect(d.lat).toBeGreaterThanOrEqual(20.5);
      expect(d.lat).toBeLessThanOrEqual(26.7);
      expect(d.lng).toBeGreaterThanOrEqual(88);
      expect(d.lng).toBeLessThanOrEqual(92.8);
      // at most 2 decimals (~1 km): a district-level point, never a precise location (DECISION-013)
      expect(Math.round(d.lat * 100) / 100).toBe(d.lat);
      expect(Math.round(d.lng * 100) / 100).toBe(d.lng);
    }
  });

  it("has symmetric adjacency with no self-neighbour, no duplicates and no unknown codes", () => {
    const byCode = new Map(districts.map((d) => [d.code, d]));
    for (const d of districts) {
      expect(d.neighbours).not.toContain(d.code);
      expect(new Set(d.neighbours).size).toBe(d.neighbours.length);
      for (const n of d.neighbours) {
        const other = byCode.get(n);
        expect(other, `${d.name_en} -> unknown code ${n}`).toBeDefined();
        expect(other?.neighbours, `${other?.name_en} should list ${d.name_en}`).toContain(d.code);
      }
    }
  });

  it("gives every district a neighbour and connects the whole country", () => {
    const byCode = new Map(districts.map((d) => [d.code, d]));
    for (const d of districts) expect(d.neighbours.length, d.name_en).toBeGreaterThan(0);
    const seen = new Set<number>([1]);
    const stack = [1];
    for (let code = stack.pop(); code !== undefined; code = stack.pop()) {
      for (const n of byCode.get(code)?.neighbours ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    expect(seen.size).toBe(64);
  });

  it("leaves out the two pairs the review flagged as uncertain", () => {
    const code = (name: string) => districts.find((d) => d.name_en === name)?.code;
    const links = (a: string, b: string) => districts.find((d) => d.name_en === a)?.neighbours.includes(code(b) ?? -1);
    expect(links("Netrokona", "Sherpur")).toBe(false);
    expect(links("Faridpur", "Pabna")).toBe(false);
  });

  it("flattens to directed neighbour rows that match the schema (district <> neighbour)", () => {
    const rows = buildNeighbourRows(districts) as Array<[number, number]>;
    expect(rows.length).toBe(districts.reduce((n, d) => n + d.neighbours.length, 0));
    expect(rows.length).toBe(280);
    expect(rows.every(([a, b]) => a !== b)).toBe(true);
    expect(new Set(rows.map(([a, b]) => `${a}:${b}`)).size).toBe(rows.length);
  });

  it("states honestly where the data came from and that nobody has verified it", () => {
    const p = data.provenance;
    expect(p.status).toMatch(/unverified/i);
    expect(p.status).toMatch(/AI/);
    expect(p.verified_by).toBeNull();
    expect(p.source).toBeNull();
    expect(p.codes).toMatch(/Fera-internal/);
    expect(p.codes).toMatch(/frozen/i);
    expect(p.centroids).toMatch(/approximate/i);
    expect(p.neighbours).toMatch(/A-013/);
    expect(p.neighbours).toMatch(/unverified/i);
    expect(p.neighbours).not.toMatch(/team-compiled/i);
  });
});

describe("validateDistricts rejects malformed sets", () => {
  it("accepts the committed data", () => {
    expect(() => validateDistricts(data)).not.toThrow();
  });

  it("wrong count", () => {
    const d = clone(); d.districts.pop();
    expect(() => validateDistricts(d)).toThrow(/expected 64/);
  });

  it("duplicate name_en and name_bn", () => {
    const en = clone(); en.districts[1]!.name_en = first(en).name_en;
    expect(() => validateDistricts(en)).toThrow(/duplicate name_en/);
    const bn = clone(); bn.districts[1]!.name_bn = first(bn).name_bn;
    expect(() => validateDistricts(bn)).toThrow(/duplicate name_bn/);
  });

  it("bad or duplicate code", () => {
    const range = clone(); first(range).code = 65;
    expect(() => validateDistricts(range)).toThrow(/bad district code/);
    const dup = clone(); dup.districts[1]!.code = first(dup).code;
    expect(() => validateDistricts(dup)).toThrow(/duplicate district code/);
  });

  it("bad Bangla name: not NFC, trailing hasanta, zero-width, digits", () => {
    for (const bad of ["ঢা‍কা", "ঢাক্", "্ঢাকা", "ঢাকা১", "Dhaka"]) {
      const d = clone(); first(d).name_bn = bad;
      expect(() => validateDistricts(d), bad).toThrow(/name_bn/);
    }
    const nfd = clone(); first(nfd).name_bn = "ড়াকা"; // ড + nukta is the NFC form; decomposed ড়ো forms are fine
    expect(() => validateDistricts(nfd)).not.toThrow();
  });

  it("unknown division", () => {
    const d = clone(); first(d).division_en = "Atlantis";
    expect(() => validateDistricts(d)).toThrow(/division_en/);
  });

  it("lat/lng out of range or not a number", () => {
    const lat = clone(); first(lat).lat = 40;
    expect(() => validateDistricts(lat)).toThrow(/lat/);
    const lng = clone(); first(lng).lng = 99;
    expect(() => validateDistricts(lng)).toThrow(/lng/);
    const str = clone(); (first(str) as unknown as { lat: string }).lat = "24.5";
    expect(() => validateDistricts(str)).toThrow(/lat/);
  });

  it("self, duplicate, unknown and non-reciprocal neighbours", () => {
    const self = clone(); first(self).neighbours.push(first(self).code);
    expect(() => validateDistricts(self)).toThrow(/itself/);
    const dup = clone(); first(dup).neighbours.push(first(dup).neighbours[0]!);
    expect(() => validateDistricts(dup)).toThrow(/duplicate neighbour/);
    const unknown = clone(); first(unknown).neighbours.push(99);
    expect(() => validateDistricts(unknown)).toThrow(/unknown neighbour/);
    const asym = clone(); first(asym).neighbours = first(asym).neighbours.slice(1);
    expect(() => validateDistricts(asym)).toThrow(/reciprocal/);
    const none = clone(); first(none).neighbours = [];
    expect(() => validateDistricts(none)).toThrow(/neighbours missing/);
  });
});

describe("npm run seed arguments", () => {
  it("accepts none, --set demo|full and --allow-recode, with or without npm's --", () => {
    expect(parseArgs([])).toEqual({ set: null, allowRecode: false });
    expect(parseArgs(["--", "--set", "demo"])).toEqual({ set: "demo", allowRecode: false });
    expect(parseArgs(["--set=full", "--allow-recode"])).toEqual({ set: "full", allowRecode: true });
  });

  it("rejects an unknown flag, a missing or unknown set, and positional arguments", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--set"])).toThrow(/demo or full/);
    expect(() => parseArgs(["--set", "tiny"])).toThrow(/demo or full/);
    expect(() => parseArgs(["demo"])).toThrow(/unknown argument/);
  });
});
