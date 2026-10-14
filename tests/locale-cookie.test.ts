import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { setLocale } = await import("@/app/actions/locale");
const { getLocale } = await import("@/lib/locale-server");

function form(value?: string | Blob): FormData {
  const data = new FormData();
  if (value !== undefined) data.append("locale", value);
  return data;
}

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  vi.unstubAllEnvs();
});

describe("setLocale (ACT-030)", () => {
  it("writes a supported locale with the exact cookie options", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "");
    await setLocale(form("en"));
    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith("fera-lang", "en", {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
  });

  it("drops Secure on the DEMO_MODE laptop stack", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    await setLocale(form("bn"));
    expect(cookieStore.set).toHaveBeenCalledWith("fera-lang", "bn", expect.objectContaining({ secure: false }));
  });

  it.each([
    ["a File", form(new File(["en"], "en.txt"))],
    ["a missing value", form()],
    ["an unsupported code", form("fr")],
    ["a prototype name", form("__proto__")],
  ])("writes nothing for %s", async (_label, data) => {
    await setLocale(data);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("writes nothing when the argument is not FormData", async () => {
    await setLocale({ get: () => "en" } as unknown as FormData);
    await setLocale(undefined as unknown as FormData);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("getLocale", () => {
  it("reads the fera-lang cookie", async () => {
    cookieStore.get.mockReturnValue({ name: "fera-lang", value: "en" });
    await expect(getLocale()).resolves.toBe("en");
    expect(cookieStore.get).toHaveBeenCalledWith("fera-lang");
  });

  it.each([undefined, { value: "xx" }, { value: "constructor" }])("falls back to Bangla for %o", async (cookie) => {
    cookieStore.get.mockReturnValue(cookie);
    await expect(getLocale()).resolves.toBe("bn");
  });
});
