// Client-side Application Controller with Live Deals & Promos UI, Interactive eCatalogue Viewer, Rich Info Tabs & Telemetry
import { I18nManager } from './i18n.js';
import { CartManager } from './cart.js';
import { TelemetryTracker } from './telemetry.js';
import { ECatalogueViewer } from './ecatalogue.js';

export function getProductFallbackSvg(lang = 'fr') {
  const isAr = lang === 'ar';
  const isEn = lang === 'en';
  const mainText = isAr ? 'الصورة غير متوفرة حالياً' : (isEn ? 'Image not available' : 'Image non disponible');
  const subText = isAr ? 'أوريفلام تونس' : (isEn ? 'Oriflame Sweden' : 'Oriflame Tunisie');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FAF8F5"/>
        <stop offset="100%" stop-color="#F4ECE1"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGrad)" rx="16"/>
    <rect x="15" y="15" width="370" height="370" fill="none" stroke="#E5DEC9" stroke-width="2" stroke-dasharray="6 6" rx="12"/>
    <g transform="translate(200, 150)" fill="none" stroke="#C5A880" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="-35" y="-20" width="70" height="60" rx="8"/>
      <path d="M-15 -20 L-15 -35 L15 -35 L15 -20"/>
      <circle cx="0" cy="10" r="14"/>
      <line x1="-38" y1="42" x2="38" y2="-38" stroke="#E11D48" stroke-width="3"/>
    </g>
    <text x="200" y="245" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#475569" text-anchor="middle">${mainText}</text>
    <text x="200" y="270" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="#C5A880" letter-spacing="1.5" text-anchor="middle">${subText.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

window.handleProductImgError = function(img) {
  if (!img) return;
  img.onerror = null;
  const lang = (window.app && window.app.i18n) ? window.app.i18n.getLang() : 'fr';
  img.src = getProductFallbackSvg(lang);
  img.style.objectFit = 'contain';
  img.style.background = '#FAF8F5';
};

class App {
  constructor() {
    this.i18n = new I18nManager();
    this.cartManager = new CartManager(this.i18n);
    this.telemetry = new TelemetryTracker();

    this.activeCategory = 'All';
    this.fragranceFilters = {
      gender: 'All',
      formulation: 'All',
      family: 'All'
    };
    this.haircareFilters = {
      productType: 'All',
      hairType: 'All',
      concern: 'All'
    };
    this.skincareFilters = {
      'product-type': 'All',
      'skin-type': 'All',
      'benefits': 'All'
    };
    this.bodycareFilters = {
      'product-type': 'All',
      'need': 'All'
    };
    this.searchQuery = '';
    this.productsCurrentPage = 1;
    this.dealsCurrentPage = 1;
    this.products = [];
    this.facebookUsername = 'Mounanouira.Oriflame';
    this.whatsappPhone = '55756629';
    this.featuredDealIds = ['46980', '40683', '38557', '42751'];

    window.app = this;
    this.init();
  }

  async init() {
    console.log('[APP] init start');
    this.cacheDOM();
    this.i18n.applyTranslations();
    this.bindEvents();
    this.initMessengerWidget();
    this.initFacebookCheckout();
    console.log('[APP] events bound');

    try {
      console.log('[APP] fetching data...');
      await Promise.allSettled([
        this.fetchSettings(),
        this.fetchProducts(),
        (this.cartManager && typeof this.cartManager.fetchBundles === 'function') ? this.cartManager.fetchBundles() : Promise.resolve(),
        this.initCarousel()
      ]);
      console.log('[APP] data fetched, prods:', this.products?.length);
    } catch (e) {
      console.warn('[APP] fetch error:', e);
    }
    
    // Initialize Interactive Digital eCatalogue Flipbook
    try {
      window.ecatViewer = new ECatalogueViewer(this);
    } catch (e) {
      console.warn('[APP] ECatalogueViewer error:', e);
    }

    this.renderDealsShowcase();
    this.renderBundlesShowcase();
    this.handleUrlNavigationParams();
    this.renderProducts();
    if (this.activeCategory === 'Fragrance' && this.fragranceFiltersContainer) {
      this.fragranceFiltersContainer.style.display = 'block';
      this.updateFragranceFilterCounts();
    }
    if (this.activeCategory === 'Haircare' && this.haircareFiltersContainer) {
      this.haircareFiltersContainer.style.display = 'block';
      if (this.haircareBreadcrumb) this.haircareBreadcrumb.style.display = 'flex';
      this.updateHaircareFilterCounts();
    }
    if (this.activeCategory === 'Skincare' && this.skincareFiltersContainer) {
      this.skincareFiltersContainer.style.display = 'block';
      if (this.skincareBreadcrumb) this.skincareBreadcrumb.style.display = 'flex';
      this.updateSkincareFilterCounts();
    }
    if (this.activeCategory === 'BodyCare' && this.bodycareFiltersContainer) {
      this.bodycareFiltersContainer.style.display = 'block';
      if (this.bodycareBreadcrumb) this.bodycareBreadcrumb.style.display = 'flex';
      this.updateBodyCareFilterCounts();
    }
    this.updateGlobalNavigationUI();
    this.renderCart();
    this.updateCartBadge();
    console.log('[APP] init complete');
  }


  cleanPhoneNumber(input) {
    if (!input) return '55756629';
    let val = String(input).replace(/[^\d+]/g, '').trim();
    if (val.startsWith('+216')) val = val.substring(4);
    else if (val.startsWith('00216')) val = val.substring(5);
    else if (val.startsWith('216') && val.length > 8) val = val.substring(3);
    val = val.replace(/\D/g, '');
    return val || '55756629';
  }

  async fetchSettings() {
    let serverSuccess = false;
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        serverSuccess = true;
        if (data.data.facebook_username) {
          this.facebookUsername = data.data.facebook_username;
          const fbUrl = `https://www.facebook.com/${this.facebookUsername}`;
          const navFb = document.getElementById('btn-nav-facebook');
          if (navFb) navFb.href = fbUrl;
          const footerFb = document.getElementById('footer-facebook-link');
          if (footerFb) footerFb.href = fbUrl;
        }
        if (data.data.whatsapp_phone || data.data.phone) {
          this.whatsappPhone = this.cleanPhoneNumber(data.data.whatsapp_phone || data.data.phone);
        }
        if (data.data.featured_deal_ids && Array.isArray(data.data.featured_deal_ids)) {
          this.featuredDealIds = data.data.featured_deal_ids;
          try {
            localStorage.setItem('oriflame_featured_deals_v1', JSON.stringify(this.featuredDealIds));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("Could not fetch settings", e);
    }

    if (!serverSuccess) {
      try {
        const localSettings = JSON.parse(localStorage.getItem('oriflame_settings_v1') || '{}');
        if (localSettings.whatsapp_phone || localSettings.phone) {
          this.whatsappPhone = this.cleanPhoneNumber(localSettings.whatsapp_phone || localSettings.phone);
        }
        if (localSettings.facebook_username) {
          this.facebookUsername = localSettings.facebook_username;
        }
        if (localSettings.featured_deal_ids && Array.isArray(localSettings.featured_deal_ids)) {
          this.featuredDealIds = localSettings.featured_deal_ids;
        }
        const cachedDeals = localStorage.getItem('oriflame_featured_deals_v1');
        if (cachedDeals) {
          const parsedDeals = JSON.parse(cachedDeals);
          if (Array.isArray(parsedDeals) && parsedDeals.length > 0) {
            this.featuredDealIds = parsedDeals;
          }
        }
      } catch (err) {}
    }
  }

  cleanFbUsername(val) {
    if (!val) return 'Mounanouira.Oriflame';
    val = val.trim();
    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\/messages\/(e2ee\/)?t\//i, '');
    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\//i, '');
    val = val.replace(/^https?:\/\/m\.me\//i, '');
    val = val.split('/')[0].split('?')[0].trim();
    return val || 'Mounanouira.Oriflame';
  }

  getSwatchStyle(val, fallback = '#DE7B90') {
    if (!val) return `background-color: ${fallback};`;
    const s = String(val).trim();
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) {
      return `background-image: url('${s}'); background-size: cover; background-position: center; background-repeat: no-repeat; background-color: ${fallback};`;
    }
    if (s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl')) {
      return `background-color: ${s};`;
    }
    return `background-color: ${s};`;
  }

  formatDealTimeLeft(endDate, isArabic = false) {
    if (!endDate) return null;
    const expDate = new Date(endDate);
    const msLeft = expDate.getTime() - Date.now();
    if (msLeft <= 0) return null;
    const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((msLeft % (1000 * 60)) / 1000);

    if (days > 0) {
      return isArabic 
        ? `⏳ ينتهي خلال ${days} يوم و ${hours} ساعة` 
        : `⏳ Expire dans ${days}j ${hours}h ${minutes}m`;
    }
    return isArabic 
      ? `⏳ عرض محدود : ${hours} س ${minutes} د ${seconds} ث` 
      : `⏳ Offre Flash : ${hours}h ${minutes}m ${seconds}s`;
  }

  tickDealCountdowns() {
    const pills = document.querySelectorAll('.deal-countdown-pill[data-end-date]');
    if (!pills || pills.length === 0) return;
    const isArabic = this.i18n ? this.i18n.getLang() === 'ar' : false;
    pills.forEach(pill => {
      const end = pill.getAttribute('data-end-date');
      const formatted = this.formatDealTimeLeft(end, isArabic);
      if (formatted) {
        pill.textContent = formatted;
        pill.style.display = 'inline-flex';
      } else {
        pill.style.display = 'none';
      }
    });
  }

  applyDiscountOverrides(productsList) {
    if (!Array.isArray(productsList) || productsList.length === 0) return productsList;
    try {
      const overrides = JSON.parse(localStorage.getItem('oriflame_discount_overrides_v1') || '{}');
      if (Object.keys(overrides).length > 0) {
        productsList.forEach(p => {
          const ov = overrides[String(p.product_id)];
          if (ov) {
            Object.assign(p, ov);
          }
        });
      }
    } catch (e) {}
    return productsList;
  }

  async fetchProducts() {
    let prods = null;

    // 1. Try fetching from dynamic backend API
    try {
      const res = await fetch('/api/products');
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          prods = data.data;
        }
      }
    } catch (e) {}

    // 2. Check local storage cache
    if (!prods) {
      try {
        const cached = localStorage.getItem('oriflame_products_v1');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            prods = parsed;
          }
        }
      } catch (e) {}
    }

    // 3. Fallback: static JSON file
    if (!prods) {
      try {
        const res = await fetch('./data/products.json');
        if (res.ok) {
          const data = await res.json();
          const p = Array.isArray(data) ? data : (data.data || []);
          if (p.length > 0) prods = p;
        }
      } catch (e) {
        console.warn("Using offline catalog fallback", e);
      }
    }

    // 4. Set state & render
    if (prods) {
      try { localStorage.removeItem('oriflame_discount_overrides_v1'); } catch (e) {}
      this.products = prods;
      try { localStorage.setItem('oriflame_products_v1', JSON.stringify(this.products)); } catch (e) {}
      if (typeof this.populateCategoryList === 'function') {
        this.populateCategoryList();
      }
    }
  }

  async initCarousel() {
    this.carouselSlides = [];
    try {
      const res = await fetch('/api/carousel');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.carouselSlides = data.data.filter(s => s.active !== false);
      }
    } catch (e) {
      console.warn("Could not fetch carousel slides", e);
    }

    const section = document.getElementById('hero-carousel-section');
    if (!this.carouselSlides || this.carouselSlides.length === 0) {
      if (section) section.style.display = 'none';
      return;
    }

    if (section) section.style.display = 'block';
    this.currentSlideIndex = 0;
    this.renderCarousel();
    this.startCarouselAutoPlay();
    this.bindCarouselEvents();
  }

  renderCarousel() {
    const wrapper = document.getElementById('carousel-slides-wrapper');
    const dotsContainer = document.getElementById('carousel-dots-container');
    if (!wrapper || !dotsContainer) return;

    wrapper.innerHTML = '';
    dotsContainer.innerHTML = '';

    this.carouselSlides.forEach((slide, index) => {
      const slideEl = document.createElement('div');
      slideEl.className = `carousel-slide ${index === this.currentSlideIndex ? 'active' : ''}`;

      const hasOffer = slide.offer_price && slide.offer_price.trim().length > 0;

      slideEl.innerHTML = `
        <div class="carousel-ambient-backdrop" style="background-image: url('${slide.image_url}');"></div>
        <div class="carousel-slide-inner">
          <div class="carousel-image-frame">
            <img src="${slide.image_url}" alt="${slide.title || 'Slide'}" class="carousel-full-img" onerror="window.handleProductImgError(this)" />
          </div>
          
          <div class="carousel-content-box">
            <span class="hero-subtitle-tag">${slide.badge || 'Oriflame Sweden'}</span>
            <h2>${slide.title || 'Catalogue Beauté'}</h2>
            <p>${slide.description || ''}</p>
            
            ${hasOffer ? `
              <div class="carousel-offer-deal-box">
                <div class="offer-deal-header">
                  <span class="offer-flame-badge">🔥 OFFRE SPÉCIALE</span>
                  ${slide.offer_product_code ? `<span class="offer-code-pill">Réf. Produit : <strong>${slide.offer_product_code}</strong></span>` : ''}
                </div>
                <div class="offer-price-row">
                  <span class="offer-deal-price">${slide.offer_price} DT</span>
                  ${slide.offer_original_price ? `<span class="offer-old-price">${slide.offer_original_price} DT</span>` : ''}
                </div>
                <button class="btn-order-carousel-deal" data-slide-id="${slide.id}">
                  🛒 Commander cette Offre Deal (${slide.offer_price} DT)
                </button>
              </div>
            ` : `
              <div class="carousel-btn-group">
                <a href="${slide.button_link || '#catalogue-section'}" class="btn-carousel-primary">${slide.button_text || 'Feuilleter le Catalogue'}</a>
                <span class="feature-pill">100% Original Oriflame</span>
                <span class="feature-pill">Commande Messenger</span>
              </div>
            `}
          </div>
        </div>
      `;

      // Event listener for Offer Deal Button
      const dealBtn = slideEl.querySelector('.btn-order-carousel-deal');
      if (dealBtn) {
        dealBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.addOfferDealToCart(slide);
        });
      }

      wrapper.appendChild(slideEl);

      const dot = document.createElement('div');
      dot.className = `carousel-dot ${index === this.currentSlideIndex ? 'active' : ''}`;
      dot.addEventListener('click', () => this.goToSlide(index));
      dotsContainer.appendChild(dot);
    });
  }

  addOfferDealToCart(slide) {
    if (!slide || !slide.offer_price) return;

    const product = {
      product_id: slide.offer_product_code || `OFFER-${slide.id}`,
      name: slide.offer_product_name || slide.title || `Offre Deal (${slide.offer_product_code || 'PROMO'})`,
      price: parseFloat(slide.offer_price) || 0,
      image_url: slide.image_url
    };

    this.cartManager.addItem(product, 1);
    this.renderCart();
    this.updateCartBadge();

    if (this.cartDrawerOverlay) {
      this.cartDrawerOverlay.classList.add('open');
    }

    this.telemetry.trackEvent(`Added Carousel Offer Deal ${product.product_id} (${product.price} TND) to Cart`);
  }

  goToSlide(index) {
    if (!this.carouselSlides || this.carouselSlides.length === 0) return;
    this.currentSlideIndex = (index + this.carouselSlides.length) % this.carouselSlides.length;

    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dot');

    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === this.currentSlideIndex);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentSlideIndex);
    });
  }

  nextSlide() {
    this.goToSlide(this.currentSlideIndex + 1);
  }

  prevSlide() {
    this.goToSlide(this.currentSlideIndex - 1);
  }

  startCarouselAutoPlay() {
    this.stopCarouselAutoPlay();
    this.carouselInterval = setInterval(() => this.nextSlide(), 5000);
  }

  stopCarouselAutoPlay() {
    if (this.carouselInterval) {
      clearInterval(this.carouselInterval);
      this.carouselInterval = null;
    }
  }

  bindCarouselEvents() {
    const container = document.getElementById('hero-carousel-section');
    const prevBtn = document.getElementById('carousel-prev-btn');
    const nextBtn = document.getElementById('carousel-next-btn');

    if (prevBtn) prevBtn.addEventListener('click', () => { this.prevSlide(); this.startCarouselAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { this.nextSlide(); this.startCarouselAutoPlay(); });

    if (container) {
      container.addEventListener('mouseenter', () => this.stopCarouselAutoPlay());
      container.addEventListener('mouseleave', () => this.startCarouselAutoPlay());

      let touchStartX = 0;
      container.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) this.nextSlide();
          else this.prevSlide();
          this.startCarouselAutoPlay();
        }
      }, { passive: true });
    }

    // Bind lightbox open on image click
    this._bindLightboxTriggers();
  }

  _bindLightboxTriggers() {
    // Re-bind after each render
    document.querySelectorAll('.carousel-full-img').forEach((img, idx) => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openLightbox(idx);
      });
    });
  }

  openLightbox(index) {
    this._lightboxIndex = (index + this.carouselSlides.length) % this.carouselSlides.length;
    const lb = document.getElementById('carousel-lightbox');
    if (!lb) return;

    this._updateLightboxContent();
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this.stopCarouselAutoPlay();

    // Bind controls once
    if (!this._lightboxBound) {
      this._lightboxBound = true;
      document.getElementById('lightbox-close-btn')?.addEventListener('click', () => this.closeLightbox());
      document.querySelector('.lightbox-backdrop')?.addEventListener('click', () => this.closeLightbox());
      document.getElementById('lightbox-prev-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this._lightboxNav(-1); });
      document.getElementById('lightbox-next-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this._lightboxNav(1); });

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (document.getElementById('carousel-lightbox')?.style.display === 'none') return;
        if (e.key === 'Escape') this.closeLightbox();
        if (e.key === 'ArrowLeft') this._lightboxNav(-1);
        if (e.key === 'ArrowRight') this._lightboxNav(1);
      });

      // Touch swipe on lightbox
      let lbTouchX = 0;
      const lbContent = document.querySelector('.lightbox-content');
      lbContent?.addEventListener('touchstart', (e) => { lbTouchX = e.changedTouches[0].screenX; }, { passive: true });
      lbContent?.addEventListener('touchend', (e) => {
        const dx = lbTouchX - e.changedTouches[0].screenX;
        if (Math.abs(dx) > 40) this._lightboxNav(dx > 0 ? 1 : -1);
      }, { passive: true });
    }
  }

  _lightboxNav(dir) {
    this._lightboxIndex = (this._lightboxIndex + dir + this.carouselSlides.length) % this.carouselSlides.length;
    this._updateLightboxContent();
  }

  _updateLightboxContent() {
    const slide = this.carouselSlides[this._lightboxIndex];
    if (!slide) return;
    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    if (img) { img.src = slide.image_url; img.alt = slide.title || ''; }
    if (caption) caption.textContent = slide.title || '';
    // Animate re-entry
    const content = document.querySelector('.lightbox-content');
    if (content) {
      content.style.animation = 'none';
      content.offsetHeight; // reflow
      content.style.animation = 'lightboxIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both';
    }
  }

  closeLightbox() {
    const lb = document.getElementById('carousel-lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
    this.startCarouselAutoPlay();
  }



  cacheDOM() {
    // Language
    this.languageSelect = document.getElementById('language-select');

    // Search & Category
    this.searchInput = document.getElementById('search-input');
    this.categoryPillsContainer = document.getElementById('category-pills');
    this.productGrid = document.getElementById('product-grid');
    this.productsCount = document.getElementById('products-count');
    this.productsPaginationContainer = document.getElementById('products-pagination-container');
    this.dealsCarouselGrid = document.getElementById('deals-carousel-grid');
    this.dealsPaginationContainer = document.getElementById('deals-pagination-container');
    this.dealsCountIndicator = document.getElementById('deals-count-indicator');
    this.promoShowcaseSection = document.getElementById('promo-showcase-section');
    this.bundlesShowcaseSection = document.getElementById('bundles-showcase-section');
    this.bundlesShowcaseGrid = document.getElementById('bundles-showcase-grid');

    // Fragrance Filter Elements
    this.fragranceFiltersContainer = document.getElementById('fragrance-filters-container');
    this.btnResetFragranceFilters = document.getElementById('btn-reset-fragrance-filters');
    this.fragranceActiveSummary = document.getElementById('fragrance-active-summary');
    this.fragranceResultsAnnouncer = document.getElementById('fragrance-results-announcer');

    // Haircare Filter Elements
    this.haircareFiltersContainer = document.getElementById('haircare-filters-container');
    this.btnResetHaircareFilters = document.getElementById('btn-reset-haircare-filters');
    this.haircareActiveSummary = document.getElementById('haircare-active-summary');
    this.haircareResultsAnnouncer = document.getElementById('haircare-results-announcer');
    this.haircareBreadcrumb = document.getElementById('haircare-breadcrumb');

    // Skincare Filter Elements
    this.skincareFiltersContainer = document.getElementById('skincare-filters-container');
    this.btnResetSkincareFilters = document.getElementById('btn-reset-skincare-filters');
    this.skincareActiveSummary = document.getElementById('skincare-active-summary');
    this.skincareResultsAnnouncer = document.getElementById('skincare-results-announcer');
    this.skincareBreadcrumb = document.getElementById('skincare-breadcrumb');

    // BodyCare Filter Elements
    this.bodycareFiltersContainer = document.getElementById('bodycare-filters-container');
    this.btnResetBodycareFilters = document.getElementById('btn-reset-bodycare-filters');
    this.bodycareActiveSummary = document.getElementById('bodycare-active-summary');
    this.bodycareResultsAnnouncer = document.getElementById('bodycare-results-announcer');
    this.bodycareBreadcrumb = document.getElementById('bodycare-breadcrumb');

    // Cart Elements
    this.floatingCartBtn = document.getElementById('floating-cart-btn');
    this.floatingCartText = document.getElementById('floating-cart-text');
    this.cartBadge = document.getElementById('cart-badge');
    this.btnHeaderCart = document.getElementById('btn-header-cart');
    this.headerCartBadge = document.getElementById('header-cart-badge');
    this.btnHeaderSearch = document.getElementById('btn-header-search');
    this.btnMobileMenu = document.getElementById('btn-mobile-menu');
    this.navActionsMenu = document.getElementById('nav-actions-menu');
    this.cartDrawerOverlay = document.getElementById('cart-drawer-overlay');
    this.btnCloseDrawer = document.getElementById('btn-close-drawer');
    this.drawerMainTitle = document.getElementById('drawer-main-title');
    this.drawerTitleText = document.getElementById('drawer-title-text');
    this.cartItemsList = document.getElementById('cart-items-list');
    this.cartSubtotal = document.getElementById('cart-subtotal');
    this.cartTotalWithDelivery = document.getElementById('cart-total-with-delivery');

    // Checkout Stepper & Views
    this.checkoutStepper = document.getElementById('checkout-stepper');
    this.stepperStep1 = document.getElementById('stepper-step-1');
    this.stepperStep2 = document.getElementById('stepper-step-2');
    this.stepperStep3 = document.getElementById('stepper-step-3');
    this.stepperLine1 = document.getElementById('stepper-line-1');
    this.stepperLine2 = document.getElementById('stepper-line-2');

    this.checkoutStepCart = document.getElementById('checkout-step-cart');
    this.checkoutStepDetails = document.getElementById('checkout-step-details');
    this.checkoutStepReview = document.getElementById('checkout-step-review');
    this.checkoutStepSuccess = document.getElementById('checkout-step-success');

    // Checkout Navigation Buttons
    this.btnGotoDetails = document.getElementById('btn-goto-details');
    this.btnBackToCart = document.getElementById('btn-back-to-cart');
    this.btnGotoReview = document.getElementById('btn-goto-review');
    this.btnBackToDetails = document.getElementById('btn-back-to-details');
    this.btnEditDetailsLink = document.getElementById('btn-edit-details-link');
    this.btnConfirmOrder = document.getElementById('btn-confirm-order');
    this.btnConfirmSpinner = document.getElementById('btn-confirm-spinner');
    this.btnConfirmLabel = document.getElementById('btn-confirm-label');
    this.btnContinueShopping = document.getElementById('btn-continue-shopping');

    // Step 2 Form Inputs
    this.checkoutNameInput = document.getElementById('checkout-name');
    this.checkoutPhoneInput = document.getElementById('checkout-phone');
    this.checkoutCityInput = document.getElementById('checkout-city');
    this.checkoutAddressInput = document.getElementById('checkout-address');
    this.checkoutNoteInput = document.getElementById('checkout-note');
    this.checkoutConsentInput = document.getElementById('checkout-consent');
    this.checkoutDetailsErrors = document.getElementById('checkout-details-errors');
    this.checkoutDetailsErrorList = document.getElementById('checkout-details-error-list');
    this.linkCheckoutPrivacy = document.getElementById('link-checkout-privacy');
    this.checkoutHoneypot = document.getElementById('checkout-honeypot');

    // Step 3 Review Elements
    this.reviewCustomerName = document.getElementById('review-customer-name');
    this.reviewCustomerPhone = document.getElementById('review-customer-phone');
    this.reviewDeliveryCity = document.getElementById('review-delivery-city');
    this.reviewDeliveryAddress = document.getElementById('review-delivery-address');
    this.reviewCustomerNote = document.getElementById('review-customer-note');
    this.reviewNoteWrapper = document.getElementById('review-note-wrapper');
    this.reviewItemsList = document.getElementById('review-items-list');
    this.reviewSubtotal = document.getElementById('review-subtotal');
    this.reviewDiscount = document.getElementById('review-discount');
    this.reviewDiscountRow = document.getElementById('review-discount-row');
    this.reviewTotalWithDelivery = document.getElementById('review-total-with-delivery');

    // Step 4 Success Elements
    this.successOrderNumber = document.getElementById('success-order-number');
    this.successOrderDate = document.getElementById('success-order-date');
    this.successOrderTotal = document.getElementById('success-order-total');
    this.successItemsSummary = document.getElementById('success-items-summary');

    // Backward-compatibility references
    this.customerNameInput = this.checkoutNameInput;
    this.customerPhoneInput = this.checkoutPhoneInput;
    this.customerAddressInput = this.checkoutAddressInput;
    this.btnMessengerCheckout = document.getElementById('btn-messenger-checkout');
    this.btnCopyOrderSummary = document.getElementById('btn-copy-order-summary');

    // Modals
    this.btnNavAbout = document.getElementById('btn-nav-about');
    this.aboutModalOverlay = document.getElementById('about-modal-overlay');
    this.btnCloseAbout = document.getElementById('btn-close-about');

    this.btnNavPrivacy = document.getElementById('btn-nav-privacy');
    this.privacyModalOverlay = document.getElementById('privacy-modal-overlay');
    this.btnClosePrivacy = document.getElementById('btn-close-privacy');

    // Quick View Modal
    this.quickViewModalOverlay = document.getElementById('quickview-modal-overlay');
    this.btnCloseQuickView = document.getElementById('btn-close-quickview');
    this.quickViewContent = document.getElementById('quickview-content');

    // Facebook Login + Messenger Opt-in
    this.fbLoginStep = document.getElementById('fb-login-step');
    this.fbOptinStep = document.getElementById('fb-optin-step');
    this.btnFbLogin = document.getElementById('btn-fb-login');
    this.fbUserName = document.getElementById('fb-user-name');

    // Global Navigation, Breadcrumbs & Back to top
    this.brandLogoLink = document.getElementById('brand-logo-link') || document.querySelector('.brand-logo');
    this.globalNavigationBar = document.getElementById('global-navigation-bar');
    this.btnPageBack = document.getElementById('btn-page-back');
    this.globalBreadcrumbNav = document.getElementById('global-breadcrumb-nav');
    this.globalBreadcrumbList = document.getElementById('global-breadcrumb-list');
    this.btnBackToTop = document.getElementById('btn-back-to-top');

    // Mobile Navigation Drawer
    this.mobileNavBackdrop = document.getElementById('mobile-nav-backdrop');
    this.mobileNavDrawer = document.getElementById('mobile-nav-drawer');
    this.btnCloseMobileMenu = document.getElementById('btn-close-mobile-menu');
    this.mobileLanguageSelect = document.getElementById('mobile-language-select');

    // Category Share Modal
    this.btnShareCategory = document.getElementById('btn-share-category');
    this.categoryShareModal = document.getElementById('category-share-modal');
    this.btnCloseCatShare = document.getElementById('btn-close-cat-share');
    this.categoryShareOptions = document.getElementById('category-share-options');
  }


  bindEvents() {
    // Language Switcher
    if (this.languageSelect) {
      this.languageSelect.addEventListener('change', (e) => {
        this.i18n.setLang(e.target.value);
        this.telemetry.trackEvent(`Switched Language to ${e.target.value}`);
        if (window.ecatViewer) window.ecatViewer.renderSpread();
        this.renderDealsShowcase();
        this.renderProducts();
        this.renderCart();
      });
    }

    // Search Filter
    if (this.searchInput) {
      let searchTimeout;
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.productsCurrentPage = 1;
        this.renderProducts();

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          if (this.searchQuery) {
            this.telemetry.trackEvent(`Searched for "${this.searchQuery}"`);
            if (typeof this.telemetry.trackAnalytics === 'function') {
              const matchedCount = (this.products || []).filter(p => 
                (p.name || '').toLowerCase().includes(this.searchQuery) ||
                (p.description || '').toLowerCase().includes(this.searchQuery) ||
                String(p.product_id).includes(this.searchQuery)
              ).length;
              this.telemetry.trackAnalytics('search_performed', {
                search_term: this.searchQuery,
                results_count: matchedCount
              });
            }
          }
        }, 1200);
      });
    }

    // Category Filter Pills
    if (this.categoryPillsContainer) {
      this.categoryPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.category-pill');
        if (pill) {
          document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.activeCategory = pill.dataset.category || 'All';
          this.productsCurrentPage = 1;
          this.telemetry.trackEvent(`Filtered by Category: ${this.activeCategory}`, this.activeCategory);

          // Toggle Fragrance filters visibility
          if (this.fragranceFiltersContainer) {
            if (this.activeCategory === 'Fragrance') {
              this.fragranceFiltersContainer.style.display = 'block';
              this.updateFragranceFilterCounts();
            } else {
              this.fragranceFiltersContainer.style.display = 'none';
            }
          }

          // Toggle Haircare filters visibility
          if (this.haircareFiltersContainer) {
            const isHair = (this.activeCategory === 'Haircare');
            this.haircareFiltersContainer.style.display = isHair ? 'block' : 'none';
            if (this.haircareBreadcrumb) this.haircareBreadcrumb.style.display = isHair ? 'flex' : 'none';
            if (isHair) {
              this.updateHaircareFilterCounts();
            }
          }

          // Toggle Skincare filters visibility
          if (this.skincareFiltersContainer) {
            const isSkin = (this.activeCategory === 'Skincare');
            this.skincareFiltersContainer.style.display = isSkin ? 'block' : 'none';
            if (this.skincareBreadcrumb) this.skincareBreadcrumb.style.display = isSkin ? 'flex' : 'none';
            if (isSkin) {
              this.updateSkincareFilterCounts();
            }
          }

          // Toggle BodyCare filters visibility
          if (this.bodycareFiltersContainer) {
            const isBody = (this.activeCategory === 'BodyCare');
            this.bodycareFiltersContainer.style.display = isBody ? 'block' : 'none';
            if (this.bodycareBreadcrumb) this.bodycareBreadcrumb.style.display = isBody ? 'flex' : 'none';
            if (isBody) {
              this.updateBodyCareFilterCounts();
            }
          }

          if (this.activeCategory === 'Bundles' && this.bundlesShowcaseSection) {
            this.bundlesShowcaseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          this.renderProducts();
        }
      });
    }

    // Bind Fragrance specialized filter events
    this.bindFragranceFilterEvents();

    // Bind Haircare specialized filter events
    this.bindHaircareFilterEvents();

    // Bind Skincare specialized filter events
    this.bindSkincareFilterEvents();

    // Bind BodyCare specialized filter events
    this.bindBodyCareFilterEvents();

    // Window Resize Handler for Responsive Pagination
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.renderProducts();
        this.renderDealsShowcase();
      }, 150);
    }, { passive: true });

    // Cart Drawer Toggle
    if (this.floatingCartBtn) {
      this.floatingCartBtn.addEventListener('click', () => {
        this.openCartDrawer();
        this.telemetry.trackEvent('Opened Shopping Cart Drawer');
      });
    }
    if (this.btnHeaderCart) {
      this.btnHeaderCart.addEventListener('click', () => {
        this.openCartDrawer();
        this.telemetry.trackEvent('Opened Shopping Cart from Header');
      });
    }
    if (this.btnHeaderSearch) {
      this.btnHeaderSearch.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => this.searchInput.focus(), 300);
        }
      });
    }
    // Brand Logo Click -> Navigate to Home
    if (this.brandLogoLink) {
      this.brandLogoLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateToHome();
      });
    }

    // Page Back Button
    if (this.btnPageBack) {
      this.btnPageBack.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.history.length > 1) {
          window.history.back();
        } else {
          this.navigateToHome();
        }
      });
    }

    // Dynamic Global Breadcrumb item click delegation
    if (this.globalBreadcrumbList) {
      this.globalBreadcrumbList.addEventListener('click', (e) => {
        const link = e.target.closest('.breadcrumb-link');
        if (!link) return;
        e.preventDefault();
        const action = link.dataset.action;
        if (action === 'nav-home') {
          this.navigateToHome();
        } else if (action === 'nav-cat') {
          const cat = link.dataset.category || 'All';
          this.selectCategory(cat);
          const target = document.querySelector('.controls-section') || document.querySelector('.products-header');
          this.scrollToSection(target, -75);
        }
      });
    }

    // Floating Back to Top Button
    if (this.btnBackToTop) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
          this.btnBackToTop.style.display = 'flex';
          this.btnBackToTop.classList.add('visible');
        } else {
          this.btnBackToTop.classList.remove('visible');
          this.btnBackToTop.style.display = 'none';
        }
      }, { passive: true });

      this.btnBackToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Category Share Modal trigger & close
    if (this.btnShareCategory) {
      this.btnShareCategory.addEventListener('click', () => {
        this.openCategoryShareModal();
      });
    }
    if (this.btnCloseCatShare) {
      this.btnCloseCatShare.addEventListener('click', () => {
        this.closeModal(this.categoryShareModal);
      });
    }

    // Mobile Navigation Drawer Toggle & Events
    if (this.btnMobileMenu) {
      this.btnMobileMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.mobileNavDrawer && this.mobileNavDrawer.style.display !== 'none') {
          this.closeMobileDrawer();
        } else {
          this.openMobileDrawer();
        }
      });
    }

    if (this.btnCloseMobileMenu) {
      this.btnCloseMobileMenu.addEventListener('click', () => this.closeMobileDrawer());
    }

    if (this.mobileNavBackdrop) {
      this.mobileNavBackdrop.addEventListener('click', () => this.closeMobileDrawer());
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.mobileNavDrawer && this.mobileNavDrawer.style.display !== 'none') {
          this.closeMobileDrawer();
        }
      }
    });

    // Mobile drawer items click handling
    if (this.mobileNavDrawer) {
      this.mobileNavDrawer.addEventListener('click', (e) => {
        const btn = e.target.closest('.drawer-nav-item');
        if (!btn) return;
        const cat = btn.dataset.category;
        if (cat) {
          e.preventDefault();
          this.closeMobileDrawer();
          this.selectCategory(cat);
          const target = document.querySelector('.controls-section') || document.querySelector('.products-header');
          this.scrollToSection(target, -75);
        } else if (btn.id === 'btn-drawer-about') {
          this.closeMobileDrawer();
          if (this.btnNavAbout) this.btnNavAbout.click();
        } else if (btn.id === 'btn-drawer-privacy') {
          this.closeMobileDrawer();
          if (this.btnNavPrivacy) this.btnNavPrivacy.click();
        } else if (btn.classList.contains('drawer-nav-link')) {
          this.closeMobileDrawer();
        }
      });
    }

    // Sync mobile language selector with main selector
    if (this.mobileLanguageSelect) {
      this.mobileLanguageSelect.addEventListener('change', (e) => {
        if (this.languageSelect) {
          this.languageSelect.value = e.target.value;
          this.languageSelect.dispatchEvent(new Event('change'));
        }
      });
    }

    // Browser History popstate (Back/Forward navigation)
    window.addEventListener('popstate', (e) => {
      this.handlePopState(e);
    });
    if (this.btnCloseDrawer) {
      this.btnCloseDrawer.addEventListener('click', () => this.closeCartDrawer());
    }
    if (this.cartDrawerOverlay) {
      this.cartDrawerOverlay.addEventListener('click', (e) => {
        if (e.target === this.cartDrawerOverlay) this.closeCartDrawer();
      });
    }

    // Cart Subscribe
    this.cartManager.subscribe(() => {
      this.renderCart();
      this.updateCartBadge();
    });

    // ── Progressive On-Site Checkout Workflow ───────────────────────────────
    this.currentCheckoutStep = 1;
    this.isSubmittingOrder = false;

    this.setCheckoutStep = (stepNumber) => {
      this.currentCheckoutStep = stepNumber;

      // Views
      if (this.checkoutStepCart) this.checkoutStepCart.style.display = (stepNumber === 1 ? 'flex' : 'none');
      if (this.checkoutStepDetails) this.checkoutStepDetails.style.display = (stepNumber === 2 ? 'flex' : 'none');
      if (this.checkoutStepReview) this.checkoutStepReview.style.display = (stepNumber === 3 ? 'flex' : 'none');
      if (this.checkoutStepSuccess) this.checkoutStepSuccess.style.display = (stepNumber === 4 ? 'block' : 'none');

      // Stepper Bar
      if (this.checkoutStepper) {
        // Stepper is visible in Steps 1, 2, and 3 (hidden on final success confirmation screen)
        this.checkoutStepper.style.display = (stepNumber >= 1 && stepNumber <= 3) ? 'flex' : 'none';

        // Step 1 Indicator
        if (this.stepperStep1) {
          this.stepperStep1.className = 'checkout-step-indicator' + (stepNumber === 1 ? ' active' : (stepNumber > 1 ? ' completed' : ''));
        }
        // Step 1-2 Line
        if (this.stepperLine1) {
          this.stepperLine1.className = 'stepper-line' + (stepNumber >= 2 ? ' completed' : '');
        }
        // Step 2 Indicator
        if (this.stepperStep2) {
          this.stepperStep2.className = 'checkout-step-indicator' + (stepNumber === 2 ? ' active' : (stepNumber > 2 ? ' completed' : ''));
        }
        // Step 2-3 Line
        if (this.stepperLine2) {
          this.stepperLine2.className = 'stepper-line' + (stepNumber >= 3 ? ' completed' : '');
        }
        // Step 3 Indicator
        if (this.stepperStep3) {
          this.stepperStep3.className = 'checkout-step-indicator' + (stepNumber === 3 ? ' active' : '');
        }
      }

      // Dynamic Drawer Header Title
      if (this.drawerTitleText) {
        if (stepNumber === 1) this.drawerTitleText.textContent = "Panier d'Achat";
        else if (stepNumber === 2) this.drawerTitleText.textContent = "Vos Coordonnées";
        else if (stepNumber === 3) this.drawerTitleText.textContent = "Vérification de la commande";
        else if (stepNumber === 4) this.drawerTitleText.textContent = "Commande reçue";
      }

      // Scroll drawer body to top on step transition
      const activeDrawerBody = document.querySelector('.checkout-step-view[style*="display: flex"] .drawer-body') 
        || document.querySelector('.checkout-step-view[style*="display: block"] .drawer-body');
      if (activeDrawerBody) activeDrawerBody.scrollTop = 0;
    };

    // Validation for Step 2
    this.validateCheckoutDetails = () => {
      const errors = [];
      const name = (this.checkoutNameInput ? this.checkoutNameInput.value : '').trim();
      const phone = (this.checkoutPhoneInput ? this.checkoutPhoneInput.value : '').trim();
      const city = (this.checkoutCityInput ? this.checkoutCityInput.value : '').trim();
      const address = (this.checkoutAddressInput ? this.checkoutAddressInput.value : '').trim();
      const consent = this.checkoutConsentInput ? this.checkoutConsentInput.checked : false;

      // Clean invalid markers
      [this.checkoutNameInput, this.checkoutPhoneInput, this.checkoutCityInput, this.checkoutAddressInput].forEach(el => {
        if (el) el.classList.remove('is-invalid');
      });

      if (!name || name.length < 2) {
        errors.push("Veuillez saisir votre nom et prénom (au moins 2 caractères).");
        if (this.checkoutNameInput) this.checkoutNameInput.classList.add('is-invalid');
      }

      const digitsOnly = phone.replace(/\D/g, '');
      if (!digitsOnly || digitsOnly.length < 8) {
        errors.push("Veuillez saisir un numéro de téléphone valide (au moins 8 chiffres).");
        if (this.checkoutPhoneInput) this.checkoutPhoneInput.classList.add('is-invalid');
      }

      if (!city || city.length < 2) {
        errors.push("Veuillez indiquer votre ville ou zone de livraison.");
        if (this.checkoutCityInput) this.checkoutCityInput.classList.add('is-invalid');
      }

      if (!address || address.length < 3) {
        errors.push("Veuillez renseigner votre adresse de livraison complète.");
        if (this.checkoutAddressInput) this.checkoutAddressInput.classList.add('is-invalid');
      }

      if (!consent) {
        errors.push("Veuillez cocher la case autorisant l'utilisation de vos coordonnées pour le traitement de la commande.");
      }

      if (this.checkoutDetailsErrors) {
        if (errors.length > 0) {
          this.checkoutDetailsErrors.innerHTML = `
            <strong>Veuillez corriger les informations suivantes :</strong>
            <ul style="margin: 6px 0 0 18px; padding: 0;">${errors.map(err => `<li>${err}</li>`).join('')}</ul>
          `;
          this.checkoutDetailsErrors.style.display = 'block';
          this.checkoutDetailsErrors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return false;
        } else {
          this.checkoutDetailsErrors.style.display = 'none';
          this.checkoutDetailsErrors.innerHTML = '';
          return true;
        }
      }

      return errors.length === 0;
    };

    // Populate Review Step 3
    this.populateCheckoutReview = () => {
      const name = (this.checkoutNameInput ? this.checkoutNameInput.value : '').trim();
      const phone = (this.checkoutPhoneInput ? this.checkoutPhoneInput.value : '').trim();
      const city = (this.checkoutCityInput ? this.checkoutCityInput.value : '').trim();
      const address = (this.checkoutAddressInput ? this.checkoutAddressInput.value : '').trim();
      const note = (this.checkoutNoteInput ? this.checkoutNoteInput.value : '').trim();

      if (this.reviewCustomerName) this.reviewCustomerName.textContent = name;
      if (this.reviewCustomerPhone) this.reviewCustomerPhone.textContent = phone;
      if (this.reviewDeliveryCity) this.reviewDeliveryCity.textContent = city;
      if (this.reviewDeliveryAddress) this.reviewDeliveryAddress.textContent = address;

      if (this.reviewCustomerNote && this.reviewNoteWrapper) {
        if (note) {
          this.reviewCustomerNote.textContent = note;
          this.reviewNoteWrapper.style.display = 'flex';
        } else {
          this.reviewNoteWrapper.style.display = 'none';
        }
      }

      // Review Items List
      const items = this.cartManager.getCartItems();
      const isArabic = this.i18n ? this.i18n.getLang() === 'ar' : false;
      const currency = isArabic ? 'د.ت' : 'TND';

      if (this.reviewItemsList) {
        this.reviewItemsList.innerHTML = items.map(it => `
          <div class="review-item-row">
            <img class="review-item-thumb" src="${it.image_url}" alt="${it.name}" onerror="window.handleProductImgError(this)" />
            <div class="review-item-details">
              <div class="review-item-name">${it.name}</div>
              <div class="review-item-sub">
                ${it.shade_name ? `<span>Nuance : ${it.shade_name} · </span>` : ''}
                <span>Réf. ${it.product_id}</span>
              </div>
            </div>
            <div class="review-item-qtyprice">
              <div class="review-item-qty">Qté : ${it.quantity}</div>
              <div class="review-item-total">${(Number(it.price) * it.quantity).toFixed(2)} ${currency}</div>
            </div>
          </div>
        `).join('');
      }

      // Financials
      const subtotal = this.cartManager.getSubtotal();
      const rawSubtotal = this.cartManager.getRawSubtotal();
      const discount = this.cartManager.getTotalDiscount();
      const totalWithDelivery = this.cartManager.getTotalWithDelivery();

      if (this.reviewSubtotal) {
        this.reviewSubtotal.textContent = `${subtotal.toFixed(2)} ${currency}`;
      }

      if (this.reviewDiscountRow && this.reviewDiscount) {
        if (discount > 0) {
          this.reviewDiscount.textContent = `-${discount.toFixed(2)} ${currency}`;
          this.reviewDiscountRow.style.display = 'flex';
        } else {
          this.reviewDiscountRow.style.display = 'none';
        }
      }

      if (this.reviewTotalWithDelivery) {
        this.reviewTotalWithDelivery.textContent = `${totalWithDelivery.toFixed(3)} ${currency}`;
      }
    };

    // Step 1 -> Step 2
    if (this.btnGotoDetails) {
      this.btnGotoDetails.addEventListener('click', () => {
        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
          alert("Votre panier est vide. Veuillez ajouter des produits avant de commander.");
          return;
        }
        this.setCheckoutStep(2);
        if (this.checkoutNameInput) this.checkoutNameInput.focus();
      });
    }

    // Step 2 -> Step 1
    if (this.btnBackToCart) {
      this.btnBackToCart.addEventListener('click', () => {
        this.setCheckoutStep(1);
      });
    }

    // Step 2 -> Step 3
    if (this.btnGotoReview) {
      this.btnGotoReview.addEventListener('click', () => {
        if (this.validateCheckoutDetails()) {
          this.populateCheckoutReview();
          this.setCheckoutStep(3);
        }
      });
    }

    // Step 3 -> Step 2
    if (this.btnBackToDetails) {
      this.btnBackToDetails.addEventListener('click', () => {
        this.setCheckoutStep(2);
      });
    }
    if (this.btnEditDetailsLink) {
      this.btnEditDetailsLink.addEventListener('click', () => {
        this.setCheckoutStep(2);
      });
    }

    // Real-time error clearance on input
    [this.checkoutNameInput, this.checkoutPhoneInput, this.checkoutCityInput, this.checkoutAddressInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => {
          if (inp.classList.contains('is-invalid')) inp.classList.remove('is-invalid');
          if (this.checkoutDetailsErrors) this.checkoutDetailsErrors.style.display = 'none';
        });
      }
    });

    // Privacy Policy Modal link from checkout
    if (this.linkCheckoutPrivacy) {
      this.linkCheckoutPrivacy.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(this.privacyModalOverlay);
      });
    }

    // Submit Order in Step 3
    if (this.btnConfirmOrder) {
      this.btnConfirmOrder.addEventListener('click', async () => {
        if (this.isSubmittingOrder) return;

        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
          alert("Votre panier est vide.");
          this.setCheckoutStep(1);
          return;
        }

        // Validate details once more
        if (!this.validateCheckoutDetails()) {
          this.setCheckoutStep(2);
          return;
        }

        const name = (this.checkoutNameInput ? this.checkoutNameInput.value : '').trim();
        const phone = (this.checkoutPhoneInput ? this.checkoutPhoneInput.value : '').trim();
        const city = (this.checkoutCityInput ? this.checkoutCityInput.value : '').trim();
        const address = (this.checkoutAddressInput ? this.checkoutAddressInput.value : '').trim();
        const note = (this.checkoutNoteInput ? this.checkoutNoteInput.value : '').trim();
        const honeypot = (this.checkoutHoneypot ? this.checkoutHoneypot.value : '').trim();

        // Honeypot anti-spam silent check
        if (honeypot) {
          console.warn("[Anti-spam] Honeypot triggered");
          this.setCheckoutStep(4);
          return;
        }

        // Lock button & show spinner (double-click protection)
        this.isSubmittingOrder = true;
        this.btnConfirmOrder.disabled = true;
        if (this.btnConfirmSpinner) this.btnConfirmSpinner.style.display = 'inline-block';
        if (this.btnConfirmLabel) this.btnConfirmLabel.textContent = 'Enregistrement de la commande...';

        const finalTotalStr = `${this.cartManager.getTotalWithDelivery().toFixed(3)} TND`;
        const itemsSnapshot = items.map(it => ({ ...it }));

        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_name: name,
              customer_phone: phone,
              delivery_area: city,
              delivery_city: city,
              delivery_address: address,
              customer_note: note,
              consent_given: true,
              items: itemsSnapshot,
              channel: 'direct_site'
            })
          });

          const data = await res.json();

          if (data.success) {
            const orderNumber = data.orderNumber || data.order_number || data.order_id || `MN-${Date.now().toString().slice(-6)}`;

            // Populate Step 4 (Success)
            if (this.successOrderNumber) this.successOrderNumber.textContent = orderNumber;
            if (this.successOrderDate) {
              const now = new Date();
              this.successOrderDate.textContent = now.toLocaleDateString('fr-FR', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              });
            }
            if (this.successOrderTotal) this.successOrderTotal.textContent = finalTotalStr;

            if (this.successItemsSummary) {
              this.successItemsSummary.innerHTML = itemsSnapshot.map(it => `
                <div class="success-item-mini-row">
                  <span>${it.name} (x${it.quantity})</span>
                  <strong>${(Number(it.price) * it.quantity).toFixed(2)} TND</strong>
                </div>
              `).join('');
            }

            // Meta Pixel / Telemetry tracking
            try {
              if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
                window.fbq('track', 'Purchase', {
                  content_name: 'Commande directe sur le site',
                  content_ids: itemsSnapshot.map(it => String(it.product_id)),
                  content_type: 'product',
                  num_items: this.cartManager.getTotalCount(),
                  value: this.cartManager.getTotalWithDelivery(),
                  currency: 'TND'
                });
              }
            } catch (e) {}

            this.telemetry.trackEvent(`Completed Direct On-Site Order ${orderNumber}`);

            // Clear Cart
            this.cartManager.clearCart();
            this.renderCart();
            this.updateCartBadge();

            // Clear inputs for subsequent orders
            if (this.checkoutNameInput) this.checkoutNameInput.value = '';
            if (this.checkoutPhoneInput) this.checkoutPhoneInput.value = '';
            if (this.checkoutCityInput) this.checkoutCityInput.value = '';
            if (this.checkoutAddressInput) this.checkoutAddressInput.value = '';
            if (this.checkoutNoteInput) this.checkoutNoteInput.value = '';
            if (this.checkoutConsentInput) this.checkoutConsentInput.checked = false;

            // Transition to Step 4
            this.setCheckoutStep(4);
          } else {
            alert('Erreur lors de la validation de la commande : ' + (data.message || 'Une erreur est survenue.'));
          }
        } catch (err) {
          console.error("Order submission network error:", err);
          alert("Une erreur de réseau est survenue lors de l'envoi de la commande. Veuillez vérifier votre connexion ou nous contacter par téléphone au 55756629.");
        } finally {
          this.isSubmittingOrder = false;
          if (this.btnConfirmOrder) this.btnConfirmOrder.disabled = false;
          if (this.btnConfirmSpinner) this.btnConfirmSpinner.style.display = 'none';
          if (this.btnConfirmLabel) this.btnConfirmLabel.textContent = '✓ Confirmer ma commande';
        }
      });
    }

    // Step 4: Continuer mes achats
    if (this.btnContinueShopping) {
      this.btnContinueShopping.addEventListener('click', () => {
        this.closeCartDrawer();
        this.setCheckoutStep(1);
      });
    }

    // Secondary Direct Phone / WhatsApp link in cart (optional shortcut)
    const btnPhone = document.getElementById('btn-phone-checkout');
    if (btnPhone) {
      btnPhone.addEventListener('click', (e) => {
        e.preventDefault();
        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
          alert('Votre panier est vide.');
          return;
        }
        const cleanTargetPhone = this.cleanPhoneNumber(this.whatsappPhone || '55756629');
        const rawMsg = `Bonjour Mouna ! Je souhaite commander :\n` + this.cartManager.generateOrderTextMessage('', '', 'TND');
        const waUrl = `https://wa.me/216${cleanTargetPhone}?text=${encodeURIComponent(rawMsg)}`;
        window.open(waUrl, '_blank');
      });
    }

    // Modals
    if (this.btnNavAbout) {
      this.btnNavAbout.addEventListener('click', () => {
        this.openModal(this.aboutModalOverlay);
        this.telemetry.trackEvent('Viewed About Mouna Page');
      });
    }
    if (this.btnCloseAbout) {
      this.btnCloseAbout.addEventListener('click', () => this.closeModal(this.aboutModalOverlay));
    }

    if (this.btnNavPrivacy) {
      this.btnNavPrivacy.addEventListener('click', () => {
        this.openModal(this.privacyModalOverlay);
        this.telemetry.trackEvent('Viewed Privacy Policy');
      });
    }
    if (this.btnClosePrivacy) {
      this.btnClosePrivacy.addEventListener('click', () => this.closeModal(this.privacyModalOverlay));
    }

    if (this.btnCloseQuickView) {
      this.btnCloseQuickView.addEventListener('click', () => this.closeModal(this.quickViewModalOverlay));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Facebook Login + Send to Messenger + Auto Order Confirmation
  // ─────────────────────────────────────────────────────────────
  initFacebookCheckout() {
    // State
    this._fbOrderId = null;
    this._fbOrderMsg = null;
    this._fbOrderUrl = null;
    this._fbLoggedIn = false;

    // Listen for FB SDK ready signal (fires once FB App ID is configured in .env)
    document.addEventListener('fb-sdk-ready', () => this._onFbSdkReady());

    // Also handle btn-fb-login click (will only be visible when SDK is ready)
    if (this.btnFbLogin) {
      this.btnFbLogin.onclick = () => this._handleFbLogin();
    }

    // Listen for "Send to Messenger" plugin events (fired by FB SDK)
    if (window.FB) {
      this._subscribeSendToMessenger();
    } else {
      document.addEventListener('fb-sdk-ready', () => this._subscribeSendToMessenger());
    }

    // Live Countdown Timer ticker every second for all deal badges
    setInterval(() => this.tickDealCountdowns(), 1000);
  }

  _onFbSdkReady() {
    // When cart is non-empty: replace default Messenger button with FB Login step
    const defaultBtn = document.getElementById('btn-messenger-checkout');
    if (defaultBtn) defaultBtn.style.display = 'none';

    const fbLoginStep = this.fbLoginStep;
    if (fbLoginStep) fbLoginStep.style.display = 'flex';
  }

  async _handleFbLogin() {
    if (typeof FB === 'undefined') return;

    return new Promise((resolve) => {
      FB.login((response) => {
        if (response.authResponse) {
          this._fbLoggedIn = true;
          FB.api('/me', { fields: 'name,first_name' }, (me) => {
            const firstName = me.first_name || me.name || 'Vous';
            if (this.fbUserName) this.fbUserName.textContent = `Bonjour, ${firstName} !`;
          });

          // Hide login step, show Send to Messenger step
          if (this.fbLoginStep) this.fbLoginStep.style.display = 'none';

          // Save order first, then show opt-in
          this._saveOrderAndShowOptin().then(resolve);
        } else {
          this.showToast('Connexion Facebook annulée.');
          resolve();
        }
      }, { scope: 'public_profile' });
    });
  }

  async _saveOrderAndShowOptin() {
    const name = this.customerNameInput ? this.customerNameInput.value : '';
    const phone = this.customerPhoneInput ? this.customerPhoneInput.value : '';
    const items = this.cartManager.getCartItems();
    if (items.length === 0) return;

    // Save order to server
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: name, customer_phone: phone, items, currency: 'TND' })
      });
      const data = await res.json();
      if (data.success) {
        this._fbOrderId = data.order_id;
        this._fbOrderUrl = data.order_url;
        this._fbOrderMsg = this.cartManager.generateOrderTextMessage(name, phone, 'TND', data.order_url);
      }
    } catch (e) {
      console.warn('[FB Checkout] Order save failed', e);
    }

    // Update the Send to Messenger plugin's data-ref with the order ID
    const stmWidget = document.querySelector('.fb-send-to-messenger');
    if (stmWidget && this._fbOrderId) {
      stmWidget.dataset.ref = this._fbOrderId;
      stmWidget.dataset.messengerAppId = window.FB_APP_ID;
      // Re-parse the plugin with updated attributes
      if (window.FB && FB.XFBML) FB.XFBML.parse(stmWidget.parentElement);
    }

    // Show Send to Messenger opt-in step
    if (this.fbOptinStep) this.fbOptinStep.style.display = 'flex';
  }

  _subscribeSendToMessenger() {
    if (typeof FB === 'undefined') return;
    FB.Event.subscribe('send_to_messenger', async (e) => {
      if (e.event !== 'opted_in') return;

      const psid = e.ref || this._fbOrderId;
      const orderId = this._fbOrderId;

      // Register the opt-in on the server (links PSID to the order)
      if (orderId) {
        try {
          await fetch('/api/messenger/optin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, psid: e.userRef || psid, ref: orderId })
          });
        } catch (err) {
          console.warn('[FB] Opt-in save failed', err);
        }

        // Trigger server to auto-send the confirmation message
        try {
          const confirmRes = await fetch(`/api/orders/${orderId}/send-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const confirmData = await confirmRes.json();
          if (confirmData.success) {
            this.showToast('✅ Message de confirmation envoyé dans votre Messenger !');
            if (this.fbOptinStep) this.fbOptinStep.innerHTML =
              `<div style="text-align:center; padding: 16px; color: #15803D; font-weight: 700; font-size: 0.9rem;">
                ✅ Commande envoyée ! Vérifiez votre Messenger.
              </div>`;
            this.telemetry.trackEvent('FB Messenger Auto-Confirmation Sent');
          } else {
            // Fallback: copy message to clipboard if server not configured
            if (this._fbOrderMsg) await this._clipboardFallback(this._fbOrderMsg);
          }
        } catch (err) {
          console.warn('[FB] Auto-confirm failed, falling back to clipboard', err);
          if (this._fbOrderMsg) await this._clipboardFallback(this._fbOrderMsg);
        }
      }
    });
  }

  async _clipboardFallback(msg) {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
        copied = true;
      }
    } catch (e) {}

    // Textarea/execCommand fallback — works on mobile even outside user gesture
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = msg;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (e) {}
    }
    this.showToast('📋 Message copié ! Collez-le (appui long → Coller) dans Messenger.');
  }

  getProductName(p) {
    if (!p) return '';
    const lang = this.i18n ? this.i18n.getLang() : 'fr';
    if (lang === 'ar' && p.name_ar && p.name_ar.trim()) return p.name_ar;
    if (lang === 'en' && p.name_en && p.name_en.trim()) return p.name_en;
    return p.name_fr || p.name || '';
  }

  getProductDescription(p) {
    if (!p) return '';
    const lang = this.i18n ? this.i18n.getLang() : 'fr';
    if (lang === 'ar' && p.description_ar && p.description_ar.trim()) return p.description_ar;
    if (lang === 'en' && p.description_en && p.description_en.trim()) return p.description_en;
    return p.description_fr || p.description || '';
  }

  calculateDiscountMetrics(activePrice, activeOrigPrice, product) {
    const pCurrent = Number(activePrice) || 0;

    // Determine the real Prix Initial (catalog initial price before any discounts)
    let pInitial = (activeOrigPrice && Number(activeOrigPrice) > pCurrent) ? Number(activeOrigPrice) : null;
    
    if (!pInitial && product && product.original_price && Number(product.original_price) > pCurrent) {
      pInitial = Number(product.original_price);
    }
    if (!pInitial && product && product.original_catalog_price && Number(product.original_catalog_price) > pCurrent) {
      pInitial = Number(product.original_catalog_price);
    }

    const companyDisc = (product && product.company_discount_applied && product.company_discount_percent) 
      ? Number(product.company_discount_percent) 
      : 0;

    let totalDiscount = 0;
    let displayOrigPrice = null;

    if (pInitial && pInitial > pCurrent) {
      // The discount shown to the client is ALWAYS the exact remise calculated from Prix Initial
      totalDiscount = Math.round(((pInitial - pCurrent) / pInitial) * 100);
      displayOrigPrice = pInitial;
    } else if (companyDisc > 0) {
      // Product had no previous discount: 20% remise with virtual Prix Initial
      totalDiscount = companyDisc;
      displayOrigPrice = pCurrent / (1 - companyDisc / 100);
    } else if (product && product.discount_percent) {
      totalDiscount = Number(product.discount_percent);
    }

    return {
      totalDiscount,
      isPromo: totalDiscount > 0,
      displayOrigPrice
    };
  }

  getProductDiscountSortMetrics(p) {
    if (!p) return { discount: 0, savings: 0, inStock: false };

    const validVariants = Array.isArray(p.variants) ? p.variants.filter(v => v.in_stock !== false) : [];
    let initialVariant = null;
    if (validVariants.length > 0) {
      if (this.searchQuery) {
        initialVariant = validVariants.find(v => 
          String(v.product_id).toLowerCase().includes(this.searchQuery) ||
          String(v.shade_name || '').toLowerCase().includes(this.searchQuery)
        ) || validVariants[0];
      } else {
        initialVariant = validVariants[0];
      }
    }

    const isCardInStock = (Array.isArray(p.variants) && p.variants.length > 0) 
      ? (validVariants.length > 0 && p.in_stock !== false) 
      : (p.in_stock !== false);

    const activePrice = initialVariant ? (initialVariant.price || p.price) : p.price;
    const activeOrigPrice = initialVariant ? (initialVariant.original_price || null) : p.original_price;
    const { totalDiscount, displayOrigPrice } = this.calculateDiscountMetrics(activePrice, activeOrigPrice, p);

    const savings = (displayOrigPrice && activePrice && Number(displayOrigPrice) > Number(activePrice))
      ? (Number(displayOrigPrice) - Number(activePrice))
      : 0;

    return {
      discount: totalDiscount || 0,
      savings: savings,
      inStock: isCardInStock
    };
  }

  getProductPageSize() {
    if (window.innerWidth < 768) return 8; // Mobile: 8 products (2 columns x 4 rows)
    if (window.innerWidth < 1024) return 8; // Tablet: 8 products
    return 12; // Desktop: 12 products (4 columns x 3 rows)
  }

  getDealsPageSize() {
    if (window.innerWidth < 480) return 4; // Very narrow mobile: 4 deals (2x2)
    if (window.innerWidth < 768) return 6; // Standard mobile: 6 deals (2x3)
    if (window.innerWidth < 1024) return 6; // Tablet: 6 deals (3x2)
    return 8; // Desktop: 8 deals (4x2)
  }

  scrollToSection(targetEl, offset = -75) {
    if (!targetEl) return;
    const y = targetEl.getBoundingClientRect().top + window.pageYOffset + offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  renderPaginationControls({ container, currentPage, totalPages, totalItems, onPageChange, ariaLabel }) {
    if (!container) return;

    if (totalPages <= 1) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';

    const isArabic = this.i18n.getLang() === 'ar';
    const isEnglish = this.i18n.getLang() === 'en';
    const pageSize = this.getProductPageSize ? this.getProductPageSize() : 12;
    const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const infoDesktop = isArabic 
      ? `عرض ${startItem}–${endItem} من إجمالي ${totalItems} منتج`
      : (isEnglish ? `Showing ${startItem}–${endItem} of ${totalItems} products` : `Affichage ${startItem}–${endItem} sur ${totalItems} produits`);
    const infoMobile = isArabic
      ? `${endItem} من أصل ${totalItems} منتج`
      : (isEnglish ? `${endItem} of ${totalItems} products` : `${endItem} produits sur ${totalItems}`);

    const infoHtml = totalItems > 0 ? `
      <div class="pagination-info" aria-live="polite">
        <span class="pagination-info-desktop">${infoDesktop}</span>
        <span class="pagination-info-mobile">${infoMobile}</span>
      </div>
    ` : '';

    // Calculate pages with smart ellipsis (adaptive for narrow mobile screens)
    const isMobileNarrow = typeof window !== 'undefined' && window.innerWidth < 500;
    const pages = [];

    if (isMobileNarrow) {
      // Compact pagination for mobile (<500px): max 5 page elements so 44px touch targets fit 360px screens
      if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        if (currentPage <= 2) {
          pages.push(1, 2, '...', totalPages);
        } else if (currentPage >= totalPages - 1) {
          pages.push(1, '...', totalPages - 1, totalPages);
        } else {
          pages.push(1, '...', currentPage, '...', totalPages);
        }
      }
    } else {
      // Desktop / Tablet pagination
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        if (currentPage <= 4) {
          for (let i = 1; i <= 5; i++) pages.push(i);
          pages.push('...');
          pages.push(totalPages);
        } else if (currentPage >= totalPages - 3) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
        } else {
          pages.push(1);
          pages.push('...');
          pages.push(currentPage - 1);
          pages.push(currentPage);
          pages.push(currentPage + 1);
          pages.push('...');
          pages.push(totalPages);
        }
      }
    }

    const prevLabel = this.i18n.t('pagination_prev') || 'Précédent';
    const nextLabel = this.i18n.t('pagination_next') || 'Suivant';
    const isFirst = currentPage <= 1;
    const isLast = currentPage >= totalPages;

    container.innerHTML = `
      ${infoHtml}
      <nav class="pagination-nav" aria-label="${ariaLabel || 'Pagination'}">
        <button type="button" class="pagination-btn pagination-prev" ${isFirst ? 'disabled aria-disabled="true"' : ''} aria-label="${prevLabel}">
          <span class="pagination-arrow">‹</span>
          <span class="btn-text">${prevLabel}</span>
        </button>
        <div class="pagination-pages">
          ${pages.map(p => {
            if (p === '...') {
              return `<span class="pagination-ellipsis" aria-hidden="true">…</span>`;
            }
            const isActive = p === currentPage;
            return `
              <button type="button" class="pagination-page ${isActive ? 'active' : ''}" 
                ${isActive ? 'aria-current="page"' : ''} 
                data-page="${p}" 
                aria-label="Page ${p}">
                ${p}
              </button>
            `;
          }).join('')}
        </div>
        <button type="button" class="pagination-btn pagination-next" ${isLast ? 'disabled aria-disabled="true"' : ''} aria-label="${nextLabel}">
          <span class="btn-text">${nextLabel}</span>
          <span class="pagination-arrow">›</span>
        </button>
      </nav>
    `;

    // Event listeners
    const prevBtn = container.querySelector('.pagination-prev');
    const nextBtn = container.querySelector('.pagination-next');
    const pageButtons = container.querySelectorAll('.pagination-page');

    if (prevBtn && !isFirst) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onPageChange(currentPage - 1);
      });
    }

    if (nextBtn && !isLast) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onPageChange(currentPage + 1);
      });
    }

    pageButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pageNum = parseInt(btn.dataset.page, 10);
        if (!isNaN(pageNum) && pageNum !== currentPage) {
          onPageChange(pageNum);
        }
      });
    });
  }

  renderDealsShowcase() {
    if (!this.dealsCarouselGrid) return;
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    let promoProducts = [];
    if (Array.isArray(this.featuredDealIds) && this.featuredDealIds.length > 0) {
      promoProducts = this.featuredDealIds
        .map(id => this.products.find(p => String(p.product_id) === String(id)))
        .filter(Boolean);
    }

    // Also include other promo / discounted products from the catalogue
    const otherPromos = this.products.filter(p => 
      (p.is_promo || p.is_featured_deal || (p.original_price && Number(p.original_price) > Number(p.price))) &&
      !promoProducts.some(existing => String(existing.product_id) === String(p.product_id))
    );
    promoProducts = [...promoProducts, ...otherPromos];

    if (promoProducts.length === 0) {
      if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'none';
      if (this.dealsPaginationContainer) this.dealsPaginationContainer.style.display = 'none';
      if (this.dealsCountIndicator) this.dealsCountIndicator.style.display = 'none';
      return;
    }

    if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'block';

    // Deals Pagination Calculation
    const totalDeals = promoProducts.length;
    const pageSize = this.getDealsPageSize();
    const totalPages = Math.ceil(totalDeals / pageSize) || 1;
    if (this.dealsCurrentPage > totalPages) this.dealsCurrentPage = 1;
    if (this.dealsCurrentPage < 1) this.dealsCurrentPage = 1;

    const startIdx = (this.dealsCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalDeals);
    const pageDeals = promoProducts.slice(startIdx, endIdx);

    // Update position indicator in deals header
    if (this.dealsCountIndicator) {
      if (totalDeals > 0) {
        this.dealsCountIndicator.textContent = this.i18n.t('position_deals', {
          start: startIdx + 1,
          end: endIdx,
          total: totalDeals
        });
        this.dealsCountIndicator.style.display = 'inline-flex';
      } else {
        this.dealsCountIndicator.style.display = 'none';
      }
    }

    this.dealsCarouselGrid.innerHTML = pageDeals.map(p => {
      const prodName = this.getProductName(p);
      const { totalDiscount, displayOrigPrice } = this.calculateDiscountMetrics(p.price, p.original_price, p);

      // Check if product has a time-limited deal in cartManager.deals
      const matchingDeal = (this.cartManager?.deals || []).find(d => String(d.product_id) === String(p.product_id) && d.active !== false && d.end_date);
      const dealTimeStr = matchingDeal ? this.formatDealTimeLeft(matchingDeal.end_date, isArabic) : null;

      return `
        <div class="mini-deal-card" onclick="window.app.openQuickView('${p.product_id}')" style="cursor:pointer;">
          <div class="mini-deal-img-wrap">
            <img class="mini-deal-img" src="${p.image_url}" alt="${prodName}" loading="lazy" onerror="window.handleProductImgError(this)" />
            <span class="promo-pill">-${totalDiscount || 25}%</span>
          </div>
          <h4 class="mini-deal-title">${prodName}</h4>
          ${dealTimeStr ? `<div class="deal-countdown-pill" data-end-date="${matchingDeal.end_date}">${dealTimeStr}</div>` : ''}
          <div class="price-wrap">
            <span class="current-deal-price">${Number(p.price).toFixed(2)} ${currencyLabel}</span>
            ${displayOrigPrice ? `<span class="original-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
          </div>
          <button class="btn-add-cart" style="width:100%; min-height:44px; font-size:0.8rem; justify-content:center;" onclick="event.stopPropagation(); window.app.addToCart('${p.product_id}')">
            ${this.i18n.t('add_to_cart')}
          </button>
        </div>
      `;
    }).join('');

    // Render Deals Pagination
    this.renderPaginationControls({
      container: this.dealsPaginationContainer,
      currentPage: this.dealsCurrentPage,
      totalPages,
      totalItems: totalDeals,
      onPageChange: (newPage) => {
        this.dealsCurrentPage = newPage;
        this.renderDealsShowcase();
        const target = document.getElementById('promo-showcase-section');
        this.scrollToSection(target, -75);
      },
      ariaLabel: this.i18n.t('deals_banner_title')
    });
  }

  renderBundlesShowcase() {
    if (!this.bundlesShowcaseGrid) return;
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const activeBundles = (this.cartManager?.bundles || []).filter(b => 
      b.active !== false && Array.isArray(b.product_ids) && b.product_ids.length >= 2
    );

    if (activeBundles.length === 0) {
      if (this.bundlesShowcaseSection) this.bundlesShowcaseSection.style.display = 'none';
      return;
    }

    if (this.bundlesShowcaseSection) this.bundlesShowcaseSection.style.display = 'block';

    this.bundlesShowcaseGrid.innerHTML = activeBundles.map(bundle => {
      const bTitle = (isArabic && bundle.title_ar) ? bundle.title_ar : (bundle.title_fr || bundle.title);
      const bDesc = (isArabic && bundle.description_ar) ? bundle.description_ar : (bundle.description_fr || bundle.description || '');
      const isDuo = bundle.product_ids.length === 2;
      const packLabel = isDuo 
        ? (isArabic ? 'باقة ثنائية خاصة' : 'PACK DUO PRIVILÈGE') 
        : (isArabic ? 'باقة ثلاثية خاصة' : 'PACK TRIO PRIVILÈGE');

      // Resolve bundle products from loaded catalog
      const bundleProducts = bundle.product_ids.map(id => {
        return this.products.find(p => String(p.product_id) === String(id)) || {
          product_id: id,
          name: `Réf. ${id}`,
          price: 0,
          image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'
        };
      });

      const totalRegPrice = bundleProducts.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
      const packPrice = Number(bundle.bundle_price);
      const savings = Math.max(0, totalRegPrice - packPrice);
      const savingsPercent = totalRegPrice > 0 ? Math.round((savings / totalRegPrice) * 100) : 0;

      return `
        <div class="bundle-showcase-card">
          <div class="bundle-card-top-bar">
            <span>🎁 ${packLabel}</span>
            ${savings > 0 ? `<span class="bundle-savings-badge">${isArabic ? `وفّري ${savings.toFixed(2)} د.ت (-${savingsPercent}%)` : `Économisez ${savings.toFixed(2)} DT (-${savingsPercent}%)`}</span>` : ''}
          </div>

          <div class="bundle-img-stage">
            ${bundleProducts.map((p, idx) => `
              ${idx > 0 ? '<div class="bundle-plus-circle">＋</div>' : ''}
              <div class="bundle-prod-thumb" onclick="window.app.openQuickView('${p.product_id}')" title="${this.getProductName(p)}">
                <img src="${p.image_url}" alt="${this.getProductName(p)}" onerror="window.handleProductImgError(this)" />
                <span>${this.getProductName(p)}</span>
              </div>
            `).join('')}
          </div>

          <div class="bundle-card-body">
            <h4 class="bundle-card-title">${bTitle}</h4>
            ${bDesc ? `<p class="bundle-card-desc">${bDesc}</p>` : ''}
            
            <ul class="bundle-items-checklist">
              ${bundleProducts.map(p => `<li>${this.getProductName(p)} (${Number(p.price).toFixed(2)} ${currencyLabel})</li>`).join('')}
            </ul>

            <div class="bundle-price-row">
              <div class="bundle-price-box">
                ${totalRegPrice > packPrice ? `<span class="bundle-orig-price">${totalRegPrice.toFixed(2)} ${currencyLabel}</span>` : ''}
                <span class="bundle-final-price">${packPrice.toFixed(2)} <small>${currencyLabel}</small></span>
              </div>
              <button type="button" class="btn-add-bundle" onclick="window.app.addBundleToCart('${bundle.id}')">
                🛍️ ${isArabic ? 'إضافة الباقة كاملة' : 'Ajouter le Pack'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  addBundleToCart(bundleId) {
    const bundle = (this.cartManager?.bundles || []).find(b => String(b.id) === String(bundleId));
    if (!bundle || !Array.isArray(bundle.product_ids)) return;

    bundle.product_ids.forEach(pid => {
      this.addProductToCart(pid);
    });

    this.renderCart();
    this.updateCartBadge();
    this.openCartDrawer();
  }

  // =========================================================================
  // Fragrance Classification & Specialized Filtering System
  // =========================================================================
  classifyFragrance(product) {
    if (product._fragranceClassification) {
      return product._fragranceClassification;
    }
    const text = [
      product.name || '',
      product.description || '',
      product.description_fr || '',
      product.benefits || '',
      product.how_to_use || ''
    ].join(' ').toLowerCase();

    // 1. Gender Classification
    let gender = 'Femmes';
    const isMen = /\b(pour lui|homme|man|men|masculin|mister|legend|ascendant|glacier|venture|greater pour lui|nordic waters pour lui|eclat toujours|possess the secret man|giordani gold man|dark wood|north for men)\b/i.test(text);
    const isUnisex = /\b(unisexe|unisex|pour tous|pour homme et femme|top scents|earth wonder)\b/i.test(text);

    if (isUnisex) {
      gender = 'Unisexe';
    } else if (isMen) {
      gender = 'Hommes';
    } else {
      gender = 'Femmes';
    }

    const unisexIds = ['47724', '47726', '46057'];
    const menIds = ['30468', '33650', '35651', '38527', '38538', '38550', '38552', '40667', '42490', '42518', '42816', '42864', '44308', '45357', '45967', '46044', '46045', '46064', '46795', '47502', '48671'];

    if (unisexIds.includes(String(product.product_id))) gender = 'Unisexe';
    if (menIds.includes(String(product.product_id))) gender = 'Hommes';

    // 2. Formulation Classification
    let formulation = 'Eau de toilette';
    if (/\b(brume|mist|body mist|brume parfumée|brume corporelle)\b/i.test(text)) {
      formulation = 'Brume corporelle';
    } else if (/\b(eau de parfum|edp)\b/i.test(text)) {
      formulation = 'Eau de parfum';
    } else if (/\b(extrait de parfum|elixir|parfum floral|concentré de parfum)\b/i.test(text) || (text.includes('parfum') && !text.includes('eau de'))) {
      formulation = 'Parfum';
    } else {
      formulation = 'Eau de toilette';
    }

    // 3. Olfactory Families (multi-family support e.g. "boisée florale" matches both)
    const families = [];

    if (/\b(florale?|fleur|rose|jasmin|ylang|néroli|neroli|tubéreuse|tubereuse|magnolia|orchidée|orchidee|muguet|pivoine|violette|gardénia|gardenia|lys|fleur d'oranger|fleurs blanches)\b/i.test(text)) {
      families.push('Florale');
    }

    if (/\b(bois[ée]?e?s?|cèdre|cedre|santal|patchouli|vétiver|vetiver|oud|gaïac|gaiac|bois de santal|bois de cèdre)\b/i.test(text)) {
      families.push('Boisée');
    }

    if (/\b(ambr[ée]e?s?|oriental[e]?|vanille|tonka|fève tonka|feve tonka|benjoin|résine|resine|épicé[e]?|epice[e]?)\b/i.test(text)) {
      families.push('Ambrée');
    }

    if (/\b(fruit[ée]e?s?|gourmand[e]?|framboise|mûre|mure|pêche|peche|pomme|poire|cassis|fraise|baie|grenade|ananas|passion)\b/i.test(text)) {
      families.push('Fruitée');
    }

    if (/\b(aromatique|lavande|sauge|romarin|thym|menthe|herbacé|cardamome)\b/i.test(text)) {
      families.push('Aromatique');
    }

    if (/\b(agrume|agrumes|hespérid[ée]|hesperid[ée]|bergamote|citron|mandarine|pamplemousse|orange|lime|zeste)\b/i.test(text)) {
      families.push('Agrumes');
    }

    if (/\b(chypr[ée]e?s?|mousse de chêne|mousse de chene)\b/i.test(text)) {
      families.push('Chyprée');
    }

    const classification = { gender, formulation, families };
    product._fragranceClassification = classification;
    return classification;
  }

  bindFragranceFilterEvents() {
    if (!this.fragranceFiltersContainer) return;

    // Filter pill clicks
    this.fragranceFiltersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.fragrance-filter-pill');
      if (!pill || pill.disabled) return;

      const filterType = pill.dataset.filterType;
      const filterVal = pill.dataset.filterVal;
      if (!filterType || !filterVal) return;

      this.setFragranceFilter(filterType, filterVal);
    });

    // Reset button
    if (this.btnResetFragranceFilters) {
      this.btnResetFragranceFilters.addEventListener('click', () => {
        this.resetFragranceFilters();
      });
    }
  }

  setFragranceFilter(filterType, filterVal) {
    if (!this.fragranceFilters) {
      this.fragranceFilters = { gender: 'All', formulation: 'All', family: 'All' };
    }
    this.fragranceFilters[filterType] = filterVal;

    // Update pill UI in that group
    const groupPills = this.fragranceFiltersContainer?.querySelectorAll(`.fragrance-filter-pill[data-filter-type="${filterType}"]`);
    groupPills?.forEach(p => {
      const isSelected = p.dataset.filterVal === filterVal;
      p.classList.toggle('active', isSelected);
      p.setAttribute('aria-pressed', String(isSelected));
    });

    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateFragranceFilterCounts();
  }

  resetFragranceFilters() {
    this.fragranceFilters = { gender: 'All', formulation: 'All', family: 'All' };
    this.syncFragranceFilterPillsUI();
    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateFragranceFilterCounts();
  }

  syncFragranceFilterPillsUI() {
    if (!this.fragranceFiltersContainer) return;
    ['gender', 'formulation', 'family'].forEach(type => {
      const currentVal = (this.fragranceFilters && this.fragranceFilters[type]) ? this.fragranceFilters[type] : 'All';
      const groupPills = this.fragranceFiltersContainer.querySelectorAll(`.fragrance-filter-pill[data-filter-type="${type}"]`);
      groupPills.forEach(p => {
        const isSelected = p.dataset.filterVal === currentVal;
        p.classList.toggle('active', isSelected);
        p.setAttribute('aria-pressed', String(isSelected));
      });
    });
  }

  updateFragranceFilterCounts() {
    if (!this.fragranceFiltersContainer) return;
    const fragranceProducts = this.products.filter(p => p.category === 'Fragrance');

    const pills = this.fragranceFiltersContainer.querySelectorAll('.fragrance-filter-pill');

    pills.forEach(pill => {
      const type = pill.dataset.filterType;
      const val = pill.dataset.filterVal;
      const countEl = pill.querySelector('.filter-count');

      // Calculate count for this option considering active filters in the other dimensions
      const count = fragranceProducts.filter(p => {
        const c = this.classifyFragrance(p);

        // Gender condition
        let matchGender = true;
        if (type === 'gender') {
          matchGender = (val === 'All') ? true : (c.gender === val);
        } else if (this.fragranceFilters.gender !== 'All') {
          matchGender = (c.gender === this.fragranceFilters.gender);
        }

        // Formulation condition
        let matchFormulation = true;
        if (type === 'formulation') {
          matchFormulation = (val === 'All') ? true : (c.formulation === val);
        } else if (this.fragranceFilters.formulation !== 'All') {
          matchFormulation = (c.formulation === this.fragranceFilters.formulation);
        }

        // Family condition
        let matchFamily = true;
        if (type === 'family') {
          matchFamily = (val === 'All') ? true : c.families.includes(val);
        } else if (this.fragranceFilters.family !== 'All') {
          matchFamily = c.families.includes(this.fragranceFilters.family);
        }

        return matchGender && matchFormulation && matchFamily;
      }).length;

      if (countEl) {
        countEl.textContent = `(${count})`;
      }

      // If count is 0 and it is not 'All' and not currently active, disable it
      const isActive = pill.classList.contains('active');
      if (val !== 'All' && count === 0 && !isActive) {
        pill.disabled = true;
        pill.setAttribute('aria-disabled', 'true');
      } else {
        pill.disabled = false;
        pill.removeAttribute('aria-disabled');
      }
    });

    // Summary update
    const activeFiltersList = [];
    if (this.fragranceFilters.gender !== 'All') activeFiltersList.push(this.fragranceFilters.gender);
    if (this.fragranceFilters.formulation !== 'All') activeFiltersList.push(this.fragranceFilters.formulation);
    if (this.fragranceFilters.family !== 'All') activeFiltersList.push(this.fragranceFilters.family);

    if (this.fragranceActiveSummary) {
      if (activeFiltersList.length > 0) {
        this.fragranceActiveSummary.textContent = `Filtres actifs : ${activeFiltersList.join(' • ')}`;
      } else {
        this.fragranceActiveSummary.textContent = 'Tous les parfums affichés';
      }
    }
  }

  // =========================================================================
  // Haircare Classification & Specialized Filtering System
  // =========================================================================
  classifyHaircare(product) {
    if (product._haircareClassification) {
      return product._haircareClassification;
    }
    const name = (product.name || '').toLowerCase();
    const text = [
      product.name || '',
      product.description || '',
      product.description_fr || '',
      product.benefits || '',
      product.how_to_use || ''
    ].join(' ').toLowerCase();

    // 1. PRODUCT TYPE (Type de produit)
    const productTypes = [];

    // Conditionneur (après-shampooing, démêlant, conditionneur)
    if (/\b(conditionneur|après-shampooing|apres-shampooing|démêlant|demelant)\b/i.test(name) || 
        /\b(conditionneur|après-shampooing|apres-shampooing)\b/i.test(text)) {
      productTypes.push('Conditionneur');
    }

    // Masque capillaire (masques à rincer, masques profonds, soins pré-shampooing)
    if (/\b(masque|smoothie|pré-shampooing|pre-shampooing)\b/i.test(name) || 
        /\b(masque capillaire|masque smoothie)\b/i.test(text)) {
      productTypes.push('Masque capillaire');
    }

    // Huile capillaire (huiles de soin, sérums huileux)
    if ((/\bhuile\b/i.test(name) || /\bhuile capillaire\b/i.test(text)) && 
        !/\b(shampoing|shampooing|masque)\b/i.test(name)) {
      productTypes.push('Huile capillaire');
    }

    // Soins sans rinçage (crèmes coiffantes, gels coiffants, sérums protecteurs, sprays sans rinçage)
    if (/\b(sans rinçage|sans rincage|sérum|serum|gel coiffant|crème coiffante|leave-in|cc spray)\b/i.test(name) || 
        /\b(sans rinçage|sans rincage|traitement de nuit|sérum réparateur nuit|gel à tenue|contrôle du style)\b/i.test(text)) {
      if (!productTypes.includes('Huile capillaire')) {
        productTypes.push('Soins sans rinçage');
      }
    }

    // Soins du cuir chevelu (exfoliants, gommages, toniques, lotions, shampoing sec)
    if (/\b(cuir chevelu|exfoliant|gommage|tonique|shampoing sec)\b/i.test(name) || 
        /\b(cuir chevelu|exfolier le cuir chevelu|tonique topique)\b/i.test(text)) {
      productTypes.push('Soins du cuir chevelu');
    }

    // Shampooing (tous types de shampooings, recharges, nettoyants lavants)
    if ((/\b(shampoing|shampooing|nettoyant pour les cheveux)\b/i.test(name) || /\b(shampoing|shampooing)\b/i.test(text)) && 
        !/\b(pré-shampooing|pre-shampooing)\b/i.test(name)) {
      productTypes.push('Shampooing');
    }

    // Outils et accessoires
    if (/\b(brosse|peigne|bonnet|serviette|élastique|accessoire)\b/i.test(name)) {
      productTypes.push('Outils et accessoires');
    }

    // Fallback
    if (productTypes.length === 0) {
      if (name.includes('shamp')) productTypes.push('Shampooing');
      else productTypes.push('Soins sans rinçage');
    }

    // 2. HAIR TYPE (Type de cheveu)
    const hairTypes = [];

    // Cheveux secs
    if (/\b(secs?|sèche|seches?|dry hair)\b/i.test(text) && !/\bshampoing sec\b/i.test(name)) {
      hairTypes.push('Cheveux secs');
    }

    // Cheveux gras
    if (/\b(gras|grasse|sébum|sebum|oil control)\b/i.test(text)) {
      hairTypes.push('Cheveux gras');
    }

    // Cheveux colorés
    if (/\b(colorés?|colores?|couleur|décoloration)\b/i.test(text)) {
      hairTypes.push('Cheveux colorés');
    }

    // Cheveux fins
    if (/\b(fins?|clairsemés?|clairsemes?|fragiles? et clairsemés?)\b/i.test(text)) {
      hairTypes.push('Cheveux fins');
    }

    // Cheveux bouclés / frisés
    if (/\b(bouclés?|boucles?|frisés?|frises?|ondulés?|ondules?|curly)\b/i.test(text)) {
      hairTypes.push('Cheveux bouclés / frisés');
    }

    // Cheveux abîmés / cassants
    if (/\b(abîmés?|abimes?|cassants?|fourchus?|pointes fourchues|intense repair|réparateur|cassent|fragiles?)\b/i.test(text)) {
      hairTypes.push('Cheveux abîmés / cassants');
    }

    // Pellicules / cuir chevelu sensible
    if (/\b(pellicules?|antipelliculaire|cuir chevelu sensible|apaiser le cuir chevelu)\b/i.test(text)) {
      hairTypes.push('Pellicules / cuir chevelu sensible');
    }

    // Cheveux normaux (tous types de cheveux, enfants, usage quotidien)
    if (/\b(tous les types|tous types|normaux?|enfants?|quotidien)\b/i.test(text) || hairTypes.length === 0) {
      hairTypes.push('Cheveux normaux');
    }

    // 3. BENEFIT / CONCERN (Besoin / Problématique)
    const concerns = [];

    if (/\b(hydratant|hydrate|hydratation|nourrissant|nourrit|nutrition|nourris)\b/i.test(text)) {
      concerns.push('Hydratation / nutrition');
    }

    if (/\b(réparateur|répare|réparation|repair|reconstruction|renforce|renforçant|kératine|liaisons|pointes fourchues)\b/i.test(text)) {
      concerns.push('Réparation / reconstruction');
    }

    if (/\b(volume|densité|densite|clairsemés?|augmente le volume)\b/i.test(text)) {
      concerns.push('Volume / densité');
    }

    if (/\b(brillance|brillants?|lumineux|éclat)\b/i.test(text)) {
      concerns.push('Brillance');
    }

    if (/\b(anti[- ]?chute|réduire leur chute|favoriser une croissance)\b/i.test(text)) {
      concerns.push('Anti-chute');
    }

    if (/\b(protecteur de couleur|protège la couleur|couleur|décoloration)\b/i.test(text)) {
      concerns.push('Protection couleur');
    }

    if (/\b(lisse|lissage|discipline|contrôle du style|coiffant|anti-frisottis|soyeux)\b/i.test(text)) {
      concerns.push('Lissage / discipline');
    }

    if (/\b(purifiant|antipelliculaire|pellicules?|détox|detox|exfoliant|exfolie|acide salicylique|clarifie)\b/i.test(text)) {
      concerns.push('Purification / anti-pelliculaire');
    }

    const classification = { productTypes, hairTypes, concerns };
    product._haircareClassification = classification;
    return classification;
  }

  bindHaircareFilterEvents() {
    if (!this.haircareFiltersContainer) return;

    // Filter pill clicks
    this.haircareFiltersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.haircare-filter-pill');
      if (!pill || pill.disabled) return;

      const filterType = pill.dataset.filterType;
      const filterVal = pill.dataset.filterVal;
      if (!filterType || !filterVal) return;

      this.setHaircareFilter(filterType, filterVal);
    });

    // Reset button
    if (this.btnResetHaircareFilters) {
      this.btnResetHaircareFilters.addEventListener('click', () => {
        this.resetHaircareFilters();
      });
    }
  }

  setHaircareFilter(filterType, filterVal) {
    if (!this.haircareFilters) {
      this.haircareFilters = { productType: 'All', hairType: 'All', concern: 'All' };
    }
    const previousVal = this.haircareFilters[filterType] || 'All';
    this.haircareFilters[filterType] = filterVal;

    // Track filter_apply / filter_remove analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      if (filterVal !== 'All') {
        this.telemetry.trackAnalytics('filter_apply', {
          filter_name: filterType,
          filter_value: filterVal,
          category: 'soins_capillaires'
        });
      } else if (previousVal !== 'All') {
        this.telemetry.trackAnalytics('filter_remove', {
          filter_name: filterType,
          filter_value: previousVal
        });
      }
    }

    // Update pill UI in that group
    const groupPills = this.haircareFiltersContainer?.querySelectorAll(`.haircare-filter-pill[data-filter-type="${filterType}"]`);
    groupPills?.forEach(p => {
      const isSelected = p.dataset.filterVal === filterVal;
      p.classList.toggle('active', isSelected);
      p.setAttribute('aria-pressed', String(isSelected));
    });

    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateHaircareFilterCounts();
  }

  resetHaircareFilters() {
    this.haircareFilters = { productType: 'All', hairType: 'All', concern: 'All' };

    // Track filter_reset analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_reset', {
        category: 'soins_capillaires'
      });
    }

    this.syncHaircareFilterPillsUI();
    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateHaircareFilterCounts();

    if (this.haircareResultsAnnouncer) {
      this.haircareResultsAnnouncer.textContent = 'Tous les filtres de soins capillaires ont été réinitialisés.';
    }
  }

  syncHaircareFilterPillsUI() {
    if (!this.haircareFiltersContainer) return;
    ['productType', 'hairType', 'concern'].forEach(type => {
      const currentVal = (this.haircareFilters && this.haircareFilters[type]) ? this.haircareFilters[type] : 'All';
      const groupPills = this.haircareFiltersContainer.querySelectorAll(`.haircare-filter-pill[data-filter-type="${type}"]`);
      groupPills.forEach(p => {
        const isSelected = p.dataset.filterVal === currentVal;
        p.classList.toggle('active', isSelected);
        p.setAttribute('aria-pressed', String(isSelected));
      });
    });
  }

  updateHaircareFilterCounts() {
    if (!this.haircareFiltersContainer) return;
    const haircareProducts = this.products.filter(p => p.category === 'Haircare');

    const pills = this.haircareFiltersContainer.querySelectorAll('.haircare-filter-pill');

    pills.forEach(pill => {
      const type = pill.dataset.filterType;
      const val = pill.dataset.filterVal;
      const countEl = pill.querySelector('.filter-count');

      // Calculate count for this option considering active filters in the other dimensions
      const count = haircareProducts.filter(p => {
        const c = this.classifyHaircare(p);

        // Product Type condition
        let matchType = true;
        if (type === 'productType') {
          matchType = (val === 'All') ? true : c.productTypes.includes(val);
        } else if (this.haircareFilters.productType !== 'All') {
          matchType = c.productTypes.includes(this.haircareFilters.productType);
        }

        // Hair Type condition
        let matchHairType = true;
        if (type === 'hairType') {
          matchHairType = (val === 'All') ? true : c.hairTypes.includes(val);
        } else if (this.haircareFilters.hairType !== 'All') {
          matchHairType = c.hairTypes.includes(this.haircareFilters.hairType);
        }

        // Concern condition
        let matchConcern = true;
        if (type === 'concern') {
          matchConcern = (val === 'All') ? true : c.concerns.includes(val);
        } else if (this.haircareFilters.concern !== 'All') {
          matchConcern = c.concerns.includes(this.haircareFilters.concern);
        }

        return matchType && matchHairType && matchConcern;
      }).length;

      if (countEl) {
        countEl.textContent = `(${count})`;
      }

      // If count is 0 and it is not 'All' and not currently active, disable it
      const isActive = pill.classList.contains('active');
      if (val !== 'All' && count === 0 && !isActive) {
        pill.disabled = true;
        pill.setAttribute('aria-disabled', 'true');
      } else {
        pill.disabled = false;
        pill.removeAttribute('aria-disabled');
      }
    });

    // Summary update
    const activeFiltersList = [];
    if (this.haircareFilters.productType !== 'All') activeFiltersList.push(this.haircareFilters.productType);
    if (this.haircareFilters.hairType !== 'All') activeFiltersList.push(this.haircareFilters.hairType);
    if (this.haircareFilters.concern !== 'All') activeFiltersList.push(this.haircareFilters.concern);

    // Calculate current visible count
    const activeTotal = haircareProducts.filter(p => {
      const c = this.classifyHaircare(p);
      const matchType = (this.haircareFilters.productType === 'All') || c.productTypes.includes(this.haircareFilters.productType);
      const matchHairType = (this.haircareFilters.hairType === 'All') || c.hairTypes.includes(this.haircareFilters.hairType);
      const matchConcern = (this.haircareFilters.concern === 'All') || c.concerns.includes(this.haircareFilters.concern);
      return matchType && matchHairType && matchConcern;
    }).length;

    // Track filter_combination analytics if more than 1 filter is combined
    if (activeFiltersList.length > 1 && this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_combination', {
        filters_list: activeFiltersList.join(', '),
        results_count: activeTotal
      });
    }

    if (this.haircareActiveSummary) {
      if (activeFiltersList.length > 0) {
        this.haircareActiveSummary.textContent = `Filtres actifs (${activeTotal} résultat${activeTotal > 1 ? 's' : ''}) : ${activeFiltersList.join(' • ')}`;
      } else {
        this.haircareActiveSummary.textContent = `Tous les soins capillaires affichés (${haircareProducts.length} produits)`;
      }
    }

    if (this.haircareResultsAnnouncer) {
      this.haircareResultsAnnouncer.textContent = `${activeTotal} produit${activeTotal > 1 ? 's' : ''} trouvé${activeTotal > 1 ? 's' : ''} dans les soins capillaires.`;
    }
  }

  // =========================================================================
  // Skincare Classification & Specialized Filtering System (Option A: Official)
  // =========================================================================
  classifySkincare(product) {
    if (product._skincareClassification) {
      return product._skincareClassification;
    }
    const name = (product.name || '').toLowerCase();
    const desc = (product.description || product.description_fr || '').toLowerCase();
    const suitableFor = (product.suitable_for || '').toLowerCase();
    const benefits = (Array.isArray(product.benefits) ? product.benefits.join(' ') : (product.benefits || '')).toLowerCase();
    const text = [name, desc, benefits, suitableFor].join(' ').toLowerCase();

    // 1. PRODUCT TYPES (shop-by-product)
    const productTypes = [];

    // Soin des yeux / eye-care
    if (/\b(yeux|contour des yeux|paupières|paupieres|regard|eye|cernes|poches)\b/i.test(name) ||
        (/\b(spécifiquement pour le contour des yeux|soin contour des yeux|crème contour des yeux)\b/i.test(desc) && !/\b(éviter|eviter)\b/i.test(desc))) {
      productTypes.push('eye-care');
    }

    // Soin des lèvres / lip-care
    if (/\b(lèvres|levres|tender care|lip|baume à lèvres|baume a levres|soin des lèvres)\b/i.test(name) ||
        (/\b(baume à lèvres|soin des lèvres|nourrir les lèvres)\b/i.test(desc) && !/\bvisage\b/i.test(name))) {
      productTypes.push('lip-care');
    }

    // Protection solaire / sun-care
    if (/\b(ip\s*\d+|spf\s*\d+|sun zone|protection uv|écran solaire|ecran solaire|solaire|protection solaire)\b/i.test(name) ||
        /\b(haute protection uv|filtres uva\/uvb spf)\b/i.test(desc)) {
      productTypes.push('sun-care');
    }

    // Masque / mask
    if (/\b(masque|mask)\b/i.test(name)) {
      productTypes.push('mask');
    }

    // Gommage / Exfoliant / scrub
    if (/\b(gommage|exfoliant|peeling|scrub)\b/i.test(name) || /\b(exfoliant doux|gommage visage)\b/i.test(desc)) {
      productTypes.push('scrub');
    }

    // Nettoyant / cleanser
    if ((/\b(nettoyant|démaquillant|demaquillant|eau micellaire|mousse nettoyante|gel nettoyant|lait nettoyant|huile nettoyante|cleanser|purifiant lavant)\b/i.test(name) ||
         /\b(nettoie en douceur|démaquille|nettoyant moussant)\b/i.test(desc)) &&
        !productTypes.includes('scrub')) {
      productTypes.push('cleanser');
    }

    // Tonique / toner
    if ((/\b(tonique|lotion tonique|brume|essence tonique|mist)\b/i.test(name) ||
         /\b(lotion apaisante|brume pour le visage)\b/i.test(desc)) &&
        !/\b(lotion corps|lotion pour les mains)\b/i.test(name)) {
      productTypes.push('toner');
    }

    // Sérum / serum
    if (/\b(sérum|serum|ampoule|ampoules|capsule|capsules)\b/i.test(name) ||
        (/\b(sérum concentré|sérum activateur)\b/i.test(desc) && !productTypes.includes('eye-care'))) {
      productTypes.push('serum');
    }

    // Crème anti-âge / anti-aging-cream
    if ((/\b(anti-âge|anti-age|anti-rides|antirides|lift|firm|wrinkle|time restore|diamond cellular|royal velvet|e-collagen|ultimate lift|age revive|proceuticals)\b/i.test(name) ||
         /\b(anti-rides|multi-active anti-age|réduit les rides|action anti-âge|stimule le collagène)\b/i.test(desc)) &&
        (/\b(crème|creme|soin de jour|soin de nuit|fluide)\b/i.test(name) || /\b(crème de jour|crème de nuit)\b/i.test(desc)) &&
        !productTypes.includes('eye-care') &&
        !productTypes.includes('serum') &&
        !productTypes.includes('cleanser') &&
        !productTypes.includes('mask')) {
      productTypes.push('anti-aging-cream');
    }

    // Crème hydratante / moisturiser
    if ((/\b(crème|creme|gelée|gelee|fluide|hydratant|nourrissante|soin de jour|soin de nuit|optima|essentials|pure skin|love nature|waunt)\b/i.test(name) ||
         /\b(crème hydratante|hydrate la peau|nourrit intensément)\b/i.test(desc)) &&
        !productTypes.includes('anti-aging-cream') &&
        !productTypes.includes('eye-care') &&
        !productTypes.includes('cleanser') &&
        !productTypes.includes('mask') &&
        !productTypes.includes('scrub') &&
        !productTypes.includes('serum') &&
        !productTypes.includes('lip-care') &&
        !productTypes.includes('sun-care') &&
        !productTypes.includes('toner')) {
      productTypes.push('moisturiser');
    }

    // Fallback
    if (productTypes.length === 0) {
      if (/\b(crème|creme)\b/i.test(name)) productTypes.push('moisturiser');
      else if (/\b(huile)\b/i.test(name)) productTypes.push('serum');
      else productTypes.push('moisturiser');
    }

    // 2. SKIN TYPES (Official skin-type facet)
    const skinTypes = [];

    // dry (Sèche)
    if (/\b(sèche\w*|seche\w*|sèches|seches|très sèche|tiraillement|dessèchement|dry skin)\b/i.test(text) ||
        /\bpeau sèche\b/i.test(suitableFor)) {
      skinTypes.push('dry');
    }

    // oily (Grasse)
    if (/\b(grasse\w*|sébum\w*|sebum\w*|brillance|matifi\w*|purifi\w*|anti-brillance|oily skin)\b/i.test(text) ||
        /\bpeau grasse\b/i.test(suitableFor)) {
      skinTypes.push('oily');
    }

    // combination (Mixte)
    if (/\b(mixte\w*|zone t|combination skin)\b/i.test(text) ||
        /\bpeau mixte\b/i.test(suitableFor)) {
      skinTypes.push('combination');
    }

    // normal (Normale)
    if (/\b(normale\w*|tous types de peaux|tout type de peau|tous types|all skin)\b/i.test(text) ||
        /\b(tous types|normale)\b/i.test(suitableFor)) {
      skinTypes.push('normal');
    }

    // sensitive (Sensible)
    if (/\b(sensible\w*|apais\w*|anti-rougeurs|hypoallergénique|sans parfum|réactive|sensitive skin)\b/i.test(text) ||
        /\bpeau sensible\b/i.test(suitableFor)) {
      skinTypes.push('sensitive');
    }

    // mature (Mature)
    if (/\b(mature\w*|ménopause|perte de densité|relâchement|rides profondes|mature skin)\b/i.test(text) ||
        /\b(time restore|royal velvet|diamond cellular|lift \+ firm)\b/i.test(name)) {
      skinTypes.push('mature');
    }

    // breakout-prone (Peau à imperfections)
    if (/\b(imperfection\w*|acné|bouton\w*|points noirs|purifi\w*|salicylique|clarifi\w*|blemish|pure skin|breakout)\b/i.test(text)) {
      skinTypes.push('breakout-prone');
    }

    if (skinTypes.length === 0) {
      skinTypes.push('normal');
    }

    // 3. BENEFITS (Official benefits facet)
    const benefitsList = [];

    // hydrating (Hydratant)
    if (/\b(hydrat\w*|nourri\w*|dessèchement|soif|plump|repulp\w*|acide hyaluronique|karité|canola|vitamine e)\b/i.test(text)) {
      benefitsList.push('hydrating');
    }

    // smoothing-lines-and-wrinkles (Lisser rides & ridules)
    if (/\b(ride\w*|ridule\w*|lisser les rides|lignes et rides|rides profondes)\b/i.test(text)) {
      benefitsList.push('smoothing-lines-and-wrinkles');
    }

    // anti-aging (Anti-âge)
    if (/\b(anti-âge|anti-age|anti-rides|antirides|vieillissement|jeunesse|collagène|pro-collagène)\b/i.test(text)) {
      benefitsList.push('anti-aging');
    }

    // radiant (Rayonnant / Éclat)
    if (/\b(éclat\w*|eclat\w*|luminosité|terne|radiance|illumin\w*|vitamine c|bonne mine|rayonnant)\b/i.test(text)) {
      benefitsList.push('radiant');
    }

    // even-skin-tone (Teint uniforme / Taches)
    if (/\b(tache\w*|hyperpigmentation|uniformité du teint|teint uniforme|anti-taches|bright intense|brightening)\b/i.test(text)) {
      benefitsList.push('even-skin-tone');
    }

    // firming-lifting (Raffermissement / Lift)
    if (/\b(fermeté|fermete|lift\w*|relâchement|élasticité|elasticite|redessine|raffermiss\w*)\b/i.test(text)) {
      benefitsList.push('firming-lifting');
    }

    // purifying-pore-minimizing (Pores & Purification)
    if (/\b(pore\w*|resserrer les pores|grain de peau|purifi\w*|clarifi\w*)\b/i.test(text)) {
      benefitsList.push('purifying-pore-minimizing');
    }

    // calming-redness-reduction (Calme & Anti-rougeurs)
    if (/\b(apais\w*|rougeur\w*|calm\w*|irritation\w*|réconfort|confort|camomille|aloe vera)\b/i.test(text)) {
      benefitsList.push('calming-redness-reduction');
    }

    // oil-control-mattifying (Contrôle sébum & Matité)
    if (/\b(sébum\w*|sebum\w*|brillance|matifi\w*|anti-brillance|oil-control)\b/i.test(text)) {
      benefitsList.push('oil-control-mattifying');
    }

    // exfoliating (Exfoliant)
    if (/\b(exfoli\w*|gommage|peeling|scrub|acide salicylique|aha)\b/i.test(text)) {
      benefitsList.push('exfoliating');
    }

    const classification = { productTypes, skinTypes, benefits: benefitsList };
    product._skincareClassification = classification;
    return classification;
  }

  bindSkincareFilterEvents() {
    if (!this.skincareFiltersContainer) return;

    // Filter pill clicks
    this.skincareFiltersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.skincare-filter-pill');
      if (!pill || pill.disabled) return;

      const filterType = pill.dataset.filterType;
      const filterVal = pill.dataset.filterVal;
      if (!filterType || !filterVal) return;

      this.setSkincareFilter(filterType, filterVal);
    });

    // Reset button
    if (this.btnResetSkincareFilters) {
      this.btnResetSkincareFilters.addEventListener('click', () => {
        this.resetSkincareFilters();
      });
    }
  }

  setSkincareFilter(filterType, filterVal) {
    if (!this.skincareFilters) {
      this.skincareFilters = { 'product-type': 'All', 'skin-type': 'All', 'benefits': 'All' };
    }
    const previousVal = this.skincareFilters[filterType] || 'All';
    this.skincareFilters[filterType] = filterVal;

    // Track filter_apply / filter_remove analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      if (filterVal !== 'All') {
        this.telemetry.trackAnalytics('filter_apply', {
          filter_name: filterType,
          filter_value: filterVal,
          category: 'soins_de_la_peau'
        });
      } else if (previousVal !== 'All') {
        this.telemetry.trackAnalytics('filter_remove', {
          filter_name: filterType,
          filter_value: previousVal
        });
      }
    }

    // Update URL query with official Oriflame ?filters= format
    try {
      const activePairs = [];
      ['product-type', 'skin-type', 'benefits'].forEach(k => {
        if (this.skincareFilters[k] && this.skincareFilters[k] !== 'All') {
          activePairs.push(`${k}:${this.skincareFilters[k]}`);
        }
      });
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        const newSearch = activePairs.length > 0 ? `?filters=${activePairs.join(';')}` : '';
        const newUrl = `${window.location.pathname}${newSearch}`;
        window.history.replaceState(null, '', newUrl);
      }
    } catch (e) {}

    // Update pill UI in that group
    const groupPills = this.skincareFiltersContainer?.querySelectorAll(`.skincare-filter-pill[data-filter-type="${filterType}"]`);
    groupPills?.forEach(p => {
      const isSelected = p.dataset.filterVal === filterVal;
      p.classList.toggle('active', isSelected);
      p.setAttribute('aria-pressed', String(isSelected));
    });

    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateSkincareFilterCounts();
  }

  resetSkincareFilters() {
    this.skincareFilters = { 'product-type': 'All', 'skin-type': 'All', 'benefits': 'All' };

    // Track filter_reset analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_reset', {
        category: 'soins_de_la_peau'
      });
    }

    try {
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {}

    this.syncSkincareFilterPillsUI();
    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateSkincareFilterCounts();

    if (this.skincareResultsAnnouncer) {
      this.skincareResultsAnnouncer.textContent = 'Tous les filtres de soins de la peau ont été réinitialisés.';
    }
  }

  syncSkincareFilterPillsUI() {
    if (!this.skincareFiltersContainer) return;
    ['product-type', 'skin-type', 'benefits'].forEach(type => {
      const currentVal = (this.skincareFilters && this.skincareFilters[type]) ? this.skincareFilters[type] : 'All';
      const groupPills = this.skincareFiltersContainer.querySelectorAll(`.skincare-filter-pill[data-filter-type="${type}"]`);
      groupPills.forEach(p => {
        const isSelected = p.dataset.filterVal === currentVal;
        p.classList.toggle('active', isSelected);
        p.setAttribute('aria-pressed', String(isSelected));
      });
    });
  }

  updateSkincareFilterCounts() {
    if (!this.skincareFiltersContainer) return;
    const skincareProducts = this.products.filter(p => p.category === 'Skincare');

    const pills = this.skincareFiltersContainer.querySelectorAll('.skincare-filter-pill');

    pills.forEach(pill => {
      const type = pill.dataset.filterType;
      const val = pill.dataset.filterVal;
      const countEl = pill.querySelector('.filter-count');

      // Calculate count for this option considering active filters in the other dimensions
      const count = skincareProducts.filter(p => {
        const c = this.classifySkincare(p);

        // Product Type condition
        let matchType = true;
        if (type === 'product-type') {
          matchType = (val === 'All') ? true : c.productTypes.includes(val);
        } else if (this.skincareFilters['product-type'] !== 'All') {
          matchType = c.productTypes.includes(this.skincareFilters['product-type']);
        }

        // Skin Type condition
        let matchSkinType = true;
        if (type === 'skin-type') {
          matchSkinType = (val === 'All') ? true : c.skinTypes.includes(val);
        } else if (this.skincareFilters['skin-type'] !== 'All') {
          matchSkinType = c.skinTypes.includes(this.skincareFilters['skin-type']);
        }

        // Benefits condition
        let matchBenefits = true;
        if (type === 'benefits') {
          matchBenefits = (val === 'All') ? true : c.benefits.includes(val);
        } else if (this.skincareFilters['benefits'] !== 'All') {
          matchBenefits = c.benefits.includes(this.skincareFilters['benefits']);
        }

        return matchType && matchSkinType && matchBenefits;
      }).length;

      if (countEl) {
        countEl.textContent = `(${count})`;
      }

      // If count is 0 and it is not 'All' and not currently active, disable it
      const isActive = pill.classList.contains('active');
      if (val !== 'All' && count === 0 && !isActive) {
        pill.disabled = true;
        pill.setAttribute('aria-disabled', 'true');
      } else {
        pill.disabled = false;
        pill.removeAttribute('aria-disabled');
      }
    });

    // Summary update with friendly French labels
    const slugLabels = {
      'cleanser': 'Nettoyant', 'toner': 'Tonique', 'serum': 'Sérum', 'moisturiser': 'Crème hydratante',
      'anti-aging-cream': 'Crème anti-âge', 'mask': 'Masque', 'scrub': 'Exfoliant', 'eye-care': 'Soin des yeux',
      'sun-care': 'Protection solaire', 'lip-care': 'Soin des lèvres',
      'dry': 'Peau sèche', 'normal': 'Peau normale', 'oily': 'Peau grasse', 'combination': 'Peau mixte',
      'sensitive': 'Peau sensible', 'mature': 'Peau mature', 'breakout-prone': 'Peau à imperfections',
      'hydrating': 'Hydratant', 'anti-aging': 'Anti-âge', 'smoothing-lines-and-wrinkles': 'Lisser rides',
      'radiant': 'Rayonnant', 'even-skin-tone': 'Teint uniforme', 'firming-lifting': 'Fermeté/Lift',
      'purifying-pore-minimizing': 'Pores', 'calming-redness-reduction': 'Anti-rougeurs',
      'oil-control-mattifying': 'Matité', 'exfoliating': 'Exfoliant'
    };

    const activeFiltersList = [];
    ['product-type', 'skin-type', 'benefits'].forEach(k => {
      const v = this.skincareFilters[k];
      if (v && v !== 'All') {
        activeFiltersList.push(slugLabels[v] || v);
      }
    });

    // Calculate current visible count
    const activeTotal = skincareProducts.filter(p => {
      const c = this.classifySkincare(p);
      const matchType = (this.skincareFilters['product-type'] === 'All') || c.productTypes.includes(this.skincareFilters['product-type']);
      const matchSkinType = (this.skincareFilters['skin-type'] === 'All') || c.skinTypes.includes(this.skincareFilters['skin-type']);
      const matchBenefits = (this.skincareFilters['benefits'] === 'All') || c.benefits.includes(this.skincareFilters['benefits']);
      return matchType && matchSkinType && matchBenefits;
    }).length;

    // Track filter_combination analytics if more than 1 filter is combined
    if (activeFiltersList.length > 1 && this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_combination', {
        filters_list: activeFiltersList.join(', '),
        results_count: activeTotal
      });
    }

    if (this.skincareActiveSummary) {
      if (activeFiltersList.length > 0) {
        this.skincareActiveSummary.textContent = `Filtres actifs (${activeTotal} résultat${activeTotal > 1 ? 's' : ''}) : ${activeFiltersList.join(' • ')}`;
      } else {
        this.skincareActiveSummary.textContent = `Tous les soins de la peau affichés (${skincareProducts.length} produits)`;
      }
    }

    if (this.skincareResultsAnnouncer) {
      this.skincareResultsAnnouncer.textContent = `${activeTotal} produit${activeTotal > 1 ? 's' : ''} trouvé${activeTotal > 1 ? 's' : ''} dans les soins de la peau.`;
    }
  }

  isMultiUseProductFor(product, category) {
    if (!product) return false;
    const pId = String(product.product_id);
    const cat = (category || '').toLowerCase();

    // Check explicit categories array if set
    if (Array.isArray(product.categories)) {
      if (product.categories.some(c => c.toLowerCase() === cat)) return true;
    }

    // Known multi-usage products across categories
    if (cat === 'bodycare' || cat === 'corps-et-bain' || cat === 'corps') {
      return pId === '40844' || pId === '30568' || pId === '35767' || pId === '46632' || pId === '47270' ||
             ['12760', '36151', '36152', '36153', '46989', '47688', '49133'].includes(pId);
    }
    if (cat === 'skincare' || cat === 'soins-de-la-peau') {
      return pId === '30568' || pId === '35767' || pId === '46632' || pId === '47270' ||
             ['12760', '36151', '36152', '36153', '46989', '47688', '49133'].includes(pId);
    }
    if (cat === 'haircare' || cat === 'soins-capillaires' || cat === 'cheveux') {
      return pId === '40844';
    }
    return false;
  }

  classifyBodyCare(product) {
    if (product._bodycareClassification) {
      return product._bodycareClassification;
    }

    const name = (this.getProductName(product) || product.name || '').toLowerCase();
    const desc = (this.getProductDescription(product) || product.description || '').toLowerCase();
    const text = `${name} ${desc}`;

    // 1. PRODUCT TYPES
    const productTypes = [];

    // Gels douche
    if (/\b(gel douche|crème de douche|creme de douche|gel lavant|nettoyant intime|recharge de gel nettoyant)\b/i.test(text) ||
        (/\b(douche|shower)\b/i.test(name) && !/\bhuile\b/i.test(name))) {
      productTypes.push('shower-gel');
    }

    // Savons
    if (/\b(savon|soap)\b/i.test(name)) {
      productTypes.push('soap');
    }

    // Gommages corps
    if (/\b(gommage|exfoliant au sucre|exfoliant corps|body scrub|exfoliant énergisant|exfoliant energisant)\b/i.test(name) ||
        /\b(gommage pour le corps|exfoliant corporel|sucre lissant)\b/i.test(desc)) {
      productTypes.push('body-scrub');
    }

    // Beurres corporels
    if (/\b(beurre corporel|beurre pour le corps|body butter)\b/i.test(name) ||
        (/\b(beurre)\b/i.test(name) && !/\bsavon\b/i.test(name)) ||
        /\btender care\b/i.test(name)) {
      productTypes.push('body-butter');
    }

    // Lotions corporelles
    if (/\b(lotion.*corps|lotion corporelle|lotion visage et corps|lotion adoucissante pour le corps|body lotion)\b/i.test(text)) {
      productTypes.push('body-lotion');
    }

    // Crèmes corporelles (includes body creams, hand creams, foot creams, body gels)
    if (/\b(crème.*corps|creme.*corps|crème parfumée pour le corps|crème pour les mains|creme.*mains|crème.*pieds|creme.*pieds|talons crevassés|the body edition|anti cellulite|anti-cellulite|anti-vergetures|dream cream|crème multi usages)\b/i.test(text) ||
        (/\b(crème|creme|baume)\b/i.test(name) && !productTypes.includes('shower-gel') && !productTypes.includes('body-butter'))) {
      productTypes.push('body-cream');
    }

    // Huiles de douche / bain
    if (/\b(huile de douche|huile de bain|huile corps|shower oil|bath oil|sérum adoucissant pour les pieds)\b/i.test(text)) {
      productTypes.push('bath-shower-oil');
    }

    // Accessoires de bain
    if (/\b(rasoir|lames de rasoir|brosse de massage|lime à pieds|lime a pieds|pince à cuticules|lime à ongles|spatule|loofah|éponge|gant de gommage|brosse à dents|dentifrice|brosse|duo soin)\b/i.test(name)) {
      productTypes.push('bath-accessories');
    }

    // Mousses
    if (/\b(mousse|mousse de rasage|mousse à raser|shaving foam)\b/i.test(name)) {
      productTypes.push('mousse');
    }

    // 2 en 1 (multi-usage, 2-en-1, 3-en-1, mains et corps, cheveux et corps, visage et corps)
    if (/\b(2 en 1|2-en-1|3 en 1|3-en-1|multi usage|multi-usage|multi usages|multi-usages|mains et le corps|mains et corps|visage et corps|cheveux et le corps|cheveux et corps)\b/i.test(text)) {
      productTypes.push('two-in-one');
    }

    // Fallback if none matched
    if (productTypes.length === 0) {
      if (/\b(déodorant|deodorant|anti-transpirant|spray)\b/i.test(text)) {
        productTypes.push('body-lotion');
      } else {
        productTypes.push('body-cream');
      }
    }

    // 2. NEEDS (FILTRE 2 - Par besoin)
    const needs = [];

    // Hydratation
    if (/\b(hydrat\w*|dessèchement|soif|aloe vera|melon|eau de coco|confort|moistur\w*)\b/i.test(text)) {
      needs.push('hydrating');
    }

    // Nutrition
    if (/\b(nourri\w*|beurre de cacao|huile de noix de coco|avocat|macadamia|miel|milk & honey|beurre|riche|baume)\b/i.test(text)) {
      needs.push('nourishing');
    }

    // Exfoliation
    if (/\b(exfoli\w*|gommage|peeling|sucre|lime|cellules mortes|lissant|scrub)\b/i.test(text)) {
      needs.push('exfoliating');
    }

    // Apaisant
    if (/\b(apais\w*|calm\w*|adouciss\w*|intime|sensitive|aloe vera|coton|subzero|réparatrice)\b/i.test(text)) {
      needs.push('calming');
    }

    // Raffermissant
    if (/\b(raffermiss\w*|fermeté|fermete|anti cellulite|anti-cellulite|vergetures|tonifi\w*|lift)\b/i.test(text)) {
      needs.push('firming');
    }

    // Parfum / Plaisir
    if (/\b(parfum\w*|fragrance|senteur|arôme|arome|cassis|framboise|passion|pamplemousse|mangue|fraise|cerise|cherry|spring song|magnolia|essenza|possess|eclat|activelle|giordani)\b/i.test(text)) {
      needs.push('fragrance');
    }

    if (needs.length === 0) {
      needs.push('hydrating');
    }

    const classification = { productTypes, needs };
    product._bodycareClassification = classification;
    return classification;
  }

  bindBodyCareFilterEvents() {
    if (!this.bodycareFiltersContainer) return;

    // Filter pill clicks
    this.bodycareFiltersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.bodycare-filter-pill');
      if (!pill || pill.disabled) return;

      const filterType = pill.dataset.filterType;
      const filterVal = pill.dataset.filterVal;
      if (!filterType || !filterVal) return;

      this.setBodyCareFilter(filterType, filterVal);
    });

    // Reset button
    if (this.btnResetBodycareFilters) {
      this.btnResetBodycareFilters.addEventListener('click', () => {
        this.resetBodyCareFilters();
      });
    }
  }

  setBodyCareFilter(filterType, filterVal) {
    if (!this.bodycareFilters) {
      this.bodycareFilters = { 'product-type': 'All', 'need': 'All' };
    }
    const previousVal = this.bodycareFilters[filterType] || 'All';
    this.bodycareFilters[filterType] = filterVal;

    // Track filter_apply / filter_remove analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      if (filterVal !== 'All') {
        this.telemetry.trackAnalytics('filter_apply', {
          filter_name: filterType,
          filter_value: filterVal,
          category: 'corps_et_bain'
        });
      } else if (previousVal !== 'All') {
        this.telemetry.trackAnalytics('filter_remove', {
          filter_name: filterType,
          filter_value: previousVal
        });
      }
    }

    // Update URL query with format ?filters=product-type:val;need:val
    try {
      const activePairs = [];
      ['product-type', 'need'].forEach(k => {
        if (this.bodycareFilters[k] && this.bodycareFilters[k] !== 'All') {
          activePairs.push(`${k}:${this.bodycareFilters[k]}`);
        }
      });
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        const newSearch = activePairs.length > 0 ? `?filters=${activePairs.join(';')}` : '';
        const newUrl = `${window.location.pathname}${newSearch}`;
        window.history.replaceState(null, '', newUrl);
      }
    } catch (e) {}

    // Update pill UI in that group
    const groupPills = this.bodycareFiltersContainer?.querySelectorAll(`.bodycare-filter-pill[data-filter-type="${filterType}"]`);
    groupPills?.forEach(p => {
      const isSelected = p.dataset.filterVal === filterVal;
      p.classList.toggle('active', isSelected);
      p.setAttribute('aria-pressed', String(isSelected));
    });

    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateBodyCareFilterCounts();
  }

  resetBodyCareFilters() {
    this.bodycareFilters = { 'product-type': 'All', 'need': 'All' };

    // Track filter_reset analytics
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_reset', {
        category: 'corps_et_bain'
      });
    }

    try {
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {}

    this.syncBodyCareFilterPillsUI();
    this.productsCurrentPage = 1;
    this.renderProducts();
    this.updateBodyCareFilterCounts();

    if (this.bodycareResultsAnnouncer) {
      this.bodycareResultsAnnouncer.textContent = 'Tous les filtres de soins du corps et du bain ont été réinitialisés.';
    }
  }

  syncBodyCareFilterPillsUI() {
    if (!this.bodycareFiltersContainer) return;
    ['product-type', 'need'].forEach(type => {
      const currentVal = (this.bodycareFilters && this.bodycareFilters[type]) ? this.bodycareFilters[type] : 'All';
      const groupPills = this.bodycareFiltersContainer.querySelectorAll(`.bodycare-filter-pill[data-filter-type="${type}"]`);
      groupPills.forEach(p => {
        const isSelected = p.dataset.filterVal === currentVal;
        p.classList.toggle('active', isSelected);
        p.setAttribute('aria-pressed', String(isSelected));
      });
    });
  }

  updateBodyCareFilterCounts() {
    if (!this.bodycareFiltersContainer) return;
    const bodyProducts = this.products.filter(p => p.category === 'BodyCare' || this.isMultiUseProductFor(p, 'BodyCare'));

    const pills = this.bodycareFiltersContainer.querySelectorAll('.bodycare-filter-pill');

    pills.forEach(pill => {
      const type = pill.dataset.filterType;
      const val = pill.dataset.filterVal;
      const countEl = pill.querySelector('.filter-count');

      // Calculate count for this option considering active filters in the other dimensions
      const count = bodyProducts.filter(p => {
        const c = this.classifyBodyCare(p);

        // Product Type condition
        let matchType = true;
        if (type === 'product-type') {
          matchType = (val === 'All') ? true : c.productTypes.includes(val);
        } else if (this.bodycareFilters['product-type'] !== 'All') {
          matchType = c.productTypes.includes(this.bodycareFilters['product-type']);
        }

        // Need condition
        let matchNeed = true;
        if (type === 'need') {
          matchNeed = (val === 'All') ? true : c.needs.includes(val);
        } else if (this.bodycareFilters['need'] !== 'All') {
          matchNeed = c.needs.includes(this.bodycareFilters['need']);
        }

        return matchType && matchNeed;
      }).length;

      if (countEl) {
        countEl.textContent = `(${count})`;
      }

      // If count is 0 and it is not 'All' and not currently active, disable it
      const isActive = pill.classList.contains('active');
      if (val !== 'All' && count === 0 && !isActive) {
        pill.disabled = true;
        pill.setAttribute('aria-disabled', 'true');
      } else {
        pill.disabled = false;
        pill.removeAttribute('aria-disabled');
      }
    });

    const slugLabels = {
      'body-cream': 'Crèmes corporelles', 'body-lotion': 'Lotions corporelles',
      'shower-gel': 'Gels douche', 'soap': 'Savons', 'body-scrub': 'Gommages corps',
      'body-butter': 'Beurres corporels', 'bath-shower-oil': 'Huiles de douche / bain',
      'bath-accessories': 'Accessoires de bain', 'mousse': 'Mousses', 'two-in-one': '2 en 1',
      'hydrating': 'Hydratation', 'nourishing': 'Nutrition', 'exfoliating': 'Exfoliation',
      'calming': 'Apaisant', 'firming': 'Raffermissant', 'fragrance': 'Parfum / Plaisir'
    };

    const activeFiltersList = [];
    ['product-type', 'need'].forEach(k => {
      const v = this.bodycareFilters[k];
      if (v && v !== 'All') {
        activeFiltersList.push(slugLabels[v] || v);
      }
    });

    // Calculate current visible count
    const activeTotal = bodyProducts.filter(p => {
      const c = this.classifyBodyCare(p);
      const matchType = (this.bodycareFilters['product-type'] === 'All') || c.productTypes.includes(this.bodycareFilters['product-type']);
      const matchNeed = (this.bodycareFilters['need'] === 'All') || c.needs.includes(this.bodycareFilters['need']);
      return matchType && matchNeed;
    }).length;

    // Track filter_combination analytics if more than 1 filter is combined
    if (activeFiltersList.length > 1 && this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      this.telemetry.trackAnalytics('filter_combination', {
        filters_list: activeFiltersList.join(', '),
        results_count: activeTotal,
        category: 'corps_et_bain'
      });
    }

    if (this.bodycareActiveSummary) {
      if (activeFiltersList.length > 0) {
        this.bodycareActiveSummary.textContent = `Filtres actifs (${activeTotal} résultat${activeTotal > 1 ? 's' : ''}) : ${activeFiltersList.join(' • ')}`;
      } else {
        this.bodycareActiveSummary.textContent = `Tous les soins du corps et du bain affichés (${bodyProducts.length} produits)`;
      }
    }

    if (this.bodycareResultsAnnouncer) {
      this.bodycareResultsAnnouncer.textContent = `${activeTotal} produit${activeTotal > 1 ? 's' : ''} trouvé${activeTotal > 1 ? 's' : ''} dans les soins du corps et du bain.`;
    }
  }

  getCategoryDisplayName(category) {
    const isArabic = this.i18n.getLang() === 'ar';
    const isEnglish = this.i18n.getLang() === 'en';
    switch (category) {
      case 'BodyCare':
        return isArabic ? '🧴 الجسم والاستحمام' : (isEnglish ? '🧴 Bath & Body' : '🧴 Corps & Bain');
      case 'Skincare':
        return isArabic ? '✨ العناية بالبشرة' : (isEnglish ? '✨ Skin Care' : '✨ Soins de la peau');
      case 'Haircare':
        return isArabic ? '💇‍♀️ العناية بالشعر' : (isEnglish ? '💇‍♀️ Hair Care' : '💇‍♀️ Soins capillaires');
      case 'Fragrance':
        return isArabic ? '🌸 العطور' : (isEnglish ? '🌸 Fragrances' : '🌸 Parfums');
      case 'Makeup':
        return isArabic ? '💄 المكياج' : (isEnglish ? '💄 Makeup' : '💄 Maquillage');
      case 'Deals':
        return isArabic ? '🔥 العروض الخاصة' : (isEnglish ? '🔥 Special Deals' : '🔥 Offres Spéciales');
      case 'Bundles':
        return isArabic ? '🎁 المجموعات' : (isEnglish ? '🎁 Bundles' : '🎁 Coffrets & Packs');
      default:
        return category || 'Tous les produits';
    }
  }

  updateGlobalNavigationUI() {
    if (!this.globalNavigationBar || !this.globalBreadcrumbList) return;

    const isHome = (this.activeCategory === 'All' && !this.searchQuery);
    if (isHome) {
      this.globalNavigationBar.style.display = 'none';
      return;
    }

    this.globalNavigationBar.style.display = 'flex';

    const isArabic = this.i18n.getLang() === 'ar';
    const homeLabel = isArabic ? 'الرئيسية' : 'Accueil';
    const catDisplayName = this.getCategoryDisplayName(this.activeCategory);

    // Collect active sub-filter label if any
    let activeSubFilterLabel = null;
    if (this.searchQuery) {
      activeSubFilterLabel = `Recherche : "${this.searchQuery}"`;
    } else if (this.activeCategory === 'BodyCare' && this.bodycareFilters) {
      const type = this.bodycareFilters['product-type'];
      const need = this.bodycareFilters['need'];
      const parts = [];
      if (type && type !== 'All') {
        const typeLabels = {
          'body-cream': 'Crèmes corporelles', 'body-lotion': 'Lotions corporelles',
          'shower-gel': 'Gels douche', 'soap': 'Savons', 'body-scrub': 'Gommages corps',
          'body-butter': 'Beurres corporels', 'bath-shower-oil': 'Huiles de douche',
          'bath-accessories': 'Accessoires', 'mousse': 'Mousses', 'two-in-one': '2 en 1'
        };
        parts.push(typeLabels[type] || type);
      }
      if (need && need !== 'All') {
        const needLabels = {
          'hydrating': 'Hydratation', 'nourishing': 'Nutrition',
          'exfoliating': 'Exfoliation', 'calming': 'Apaisant',
          'firming': 'Raffermissant', 'fragrance': 'Parfum / Plaisir'
        };
        parts.push(needLabels[need] || need);
      }
      if (parts.length > 0) activeSubFilterLabel = parts.join(' • ');
    } else if (this.activeCategory === 'Haircare' && this.haircareFilters) {
      const p = this.haircareFilters.productType;
      const h = this.haircareFilters.hairType;
      const c = this.haircareFilters.concern;
      const parts = [];
      if (p && p !== 'All') parts.push(p);
      if (h && h !== 'All') parts.push(h);
      if (c && c !== 'All') parts.push(c);
      if (parts.length > 0) activeSubFilterLabel = parts.join(' • ');
    } else if (this.activeCategory === 'Skincare' && this.skincareFilters) {
      const t = this.skincareFilters['product-type'];
      const s = this.skincareFilters['skin-type'];
      const b = this.skincareFilters['benefits'];
      const parts = [];
      if (t && t !== 'All') parts.push(t);
      if (s && s !== 'All') parts.push(s);
      if (b && b !== 'All') parts.push(b);
      if (parts.length > 0) activeSubFilterLabel = parts.join(' • ');
    } else if (this.activeCategory === 'Fragrance' && this.fragranceFilters) {
      const g = this.fragranceFilters.gender;
      const f = this.fragranceFilters.family;
      const parts = [];
      if (g && g !== 'All') parts.push(g);
      if (f && f !== 'All') parts.push(f);
      if (parts.length > 0) activeSubFilterLabel = parts.join(' • ');
    }

    let itemsHtml = `
      <li class="breadcrumb-item ${activeSubFilterLabel ? 'breadcrumb-item-collapsed' : ''}" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a href="/" class="breadcrumb-link" data-action="nav-home" itemprop="item"><span itemprop="name">${homeLabel}</span></a>
        <meta itemprop="position" content="1" />
      </li>
      <li class="breadcrumb-separator ${activeSubFilterLabel ? 'breadcrumb-item-collapsed' : ''}" aria-hidden="true">›</li>
    `;

    if (activeSubFilterLabel) {
      itemsHtml += `
        <span class="breadcrumb-ellipsis-mobile" aria-hidden="true">… ›</span>
        <li class="breadcrumb-item" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
          <a href="#" class="breadcrumb-link" data-action="nav-cat" data-category="${this.activeCategory}" itemprop="item"><span itemprop="name">${catDisplayName}</span></a>
          <meta itemprop="position" content="2" />
        </li>
        <li class="breadcrumb-separator" aria-hidden="true">›</li>
        <li class="breadcrumb-item active" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" aria-current="page">
          <span itemprop="name">${activeSubFilterLabel}</span>
          <meta itemprop="position" content="3" />
        </li>
      `;
    } else {
      itemsHtml += `
        <li class="breadcrumb-item active" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" aria-current="page">
          <span itemprop="name">${catDisplayName}</span>
          <meta itemprop="position" content="2" />
        </li>
      `;
    }

    this.globalBreadcrumbList.innerHTML = itemsHtml;
  }

  navigateToHome() {
    this.activeCategory = 'All';
    this.searchQuery = '';
    if (this.searchInput) this.searchInput.value = '';
    this.productsCurrentPage = 1;

    // Reset filter states
    if (this.fragranceFilters) this.fragranceFilters = { gender: 'All', formulation: 'All', family: 'All' };
    if (this.haircareFilters) this.haircareFilters = { productType: 'All', hairType: 'All', concern: 'All' };
    if (this.skincareFilters) this.skincareFilters = { 'product-type': 'All', 'skin-type': 'All', 'benefits': 'All' };
    if (this.bodycareFilters) this.bodycareFilters = { 'product-type': 'All', 'need': 'All' };

    // Hide specialized filter containers
    if (this.fragranceFiltersContainer) this.fragranceFiltersContainer.style.display = 'none';
    if (this.haircareFiltersContainer) this.haircareFiltersContainer.style.display = 'none';
    if (this.skincareFiltersContainer) this.skincareFiltersContainer.style.display = 'none';
    if (this.bodycareFiltersContainer) this.bodycareFiltersContainer.style.display = 'none';

    // Update category pills UI
    if (this.categoryPillsContainer) {
      this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.category === 'All');
      });
    }

    // Sync mobile drawer active class
    if (this.mobileNavDrawer) {
      this.mobileNavDrawer.querySelectorAll('.drawer-nav-item[data-category]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === 'All');
      });
    }

    // Sync sub-filter UI
    this.syncFragranceFilterPillsUI?.();
    this.syncHaircareFilterPillsUI?.();
    this.syncSkincareFilterPillsUI?.();
    this.syncBodyCareFilterPillsUI?.();

    // Close any open drawers or modals
    this.closeCartDrawer();
    this.closeQuickView();
    this.closeMobileDrawer();

    document.title = "Mouna Nouira — Consultante & Membre Fondateur Oriflame Tunisie | Boutique & Catalogue";

    this.updateUrlHistory({ push: true });
    this.renderProducts();
    this.updateGlobalNavigationUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openMobileDrawer() {
    if (!this.mobileNavDrawer) return;
    this.mobileNavDrawer.style.display = 'flex';
    if (this.mobileNavBackdrop) this.mobileNavBackdrop.style.display = 'block';
    if (this.btnMobileMenu) this.btnMobileMenu.setAttribute('aria-expanded', 'true');
    this.mobileNavDrawer.querySelectorAll('.drawer-nav-item[data-category]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === this.activeCategory);
    });
    setTimeout(() => {
      if (this.btnCloseMobileMenu) this.btnCloseMobileMenu.focus();
    }, 50);
  }

  closeMobileDrawer() {
    if (!this.mobileNavDrawer) return;
    this.mobileNavDrawer.style.display = 'none';
    if (this.mobileNavBackdrop) this.mobileNavBackdrop.style.display = 'none';
    if (this.btnMobileMenu) {
      this.btnMobileMenu.setAttribute('aria-expanded', 'false');
      this.btnMobileMenu.focus();
    }
  }

  updateUrlHistory({ push = true } = {}) {
    if (typeof window === 'undefined' || !window.history) return;

    let targetPath = '/';
    const params = new URLSearchParams();

    if (this.activeCategory === 'BodyCare') {
      targetPath = '/corps-et-bain';
      if (this.bodycareFilters) {
        if (this.bodycareFilters['product-type'] && this.bodycareFilters['product-type'] !== 'All') {
          params.set('type', this.bodycareFilters['product-type']);
        }
        if (this.bodycareFilters['need'] && this.bodycareFilters['need'] !== 'All') {
          params.set('need', this.bodycareFilters['need']);
        }
      }
    } else if (this.activeCategory === 'Skincare') {
      targetPath = '/soins-de-la-peau';
      if (this.skincareFilters) {
        if (this.skincareFilters['product-type'] && this.skincareFilters['product-type'] !== 'All') {
          params.set('type', this.skincareFilters['product-type']);
        }
        if (this.skincareFilters['skin-type'] && this.skincareFilters['skin-type'] !== 'All') {
          params.set('skin', this.skincareFilters['skin-type']);
        }
        if (this.skincareFilters['benefits'] && this.skincareFilters['benefits'] !== 'All') {
          params.set('benefit', this.skincareFilters['benefits']);
        }
      }
    } else if (this.activeCategory === 'Haircare') {
      targetPath = '/soins-capillaires';
      if (this.haircareFilters) {
        if (this.haircareFilters.productType && this.haircareFilters.productType !== 'All') {
          params.set('type', this.haircareFilters.productType);
        }
        if (this.haircareFilters.hairType && this.haircareFilters.hairType !== 'All') {
          params.set('hair', this.haircareFilters.hairType);
        }
        if (this.haircareFilters.concern && this.haircareFilters.concern !== 'All') {
          params.set('concern', this.haircareFilters.concern);
        }
      }
    } else if (this.activeCategory === 'Fragrance') {
      targetPath = '/parfums';
      if (this.fragranceFilters) {
        if (this.fragranceFilters.gender && this.fragranceFilters.gender !== 'All') {
          params.set('gender', this.fragranceFilters.gender);
        }
        if (this.fragranceFilters.formulation && this.fragranceFilters.formulation !== 'All') {
          params.set('formulation', this.fragranceFilters.formulation);
        }
        if (this.fragranceFilters.family && this.fragranceFilters.family !== 'All') {
          params.set('family', this.fragranceFilters.family);
        }
      }
    } else if (this.activeCategory === 'Makeup') {
      targetPath = '/maquillage';
    } else if (this.activeCategory === 'Deals') {
      targetPath = '/';
      params.set('category', 'Deals');
    } else if (this.activeCategory === 'Bundles') {
      targetPath = '/';
      params.set('category', 'Bundles');
    }

    if (this.productsCurrentPage > 1) {
      params.set('page', String(this.productsCurrentPage));
    }
    if (this.searchQuery) {
      params.set('search', this.searchQuery);
    }

    const paramStr = params.toString();
    const newUrl = targetPath + (paramStr ? '?' + paramStr : '');

    const state = {
      category: this.activeCategory,
      page: this.productsCurrentPage,
      search: this.searchQuery,
      scrollY: window.scrollY
    };

    if (window.location.pathname + window.location.search === newUrl) {
      window.history.replaceState(state, '', newUrl);
    } else if (push) {
      window.history.pushState(state, '', newUrl);
    } else {
      window.history.replaceState(state, '', newUrl);
    }
  }

  handlePopState(event) {
    this.handleUrlNavigationParams();
    this.renderProducts();
    this.updateGlobalNavigationUI();
    if (event.state && typeof event.state.scrollY === 'number') {
      window.scrollTo({ top: event.state.scrollY, behavior: 'smooth' });
    }
  }

  selectCategory(categoryName) {
    this.activeCategory = categoryName;
    this.productsCurrentPage = 1;

    if (this.categoryPillsContainer) {
      this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
        const isSelected = p.dataset.category?.toLowerCase() === categoryName.toLowerCase();
        p.classList.toggle('active', isSelected);
      });
    }

    // Sync mobile drawer active class
    if (this.mobileNavDrawer) {
      this.mobileNavDrawer.querySelectorAll('.drawer-nav-item[data-category]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category?.toLowerCase() === categoryName.toLowerCase());
      });
    }

    if (this.fragranceFiltersContainer) {
      this.fragranceFiltersContainer.style.display = (categoryName === 'Fragrance') ? 'block' : 'none';
      if (categoryName === 'Fragrance') this.updateFragranceFilterCounts();
    }

    if (this.haircareFiltersContainer) {
      const isHair = (categoryName === 'Haircare');
      this.haircareFiltersContainer.style.display = isHair ? 'block' : 'none';
      if (this.haircareBreadcrumb) this.haircareBreadcrumb.style.display = isHair ? 'flex' : 'none';
      if (isHair) this.updateHaircareFilterCounts();
    }

    if (this.skincareFiltersContainer) {
      const isSkin = (categoryName === 'Skincare');
      this.skincareFiltersContainer.style.display = isSkin ? 'block' : 'none';
      if (this.skincareBreadcrumb) this.skincareBreadcrumb.style.display = isSkin ? 'flex' : 'none';
      if (isSkin) this.updateSkincareFilterCounts();
    }

    if (this.bodycareFiltersContainer) {
      const isBody = (categoryName === 'BodyCare');
      this.bodycareFiltersContainer.style.display = isBody ? 'block' : 'none';
      if (this.bodycareBreadcrumb) this.bodycareBreadcrumb.style.display = isBody ? 'flex' : 'none';
      if (isBody) this.updateBodyCareFilterCounts();
    }

    this.updateGlobalNavigationUI();
    this.updateUrlHistory({ push: true });
    this.renderProducts();
  }

  handleUrlNavigationParams() {
    try {
      const pathname = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      const catParam = params.get('category');
      const filtersParam = params.get('filters');
      const genderParam = params.get('gender');
      const formulationParam = params.get('formulation');
      const familyParam = params.get('family');

      // 0. BodyCare URL params & clean path
      const isBodyCareBasePath = pathname === '/corps-et-bain' || pathname === '/bodycare' || pathname === '/bath-and-body' || pathname === '/soins-du-corps';
      const isBodyCareCat = catParam && (catParam.toLowerCase() === 'bodycare' || catParam.toLowerCase() === 'corps-et-bain' || catParam.toLowerCase() === 'corps' || catParam.toLowerCase() === 'bain');
      const hasBodyCareFilterSlug = Boolean(filtersParam && (filtersParam.includes('shower-gel') || filtersParam.includes('body-cream') || filtersParam.includes('body-lotion') || filtersParam.includes('soap') || filtersParam.includes('body-butter') || filtersParam.includes('bath-accessories') || filtersParam.includes('two-in-one') || filtersParam.includes('need:')));
      const hasBodyCareDirectParams = params.has('need') || (isBodyCareCat && (params.has('product-type') || params.has('type')));

      // 0b. Skincare URL params
      const isSkincareBasePath = pathname === '/soins-du-visage' || pathname === '/skincare' || pathname === '/soins-de-la-peau';
      const isSkincareCat = catParam && (catParam.toLowerCase() === 'skincare' || catParam.toLowerCase() === 'soins-visage' || catParam.toLowerCase() === 'soins');
      const hasSkincareFilterSlug = Boolean(filtersParam && (filtersParam.includes('skin-type:') || filtersParam.includes('benefits:')));
      const hasSkincareDirectParams = params.has('skin-type') || params.has('skinType') || params.has('benefits') || (isSkincareCat && (params.has('product-type') || params.has('type')));

      if (isBodyCareBasePath || isBodyCareCat || hasBodyCareFilterSlug || hasBodyCareDirectParams) {
        this.activeCategory = 'BodyCare';

        // Update category pills UI
        if (this.categoryPillsContainer) {
          this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
            const isBody = p.dataset.category === 'BodyCare';
            p.classList.toggle('active', isBody);
          });
        }
        if (this.bodycareFiltersContainer) {
          this.bodycareFiltersContainer.style.display = 'block';
        }
        if (this.bodycareBreadcrumb) {
          this.bodycareBreadcrumb.style.display = 'flex';
        }

        // Parse official Oriflame ?filters= format
        if (filtersParam) {
          const facets = filtersParam.split(';');
          facets.forEach(facet => {
            const [name, rawKeys] = facet.split(':');
            if (name && rawKeys) {
              const firstKey = rawKeys.split(',')[0].trim();
              if (name.trim() === 'product-type') this.bodycareFilters['product-type'] = firstKey;
              if (name.trim() === 'need') this.bodycareFilters['need'] = firstKey;
            }
          });
        }

        // Direct query params fallback
        const bodyProductTypeParam = params.get('product-type') || params.get('type') || params.get('productType');
        const bodyNeedParam = params.get('need') || params.get('besoin');

        if (bodyProductTypeParam) this.bodycareFilters['product-type'] = bodyProductTypeParam;
        if (bodyNeedParam) this.bodycareFilters['need'] = bodyNeedParam;

        if (isBodyCareBasePath) {
          document.title = "Soins du corps et du bain — Crèmes, gels douche, gommages | Mouna Nouira — Oriflame Tunisie";
        }

        this.syncBodyCareFilterPillsUI();
        this.updateBodyCareFilterCounts();
      } else if (isSkincareBasePath || isSkincareCat || hasSkincareFilterSlug || hasSkincareDirectParams) {
        this.activeCategory = 'Skincare';

          // Update category pills UI
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              const isSkin = p.dataset.category === 'Skincare';
              p.classList.toggle('active', isSkin);
            });
          }
          if (this.skincareFiltersContainer) {
            this.skincareFiltersContainer.style.display = 'block';
          }
          if (this.skincareBreadcrumb) {
            this.skincareBreadcrumb.style.display = 'flex';
          }

        // Parse official Oriflame ?filters= format (e.g. skin-type:dry;benefits:anti-aging)
        if (filtersParam) {
          const facets = filtersParam.split(';');
          facets.forEach(facet => {
            const [name, rawKeys] = facet.split(':');
            if (name && rawKeys) {
              const firstKey = rawKeys.split(',')[0].trim();
              if (name.trim() === 'product-type') this.skincareFilters['product-type'] = firstKey;
              if (name.trim() === 'skin-type') this.skincareFilters['skin-type'] = firstKey;
              if (name.trim() === 'benefits') this.skincareFilters['benefits'] = firstKey;
            }
          });
        }

        // Fallback to direct query parameters
        const skinProductTypeParam = params.get('product-type') || params.get('type') || params.get('productType');
        const skinTypeParam = params.get('skin-type') || params.get('skinType');
        const skinBenefitsParam = params.get('benefits') || params.get('concern');

        if (skinProductTypeParam) this.skincareFilters['product-type'] = skinProductTypeParam;
        if (skinTypeParam) this.skincareFilters['skin-type'] = skinTypeParam;
        if (skinBenefitsParam) this.skincareFilters['benefits'] = skinBenefitsParam;

        if (isSkincareBasePath) {
          document.title = "Soins de la peau — Sérums, crèmes, nettoyants | Mouna Nouira — Oriflame Tunisie";
        }

        this.syncSkincareFilterPillsUI();
        this.updateSkincareFilterCounts();
      } else {
        // 2. Haircare URL params & clean path
        const isHaircareBasePath = pathname === '/soins-capillaires' || pathname === '/cheveux';
        const productTypeParam = params.get('type') || params.get('productType');
        const hairTypeParam = params.get('hairType');
        const concernParam = params.get('concern');

        if (isHaircareBasePath || (catParam && (catParam.toLowerCase() === 'haircare' || catParam.toLowerCase() === 'cheveux' || catParam.toLowerCase() === 'soins-capillaires')) || productTypeParam || hairTypeParam || concernParam) {
          this.activeCategory = 'Haircare';

          // Update category pills UI
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              const isHair = p.dataset.category === 'Haircare';
              p.classList.toggle('active', isHair);
            });
          }
          if (this.haircareFiltersContainer) {
            this.haircareFiltersContainer.style.display = 'block';
          }
          if (this.haircareBreadcrumb) {
            this.haircareBreadcrumb.style.display = 'flex';
            const ol = this.haircareBreadcrumb.querySelector('.breadcrumb-list');
            if (ol) {
              ol.innerHTML = `
                <li class="breadcrumb-item" itemprop="itemListElement" itemscope itemtype="https://schema.org/BreadcrumbList">
                  <a href="/" class="breadcrumb-link" itemprop="item"><span itemprop="name">Accueil</span></a>
                  <meta itemprop="position" content="1" />
                </li>
                <li class="breadcrumb-separator" aria-hidden="true">›</li>
                <li class="breadcrumb-item active" itemprop="itemListElement" itemscope itemtype="https://schema.org/BreadcrumbList" aria-current="page">
                  <span itemprop="name">Soins capillaires</span>
                  <meta itemprop="position" content="2" />
                </li>
              `;
            }
          }

          if (productTypeParam) this.haircareFilters.productType = productTypeParam;
          if (hairTypeParam) this.haircareFilters.hairType = hairTypeParam;
          if (concernParam) this.haircareFilters.concern = concernParam;

          if (isHaircareBasePath) {
            document.title = "Soins capillaires — Shampooings, masques, huiles | Mouna Nouira — Oriflame Tunisie";
          }

          this.syncHaircareFilterPillsUI();
          this.updateHaircareFilterCounts();
        } else if (pathname === '/parfums' || (catParam && (catParam.toLowerCase() === 'fragrance' || catParam.toLowerCase() === 'parfums')) || genderParam || formulationParam || familyParam) {
          this.activeCategory = 'Fragrance';

          // Update category pills UI
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              const isFrag = p.dataset.category === 'Fragrance';
              p.classList.toggle('active', isFrag);
            });
          }
          if (this.fragranceFiltersContainer) {
            this.fragranceFiltersContainer.style.display = 'block';
          }

          if (genderParam) this.fragranceFilters.gender = genderParam;
          if (formulationParam) this.fragranceFilters.formulation = formulationParam;
          if (familyParam) this.fragranceFilters.family = familyParam;

          if (pathname === '/parfums') {
            document.title = "Parfums — Eaux de parfum, eaux de toilette | Mouna Nouira — Oriflame Tunisie";
          }

          this.syncFragranceFilterPillsUI();
          this.updateFragranceFilterCounts();
        } else if (pathname === '/maquillage' || (catParam && (catParam.toLowerCase() === 'makeup' || catParam.toLowerCase() === 'maquillage'))) {
          this.activeCategory = 'Makeup';

          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              p.classList.toggle('active', p.dataset.category === 'Makeup');
            });
          }

          if (pathname === '/maquillage') {
            document.title = "Maquillage — Teint, yeux, lèvres, ongles | Mouna Nouira — Oriflame Tunisie";
          }
        } else if (catParam && catParam.toLowerCase() === 'deals') {
          this.activeCategory = 'Deals';
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              p.classList.toggle('active', p.dataset.category === 'Deals');
            });
          }
        } else if (catParam && catParam.toLowerCase() === 'bundles') {
          this.activeCategory = 'Bundles';
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              p.classList.toggle('active', p.dataset.category === 'Bundles');
            });
          }
        } else if (pathname === '/' && !catParam) {
          this.activeCategory = 'All';
          if (this.categoryPillsContainer) {
            this.categoryPillsContainer.querySelectorAll('.category-pill').forEach(p => {
              p.classList.toggle('active', p.dataset.category === 'All');
            });
          }
        }
      }

      // Parse pagination page param
      if (params.has('page')) {
        const pNum = parseInt(params.get('page'), 10);
        if (!isNaN(pNum) && pNum > 0) this.productsCurrentPage = pNum;
      }

      // Parse search param
      if (params.has('search')) {
        this.searchQuery = params.get('search').toLowerCase().trim();
        if (this.searchInput) this.searchInput.value = params.get('search');
      }

      // Sync active state on mobile drawer
      if (this.mobileNavDrawer) {
        this.mobileNavDrawer.querySelectorAll('.drawer-nav-item[data-category]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.category === this.activeCategory);
        });
      }

      // Direct Product Modal Opening (e.g. from Social Media Share Link ?prod=12760 or /produit/12760)
      const directProdId = params.get('prod') || params.get('productId') || (pathname.startsWith('/produit/') ? pathname.replace('/produit/', '').split('/')[0] : null);
      if (directProdId) {
        setTimeout(() => {
          if (typeof this.openQuickView === 'function') {
            this.openQuickView(directProdId);
          }
        }, 300);
      }

      // Direct Catalogue Navigation (e.g. from /catalogue or /catalogue-virtuel or ?catalogue=true)
      const isCatalogueRoute = pathname === '/catalogue' || pathname === '/catalogue-virtuel' || pathname === '/ecatalogue' || params.has('catalogue');
      if (isCatalogueRoute) {
        const catPageParam = params.get('page');
        setTimeout(() => {
          const catSec = document.getElementById('catalogue-section');
          if (catSec) {
            catSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          if (catPageParam && window.ecatViewer && typeof window.ecatViewer.goToSpreadByPage === 'function') {
            window.ecatViewer.goToSpreadByPage(parseInt(catPageParam, 10));
          }
        }, 350);
      }

      this.updateGlobalNavigationUI();
    } catch (e) {
      console.warn('[APP] Error handling URL params:', e);
    }
  }

  renderProducts() {
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const filtered = this.products.filter(product => {
      let matchesCategory = false;
      if (this.activeCategory === 'All') matchesCategory = true;
      else if (this.activeCategory === 'Deals') matchesCategory = Boolean(product.is_promo);
      else if (this.activeCategory === 'Bundles') {
        const activeBundlePids = new Set(
          (this.cartManager?.bundles || [])
            .filter(b => b.active !== false && Array.isArray(b.product_ids))
            .flatMap(b => b.product_ids.map(String))
        );
        matchesCategory = activeBundlePids.has(String(product.product_id));
      }
      else {
        matchesCategory = (product.category && product.category.toLowerCase() === this.activeCategory.toLowerCase()) ||
          (Array.isArray(product.categories) && product.categories.some(c => c.toLowerCase() === this.activeCategory.toLowerCase())) ||
          this.isMultiUseProductFor(product, this.activeCategory);
      }

      if (!matchesCategory) return false;

      // Special Fragrance sub-filtering when activeCategory is Fragrance
      if (this.activeCategory === 'Fragrance' && this.fragranceFilters) {
        const c = this.classifyFragrance(product);
        if (this.fragranceFilters.gender && this.fragranceFilters.gender !== 'All' && c.gender !== this.fragranceFilters.gender) {
          return false;
        }
        if (this.fragranceFilters.formulation && this.fragranceFilters.formulation !== 'All' && c.formulation !== this.fragranceFilters.formulation) {
          return false;
        }
        if (this.fragranceFilters.family && this.fragranceFilters.family !== 'All' && !c.families.includes(this.fragranceFilters.family)) {
          return false;
        }
      }

      // Special Haircare sub-filtering when activeCategory is Haircare
      if (this.activeCategory === 'Haircare' && this.haircareFilters) {
        const c = this.classifyHaircare(product);
        if (this.haircareFilters.productType && this.haircareFilters.productType !== 'All' && !c.productTypes.includes(this.haircareFilters.productType)) {
          return false;
        }
        if (this.haircareFilters.hairType && this.haircareFilters.hairType !== 'All' && !c.hairTypes.includes(this.haircareFilters.hairType)) {
          return false;
        }
        if (this.haircareFilters.concern && this.haircareFilters.concern !== 'All' && !c.concerns.includes(this.haircareFilters.concern)) {
          return false;
        }
      }

      // Special Skincare sub-filtering when activeCategory is Skincare
      if (this.activeCategory === 'Skincare' && this.skincareFilters) {
        const c = this.classifySkincare(product);
        const pType = this.skincareFilters['product-type'] || this.skincareFilters.productType;
        const sType = this.skincareFilters['skin-type'] || this.skincareFilters.skinType;
        const bFit = this.skincareFilters['benefits'] || this.skincareFilters.concern;

        if (pType && pType !== 'All' && !c.productTypes.includes(pType)) {
          return false;
        }
        if (sType && sType !== 'All' && !c.skinTypes.includes(sType)) {
          return false;
        }
        if (bFit && bFit !== 'All' && !c.benefits.includes(bFit)) {
          return false;
        }
      }

      // Special BodyCare sub-filtering when activeCategory is BodyCare
      if (this.activeCategory === 'BodyCare' && this.bodycareFilters) {
        const c = this.classifyBodyCare(product);
        const pType = this.bodycareFilters['product-type'] || this.bodycareFilters.productType;
        const pNeed = this.bodycareFilters['need'] || this.bodycareFilters.concern;

        if (pType && pType !== 'All' && !c.productTypes.includes(pType)) {
          return false;
        }
        if (pNeed && pNeed !== 'All' && !c.needs.includes(pNeed)) {
          return false;
        }
      }

      const pName = (this.getProductName(product) || product.name || '').toLowerCase();
      const pDesc = (this.getProductDescription(product) || product.description || '').toLowerCase();
      const pId = (product.product_id || '').toLowerCase();

      const matchesSearch = !this.searchQuery || 
        pName.includes(this.searchQuery) ||
        pDesc.includes(this.searchQuery) ||
        pId.includes(this.searchQuery) ||
        (Array.isArray(product.variants) && product.variants.some(v => 
          String(v.product_id).toLowerCase().includes(this.searchQuery) ||
          String(v.shade_name || '').toLowerCase().includes(this.searchQuery)
        ));
      return matchesSearch;
    });

    // TÂCHE 4 : Trier les produits par remise la plus élevée (ordre décroissant)
    filtered.sort((a, b) => {
      const aMetrics = this.getProductDiscountSortMetrics(a);
      const bMetrics = this.getProductDiscountSortMetrics(b);

      // 1. Remise en pourcentage la plus forte en premier (-55%, -50%, -40%...)
      if (bMetrics.discount !== aMetrics.discount) {
        return bMetrics.discount - aMetrics.discount;
      }
      // 2. Économie monétaire en DT la plus importante
      if (bMetrics.savings !== aMetrics.savings) {
        return bMetrics.savings - aMetrics.savings;
      }
      // 3. Produits en stock en priorité
      if (bMetrics.inStock !== aMetrics.inStock) {
        return bMetrics.inStock ? 1 : -1;
      }
      // 4. Tri stable par référence
      return String(a.product_id).localeCompare(String(b.product_id));
    });

    const totalItems = filtered.length;
    const pageSize = this.getProductPageSize();
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (this.productsCurrentPage > totalPages) this.productsCurrentPage = 1;
    if (this.productsCurrentPage < 1) this.productsCurrentPage = 1;

    const startIndex = (this.productsCurrentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    if (this.productsCount) {
      if (totalItems === 0) {
        this.productsCount.textContent = this.i18n.t('showing_products', { count: 0 });
      } else {
        this.productsCount.textContent = this.i18n.t('position_products', {
          start: startIndex + 1,
          end: endIndex,
          total: totalItems
        });
      }
    }

    if (this.fragranceResultsAnnouncer && this.activeCategory === 'Fragrance') {
      const isArabic = this.i18n.getLang() === 'ar';
      if (isArabic) {
        this.fragranceResultsAnnouncer.textContent = `تم العثور على ${totalItems} عطر.`;
      } else {
        this.fragranceResultsAnnouncer.textContent = `${totalItems} parfum${totalItems > 1 ? 's' : ''} trouvé${totalItems > 1 ? 's' : ''} pour les filtres sélectionnés.`;
      }
    }

    if (this.skincareResultsAnnouncer && this.activeCategory === 'Skincare') {
      const isArabic = this.i18n.getLang() === 'ar';
      if (isArabic) {
        this.skincareResultsAnnouncer.textContent = `تم العثور على ${totalItems} منتج للعناية بالبشرة.`;
      } else {
        this.skincareResultsAnnouncer.textContent = `${totalItems} soin${totalItems > 1 ? 's' : ''} de la peau trouvé${totalItems > 1 ? 's' : ''} pour les filtres sélectionnés.`;
      }
    }

    if (!this.productGrid) return;

    if (totalItems === 0) {
      this.productGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: #8E8D8A;">
          <p style="font-family: var(--font-serif); font-size: 1.3rem; font-weight: 600; color: #18181B; margin-bottom: 8px;">No products found</p>
          <p style="font-size: 0.9rem;">Try adjusting your search query or selecting another category.</p>
        </div>
      `;
      if (this.productsPaginationContainer) {
        this.productsPaginationContainer.style.display = 'none';
        this.productsPaginationContainer.innerHTML = '';
      }
      return;
    }

    const inStockText = this.i18n.t('in_stock');
    const outStockText = this.i18n.t('out_stock');
    const addBtnText = this.i18n.t('add_to_cart');

    this.productGrid.innerHTML = pageItems.map(p => {
      const prodName = this.getProductName(p);
      const prodDesc = this.getProductDescription(p);
      
      // Filter out out-of-stock / exhausted shade variants
      const validVariants = Array.isArray(p.variants) ? p.variants.filter(v => v.in_stock !== false) : [];
      const hasVariants = validVariants.length > 1;
      let initialVariant = null;
      if (hasVariants) {
        if (this.searchQuery) {
          initialVariant = validVariants.find(v => 
            String(v.product_id).toLowerCase().includes(this.searchQuery) ||
            String(v.shade_name || '').toLowerCase().includes(this.searchQuery)
          ) || validVariants[0];
        } else {
          initialVariant = validVariants[0];
        }
      } else if (validVariants.length === 1) {
        initialVariant = validVariants[0];
      }

      const isCardInStock = (Array.isArray(p.variants) && p.variants.length > 0) ? (validVariants.length > 0 && p.in_stock !== false) : (p.in_stock !== false);

      const activePrice = initialVariant ? (initialVariant.price || p.price) : p.price;
      const activeOrigPrice = initialVariant ? (initialVariant.original_price || null) : p.original_price;
      
      const { totalDiscount, isPromo, displayOrigPrice } = this.calculateDiscountMetrics(activePrice, activeOrigPrice, p);

      const defaultAddId = initialVariant ? initialVariant.product_id : p.product_id;
      const initialVariantId = initialVariant ? initialVariant.product_id : '';

      return `
        <div class="product-card" id="card-${p.product_id}">
          <div class="product-image-wrap" onclick="window.app.openQuickView('${p.product_id}', null, '${initialVariantId}')" style="cursor:pointer;">
            <img class="product-image" id="card-img-${p.product_id}" src="${initialVariant?.image_url || p.image_url}" alt="${prodName}" loading="lazy" onerror="window.handleProductImgError(this)" />
            <div id="card-badge-${p.product_id}">
              ${isPromo 
                ? `<span class="promo-badge">-${totalDiscount}%</span>`
                : `<span class="category-badge">${p.category}</span>`
              }
            </div>
            <span class="stock-indicator ${isCardInStock ? 'in-stock' : 'out-stock'}">
              ${isCardInStock ? inStockText : outStockText}
            </span>
          </div>
          <div class="product-body">
            <h4 class="product-title" onclick="window.app.openQuickView('${p.product_id}', null, '${initialVariantId}')" style="cursor:pointer;">${prodName}</h4>
            
            ${hasVariants ? `
              <div class="product-shades-row" onclick="event.stopPropagation();">
                <div class="shades-header-label">
                  <span>🎨 ${validVariants.length} ${isArabic ? 'درجات' : 'Nuances :'}</span>
                  <span class="shade-active-badge" id="shade-badge-${p.product_id}">💄 ${initialVariant.shade_name || initialVariant.product_id}</span>
                </div>
                <div class="shades-swatches-list">
                  ${validVariants.map((v, vIdx) => `
                    <button type="button" 
                      class="shade-swatch-btn ${String(v.product_id) === String(initialVariant.product_id) ? 'active' : ''}" 
                      style="${this.getSwatchStyle(v.hex_color)}" 
                      title="${v.shade_name || v.product_id} (Réf. ${v.product_id})"
                      onclick="window.app.selectCardVariant('${p.product_id}', '${v.product_id}', this)">
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${p.size ? `<div class="product-meta-row"><span>📦 ${p.size}</span></div>` : ''}
            <p class="product-description">${prodDesc || ''}</p>
            ${(() => {
              const cardBundle = (this.cartManager?.bundles || []).find(b =>
                b.active !== false && Array.isArray(b.product_ids) && b.product_ids.map(String).includes(String(p.product_id))
              );
              if (!cardBundle) return '';
              const bLabel = cardBundle.product_ids.length === 2 ? (isArabic ? 'متوفر في باقة ثنائية' : 'Pack Duo dispo') : (isArabic ? 'متوفر في باقة ثلاثية' : 'Pack Trio dispo');
              return `
                <div class="product-bundle-tag" onclick="event.stopPropagation(); window.app.openQuickView('${p.product_id}')" title="${cardBundle.title}">
                  🎁 <strong>${bLabel}</strong>
                  <span style="background: rgba(4,120,87,0.15); padding: 1px 5px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">${cardBundle.bundle_price} DT</span>
                </div>
              `;
            })()}
            <div class="product-footer">
              <div class="price-container">
                ${displayOrigPrice ? `<span class="product-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
                <span class="product-price ${isPromo ? 'promo-price' : ''}">${Number(activePrice).toFixed(2)} <span style="font-size:0.85rem; font-weight:600; color:var(--color-text-secondary);">${currencyLabel}</span></span>
              </div>
              <button class="btn-add-cart" id="btn-add-card-${p.product_id}" ${!isCardInStock ? 'disabled' : ''} onclick="window.app.addToCart('${defaultAddId}')">
                ${addBtnText}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Render Products Pagination
    this.renderPaginationControls({
      container: this.productsPaginationContainer,
      currentPage: this.productsCurrentPage,
      totalPages,
      totalItems,
      onPageChange: (newPage) => {
        this.productsCurrentPage = newPage;
        this.updateUrlHistory({ push: true });
        this.renderProducts();
        const target = document.querySelector('.controls-section') || document.querySelector('.products-header');
        this.scrollToSection(target, -75);
      },
      ariaLabel: this.i18n.t('featured_catalog')
    });
  }

  selectCardVariant(parentId, variantId, btnEl) {
    const parent = this.products.find(p => String(p.product_id) === String(parentId));
    if (!parent || !Array.isArray(parent.variants)) return;
    const variant = parent.variants.find(v => String(v.product_id) === String(variantId));
    if (!variant) return;

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    // Update active class on swatch buttons
    const cardEl = btnEl.closest('.product-card') || document.getElementById(`card-${parentId}`);
    if (cardEl) {
      cardEl.querySelectorAll('.shade-swatch-btn').forEach(b => b.classList.remove('active'));
      btnEl.classList.add('active');

      // Update image
      const imgEl = cardEl.querySelector('.product-image');
      if (imgEl && variant.image_url) {
        imgEl.src = variant.image_url;
      }

      // Update active shade badge text
      const badgeEl = cardEl.querySelector(`#shade-badge-${parentId}`);
      if (badgeEl) {
        badgeEl.textContent = `💄 ${variant.shade_name || variant.product_id}`;
      }

      // Update price display on card with compounding company discount
      const priceContainer = cardEl.querySelector('.price-container');
      const vPrice = variant.price || parent.price;
      const vOrigPrice = variant.original_price;
      const { totalDiscount, isPromo: vIsPromo, displayOrigPrice: vDisplayOrigPrice } = this.calculateDiscountMetrics(vPrice, vOrigPrice, parent);

      if (priceContainer) {
        priceContainer.innerHTML = `
          ${vDisplayOrigPrice ? `<span class="product-price-strike">${Number(vDisplayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
          <span class="product-price ${vIsPromo ? 'promo-price' : ''}">${Number(vPrice).toFixed(2)} <span style="font-size:0.85rem; font-weight:600; color:var(--color-text-secondary);">${currencyLabel}</span></span>
        `;
      }

      // Update badge on card
      const badgeWrap = cardEl.querySelector(`#card-badge-${parentId}`);
      if (badgeWrap) {
        badgeWrap.innerHTML = vIsPromo 
          ? `<span class="promo-badge">-${totalDiscount}%</span>`
          : `<span class="category-badge">${parent.category}</span>`;
      }

      // Update add to cart button
      const addBtn = cardEl.querySelector(`#btn-add-card-${parentId}`);
      if (addBtn) {
        addBtn.setAttribute('onclick', `window.app.addToCart('${variant.product_id}')`);
        addBtn.disabled = !variant.in_stock;
      }
    }
  }

  addProductToCart(productId) {
    if (!productId) return;
    const cleanId = String(productId).trim();

    // 1. Look up in catalog products (direct match or variant match)
    let product = this.products.find(p => String(p.product_id) === cleanId || String(p.id) === cleanId);

    if (!product) {
      // Look if cleanId is a specific variant of a catalog product
      for (const p of this.products) {
        if (Array.isArray(p.variants)) {
          const v = p.variants.find(item => String(item.product_id) === cleanId);
          if (v) {
            product = {
              ...p,
              product_id: v.product_id,
              parent_id: p.product_id,
              name: `${p.name} - ${v.shade_name || v.product_id}`,
              name_fr: `${p.name_fr || p.name} - ${v.shade_name || v.product_id}`,
              shade_name: v.shade_name || '',
              hex_color: v.hex_color || '',
              image_url: v.image_url || p.image_url,
              price: v.price || p.price,
              original_price: v.original_price || p.original_price,
              in_stock: v.in_stock !== false
            };
            break;
          }
        }
      }
    } else if (Array.isArray(product.variants) && product.variants.length > 0) {
      // If product matched main concept ID, enrich with first variant or matching variant
      const v = product.variants.find(item => String(item.product_id) === cleanId) || product.variants[0];
      if (v) {
        product = {
          ...product,
          product_id: v.product_id,
          parent_id: product.product_id,
          name: `${product.name} - ${v.shade_name || v.product_id}`,
          name_fr: `${product.name_fr || product.name} - ${v.shade_name || v.product_id}`,
          shade_name: v.shade_name || '',
          hex_color: v.hex_color || '',
          image_url: v.image_url || product.image_url,
          price: v.price || product.price,
          original_price: v.original_price || product.original_price,
          in_stock: v.in_stock !== false
        };
      }
    }

    // 2. Look up in digital flipbook hotspots
    if (!product && window.ecatViewer && Array.isArray(window.ecatViewer.spreads)) {
      for (const sp of window.ecatViewer.spreads) {
        const h = (sp.hotspots || []).find(hp => String(hp.id) === cleanId || String(hp.product_id) === cleanId);
        if (h) {
          product = {
            product_id: h.id || h.product_id || cleanId,
            name: h.name || `Produit Oriflame (${cleanId})`,
            price: Number(h.price) || 39.9,
            image_url: h.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanId}%2f${cleanId}_1.png&MediaId=20989035&Version=1`,
            category: 'Catalogue',
            in_stock: true
          };
          break;
        }
      }
    }

    // 3. Look up in threshold deals
    if (!product && Array.isArray(this.cartManager.deals)) {
      const deal = this.cartManager.deals.find(d => String(d.product_id) === cleanId);
      if (deal) {
        product = {
          product_id: cleanId,
          name: deal.product_name || `Produit Réf. ${cleanId}`,
          price: deal.product_price ? Number(deal.product_price) : 39.9,
          image_url: deal.product_image || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanId}%2f${cleanId}_1.png&MediaId=20989035&Version=1`,
          category: 'Catalogue',
          in_stock: true
        };
      }
    }

    // 4. Look up in bundles upsells
    if (!product && Array.isArray(this.cartManager.bundles)) {
      const upsells = this.cartManager.getUpsellBundles(this.products);
      for (const u of upsells) {
        const missing = (u.missing_products || []).find(m => String(m.product_id) === cleanId);
        if (missing) {
          product = {
            product_id: cleanId,
            name: missing.name || `Produit Réf. ${cleanId}`,
            price: Number(missing.price) || 39.9,
            image_url: missing.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanId}%2f${cleanId}_1.png&MediaId=20989035&Version=1`,
            category: 'Catalogue',
            in_stock: true
          };
          break;
        }
      }
    }

    // 5. Fallback if product not found anywhere
    if (!product) {
      product = {
        product_id: cleanId,
        name: `Produit Oriflame (${cleanId})`,
        price: 39.9,
        image_url: `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanId}%2f${cleanId}_1.png&MediaId=20989035&Version=1`,
        category: 'Catalogue',
        in_stock: true
      };
    }

    this.cartManager.addItem(product, 1);
    this.renderCart();
    this.updateCartBadge();
    const prodName = product.name || `Réf. ${cleanId}`;
    this.showToast(this.i18n.t('toast_added', { name: prodName }));
    this.telemetry.trackEvent(`Added to cart: ${prodName}`, product.category || 'Deals', prodName);
  }

  addToCart(productId) {
    this.addProductToCart(productId);
  }

  renderCart() {
    if (!this.cartItemsList) return;

    const items = this.cartManager.getCartItems();
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';
    const isMobile = this.cartManager.isMobileDevice();

    if (items.length === 0) {
      this.cartItemsList.innerHTML = `
        <div class="cart-empty-state">
          <p style="font-size: 2.2rem; margin-bottom: 12px; opacity: 0.7;">🛍️</p>
          <p style="font-family: var(--font-serif); font-size: 1.15rem; font-weight: 600; color: #18181B; margin-bottom: 4px;">${this.i18n.t('cart_empty_title')}</p>
          <p style="font-size: 0.85rem; color: #8E8D8A;">${this.i18n.t('cart_empty_desc')}</p>
        </div>
      `;
      if (this.cartSubtotal) this.cartSubtotal.textContent = `0.00 ${currencyLabel}`;
      if (this.cartTotalWithDelivery) this.cartTotalWithDelivery.textContent = `0.000 ${currencyLabel}`;
      if (this.btnGotoDetails) {
        this.btnGotoDetails.disabled = true;
        this.btnGotoDetails.style.opacity = "0.5";
        this.btnGotoDetails.style.pointerEvents = "none";
      }
      if (this.btnMessengerCheckout) {
        this.btnMessengerCheckout.style.opacity = "0.5";
        this.btnMessengerCheckout.style.pointerEvents = "none";
      }
      if (this.btnCopyOrderSummary) {
        this.btnCopyOrderSummary.style.display = "none";
      }
      return;
    }

    if (this.btnGotoDetails) {
      this.btnGotoDetails.disabled = false;
      this.btnGotoDetails.style.opacity = "1";
      this.btnGotoDetails.style.pointerEvents = "auto";
    }

    if (this.btnMessengerCheckout) {
      this.btnMessengerCheckout.style.opacity = "1";
      this.btnMessengerCheckout.style.pointerEvents = "auto";
      this.btnMessengerCheckout.textContent = isMobile 
        ? this.i18n.t('send_messenger_mobile') 
        : this.i18n.t('send_messenger_desktop');

      const fbHandle = this.cleanFbUsername(this.facebookUsername || 'Mounanouira.Oriflame');
      const name = (this.customerNameInput ? this.customerNameInput.value : '').trim();
      const phone = (this.customerPhoneInput ? this.customerPhoneInput.value : '').trim();
      const address = (this.customerAddressInput ? this.customerAddressInput.value : '').trim();
      const msg = this.cartManager.generateOrderTextMessage(name, phone, 'TND', '', address);
      this.btnMessengerCheckout.href = `https://m.me/${fbHandle}?text=${encodeURIComponent(msg)}`;
      this.btnMessengerCheckout.target = "_blank";
    }

    if (this.btnCopyOrderSummary) {
      this.btnCopyOrderSummary.style.display = "flex";
    }

    let html = items.map(item => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image_url}" alt="${item.name}" onerror="window.handleProductImgError(this)" />
        <div class="cart-item-info">
          <div class="cart-item-title">${item.name}</div>
          ${item.shade_name ? `
            <div class="cart-item-shade-tag">
              <span class="cart-item-shade-dot" style="${this.getSwatchStyle(item.hex_color)}"></span>
              <span>${isArabic ? 'الدرجة' : 'Nuance'} : <strong>${item.shade_name}</strong> (Réf. ${item.product_id})</span>
            </div>
          ` : `
            <div style="font-size:0.75rem; color:#8E8D8A; margin-top:2px;">Réf: ${item.product_id}</div>
          `}
          <div class="cart-item-price">${Number(item.price).toFixed(2)} ${currencyLabel}</div>
        </div>
        <div class="cart-item-controls">
          <button class="btn-qty" onclick="window.app.updateCartQty('${item.product_id}', -1)" aria-label="Diminuer la quantité">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="btn-qty" onclick="window.app.updateCartQty('${item.product_id}', 1)" aria-label="Augmenter la quantité">+</button>
          <button class="btn-remove-item" onclick="window.app.removeCartItem('${item.product_id}')" aria-label="Supprimer l'article">✕</button>
        </div>
      </div>
    `).join('');

    // Render Applied Bundle Deals
    const appliedBundles = this.cartManager.getAppliedBundles();
    if (appliedBundles.length > 0) {
      html += `
        <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border: 1px solid #F59E0B; border-radius: 10px; padding: 12px; margin-top: 14px; box-shadow: 0 2px 4px rgba(245,158,11,0.12);">
          <div style="font-weight: 800; font-size: 0.85rem; color: #92400E; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            🎉 ${isArabic ? 'عرض خاص مطبق على السلة !' : 'Offre Pack Spécial Appliquée !'}
          </div>
          ${appliedBundles.map(ab => {
            const bTitle = (isArabic && ab.bundle.title_ar) ? ab.bundle.title_ar : (ab.bundle.title_fr || ab.bundle.title);
            return `
              <div style="font-size: 0.8rem; color: #78350F; display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <span>✨ <strong>${bTitle}</strong></span>
                <span style="font-weight: 800; color: #047857;">-${ab.total_savings.toFixed(2)} ${currencyLabel}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Render Incomplete Bundle Upsells (e.g. Add 1 more item to unlock deal)
    const upsells = this.cartManager.getUpsellBundles(this.products);
    if (upsells.length > 0 && appliedBundles.length === 0) {
      const u = upsells[0];
      const bTitle = (isArabic && u.bundle.title_ar) ? u.bundle.title_ar : (u.bundle.title_fr || u.bundle.title);
      const missing = u.missing_products[0];
      if (missing) {
        html += `
          <div style="background: #F0FDF4; border: 1px dashed #059669; border-radius: 10px; padding: 12px; margin-top: 14px;">
            <div style="font-size: 0.82rem; font-weight: 800; color: #065F46; display: flex; align-items: center; gap: 6px;">
              💡 ${isArabic ? 'أكمل العرض الخاص ووفر أكثر !' : 'Complétez l\'offre Pack Duo/Trio !'}
            </div>
            <p style="font-size: 0.78rem; color: #047857; margin: 4px 0 8px;">
              ${isArabic 
                ? `أضف <strong>${missing.name}</strong> للحصول على <strong>${bTitle}</strong> بسعر ${Number(u.bundle.bundle_price).toFixed(2)} ${currencyLabel} فقط !`
                : `Ajoutez <strong>${missing.name}</strong> pour débloquer le pack <strong>${bTitle}</strong> à <strong>${Number(u.bundle.bundle_price).toFixed(2)} ${currencyLabel}</strong> !`}
            </p>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.78rem; background: #059669; border-color: #047857; width: 100%; display: inline-flex; justify-content: center; align-items: center; gap: 6px;" onclick="window.app.addProductToCart('${missing.product_id}')">
              ➕ ${isArabic ? 'إضافة للمجموعة' : 'Ajouter au Panier & Débloquer'}
            </button>
          </div>
        `;
      }
    }

    // ── Render Applied Threshold Deals ──────────────────────────────────────
    const appliedThresholdDeals = this.cartManager.getAppliedThresholdDeals();
    if (appliedThresholdDeals.length > 0) {
      html += `
        <div style="background: linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%); border: 1.5px solid #7C3AED; border-radius: 10px; padding: 12px; margin-top: 14px; box-shadow: 0 2px 8px rgba(124,58,237,0.1);">
          <div style="font-weight: 800; font-size: 0.85rem; color: #4C1D95; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            🎯 ${isArabic ? 'تم تفعيل عرض العتبة !' : 'Deal Seuil Débloqué !'}
          </div>
          ${appliedThresholdDeals.map(td => {
            const dTitle = (isArabic && td.deal.title_ar) ? td.deal.title_ar : (td.deal.title_fr || 'Deal Seuil');
            const timeLeftStr = td.deal.end_date ? this.formatDealTimeLeft(td.deal.end_date, isArabic) : null;
            const clientDiscount = Math.floor(Number(td.deal.discount_percent));
            return `
              <div style="font-size: 0.8rem; color: #5B21B6; display: flex; justify-content: space-between; align-items: center; margin-top: 4px; background: rgba(255,255,255,0.5); border-radius: 6px; padding: 5px 8px;">
                <div>
                  <span>🏷️ <strong>${dTitle}</strong><br><span style="font-size:0.72rem;opacity:0.8;">-${clientDiscount}% sur ${td.deal.product_name || td.deal.product_id} (${td.discountedPrice.toFixed(2)} ${currencyLabel} au lieu de ${td.originalPrice.toFixed(2)} ${currencyLabel})</span></span>
                  ${timeLeftStr ? `<div class="deal-countdown-pill" data-end-date="${td.deal.end_date}" style="margin:2px 0 0; font-size:0.68rem; padding:1px 6px;">${timeLeftStr}</div>` : ''}
                </div>
                <span style="font-weight: 900; color: #047857; font-size: 0.88rem;">-${td.totalSavings.toFixed(2)} ${currencyLabel}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // ── Render Threshold Deal Suggestions (when deals exist but not fully triggered) ──
    const thresholdSuggestions = this.cartManager.getThresholdDealSuggestions();
    if (thresholdSuggestions.length > 0) {
      const unlockedDeals = thresholdSuggestions.filter(s => s.thresholdMet && !s.productInCart);
      const upcomingDeals = thresholdSuggestions.filter(s => !s.thresholdMet && s.remaining <= Number(s.deal.threshold_amount) * 0.4);

      if (unlockedDeals.length > 0) {
        html += `
          <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%); border: 1.5px solid #F59E0B; border-radius: 10px; padding: 12px; margin-top: 14px; box-shadow: 0 2px 8px rgba(245,158,11,0.15);">
            <div style="font-weight: 800; font-size: 0.85rem; color: #92400E; display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
              🎉 ${isArabic ? 'أنت مؤهل لهذه العروض والخصومات الخاصة !' : 'Vous êtes éligible à ces remises spéciales !'}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${unlockedDeals.map(s => {
                const deal = s.deal;
                const dTitle = (isArabic && deal.title_ar) ? deal.title_ar : (deal.title_fr || 'Offre Spéciale');
                const productName = deal.product_name || deal.product_id;
                const timeLeftStr = deal.end_date ? this.formatDealTimeLeft(deal.end_date, isArabic) : null;
                const baseP = Number(deal.product_price) || 0;
                const dealPrice = baseP > 0 ? (baseP * (1 - Number(deal.discount_percent) / 100)) : 0;
                const clientDiscount = Math.floor(Number(deal.discount_percent));
                const prodImg = deal.product_image || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${deal.product_id}%2f${deal.product_id}_1.png&MediaId=20989035&Version=1`;

                return `
                  <div style="background: rgba(255, 255, 255, 0.85); border: 1px solid #FDE68A; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                      <img src="${prodImg}" alt="${productName}" style="width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: #FFF; border: 1px solid #F3F4F6; flex-shrink: 0;" onerror="this.src='/images/placeholder.png'" />
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.82rem; font-weight: 700; color: #78350F; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${productName}</div>
                        <div style="font-size: 0.74rem; color: #B45309; font-weight: 700; margin-top: 2px;">
                          ${dealPrice > 0 ? `${dealPrice.toFixed(2)} ${currencyLabel}` : ''}
                          ${baseP > 0 ? `<span style="text-decoration: line-through; opacity: 0.55; font-size: 0.7rem; font-weight: normal; color: #6B7280; margin-left: 4px;">${baseP.toFixed(2)} ${currencyLabel}</span>` : ''}
                          <span style="background: #FEE2E2; color: #DC2626; padding: 1px 5px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; margin-left: 4px;">-${clientDiscount}%</span>
                        </div>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; border-top: 1px dashed rgba(245,158,11,0.3); padding-top: 6px;">
                      ${timeLeftStr ? `<div class="deal-countdown-pill" data-end-date="${deal.end_date}" style="margin: 0; font-size: 0.68rem; padding: 2px 6px;">${timeLeftStr}</div>` : '<div></div>'}
                      <button class="btn-primary" style="padding: 5px 12px; font-size: 0.76rem; background: #D97706; border-color: #B45309; display: inline-flex; justify-content: center; align-items: center; gap: 4px; border-radius: 6px; font-weight: 700;" onclick="window.app.addProductToCart('${deal.product_id}')">
                        🎯 ${isArabic ? `إضافة للسلة` : `Ajouter au Panier`}
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      if (upcomingDeals.length > 0 && unlockedDeals.length === 0) {
        const u = upcomingDeals[0];
        const deal = u.deal;
        const productName = deal.product_name || deal.product_id;
        const timeLeftStr = deal.end_date ? this.formatDealTimeLeft(deal.end_date, isArabic) : null;
        const clientDiscount = Math.floor(Number(deal.discount_percent));

        html += `
          <div style="background: #F8FAFC; border: 1px dashed #94A3B8; border-radius: 10px; padding: 10px; margin-top: 14px;">
            <div style="font-size: 0.78rem; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 5px;">
              💡 ${isArabic ? 'فرصة توفير !' : 'Opportunité d\'économie !'}
            </div>
            <p style="font-size: 0.76rem; color: #64748B; margin: 4px 0 0;">
              ${isArabic
                ? `أضف ${Number(u.remaining).toFixed(2)} د.ت أخرى لتحصل على <strong>-${clientDiscount}%</strong> على <strong>${productName}</strong> !`
                : `Ajoutez encore <strong>${Number(u.remaining).toFixed(2)} ${currencyLabel}</strong> pour débloquer <strong>-${clientDiscount}%</strong> sur <strong>${productName}</strong> !`}
            </p>
            ${timeLeftStr ? `<div class="deal-countdown-pill" data-end-date="${deal.end_date}" style="margin:4px 0 0;">${timeLeftStr}</div>` : ''}
          </div>
        `;
      }
    }

    this.cartItemsList.innerHTML = html;

    const rawSubtotal = this.cartManager.getRawSubtotal();
    const bundleDiscount = this.cartManager.getBundleDiscount();
    const thresholdDiscount = this.cartManager.getThresholdDealDiscount();
    const totalDiscount = bundleDiscount + thresholdDiscount;
    const finalSubtotal = this.cartManager.getSubtotal().toFixed(2);

    if (this.cartSubtotal) {
      if (totalDiscount > 0) {
        this.cartSubtotal.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <span style="font-size: 0.8rem; text-decoration: line-through; opacity: 0.6; color: #71717A;">${rawSubtotal.toFixed(2)} ${currencyLabel}</span>
            <span style="font-size: 1.15rem; font-weight: 800; color: #047857;">${finalSubtotal} ${currencyLabel}</span>
            <span style="font-size: 0.72rem; font-weight: 700; color: #B45309; background: #FEF3C7; padding: 2px 6px; border-radius: 4px; margin-top: 2px;">-${totalDiscount.toFixed(2)} ${currencyLabel} ÉCONOMISÉS</span>
          </div>
        `;
      } else {
        this.cartSubtotal.textContent = `${finalSubtotal} ${currencyLabel}`;
      }
    }

    const totalWithDelivery = this.cartManager.getTotalWithDelivery().toFixed(3);
    if (this.cartTotalWithDelivery) {
      this.cartTotalWithDelivery.textContent = `${totalWithDelivery} ${currencyLabel}`;
    }

    if (this.btnMessengerCheckout) {
      const fbHandle = this.cleanFbUsername(this.facebookUsername || 'Mounanouira.Oriflame');
      const name = (this.customerNameInput ? this.customerNameInput.value : '').trim();
      const phone = (this.customerPhoneInput ? this.customerPhoneInput.value : '').trim();
      const address = (this.customerAddressInput ? this.customerAddressInput.value : '').trim();
      this.btnMessengerCheckout.href = this.cartManager.generateMessengerLink(fbHandle, name, phone, 'TND', '', '', address);
      this.btnMessengerCheckout.target = "_blank";
    }
  }

  updateCartQty(productId, delta) {
    this.cartManager.updateQuantity(productId, delta);
  }

  removeCartItem(productId) {
    this.cartManager.removeItem(productId);
  }

  updateCartBadge() {
    const count = this.cartManager.getTotalCount();
    const total = typeof this.cartManager.getSubtotal === 'function' ? this.cartManager.getSubtotal() : 0;

    if (this.cartBadge) {
      this.cartBadge.textContent = count;
      this.cartBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    if (this.headerCartBadge) {
      this.headerCartBadge.textContent = count;
      this.headerCartBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    if (this.floatingCartText) {
      if (count > 0) {
        const isArabic = this.i18n ? this.i18n.getLang() === 'ar' : false;
        const countText = isArabic 
          ? `${count} ${count > 1 ? 'منتجات' : 'منتج'}` 
          : `${count} ${count > 1 ? 'articles' : 'article'}`;
        const currencyText = isArabic ? 'د.ت' : 'DT';
        this.floatingCartText.textContent = `${countText} · ${total.toFixed(2)} ${currencyText}`;
      } else {
        this.floatingCartText.textContent = this.i18n ? this.i18n.t('view_cart') : 'Voir le Panier';
      }
    }
  }

  openCartDrawer() {
    if (this.currentCheckoutStep === 4 || this.cartManager.getTotalCount() === 0) {
      if (typeof this.setCheckoutStep === 'function') {
        this.setCheckoutStep(1);
      }
    }
    if (this.cartDrawerOverlay) this.cartDrawerOverlay.classList.add('open');
    document.body.classList.add('drawer-open');
    if (this.floatingCartBtn) {
      this.floatingCartBtn.style.opacity = '0';
      this.floatingCartBtn.style.visibility = 'hidden';
      this.floatingCartBtn.style.pointerEvents = 'none';
    }
  }

  closeCartDrawer() {
    if (this.cartDrawerOverlay) this.cartDrawerOverlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
    if (this.floatingCartBtn) {
      this.floatingCartBtn.style.opacity = '';
      this.floatingCartBtn.style.visibility = '';
      this.floatingCartBtn.style.pointerEvents = '';
    }
  }

  openModal(overlay) {
    if (overlay) overlay.classList.add('open');
  }

  closeModal(overlay) {
    if (overlay) overlay.classList.remove('open');
  }

  orderProductByCode() {
    const input = document.getElementById('quick-code-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) return;

    // Search in loaded products or spreads
    let product = this.products.find(p => String(p.product_id).includes(code) || p.name.includes(code));
    if (!product && window.ecatViewer) {
      for (const sp of window.ecatViewer.spreads) {
        const h = (sp.hotspots || []).find(hp => String(hp.id).includes(code) || hp.name.includes(code));
        if (h) {
          product = h;
          break;
        }
      }
    }

    if (product) {
      this.addToCart(product.product_id || product.id);
      this.openQuickView(product.product_id || product.id, product);
      input.value = '';
    } else {
      // Auto create custom product order from code
      const customProd = {
        product_id: code,
        name: `Article Réf. ${code} (Catalogue Oriflame)`,
        price: 39.90,
        category: 'Catalogue',
        image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
        in_stock: true
      };
      this.products.push(customProd);
      this.addToCart(code);
      this.openQuickView(code, customProd);
      input.value = '';
    }
  }

  // Rich Product Information Detail Modal with Tabs & Multi-Shade Variants
  openQuickView(productId, directProductObj = null, selectedVariantId = null) {
    let product = directProductObj || this.products.find(p => String(p.product_id) === String(productId));
    let initialVariantId = selectedVariantId || null;

    if (!product) {
      // Look if productId is a variant of any loaded product
      product = this.products.find(p => Array.isArray(p.variants) && p.variants.some(v => String(v.product_id) === String(productId)));
      if (product && !initialVariantId) {
        initialVariantId = productId;
      }
    }
    if (!product || !this.quickViewContent) return;

    const prodName = this.getProductName(product);
    const prodDesc = this.getProductDescription(product);

    this.telemetry.trackEvent(`Opened Detailed Product Info: ${prodName}`, product.category, prodName);

    // Analytics Tracking: product_click & product_view
    if (this.telemetry && typeof this.telemetry.trackAnalytics === 'function') {
      const positionIdx = Array.isArray(this.products) ? this.products.findIndex(p => String(p.product_id) === String(product.product_id)) : -1;
      const isSkin = product.category === 'Skincare' || this.activeCategory === 'Skincare';
      const isHair = product.category === 'Haircare' || this.activeCategory === 'Haircare';
      const isBody = product.category === 'BodyCare' || this.activeCategory === 'BodyCare';

      this.telemetry.trackAnalytics('product_click', {
        product_reference: String(product.product_id),
        product_name: prodName,
        category: isBody ? 'corps_et_bain' : (isSkin ? 'soins_de_la_peau' : (isHair ? 'soins_capillaires' : (product.category || 'Beauty'))),
        position: positionIdx >= 0 ? positionIdx + 1 : 1
      });

      this.telemetry.trackAnalytics('product_view', {
        product_reference: String(product.product_id),
        source: isBody ? 'bodycare_category' : (isSkin ? 'skincare_category' : (isHair ? 'haircare_category' : 'quickview'))
      });
    }

    // ── Meta Pixel: ViewContent standard event ──
    try {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'ViewContent', {
          content_name: prodName,
          content_ids: [String(product.product_id)],
          content_type: 'product',
          content_category: product.category || 'Beauty',
          value: Number(product.price) || 0,
          currency: 'TND'
        });
      }
    } catch (e) {
      console.warn('[Meta Pixel] ViewContent tracking note:', e);
    }

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    // Filter out out-of-stock / exhausted shade variants
    const validVariants = Array.isArray(product.variants) ? product.variants.filter(v => v.in_stock !== false) : [];
    const hasVariants = validVariants.length > 1;
    const activeVariant = hasVariants 
      ? ((initialVariantId && validVariants.find(v => String(v.product_id) === String(initialVariantId))) || validVariants[0])
      : (validVariants[0] || null);

    const activeImage = activeVariant?.image_url || product.image_url;
    const activeRef = activeVariant ? activeVariant.product_id : product.product_id;

    // Format Benefits list
    let benefitsHtml = '';
    if (Array.isArray(product.benefits) && product.benefits.length > 0) {
      benefitsHtml = `<ul class="benefits-list">${product.benefits.map(b => `<li>${b}</li>`).join('')}</ul>`;
    } else {
      benefitsHtml = `<p style="color:var(--color-text-secondary);">${prodDesc || 'Produit de haute qualité Oriflame.'}</p>`;
    }

    const howToUseHtml = product.how_to_use 
      ? `<p style="color:var(--color-text-secondary); line-height:1.7;">${product.how_to_use}</p>`
      : `<p style="color:var(--color-text-muted);">Appliquer selon les recommandations pour cette gamme.</p>`;

    const ingredientsHtml = product.ingredients
      ? `<p style="color:var(--color-text-secondary); line-height:1.7; font-size:0.88rem;">${product.ingredients}</p>`
      : `<p style="color:var(--color-text-muted);">Formulé avec des extraits botaniques et des ingrédients d'origine naturelle.</p>`;

    // Extract gallery images list
    const galleryImages = Array.isArray(product.images) && product.images.length > 0
      ? [activeImage, ...product.images.filter(img => img !== activeImage)]
      : [activeImage];

    this._currentQuickViewImages = galleryImages;
    this._currentQuickViewIndex = 0;

    const hasMultipleImages = galleryImages.length > 1;

    const thumbnailsHtml = hasMultipleImages ? `
      <div class="quickview-thumbnails-row">
        ${galleryImages.map((img, idx) => `
          <button type="button" class="quickview-thumb-item ${idx === 0 ? 'active' : ''}" onclick="window.app.switchQuickViewImage(${idx})" title="Photo ${idx + 1}">
            <img src="${img}" alt="Vue ${idx + 1}" onerror="this.parentElement.style.display='none'" />
          </button>
        `).join('')}
      </div>
    ` : '';

    const navArrowsHtml = hasMultipleImages ? `
      <button type="button" class="gallery-nav-btn prev" onclick="window.app.prevQuickViewImage(event)" aria-label="Précédente">‹</button>
      <button type="button" class="gallery-nav-btn next" onclick="window.app.nextQuickViewImage(event)" aria-label="Suivante">›</button>
    ` : '';

    const activePrice = activeVariant ? (activeVariant.price || product.price) : product.price;
    const activeOrigPrice = activeVariant ? (activeVariant.original_price || null) : product.original_price;

    const { totalDiscount, isPromo, displayOrigPrice } = this.calculateDiscountMetrics(activePrice, activeOrigPrice, product);

    const prodShareUrl = `${window.location.origin}/?prod=${encodeURIComponent(product.product_id)}`;
    const prodShareImg = product.image_url ? (product.image_url.startsWith('http') ? product.image_url : window.location.origin + '/' + product.image_url) : `${window.location.origin}/assets/Oriflame%20by%20Mouna%20Nouira.jpg`;
    const prodShareText = `✨ Découvrez "${prodName}" (${Number(activePrice).toFixed(2)} ${currencyLabel}) sur la boutique Oriflame Tunisie de Mouna Nouira !`;
    const prodEmailSubject = `Recommandation beauté Oriflame : ${prodName}`;
    const prodEmailBody = `Bonjour,\n\nJe te recommande ce produit Oriflame Tunisie chez Mouna Nouira :\n${prodName} (${Number(activePrice).toFixed(2)} ${currencyLabel})\n\nVoir la fiche complète ici :\n${prodShareUrl}`;

    this.quickViewContent.innerHTML = `
        <div class="quickview-gallery-wrapper">
          <div class="quickview-main-image-frame">
            ${navArrowsHtml}
            <img id="quickview-main-image-el" class="quickview-main-img" src="${galleryImages[0]}" alt="${prodName}" onerror="window.handleProductImgError(this)" />
            ${isPromo 
              ? `<span class="promo-badge" style="top:12px; left:12px; position:absolute;">-${totalDiscount}% OFF</span>`
              : `<span class="category-badge" style="top:12px; left:12px; position:absolute;">${product.category}</span>`
            }
          </div>
          ${thumbnailsHtml}
        </div>

        <div>
          <!-- Product Modal Breadcrumb -->
          <nav class="product-modal-breadcrumb" aria-label="Fil d'Ariane" style="margin-bottom: 8px; font-size: 0.84rem; color: #718096; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <a href="/" style="color: #718096; text-decoration: none;" onclick="window.app.closeQuickView(); window.app.navigateToHome(); return false;">Accueil</a>
            <span style="color: #CBD5E0;" aria-hidden="true">›</span>
            <a href="#" style="color: #718096; text-decoration: none;" onclick="window.app.closeQuickView(); window.app.selectCategory('${product.category || 'All'}'); return false;">${this.getCategoryDisplayName(product.category)}</a>
            <span style="color: #CBD5E0;" aria-hidden="true">›</span>
            <span style="font-weight: 700; color: var(--color-primary);" aria-current="page">${prodName}</span>
          </nav>
          <h3 style="font-family: var(--font-serif); font-size: 1.4rem; color: #18181B; margin-bottom: 8px; line-height:1.3;">${prodName}</h3>
          
          ${hasVariants ? `
            <div class="quickview-shades-box">
              <div class="quickview-shades-title">
                <span>🎨 ${isArabic ? 'اختيار الدرجة / اللون' : 'Choix de la Teinte / Nuance'} (${validVariants.length})</span>
                <span class="shade-active-badge" id="qv-active-shade-label">💄 ${activeVariant.shade_name || activeVariant.product_id} • Réf. ${activeVariant.product_id}</span>
              </div>
              <div class="quickview-shades-grid">
                ${validVariants.map((v, vIdx) => `
                  <button type="button" 
                    class="quickview-shade-swatch ${String(v.product_id) === String(activeVariant.product_id) ? 'active' : ''}" 
                    style="${this.getSwatchStyle(v.hex_color)}" 
                    title="${v.shade_name || v.product_id} (Réf. ${v.product_id})"
                    onclick="window.app.selectQuickViewVariant('${product.product_id}', '${v.product_id}', this)">
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Tab Navigation -->
          <div class="product-modal-tabs">
            <button class="product-tab-btn active" onclick="window.app.switchModalTab(event, 'tab-overview')">${this.i18n.t('tab_overview')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-benefits')">${this.i18n.t('tab_benefits')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-how-to-use')">${this.i18n.t('tab_how_to_use')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-ingredients')">${this.i18n.t('tab_ingredients')}</button>
          </div>

          <!-- Tab Content Panes -->
          <div id="tab-overview" class="product-tab-pane active">
            <p style="color: #52525B; line-height: 1.65; margin-bottom: 12px;">${prodDesc || ''}</p>
          </div>

          <div id="tab-benefits" class="product-tab-pane">
            ${benefitsHtml}
          </div>

          <div id="tab-how-to-use" class="product-tab-pane">
            ${howToUseHtml}
          </div>

          <div id="tab-ingredients" class="product-tab-pane">
            ${ingredientsHtml}
          </div>

          <!-- Product Metadata Specs Grid -->
          <div class="info-chip-grid">
            ${product.size ? `
              <div>
                <div class="info-chip-label">${this.i18n.t('product_size_label')}</div>
                <div class="info-chip-value">${product.size}</div>
              </div>
            ` : ''}
            <div>
              <div class="info-chip-label">${this.i18n.t('product_ref_label')}</div>
              <div class="info-chip-value" id="qv-ref-code-chip">${activeRef}</div>
            </div>
            ${product.suitable_for ? `
              <div style="grid-column: 1 / -1;">
                <div class="info-chip-label">${this.i18n.t('product_suitable_label')}</div>
                <div class="info-chip-value">${product.suitable_for}</div>
              </div>
            ` : ''}
          </div>

          <div class="guarantee-note">
            🌿 ${this.i18n.t('guarantee_badge')}
          </div>

          ${(() => {
            const b = (this.cartManager?.bundles || []).find(item =>
              item.active !== false && Array.isArray(item.product_ids) && item.product_ids.map(String).includes(String(product.product_id))
            );
            if (!b) return '';
            const bTitle = (isArabic && b.title_ar) ? b.title_ar : (b.title_fr || b.title);
            const bDesc = (isArabic && b.description_ar) ? b.description_ar : (b.description_fr || b.description || '');
            const otherIds = b.product_ids.filter(id => String(id) !== String(product.product_id));
            const otherProducts = otherIds.map(id => this.products.find(p => String(p.product_id) === String(id))).filter(Boolean);
            const allBundleProds = b.product_ids.map(id => this.products.find(p => String(p.product_id) === String(id))).filter(Boolean);
            const totalOriginal = allBundleProds.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
            const bundlePrice = Number(b.bundle_price);
            const savings = Math.max(0, totalOriginal - bundlePrice);

            return `
              <div class="qv-bundle-upsell-box">
                <div class="qv-bundle-header">
                  <span class="qv-bundle-badge">🎁 ${b.product_ids.length === 2 ? (isArabic ? 'عرض باقة ثنائية خاصة' : 'OFFRE PACK DUO EXCLUSIVE') : (isArabic ? 'عرض باقة ثلاثية خاصة' : 'OFFRE PACK TRIO EXCLUSIVE')}</span>
                  ${savings > 0 ? `<span class="qv-bundle-save">${isArabic ? `وفّري ${savings.toFixed(2)} د.ت` : `Économisez ${savings.toFixed(2)} DT`}</span>` : ''}
                </div>
                <div class="qv-bundle-title">${bTitle}</div>
                ${bDesc ? `<div style="font-size:0.78rem; color:#4B5563; margin-bottom:8px; line-height:1.4;">${bDesc}</div>` : ''}
                <div class="qv-bundle-products-preview">
                  <div class="qv-bundle-prod-item">
                    <img src="${product.image_url}" alt="${prodName}" onerror="window.handleProductImgError(this)" />
                    <span>${prodName}</span>
                  </div>
                  <span style="font-weight:900; color:#059669; font-size:1.1rem; padding:0 2px;">＋</span>
                  ${otherProducts.map(op => `
                    <div class="qv-bundle-prod-item">
                      <img src="${op.image_url}" alt="${this.getProductName(op)}" onerror="window.handleProductImgError(this)" />
                      <span>${this.getProductName(op)}</span>
                    </div>
                  `).join('')}
                </div>
                <div class="qv-bundle-action-row">
                  <div>
                    ${totalOriginal > bundlePrice ? `<span class="bundle-orig-price">${totalOriginal.toFixed(2)} ${currencyLabel}</span> ` : ''}
                    <span style="font-size:1.25rem; font-weight:900; color:#059669;">${bundlePrice.toFixed(2)} <small style="font-size:0.8rem; color:#374151;">${currencyLabel}</small></span>
                  </div>
                  <button type="button" class="btn-add-bundle-qv" onclick="window.app.addBundleToCart('${b.id}'); window.app.closeModal(document.getElementById('quickview-modal-overlay'));">
                    🎁 ${isArabic ? 'إضافة الباقة كاملة' : 'Ajouter le Pack Complet'}
                  </button>
                </div>
              </div>
            `;
          })()}

          <!-- Price & Action Footer -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E8E5DF; padding-top: 18px; margin-top: 18px; flex-wrap: wrap; gap: 12px;">
            <div class="price-container" id="qv-price-container">
              ${displayOrigPrice ? `<span class="product-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
              <span style="font-size: 1.6rem; font-weight: 800; color: ${isPromo ? 'var(--color-promo)' : '#18181B'}; letter-spacing:-0.02em;">${Number(activePrice).toFixed(2)} <span style="font-size:0.95rem; font-weight:600; color:#52525B;">${currencyLabel}</span></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn-add-cart" id="qv-btn-add-cart" style="padding: 0 24px; min-height: 44px;" ${!product.in_stock ? 'disabled' : ''} onclick="window.app.addToCart('${activeRef}'); window.app.closeModal(document.getElementById('quickview-modal-overlay'));">
                ${this.i18n.t('quickview_add')}
              </button>
            </div>
          </div>

          <!-- Dedicated Social Share Section -->
          <div class="product-share-section" role="region" aria-label="Partager ce produit">
            <div class="product-share-header">
              <span class="product-share-label">
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                Partager ce produit :
              </span>
            </div>
            <div class="product-share-buttons">
              <!-- WhatsApp Direct -->
              <a href="https://wa.me/?text=${encodeURIComponent(prodShareText + '\n' + prodShareUrl)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-whatsapp" onclick="window.app.trackShare('WhatsApp', '${product.product_id}')" aria-label="Partager sur WhatsApp" title="Partager sur WhatsApp">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/></svg>
                <span>WhatsApp</span>
              </a>

              <!-- Facebook Direct -->
              <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(prodShareUrl)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-facebook" onclick="window.app.trackShare('Facebook', '${product.product_id}')" aria-label="Partager sur Facebook" title="Partager sur Facebook">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span>Facebook</span>
              </a>

              <!-- Pinterest Direct -->
              <a href="https://pinterest.com/pin/create/button/?url=${encodeURIComponent(prodShareUrl)}&media=${encodeURIComponent(prodShareImg)}&description=${encodeURIComponent(prodShareText)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-pinterest" onclick="window.app.trackShare('Pinterest', '${product.product_id}')" aria-label="Partager sur Pinterest" title="Partager sur Pinterest">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.291 1.199-.332 1.357-.053.224-.174.271-.403.164-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>
                <span>Pinterest</span>
              </a>

              <!-- Twitter/X Direct -->
              <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(prodShareUrl)}&text=${encodeURIComponent(prodShareText)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-x" onclick="window.app.trackShare('Twitter/X', '${product.product_id}')" aria-label="Partager sur X (Twitter)" title="Partager sur X">
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                <span>X</span>
              </a>

              <!-- Email Direct -->
              <a href="mailto:?subject=${encodeURIComponent(prodEmailSubject)}&body=${encodeURIComponent(prodEmailBody)}" class="share-btn share-btn-email" onclick="window.app.trackShare('Email', '${product.product_id}')" aria-label="Partager par Email" title="Partager par Email">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <span>Email</span>
              </a>

              <!-- Instagram Indirect (Copy + Toast instructions) -->
              <button type="button" class="share-btn share-btn-instagram" onclick="window.app.shareIndirect('instagram', '${prodShareUrl}', '${product.product_id}')" aria-label="Partager sur Instagram" title="Partager sur Instagram">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                <span>Instagram</span>
              </button>

              <!-- TikTok Indirect (Copy + Toast instructions) -->
              <button type="button" class="share-btn share-btn-tiktok" onclick="window.app.shareIndirect('tiktok', '${prodShareUrl}', '${product.product_id}')" aria-label="Partager sur TikTok" title="Partager sur TikTok">
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                <span>TikTok</span>
              </button>

              <!-- Universal Copy Link -->
              <button type="button" class="share-btn share-btn-copy" onclick="window.app.copyShareLink('${prodShareUrl}', this, '${product.product_id}')" aria-label="Copier le lien du produit" title="Copier le lien">
                <svg class="icon-copy" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span class="share-copy-text">Copier le lien</span>
              </button>
            </div>
            <div class="sr-only" aria-live="polite" id="product-share-live-announcer"></div>
          </div>
        </div>
      </div>
    `;

    this.openModal(this.quickViewModalOverlay);
  }

  selectQuickViewVariant(parentId, variantId, btnEl) {
    const parent = this.products.find(p => String(p.product_id) === String(parentId));
    if (!parent || !Array.isArray(parent.variants)) return;
    const variant = parent.variants.find(v => String(v.product_id) === String(variantId));
    if (!variant) return;

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    // Update active class on quickview swatches
    const modal = document.getElementById('quickview-modal-overlay');
    if (modal) {
      modal.querySelectorAll('.quickview-shade-swatch').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      // Update main modal image
      const imgEl = document.getElementById('quickview-main-image-el');
      if (imgEl && variant.image_url) {
        imgEl.src = variant.image_url;
      }

      // Update active label
      const labelEl = document.getElementById('qv-active-shade-label');
      if (labelEl) {
        labelEl.textContent = `💄 ${variant.shade_name || variant.product_id} • Réf. ${variant.product_id}`;
      }

      // Update ref chip
      const refChip = document.getElementById('qv-ref-code-chip');
      if (refChip) {
        refChip.textContent = variant.product_id;
      }

      // Update price display in modal with compounding company discount
      const priceContainer = document.getElementById('qv-price-container') || modal.querySelector('.price-container');
      const vPrice = variant.price || parent.price;
      const vOrigPrice = variant.original_price;
      const { totalDiscount, isPromo: vIsPromo, displayOrigPrice: vDisplayOrigPrice } = this.calculateDiscountMetrics(vPrice, vOrigPrice, parent);

      if (priceContainer) {
        priceContainer.innerHTML = `
          ${vDisplayOrigPrice ? `<span class="product-price-strike">${Number(vDisplayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
          <span style="font-size: 1.6rem; font-weight: 800; color: ${vIsPromo ? 'var(--color-promo)' : '#18181B'}; letter-spacing:-0.02em;">${Number(vPrice).toFixed(2)} <span style="font-size:0.95rem; font-weight:600; color:#52525B;">${currencyLabel}</span></span>
        `;
      }

      // Update Add to Cart button
      const addBtn = document.getElementById('qv-btn-add-cart');
      if (addBtn) {
        addBtn.setAttribute('onclick', `window.app.addToCart('${variant.product_id}'); window.app.closeModal(document.getElementById('quickview-modal-overlay'));`);
        addBtn.disabled = !variant.in_stock;
      }
    }
  }

  switchModalTab(event, targetTabId) {
    document.querySelectorAll('.product-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.product-tab-pane').forEach(pane => pane.classList.remove('active'));

    event.currentTarget.classList.add('active');
    const targetPane = document.getElementById(targetTabId);
    if (targetPane) targetPane.classList.add('active');
  }

  switchQuickViewImage(index) {
    if (!this._currentQuickViewImages || !this._currentQuickViewImages[index]) return;
    this._currentQuickViewIndex = index;
    const mainImg = document.getElementById('quickview-main-image-el');
    if (mainImg) {
      mainImg.style.opacity = '0.3';
      setTimeout(() => {
        mainImg.src = this._currentQuickViewImages[index];
        mainImg.style.opacity = '1';
      }, 120);
    }
    const thumbs = document.querySelectorAll('.quickview-thumb-item');
    thumbs.forEach((th, idx) => {
      if (idx === index) th.classList.add('active');
      else th.classList.remove('active');
    });
  }

  prevQuickViewImage(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!this._currentQuickViewImages || this._currentQuickViewImages.length <= 1) return;
    const nextIdx = (this._currentQuickViewIndex - 1 + this._currentQuickViewImages.length) % this._currentQuickViewImages.length;
    this.switchQuickViewImage(nextIdx);
  }

  nextQuickViewImage(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!this._currentQuickViewImages || this._currentQuickViewImages.length <= 1) return;
    const nextIdx = (this._currentQuickViewIndex + 1) % this._currentQuickViewImages.length;
    this.switchQuickViewImage(nextIdx);
  }

  orderProductByCode() {
    const input = document.getElementById('quick-code-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) {
      alert(this.i18n.getLang() === 'ar' ? 'يرجى إدخال رمز المنتج' : 'Veuillez entrer une référence produit (ex: 35665)');
      return;
    }

    const cleanCode = code.replace(/[^0-9A-Za-z]/g, '');
    const existing = this.products.find(p => String(p.product_id) === cleanCode || String(p.product_id).includes(cleanCode));

    if (existing) {
      this.cartManager.addItem(existing, 1);
      this.renderCart();
      this.updateCartBadge();
      this.showToast(this.i18n.t('toast_added', { name: existing.name }));
      input.value = '';
    } else {
      const quickProd = {
        product_id: cleanCode,
        name: `Produit Oriflame (${cleanCode})`,
        price: 39.900,
        image_url: `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${cleanCode}%2f${cleanCode}_1.png&MediaId=20989035&Version=1`,
        category: 'Catalogue',
        in_stock: true
      };
      this.cartManager.addItem(quickProd, 1);
      this.renderCart();
      this.updateCartBadge();
      this.showToast(this.i18n.t('toast_added', { name: quickProd.name }));
      input.value = '';
    }
  }

  initMessengerWidget() {
    const triggerBtn = document.getElementById('btn-toggle-messenger-chat');
    const closeBtn = document.getElementById('btn-close-messenger-chat');
    const chatBox = document.getElementById('messenger-chat-box');

    if (triggerBtn && chatBox) {
      triggerBtn.addEventListener('click', () => {
        chatBox.classList.toggle('open');
        this.telemetry.trackEvent('Opened Messenger Live Chat Widget');
      });
    }

    if (closeBtn && chatBox) {
      closeBtn.addEventListener('click', () => {
        chatBox.classList.remove('open');
      });
    }
  }

  async sendMessengerWidgetMessage() {
    const input = document.getElementById('messenger-chat-input');
    const chatBody = document.getElementById('messenger-chat-body');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    if (chatBody) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg chat-msg-sent';
      msgDiv.innerHTML = `
        <div class="chat-msg-text">${userText}</div>
        <div class="chat-msg-time">À l'instant</div>
      `;
      chatBody.appendChild(msgDiv);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    const fbHandle = this.facebookUsername || 'Mounanouira.Oriflame';
    const isMobile = this.cartManager ? this.cartManager.isMobileDevice() : /Android|iPhone|iPad/i.test(navigator.userAgent);
    const messengerUrl = isMobile 
      ? `https://m.me/${fbHandle}?text=${encodeURIComponent(userText)}`
      : `https://www.facebook.com/messages/t/${fbHandle}`;

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(userText);
      } catch (e) {}
    }

    this.showToast('📋 Message copié ! Ouverture de Messenger...');
    setTimeout(() => {
      window.open(messengerUrl, '_blank');
    }, 400);
  }

  quickChatAction(action) {
    const fbHandle = this.facebookUsername || 'Mounanouira.Oriflame';
    const isMobile = this.cartManager ? this.cartManager.isMobileDevice() : /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (action === 'order') {
      this.openCartDrawer();
    } else if (action === 'catalog') {
      const section = document.getElementById('catalogue-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'direct') {
      const messengerUrl = isMobile ? `https://m.me/${fbHandle}` : `https://www.facebook.com/messages/t/${fbHandle}`;
      window.open(messengerUrl, '_blank');
    }
  }

  shareToFacebook(productId = null) {
    if (!productId) {
      this.openSiteShareModal();
      return;
    }
    const isArabic = this.i18n.getLang() === 'ar';
    let shareUrl = `${window.location.origin}/?prod=${encodeURIComponent(productId)}`;
    let shareTitle = "Mouna Nouira — Oriflame Tunisie";
    let shareText = "Découvrez ce produit sur la boutique officielle de Mouna Nouira !";

    const p = this.products.find(item => String(item.product_id) === String(productId));
    if (p) {
      const pName = this.getProductName(p);
      shareTitle = `${pName} | Oriflame Tunisie`;
      shareText = `✨ Découvrez "${pName}" (${p.price.toFixed(2)} TND) sur la boutique officielle de Mouna Nouira !`;
    }

    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
      navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      }).catch(() => {
        this._openFacebookSharerPopup(shareUrl, shareText);
      });
    } else {
      this._openFacebookSharerPopup(shareUrl, shareText);
    }

    this.telemetry.trackEvent('Shared to Facebook', { productId, url: shareUrl });
    this.showToast(isArabic ? 'جاري فتح نافذة المشاركة على فيسبوك...' : 'Ouverture du partage Facebook...');
  }

  _openFacebookSharerPopup(url, quote) {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(quote)}`;
    const width = 620;
    const height = 650;
    const left = (window.innerWidth - width) / 2 + (window.screenX || 0);
    const top = (window.innerHeight - height) / 2 + (window.screenY || 0);
    window.open(fbUrl, 'fbShareWindow', `toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${width},height=${height},top=${top},left=${left}`);
  }

  trackShare(network, targetId, type = 'product') {
    if (this.telemetry) {
      this.telemetry.trackEvent(`Shared ${type} via ${network}`, {
        network,
        targetId,
        type
      });
      if (typeof this.telemetry.trackAnalytics === 'function') {
        this.telemetry.trackAnalytics('share', {
          method: network,
          content_type: type,
          item_id: String(targetId)
        });
      }
    }
    try {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('trackCustom', 'Share', {
          network,
          target_id: String(targetId),
          type
        });
      }
    } catch (e) {}
  }

  async copyShareLink(url, btnElement = null, targetId = null) {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (err) {
        copied = this._fallbackCopyText(url);
      }
    } else {
      copied = this._fallbackCopyText(url);
    }

    if (copied) {
      if (btnElement) {
        btnElement.classList.add('copied');
        const textSpan = btnElement.querySelector('.share-copy-text') || btnElement.querySelector('span');
        const originalText = textSpan ? textSpan.textContent : '';
        if (textSpan) textSpan.textContent = '✓ Copié !';
        setTimeout(() => {
          btnElement.classList.remove('copied');
          if (textSpan) textSpan.textContent = originalText || 'Copier le lien';
        }, 2000);
      }
      const announcer = document.getElementById('product-share-live-announcer');
      if (announcer) announcer.textContent = 'Lien copié dans le presse-papier !';

      this.showToast('Lien copié dans le presse-papier !');
      this.trackShare('Copy Link', targetId || url);
    } else {
      this.showToast('Impossible de copier automatiquement le lien.');
    }
    return copied;
  }

  _fallbackCopyText(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const res = document.execCommand('copy');
      document.body.removeChild(textarea);
      return res;
    } catch (e) {
      return false;
    }
  }

  async shareIndirect(platform, url, productId) {
    await this.copyShareLink(url, null, productId);
    if (platform === 'instagram') {
      this.showToast('Lien copié ! Collez le lien dans votre story ou bio Instagram');
      this.trackShare('Instagram (Indirect)', productId);
    } else if (platform === 'tiktok') {
      this.showToast('Lien copié ! Collez le lien dans votre bio TikTok');
      this.trackShare('TikTok (Indirect)', productId);
    }
  }

  openSiteShareModal(category = null) {
    const isArabic = this.i18n.getLang() === 'ar';
    const activeCat = category || this.activeCategory || 'All';
    const isHome = (activeCat === 'All');

    const catDisplayName = isHome 
      ? (isArabic ? 'الكتالوج الرسمي أوريفليم تونس' : 'Catalogue Officiel Oriflame Tunisie')
      : this.getCategoryDisplayName(activeCat);

    let shareUrl = window.location.origin + '/';
    let shareImg = `${window.location.origin}/assets/Oriflame%20by%20Mouna%20Nouira.jpg`;

    if (!isHome) {
      const catSlug = (activeCat === 'BodyCare') ? 'corps-et-bain' :
                      (activeCat === 'Skincare') ? 'soins-de-la-peau' :
                      (activeCat === 'Fragrance') ? 'parfums' :
                      (activeCat === 'Haircare') ? 'soins-capillaires' :
                      (activeCat === 'Makeup') ? 'maquillage' : encodeURIComponent(activeCat);
      shareUrl = `${window.location.origin}/${catSlug}`;
      shareImg = `${window.location.origin}/assets/og-${catSlug}.jpg`;
    }

    const modalTitle = isHome
      ? (isArabic ? 'مشاركة كتالوج أوريفليم تونس' : 'Partager le catalogue Oriflame Tunisie')
      : (isArabic ? `مشاركة : ${catDisplayName}` : `Partager la sélection : ${catDisplayName}`);

    const modalDesc = isHome
      ? (isArabic ? 'شاركي الكتالوج الرسمي لأوريفليم السويد مع صديقاتكِ وعائلتكِ عبر وسائلكِ المفضلة :' : 'Partagez la boutique officielle Oriflame Suède Tunisie avec vos proches sur vos réseaux sociaux préférés :')
      : (isArabic ? `شاركي تشكيلة "${catDisplayName}" مع صديقاتكِ عبر وسائل التواصل :` : `Partagez la sélection "${catDisplayName}" avec vos proches sur vos réseaux sociaux préférés :`);

    const shareTitle = isHome 
      ? (isArabic ? 'منى نويرة — الكتالوج الرسمي أوريفليم تونس' : 'Mouna Nouira — Catalogue Officiel Oriflame Tunisie')
      : `${catDisplayName} | Mouna Nouira — Oriflame Tunisie`;

    const shareText = isHome
      ? (isArabic ? '✨ اكتشفي الكتالوج الرسمي لأوريفليم السويد في تونس مع منى نويرة مع تخفيضات حصرية وطلب مباشر !' : '✨ Découvrez le catalogue officiel Oriflame Suède Tunisie avec Mouna Nouira : remises exclusives et commande directe !')
      : (isArabic ? `✨ اكتشفي تشكيلتنا المميزة "${catDisplayName}" على متجر أوريفليم تونس لمنى نويرة !` : `✨ Découvrez notre sélection "${catDisplayName}" sur la boutique Oriflame Tunisie de Mouna Nouira !`);

    this._showCategoryShareModalDOM(catDisplayName, shareUrl, shareText, shareImg, modalTitle, modalDesc);
  }

  openCategoryShareModal() {
    this.openSiteShareModal();
  }

  openCatalogueShareModal(spreadIndex = null) {
    const isArabic = this.i18n.getLang() === 'ar';
    const baseUrl = window.location.origin;

    // Determine page or cover
    let pageNum = null;
    let spreadTitle = null;

    if (spreadIndex !== null && window.ecatViewer?.spreads?.[spreadIndex]) {
      const sp = window.ecatViewer.spreads[spreadIndex];
      pageNum = sp.pages?.[0] || (spreadIndex + 1);
      spreadTitle = sp.title || `Page ${pageNum}`;
    }

    const shareUrl = pageNum 
      ? `${baseUrl}/catalogue?page=${pageNum}` 
      : `${baseUrl}/catalogue`;

    // Dynamic Live Catalogue Cover Image (Non-static, fetched dynamically from active flipbook)
    const shareImg = pageNum
      ? `${baseUrl}/api/og-image/catalogue.jpg?page=${pageNum}`
      : `${baseUrl}/api/og-image/catalogue.jpg`;

    const catCode = window.ecatViewer?.catalogueCode || 'Officiel';

    const modalTitle = pageNum
      ? (isArabic ? `مشاركة الكتالوج — صفحة ${pageNum}` : `Partager l'eCatalogue — Page ${pageNum}`)
      : (isArabic ? `مشاركة الكتالوج التفاعلي أوريفليم` : `Partager le Catalogue Virtuel Oriflame`);

    const modalDesc = pageNum
      ? (isArabic ? `شاركي هذه الصفحة من الكتالوج الرسمي مع صديقاتكِ وعائلتكِ :` : `Partagez cette page du catalogue officiel avec vos proches :`)
      : (isArabic ? `شاركي الكتالوج التفاعلي الرسمي لأوريفليم السويد مع إمكانية التصفح والطلب المباشر :` : `Partagez le catalogue virtuel interactif Oriflame Tunisie avec vos proches :`);

    const shareText = pageNum
      ? (isArabic ? `✨ اكتشفي الصفحة ${pageNum} من كتالوج أوريفليم تونس الرسمي مع منى نويرة !` : `✨ Découvrez la page ${pageNum} du catalogue virtuel officiel Oriflame Tunisie avec Mouna Nouira !`)
      : (isArabic ? `✨ تصفحي الكتالوج التفاعلي الرسمي لأوريفليم السويد في تونس مع منى نويرة !` : `✨ Feuilletez le catalogue virtuel officiel Oriflame Suède Tunisie avec Mouna Nouira : nouveautés, vidéos et commande directe !`);

    const catDisplayName = pageNum ? `Catalogue (Page ${pageNum})` : `Catalogue Virtuel Oriflame`;

    this._showCategoryShareModalDOM(catDisplayName, shareUrl, shareText, shareImg, modalTitle, modalDesc);
    this.trackShare('Open Catalogue Share Modal', pageNum || 'Cover', 'catalogue');
  }

  _showCategoryShareModalDOM(catName, url, text, img = null, customTitle = null, customDesc = null) {
    if (!this.categoryShareModal) return;
    const isArabic = this.i18n.getLang() === 'ar';
    const container = document.getElementById('category-share-options');
    const titleEl = document.getElementById('cat-share-modal-title');
    const descEl = document.getElementById('cat-share-modal-desc');

    if (titleEl) titleEl.textContent = customTitle || (isArabic ? `مشاركة : ${catName}` : `Partager : ${catName}`);
    if (descEl) descEl.textContent = customDesc || (isArabic ? 'شاركي هذه التشكيلة مع صديقاتكِ عبر وسائل التواصل :' : 'Partagez cette sélection avec vos proches sur vos réseaux sociaux préférés :');

    const shareImg = img || `${window.location.origin}/assets/Oriflame%20by%20Mouna%20Nouira.jpg`;
    const catKey = this.activeCategory || 'All';

    // Populate Visual Share Preview Box (Image + Title + URL)
    const previewImgEl = document.getElementById('cat-share-preview-img');
    const previewTitleEl = document.getElementById('cat-share-preview-title');
    const previewUrlEl = document.getElementById('cat-share-preview-url');
    if (previewImgEl) {
      previewImgEl.src = shareImg;
      previewImgEl.alt = customTitle || catName;
    }
    if (previewTitleEl) {
      previewTitleEl.textContent = customTitle || catName;
    }
    if (previewUrlEl) {
      previewUrlEl.textContent = url.replace(/^https?:\/\//, '');
    }

    if (container) {
      const emailSubject = isArabic ? `اكتشفي منتجات أوريفليم : ${catName}` : `Découvrez les produits Oriflame : ${catName}`;
      const emailBody = isArabic
        ? `مرحباً،\n\nأرشح لكِ متجر أوريفليم تونس لمنى نويرة (${catName}) :\n${url}`
        : `Bonjour,\n\nDécouvre la gamme ${catName} sur la boutique Oriflame de Mouna Nouira :\n${url}`;

      container.innerHTML = `
        <!-- WhatsApp -->
        <a href="https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-whatsapp" onclick="window.app.trackShare('WhatsApp', '${catKey}', 'site')" aria-label="Partager sur WhatsApp" title="Partager sur WhatsApp">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/></svg>
          <span>WhatsApp</span>
        </a>

        <!-- Facebook -->
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-facebook" onclick="window.app.trackShare('Facebook', '${catKey}', 'site')" aria-label="Partager sur Facebook" title="Partager sur Facebook">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>Facebook</span>
        </a>

        <!-- Pinterest -->
        <a href="https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(shareImg)}&description=${encodeURIComponent(text)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-pinterest" onclick="window.app.trackShare('Pinterest', '${catKey}', 'site')" aria-label="Partager sur Pinterest" title="Partager sur Pinterest">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0a12 12 0 0 0-4.37 23.18c-.07-.95-.13-2.42.03-3.46l1.24-5.26s-.31-.63-.31-1.56c0-1.46.85-2.55 1.9-2.55.9 0 1.33.67 1.33 1.48 0 .9-.57 2.26-.87 3.51-.25 1.05.53 1.91 1.56 1.91 1.88 0 3.32-1.98 3.32-4.84 0-2.53-1.82-4.3-4.42-4.3-3.01 0-4.78 2.26-4.78 4.59 0 .91.35 1.88.79 2.41a.33.33 0 0 1 .08.31c-.09.36-.28 1.15-.32 1.31-.05.21-.17.26-.39.16-1.44-.67-2.34-2.77-2.34-4.46 0-3.63 2.64-6.97 7.61-6.97 3.99 0 7.1 2.85 7.1 6.66 0 3.97-2.5 7.16-5.97 7.16-1.17 0-2.26-.61-2.64-1.33l-.72 2.74c-.26 1-.96 2.26-1.43 3.02A12 12 0 1 0 12 0z"/></svg>
          <span>Pinterest</span>
        </a>

        <!-- X / Twitter -->
        <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" rel="nofollow noopener" class="share-btn share-btn-x" onclick="window.app.trackShare('Twitter/X', '${catKey}', 'site')" aria-label="Partager sur X" title="Partager sur X (Twitter)">
          <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>X / Twitter</span>
        </a>

        <!-- Instagram -->
        <button type="button" class="share-btn share-btn-instagram" onclick="window.app.shareIndirect('instagram', '${url}', '${catKey}')" aria-label="Partager sur Instagram" title="Partager sur Instagram">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          <span>Instagram</span>
        </button>

        <!-- TikTok -->
        <button type="button" class="share-btn share-btn-tiktok" onclick="window.app.shareIndirect('tiktok', '${url}', '${catKey}')" aria-label="Partager sur TikTok" title="Partager sur TikTok">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
          <span>TikTok</span>
        </button>

        <!-- Email -->
        <a href="mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}" class="share-btn share-btn-email" onclick="window.app.trackShare('Email', '${catKey}', 'site')" aria-label="Partager par Email" title="Partager par Email">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          <span>Email</span>
        </a>

        <!-- Copy Link -->
        <button type="button" class="share-btn share-btn-copy" style="grid-column: 1 / -1;" onclick="window.app.copyShareLink('${url}', this, '${catKey}');" aria-label="Copier le lien" title="Copier le lien">
          <svg class="icon-copy" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span class="share-copy-text">${isArabic ? 'نسخ الرابط' : 'Copier le lien'}</span>
        </button>
      `;
    }

    this.openModal(this.categoryShareModal);
  }

  showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2500);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
