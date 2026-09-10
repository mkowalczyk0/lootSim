import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const PORT = 5834;
const user = "measure" + Date.now();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(1000);
const regBtn = page.getByText(/register/i).first();
if (await regBtn.count()) await regBtn.click();
await page.waitForTimeout(300);
const inputs = page.locator("input");
await inputs.nth(0).fill(user);
await inputs.nth(1).fill("throwaway-pass-123");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /register|login|play|enter/i }).first().click();
await page.waitForTimeout(1500);

await page.goto(`http://localhost:${PORT}/?tower=28`);
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const c = document.getElementById("game");
  const dpr = window.devicePixelRatio;
  const rect = c.getBoundingClientRect();
  const dataUrl = c.toDataURL("image/png");
  return { dpr, cssW: rect.width, cssH: rect.height, canvasW: c.width, canvasH: c.height, dataUrl };
});
console.log("dpr", info.dpr, "css", info.cssW, info.cssH, "canvas backing", info.canvasW, info.canvasH);
const base64 = info.dataUrl.replace(/^data:image\/png;base64,/, "");
writeFileSync("/tmp/canvas-raw.png", Buffer.from(base64, "base64"));

await page.screenshot({ path: "/tmp/page-screenshot.png" });

await browser.close();
