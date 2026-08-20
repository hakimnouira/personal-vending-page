// Client-side Application Controller with Live Deals & Promos UI, Interactive eCatalogue Viewer, Rich Info Tabs & Telemetry
import { I18nManager } from './i18n.js';
import { CartManager } from './cart.js';
import { TelemetryTracker } from './telemetry.js';
import { ECatalogueViewer } from './ecatalogue.js';

class App {
  constructor() {
    this.i18n = new I18nManager();
    this.cartManager = new CartManager(this.i18n);
    this.telemetry = new TelemetryTracker();

    this.activeCategory = 'All';
    this.searchQuery = '';
    this.products = [];

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.i18n.applyTranslations();
    this.bindEvents();

    await this.fetchProducts();
    await this.initCarousel();
    
    // Initialize Interactive Digital eCatalogue Flipbook
    window.ecatViewer = new ECatalogueViewer(this);

    this.renderDealsShowcase();
    this.renderProducts();
    this.renderCart();
    this.updateCartBadge();
  }

  async fetchProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.products = data.data;
      }
    } catch (e) {
      console.warn("Using offline catalog fallback", e);
    }
  }

  async initCarousel() {
    try {
      const res = await fetch('/api/carousel');
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        this.carouselSlides = data.data.filter(s => s.active !== false);
      }
    } catch (e) {
      console.warn("Using default carousel slides", e);
    }

    if (!this.carouselSlides || this.carouselSlides.length === 0) {
      this.carouselSlides = [
        {
          id: "slide-1",
          image_url: "https://scontent.ftun1-2.fna.fbcdn.net/v/t39.99422-6/778710820_1618305183237051_1204770625839587464_n.png?stp=dst-jpg_tt6&cstp=mx1912x2048&ctp=s1912x2048&_nc_cat=104&ccb=1-7&_nc_sid=833d8c&_nc_ohc=znBxQh6pb9IQ7kNvwFCi6lF&_nc_oc=Adqr2P8e_uH96U2_8b5IJ4ADwBWauBbTEkVTH2d9VR6B9PueDfDHaGUMjU1NMd_H8Ktk8TgzZwgOh2_OukPk77rH&_nc_zt=14&_nc_ht=scontent.ftun1-2.fna&_nc_gid=1SI2p4Q831uzyvnKhTcz0Q&_nc_ss=7b2a8&oh=00_AQEfamJ9a0Vf9Eqrxm3jeMRYu89KXXCsdw8rim5F1oxcOw&oe=6A8C0DFF",
          badge: "Oriflame Sweden • Catalogue 2026",
          title: "Catalogue Beauté & Bien-être Premium",
          description: "Découvrez les nouvelles collections cosmétiques, fragrances d'exception et soins suédois sélectionnés avec soin par Mouna Nouira.",
          button_text: "📖 Feuilleter le Catalogue Virtuel",
          button_link: "#catalogue-section"
        },
        {
          id: "slide-2",
          image_url: "https://images.unsplash.com/photo-1608248597349-8086055d28b1?auto=format&fit=crop&w=1600&q=80",
          badge: "Offres Spéciales • Tunisie",
          title: "Parfums & Fragrances d'Élégance",
          description: "Sublimez votre présence avec les fragrances exclusives Oriflame. Commandez facilement sur Messenger sans aucun paiement en ligne.",
          button_text: "🛍️ Découvrir les Offres",
          button_link: "#catalogue-section"
        }
      ];
    }

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
            <img src="${slide.image_url}" alt="${slide.title || 'Slide'}" class="carousel-full-img" />
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

    // Facebook / Messenger Checkout Click Tracking & Auto Clipboard Copy
    if (this.btnMessengerCheckout) {
      this.btnMessengerCheckout.addEventListener('click', () => {
        const count = this.cartManager.getTotalCount();
        const total = this.cartManager.getSubtotal();
        const name = this.customerNameInput ? this.customerNameInput.value : '';
        const phone = this.customerPhoneInput ? this.customerPhoneInput.value : '';
        const msg = this.cartManager.generateOrderTextMessage(name, phone, 'TND');

        if (msg && navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(() => {
            this.showToast(this.i18n.t('toast_copied'));
          }).catch(() => {});
        }

        this.telemetry.trackEvent(`Clicked Facebook/Messenger Checkout (${count} items, Total: ${total} TND)`);
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

  renderDealsShowcase() {
    if (!this.dealsCarouselGrid) return;
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const promoProducts = this.products.filter(p => p.is_promo).slice(0, 4);
    if (promoProducts.length === 0) {
      if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'none';
      return;
    }

    if (this.promoShowcaseSection) this.promoShowcaseSection.style.display = 'block';

    this.dealsCarouselGrid.innerHTML = promoProducts.map(p => `
      <div class="mini-deal-card" onclick="window.app.openQuickView('${p.product_id}')" style="cursor:pointer;">
        <div class="mini-deal-img-wrap">
          <img class="mini-deal-img" src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'" />
          <span class="promo-pill">-${p.discount_percent || 25}%</span>
        </div>
        <h4 class="mini-deal-title">${p.name}</h4>
        <div class="price-wrap">
          <span class="current-deal-price">${Number(p.price).toFixed(2)} ${currencyLabel}</span>
          ${p.original_price ? `<span class="original-price-strike">${Number(p.original_price).toFixed(2)} ${currencyLabel}</span>` : ''}
        </div>
        <button class="btn-add-cart" style="width:100%; min-height:36px; font-size:0.8rem; justify-content:center;" onclick="event.stopPropagation(); window.app.addToCart('${p.product_id}')">
          ${this.i18n.t('add_to_cart')}
        </button>
      </div>
    `).join('');
  }

  renderProducts() {
    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    const filtered = this.products.filter(product => {
      let matchesCategory = false;
      if (this.activeCategory === 'All') matchesCategory = true;
      else if (this.activeCategory === 'Deals') matchesCategory = Boolean(product.is_promo);
      else matchesCategory = product.category.toLowerCase() === this.activeCategory.toLowerCase();

      const matchesSearch = !this.searchQuery || 
        product.name.toLowerCase().includes(this.searchQuery) ||
        (product.description && product.description.toLowerCase().includes(this.searchQuery));
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

    this.productGrid.innerHTML = filtered.map(p => `
      <div class="product-card">
        <div class="product-image-wrap" onclick="window.app.openQuickView('${p.product_id}')" style="cursor:pointer;">
          <img class="product-image" src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'" />
          ${p.is_promo 
            ? `<span class="promo-badge">-${p.discount_percent || 25}%</span>`
            : `<span class="category-badge">${p.category}</span>`
          }
          <span class="stock-indicator ${p.in_stock ? 'in-stock' : 'out-stock'}">
            ${p.in_stock ? inStockText : outStockText}
          </span>
        </div>
        <div class="product-body">
          <h4 class="product-title" onclick="window.app.openQuickView('${p.product_id}')" style="cursor:pointer;">${p.name}</h4>
          ${p.size ? `<div class="product-meta-row"><span>📦 ${p.size}</span></div>` : ''}
          <p class="product-description">${p.description || ''}</p>
          <div class="product-footer">
            <div class="price-container">
              ${p.original_price ? `<span class="product-price-strike">${Number(p.original_price).toFixed(2)} ${currencyLabel}</span>` : ''}
              <span class="product-price ${p.is_promo ? 'promo-price' : ''}">${Number(p.price).toFixed(2)} <span style="font-size:0.85rem; font-weight:600; color:var(--color-text-secondary);">${currencyLabel}</span></span>
            </div>
            <button class="btn-add-cart" ${!p.in_stock ? 'disabled' : ''} onclick="window.app.addToCart('${p.product_id}')">
              ${addBtnText}
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  addToCart(productId) {
    const product = this.products.find(p => p.product_id === productId);
    if (product && product.in_stock) {
      this.cartManager.addItem(product, 1);
      this.showToast(this.i18n.t('toast_added', { name: product.name }));
      this.telemetry.trackEvent(`Added to cart: ${product.name}`, product.category, product.name);
    }
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

    this.cartItemsList.innerHTML = items.map(item => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image_url}" alt="${item.name}" />
        <div class="cart-item-info">
          <div class="cart-item-title">${item.name}</div>
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

    const subtotal = this.cartManager.getSubtotal().toFixed(2);
    if (this.cartSubtotal) this.cartSubtotal.textContent = `${subtotal} ${currencyLabel}`;

    if (this.btnMessengerCheckout) {
      const fbHandle = 'mouna.nouira';
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

  // Rich Product Information Detail Modal with Tabs
  openQuickView(productId, directProductObj = null) {
    const product = directProductObj || this.products.find(p => String(p.product_id) === String(productId));
    if (!product || !this.quickViewContent) return;

    this.telemetry.trackEvent(`Opened Detailed Product Info: ${product.name}`, product.category, product.name);

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';

    // Format Benefits list
    let benefitsHtml = '';
    if (Array.isArray(product.benefits) && product.benefits.length > 0) {
      benefitsHtml = `<ul class="benefits-list">${product.benefits.map(b => `<li>${b}</li>`).join('')}</ul>`;
    } else {
      benefitsHtml = `<p style="color:var(--color-text-secondary);">${product.description || 'Produit de haute qualité Oriflame.'}</p>`;
    }

    const howToUseHtml = product.how_to_use 
      ? `<p style="color:var(--color-text-secondary); line-height:1.7;">${product.how_to_use}</p>`
      : `<p style="color:var(--color-text-muted);">Appliquer selon les recommandations pour cette gamme.</p>`;

    const ingredientsHtml = product.ingredients
      ? `<p style="color:var(--color-text-secondary); line-height:1.7; font-size:0.88rem;">${product.ingredients}</p>`
      : `<p style="color:var(--color-text-muted);">Formulé avec des extraits botaniques et des ingrédients d'origine naturelle.</p>`;

    this.quickViewContent.innerHTML = `
        <div style="position:relative; background: radial-gradient(circle, #FFFFFF 40%, #F5F3EF 100%); border-radius: 14px; padding: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid #E8E5DF; box-shadow: inset 0 2px 6px rgba(0,0,0,0.03); min-height: 260px;">
          <img src="${product.image_url}" alt="${product.name}" onerror="this.onerror=null; this.src='https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${product.product_id}%2f${product.product_id}_1.png&MediaId=20989035&Version=1';" style="max-width: 100%; max-height: 250px; object-fit: contain; filter: drop-shadow(0 10px 18px rgba(0,0,0,0.15)); transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
          ${product.is_promo 
            ? `<span class="promo-badge" style="top:12px; left:12px; position:absolute;">-${product.discount_percent || 25}% OFF</span>`
            : `<span class="category-badge" style="top:12px; left:12px; position:absolute;">${product.category}</span>`
          }
        </div>

        <div>
          <h3 style="font-family: var(--font-serif); font-size: 1.4rem; color: #18181B; margin-bottom: 8px; line-height:1.3;">${product.name}</h3>
          
          <!-- Tab Navigation -->
          <div class="product-modal-tabs">
            <button class="product-tab-btn active" onclick="window.app.switchModalTab(event, 'tab-overview')">${this.i18n.t('tab_overview')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-benefits')">${this.i18n.t('tab_benefits')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-how-to-use')">${this.i18n.t('tab_how_to_use')}</button>
            <button class="product-tab-btn" onclick="window.app.switchModalTab(event, 'tab-ingredients')">${this.i18n.t('tab_ingredients')}</button>
          </div>

          <!-- Tab Content Panes -->
          <div id="tab-overview" class="product-tab-pane active">
            <p style="color: #52525B; line-height: 1.65; margin-bottom: 12px;">${product.description || ''}</p>
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
              <div class="info-chip-value">${product.product_id}</div>
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
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E8E5DF; padding-top: 18px; margin-top: 18px;">
            <div class="price-container">
              ${product.original_price ? `<span class="product-price-strike">${Number(product.original_price).toFixed(2)} ${currencyLabel}</span>` : ''}
              <span style="font-size: 1.6rem; font-weight: 800; color: ${product.is_promo ? 'var(--color-promo)' : '#18181B'}; letter-spacing:-0.02em;">${Number(product.price).toFixed(2)} <span style="font-size:0.95rem; font-weight:600; color:#52525B;">${currencyLabel}</span></span>
            </div>
            <button class="btn-add-cart" style="padding: 0 24px; min-height: 44px;" ${!product.in_stock ? 'disabled' : ''} onclick="window.app.addToCart('${product.product_id}'); window.app.closeModal(document.getElementById('quickview-modal-overlay'));">
              ${this.i18n.t('quickview_add')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.openModal(this.quickViewModalOverlay);
  }

  switchModalTab(event, targetTabId) {
    document.querySelectorAll('.product-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.product-tab-pane').forEach(pane => pane.classList.remove('active'));

    event.currentTarget.classList.add('active');
    const targetPane = document.getElementById(targetTabId);
    if (targetPane) targetPane.classList.add('active');
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
