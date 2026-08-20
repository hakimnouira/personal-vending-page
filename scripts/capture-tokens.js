import { chromium } from 'playwright';

async function captureLiveFlipbookTokens() {
  console.log("Launching headless browser to intercept live iPaper tokens...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const ipaperUrls = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('ipaper.io') || url.includes('Pages/')) {
      ipaperUrls.push(url);
      console.log("Intercepted Request:", url.slice(0, 180));
    }
  });

  try {
    const targetUrl = 'https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=1&store=TN-oriflame_1';
    console.log("Navigating to:", targetUrl);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForTimeout(5000);

    console.log("\n--- SUMMARY OF INTERCEPTED IPAPER URLS ---");
    console.log(`Total URLs captured: ${ipaperUrls.length}`);
    ipaperUrls.forEach(u => console.log(u));

  } catch (err) {
    console.error("Browser error:", err.message);
  } finally {
    await browser.close();
  }
}

captureLiveFlipbookTokens();
