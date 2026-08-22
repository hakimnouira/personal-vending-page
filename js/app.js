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
    this.searchQuery = '';
    this.products = [];
    this.facebookUsername = 'Mounanouira.Oriflame';
    this.whatsappPhone = '55756629';
    this.featuredDealIds = ['46980', '40683', '38557', '42751'];

    window.app = this;
    this.init();
  }

  async init() {
    this.cacheDOM();
    this.i18n.applyTranslations();
    this.bindEvents();
    this.initMessengerWidget();
    this.initFacebookCheckout();

    await this.fetchSettings();
    await this.fetchProducts();
    await this.initCarousel();
    
    // Initialize Interactive Digital eCatalogue Flipbook
    window.ecatViewer = new ECatalogueViewer(this);

    this.renderDealsShowcase();
    this.renderProducts();
    this.renderCart();
    this.updateCartBadge();
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
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
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
        }
      }
    } catch (e) {
      console.warn("Could not fetch settings", e);
    }

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

  cleanFbUsername(val) {
    if (!val) return 'Mounanouira.Oriflame';
    val = val.trim();
    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\/messages\/(e2ee\/)?t\//i, '');
    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\//i, '');
    val = val.replace(/^https?:\/\/m\.me\//i, '');
    val = val.split('/')[0].split('?')[0].trim();
    return val || 'Mounanouira.Oriflame';
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

    if (prods) {
      this.products = this.applyDiscountOverrides(prods);
      try { localStorage.setItem('oriflame_products_v1', JSON.stringify(this.products)); } catch (e) {}
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
    this.dealsCarouselGrid = document.getElementById('deals-carousel-grid');
    this.promoShowcaseSection = document.getElementById('promo-showcase-section');

    // Cart Elements
    this.floatingCartBtn = document.getElementById('floating-cart-btn');
    this.cartBadge = document.getElementById('cart-badge');
    this.cartDrawerOverlay = document.getElementById('cart-drawer-overlay');
    this.btnCloseDrawer = document.getElementById('btn-close-drawer');
    this.cartItemsList = document.getElementById('cart-items-list');
    this.cartSubtotal = document.getElementById('cart-subtotal');
    this.customerNameInput = document.getElementById('customer-name');
    this.customerPhoneInput = document.getElementById('customer-phone');
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
        this.renderProducts();

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          if (this.searchQuery) {
            this.telemetry.trackEvent(`Searched for "${this.searchQuery}"`);
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
          this.telemetry.trackEvent(`Filtered by Category: ${this.activeCategory}`, this.activeCategory);
          this.renderProducts();
        }
      });
    }

    // Cart Drawer Toggle
    if (this.floatingCartBtn) {
      this.floatingCartBtn.addEventListener('click', () => {
        this.openCartDrawer();
        this.telemetry.trackEvent('Opened Shopping Cart Drawer');
      });
    }
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

    // Customer Input & Messenger Update
    const updateMessengerDetails = () => {
      this.renderCart();
    };
    if (this.customerNameInput) this.customerNameInput.addEventListener('input', updateMessengerDetails);
    if (this.customerPhoneInput) this.customerPhoneInput.addEventListener('input', updateMessengerDetails);

    // Copy Order Summary
    if (this.btnCopyOrderSummary) {
      this.btnCopyOrderSummary.addEventListener('click', () => {
        const name = this.customerNameInput ? this.customerNameInput.value : '';
        const phone = this.customerPhoneInput ? this.customerPhoneInput.value : '';
        const msg = this.cartManager.generateOrderTextMessage(name, phone, 'TND');
        if (msg) {
          navigator.clipboard.writeText(msg).then(() => {
            this.showToast(this.i18n.t('toast_copied'));
            this.telemetry.trackEvent('Copied Order Summary to Clipboard');
          });
        }
      });
    }

    // Helper for robust clipboard copy across all browsers
    const copyTextToClipboard = async (text) => {
      if (!text) return false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (e) {}

      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
      } catch (e) {
        return false;
      }
    };

    // ── Checkout Choice 1: Phone / WhatsApp Order Submission ─────────────────
    const btnPhone = document.getElementById('btn-phone-checkout');
    if (btnPhone) {
      btnPhone.addEventListener('click', async (e) => {
        e.preventDefault();
        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
          alert('Votre panier est vide.');
          return;
        }

        const name = (this.customerNameInput ? this.customerNameInput.value : '').trim();
        const phone = (this.customerPhoneInput ? this.customerPhoneInput.value : '').trim();

        if (!phone) {
          alert('Veuillez renseigner votre numéro de téléphone ou WhatsApp pour que nous puissions vous contacter.');
          if (this.customerPhoneInput) this.customerPhoneInput.focus();
          return;
        }

        btnPhone.disabled = true;
        btnPhone.textContent = '⏳ Enregistrement de la commande...';

        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_name: name || 'Client Téléphone',
              customer_phone: phone,
              channel: 'phone',
              items: items,
              currency: 'TND'
            })
          });
          const data = await res.json();

          if (data.success) {
            if (this.cartDrawerOverlay) this.cartDrawerOverlay.classList.remove('open');

            const successModal = document.getElementById('order-success-modal');
            const successOrderId = document.getElementById('success-order-id');
            const successCustomerName = document.getElementById('success-customer-name');
            const successCustomerPhone = document.getElementById('success-customer-phone');
            const successWhatsappBtn = document.getElementById('btn-success-whatsapp');
            const closeSuccessBtn = document.getElementById('btn-close-success-modal');

            if (successOrderId) successOrderId.textContent = data.order_id;
            if (successCustomerName) successCustomerName.textContent = name || 'Cher Client';
            if (successCustomerPhone) successCustomerPhone.textContent = phone;

            if (successWhatsappBtn) {
              const liveOrderUrl = `${window.location.origin}/admin?orderId=${data.order_id}`;
              const cleanTargetPhone = this.cleanPhoneNumber(this.whatsappPhone || '55756629');
              const rawOrderMsg = `Bonjour Mouna ! J'ai passé la commande ${data.order_id} sur votre boutique Oriflame :\n` +
                this.cartManager.generateOrderTextMessage(name, phone, 'TND', liveOrderUrl);
              const orderMsg = encodeURIComponent(rawOrderMsg);
              const waUrl = `https://wa.me/216${cleanTargetPhone}?text=${orderMsg}`;
              successWhatsappBtn.href = waUrl;

              // Auto-copy message to clipboard when WhatsApp button is clicked (mobile safety net)
              successWhatsappBtn.addEventListener('click', async () => {
                await copyTextToClipboard(rawOrderMsg);
                this.showToast('📋 ✅ Message copié ! Collez-le dans WhatsApp si besoin.');
              });
            }

            if (closeSuccessBtn) {
              closeSuccessBtn.onclick = () => {
                if (successModal) successModal.classList.remove('open');
              };
            }

            if (successModal) successModal.classList.add('open');

            this.cartManager.clearCart();
            this.renderCart();
            this.updateCartBadge();
            this.telemetry.trackEvent(`Completed Phone/WhatsApp Order ${data.order_id}`);
          } else {
            alert('Erreur: ' + data.message);
          }
        } catch (err) {
          alert('Erreur de connexion: ' + err.message);
        } finally {
          btnPhone.disabled = false;
          btnPhone.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg><span>📞 Commander par Téléphone / WhatsApp</span>`;
        }
      });
    }

    // ── Checkout Choice 2: Facebook / Messenger Checkout ─────────────────────
    if (this.btnMessengerCheckout) {
      this.btnMessengerCheckout.addEventListener('click', async (e) => {
        e.preventDefault();
        const count = this.cartManager.getTotalCount();
        const total = this.cartManager.getSubtotal();
        const name = this.customerNameInput ? this.customerNameInput.value : '';
        const phone = this.customerPhoneInput ? this.customerPhoneInput.value : '';
        const items = this.cartManager.getCartItems();

        if (items.length === 0) {
          alert('Votre panier est vide.');
          return;
        }

        const isMobile = this.cartManager.isMobileDevice();
        const cleanedFbHandle = this.cleanFbUsername(this.facebookUsername || 'Mounanouira.Oriflame');

        // ── CRITICAL: Copy to clipboard IMMEDIATELY (before any async call) ──
        // Mobile browsers require clipboard writes within the user-gesture stack frame.
        // After an await (e.g. fetch), the gesture context is lost and clipboard silently fails.
        const earlyMsg = this.cartManager.generateOrderTextMessage(name, phone, 'TND');
        await copyTextToClipboard(earlyMsg);

        let orderUrl = '';
        let orderId = '';
        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_name: name,
              customer_phone: phone,
              channel: 'messenger',
              items: items,
              currency: 'TND'
            })
          });
          const data = await res.json();
          if (data.success) {
            orderId = data.order_id;
            orderUrl = `${window.location.origin}/admin?orderId=${orderId}`;
          }
        } catch (err) {
          console.warn("Could not persist order to server", err);
        }

        // Re-generate the message with the order URL (if available) and re-copy
        const liveOrderUrl = orderId ? `${window.location.origin}/admin?orderId=${orderId}` : orderUrl;
        const msg = liveOrderUrl
          ? this.cartManager.generateOrderTextMessage(name, phone, 'TND', liveOrderUrl)
          : earlyMsg;

        // Re-copy with the complete message (uses textarea fallback for mobile resilience)
        if (liveOrderUrl) {
          await copyTextToClipboard(msg);
        }

        const finalMessengerUrl = isMobile
          ? `https://m.me/${cleanedFbHandle}`
          : `https://www.facebook.com/messages/t/${cleanedFbHandle}`;

        this.showToast(isMobile
          ? '📋 ✅ Message copié ! Collez-le (appui long → Coller) dans Messenger.'
          : this.i18n.t('toast_copied'));

        this.telemetry.trackEvent(`Clicked Facebook/Messenger Checkout (${count} items, Total: ${total} TND)`);

        if (isMobile) {
          // Small delay to let the toast show and clipboard settle before switching apps
          setTimeout(() => {
            window.location.href = finalMessengerUrl;
          }, 600);
          return;
        }

        // Desktop: Open Messenger in new tab first, then show paste guide
        window.open(finalMessengerUrl, '_blank');

        // Show paste guide modal with message preview
        const pasteModal = document.getElementById('messenger-paste-modal-overlay');
        const openMessengerBtn = document.getElementById('btn-paste-modal-open-messenger');
        const closePasteBtn = document.getElementById('btn-close-paste-modal');
        const recopyBtn = document.getElementById('btn-recopy-order');
        const msgPreview = document.getElementById('paste-modal-msg-preview');

        if (pasteModal) {
          if (msgPreview) {
            const previewText = msg.replace(/\n/g, '<br>');
            msgPreview.innerHTML = `<div style="position: absolute; bottom: 0; left: 0; right: 0; height: 30px; background: linear-gradient(transparent, #F8FAFC);"></div>${previewText}`;
          }

          pasteModal.classList.add('open');

          if (openMessengerBtn) {
            openMessengerBtn.onclick = () => window.open(finalMessengerUrl, '_blank');
          }
          if (recopyBtn) {
            recopyBtn.onclick = async () => {
              await copyTextToClipboard(msg);
              recopyBtn.textContent = '✅ Recopié !';
              setTimeout(() => { recopyBtn.textContent = '📋 Recopier'; }, 2000);
            };
          }
          if (closePasteBtn) {
            closePasteBtn.onclick = () => pasteModal.classList.remove('open');
          }
        }
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

    if (promoProducts.length === 0) {
      promoProducts = this.products.filter(p => p.is_featured_deal || p.is_promo).slice(0, 6);
    }

    if (promoProducts.length === 0) {
      if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'none';
      return;
    }

    if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'block';

    this.dealsCarouselGrid.innerHTML = promoProducts.map(p => {
      const prodName = this.getProductName(p);
      const { totalDiscount, displayOrigPrice } = this.calculateDiscountMetrics(p.price, p.original_price, p);

      return `
        <div class="mini-deal-card" onclick="window.app.openQuickView('${p.product_id}')" style="cursor:pointer;">
          <div class="mini-deal-img-wrap">
            <img class="mini-deal-img" src="${p.image_url}" alt="${prodName}" loading="lazy" onerror="window.handleProductImgError(this)" />
            <span class="promo-pill">-${totalDiscount || 25}%</span>
          </div>
          <h4 class="mini-deal-title">${prodName}</h4>
          <div class="price-wrap">
            <span class="current-deal-price">${Number(p.price).toFixed(2)} ${currencyLabel}</span>
            ${displayOrigPrice ? `<span class="original-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
          </div>
          <button class="btn-add-cart" style="width:100%; min-height:36px; font-size:0.8rem; justify-content:center;" onclick="event.stopPropagation(); window.app.addToCart('${p.product_id}')">
            ${this.i18n.t('add_to_cart')}
          </button>
        </div>
      `;
    }).join('');
  }

  renderProducts() {
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const filtered = this.products.filter(product => {
      let matchesCategory = false;
      if (this.activeCategory === 'All') matchesCategory = true;
      else if (this.activeCategory === 'Deals') matchesCategory = Boolean(product.is_promo);
      else matchesCategory = product.category.toLowerCase() === this.activeCategory.toLowerCase();

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
      return matchesCategory && matchesSearch;
    });

    if (this.productsCount) {
      this.productsCount.textContent = this.i18n.t('showing_products', { count: filtered.length });
    }

    if (!this.productGrid) return;

    if (filtered.length === 0) {
      this.productGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: #8E8D8A;">
          <p style="font-family: var(--font-serif); font-size: 1.3rem; font-weight: 600; color: #18181B; margin-bottom: 8px;">No products found</p>
          <p style="font-size: 0.9rem;">Try adjusting your search query or selecting another category.</p>
        </div>
      `;
      return;
    }

    const inStockText = this.i18n.t('in_stock');
    const outStockText = this.i18n.t('out_stock');
    const addBtnText = this.i18n.t('add_to_cart');

    this.productGrid.innerHTML = filtered.map(p => {
      const prodName = this.getProductName(p);
      const prodDesc = this.getProductDescription(p);
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 1;
      let initialVariant = null;
      if (hasVariants) {
        if (this.searchQuery) {
          initialVariant = p.variants.find(v => 
            String(v.product_id).toLowerCase().includes(this.searchQuery) ||
            String(v.shade_name || '').toLowerCase().includes(this.searchQuery)
          ) || p.variants[0];
        } else {
          initialVariant = p.variants[0];
        }
      }

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
            <span class="stock-indicator ${p.in_stock ? 'in-stock' : 'out-stock'}">
              ${p.in_stock ? inStockText : outStockText}
            </span>
          </div>
          <div class="product-body">
            <h4 class="product-title" onclick="window.app.openQuickView('${p.product_id}', null, '${initialVariantId}')" style="cursor:pointer;">${prodName}</h4>
            
            ${hasVariants ? `
              <div class="product-shades-row" onclick="event.stopPropagation();">
                <div class="shades-header-label">
                  <span>🎨 ${p.variants.length} ${isArabic ? 'درجات' : 'Nuances :'}</span>
                  <span class="shade-active-badge" id="shade-badge-${p.product_id}">💄 ${initialVariant.shade_name || initialVariant.product_id}</span>
                </div>
                <div class="shades-swatches-list">
                  ${p.variants.map((v, vIdx) => `
                    <button type="button" 
                      class="shade-swatch-btn ${String(v.product_id) === String(initialVariant.product_id) ? 'active' : ''}" 
                      style="background-color: ${v.hex_color || '#DE7B90'};" 
                      title="${v.shade_name || v.product_id} (Réf. ${v.product_id})"
                      onclick="window.app.selectCardVariant('${p.product_id}', '${v.product_id}', this)">
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${p.size ? `<div class="product-meta-row"><span>📦 ${p.size}</span></div>` : ''}
            <p class="product-description">${prodDesc || ''}</p>
            <div class="product-footer">
              <div class="price-container">
                ${displayOrigPrice ? `<span class="product-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
                <span class="product-price ${isPromo ? 'promo-price' : ''}">${Number(activePrice).toFixed(2)} <span style="font-size:0.85rem; font-weight:600; color:var(--color-text-secondary);">${currencyLabel}</span></span>
              </div>
              <button class="btn-add-cart" id="btn-add-card-${p.product_id}" ${!p.in_stock ? 'disabled' : ''} onclick="window.app.addToCart('${defaultAddId}')">
                ${addBtnText}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
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
      if (this.btnMessengerCheckout) {
        this.btnMessengerCheckout.style.opacity = "0.5";
        this.btnMessengerCheckout.style.pointerEvents = "none";
      }
      if (this.btnCopyOrderSummary) {
        this.btnCopyOrderSummary.style.display = "none";
      }
      return;
    }

    if (this.btnMessengerCheckout) {
      this.btnMessengerCheckout.style.opacity = "1";
      this.btnMessengerCheckout.style.pointerEvents = "auto";
      this.btnMessengerCheckout.textContent = isMobile 
        ? this.i18n.t('send_messenger_mobile') 
        : this.i18n.t('send_messenger_desktop');
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
              <span class="cart-item-shade-dot" style="background:${item.hex_color || '#DE7B90'}"></span>
              <span>${isArabic ? 'الدرجة' : 'Nuance'} : <strong>${item.shade_name}</strong> (Réf. ${item.product_id})</span>
            </div>
          ` : `
            <div style="font-size:0.75rem; color:#8E8D8A; margin-top:2px;">Réf: ${item.product_id}</div>
          `}
          <div class="cart-item-price">${Number(item.price).toFixed(2)} ${currencyLabel}</div>
        </div>
        <div class="cart-item-controls">
          <button class="btn-qty" onclick="window.app.updateCartQty('${item.product_id}', -1)">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="btn-qty" onclick="window.app.updateCartQty('${item.product_id}', 1)">+</button>
          <button class="btn-remove-item" onclick="window.app.removeCartItem('${item.product_id}')">✕</button>
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
            return `
              <div style="font-size: 0.8rem; color: #5B21B6; display: flex; justify-content: space-between; align-items: center; margin-top: 4px; background: rgba(255,255,255,0.5); border-radius: 6px; padding: 5px 8px;">
                <span>🏷️ <strong>${dTitle}</strong><br><span style="font-size:0.72rem;opacity:0.8;">-${td.deal.discount_percent}% sur ${td.deal.product_name || td.deal.product_id}</span></span>
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
      const s = thresholdSuggestions[0]; // Show the most relevant suggestion
      const deal = s.deal;
      const dTitle = (isArabic && deal.title_ar) ? deal.title_ar : (deal.title_fr || 'Deal Seuil');
      const productName = deal.product_name || deal.product_id;

      if (s.thresholdMet && !s.productInCart) {
        // Threshold met, but deal product not in cart yet → strong CTA to add it
        html += `
          <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%); border: 1.5px solid #F59E0B; border-radius: 10px; padding: 12px; margin-top: 14px; box-shadow: 0 2px 4px rgba(245,158,11,0.12);">
            <div style="font-weight: 800; font-size: 0.84rem; color: #92400E; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              🎉 ${isArabic ? 'أنت مؤهل للحصول على خصم خاص !' : 'Vous êtes éligible à une remise spéciale !'}
            </div>
            <p style="font-size: 0.78rem; color: #78350F; margin: 0 0 8px;">
              ${deal.description_fr || (isArabic
                ? `لقد تجاوزت عتبة ${Number(deal.threshold_amount).toFixed(0)} د.ت ! أضف <strong>${productName}</strong> وستحصل على <strong>-${deal.discount_percent}%</strong> عليه فوراً !`
                : `Vous avez commandé pour plus de ${Number(deal.threshold_amount).toFixed(0)} DT ! Ajoutez <strong>${productName}</strong> et bénéficiez de <strong>-${deal.discount_percent}%</strong> immédiatement !`)}
            </p>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.78rem; background: #D97706; border-color: #B45309; width: 100%; display: inline-flex; justify-content: center; align-items: center; gap: 6px;" onclick="window.app.addProductToCart('${deal.product_id}')">
              🎯 ${isArabic ? `إضافة ${productName} بخصم -${deal.discount_percent}%` : `Ajouter ${productName} avec -${deal.discount_percent}%`}
            </button>
          </div>
        `;
      } else if (!s.thresholdMet && s.remaining <= Number(deal.threshold_amount) * 0.4) {
        // Getting close to threshold (within 40% of it) → motivational nudge
        html += `
          <div style="background: #F8FAFC; border: 1px dashed #94A3B8; border-radius: 10px; padding: 10px; margin-top: 14px;">
            <div style="font-size: 0.78rem; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 5px;">
              💡 ${isArabic ? 'فرصة توفير !' : 'Opportunité d\'économie !'}
            </div>
            <p style="font-size: 0.76rem; color: #64748B; margin: 4px 0 0;">
              ${isArabic
                ? `أضف ${Number(s.remaining).toFixed(2)} د.ت أخرى لتحصل على <strong>-${deal.discount_percent}%</strong> على <strong>${productName}</strong> !`
                : `Ajoutez encore <strong>${Number(s.remaining).toFixed(2)} ${currencyLabel}</strong> pour débloquer <strong>-${deal.discount_percent}%</strong> sur <strong>${productName}</strong> !`}
            </p>
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

    if (this.btnMessengerCheckout) {
      const fbHandle = this.facebookUsername || 'mouna.nouira1';
      const name = this.customerNameInput ? this.customerNameInput.value : '';
      const phone = this.customerPhoneInput ? this.customerPhoneInput.value : '';
      this.btnMessengerCheckout.href = this.cartManager.generateMessengerLink(fbHandle, name, phone, 'TND');
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
    if (this.cartBadge) {
      this.cartBadge.textContent = count;
      this.cartBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  openCartDrawer() {
    if (this.cartDrawerOverlay) this.cartDrawerOverlay.classList.add('open');
  }

  closeCartDrawer() {
    if (this.cartDrawerOverlay) this.cartDrawerOverlay.classList.remove('open');
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

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 1;
    const activeVariant = hasVariants 
      ? ((initialVariantId && product.variants.find(v => String(v.product_id) === String(initialVariantId))) || product.variants[0])
      : null;

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
          <h3 style="font-family: var(--font-serif); font-size: 1.4rem; color: #18181B; margin-bottom: 8px; line-height:1.3;">${prodName}</h3>
          
          ${hasVariants ? `
            <div class="quickview-shades-box">
              <div class="quickview-shades-title">
                <span>🎨 ${isArabic ? 'اختيار الدرجة / اللون' : 'Choix de la Teinte / Nuance'} (${product.variants.length})</span>
                <span class="shade-active-badge" id="qv-active-shade-label">💄 ${activeVariant.shade_name || activeVariant.product_id} • Réf. ${activeVariant.product_id}</span>
              </div>
              <div class="quickview-shades-grid">
                ${product.variants.map((v, vIdx) => `
                  <button type="button" 
                    class="quickview-shade-swatch ${String(v.product_id) === String(activeVariant.product_id) ? 'active' : ''}" 
                    style="background-color: ${v.hex_color || '#DE7B90'};" 
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

          <!-- Price & Action Footer -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E8E5DF; padding-top: 18px; margin-top: 18px; flex-wrap: wrap; gap: 12px;">
            <div class="price-container" id="qv-price-container">
              ${displayOrigPrice ? `<span class="product-price-strike">${Number(displayOrigPrice).toFixed(2)} ${currencyLabel}</span>` : ''}
              <span style="font-size: 1.6rem; font-weight: 800; color: ${isPromo ? 'var(--color-promo)' : '#18181B'}; letter-spacing:-0.02em;">${Number(activePrice).toFixed(2)} <span style="font-size:0.95rem; font-weight:600; color:#52525B;">${currencyLabel}</span></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button type="button" class="btn-share-qv" onclick="window.app.shareToFacebook('${product.product_id}')" title="Partager ce produit sur Facebook" style="background: rgba(24,119,242,0.08); color: #1877F2; border: 1px solid rgba(24,119,242,0.25); min-height: 44px; padding: 0 14px; border-radius: 8px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s ease;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                <span data-i18n="nav_share">Partager</span>
              </button>
              <button class="btn-add-cart" id="qv-btn-add-cart" style="padding: 0 24px; min-height: 44px;" ${!product.in_stock ? 'disabled' : ''} onclick="window.app.addToCart('${activeRef}'); window.app.closeModal(document.getElementById('quickview-modal-overlay'));">
                ${this.i18n.t('quickview_add')}
              </button>
            </div>
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
    const isArabic = this.i18n.getLang() === 'ar';
    let shareUrl = window.location.origin + window.location.pathname;
    let shareTitle = "Mouna Nouira — Catalogue Officiel Oriflame Tunisie";
    let shareText = "Découvrez le catalogue officiel Oriflame Tunisie de Mouna Nouira avec des remises exceptionnelles et commande directe !";

    if (productId) {
      const p = this.products.find(item => String(item.product_id) === String(productId));
      if (p) {
        const pName = this.getProductName(p);
        shareUrl += `?prod=${encodeURIComponent(p.product_id)}`;
        shareTitle = `${pName} | Oriflame Tunisie`;
        shareText = `✨ Découvrez "${pName}" (${p.price.toFixed(2)} TND) sur la boutique officielle de Mouna Nouira !`;
      }
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
