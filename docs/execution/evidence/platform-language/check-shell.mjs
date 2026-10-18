// Headless evidence for TASK-008 (not a project test; T022 adds the Playwright spec).
//
// Needs Google Chrome and playwright-core@1.56.1 installed in a scratch directory,
// never in the project:
//   mkdir /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright-core@1.56.1
// Then, from that directory, against `npm run build && npx next start -p 3108`:
//   EXPECT_SECURE=1 node <repo>/docs/execution/evidence/platform-language/check-shell.mjs http://localhost:3108 <outDir>
// For the DEMO_MODE=1 laptop stack (`DEMO_MODE=1 npx next start`), use EXPECT_SECURE=0.
// playwright-core is resolved from the current directory.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const { chromium } = createRequire(pathToFileURL(`${process.cwd()}/`))("playwright-core");
const [base = "http://localhost:3108", out = "."] = process.argv.slice(2);
const expectSecure = process.env.EXPECT_SECURE === "1";
const baseOrigin = new URL(base).origin;
mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const foreign = [];
async function newContext(browser, options) {
  const context = await browser.newContext(options);
  context.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== baseOrigin) foreign.push(url.href);
  });
  return context;
}

async function shellFacts(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const group = document.querySelector('[role="group"]');
    const buttons = [...group.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      const after = getComputedStyle(b, "::after");
      return {
        text: b.textContent,
        lang: b.lang,
        pressed: b.getAttribute("aria-pressed"),
        w: r.width,
        h: r.height,
        weight: getComputedStyle(b).fontWeight,
        bar: after.content !== "none" && after.height !== "auto" ? after.backgroundColor : null,
      };
    });
    const banner = document.querySelector("header section");
    const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
    return {
      lang: document.documentElement.lang,
      title: document.title,
      groupLabel: group.getAttribute("aria-label"),
      groupText: group.textContent.replace(/\s+/g, " ").trim(),
      buttons,
      banner: banner?.textContent.trim(),
      bannerLabel: banner?.getAttribute("aria-label"),
      bannerLive: banner ? banner.closest("[aria-live],[role=status],[role=alert]") !== null || banner.querySelector("[aria-live]") !== null : null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bnFont: document.fonts.check("18px notoBengali", "সিনথেটিক"),
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bodySize: getComputedStyle(document.body).fontSize,
      bodyLeading: getComputedStyle(document.body).lineHeight,
      bannerLeading: banner ? parseFloat(getComputedStyle(banner).lineHeight) / parseFloat(getComputedStyle(banner).fontSize) : 0,
      dangerOnRoot: css(document.documentElement, "--danger"),
      dangerInHeader: css(document.querySelector("header"), "--danger"),
      dangerInParent: css(document.querySelector('[data-surface="parent"]'), "--danger"),
    };
  });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // 1. Parent default: Bangla, mobile 360 px, JS on.
  const ctx = await newContext(browser, { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  let f = await shellFacts(page);
  check("default lang is bn", f.lang === "bn", f.lang);
  check('toggle reads "বাংলা | English"', f.groupText === "বাংলা | English", f.groupText);
  check("toggle group label in current language", f.groupLabel === "ভাষা", f.groupLabel);
  check("bn option pressed by default", f.buttons[0].pressed === "true" && f.buttons[1].pressed === "false");
  check("selected option: semibold plus a visible bar", f.buttons[0].weight === "600" && f.buttons[0].bar !== null && f.buttons[1].bar === null, `${f.buttons[0].weight}, ${f.buttons[0].bar}`);
  check("toggle options carry own lang", f.buttons[0].lang === "bn" && f.buttons[1].lang === "en");
  check("toggle targets >= 44x44 px", f.buttons.every((b) => b.w >= 44 && b.h >= 44), f.buttons.map((b) => `${b.w.toFixed(0)}x${b.h.toFixed(0)}`).join(", "));
  check("demo banner bn exact", f.banner === "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", f.banner);
  check("demo banner is a named region", f.bannerLabel === "ডেমো নোটিশ", f.bannerLabel);
  check("demo banner is not a live region", f.bannerLive === false);
  check("Bangla banner line-height >= 1.6", f.bannerLeading >= 1.6, f.bannerLeading.toFixed(2));
  check("Noto Sans Bengali loaded for Bangla", f.bnFont);
  check("parent body 18px / 1.7 in Bangla", f.bodySize === "18px" && f.bodyLeading === "30.6px", `${f.bodySize} / ${f.bodyLeading}`);
  check("parent surface is Paper", f.htmlBg === "rgb(246, 245, 244)", f.htmlBg);
  check("no --danger on root, header or parent surface", !f.dangerOnRoot && !f.dangerInHeader && !f.dangerInParent);
  check("no horizontal scroll at 360 px", f.overflowX <= 0, String(f.overflowX));
  await page.screenshot({ path: `${out}/platform-language-bn-360.png`, fullPage: true });

  // 2. Skip link: first Tab stop, >= 44 px, in flow above the header.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    const mark = document.querySelector("header a").getBoundingClientRect();
    return { text: a.textContent, href: a.getAttribute("href"), h: r.height, overlaps: r.bottom > mark.top && r.top < mark.bottom };
  });
  check("skip link is first, >= 44 px, not over the wordmark", skip.href === "#main" && skip.h >= 44 && !skip.overlaps, `${skip.text}, ${skip.h.toFixed(0)}px`);
  await page.screenshot({ path: `${out}/platform-language-skip-link-focused.png` });

  // 3. Keyboard: Tab to English, press Enter.
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
  check("toggle text and labels in en", f.groupText === "বাংলা | English" && f.groupLabel === "Language" && f.bannerLabel === "Demo notice");
  check("English body line-height 1.6", f.bodyLeading === "28.8px", f.bodyLeading);
  const cookie = (await ctx.cookies()).find((c) => c.name === "fera-lang");
  const days = cookie ? (cookie.expires - Date.now() / 1000) / 86400 : 0;
  check(
    `cookie fera-lang: en, path /, ~365 days, HttpOnly, Lax, Secure=${expectSecure}`,
    cookie?.value === "en" && cookie.path === "/" && days > 364 && days <= 365 && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.secure === expectSecure,
    JSON.stringify({ ...cookie, days: days.toFixed(2) }),
  );
  await page.screenshot({ path: `${out}/platform-language-en-360.png`, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  check("choice survives reload", (await page.evaluate(() => document.documentElement.lang)) === "en");

  // 4. 320 px reflow and 200 % root text in both languages.
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
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minH: Math.min(...b.map((r) => r.height)), minW: Math.min(...b.map((r) => r.width)) };
    });
    check(`${lang}: 200% text at 320 px, no horizontal scroll`, zoom.overflow <= 0, String(zoom.overflow));
    check(`${lang}: 200% text keeps targets >= 44 px`, zoom.minH >= 44 && zoom.minW >= 44, `${zoom.minW.toFixed(0)}x${zoom.minH.toFixed(0)}`);
    await page.screenshot({ path: `${out}/platform-language-${lang}-320-200pct.png`, fullPage: true });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await ctx.close();

  // 5. Desk surface switches the document (header included) to Cockpit.
  const deskCtx = await newContext(browser, { viewport: { width: 1280, height: 720 } });
  const deskPage = await deskCtx.newPage();
  await deskPage.goto(base, { waitUntil: "networkidle" });
  const desk = await deskPage.evaluate(() => {
    document.querySelector('[data-surface="parent"]').setAttribute("data-surface", "desk");
    const el = document.querySelector('[data-surface="desk"]');
    const pressed = document.querySelector('[aria-pressed="true"]');
    return {
      bg: getComputedStyle(document.documentElement).backgroundColor,
      danger: getComputedStyle(el).getPropertyValue("--danger").trim(),
      headerDanger: getComputedStyle(document.querySelector("header")).getPropertyValue("--danger").trim(),
      size: getComputedStyle(el).fontSize,
      bar: getComputedStyle(pressed, "::after").backgroundColor,
    };
  });
  check("desk surface renders Cockpit", desk.bg === "rgb(7, 8, 10)", desk.bg);
  check("desk has danger tokens; header outside it does not", desk.danger !== "" && desk.headerDanger === "", desk.danger);
  check("desk body 16px", desk.size === "16px", desk.size);
  check("Cockpit selected bar uses --text-strong", desk.bar === "rgb(244, 244, 246)", desk.bar);
  await deskPage.screenshot({ path: `${out}/platform-language-desk-cockpit-sim-1280.png` });
  await deskCtx.close();

  // 6. Without JavaScript the toggle still works (form POST to the Server Action).
  const noJs = await newContext(browser, { javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const p2 = await noJs.newPage();
  await p2.goto(base);
  await p2.getByRole("button", { name: "English" }).click();
  await p2.waitForLoadState("load");
  const noJsLang = await p2.evaluate(() => document.documentElement.lang);
  check("toggle works without JavaScript", noJsLang === "en", noJsLang);
  await noJs.close();

  check(`no requests to origins other than ${baseOrigin}`, foreign.length === 0, foreign.join(", "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
