import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const PORT = 5834;
const user = "abtest" + Date.now();

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

// Confirm canvas geometry matches viewport 1:1 before trusting coordinate alignment.
const geom = await page.evaluate(() => {
  const c = document.getElementById("game");
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height, dpr: window.devicePixelRatio };
});
console.log("canvas geometry", JSON.stringify(geom));

let found = false;
for (let attempt = 0; attempt < 8 && !found; attempt++) {
  await page.goto(`http://localhost:${PORT}/?tower=28`);
  await page.waitForTimeout(2200);
  const alive = await page.evaluate(() => !document.body.innerText.includes("YOU DIED"));
  if (!alive) continue;

  // Capture BOTH, back to back, no waits between them.
  const shotBuf = await page.screenshot();
  const canvasData = await page.evaluate(() => document.getElementById("game").toDataURL("image/png"));

  writeFileSync(`/tmp/ab-screenshot-${attempt}.png`, shotBuf);
  writeFileSync(`/tmp/ab-canvas-${attempt}.png`, Buffer.from(canvasData.replace(/^data:image\/png;base64,/, ""), "base64"));
  console.log(`attempt ${attempt}: captured both`);
  found = true;
}

await browser.close();
