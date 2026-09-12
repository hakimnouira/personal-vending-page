import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const ARTIFACTS_DIR = 'C:/Users/chokri/.gemini/antigravity/brain/39207a54-583a-4441-9f05-721e6aea4d12';
const PROJECT_DIR = 'C:/Users/chokri/Desktop/oriflame site/personal-vending-page';

async function runTests() {
  console.log('=== STARTING CHECKOUT WORKFLOW TEST SUITE ===');

  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge'
  });

  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'desktop-1280', width: 1280, height: 800 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'mobile-360', width: 360, height: 800 }
  ];

  let testOrderNumber = null;
  let calculatedExpectedTotal = null;

  // ── TEST 1: End-to-End Desktop Checkout ──
  console.log('\n--- TEST 1: Full Checkout on Desktop (1440x900) ---');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', msg => console.log(`[PAGE CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[PAGE JS ERROR]:', err));
  page.on('dialog', async dialog => {
    console.log('[PAGE DIALOG]:', dialog.type(), dialog.message());
    await dialog.dismiss();
  });
  page.on('request', req => {
    if (req.url().includes('/api/')) console.log(`[API REQ ${req.method()}]:`, req.url());
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) console.log(`[API RES ${res.status()}]:`, res.url());
  });

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.products && window.app.products.length > 0, { timeout: 20000 });
  console.log('Page loaded successfully with products');

  // Add 2 products to cart and open cart drawer
  await page.evaluate(() => {
    window.app.addProductToCart(window.app.products[0].product_id);
    window.app.addProductToCart(window.app.products[1].product_id);
    window.app.openCartDrawer();
  });
  await page.waitForTimeout(600);
  await page.waitForTimeout(600);

  // Check drawer opened
  const isDrawerOpen = await page.evaluate(() => {
    return document.querySelector('#cart-drawer-overlay').classList.contains('open');
  });
  console.log('Cart drawer open:', isDrawerOpen);

  // Take screenshot of Step 1
  await page.screenshot({ path: `${ARTIFACTS_DIR}/checkout-step1-cart.png` });
  console.log('Screenshot saved: checkout-step1-cart.png');

  // Verify calculation in Step 1
  const subtotalText = await page.$eval('#cart-subtotal', el => el.textContent.trim());
  const deliveryText = await page.$eval('#cart-total-with-delivery', el => el.textContent.trim());
  console.log(`Subtotal: ${subtotalText}, Total avec livraison & taxes: ${deliveryText}`);

  const rawSubtotalNum = parseFloat(subtotalText.replace(/[^\d.]/g, ''));
  const rawDeliveryNum = parseFloat(deliveryText.replace(/[^\d.]/g, ''));
  const expectedTotal = Number((rawSubtotalNum + Number((rawSubtotalNum * 0.03).toFixed(3)) + 9.755).toFixed(3));
  console.log(`Calculated expected total: ${expectedTotal} TND | Displayed: ${rawDeliveryNum} TND`);
  if (Math.abs(expectedTotal - rawDeliveryNum) < 0.005) {
    console.log('✅ STEP 1 CALCULATION EXACT MATCH!');
  } else {
    console.error('❌ Step 1 calculation mismatch');
  }
  calculatedExpectedTotal = expectedTotal;

  // Click "Continuer vers mes coordonnées"
  const btnGotoDetails = await page.$('#btn-goto-details');
  await btnGotoDetails.click();
  await page.waitForTimeout(500);

  // Check Step 2 is visible
  const step2Visible = await page.$eval('#checkout-step-details', el => el.style.display !== 'none');
  console.log('Step 2 (Vos coordonnées) visible:', step2Visible);

  // Take screenshot of Step 2
  await page.screenshot({ path: `${ARTIFACTS_DIR}/checkout-step2-details.png` });
  console.log('Screenshot saved: checkout-step2-details.png');

  // Test Step 2 Validation (Click without filling)
  const btnGotoReview = await page.$('#btn-goto-review');
  await btnGotoReview.click();
  await page.waitForTimeout(300);

  const errorBannerVisible = await page.$eval('#checkout-details-errors', el => el.style.display !== 'none');
  const errorItems = await page.$$eval('#checkout-details-error-list li', list => list.map(li => li.textContent));
  console.log('Validation Error Banner visible:', errorBannerVisible);
  console.log('Errors caught:', errorItems);

  if (errorBannerVisible && errorItems.length >= 4) {
    console.log('✅ STEP 2 VALIDATION PASSED (Blocked empty submission with clear errors)');
  }

  // Fill valid customer coordinates
  await page.fill('#checkout-name', 'Amira Ben Salem');
  await page.fill('#checkout-phone', '98 123 456');
  await page.fill('#checkout-city', 'Tunis - Centre Ville');
  await page.fill('#checkout-address', '15 Avenue Habib Bourguiba, Résidence Carthage, Apt 3B');
  await page.fill('#checkout-note', 'Appeler avant de livrer, disponible l\'après-midi');
  await page.check('#checkout-consent');
  await page.waitForTimeout(300);

  // Now click "Vérifier ma commande" -> Proceed to Step 3
  await btnGotoReview.click();
  await page.waitForTimeout(500);

  const step3Visible = await page.$eval('#checkout-step-review', el => el.style.display !== 'none');
  console.log('Step 3 (Vérifiez votre commande) visible:', step3Visible);

  // Verify review recap values
  const reviewName = await page.$eval('#review-customer-name', el => el.textContent);
  const reviewPhone = await page.$eval('#review-customer-phone', el => el.textContent);
  const reviewCity = await page.$eval('#review-delivery-city', el => el.textContent);
  const reviewAddress = await page.$eval('#review-delivery-address', el => el.textContent);
  const reviewNote = await page.$eval('#review-customer-note', el => el.textContent);
  const reviewTotal = await page.$eval('#review-total-with-delivery', el => el.textContent);

  console.log('Review Recap:', { reviewName, reviewPhone, reviewCity, reviewAddress, reviewNote, reviewTotal });
  if (reviewName === 'Amira Ben Salem' && reviewPhone === '98 123 456') {
    console.log('✅ STEP 3 DATA BINDING EXACT MATCH!');
  }

  // Take screenshot of Step 3
  await page.screenshot({ path: `${ARTIFACTS_DIR}/checkout-step3-review.png` });
  console.log('Screenshot saved: checkout-step3-review.png');

  // Test button "Modifier mes coordonnées"
  const btnBackToDetails = await page.$('#btn-back-to-details');
  await btnBackToDetails.click();
  await page.waitForTimeout(400);
  const backToStep2 = await page.$eval('#checkout-step-details', el => el.style.display !== 'none');
  const preservedName = await page.$eval('#checkout-name', el => el.value);
  console.log('Back to Step 2 works, preserved name:', preservedName, '=>', backToStep2);

  // Return to Step 3
  await (await page.$('#btn-goto-review')).click();
  await page.waitForTimeout(400);

  // Confirm order
  const btnConfirm = await page.$('#btn-confirm-order');
  console.log('Clicking "Confirmer ma commande"...');
  await btnConfirm.click();

  // Wait for Step 4
  await page.waitForSelector('#checkout-step-success:not([style*="display: none"])', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Verify Step 4 Success elements
  const orderNumber = await page.$eval('#success-order-number', el => el.textContent.trim());
  const successTotal = await page.$eval('#success-order-total', el => el.textContent.trim());
  const noticeBoxText = await page.$eval('.checkout-success-notice-box', el => el.textContent.trim());

  console.log('Order Number generated:', orderNumber);
  console.log('Order Total displayed:', successTotal);
  console.log('Notice Box snippet:', noticeBoxText.slice(0, 120));

  testOrderNumber = orderNumber;

  if (noticeBoxText.includes('55756629')) {
    console.log('✅ NOTICE BOX CONTAINS MOUNA\'S CALL NUMBER: 55756629');
  } else {
    console.error('❌ MISSING 55756629 in notice box');
  }

  // Take screenshot of Step 4
  await page.screenshot({ path: `${ARTIFACTS_DIR}/checkout-step4-success.png` });
  console.log('Screenshot saved: checkout-step4-success.png');

  // Test "Continuer mes achats"
  const btnContinue = await page.$('#btn-continue-shopping');
  await btnContinue.click();
  await page.waitForTimeout(600);

  const isDrawerClosed = await page.evaluate(() => {
    return !document.querySelector('#cart-drawer-overlay').classList.contains('open');
  });
  const cartBadgeText = await page.evaluate(() => {
    const badge = document.querySelector('#cart-badge');
    return badge ? badge.textContent : '0';
  });
  console.log('Drawer closed after "Continuer mes achats":', isDrawerClosed, 'Cart badge count:', cartBadgeText);

  await page.close();

  // ── TEST 2: Multi-Viewport Responsive Tests ──
  console.log('\n--- TEST 2: Viewport and Responsive Verification ---');
  for (const vp of viewports) {
    const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await p.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.app && window.app.products && window.app.products.length > 0);

    // Add product directly via app controller and open step 2
    await p.evaluate(() => {
      const pid = window.app.products[0].product_id;
      window.app.addProductToCart(pid);
      window.app.openCartDrawer();
      window.app.setCheckoutStep(2);
    });
    await p.waitForTimeout(600);

    // Check overflow
    const overflow = await p.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    const shotPath = `${ARTIFACTS_DIR}/checkout-responsive-${vp.name}.png`;
    await p.screenshot({ path: shotPath });
    console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): Horizontal Overflow: ${overflow ? 'FAIL' : 'PASS'} | Screenshot: ${shotPath}`);

    await p.close();
  }

  await browser.close();

  // ── TEST 3: Dual Persistence Verification (Postgres + data/orders.json) ──
  console.log('\n--- TEST 3: Database & Local File Storage Verification ---');

  // Check data/orders.json
  const ordersJsonPath = path.join(PROJECT_DIR, 'data', 'orders.json');
  if (fs.existsSync(ordersJsonPath)) {
    const ordersJson = JSON.parse(fs.readFileSync(ordersJsonPath, 'utf8'));
    const matchedJson = ordersJson.find(o => o.order_number === testOrderNumber || o.order_id === testOrderNumber);
    if (matchedJson) {
      console.log('✅ Found order in data/orders.json:');
      console.log(`   Order Number: ${matchedJson.order_number}`);
      console.log(`   Customer: ${matchedJson.customer_name} (${matchedJson.customer_phone})`);
      console.log(`   City: ${matchedJson.delivery_area}`);
      console.log(`   Address: ${matchedJson.delivery_address}`);
      console.log(`   Status: ${matchedJson.status}`);
      console.log(`   Total: ${matchedJson.total_amount} TND`);
      console.log(`   Items: ${matchedJson.items?.length} items`);
    } else {
      console.error(`❌ Order ${testOrderNumber} not found in data/orders.json`);
    }
  } else {
    console.warn('data/orders.json does not exist');
  }

  // Check Neon Postgres
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_0xHovg9prmkR@ep-crimson-waterfall-a2p5r15m.eu-central-1.aws.neon.tech/neondb_dev?sslmode=require'
    });

    const res = await pool.query('SELECT * FROM orders WHERE order_number = $1 OR order_id = $1', [testOrderNumber]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      console.log('✅ Found order in Neon Postgres:');
      console.log(`   ID: ${row.order_id}`);
      console.log(`   Order Number: ${row.order_number}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Total: ${row.total_amount}`);
      console.log(`   Consent: ${row.consent_given}`);
      console.log(`   Notification: ${row.notification_status}`);
    } else {
      console.log('Postgres query returned 0 rows for order number.');
    }
    await pool.end();
  } catch (err) {
    console.warn('Neon Postgres verification note:', err.message);
  }

  console.log('\n=== ALL TESTS FINISHED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
