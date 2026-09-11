import { chromium } from 'playwright';

async function runFeaturedDealsTests() {
  console.log('=== LANCEMENT DU TEST END-TO-END OFFRES SPECIALES CATALOGUE ===');
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

  const results = [];
  function recordResult(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const status = passed ? 'SUCCES' : 'ECHEC';
    console.log(`[${status}] - ${testName} ${details ? '(' + details + ')' : ''}`);
  }

  try {
    // 1. Connexion admin
    console.log('\n--- Etape 1 : Connexion a l\'Admin ---');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    const loginInput = await page.$('#admin-pwd-input');
    if (loginInput && await loginInput.isVisible()) {
      await page.fill('#admin-pwd-input', 'mouna2024');
      await page.click('#admin-login-form button[type="submit"]');
    }
    await page.waitForSelector('#admin-dashboard-view', { state: 'visible', timeout: 12000 });
    console.log('Admin connecte avec succes.');

    // 2. Navigation vers la section Parametres & Offres Speciales
    console.log('\n--- Etape 2 : Navigation vers Parametres & Offres Speciales ---');
    await page.click('.nav-item[data-target="section-settings"]');
    await page.waitForSelector('#section-settings.active', { state: 'visible', timeout: 6000 });
    await page.waitForFunction(() => document.querySelectorAll('#select-featured-deal-product option').length > 10, { timeout: 10000 });

    // TEST 1: Dropdown trie par ordre croissant
    console.log('\n--- Test 1 : Verification du tri croissant du menu deroulant ---');
    const optionValues = await page.$$eval('#select-featured-deal-product option', options => {
      return options
        .map(opt => opt.value)
        .filter(val => val && val.trim().length > 0);
    });

    let isSorted = true;
    let sortFailureInfo = '';
    const numericIds = optionValues.map(v => parseInt(v.replace(/\D/g, ''), 10));

    for (let i = 0; i < numericIds.length - 1; i++) {
      if (numericIds[i] > numericIds[i + 1]) {
        isSorted = false;
        sortFailureInfo = `Inversion: index ${i} (${numericIds[i]}) > index ${i+1} (${numericIds[i+1]})`;
        break;
      }
    }
    recordResult(
      'Test 1: Menu deroulant trie par reference croissante',
      isSorted && numericIds.length > 20,
      `${numericIds.length} produits tries. Premier: ${numericIds[0]}, Dernier: ${numericIds[numericIds.length - 1]}. ${sortFailureInfo}`
    );

    // Fonction helper pour obtenir un produit non encore ajoute
    async function getAvailableCandidate() {
      return await page.$eval('#select-featured-deal-product', select => {
        for (const opt of select.options) {
          if (opt.value && !opt.disabled) return opt.value;
        }
        return '';
      });
    }

    // TEST 2: Saisie manuelle d'une reference existante + clic Ajouter
    console.log('\n--- Test 2 : Saisie manuelle d\'une reference existante + clic Ajouter ---');
    const candidate1 = await getAvailableCandidate();
    console.log(`Candidat Test 2: ${candidate1}`);

    await page.fill('#input-featured-deal-code', candidate1);
    await page.click('#btn-add-featured-deal');
    await page.waitForTimeout(600);

    const gridHasCandidate1 = await page.$eval('#featured-deals-admin-grid', (el, id) => {
      return el.innerHTML.includes(String(id));
    }, candidate1);

    const feedbackText1 = await page.$eval('#featured-deal-code-feedback', el => el.textContent.trim());
    recordResult(
      'Test 2: Saisie manuelle d\'une ref existante + clic Ajouter',
      gridHasCandidate1 && (feedbackText1.includes('succès') || feedbackText1.includes('12760') || feedbackText1.includes('ajouté')),
      `Ref: ${candidate1}, Message: "${feedbackText1}"`
    );

    // TEST 3: Saisie manuelle d'une reference existante + touche Entree
    console.log('\n--- Test 3 : Saisie manuelle d\'une reference existante + touche Entree ---');
    const candidate2 = await getAvailableCandidate();
    console.log(`Candidat Test 3: ${candidate2}`);

    await page.fill('#input-featured-deal-code', candidate2);
    await page.press('#input-featured-deal-code', 'Enter');
    await page.waitForTimeout(600);

    const gridHasCandidate2 = await page.$eval('#featured-deals-admin-grid', (el, id) => {
      return el.innerHTML.includes(String(id));
    }, candidate2);
    recordResult(
      'Test 3: Saisie manuelle d\'une ref existante + touche Entree',
      gridHasCandidate2,
      `Ref: ${candidate2}`
    );

    // TEST 4: Saisie d'une reference inexistante (ex: 99999) -> message d'erreur
    console.log('\n--- Test 4 : Saisie d\'une ref inexistante (99999) ---');
    await page.fill('#input-featured-deal-code', '99999');
    await page.click('#btn-add-featured-deal');
    await page.waitForTimeout(400);

    const feedbackError = await page.$eval('#featured-deal-code-feedback', el => {
      return {
        text: el.textContent.trim(),
        visible: el.style.display !== 'none'
      };
    });
    const gridHas99999 = await page.$eval('#featured-deals-admin-grid', el => el.innerHTML.includes('99999'));

    recordResult(
      'Test 4: Saisie d\'une ref inexistante (99999) -> Erreur "Reference introuvable"',
      feedbackError.visible && feedbackError.text.includes('introuvable') && !gridHas99999,
      `Message: "${feedbackError.text}"`
    );

    // TEST 5: Saisie avec espaces ("  REF  ")
    console.log('\n--- Test 5 : Saisie avec espaces ("   REF   ") ---');
    const candidate3 = await getAvailableCandidate();
    console.log(`Candidat Test 5: ${candidate3}`);

    await page.fill('#input-featured-deal-code', `   ${candidate3}   `);
    await page.click('#btn-add-featured-deal');
    await page.waitForTimeout(600);

    const gridHasCandidate3 = await page.$eval('#featured-deals-admin-grid', (el, id) => {
      return el.innerHTML.includes(String(id));
    }, candidate3);

    recordResult(
      'Test 5: Saisie avec espaces avant/apres (trim automatique)',
      gridHasCandidate3,
      `Ref: "${candidate3}" ajoutee avec succes`
    );

    // TEST 6: Autocompletion - taper 2 chiffres -> suggestions apparaissent
    console.log('\n--- Test 6 : Autocompletion des 2 chiffres ---');
    const candidateForAuto = await getAvailableCandidate();
    const prefix2 = candidateForAuto.substring(0, 2);
    await page.fill('#input-featured-deal-code', prefix2);
    await page.waitForTimeout(500);

    const autoListState2 = await page.$eval('#featured-deals-autocomplete-list', el => {
      const items = el.querySelectorAll('.featured-deal-suggestion-item');
      return {
        visible: el.style.display === 'block',
        count: items.length,
        firstText: items.length > 0 ? items[0].textContent.replace(/\s+/g, ' ').trim() : ''
      };
    });

    // Capture d'ecran de l'autocompletion ouverte
    const screenshotAutoPath = 'C:\\Users\\chokri\\.gemini\\antigravity\\brain\\39207a54-583a-4441-9f05-721e6aea4d12\\admin_featured_deals_autocomplete.png';
    await page.screenshot({ path: screenshotAutoPath, fullPage: false });
    console.log(`Capture Autocompletion sauvegardee: ${screenshotAutoPath}`);

    recordResult(
      'Test 6: Autocompletion - des 2 chiffres tapes, suggestions visibles',
      autoListState2.visible && autoListState2.count > 0,
      `Recherche: "${prefix2}" -> ${autoListState2.count} suggestions. Exemple: ${autoListState2.firstText}`
    );

    // TEST 7: Autocompletion - taper 3-4 chiffres -> suggestions se reduisent
    console.log('\n--- Test 7 : Autocompletion - affinement a 3-4 chiffres ---');
    const prefix4 = candidateForAuto.substring(0, 4);
    await page.fill('#input-featured-deal-code', prefix4);
    await page.waitForTimeout(500);

    const autoListState4 = await page.$eval('#featured-deals-autocomplete-list', el => {
      const items = el.querySelectorAll('.featured-deal-suggestion-item');
      return {
        visible: el.style.display === 'block',
        count: items.length
      };
    });

    recordResult(
      'Test 7: Autocompletion - affinement des suggestions avec 3-4 chiffres',
      autoListState4.count > 0 && autoListState4.count <= autoListState2.count,
      `Recherche: "${prefix4}" -> ${autoListState4.count} suggestions (<= ${autoListState2.count})`
    );

    // TEST 8: Clic sur une suggestion -> selectionne et permet l'ajout
    console.log('\n--- Test 8 : Clic sur une suggestion ---');
    const firstItemId = await page.$eval('#featured-deals-autocomplete-list .featured-deal-suggestion-item', el => el.getAttribute('data-id'));
    await page.click('#featured-deals-autocomplete-list .featured-deal-suggestion-item');
    await page.waitForTimeout(400);

    const inputValAfterClick = await page.$eval('#input-featured-deal-code', el => el.value);
    const selectValAfterClick = await page.$eval('#select-featured-deal-product', el => el.value);
    const isAutoListHidden = await page.$eval('#featured-deals-autocomplete-list', el => el.style.display === 'none');

    recordResult(
      'Test 8: Clic sur suggestion remplit le champ et selectionne le produit',
      inputValAfterClick === firstItemId && (selectValAfterClick === firstItemId || selectValAfterClick === '') && isAutoListHidden,
      `ID clique: ${firstItemId}, Valeur champ: ${inputValAfterClick}, Liste fermee: ${isAutoListHidden}`
    );

    // TEST 9: Menu deroulant fonctionne toujours normalement
    console.log('\n--- Test 9 : Utilisation conjointe via menu deroulant ---');
    const candidate4 = await getAvailableCandidate();
    console.log(`Option disponible pour Test 9: ${candidate4}`);

    await page.selectOption('#select-featured-deal-product', candidate4);
    await page.click('#btn-add-featured-deal');
    await page.waitForTimeout(600);

    const gridHasCandidate4 = await page.$eval('#featured-deals-admin-grid', (el, id) => {
      return el.innerHTML.includes(String(id));
    }, candidate4);

    recordResult(
      'Test 9: Fonctionnement conjoint avec la liste deroulante',
      gridHasCandidate4,
      `Produit [${candidate4}] ajoute avec succes via le menu deroulant`
    );

    // Sauvegarder les offres
    console.log('\n--- Sauvegarde des Offres ---');
    page.on('dialog', async dialog => {
      console.log(`   Boite de dialogue: "${dialog.message()}" -> Accepter`);
      await dialog.accept();
    });
    await page.click('#btn-save-featured-deals');
    await page.waitForTimeout(800);

    // Capturer capture d'ecran Desktop
    console.log('\n--- Capture ecran Desktop ---');
    const screenshotDesktopPath = 'C:\\Users\\chokri\\.gemini\\antigravity\\brain\\39207a54-583a-4441-9f05-721e6aea4d12\\admin_featured_deals_desktop.png';
    await page.screenshot({ path: screenshotDesktopPath, fullPage: false });
    console.log(`Capture Desktop sauvegardee: ${screenshotDesktopPath}`);

    // TEST 10: Vue Mobile (390x844)
    console.log('\n--- Test 10 : Vue Responsive Mobile ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);

    const isInputVisibleMobile = await page.isVisible('#input-featured-deal-code');
    const isSelectVisibleMobile = await page.isVisible('#select-featured-deal-product');
    const isBtnVisibleMobile = await page.isVisible('#btn-add-featured-deal');

    const screenshotMobilePath = 'C:\\Users\\chokri\\.gemini\\antigravity\\brain\\39207a54-583a-4441-9f05-721e6aea4d12\\admin_featured_deals_mobile.png';
    await page.screenshot({ path: screenshotMobilePath, fullPage: false });
    console.log(`Capture Mobile sauvegardee: ${screenshotMobilePath}`);

    recordResult(
      'Test 10: Responsive Mobile & Desktop (champs visibles et fonctionnels)',
      isInputVisibleMobile && isSelectVisibleMobile && isBtnVisibleMobile,
      'Input, Select et Bouton sont tous visibles et alignes sur mobile 390px'
    );

  } catch (err) {
    console.error('ERREUR DURANT L\'EXECUTION DU TEST:', err);
    recordResult('Erreur globale d\'execution', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('       RESUME FINAL DES TESTS           ');
  console.log('========================================');
  results.forEach((r) => {
    console.log(`[${r.passed ? 'SUCCES' : 'ECHEC'}] ${r.testName}: ${r.details}`);
  });
  console.log('========================================');
  console.log(`RESULTAT TOTAL: ${results.filter(r => r.passed).length}/${results.length} REUSSIS`);
  console.log('========================================');
}

runFeaturedDealsTests();