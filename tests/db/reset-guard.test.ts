import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { DEFAULT_DATABASE_URL, assertLocalDatabaseUrl, maskUrl, withDatabase } from "../../scripts/db/guard.mjs";

describe("db:reset guard", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://u:p@localhost:5432/postgres",
    "postgres://u:p@[::1]:5432/postgres",
    DEFAULT_DATABASE_URL,
  ])("accepts local %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow();
  });

  it.each([
    "postgresql://u:p@db.example.supabase.co:5432/postgres",
    "postgresql://u:p@10.0.0.5:5432/postgres",
    "postgresql://u:p@127.0.0.1.example.com:5432/postgres",
    "postgresql://u:p@localhost.attacker.test/postgres",
  ])("refuses non-local %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/non-local/);
  });

  it.each(["not a url", "", "mysql://u:p@localhost/db", "http://localhost:5432/postgres"])("refuses malformed %j", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow();
  });

  it("masks the password and swaps the database", () => {
    const url = assertLocalDatabaseUrl("postgresql://postgres:s3cret@127.0.0.1:54322/postgres");
    expect(maskUrl(url)).not.toContain("s3cret");
    expect(withDatabase(url, "fera").pathname).toBe("/fera");
  });
});
