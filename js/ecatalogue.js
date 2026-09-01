// Interactive Oriflame Digital eCatalogue (Flipbook Viewer) Module with Direct Search & Table of Contents
import { TRANSLATIONS } from './i18n.js';

export class ECatalogueViewer {
  constructor(appInstance) {
    this.app = appInstance;
    this.currentSpread = 0;
    this.totalPages = 148;
    this.spreads = [];
    this.targetHighlightTimeout = null;

    this.init();
  }

  async init() {
    this.initDOM();
    await this.loadFlipbookData();
  }

  async loadFlipbookData() {
    try {
      const res = await fetch('/api/flipbook');
      const json = await res.json();
      if (json.success && json.data && Array.isArray(json.data.spreads) && json.data.spreads.length > 0) {
        this.spreads = json.data.spreads;
        this.totalPages = json.data.totalPages || 148;
        this.renderSpread();
        return;
      }
    } catch (e) {
      console.warn("Using offline fallback flipbook", e);
    }
  }

  initDOM() {
    this.container = document.getElementById('catalogueContainer');
    this.btnPrev = document.getElementById('catalogue-nav-prev');
    this.btnNext = document.getElementById('catalogue-nav-next');
    this.btnFirst = document.getElementById('catalogue-nav-first');
    this.btnLast = document.getElementById('catalogue-nav-last');
    this.pageIndicator = document.getElementById('catalogue-page-indicator');
    this.spreadTitle = document.getElementById('catalogue-spread-title');
    this.bookSpreadWrap = document.getElementById('catalogue-spread-wrap');

    // Search & Table of Contents elements
    this.searchInput = document.getElementById('ecat-search-input');
    this.searchClearBtn = document.getElementById('ecat-search-clear');
    this.searchDropdown = document.getElementById('ecat-search-dropdown');
    this.tocSelect = document.getElementById('catalogue-toc-select');

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnPrev) this.btnPrev.addEventListener('click', () => this.prevSpread());
    if (this.btnNext) this.btnNext.addEventListener('click', () => this.nextSpread());
    if (this.btnFirst) this.btnFirst.addEventListener('click', () => this.goToSpread(0));
    if (this.btnLast) this.btnLast.addEventListener('click', () => this.goToSpread(this.spreads.length - 1));

    // Table of Contents Category Selector
    if (this.tocSelect) {
      this.tocSelect.addEventListener('change', (e) => {
        const targetSpread = parseInt(e.target.value, 10);
        if (!isNaN(targetSpread)) {
          this.goToSpread(targetSpread);
        }
      });
    }

    // Direct Catalog Search
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.handleSearchInput(e.target.value);
      });

      this.searchInput.addEventListener('focus', (e) => {
        if (e.target.value.trim().length > 0) {
          this.handleSearchInput(e.target.value);
        }
      });
    }

    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        this.clearSearch();
      });
    }

    // Close Search Dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.searchDropdown && !e.target.closest('.ecat-search-box-wrap')) {
        this.searchDropdown.style.display = 'none';
      }
    });

    // Keyboard Arrow Navigation
    document.addEventListener('keydown', (e) => {
      // Ignore if user is currently typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      const container = document.getElementById('catalogueContainer');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
      if (isVisible) {
        if (e.key === 'ArrowLeft') {
          const isRTL = document.documentElement.dir === 'rtl';
          isRTL ? this.nextSpread() : this.prevSpread();
        } else if (e.key === 'ArrowRight') {
          const isRTL = document.documentElement.dir === 'rtl';
          isRTL ? this.prevSpread() : this.nextSpread();
        }
      }
    });

    // Touch Swipe Gesture Support for Smartphones
    const stage = document.getElementById('catalogueContainer') || this.bookSpreadWrap;
    if (stage) {
      let touchStartX = 0;
      let touchStartY = 0;
      stage.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      stage.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
          const isRTL = document.documentElement.dir === 'rtl';
          if (diffX > 0) {
            isRTL ? this.prevSpread() : this.nextSpread();
          } else {
            isRTL ? this.nextSpread() : this.prevSpread();
          }
        }
      }, { passive: true });
    }
  }

  handleSearchInput(rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();

    if (!this.searchDropdown) return;

    if (this.searchClearBtn) {
      this.searchClearBtn.style.display = query.length > 0 ? 'block' : 'none';
    }

    if (query.length === 0) {
      this.searchDropdown.style.display = 'none';
      this.searchDropdown.innerHTML = '';
      return;
    }

    const isArabic = document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl';
    const lang = isArabic ? 'ar' : (document.documentElement.lang === 'en' ? 'en' : 'fr');
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
    const currencyLabel = isArabic ? 'د.ت' : 'DT';

    // Search across all spreads and hotspots
    const results = [];
    const seenIds = new Set();

    for (let sIdx = 0; sIdx < this.spreads.length; sIdx++) {
      const spread = this.spreads[sIdx];
      const hotspots = spread.hotspots || [];

      for (let hIdx = 0; hIdx < hotspots.length; hIdx++) {
        const h = hotspots[hIdx];
        const prodId = String(h.id || '').toLowerCase();
        const prodName = String(h.name || '').toLowerCase();

        if (prodId.includes(query) || prodName.includes(query)) {
          const uniqueKey = `${h.id}-${sIdx}`;
          if (!seenIds.has(uniqueKey)) {
            seenIds.add(uniqueKey);
            results.push({
              spreadIndex: sIdx,
              hotspotIndex: hIdx,
              hotspot: h,
              spreadPages: spread.pages || []
            });
          }
        }

        if (results.length >= 15) break;
      }
      if (results.length >= 15) break;
    }

    if (results.length === 0) {
      this.searchDropdown.innerHTML = `
        <div class="ecat-search-no-results">
          ${dict.ecat_search_no_results || 'Aucun produit trouvé dans le catalogue'}
        </div>
      `;
      this.searchDropdown.style.display = 'block';
      return;
    }

    const headerText = (dict.ecat_search_results_count || '{count} produit(s) trouvé(s)').replace('{count}', results.length);

    let html = `<div class="ecat-search-dropdown-header">${headerText}</div>`;

    results.forEach(res => {
      const h = res.hotspot;
      const targetPage = h.pageNumber || res.spreadPages[0] || 1;
      const cleanHotspotId = String(h.id || '').replace(/\+.*$/, '').trim();
      const existing = this.app.products.find(p => 
        String(p.product_id) === cleanHotspotId || 
        (Array.isArray(p.variants) && p.variants.some(v => String(v.product_id) === cleanHotspotId))
      );
      const matchingVariant = existing && Array.isArray(existing.variants)
        ? existing.variants.find(v => String(v.product_id) === cleanHotspotId)
        : null;
      const thumb = h.image_url || matchingVariant?.image_url || existing?.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanHotspotId}%2f${cleanHotspotId}_1.png&MediaId=20989035&Version=1`;

      html += `
        <div class="ecat-search-item" data-spread="${res.spreadIndex}" data-hotspot="${res.hotspotIndex}" data-id="${cleanHotspotId}">
          <img src="${thumb}" alt="${h.name}" class="ecat-search-item-thumb" onerror="window.handleProductImgError(this)" />
          <div class="ecat-search-item-info">
            <div class="ecat-search-item-name" title="${h.name}">${h.name}</div>
            <div class="ecat-search-item-meta">
              <span class="ecat-search-item-ref">#${cleanHotspotId}</span>
              <span class="ecat-search-item-price">${Number(h.price).toFixed(3).replace(/\.?0+$/, '')} ${currencyLabel}</span>
            </div>
          </div>
          <span class="ecat-search-item-page">📄 Page ${targetPage}</span>
        </div>
      `;
    });

    this.searchDropdown.innerHTML = html;
    this.searchDropdown.style.display = 'block';

    // Bind item click events
    this.searchDropdown.querySelectorAll('.ecat-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const sIdx = parseInt(item.getAttribute('data-spread'), 10);
        const hIdx = parseInt(item.getAttribute('data-hotspot'), 10);
        const prodId = item.getAttribute('data-id');
        this.selectSearchResult(sIdx, hIdx, prodId);
      });
    });
  }

  selectSearchResult(spreadIndex, hotspotIndex, productId) {
    if (this.searchDropdown) this.searchDropdown.style.display = 'none';

    // Navigate to spread
    this.goToSpread(spreadIndex);

    // Highlight target hotspot pin
    setTimeout(() => {
      if (this.bookSpreadWrap) {
        const pins = this.bookSpreadWrap.querySelectorAll('.ecat-hotspot-pin');
        pins.forEach(pin => pin.classList.remove('ecat-hotspot-pin-target'));

        if (pins[hotspotIndex]) {
          pins[hotspotIndex].classList.add('ecat-hotspot-pin-target');
          if (this.targetHighlightTimeout) clearTimeout(this.targetHighlightTimeout);
          this.targetHighlightTimeout = setTimeout(() => {
            pins[hotspotIndex]?.classList.remove('ecat-hotspot-pin-target');
          }, 4500);
        }
      }

      // Automatically open Quick View product modal
      this.openHotspotModal(spreadIndex, hotspotIndex);
    }, 150);

    // Smooth scroll to catalogue if needed
    if (this.container) {
      this.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchInput.focus();
    }
    if (this.searchClearBtn) this.searchClearBtn.style.display = 'none';
    if (this.searchDropdown) {
      this.searchDropdown.style.display = 'none';
      this.searchDropdown.innerHTML = '';
    }
  }

  goToSpread(index) {
    if (index >= 0 && index < this.spreads.length) {
      this.currentSpread = index;
      this.renderSpread();
      this.updateTocSelect();
      if (this.app?.telemetry) {
        this.app.telemetry.trackEvent(`Browsed eCatalogue Spread ${index + 1}`);
      }
    }
  }

  updateTocSelect() {
    if (!this.tocSelect) return;
    const s = this.currentSpread;

    let targetVal = "0";
    if (s >= 68) targetVal = "68";
    else if (s >= 48) targetVal = "48";
    else if (s >= 31) targetVal = "31";
    else if (s >= 20) targetVal = "20";
    else if (s >= 13) targetVal = "13";
    else if (s >= 1) targetVal = "1";
    else targetVal = "0";

    this.tocSelect.value = targetVal;
  }

  prevSpread() {
    if (this.currentSpread > 0) {
      this.goToSpread(this.currentSpread - 1);
    }
  }

  nextSpread() {
    if (this.currentSpread < this.spreads.length - 1) {
      this.goToSpread(this.currentSpread + 1);
    }
  }

  renderSpread() {
    if (!this.spreads || this.spreads.length === 0) return;
    const spread = this.spreads[this.currentSpread];
    if (!spread || !this.bookSpreadWrap) return;

    const isArabic = document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl';
    const currencyLabel = isArabic ? 'د.ت' : 'DT';

    // Update Indicators
    if (this.pageIndicator) {
      const pageText = spread.pages.length === 1 ? `Page ${spread.pages[0]}` : `Pages ${spread.pages[0]} - ${spread.pages[1]}`;
      this.pageIndicator.textContent = `${pageText} / ${this.totalPages}`;
    }
    if (this.spreadTitle) {
      this.spreadTitle.textContent = spread.title;
    }

    // Update Nav Button Disabled States
    if (this.btnPrev) this.btnPrev.disabled = this.currentSpread === 0;
    if (this.btnNext) this.btnNext.disabled = this.currentSpread === this.spreads.length - 1;

    // Render HTML
    let contentHtml = '';

    const getImgSrc = (url) => {
      if (!url) return '';
      if (url.includes('ipaper.io')) {
        return `/api/flipbook/image?url=${encodeURIComponent(url)}`;
      }
      return url;
    };

    const formatPos = (val) => {
      if (val === undefined || val === null) return '0%';
      if (typeof val === 'number') return `${val}%`;
      if (typeof val === 'string') return (val.endsWith('%') || val.endsWith('px')) ? val : `${val}%`;
      return `${val}%`;
    };

    if (spread.spreadIndex === 0) {
      // Cover Page with Video
      contentHtml = `
        <div class="ecat-single-page-wrap">
          <img src="${getImgSrc(spread.images[0])}" alt="Catalogue Oriflame Couverture" class="ecat-page-img loaded" referrerpolicy="no-referrer" />
          
          <!-- Embedded Video Player Overlay -->
          ${spread.video ? `
            <div class="ecat-video-overlay">
              <video autoplay muted loop playsinline src="${spread.video}" class="ecat-video-element"></video>
            </div>
          ` : ''}

          <div class="ecat-cover-badge">
            <span>✨ CATALOGUE OFFICIEL EN COURS (08 2026)</span>
          </div>

          <!-- Cover Hotspots -->
          ${(spread.hotspots || []).map((h, idx) => `
            <div class="ecat-hotspot-pin" style="left: ${formatPos(h.left)}; top: ${formatPos(h.top)};" onclick="window.ecatViewer && window.ecatViewer.openHotspotModal(${this.currentSpread}, ${idx})" title="${h.name}">
              <span class="hotspot-pulse"></span>
              <span class="hotspot-icon">🛍️</span>
              <div class="hotspot-tooltip">
                <strong>${h.name}</strong>
                <div class="hotspot-tooltip-price">${Number(h.price).toFixed(3).replace(/\.?0+$/, '')} ${currencyLabel} ${h.original_price ? `<span style="text-decoration:line-through; opacity:0.6; font-size:0.75rem;">${Number(h.original_price).toFixed(3).replace(/\.?0+$/, '')}</span>` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      // Dual-page Spread with Hotspots
      const leftImg = getImgSrc(spread.images[0]);
      const rightImg = getImgSrc(spread.images[1] || spread.images[0]);

      contentHtml = `
        <div class="ecat-dual-spread-wrap">
          <div class="ecat-page-half left-page">
            <img src="${leftImg}" alt="Page ${spread.pages[0]}" class="ecat-page-img" loading="lazy" referrerpolicy="no-referrer" />
          </div>
          <div class="ecat-page-half right-page">
            <img src="${rightImg}" alt="Page ${spread.pages[1] || spread.pages[0]}" class="ecat-page-img" loading="lazy" referrerpolicy="no-referrer" />
          </div>

          <!-- Clickable Interactive Product Hotspots with Exact Index -->
          ${(spread.hotspots || []).map((h, idx) => `
            <div class="ecat-hotspot-pin" style="left: ${formatPos(h.left)}; top: ${formatPos(h.top)};" onclick="window.ecatViewer && window.ecatViewer.openHotspotModal(${this.currentSpread}, ${idx})" title="${h.name}">
              <span class="hotspot-pulse"></span>
              <span class="hotspot-icon">🛍️</span>
              <div class="hotspot-tooltip">
                <strong>${h.name}</strong>
                <div class="hotspot-tooltip-price">${Number(h.price).toFixed(3).replace(/\.?0+$/, '')} ${currencyLabel} ${h.original_price ? `<span style="text-decoration:line-through; opacity:0.6; font-size:0.75rem;">${Number(h.original_price).toFixed(3).replace(/\.?0+$/, '')}</span>` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    this.bookSpreadWrap.innerHTML = contentHtml;
  }

  openHotspotModal(spreadIdx, hotspotIdx) {
    const spread = this.spreads[spreadIdx];
    if (!spread || !spread.hotspots || !spread.hotspots[hotspotIdx]) return;
    const h = spread.hotspots[hotspotIdx];

    const prodId = String(h.id || '').replace(/\+.*$/, '').trim();

    // Check if prodId is an existing product or a variant of an existing concept product
    const existing = this.app.products.find(p => 
      String(p.product_id) === prodId || 
      (Array.isArray(p.variants) && p.variants.some(v => String(v.product_id) === prodId))
    );

    if (existing) {
      // If product has variants, open Quick View with the clicked variant pre-selected!
      this.app.openQuickView(existing.product_id, null, prodId);
      return;
    }

    // Official Oriflame Tunisia HD Product Packshot CDN URL fallback
    const officialOriflamePhoto = h.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;

    const targetProduct = {
      product_id: prodId,
      name: h.name,
      price: Number(h.price),
      original_price: h.original_price || null,
      is_promo: Boolean(h.original_price && h.original_price > h.price),
      discount_percent: h.original_price ? Math.round(((h.original_price - h.price) / h.original_price) * 100) : 0,
      category: h.category || 'Catalogue Oriflame',
      size: h.size || 'Format Officiel',
      suitable_for: 'Tous types de peaux • Produit certifié Oriflame Suède',
      description: h.description || `Article officiel Oriflame (${prodId}).`,
      image_url: officialOriflamePhoto,
      benefits: [
        "100% Produit authentique certifié par Mouna Nouira",
        "Formule haute qualité issue du catalogue officiel Oriflame Tunisie",
        "Disponible pour commande immédiate via Facebook Messenger"
      ],
      how_to_use: "Appliquer sur une peau propre selon les recommandations de la gamme.",
      ingredients: "Extraits botaniques suédois et principes actifs certifiés Oriflame.",
      in_stock: h.in_stock !== false
    };

    const existingIndex = this.app.products.findIndex(p => String(p.product_id) === targetProduct.product_id);
    if (existingIndex >= 0) {
      this.app.products[existingIndex] = { ...this.app.products[existingIndex], ...targetProduct };
    } else {
      this.app.products.push(targetProduct);
    }

    this.app.openQuickView(targetProduct.product_id, targetProduct);
  }
}
