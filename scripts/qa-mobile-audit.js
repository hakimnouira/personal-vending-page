import { chromium } from 'playwright';

const resolutions = [
  { name: '360x800 (Galaxy S20/A51)', width: 360, height: 800 },
  { name: '375x812 (iPhone X/12 Mini)', width: 375, height: 812 },
  { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '412x915 (Galaxy S22+)', width: 412, height: 915 },
  { name: '430x932 (iPhone 14/15 Pro Max)', width: 430, height: 932 }
];

async function runComprehensiveQA() {
  console.log('================================================================');
  console.log('  AUDIT & TEST QA MOBILE EXHAUSTIF — SITE MOUNA NOUIRA (20 POINTS)');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const qaReport = {
    viewportsTested: resolutions.map(r => r.name),
    findings: [],
    checklist: {}
  };

  function addFinding(severity, category, location, cause, recommendation) {
    qaReport.findings.push({ severity, category, location, cause, recommendation });
  }

  // --- PARTIE 1 : TEST DÉTAILLÉ SUR LES 5 RÉSOLUTIONS MOBILES ---
  for (const res of resolutions) {
    console.log(`\n================================================================`);
    console.log(`📱 TEST VIEWPORT : ${res.name} (${res.width}x${res.height}px)`);
    console.log(`================================================================`);

    const page = await browser.newPage({ viewport: { width: res.width, height: res.height } });
    const consoleLogs = [];
    const pageErrors = [];
    page.on('console', msg => consoleLogs.push(msg.text()));
    page.on('pageerror', err => pageErrors.push(err.message));

    const startTime = Date.now();
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const loadTime = Date.now() - startTime;
    await page.waitForSelector('.btn-add-cart', { timeout: 15000 }).catch(() => null);

    // POINT 15 : Débordement horizontal strict
    const overflow = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const scrollW = document.documentElement.scrollWidth;
      const overEls = [];
      document.querySelectorAll('*').forEach(el => {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;
        const rect = el.getBoundingClientRect();
        if (rect.right > docW + 1 && !['HTML', 'BODY'].includes(el.tagName)) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            overEls.push({ tag: el.tagName, id: el.id, class: el.className ? String(el.className).slice(0, 40) : '', right: Math.round(rect.right), diff: Math.round(rect.right - docW) });
          }
        }
      });
      return { hasScroll: scrollW > docW, scrollW, docW, diff: scrollW - docW, overEls: overEls.slice(0, 5) };
    });

    console.log(`[Point 15 - Absence Scroll Horizontal] : ${overflow.hasScroll ? `❌ DÉBORDEMENT +${overflow.diff}px` : '✅ 0px débordement (scrollWidth = clientWidth)'}`);
    if (overflow.hasScroll) {
      addFinding('CRITIQUE', 'Absence de scroll horizontal', `${res.name} - document`, `Éléments dépassant le viewport : ${overflow.overEls.map(e => `<${e.tag} id="${e.id}"> (+${e.diff}px)`).join(', ')}`, `Appliquer overflow-x: clip et contraindre max-width: 100%`);
    }

    // POINT 1 : Header
    const headerInfo = await page.evaluate(() => {
      const h = document.querySelector('header.navbar');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      const style = window.getComputedStyle(h);
      const searchBtn = document.getElementById('btn-header-search');
      const cartBtn = document.getElementById('btn-header-cart');
      const menuBtn = document.getElementById('btn-mobile-menu');
      return {
        height: Math.round(r.height),
        position: style.position,
        hasSearch: Boolean(searchBtn),
        hasCart: Boolean(cartBtn),
        hasMenu: Boolean(menuBtn)
      };
    });
    console.log(`[Point 1 - Header] : Hauteur = ${headerInfo?.height}px, Position = ${headerInfo?.position}, Actions = ${headerInfo?.hasSearch && headerInfo?.hasCart && headerInfo?.hasMenu ? '✅ Complètes' : '❌ Incomplètes'}`);
    if (headerInfo && (headerInfo.height < 50 || headerInfo.height > 68)) {
      addFinding('MINEUR', 'Header', `header.navbar (${res.name})`, `Hauteur de ${headerInfo.height}px hors de la plage optimale (54-64px)`, `Ajuster les paddings de la navbar`);
    }

    // POINT 16 : Zones tactiles (< 40px)
    const smallTargets = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('button, a, input, select').forEach(el => {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0 || r.height === 0) return;
        // Ignore very small hidden or structural anchors if empty
        if (el.tagName === 'A' && !el.innerText.trim() && !el.querySelector('svg, img')) return;
        if (r.width < 40 || r.height < 40) {
          list.push({ tag: el.tagName, id: el.id, class: el.className ? String(el.className).slice(0, 30) : '', text: el.innerText ? el.innerText.trim().slice(0, 20) : '', w: Math.round(r.width), h: Math.round(r.height) });
        }
      });
      return list.slice(0, 8);
    });
    console.log(`[Point 16 - Zones Tactiles] : ${smallTargets.length === 0 ? '✅ Tous les contrôles interactifs >= 40px' : `⚠️ ${smallTargets.length} cibles sous 40px`}`);
    if (smallTargets.length > 0) {
      smallTargets.forEach(t => console.log(`   - <${t.tag.toLowerCase()} id="${t.id}"> "${t.text}" (${t.w}x${t.h}px)`));
      addFinding('MAJEUR', 'Boutons tactiles', `Éléments interactifs (${res.name})`, `Éléments avec dimension < 40px : ${smallTargets.map(t => `<${t.tag} id="${t.id}"> (${t.w}x${t.h}px)`).join(', ')}`, `Assigner min-width: 44px; min-height: 44px;`);
    }

    // POINT 19 : Performance de chargement
    console.log(`[Point 19 - Performance] : DOMContentLoaded = ${loadTime}ms`);
    if (loadTime > 5000) {
      addFinding('MAJEUR', 'Performance', `Chargement initial (${res.name})`, `Temps de chargement initial > 5000ms (${loadTime}ms)`, `Optimiser le préchargement des ressources critiques et assets.`);
    }

    await page.close();
  }

  // --- PARTIE 2 : TESTS FONCTIONNELS POINT PAR POINT (SUR MOBILE 390x844) ---
  console.log(`\n================================================================`);
  console.log(`🧪 TESTS FONCTIONNELS APPROFONDIS (iPhone 390x844px)`);
  console.log(`================================================================`);

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('.btn-add-cart', { timeout: 15000 }).catch(() => null);

  // POINT 2 : Navigation Hamburger & Liens
  console.log('\n--- POINT 2 : Navigation ---');
  const menuToggle = await page.$('#btn-mobile-menu');
  await menuToggle.click();
  await page.waitForTimeout(400);
  const isNavOpen = await page.evaluate(() => document.getElementById('nav-actions-menu').classList.contains('mobile-open'));
  console.log(`Ouverture Menu Hamburger : ${isNavOpen ? '✅ Fonctionnel' : '❌ Échec'}`);
  if (!isNavOpen) addFinding('MAJEUR', 'Navigation', '#nav-actions-menu', 'Le clic sur #btn-mobile-menu n\'ajoute pas .mobile-open', 'Vérifier l\'événement toggleMenu');
  
  // Vérifier les liens dans le menu
  const navLinks = await page.evaluate(() => {
    const menu = document.getElementById('nav-actions-menu');
    const links = menu ? Array.from(menu.querySelectorAll('a, select')).map(el => ({ tag: el.tagName, id: el.id, text: el.innerText ? el.innerText.trim() : '' })) : [];
    return links;
  });
  console.log(`Liens de navigation présents (${navLinks.length}) :`, navLinks.map(l => l.id || l.tag).join(', '));
  await menuToggle.click();
  await page.waitForTimeout(300);

  // POINT 3 : Recherche
  console.log('\n--- POINT 3 : Recherche ---');
  const searchInput = await page.$('#search-input');
  if (searchInput) {
    await searchInput.fill('parfum');
    await page.waitForTimeout(600);
    const searchCardsCount = await page.evaluate(() => document.querySelectorAll('#product-grid .product-card').length);
    console.log(`Recherche "parfum" : ${searchCardsCount} résultats affichés`);
    if (searchCardsCount === 0) {
      addFinding('MAJEUR', 'Recherche', '#search-input', 'Aucun produit retourné pour le terme générique "parfum"', 'Vérifier la fonction de filtrage searchProducts');
    }
    await searchInput.fill('');
    await page.waitForTimeout(600);
  } else {
    addFinding('CRITIQUE', 'Recherche', '#search-input', 'Champ de recherche absent du DOM', 'Intégrer #search-input');
  }

  // POINT 4 : Catégories
  console.log('\n--- POINT 4 : Catégories ---');
  const categoryPillsInfo = await page.evaluate(() => {
    const container = document.querySelector('.category-pills-container');
    const pills = document.querySelectorAll('.category-pill');
    return {
      exists: Boolean(container),
      count: pills.length,
      scrollable: container ? container.scrollWidth > container.clientWidth : false
    };
  });
  console.log(`Pills Catégories : ${categoryPillsInfo.count} pills, Scrollable horizontalement : ${categoryPillsInfo.scrollable ? '✅ Oui' : 'ℹ️ Non (s\'adapte)'}`);
  
  // Clic sur une catégorie
  const firstPill = await page.$('.category-pill:nth-child(2)');
  if (firstPill) {
    const pillText = await firstPill.innerText();
    await firstPill.click();
    await page.waitForTimeout(600);
    const catFilteredCount = await page.evaluate(() => document.querySelectorAll('#product-grid .product-card').length);
    console.log(`Filtrage catégorie "${pillText.trim()}" : ${catFilteredCount} produits affichés`);
    // Remise à "Tous"
    const allPill = await page.$('.category-pill:first-child');
    if (allPill) await allPill.click();
    await page.waitForTimeout(400);
  }

  // POINT 5 : Offres & Deal Carousel
  console.log('\n--- POINT 5 : Offres ---');
  const heroInfo = await page.evaluate(() => {
    const hero = document.querySelector('.hero-carousel-container');
    const dealBadge = document.querySelector('.hero-deal-badge, .hero-discount-pill');
    const dealBtn = document.querySelector('.btn-claim-deal, .hero-deal-btn');
    return {
      hasHero: Boolean(hero),
      hasBadge: Boolean(dealBadge),
      hasBtn: Boolean(dealBtn)
    };
  });
  console.log(`Hero Carousel Offres : Présent = ${heroInfo.hasHero ? '✅' : '❌'}, Badge Promo = ${heroInfo.hasBadge ? '✅' : 'ℹ️'}, Bouton Deal = ${heroInfo.hasBtn ? '✅' : 'ℹ️'}`);

  // POINT 6 : Fiches Produits
  console.log('\n--- POINT 6 : Fiches Produits ---');
  const productCardsInfo = await page.evaluate(() => {
    const cards = document.querySelectorAll('.product-card');
    if (cards.length === 0) return { count: 0 };
    const first = cards[0];
    const img = first.querySelector('.product-img');
    const title = first.querySelector('.product-title');
    const price = first.querySelector('.product-price');
    const oldPrice = first.querySelector('.product-old-price');
    return {
      count: cards.length,
      hasImg: Boolean(img && img.getAttribute('src')),
      hasTitle: Boolean(title && title.innerText.trim()),
      hasPrice: Boolean(price && price.innerText.trim()),
      hasOldPrice: Boolean(oldPrice),
      titleClamp: window.getComputedStyle(title).webkitLineClamp
    };
  });
  console.log(`Fiches Produits : ${productCardsInfo.count} cartes, Images = ${productCardsInfo.hasImg ? '✅' : '❌'}, Prix = ${productCardsInfo.hasPrice ? '✅' : '❌'}, Clamping Titre = ${productCardsInfo.titleClamp} lignes`);

  // POINT 7 : Ajouter au panier
  console.log('\n--- POINT 7 : Ajouter au panier ---');
  const addBtn = await page.$('.btn-add-cart');
  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(600);
    const toastPresent = await page.evaluate(() => Boolean(document.querySelector('.toast, .notification-toast')));
    console.log(`Ajout au panier tapé : Toast notification = ${toastPresent ? '✅ Détecté' : 'ℹ️ Non bloquant'}`);
  } else {
    addFinding('CRITIQUE', 'Ajouter au panier', '.btn-add-cart', 'Aucun bouton d\'ajout au panier dans le catalogue', 'Vérifier le rendu des cartes produits');
  }

  // POINT 8 : Panier & Tiroir (Drawer)
  console.log('\n--- POINT 8 : Panier & Tiroir ---');
  const cartBtn = await page.$('#floating-cart-btn');
  await cartBtn.click();
  await page.waitForTimeout(600);
  const cartDrawerDetails = await page.evaluate(() => {
    const overlay = document.getElementById('cart-drawer-overlay');
    const panel = document.querySelector('.drawer-panel');
    const items = document.querySelectorAll('.cart-item');
    const subtotal = document.getElementById('cart-subtotal')?.innerText;
    const btnPlus = document.querySelector('.btn-qty[data-action="increase"]');
    const btnMinus = document.querySelector('.btn-qty[data-action="decrease"]');
    const btnRemove = document.querySelector('.btn-remove-item');
    const panelStyle = panel ? window.getComputedStyle(panel) : null;
    return {
      isOpen: overlay ? overlay.classList.contains('open') : false,
      itemCount: items.length,
      subtotal,
      hasPlus: Boolean(btnPlus),
      hasMinus: Boolean(btnMinus),
      hasRemove: Boolean(btnRemove),
      panelWidth: panel ? panel.getBoundingClientRect().width : 0,
      isFullScreen: panelStyle ? panelStyle.width === '100vw' || panelStyle.width === '390px' : false
    };
  });
  console.log(`Tiroir Panier Ouvert : ${cartDrawerDetails.isOpen ? '✅ Oui' : '❌ Non'}, Articles = ${cartDrawerDetails.itemCount}, Sous-total = ${cartDrawerDetails.subtotal}`);
  console.log(`Contrôles Quantité : Plus = ${cartDrawerDetails.hasPlus ? '✅' : '❌'}, Moins = ${cartDrawerDetails.hasMinus ? '✅' : '❌'}, Supprimer = ${cartDrawerDetails.hasRemove ? '✅' : '❌'}`);

  // POINT 9 : Formulaire de commande
  console.log('\n--- POINT 9 : Formulaire de commande ---');
  const formAudit = await page.evaluate(() => {
    const nameInp = document.getElementById('customer-name');
    const phoneInp = document.getElementById('customer-phone');
    if (!nameInp || !phoneInp) return { exists: false };
    const nameStyle = window.getComputedStyle(nameInp);
    const phoneStyle = window.getComputedStyle(phoneInp);
    return {
      exists: true,
      nameFontSize: parseFloat(nameStyle.fontSize),
      phoneFontSize: parseFloat(phoneStyle.fontSize),
      nameHeight: nameInp.getBoundingClientRect().height,
      phoneHeight: phoneInp.getBoundingClientRect().height,
      nameInputmode: nameInp.getAttribute('inputmode'),
      phoneInputmode: phoneInp.getAttribute('inputmode'),
      hasAutocomplete: Boolean(nameInp.getAttribute('autocomplete') && phoneInp.getAttribute('autocomplete'))
    };
  });
  console.log(`Formulaire Coordonnées : Hauteur inputs = ${formAudit.nameHeight}px, Police = ${formAudit.nameFontSize}px (>=16px anti-zoom: ${formAudit.nameFontSize >= 16 ? '✅' : '❌'}), InputMode = ${formAudit.phoneInputmode}`);
  if (formAudit.nameFontSize < 16) {
    addFinding('MAJEUR', 'Formulaire de commande', '#customer-name, #customer-phone', 'Taille de police < 16px provoquant un auto-zoom Safari iOS', 'Définir font-size: 16px !important');
  }

  // Remplissage des coordonnées
  await page.fill('#customer-name', 'Mouna Test');
  await page.fill('#customer-phone', '21698765432');

  // POINT 10 : WhatsApp
  console.log('\n--- POINT 10 : WhatsApp ---');
  const phoneCheckoutBtn = await page.$('#btn-phone-checkout');
  if (phoneCheckoutBtn) {
    await phoneCheckoutBtn.click();
    await page.waitForTimeout(800);
    const successModalInfo = await page.evaluate(() => {
      const modal = document.getElementById('order-success-modal');
      const waLink = document.getElementById('btn-success-whatsapp');
      const modalOpen = modal && window.getComputedStyle(modal).display !== 'none';
      return {
        modalOpen,
        waHref: waLink ? waLink.getAttribute('href') : null
      };
    });
    console.log(`Commande Téléphone/WhatsApp : Modale Succès = ${successModalInfo.modalOpen ? '✅ Ouverte' : '❌ Non affichée'}`);
    console.log(`Lien WhatsApp généré : ${successModalInfo.waHref ? successModalInfo.waHref.slice(0, 50) + '...' : '❌ Aucun'}`);
    if (successModalInfo.waHref && !successModalInfo.waHref.includes('wa.me')) {
      addFinding('MAJEUR', 'WhatsApp', '#btn-success-whatsapp', 'Le lien WhatsApp ne respecte pas le format wa.me/216...', 'Corriger le format de l\'URL WhatsApp');
    }
    // Fermer la modale succès
    const closeSuccessBtn = await page.$('#btn-close-success-modal');
    if (closeSuccessBtn) await closeSuccessBtn.click();
    await page.waitForTimeout(400);
  }

  // POINT 11 : Messenger
  console.log('\n--- POINT 11 : Messenger ---');
  // Rouvrir panier pour tester Messenger
  await cartBtn.click();
  await page.waitForTimeout(400);
  const messengerCheckoutBtn = await page.$('#btn-messenger-checkout');
  const messengerHref = messengerCheckoutBtn ? await messengerCheckoutBtn.getAttribute('href') : null;
  console.log(`Bouton Checkout Messenger : Présent = ${Boolean(messengerCheckoutBtn) ? '✅' : '❌'}, Href = ${messengerHref ? messengerHref.slice(0, 45) + '...' : '❌ Aucun'}`);
  const closeDrawerBtn = await page.$('#btn-close-drawer');
  if (closeDrawerBtn) await closeDrawerBtn.click();
  await page.waitForTimeout(300);

  // POINT 12 : Catalogue Flipbook
  console.log('\n--- POINT 12 : Catalogue 150 pages ---');
  const flipbookInfo = await page.evaluate(() => {
    const section = document.getElementById('catalogue-section');
    const stage = document.querySelector('.ecat-book-stage');
    const pageDisplay = document.getElementById('ecat-page-display')?.innerText;
    const btnPrev = document.getElementById('btn-page-prev');
    const btnNext = document.getElementById('btn-page-next');
    return {
      hasSection: Boolean(section),
      hasStage: Boolean(stage),
      pageText: pageDisplay,
      btnPrevDisabled: btnPrev ? btnPrev.disabled : null,
      btnNextEnabled: btnNext ? !btnNext.disabled : null
    };
  });
  console.log(`Flipbook eCatalogue : Section = ${flipbookInfo.hasSection ? '✅' : '❌'}, Page courante = "${flipbookInfo.pageText}", Suivant actif = ${flipbookInfo.btnNextEnabled ? '✅' : '❌'}`);
  
  // Clic page suivante
  const nextBtn = await page.$('#btn-page-next');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(500);
    const newPageText = await page.evaluate(() => document.getElementById('ecat-page-display')?.innerText);
    console.log(`Navigation page suivante : Ancienne = "${flipbookInfo.pageText}" -> Nouvelle = "${newPageText}"`);
  }

  // POINT 13 : Chatbot (Widget Messenger Live)
  console.log('\n--- POINT 13 : Chatbot Live Widget ---');
  const chatTrigger = await page.$('#btn-toggle-messenger-chat');
  if (chatTrigger) {
    await chatTrigger.click();
    await page.waitForTimeout(400);
    const isChatOpen = await page.evaluate(() => document.getElementById('messenger-chat-box').classList.contains('open'));
    console.log(`Widget Chatbot : Déclencheur cliqué -> Ouvert = ${isChatOpen ? '✅' : '❌'}`);
    
    // Test quick replies
    const quickReplies = await page.$$('.chat-reply-btn');
    console.log(`Réponses rapides chatbot disponibles : ${quickReplies.length}`);

    // Test saisie message
    const chatInput = await page.$('#messenger-chat-input');
    const chatForm = await page.$('#messenger-chat-form');
    if (chatInput && chatForm) {
      await chatInput.fill('Bonjour, test QA mobile');
      await chatForm.dispatchEvent('submit');
      await page.waitForTimeout(400);
      const sentMsgCount = await page.evaluate(() => document.querySelectorAll('.chat-msg-sent').length);
      console.log(`Envoi de message dans le widget : ${sentMsgCount > 0 ? '✅ Message ajouté au fil' : '❌ Échec'}`);
    }

    const closeChatBtn = await page.$('#btn-close-messenger-chat');
    if (closeChatBtn) await closeChatBtn.click();
    await page.waitForTimeout(300);
  }

  // POINT 14 : Footer
  console.log('\n--- POINT 14 : Footer ---');
  const footerInfo = await page.evaluate(() => {
    const f = document.querySelector('footer');
    if (!f) return null;
    const link = f.querySelector('#footer-facebook-link');
    const rect = f.getBoundingClientRect();
    return {
      hasFooter: true,
      hasFbLink: Boolean(link),
      linkHeight: link ? Math.round(link.getBoundingClientRect().height) : 0,
      visible: rect.height > 0
    };
  });
  console.log(`Footer : Présent = ${footerInfo?.hasFooter ? '✅' : '❌'}, Lien Facebook = ${footerInfo?.hasFbLink ? '✅' : '❌'} (${footerInfo?.linkHeight}px)`);

  // POINT 17 : Modales (QuickView, About, Privacy)
  console.log('\n--- POINT 17 : Modales ---');
  const modalTest = await page.evaluate(async () => {
    // Test ouverture À Propos
    const aboutOverlay = document.getElementById('about-modal-overlay');
    if (aboutOverlay) aboutOverlay.classList.add('open');
    const isAboutOpen = aboutOverlay && window.getComputedStyle(aboutOverlay).visibility !== 'hidden';
    if (aboutOverlay) aboutOverlay.classList.remove('open');

    // Test QuickView
    const qvOverlay = document.getElementById('quickview-modal-overlay');
    if (qvOverlay) qvOverlay.classList.add('open');
    const isQvOpen = qvOverlay && window.getComputedStyle(qvOverlay).visibility !== 'hidden';
    if (qvOverlay) qvOverlay.classList.remove('open');

    return { isAboutOpen, isQvOpen };
  });
  console.log(`Modale À Propos : ${modalTest.isAboutOpen ? '✅ S\'affiche et se ferme' : '❌ Problème d\'affichage'}`);
  console.log(`Modale QuickView : ${modalTest.isQvOpen ? '✅ S\'affiche et se ferme' : '❌ Problème d\'affichage'}`);

  // POINT 18 : Orientation Paysage
  console.log('\n--- POINT 18 : Orientation Paysage (844x390) ---');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  const landscapeOverflow = await page.evaluate(() => {
    return {
      hasScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      docW: document.documentElement.clientWidth
    };
  });
  console.log(`Paysage (844x390) : Débordement = ${landscapeOverflow.hasScroll ? `❌ +${landscapeOverflow.scrollW - landscapeOverflow.docW}px` : '✅ 0px (scrollWidth = clientWidth)'}`);
  if (landscapeOverflow.hasScroll) {
    addFinding('MAJEUR', 'Orientation paysage', 'Orientation 844x390', 'Débordement horizontal en mode paysage', 'Assurer les flex-wraps et paddings');
  }

  // POINT 20 : Accessibilité
  console.log('\n--- POINT 20 : Accessibilité ---');
  const a11yInfo = await page.evaluate(() => {
    const missingAlt = Array.from(document.querySelectorAll('img:not([alt]), img[alt=""]')).length;
    const totalImg = document.querySelectorAll('img').length;
    const missingAriaBtn = Array.from(document.querySelectorAll('button:not([aria-label]):not([title])')).filter(b => !b.innerText.trim()).length;
    const h1Count = document.querySelectorAll('h1').length;
    const inputsWithoutLabel = Array.from(document.querySelectorAll('input:not([aria-label]):not([placeholder])')).length;
    return {
      totalImg,
      missingAlt,
      missingAriaBtn,
      h1Count,
      inputsWithoutLabel
    };
  });
  console.log(`Images sans alt : ${a11yInfo.missingAlt}/${a11yInfo.totalImg}`);
  console.log(`Boutons d'icônes sans aria-label/title : ${a11yInfo.missingAriaBtn}`);
  console.log(`Titres H1 : ${a11yInfo.h1Count}`);
  if (a11yInfo.missingAriaBtn > 0) {
    addFinding('MINEUR', 'Accessibilité', 'Boutons interactifs sans texte', `${a11yInfo.missingAriaBtn} boutons sans texte ni aria-label`, 'Ajouter aria-label="Descriptif"');
  }

  await page.close();
  await browser.close();

  console.log('\n================================================================');
  console.log(`RAPPORT FINAL QA : ${qaReport.findings.length} problème(s) identifié(s)`);
  console.log('================================================================\n');

  console.log(JSON.stringify(qaReport, null, 2));
}

runComprehensiveQA().catch(console.error);
