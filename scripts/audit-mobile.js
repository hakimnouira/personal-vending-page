import { chromium } from 'playwright';

const viewports = [
  { name: 'Mobile 360x800 (Galaxy S20/A51)', width: 360, height: 800 },
  { name: 'Mobile 375x812 (iPhone X/12 Mini)', width: 375, height: 812 },
  { name: 'Mobile 390x844 (iPhone 12/13/14)', width: 390, height: 844 },
  { name: 'Mobile 393x873 (Pixel 7)', width: 393, height: 873 },
  { name: 'Mobile 412x915 (Galaxy S22+)', width: 412, height: 915 },
  { name: 'Mobile 430x932 (iPhone 14/15 Pro Max)', width: 430, height: 932 },
  { name: 'Landscape 844x390 (iPhone Landscape)', width: 844, height: 390 },
  { name: 'Tablet 768x1024 (iPad)', width: 768, height: 1024 },
  { name: 'Desktop 1920x1080 (FHD)', width: 1920, height: 1080 }
];

async function runAudit() {
  console.log('================================================================');
  console.log('       AUDIT COMPLET RESPONSIVE & MOBILE DU SITE MOUNA NOUIRA   ');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const allIssues = [];

  for (const vp of viewports) {
    console.log(`\n📱 Analyse Viewport : ${vp.name} (${vp.width}x${vp.height}px)`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // 1. Détection du débordement horizontal global
    const overflowInfo = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const overflowingElements = [];

      const all = document.querySelectorAll('*');
      for (const el of all) {
        // Ignore scripts, styles, hidden elements
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        
        // Element extends beyond right edge
        if (rect.right > docWidth + 2 && !['HTML', 'BODY'].includes(el.tagName)) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            overflowingElements.push({
              tag: el.tagName,
              id: el.id,
              className: el.className ? String(el.className).slice(0, 50) : '',
              rectRight: Math.round(rect.right),
              docWidth: docWidth,
              overflowAmount: Math.round(rect.right - docWidth)
            });
          }
        }
      }

      return {
        hasHorizontalScroll: scrollWidth > docWidth,
        scrollWidth,
        docWidth,
        diff: scrollWidth - docWidth,
        overflowingElements: overflowingElements.slice(0, 8)
      };
    });

    if (overflowInfo.hasHorizontalScroll) {
      console.log(`  ❌ DÉBORDEMENT HORIZONTAL DÉTECTÉ : scrollWidth=${overflowInfo.scrollWidth}px > clientWidth=${overflowInfo.docWidth}px (excès: +${overflowInfo.diff}px)`);
      if (overflowInfo.overflowingElements.length > 0) {
        console.log('     Éléments causant le débordement :');
        overflowInfo.overflowingElements.forEach(el => {
          console.log(`     - <${el.tag.toLowerCase()} id="${el.id}" class="${el.className}"> dépasse de ${el.overflowAmount}px`);
        });
      }
      allIssues.push({ viewport: vp.name, type: 'HORIZONTAL_OVERFLOW', details: overflowInfo });
    } else {
      console.log(`  ✅ Aucun débordement horizontal (scrollWidth = ${overflowInfo.scrollWidth}px = clientWidth)`);
    }

    // 2. Audit des zones tactiles (Boutons < 44x44px sur mobile)
    if (vp.width <= 480) {
      const smallTargets = await page.evaluate(() => {
        const smallButtons = [];
        const interactive = document.querySelectorAll('button, a, input, select');
        for (const el of interactive) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
          if (rect.width < 40 || rect.height < 40) {
            smallButtons.push({
              tag: el.tagName,
              id: el.id,
              text: el.innerText ? el.innerText.trim().slice(0, 25) : '',
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        }
        return smallButtons.slice(0, 10);
      });

      if (smallTargets.length > 0) {
        console.log(`  ⚠️  ${smallTargets.length} boutons/zones tactiles sous 40px de hauteur ou largeur :`);
        smallTargets.forEach(t => console.log(`     - <${t.tag.toLowerCase()} id="${t.id}"> "${t.text}" (${t.width}x${t.height}px)`));
        allIssues.push({ viewport: vp.name, type: 'SMALL_TOUCH_TARGETS', details: smallTargets });
      }
    }

    // 3. Audit du Header Mobile
    const headerAudit = await page.evaluate(() => {
      const header = document.querySelector('header.navbar');
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      const style = window.getComputedStyle(header);
      return {
        height: Math.round(rect.height),
        position: style.position,
        isSticky: style.position === 'sticky' || style.position === 'fixed'
      };
    });
    console.log(`  🔍 Header : Hauteur = ${headerAudit?.height}px, Position = ${headerAudit?.position}`);

    // 4. Audit du Panier Flottant & Badge
    const cartAudit = await page.evaluate(() => {
      const cartBtn = document.getElementById('floating-cart-btn');
      if (!cartBtn) return null;
      const rect = cartBtn.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
        right: Math.round(rect.right)
      };
    });
    console.log(`  🔍 Panier Flottant : ${cartAudit?.width}x${cartAudit?.height}px`);

    // 5. Audit du Catalogue Flipbook
    const flipbookAudit = await page.evaluate(() => {
      const toolbar = document.querySelector('.ecat-toolbar');
      const stage = document.querySelector('.ecat-book-stage');
      const searchBox = document.querySelector('.ecat-search-box-wrap');
      const quickOrder = document.querySelector('.quick-order-bar');
      return {
        stageWidth: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
        toolbarHeight: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : 0,
        hasSearchBox: Boolean(searchBox),
        hasQuickOrder: Boolean(quickOrder)
      };
    });
    console.log(`  🔍 eCatalogue Stage Width = ${flipbookAudit.stageWidth}px`);

    // 6. Audit Grille Produits
    const gridAudit = await page.evaluate(() => {
      const cards = document.querySelectorAll('.product-card');
      if (!cards || cards.length === 0) return { count: 0 };
      const firstCard = cards[0].getBoundingClientRect();
      return {
        count: cards.length,
        cardWidth: Math.round(firstCard.width),
        cardHeight: Math.round(firstCard.height)
      };
    });
    console.log(`  🔍 Cartes Produits : ${gridAudit.count} cartes, première carte = ${gridAudit.cardWidth}x${gridAudit.cardHeight}px`);

    await page.close();
  }

  await browser.close();

  console.log('\n================================================================');
  console.log(`AUDIT TERMINÉ : ${allIssues.length} anomalies identifiées à corriger.`);
  console.log('================================================================');
  return allIssues;
}

runAudit().catch(console.error);
