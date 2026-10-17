// TASK-009: `npm run seed` loads the 64 districts and their adjacency into PostgreSQL.
// Runs under `npm run test:db` only (fresh per-run database); skipped in plain `npm test`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
import { connect, dbTestsEnabled, expectPgError } from "./support/db";

describe.skipIf(!dbTestsEnabled)("districts seed (TASK-009)", () => {
  let admin: Client;
  let app: Client;
  const data = loadDistrictData() as { districts: Array<{ code: number; lat: number; neighbours: number[] }> };
  const expectedEdges = data.districts.reduce((n, d) => n + d.neighbours.length, 0);

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
  });
  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it("loads 64 districts and the adjacency rows", async () => {
    const result = await seedDistricts(admin, data);
    expect(result).toEqual({ districts: 64, neighbours: expectedEdges });
    const d = await admin.query("SELECT count(*)::int AS n FROM districts");
    const n = await admin.query("SELECT count(*)::int AS n FROM district_neighbours");
    expect(d.rows[0].n).toBe(64);
    expect(n.rows[0].n).toBe(expectedEdges);
  });

  it("is idempotent and restores edited values: a second run changes no counts", async () => {
    await admin.query("UPDATE districts SET lat = 21.5 WHERE code = 14");
    await admin.query("DELETE FROM district_neighbours WHERE district_code = 14");
    await seedDistricts(admin, data);
    const d = await admin.query("SELECT count(*)::int AS n FROM districts");
    const n = await admin.query("SELECT count(*)::int AS n FROM district_neighbours");
    expect([d.rows[0].n, n.rows[0].n]).toEqual([64, expectedEdges]);
    const dhaka = await admin.query("SELECT lat::float AS lat FROM districts WHERE code = 14");
    expect(dhaka.rows[0].lat).toBe(data.districts.find((x) => x.code === 14)?.lat);
  });

  it("stores adjacency in both directions", async () => {
    const orphan = await admin.query(
      `SELECT count(*)::int AS n FROM district_neighbours a
       WHERE NOT EXISTS (SELECT 1 FROM district_neighbours b
                         WHERE b.district_code = a.neighbour_code AND b.neighbour_code = a.district_code)`,
    );
    expect(orphan.rows[0].n).toBe(0);
  });

  it("refuses to recode an existing code unless --allow-recode is given", async () => {
    await admin.query("UPDATE districts SET name_en = 'Renamed', name_bn = 'নামবদল' WHERE code = 1");
    await expect(seedDistricts(admin, data)).rejects.toThrow(/refusing to recode/);
    const untouched = await admin.query("SELECT name_en FROM districts WHERE code = 1");
    expect(untouched.rows[0].name_en).toBe("Renamed");
    await seedDistricts(admin, data, { allowRecode: true });
    const restored = await admin.query("SELECT name_en FROM districts WHERE code = 1");
    expect(restored.rows[0].name_en).toBe("Bagerhat");
  });

  it("rolls back completely when the runtime role tries to seed", async () => {
    await expectPgError(seedDistricts(app, data), "42501");
    const d = await admin.query("SELECT count(*)::int AS n FROM districts");
    const n = await admin.query("SELECT count(*)::int AS n FROM district_neighbours");
    expect([d.rows[0].n, n.rows[0].n]).toEqual([64, expectedEdges]);
  });

  it("is readable by the runtime role but not writable by it", async () => {
    const read = await app.query("SELECT count(*)::int AS n FROM districts");
    expect(read.rows[0].n).toBe(64);
    await expectPgError(app.query("UPDATE districts SET lat = 24 WHERE code = 1"), "42501");
    await expectPgError(app.query("DELETE FROM district_neighbours"), "42501");
    await expectPgError(
      app.query("INSERT INTO districts (code, name_en, name_bn, division_en, lat, lng) VALUES (1, 'x', 'y', 'z', 24, 90)"),
      "42501",
    );
  });
});
