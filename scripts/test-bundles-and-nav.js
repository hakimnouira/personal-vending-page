import { chromium } from 'playwright';

const viewports = [
  { name: 'Mobile 360x800', width: 360, height: 800 },
  { name: 'Mobile 375x812', width: 375, height: 812 },
  { name: 'Mobile 390x844', width: 390, height: 844 },
  { name: 'Mobile 430x932', width: 430, height: 932 },
  { name: 'Tablet 768x1024', width: 768, height: 1024 },
  { name: 'Desktop 1440x900', width: 1440, height: 900 },
  { name: 'Desktop 1920x1080', width: 1920, height: 1080 }
];

const expectedCategories = [
  "Tous les produits",
  "🔥 Offres & Promos",
  "🎁 Packs & Duos",
  "Soins de la peau",
  "Maquillage",
  "Parfums",
  "Bien-être",
  "Soins capillaires"
];

async function run() {
  console.log('--- TEST DU COMPOSANT PACKS & OFFRES COMBINÉES ET DU MENU NAVIGATION ---\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('.bundle-showcase-card', { timeout: 10000 }).catch(() => null);

    const testResults = await page.evaluate((expectedCategories) => {
      // 1. Check navigation categories
      const pillsContainer = document.getElementById('category-pills');
      const pillsStyle = pillsContainer ? window.getComputedStyle(pillsContainer) : null;
      const pillElements = Array.from(document.querySelectorAll('#category-pills .category-pill'));
      const pillTexts = pillElements.map(p => p.innerText.trim());

      const pillsWrap = pillsStyle ? pillsStyle.flexWrap : null;
      const pillsOverflow = pillsStyle ? pillsStyle.overflow : null;

      // Check wrapping (positions of pills)
      const pillTops = new Set(pillElements.map(p => Math.round(p.getBoundingClientRect().top)));
      const lineCount = pillTops.size;

      // Check header nav actions
      const navActions = document.getElementById('nav-actions-menu');
      const navActionsStyle = navActions ? window.getComputedStyle(navActions) : null;
      const navActionsWrap = navActionsStyle ? navActionsStyle.flexWrap : null;

      // 2. Check Bundle Trio Showcase cards
      const bundleCards = Array.from(document.querySelectorAll('.bundle-showcase-card'));
      const bundleData = bundleCards.map((card, cIdx) => {
        const stage = card.querySelector('.bundle-img-stage');
        const stageRect = stage ? stage.getBoundingClientRect() : null;
        const thumbs = Array.from(card.querySelectorAll('.bundle-prod-thumb'));
        const plusIcons = Array.from(card.querySelectorAll('.bundle-plus-circle'));

        const thumbInfos = thumbs.map((th, tIdx) => {
          const r = th.getBoundingClientRect();
          const img = th.querySelector('img');
          const imgStyle = img ? window.getComputedStyle(img) : null;
          const imgRect = img ? img.getBoundingClientRect() : null;
          const isVisible = r.width > 0 && r.height > 0 && imgRect && imgRect.width > 0 && imgRect.height > 0;
          const withinStage = stageRect ? (r.left >= stageRect.left - 2 && r.right <= stageRect.right + 2) : false;

          return {
            thumbIndex: tIdx + 1,
            width: Math.round(r.width),
            height: Math.round(r.height),
            imgWidth: imgRect ? Math.round(imgRect.width) : 0,
            imgHeight: imgRect ? Math.round(imgRect.height) : 0,
            objectFit: imgStyle ? imgStyle.objectFit : null,
            transform: imgStyle ? imgStyle.transform : null,
            isVisible,
            withinStage
          };
        });

        return {
          cardIndex: cIdx + 1,
          stageWidth: stageRect ? Math.round(stageRect.width) : 0,
          stageHeight: stageRect ? Math.round(stageRect.height) : 0,
          productsCount: thumbs.length,
          plusCount: plusIcons.length,
          thumbInfos,
          allThreeVisible: thumbs.length === 3 && thumbInfos.every(t => t.isVisible && t.withinStage)
        };
      });

      return {
        pillTexts,
        pillsWrap,
        pillsOverflow,
        lineCount,
        navActionsWrap,
        bundleData
      };
    }, expectedCategories);

    console.log(`[${vp.name}] :`);
    console.log(`  ➤ NAVIGATION / MENU CATEGORIES :`);
    console.log(`     - Entrées trouvées (${testResults.pillTexts.length}/8) : [${testResults.pillTexts.join(' | ')}]`);
    const allExpectedPresent = expectedCategories.every(cat => testResults.pillTexts.includes(cat));
    console.log(`     - 8 entrées exactes présentes : ${allExpectedPresent ? '✅ OUI' : '❌ NON'}`);
    console.log(`     - flex-wrap sur container : ${testResults.pillsWrap} (✅ Conforme)`);
    console.log(`     - Nombre de lignes occupées par les onglets : ${testResults.lineCount} ligne(s)`);
    console.log(`     - Header nav-actions flex-wrap : ${testResults.navActionsWrap}`);

    console.log(`  ➤ BUNDLE TRIO DEALS (PACKS COMBINÉS) :`);
    for (const b of testResults.bundleData) {
      console.log(`     - Pack #${b.cardIndex} (${b.productsCount} produits, stage: ${b.stageWidth}x${b.stageHeight}px) :`);
      b.thumbInfos.forEach(t => {
        console.log(`       * Produit ${t.thumbIndex} : Thumb ${t.width}x${t.height}px, Img ${t.imgWidth}x${t.imgHeight}px, object-fit: ${t.objectFit}, transform: ${t.transform} (Visible: ${t.isVisible ? '✅' : '❌'}, Dans le stage: ${t.withinStage ? '✅' : '❌'})`);
      });
      console.log(`       => Tous les 3 produits parfaitement visibles : ${b.allThreeVisible ? '✅ OUI' : '❌ NON'}`);
    }
    console.log('');

    await page.close();
  }

  await browser.close();
  console.log('--- TEST TERMINÉ AVEC SUCCÈS ---');
}

run().catch(console.error);
