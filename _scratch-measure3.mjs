import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const PORT = 5834;
const user = "measure3" + Date.now();

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

// Try a few reloads until a Halo Fragment lands close to the hero without a fight starting.
for (let attempt = 0; attempt < 5; attempt++) {
  await page.goto(`http://localhost:${PORT}/?tower=28`);
  await page.waitForTimeout(2200);
  const alive = await page.evaluate(() => !document.body.innerText.includes("YOU DIED"));
  if (!alive) continue;
  const info = await page.evaluate(() => {
    const c = document.getElementById("game");
    return { dataUrl: c.toDataURL("image/png") };
  });
  const base64 = info.dataUrl.replace(/^data:image\/png;base64,/, "");
  writeFileSync(`/tmp/canvas-attempt-${attempt}.png`, Buffer.from(base64, "base64"));
  console.log(`attempt ${attempt}: saved, alive=${alive}`);
}

await browser.close();
