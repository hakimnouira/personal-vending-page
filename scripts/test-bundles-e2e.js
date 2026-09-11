import { chromium } from 'playwright';

async function runBundlesTest() {
  console.log('=== LANCEMENT DU TEST END-TO-END CREATION PACKS ===');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--ignore-certificate-errors', '--allow-insecure-localhost']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  // 1. Ouvrir la page admin et se connecter
  console.log('1. Connexion au panneau Admin...');
  await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });

  // Si écran de connexion présent
  const loginInput = await page.$('#admin-pwd-input');
  if (loginInput && await loginInput.isVisible()) {
    console.log('   Saisie du mot de passe admin (#admin-pwd-input)...');
    await page.fill('#admin-pwd-input', 'mouna2024');
    await page.click('#admin-login-form button[type="submit"]');
  }

  await page.waitForSelector('#admin-dashboard-view', { state: 'visible', timeout: 12000 });
  console.log('   ✅ Tableau de bord admin affiché avec succès !');

  // 2. Aller dans la section Packs
  console.log('2. Navigation vers la section Packs & Offres Combinées...');
  await page.click('.nav-item[data-target="section-bundles"]');
  await page.waitForSelector('#section-bundles.active', { state: 'visible', timeout: 6000 });
  console.log('   ✅ Section Packs active et visible !');

  // 3. Création du Pack DUO
  console.log('3. Test Création Pack DUO (2 produits)...');
  await page.click('#btn-create-new-bundle');
  await page.waitForTimeout(400);

  await page.fill('#bundle-title-fr', 'Duo Soin Éclat Exceptionnel');
  await page.fill('#bundle-desc-fr', 'Le duo parfait pour revitaliser votre peau au quotidien.');
  
  // Attendre le picker de produits
  await page.waitForSelector('#bundle-product-picker-list > div', { state: 'visible', timeout: 8000 });
  
  // Sélectionner 2 produits dans le picker (en re-sélectionnant après chaque re-render)
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(300);
    const items = await page.$$('#bundle-product-picker-list > div');
    if (items.length > i) {
      await items[i].click();
    }
  }

  const chipsCount = await page.$eval('#bundle-selected-count', el => el.textContent.trim());
  console.log(`   Produits sélectionnés pour le Duo: ${chipsCount}`);

  await page.fill('#bundle-special-price', '59.90');
  await page.waitForTimeout(300);

  // Soumettre le formulaire
  console.log('   Envoi du formulaire Pack Duo...');
  await page.click('#btn-save-bundle');
  await page.waitForTimeout(1500);

  // Vérifier que le Pack Duo apparaît dans la liste
  const duoCard = await page.waitForSelector('.admin-bundle-card:has-text("Duo Soin Éclat Exceptionnel")', { timeout: 8000 });
  if (!duoCard) {
    throw new Error('❌ Le Pack Duo n\'apparaît pas dans la liste admin après enregistrement !');
  }
  console.log('   ✅ Pack Duo bien présent dans la liste Admin !');

  // 4. Création du Pack TRIO
  console.log('4. Test Création Pack TRIO (3 produits)...');
  await page.click('#btn-create-new-bundle');
  await page.waitForTimeout(400);

  await page.fill('#bundle-title-fr', 'Trio Beauté Prestige');
  await page.fill('#bundle-desc-fr', 'Trois indispensables d\'exception pour sublimer votre routine.');

  // Sélectionner 3 produits (en re-sélectionnant après chaque re-render)
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    const items = await page.$$('#bundle-product-picker-list > div');
    if (items.length > i) {
      await items[i].click();
    }
  }

  const trioCount = await page.$eval('#bundle-selected-count', el => el.textContent.trim());
  console.log(`   Produits sélectionnés pour le Trio: ${trioCount}`);

  await page.fill('#bundle-special-price', '109.90');
  await page.waitForTimeout(300);

  console.log('   Envoi du formulaire Pack Trio...');
  await page.click('#btn-save-bundle');
  await page.waitForTimeout(1500);

  // Vérifier que le Pack Trio apparaît dans la liste
  const trioCard = await page.waitForSelector('.admin-bundle-card:has-text("Trio Beauté Prestige")', { timeout: 8000 });
  if (!trioCard) {
    throw new Error('❌ Le Pack Trio n\'apparaît pas dans la liste admin après enregistrement !');
  }
  console.log('   ✅ Pack Trio bien présent dans la liste Admin !');

  // Capture écran Admin
  await page.screenshot({ path: 'assets/screenshots/admin_bundles_success.png', fullPage: false });
  console.log('   📸 Capture admin enregistrée: assets/screenshots/admin_bundles_success.png');

  // 5. Vérifier côté client (Frontend)
  console.log('5. Vérification côté Client (Frontend http://localhost:3000)...');
  const clientPage = await context.newPage();
  await clientPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  
  // Attendre l'initialisation de l'application cliente
  await clientPage.waitForFunction(() => window.app && window.app.cartManager && Array.isArray(window.app.cartManager.bundles) && window.app.cartManager.bundles.length > 0, { timeout: 10000 });
  await clientPage.waitForTimeout(1000);

  const showcaseVisible = await clientPage.isVisible('#bundles-showcase-section');
  console.log(`   Section showcase visible côté client: ${showcaseVisible}`);

  const clientDuo = await clientPage.$('.bundle-showcase-card:has-text("Duo Soin Éclat Exceptionnel")');
  const clientTrio = await clientPage.$('.bundle-showcase-card:has-text("Trio Beauté Prestige")');

  console.log(`   Pack Duo visible côté client: ${Boolean(clientDuo)}`);
  console.log(`   Pack Trio visible côté client: ${Boolean(clientTrio)}`);

  if (!clientDuo || !clientTrio) {
    throw new Error('❌ Les packs ne s\'affichent pas correctement sur la vitrine client !');
  }

  await clientPage.screenshot({ path: 'assets/screenshots/client_bundles_success.png', fullPage: false });
  console.log('   📸 Capture client enregistrée: assets/screenshots/client_bundles_success.png');

  console.log('\n======================================================');
  console.log('✅ TEST REUSSI A 100% : CREATION, LISTING ET AFFICHAGE');
  console.log('======================================================');

  await browser.close();
}

runBundlesTest().catch(err => {
  console.error('ERREUR TEST:', err);
  process.exit(1);
});
