import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { LOCAL_ROLE_PASSWORDS, rolePasswordEnv } from "../../scripts/db/roles.mjs";

describe("rolePasswordEnv (TASK-062)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the local dev defaults for a local admin URL", () => {
    expect(rolePasswordEnv({})).toEqual(LOCAL_ROLE_PASSWORDS);
  });

  it("passes explicit passwords through without any URL check", () => {
    const env = { FERA_APP_DB_PASSWORD: "a".repeat(20), FERA_REDACTOR_DB_PASSWORD: "b".repeat(20), FERA_DB_ADMIN_URL: "postgresql://u:p@db.example.invalid/postgres" };
    expect(rolePasswordEnv(env)).toEqual({ FERA_APP_DB_PASSWORD: "a".repeat(20), FERA_REDACTOR_DB_PASSWORD: "b".repeat(20) });
  });

  it("treats an empty value as unset, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(rolePasswordEnv({ FERA_APP_DB_PASSWORD: "" }).FERA_APP_DB_PASSWORD).toBe(LOCAL_ROLE_PASSWORDS.FERA_APP_DB_PASSWORD);
    expect(warn).toHaveBeenCalledWith("FERA_APP_DB_PASSWORD is empty; treating it as unset");
  });

  it("never hands the local defaults to a non-local admin URL", () => {
    expect(() => rolePasswordEnv({ FERA_DB_ADMIN_URL: "postgresql://u:p@db.example.invalid/postgres" })).toThrow(/non-local/);
  });
});
