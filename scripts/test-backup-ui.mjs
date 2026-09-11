import { chromium } from 'playwright';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/chokri/.gemini/antigravity/brain/39207a54-583a-4441-9f05-721e6aea4d12';

async function verifyUI() {
  console.log('Launching browser to verify Admin & Client UI...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // 1. Open Admin
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });

  // 2. Login if login view is visible
  const pwdInput = await page.$('#admin-pwd-input');
  if (pwdInput && await pwdInput.isVisible()) {
    console.log('Filling admin password...');
    await pwdInput.fill('mouna2024');
    await page.click('#admin-login-form button[type="submit"]');
    await page.waitForSelector('#admin-dashboard-view', { state: 'visible', timeout: 5000 });
  }

  await page.waitForTimeout(1000);

  // 3. Switch to Settings Section
  await page.click('.nav-item[data-target="section-settings"]');
  await page.waitForTimeout(1000);

  // 4. Capture Featured Deals Admin box
  const dealsBox = await page.$('.admin-form-box:has(#featured-deals-admin-grid)');
  if (dealsBox) {
    await dealsBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const dealsCards = await page.$$('#featured-deals-admin-grid > div');
    console.log(`Found ${dealsCards.length} featured deal cards rendered in the admin grid.`);
    await dealsBox.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_featured_deals_restored.png') });
    console.log('Saved admin_featured_deals_restored.png');
  }

  // 5. Capture Backup Section
  const backupBox = await page.$('.admin-form-box:has(#btn-export-backup)');
  if (backupBox) {
    await backupBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await backupBox.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_backup_section_restored.png') });
    console.log('Saved admin_backup_section_restored.png');
  }

  // 6. Navigate to Client Storefront
  console.log('Checking client storefront http://localhost:3000...');
  const clientPage = await context.newPage();
  await clientPage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await clientPage.waitForTimeout(1200);

  const promoSection = await clientPage.$('#promo-showcase-section');
  if (promoSection && await promoSection.isVisible()) {
    await promoSection.scrollIntoViewIfNeeded();
    await clientPage.waitForTimeout(400);
    const dealCards = await clientPage.$$('#deals-carousel-grid .mini-deal-card');
    console.log(`Found ${dealCards.length} deals in client showcase.`);
    await promoSection.screenshot({ path: path.join(ARTIFACTS_DIR, 'client_deals_showcase_restored.png') });
    console.log('Saved client_deals_showcase_restored.png');
  }

  await browser.close();
  console.log('UI verification completed successfully!');
}

verifyUI().catch(err => {
  console.error('UI verification failed:', err);
  process.exit(1);
});
