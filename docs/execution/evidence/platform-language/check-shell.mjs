// Headless evidence for TASK-008. Usage: node check-shell.mjs <baseUrl> <outDir>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3108", out = "."] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function shellFacts(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const group = document.querySelector('[role="group"]');
    const buttons = [...group.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent, lang: b.lang, pressed: b.getAttribute("aria-pressed"), w: r.width, h: r.height };
    });
    const banner = document.querySelector("header p");
    return {
      lang: document.documentElement.lang,
      title: document.title,
      groupLabel: group.getAttribute("aria-label"),
      groupText: group.textContent.replace(/\s+/g, " ").trim(),
      buttons,
      banner: banner.textContent.trim(),
      bannerLive: banner.closest("[aria-live],[role=status],[role=alert]") !== null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bnFont: document.fonts.check("18px notoBengali", "সিনথেটিক"),
      fontFaces: [...document.fonts].map((f) => `${f.family}:${f.status}`),
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bodyFont: getComputedStyle(document.body).fontFamily,
      bodySize: getComputedStyle(document.body).fontSize,
      bodyLeading: getComputedStyle(document.body).lineHeight,
      parentDanger: getComputedStyle(document.querySelector('[data-surface="parent"]')).getPropertyValue("--danger"),
    };
  });
}

// 1. Parent default: Bangla, mobile 360 px, JS on.
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const external = [];
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:")) external.push(r.url());
});
await page.goto(base, { waitUntil: "networkidle" });
let f = await shellFacts(page);
check("default lang is bn", f.lang === "bn", f.lang);
check('toggle reads "বাংলা | English"', f.groupText === "বাংলা | English", f.groupText);
check("toggle group label in current language", f.groupLabel === "ভাষা", f.groupLabel);
check("bn option pressed by default", f.buttons[0].pressed === "true" && f.buttons[1].pressed === "false");
check("toggle options carry own lang", f.buttons[0].lang === "bn" && f.buttons[1].lang === "en");
check("toggle targets >= 44x44 px", f.buttons.every((b) => b.w >= 44 && b.h >= 44), f.buttons.map((b) => `${b.w.toFixed(0)}x${b.h.toFixed(0)}`).join(", "));
check("demo banner bn exact", f.banner === "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", f.banner);
check("demo banner is not a live region", !f.bannerLive);
check("Noto Sans Bengali loaded for Bangla", f.bnFont, f.fontFaces.join(" "));
check("parent body 18px / 1.7 in Bangla", f.bodySize === "18px" && f.bodyLeading === "30.6px", `${f.bodySize} / ${f.bodyLeading}`);
check("parent surface is Paper", f.htmlBg === "rgb(246, 245, 244)", f.htmlBg);
check("parent surface neutralises --danger", f.parentDanger.trim() === "", JSON.stringify(f.parentDanger));
check("no horizontal scroll at 360 px", f.overflowX <= 0, String(f.overflowX));
await page.screenshot({ path: `${out}/platform-language-bn-360.png`, fullPage: true });

// 2. Keyboard: Tab to English, press Enter.
await page.keyboard.press("Tab"); // skip link
await page.keyboard.press("Tab"); // wordmark
await page.keyboard.press("Tab"); // বাংলা
await page.keyboard.press("Tab"); // English
const focused = await page.evaluate(() => document.activeElement?.textContent);
check("keyboard reaches English option", focused === "English", focused);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 10000 });
f = await shellFacts(page);
check("html lang switches to en", f.lang === "en");
check("en option pressed after switch", f.buttons[1].pressed === "true" && f.buttons[0].pressed === "false");
check("demo banner en exact", f.banner === "Synthetic data · officer verification simulated", f.banner);
check("toggle still reads the same in en", f.groupText === "বাংলা | English" && f.groupLabel === "Language");
check("English body line-height 1.6", f.bodyLeading === "28.8px", f.bodyLeading);
const cookie = (await ctx.cookies()).find((c) => c.name === "fera-lang");
check("choice persisted in fera-lang cookie", cookie?.value === "en" && cookie.httpOnly && cookie.sameSite === "Lax", JSON.stringify(cookie));
await page.screenshot({ path: `${out}/platform-language-en-360.png`, fullPage: true });
await page.reload({ waitUntil: "networkidle" });
check("choice survives reload", (await page.evaluate(() => document.documentElement.lang)) === "en");

// 3. 320 px reflow and 200 % text size in both languages.
await page.setViewportSize({ width: 320, height: 640 });
for (const lang of ["en", "bn"]) {
  if (lang === "bn") {
    await page.getByRole("button", { name: "বাংলা" }).click();
    await page.waitForFunction(() => document.documentElement.lang === "bn");
  }
  const reflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${lang}: no horizontal scroll at 320 px`, reflow <= 0, String(reflow));
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const zoom = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="group"] button')].map((x) => x.getBoundingClientRect());
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minH: Math.min(...b.map((r) => r.height)) };
  });
  check(`${lang}: 200% text at 320 px has no horizontal scroll`, zoom.overflow <= 0, String(zoom.overflow));
  await page.screenshot({ path: `${out}/platform-language-${lang}-320-200pct.png`, fullPage: true });
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
}

// 4. Desk surface switches the document (header included) to Cockpit.
const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const deskPage = await deskCtx.newPage();
await deskPage.goto(base, { waitUntil: "networkidle" });
const desk = await deskPage.evaluate(() => {
  document.querySelector('[data-surface="parent"]').setAttribute("data-surface", "desk");
  const s = getComputedStyle(document.documentElement);
  return { bg: s.backgroundColor, danger: getComputedStyle(document.querySelector('[data-surface="desk"]')).getPropertyValue("--danger").trim(), size: getComputedStyle(document.querySelector('[data-surface="desk"]')).fontSize };
});
check("desk surface renders Cockpit", desk.bg === "rgb(7, 8, 10)", desk.bg);
check("desk keeps danger token (soft-fill use only)", desk.danger !== "", desk.danger);
check("desk body 16px", desk.size === "16px", desk.size);
await deskPage.screenshot({ path: `${out}/platform-language-desk-cockpit-sim-1280.png` });
await deskCtx.close();
check("no external (CDN) requests", external.length === 0, external.join(", "));
await ctx.close();

// 5. Without JavaScript the toggle still works (form POST to the Server Action).
const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
const p2 = await noJs.newPage();
await p2.goto(base);
await p2.getByRole("button", { name: "English" }).click();
await p2.waitForLoadState("load");
const noJsLang = await p2.evaluate(() => document.documentElement.lang);
check("toggle works without JavaScript", noJsLang === "en", noJsLang);
await noJs.close();

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
