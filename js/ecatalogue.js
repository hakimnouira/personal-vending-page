// Interactive Oriflame Digital eCatalogue (Flipbook Viewer) Module

export class ECatalogueViewer {
  constructor(appInstance) {
    this.app = appInstance;
    this.currentSpread = 0;
    this.totalPages = 148;
    this.spreads = [];

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

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnPrev) this.btnPrev.addEventListener('click', () => this.prevSpread());
    if (this.btnNext) this.btnNext.addEventListener('click', () => this.nextSpread());
    if (this.btnFirst) this.btnFirst.addEventListener('click', () => this.goToSpread(0));
    if (this.btnLast) this.btnLast.addEventListener('click', () => this.goToSpread(this.spreads.length - 1));

    // Keyboard Arrow Navigation
    document.addEventListener('keydown', (e) => {
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
  }

  goToSpread(index) {
    if (index >= 0 && index < this.spreads.length) {
      this.currentSpread = index;
      this.renderSpread();
      if (this.app?.telemetry) {
        this.app.telemetry.trackEvent(`Browsed eCatalogue Spread ${index + 1}`);
      }
    }
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
            <div class="ecat-hotspot-pin" style="left: ${h.left}; top: ${h.top};" onclick="window.ecatViewer.openHotspotModal(${this.currentSpread}, ${idx})" title="${h.name}">
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
            <div class="ecat-hotspot-pin" style="left: ${h.left}; top: ${h.top};" onclick="window.ecatViewer.openHotspotModal(${this.currentSpread}, ${idx})" title="${h.name}">
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

    const prodId = String(h.id);
    const existing = this.app.products.find(p => String(p.product_id) === prodId);

    // Official Oriflame Tunisia HD Product Packshot CDN URL
    const officialOriflamePhoto = h.image_url || existing?.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;

    const targetProduct = {
      product_id: prodId,
      name: h.name,
      price: Number(h.price),
      original_price: h.original_price || (existing ? existing.original_price : null),
      is_promo: Boolean((h.original_price && h.original_price > h.price) || existing?.is_promo),
      discount_percent: h.original_price ? Math.round(((h.original_price - h.price) / h.original_price) * 100) : (existing?.discount_percent || 0),
      category: h.category || existing?.category || 'Catalogue Oriflame',
      size: h.size || existing?.size || 'Format Officiel',
      suitable_for: existing?.suitable_for || 'Tous types de peaux • Produit certifié Oriflame Suède',
      description: h.description || existing?.description || `Article officiel Oriflame (${prodId}).`,
      image_url: officialOriflamePhoto,
      benefits: existing?.benefits || [
        "100% Produit authentique certifié par Mouna Nouira",
        "Formule haute qualité issue du catalogue officiel Oriflame Tunisie",
        "Disponible pour commande immédiate via Facebook Messenger"
      ],
      how_to_use: existing?.how_to_use || "Appliquer sur une peau propre selon les recommandations de la gamme.",
      ingredients: existing?.ingredients || "Extraits botaniques suédois et principes actifs certifiés Oriflame.",
      in_stock: true
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
