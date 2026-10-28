// Chromium is required: npx playwright install chromium
import { mkdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startTipPreview } from "./tip-preview";

type Preview = Awaited<ReturnType<typeof startTipPreview>>;

let preview: Preview;
let browser: Browser;

async function visibleTipIds(page: Page): Promise<string[]> {
  return page.locator(".tip-pop").evaluateAll((els) =>
    els
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((el) => el.id),
  );
}

async function openPath(page: Page, path: string): Promise<void> {
  const response = await page.goto(`${preview.url}${path}`, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBe(200);
  await page.locator("h1").waitFor();
  expect(await visibleTipIds(page), path).toEqual([]);
  expect(await page.locator(".tip-btn[aria-expanded='true']").count(), path).toBe(0);
}

describe("info tips in the browser", () => {
  beforeAll(async () => {
    preview = await startTipPreview();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await preview?.close();
  });

  it("opens one tip at a time on savings, overview, revenue, and vendors", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const shots = process.env.TIP_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });

    for (const path of ["/", "/revenue", "/vendors", "/vendors/1001", "/funds/001", "/reserves"]) {
      await openPath(page, path);
    }

    await page.locator("#by-type").scrollIntoViewIfNeeded();
    if (shots) await page.screenshot({ path: `${shots}/savings-closed.png` });

    const legend = page.locator("#by-type .class-legend .tip-btn");
    expect(await legend.count()).toBeGreaterThan(1);
    const mark = legend.first();
    const box = await mark.boundingBox();
    expect(box?.width).toBeGreaterThan(18);
    expect(box?.width).toBeLessThan(22);
    expect(box?.height).toBeGreaterThan(18);
    expect(box?.height).toBeLessThan(22);
    const hit = await mark.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return { width: style.width, height: style.height };
    });
    expect(hit).toEqual({ width: "44px", height: "44px" });

    await mark.focus();
    expect(await visibleTipIds(page)).toEqual([]);

    await mark.hover();
    expect(await visibleTipIds(page)).toEqual(["tip-savings-committed"]);
    await page.locator(".page-intro").hover();
    expect(await visibleTipIds(page)).toEqual([]);

    await mark.click();
    expect(await visibleTipIds(page)).toEqual(["tip-savings-committed"]);
    await page.locator(".page-intro").hover();
    expect(await visibleTipIds(page)).toEqual(["tip-savings-committed"]);
    const pop = page.locator("#tip-savings-committed");
    const popStyle = await pop.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        width: el.getBoundingClientRect().width,
        text: el.textContent || "",
      };
    });
    expect(popStyle.fontSize).toBe("16px");
    expect(Number(popStyle.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(popStyle.color).toBe("rgb(255, 255, 255)");
    expect(popStyle.width).toBeLessThanOrEqual(280);
    expect(popStyle.text.length).toBeGreaterThan(20);
    expect(popStyle.text).not.toMatch(/\u2014|\u2013/);
    if (shots) await page.screenshot({ path: `${shots}/savings-one-open.png` });

    await legend.nth(1).click();
    expect(await visibleTipIds(page)).toEqual(["tip-savings-assigned"]);
    await page.locator("h1 .tip-btn").click();
    expect(await visibleTipIds(page)).toEqual(["tip-reserves-title"]);
    await page.locator(".page-intro").click();
    expect(await visibleTipIds(page)).toEqual([]);
    await page.locator("#by-type .stat-grid .tip-btn").first().click();
    const cardOpen = await visibleTipIds(page);
    expect(cardOpen).toHaveLength(1);
    expect(cardOpen[0]?.startsWith("tip-res-kpi-")).toBe(true);
    await page.locator(".page-intro").click();
    expect(await visibleTipIds(page)).toEqual([]);

    await mark.click();
    await page.keyboard.press("Escape");
    expect(await visibleTipIds(page)).toEqual([]);
    expect(await mark.evaluate((el) => document.activeElement === el)).toBe(true);

    await mark.click();
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForFunction(() => document.querySelectorAll(".tip-btn[aria-expanded='true']").length === 0);
    expect(await visibleTipIds(page)).toEqual([]);

    for (const path of ["/", "/revenue", "/vendors", "/vendors/1001"]) {
      await openPath(page, path);
      const buttons = page.locator(".tip-btn");
      expect(await buttons.count(), path).toBeGreaterThan(1);
      await buttons.nth(0).scrollIntoViewIfNeeded();
      await buttons.nth(0).click();
      const opened = await visibleTipIds(page);
      expect(opened, path).toHaveLength(1);
      await page.keyboard.press("Escape");
      expect(await visibleTipIds(page), path).toEqual([]);
      await buttons.nth(1).scrollIntoViewIfNeeded();
      await buttons.nth(1).click();
      const next = await visibleTipIds(page);
      expect(next, path).toHaveLength(1);
      expect(next[0], path).not.toBe(opened[0]);
      await page.keyboard.press("Escape");
      expect(await visibleTipIds(page), path).toEqual([]);
      if (shots) await page.screenshot({ path: `${shots}/${path.replaceAll("/", "") || "overview"}.png` });
    }

    await page.close();
  }, 60_000);

  it("opens one tip on a phone tap and none on load", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    for (const path of ["/", "/revenue", "/vendors", "/vendors/1001", "/reserves"]) {
      await openPath(page, path);
    }
    await page.locator("#by-type").scrollIntoViewIfNeeded();
    const shots = process.env.TIP_SHOTS;
    if (shots) await page.screenshot({ path: `${shots}/savings-mobile-closed.png` });
    await page.locator("#by-type .class-legend .tip-btn").first().tap();
    expect(await visibleTipIds(page)).toEqual(["tip-savings-committed"]);
    if (shots) await page.screenshot({ path: `${shots}/savings-mobile-one-open.png` });
    await page.locator("#by-type h2 .tip-btn").tap();
    expect(await visibleTipIds(page)).toEqual(["tip-res-labels"]);
    await page.locator("#by-type .eyebrow").tap();
    expect(await visibleTipIds(page)).toEqual([]);
    await page.locator("#by-type h2 .tip-btn").tap();
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForFunction(() => document.querySelectorAll(".tip-btn[aria-expanded='true']").length === 0);
    expect(await visibleTipIds(page)).toEqual([]);
    await context.close();
  }, 60_000);
});
