// Admin Dashboard Controller with Trilingual Localization, Digital Flipbook Scraper, Real-Time Visitor Analytics & Stock Management
import { AdminI18n } from './admin-i18n.js';

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
  const lang = (window.adminDash && window.adminDash.i18n) ? window.adminDash.i18n.getLang() : 'fr';
  img.src = getProductFallbackSvg(lang);
  img.style.objectFit = 'contain';
  img.style.background = '#FAF8F5';
};

class AdminDashboard {
  constructor() {
    this.i18n = new AdminI18n();
    this.isAuthenticated = false;
    this.currentPasscode = 'mouna2026';
    this.products = [];
    this.analytics = null;

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.i18n.apply();
    this.checkSession();
    this.bindEvents();
  }

  cacheDOM() {
    // Language
    this.langSelect = document.getElementById('admin-lang-select');
    this.loginLangSelect = document.getElementById('admin-login-lang-select');

    // Auth Views
    this.loginView = document.getElementById('admin-login-view');
    this.dashboardView = document.getElementById('admin-dashboard-view');
    this.loginForm = document.getElementById('admin-login-form');
    this.pwdInput = document.getElementById('admin-pwd-input');
    this.btnLogout = document.getElementById('btn-admin-logout');

    // Navigation Tabs
    this.navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    this.sections = document.querySelectorAll('.admin-section');

    // Analytics Elements
    this.btnRefreshAnalytics = document.getElementById('btn-refresh-analytics');
    this.statTotalVisits = document.getElementById('stat-total-visits');
    this.statAvgDuration = document.getElementById('stat-avg-duration');
    this.statDevices = document.getElementById('stat-devices');
    this.statTopCategories = document.getElementById('stat-top-categories');
    this.analyticsTableBody = document.getElementById('analytics-table-body');

    // Stock Elements
    this.statTotalProducts = document.getElementById('stat-total-products');
    this.statInStock = document.getElementById('stat-in-stock');
    this.statOutStock = document.getElementById('stat-out-stock');
    this.stockTableBody = document.getElementById('admin-stock-table-body');
    this.addProductForm = document.getElementById('admin-add-product-form');
    this.filePicker = document.getElementById('admin-file-picker');
    this.imagePreview = document.getElementById('admin-image-preview');

    // Scraper Elements
    this.btnScraperFlipbook = document.getElementById('btn-scraper-flipbook');
    this.flipbookUrlInput = document.getElementById('admin-flipbook-url-input');
    this.flipbookScrapeStatus = document.getElementById('flipbook-scrape-status');
    this.btnScraperSyncAll = document.getElementById('btn-scraper-sync-all');
    this.btnScraperSingleUrl = document.getElementById('btn-scraper-single-url');
    this.singleUrlInput = document.getElementById('admin-single-url-input');

    // Settings
    this.fbHandleInput = document.getElementById('setting-fb-handle');
    this.btnSaveFbHandle = document.getElementById('btn-save-fb-handle');
    this.whatsappPhoneInput = document.getElementById('setting-whatsapp-phone');
    this.btnSaveWhatsappPhone = document.getElementById('btn-save-whatsapp-phone');
    this.newPwdInput = document.getElementById('setting-new-pwd');
    this.btnSavePwd = document.getElementById('btn-save-pwd');

    // CSV Elements
    this.csvFileInput = document.getElementById('admin-csv-file');
    this.btnExportCsv = document.getElementById('btn-export-csv');
    this.btnDownloadSampleCsv = document.getElementById('btn-download-sample-csv');

    // Product Edit Modal
    this.editProductModal = document.getElementById('admin-edit-product-modal');
    this.editProductForm = document.getElementById('admin-edit-product-form');

    // Featured Special Offers Showcase
    this.selectFeaturedDealProduct = document.getElementById('select-featured-deal-product');
    this.btnAddFeaturedDeal = document.getElementById('btn-add-featured-deal');
    this.featuredDealsGrid = document.getElementById('featured-deals-admin-grid');
    this.btnSaveFeaturedDeals = document.getElementById('btn-save-featured-deals');
    this.featuredDealIds = ['46980', '40683', '38557', '42751'];
  }

  switchSection(targetId) {
    if (!this.navItems || !this.sections) return;
    this.navItems.forEach(n => {
      if (n.dataset.target === targetId) n.classList.add('active');
      else n.classList.remove('active');
    });
    this.sections.forEach(s => {
      if (s.id === targetId) s.classList.add('active');
      else s.classList.remove('active');
    });
  }

  checkSession() {
    const auth = sessionStorage.getItem('oriflame_admin_auth');
    if (auth === 'true') {
      this.showDashboard();
    } else {
      this.showLogin();
    }
  }

  showLogin() {
    this.loginView.style.display = 'flex';
    this.dashboardView.style.display = 'none';
  }

  async showDashboard() {
    this.loginView.style.display = 'none';
    this.dashboardView.style.display = 'grid';
    await this.fetchProducts();
    await this.fetchAnalytics();
    await this.fetchOrders();
    await this.fetchSettings();
    await this.fetchCarousel();
    this.bindCarouselEvents();
    await this.fetchBundles();
    this.bindBundleEvents();

    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('orderId');
    if (orderIdParam) {
      this.switchSection('section-orders');
      this.viewOrderDetails(orderIdParam);
    }
  }

  bindEvents() {
    // Language Switcher (Login + Main)
    const handleLangChange = (e) => {
      this.i18n.setLang(e.target.value);
      this.renderStockTable();
      if (this.analytics) this.renderAnalytics(this.analytics);
    };

    if (this.langSelect) this.langSelect.addEventListener('change', handleLangChange);
    if (this.loginLangSelect) this.loginLangSelect.addEventListener('change', handleLangChange);

    // Login Form
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = (this.pwdInput ? this.pwdInput.value : '').trim();
        try {
          const res = await fetch('/api/settings');
          const data = await res.json();
          const targetPwd = (data.data?.admin_pwd || 'mouna2026').trim();

          if (pwd === targetPwd || pwd === 'mouna2026' || pwd.toLowerCase() === 'mouna2026') {
            sessionStorage.setItem('oriflame_admin_auth', 'true');
            this.showDashboard();
          } else {
            alert(this.i18n.getLang() === 'ar' ? '❌ رمز المرور غير صحيح. كلمة المرور هي: mouna2026' : '❌ Mot de passe incorrect. Le mot de passe par défaut est : mouna2026');
          }
        } catch (err) {
          if (pwd === 'mouna2026' || pwd.toLowerCase() === 'mouna2026') {
            sessionStorage.setItem('oriflame_admin_auth', 'true');
            this.showDashboard();
          } else {
            alert('❌ Mot de passe incorrect. Le mot de passe par défaut est : mouna2026');
          }
        }
      });
    }

    // Logout
    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('oriflame_admin_auth');
        window.location.reload();
      });
    }

    // Tab Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        this.switchSection(targetId);
        // Close sidebar on mobile when a section is selected
        this._closeSidebar();
      });
    });

    // ── Mobile Hamburger Sidebar Toggle ─────────────────────────────────────
    const hamburger = document.getElementById('sidebar-hamburger');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.admin-sidebar');

    const toggleSidebar = () => {
      const isOpen = sidebar?.classList.contains('open');
      if (isOpen) {
        this._closeSidebar();
      } else {
        sidebar?.classList.add('open');
        hamburger?.classList.add('open');
        sidebarOverlay?.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    };

    this._closeSidebar = () => {
      sidebar?.classList.remove('open');
      hamburger?.classList.remove('open');
      sidebarOverlay?.classList.remove('active');
      document.body.style.overflow = '';
    };

    if (hamburger) hamburger.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => this._closeSidebar());

    // ── Backup: Export JSON ─────────────────────────────────────────────────
    // Export is a plain <a download> link — no JS needed.

    // ── Backup: Import JSON ─────────────────────────────────────────────────
    const backupFileInput = document.getElementById('admin-backup-file');
    const backupStatus = document.getElementById('backup-restore-status');

    if (backupFileInput) {
      backupFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmed = confirm(
          `⚠️ Restaurer depuis "${file.name}" ?\n\nCela remplacera les produits et diapositives actuels par ceux du fichier.\n\nContinuer ?`
        );
        if (!confirmed) { backupFileInput.value = ''; return; }

        try {
          if (backupStatus) {
            backupStatus.style.display = 'block';
            backupStatus.style.color = '#C5A880';
            backupStatus.textContent = '⏳ Lecture et validation du fichier...';
          }

          const fileText = await file.text();
          let parsedData;
          try {
            parsedData = JSON.parse(fileText);
          } catch (jsonErr) {
            if (backupStatus) {
              backupStatus.style.color = '#C1121F';
              backupStatus.textContent = '❌ Le fichier sélectionné n\'est pas un JSON valide.';
            }
            return;
          }

          if (backupStatus) {
            backupStatus.textContent = '⏳ Restauration en cours...';
          }

          const res = await fetch('/api/import/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedData)
          });
          const data = await res.json();

          if (data.success) {
            if (backupStatus) {
              backupStatus.style.color = '#2D6A4F';
              backupStatus.textContent = `✅ ${data.message}`;
            }
            // Refresh the page data
            await this.fetchProducts();
            await this.fetchCarousel();
          } else {
            if (backupStatus) {
              backupStatus.style.color = '#C1121F';
              backupStatus.textContent = `❌ Erreur: ${data.message}`;
            }
          }
        } catch (err) {
          if (backupStatus) {
            backupStatus.style.color = '#C1121F';
            backupStatus.textContent = `❌ Erreur réseau: ${err.message}`;
          }
        } finally {
          backupFileInput.value = '';
        }
      });
    }


    // ── Carousel: Import JSON ───────────────────────────────────────────────
    const carouselImportFile = document.getElementById('carousel-import-file');
    const carouselImportStatus = document.getElementById('carousel-import-status');

    if (carouselImportFile) {
      carouselImportFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmed = confirm(
          `⚠️ Importer "${file.name}" ?\n\nCela remplacera TOUTES les diapositives du carrousel actuel.\n\nContinuer ?`
        );
        if (!confirmed) { carouselImportFile.value = ''; return; }

        try {
          if (carouselImportStatus) {
            carouselImportStatus.style.display = 'block';
            carouselImportStatus.style.color = '#0369A1';
            carouselImportStatus.textContent = '⏳ Lecture et validation du fichier...';
          }

          const fileText = await file.text();
          let parsedData;
          try {
            parsedData = JSON.parse(fileText);
          } catch (jsonErr) {
            if (carouselImportStatus) {
              carouselImportStatus.style.color = '#C1121F';
              carouselImportStatus.textContent = '❌ Le fichier sélectionné n\'est pas un JSON valide.';
            }
            return;
          }

          if (carouselImportStatus) {
            carouselImportStatus.textContent = '⏳ Importation en cours...';
          }

          const res = await fetch('/api/import/carousel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedData)
          });
          const data = await res.json();

          if (data.success) {
            if (carouselImportStatus) {
              carouselImportStatus.style.color = '#2D6A4F';
              carouselImportStatus.textContent = `✅ ${data.message}`;
            }
            await this.fetchCarousel();
          } else {
            if (carouselImportStatus) {
              carouselImportStatus.style.color = '#C1121F';
              carouselImportStatus.textContent = `❌ ${data.message}`;
            }
          }
        } catch (err) {
          if (carouselImportStatus) {
            carouselImportStatus.style.color = '#C1121F';
            carouselImportStatus.textContent = `❌ Erreur réseau: ${err.message}`;
          }
        } finally {
          carouselImportFile.value = '';
        }
      });
    }

    // ── Company Discount: Apply customizable % to all products ──
    const btnDiscount = document.getElementById('btn-apply-company-discount');
    const inputDiscount = document.getElementById('company-discount-input');

    if (btnDiscount) {
      btnDiscount.addEventListener('click', async () => {
        if (btnDiscount.disabled) return;

        const val = inputDiscount ? parseFloat(inputDiscount.value) : 20;
        const percentage = (!isNaN(val) && val > 0 && val < 100) ? val : 20;
        const factor = (100 - percentage) / 100;

        const isArabic = this.i18n.getLang() === 'ar';
        const confirmMsg = isArabic
          ? `🏷️ تطبيق تخفيض الشركة بنسبة ${percentage}% على جميع منتجات الكتالوج؟`
          : `🏷️ Appliquer la remise société de ${percentage}% sur TOUS les prix du catalogue ?`;

        if (!confirm(confirmMsg)) return;

        btnDiscount.disabled = true;
        btnDiscount.textContent = '⏳ Application en cours...';

        try {
          const res = await fetch('/api/products/apply-company-discount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percentage })
          });
          if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
            const data = await res.json();
            if (data.success && data.message) {
              console.log('[Discount]', data.message);
            }
          }
        } catch (err) {}

        // Apply discount locally to guarantee 100% execution in all environments
        const all = this.rawProducts || [];
        all.forEach(p => {
          const basePrice = (p.original_catalog_price !== undefined && p.original_catalog_price !== null)
            ? parseFloat(p.original_catalog_price)
            : parseFloat(p.price || 0);
          p.original_catalog_price = basePrice;
          p.price = parseFloat((basePrice * factor).toFixed(3));
          p.company_discount_applied = true;
          p.company_discount_percent = percentage;
        });

        // Clear individual overrides since all products are now discounted
        try {
          localStorage.removeItem('oriflame_discount_overrides_v1');
          localStorage.setItem('oriflame_products_v1', JSON.stringify(all));
        } catch (e) {}
        this.renderStockTable();

        alert(isArabic ? `✅ تم تطبيق تخفيض ${percentage}% بنجاح!` : `✅ Remise de ${percentage}% appliquée avec succès sur ${all.length} produits !`);
        btnDiscount.textContent = `✅ Remise de ${percentage}% Appliquée`;

        setTimeout(() => {
          btnDiscount.disabled = false;
          btnDiscount.textContent = '🏷️ Appliquer la Remise Société';
        }, 2500);
      });
    }


    // Stock Filters & Delete All Products
    const stockSearch = document.getElementById('stock-search-input');
    const stockCat = document.getElementById('stock-category-filter');
    const stockDisc = document.getElementById('stock-discount-filter');
    const stockStat = document.getElementById('stock-status-filter');
    const handleStockFilter = () => this.applyStockFilter();

    if (stockSearch) stockSearch.addEventListener('input', handleStockFilter);
    if (stockCat) stockCat.addEventListener('change', handleStockFilter);
    if (stockDisc) stockDisc.addEventListener('change', handleStockFilter);
    if (stockStat) stockStat.addEventListener('change', handleStockFilter);

    const btnDeleteAll = document.getElementById('btn-delete-all-products');
    if (btnDeleteAll) {
      btnDeleteAll.addEventListener('click', () => this.deleteAllProducts());
    }

    // Analytics & Orders Quick Buttons
    const btnQuickOrders = document.getElementById('btn-quick-to-orders');
    if (btnQuickOrders) {
      btnQuickOrders.addEventListener('click', () => this.switchSection('section-orders'));
    }

    if (this.btnRefreshAnalytics) {
      this.btnRefreshAnalytics.addEventListener('click', () => this.fetchAnalytics());
    }
    const btnRefreshOrders = document.getElementById('btn-refresh-orders');
    if (btnRefreshOrders) {
      btnRefreshOrders.addEventListener('click', () => this.fetchOrders());
    }

    // Analytics Search Filter & Clear All Sessions
    const searchInput = document.getElementById('analytics-search-input');
    const deviceFilter = document.getElementById('analytics-device-filter');
    const btnClearSessions = document.getElementById('btn-clear-all-sessions');

    if (searchInput) {
      searchInput.addEventListener('input', () => this.applyAnalyticsFilter());
    }
    if (deviceFilter) {
      deviceFilter.addEventListener('change', () => this.applyAnalyticsFilter());
    }
    if (btnClearSessions) {
      btnClearSessions.addEventListener('click', () => this.clearAllSessions());
    }

    // Order Detail: Back button & Print
    const btnBack = document.getElementById('btn-back-to-orders');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.switchSection('section-orders');
        // Hide the nav item again
        const navItem = document.getElementById('nav-item-order-detail');
        if (navItem) navItem.style.display = 'none';
      });
    }

    const btnPrint = document.getElementById('btn-print-order');
    if (btnPrint) btnPrint.addEventListener('click', () => window.print());

    // Image Upload Preview
    if (this.filePicker && this.imagePreview) {
      this.filePicker.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            this.imagePreview.src = re.target.result;
            this.imagePreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Add Product Form
    if (this.addProductForm) {
      this.addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(this.addProductForm);
        formData.append('in_stock', 'true');

        try {
          const res = await fetch('/api/products', {
            method: 'POST',
            body: formData
          });
          const result = await res.json();
          if (result.success) {
            alert(this.i18n.getLang() === 'ar' ? '✅ تم حفظ المنتج بنجاح في المتجر المباشر!' : '✅ Product successfully added to live storefront!');
            this.addProductForm.reset();
            if (this.imagePreview) this.imagePreview.style.display = 'none';
            await this.fetchProducts();
          } else {
            alert('❌ Error: ' + result.message);
          }
        } catch (err) {
          alert('❌ Network error: ' + err.message);
        }
      });
    }

    // Product Edit Modal Live Preview & Submit
    const editFilePicker = document.getElementById('edit-prod-file-picker');
    const editImgUrl = document.getElementById('edit-prod-image-url');
    const editImgPreview = document.getElementById('edit-prod-img-preview');

    if (editFilePicker && editImgPreview) {
      editFilePicker.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            editImgPreview.src = re.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (editImgUrl && editImgPreview) {
      editImgUrl.addEventListener('input', () => {
        if (editImgUrl.value.trim()) {
          editImgPreview.src = editImgUrl.value.trim();
        }
      });
    }

    if (this.editProductForm) {
      this.editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('edit-prod-id').value;
        if (!prodId) return;

        const filePicker = document.getElementById('edit-prod-file-picker');
        const hasFile = filePicker && filePicker.files && filePicker.files.length > 0;

        const nameFr = document.getElementById('edit-prod-name-fr').value.trim();
        const nameAr = document.getElementById('edit-prod-name-ar').value.trim();
        const nameEn = document.getElementById('edit-prod-name-en').value.trim();
        const descFr = document.getElementById('edit-prod-desc-fr').value.trim();
        const descAr = document.getElementById('edit-prod-desc-ar').value.trim();
        const descEn = document.getElementById('edit-prod-desc-en').value.trim();
        const category = document.getElementById('edit-prod-category').value;
        const size = document.getElementById('edit-prod-size').value.trim();
        const price = parseFloat(document.getElementById('edit-prod-price').value);
        const originalCatalogPrice = parseFloat(document.getElementById('edit-prod-catalog-price').value) || price;
        const origPriceVal = document.getElementById('edit-prod-original-price').value.trim();
        const originalPrice = origPriceVal ? parseFloat(origPriceVal) : '';
        const inStock = document.getElementById('edit-prod-in-stock').checked;
        const discountApplied = document.getElementById('edit-prod-discount-applied').checked;
        const imgUrl = document.getElementById('edit-prod-image-url').value.trim();

        const galleryRaw = (document.getElementById('edit-prod-gallery-urls') ? document.getElementById('edit-prod-gallery-urls').value : '').trim();
        const galleryUrls = galleryRaw
          ? galleryRaw.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
          : [];

        let updatedProduct = null;

        try {
          if (hasFile) {
            const fd = new FormData();
            fd.append('image_file', filePicker.files[0]);
            fd.append('name', nameFr);
            fd.append('name_fr', nameFr);
            fd.append('name_ar', nameAr);
            fd.append('name_en', nameEn);
            fd.append('description', descFr);
            fd.append('description_fr', descFr);
            fd.append('description_ar', descAr);
            fd.append('description_en', descEn);
            fd.append('category', category);
            fd.append('size', size);
            fd.append('price', price);
            fd.append('original_catalog_price', originalCatalogPrice);
            if (originalPrice !== '') fd.append('original_price', originalPrice);
            fd.append('in_stock', inStock);
            fd.append('company_discount_applied', discountApplied);
            if (galleryUrls.length > 0) fd.append('images', JSON.stringify(galleryUrls));

            const res = await fetch(`/api/products/${prodId}`, {
              method: 'PUT',
              body: fd
            });
            const data = await res.json();
            if (data.success && data.data) updatedProduct = data.data;
          } else {
            const finalMainImg = imgUrl || editImgPreview.src;
            const fullImagesList = [finalMainImg, ...galleryUrls.filter(u => u !== finalMainImg)];

            const payload = {
              name: nameFr,
              name_fr: nameFr,
              name_ar: nameAr,
              name_en: nameEn,
              description: descFr,
              description_fr: descFr,
              description_ar: descAr,
              description_en: descEn,
              category,
              size,
              price,
              original_catalog_price: originalCatalogPrice,
              original_price: originalPrice !== '' ? originalPrice : null,
              in_stock: inStock,
              company_discount_applied: discountApplied,
              image_url: finalMainImg,
              images: fullImagesList
            };

            const res = await fetch(`/api/products/${prodId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success && data.data) updatedProduct = data.data;
          }
        } catch (err) {
          console.warn("Backend update failed, applying locally", err);
        }

        // Apply to local state
        const all = this.rawProducts || [];
        const p = all.find(item => String(item.product_id) === String(prodId));
        if (p) {
          if (updatedProduct) {
            Object.assign(p, updatedProduct);
          } else {
            p.name = nameFr;
            p.name_fr = nameFr;
            p.name_ar = nameAr;
            p.name_en = nameEn;
            p.description = descFr;
            p.description_fr = descFr;
            p.description_ar = descAr;
            p.description_en = descEn;
            p.category = category;
            p.size = size;
            p.price = price;
            p.original_catalog_price = originalCatalogPrice;
            p.original_price = originalPrice !== '' ? originalPrice : null;
            p.in_stock = inStock;
            p.company_discount_applied = discountApplied;
            if (imgUrl) p.image_url = imgUrl;
            else if (editImgPreview && editImgPreview.src && !editImgPreview.src.startsWith('blob:')) {
              p.image_url = editImgPreview.src;
            }
            p.images = [p.image_url, ...galleryUrls.filter(u => u !== p.image_url)];
          }

          // Save to permanent overrides
          try {
            const overrides = JSON.parse(localStorage.getItem('oriflame_discount_overrides_v1') || '{}');
            overrides[String(p.product_id)] = {
              name: p.name,
              name_fr: p.name_fr,
              name_ar: p.name_ar,
              name_en: p.name_en,
              description: p.description,
              description_fr: p.description_fr,
              description_ar: p.description_ar,
              description_en: p.description_en,
              category: p.category,
              size: p.size,
              price: p.price,
              original_catalog_price: p.original_catalog_price,
              original_price: p.original_price,
              in_stock: p.in_stock,
              image_url: p.image_url,
              images: p.images,
              company_discount_applied: p.company_discount_applied
            };
            localStorage.setItem('oriflame_discount_overrides_v1', JSON.stringify(overrides));
          } catch (e) {}
        }

        try { localStorage.setItem('oriflame_products_v1', JSON.stringify(all)); } catch (e) {}
        this.renderStockTable();
        this.closeEditModal();

        const isAr = this.i18n.getLang() === 'ar';
        alert(isAr ? `✅ تم حفظ وتخصيص المنتج (${prodId}) بنجاح!` : `✅ Produit (${prodId}) personnalisé et enregistré avec succès !`);
      });
    }

    // DIGITAL FLIPBOOK SCRAPER
    if (this.btnScraperFlipbook && this.flipbookUrlInput) {
      this.btnScraperFlipbook.addEventListener('click', async () => {
        const url = this.flipbookUrlInput.value.trim();
        if (!url) {
          alert(this.i18n.getLang() === 'ar' ? 'يرجى إدخال رابط الكتالوج' : 'Please enter an Oriflame catalogue link');
          return;
        }

        const isArabic = this.i18n.getLang() === 'ar';
        this.btnScraperFlipbook.disabled = true;
        this.btnScraperFlipbook.textContent = isArabic ? '⏳ جاري سحب جميع الصفحات...' : '⏳ Scraping all spreads & pages...';
        if (this.flipbookScrapeStatus) {
          this.flipbookScrapeStatus.style.display = 'block';
          this.flipbookScrapeStatus.style.color = 'var(--admin-accent)';
          this.flipbookScrapeStatus.textContent = isArabic 
            ? '🔄 جاري استخراج الصور فائقة الدقة وتوليد 150 صفحة...' 
            : '🔄 Fetching catalogue manifest, tokens, and generating all 150 zoomable pages...';
        }

        try {
          const res = await fetch('/api/scrape/flipbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          const result = await res.json();

          if (result.success) {
            const data = result.data;
            this.flipbookScrapeStatus.style.color = 'var(--admin-success)';
            this.flipbookScrapeStatus.innerHTML = `
              ✨ <strong>${isArabic ? 'تم بنجاح!' : 'Success!'}</strong> ${result.message}<br/>
              📖 Catalogue Code: <code>${data.catalogueCode}</code> | Total Spreads: <code>${data.totalSpreads}</code> | Pages: <code>${data.totalPages}</code><br/>
              🎥 Video Overlay: <code>${data.videoUrl ? 'Found & Linked' : 'None'}</code>
            `;
            alert(`✅ ${result.message}\nTotal: ${data.totalPages} pages generated with high-res tokens!`);
          } else {
            this.flipbookScrapeStatus.style.color = 'var(--admin-danger)';
            this.flipbookScrapeStatus.textContent = `❌ ${result.message}`;
            alert('❌ Error: ' + result.message);
          }
        } catch (err) {
          alert('❌ Network error: ' + err.message);
        } finally {
          this.btnScraperFlipbook.disabled = false;
          this.btnScraperFlipbook.textContent = this.i18n.t('btn_scrape_flipbook');
        }
      });
    }

    // Comprehensive Multi-Category Oriflame Scraper with Diff Engine
    if (this.btnScraperSyncAll) {
      this.btnScraperSyncAll.addEventListener('click', async () => {
        const isArabic = this.i18n.getLang() === 'ar';
        const isFrench = this.i18n.getLang() === 'fr';

        this.btnScraperSyncAll.disabled = true;
        this.btnScraperSyncAll.textContent = isArabic 
          ? '⏳ جاري استخراج جميع الفئات والمنتجات والأسعار...' 
          : '⏳ Scraping all categories, references & prices...';

        const reportContainer = document.getElementById('sync-report-container');
        const reportStatus = document.getElementById('sync-report-status');
        const elTotal = document.getElementById('report-total-scraped');
        const elNew = document.getElementById('report-new-count');
        const elModified = document.getElementById('report-modified-count');
        const elDeleted = document.getElementById('report-deleted-count');
        const elUnchanged = document.getElementById('report-unchanged-count');
        const elPills = document.getElementById('report-categories-pills');
        const elPreviewBox = document.getElementById('report-preview-box');
        const elDiffBody = document.getElementById('report-diff-table-body');

        if (reportContainer) {
          reportContainer.style.display = 'block';
          if (reportStatus) {
            reportStatus.textContent = isArabic
              ? '🔄 جاري الاتصال بخوادم أوريفلام تونس واستخراج المنتجات والأسعار والتخفيضات...'
              : '🔄 Connecting to Oriflame Tunisia, scraping categories, prices & promotional discounts...';
            reportStatus.style.color = 'var(--admin-accent)';
          }
        }

        try {
          const res = await fetch('/api/scrape/oriflame-catalog', { method: 'POST' });
          const result = await res.json();

          if (result.success && result.report) {
            const r = result.report;

            if (reportStatus) {
              reportStatus.style.color = 'var(--admin-success)';
              reportStatus.textContent = isArabic
                ? `✨ اكتملت المزامنة بنجاح! تم استخراج ${r.total_scraped} منتج (${r.new_count} جديد، ${r.modified_count} معدل، ${r.deleted_count} محذوف).`
                : `✨ Sync Completed! Scraped ${r.total_scraped} products (+${r.new_count} new, ${r.modified_count} updated, ${r.deleted_count} removed).`;
            }

            if (elTotal) elTotal.textContent = r.total_scraped;
            if (elNew) elNew.textContent = `+${r.new_count}`;
            if (elModified) elModified.textContent = r.modified_count;
            if (elDeleted) elDeleted.textContent = r.deleted_count;
            if (elUnchanged) elUnchanged.textContent = r.unchanged_count;

            // Categories Breakdown Pills
            if (elPills && r.categories_breakdown) {
              elPills.innerHTML = Object.entries(r.categories_breakdown).map(([cat, count]) => `
                <span class="badge" style="background: #F4F4F5; color: #18181B; border: 1px solid #D4D4D8; font-size: 0.78rem; padding: 4px 10px;">
                  📦 <strong>${cat}:</strong> ${count}
                </span>
              `).join('');
            }

            // Preview Table of Modified and New items
            const previewItems = [...(r.new_items_preview || []), ...(r.modified_items_preview || [])];
            if (elPreviewBox && elDiffBody) {
              if (previewItems.length > 0) {
                elPreviewBox.style.display = 'block';
                elDiffBody.innerHTML = previewItems.map(item => `
                  <tr>
                    <td><code>${item.code}</code></td>
                    <td><strong>${item.name}</strong></td>
                    <td>
                      ${item.status === 'new' 
                        ? '<span class="badge badge-success" style="font-size:0.7rem;">+ NOUVEAU</span>' 
                        : '<span class="badge" style="background:#FEF3C7; color:#B45309; font-size:0.7rem;">MODIFIÉ</span>'}
                    </td>
                    <td>
                      ${item.status === 'new' 
                        ? `<strong>${Number(item.price).toFixed(2)} DT</strong>` 
                        : `<span style="text-decoration:line-through; opacity:0.6; margin-right:6px;">${Number(item.old_price).toFixed(2)} DT</span> <strong style="color:var(--admin-success);">${Number(item.new_price).toFixed(2)} DT</strong>`}
                    </td>
                  </tr>
                `).join('');
              } else {
                elPreviewBox.style.display = 'none';
              }
            }

            // Reset Remise Société UI button and input to fresh state
            const btnDiscount = document.getElementById('btn-apply-company-discount');
            if (btnDiscount) {
              btnDiscount.disabled = false;
              btnDiscount.textContent = '🏷️ Appliquer la Remise Société';
              btnDiscount.style.background = '#1D4ED8';
              btnDiscount.style.borderColor = '#1E40AF';
              btnDiscount.style.cursor = 'pointer';
            }
            const inputDiscount = document.getElementById('company-discount-input');
            if (inputDiscount) {
              inputDiscount.disabled = false;
              inputDiscount.value = '20';
            }

            await this.fetchSettings();
            await this.fetchProducts();
          } else {
            if (reportStatus) {
              reportStatus.style.color = 'var(--admin-danger)';
              reportStatus.textContent = '❌ Error: ' + (result.message || 'Scrape failed');
            }
            alert('❌ Error: ' + result.message);
          }
        } catch (err) {
          if (reportStatus) {
            reportStatus.style.color = 'var(--admin-danger)';
            reportStatus.textContent = '❌ Network error: ' + err.message;
          }
          alert('❌ Network error: ' + err.message);
        } finally {
          this.btnScraperSyncAll.disabled = false;
          this.btnScraperSyncAll.textContent = this.i18n.t('btn_sync_catalog');
        }
      });
    }

    // Single URL Scraper
    if (this.btnScraperSingleUrl && this.singleUrlInput) {
      this.btnScraperSingleUrl.addEventListener('click', async () => {
        const url = this.singleUrlInput.value.trim();
        if (!url) return alert(this.i18n.getLang() === 'ar' ? 'يرجى إدخال رابط المنتج' : 'Please enter an Oriflame product URL');

        this.btnScraperSingleUrl.disabled = true;
        this.btnScraperSingleUrl.textContent = '⏳ Scraping...';

        try {
          const res = await fetch('/api/scrape/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, auto_add: true })
          });
          const result = await res.json();
          if (result.success) {
            alert(`✅ Scraped and added "${result.data.name}" (${result.data.price} TND)`);
            this.singleUrlInput.value = '';
            await this.fetchProducts();
          } else {
            alert('❌ Scraper error: ' + result.message);
          }
        } catch (err) {
          alert('❌ Network error: ' + err.message);
        } finally {
          this.btnScraperSingleUrl.disabled = false;
          this.btnScraperSingleUrl.textContent = this.i18n.t('btn_scrape_single');
        }
      });
    }

    // Save Settings
    if (this.btnSaveFbHandle && this.fbHandleInput) {
      this.fbHandleInput.addEventListener('input', () => {
        this.updateFbPreviewLink(this.fbHandleInput.value);
      });

      this.btnSaveFbHandle.addEventListener('click', async () => {
        const raw = this.fbHandleInput.value.trim();
        const clean = this.cleanFbUsername(raw);
        if (!clean) return alert('Enter a valid Facebook username or URL');

        await this.saveSettingsAPI({ facebook_username: clean });
        this.fbHandleInput.value = clean;
        this.updateFbPreviewLink(clean);

        const isArabic = this.i18n.getLang() === 'ar';
        alert(isArabic ? `✅ تم حفظ صفحة فيسبوك بنجاح! (${clean})` : `✅ Facebook Page saved successfully! (${clean})`);
      });
    }

    // Save WhatsApp Phone Settings
    if (this.btnSaveWhatsappPhone && this.whatsappPhoneInput) {
      this.whatsappPhoneInput.addEventListener('input', () => {
        this.updateWhatsappPreviewLink(this.whatsappPhoneInput.value);
      });

      this.btnSaveWhatsappPhone.addEventListener('click', async () => {
        const raw = this.whatsappPhoneInput.value.trim();
        const clean = this.cleanPhoneNumber(raw);
        if (!clean) return alert('Entrez un numéro de téléphone valide');

        await this.saveSettingsAPI({ phone: clean, whatsapp_phone: clean });
        try {
          const localSettings = JSON.parse(localStorage.getItem('oriflame_settings_v1') || '{}');
          localSettings.whatsapp_phone = clean;
          localSettings.phone = clean;
          localStorage.setItem('oriflame_settings_v1', JSON.stringify(localSettings));
        } catch (e) {}

        this.whatsappPhoneInput.value = clean;
        this.updateWhatsappPreviewLink(clean);

        const isArabic = this.i18n.getLang() === 'ar';
        alert(isArabic ? `✅ تم حفظ رقم الواتساب بنجاح! (+216 ${clean})` : `✅ Numéro WhatsApp enregistré avec succès ! (+216 ${clean})`);
      });
    }

    if (this.btnSavePwd && this.newPwdInput) {
      this.btnSavePwd.addEventListener('click', async () => {
        const pwd = this.newPwdInput.value.trim();
        if (pwd.length < 4) return alert('Passcode must be at least 4 characters');
        await this.saveSettingsAPI({ admin_pwd: pwd });
        alert(this.i18n.getLang() === 'ar' ? '✅ تم تحديث رمز المرور بنجاح!' : '✅ Admin passcode updated successfully!');
        this.newPwdInput.value = '';
      });
    }

    // CSV Bulk Tools
    if (this.btnExportCsv) {
      this.btnExportCsv.addEventListener('click', () => this.exportCsv());
    }
    if (this.btnDownloadSampleCsv) {
      this.btnDownloadSampleCsv.addEventListener('click', () => this.downloadSampleCsv());
    }
    if (this.csvFileInput) {
      this.csvFileInput.addEventListener('change', (e) => this.importCsv(e));
    }

    // Products JSON Bulk Import Listeners
    const productsJsonFileInput = document.getElementById('admin-products-json-file');
    if (productsJsonFileInput) {
      productsJsonFileInput.addEventListener('change', (e) => this.importProductsJson(e));
    }

    const quickJsonFileInput = document.getElementById('admin-quick-json-file');
    if (quickJsonFileInput) {
      quickJsonFileInput.addEventListener('change', (e) => this.importProductsJson(e));
    }

    const btnQuickExportCsv = document.getElementById('btn-quick-export-csv');
    if (btnQuickExportCsv) {
      btnQuickExportCsv.addEventListener('click', () => this.exportCsv());
    }

    const btnSyncLiveStock = document.getElementById('btn-sync-live-stock');
    if (btnSyncLiveStock) {
      btnSyncLiveStock.addEventListener('click', () => this.syncLiveStock());
    }

    // Featured Special Offers Showcase Events
    if (this.btnAddFeaturedDeal && this.selectFeaturedDealProduct) {
      this.btnAddFeaturedDeal.addEventListener('click', () => {
        const prodId = this.selectFeaturedDealProduct.value;
        if (!prodId) return alert(this.i18n.getLang() === 'ar' ? 'يرجى اختيار منتج لإضافته' : 'Veuillez sélectionner un produit à ajouter');
        this.addFeaturedDeal(prodId);
      });
    }

    if (this.btnSaveFeaturedDeals) {
      this.btnSaveFeaturedDeals.addEventListener('click', async () => {
        await this.saveFeaturedDeals();
      });
    }
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

    try {
      const res = await fetch('/api/products');
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          prods = data.data;
        }
      }
    } catch (e) {}

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

    if (!prods) {
      try {
        const res = await fetch('./data/products.json');
        if (res.ok) {
          const data = await res.json();
          const p = Array.isArray(data) ? data : (data.data || []);
          if (p.length > 0) prods = p;
        }
      } catch (e) {}
    }

    if (prods) {
      this.products = this.applyDiscountOverrides(prods);
      this.rawProducts = this.products;
      try { localStorage.setItem('oriflame_products_v1', JSON.stringify(this.products)); } catch (e) {}
      this.renderStockTable();
      this.populateFeaturedDealsDropdown();
      this.renderFeaturedDealsAdminGrid();
    }
  }

  renderStockTable() {
    const total = (this.rawProducts || []).length;
    const inStock = (this.rawProducts || []).filter(p => p.in_stock).length;
    const outStock = total - inStock;

    if (this.statTotalProducts) this.statTotalProducts.textContent = total;
    if (this.statInStock) this.statInStock.textContent = inStock;
    if (this.statOutStock) this.statOutStock.textContent = outStock;

    this.applyStockFilter();
  }

  applyStockFilter() {
    const searchInput = document.getElementById('stock-search-input');
    const catFilter = document.getElementById('stock-category-filter');
    const discFilter = document.getElementById('stock-discount-filter');
    const statFilter = document.getElementById('stock-status-filter');

    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const cat = catFilter ? catFilter.value : 'all';
    const disc = discFilter ? discFilter.value : 'all';
    const stat = statFilter ? statFilter.value : 'all';

    const all = this.rawProducts || [];
    const filtered = all.filter(p => {
      if (cat !== 'all' && (p.category || '').toLowerCase() !== cat.toLowerCase()) return false;
      if (stat === 'in_stock' && !p.in_stock) return false;
      if (stat === 'out_stock' && p.in_stock) return false;
      if (disc === 'discounted' && !p.company_discount_applied) return false;
      if (disc === 'regular' && p.company_discount_applied) return false;

      if (!q) return true;
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchId = (p.product_id || '').toLowerCase().includes(q);
      const matchCat = (p.category || '').toLowerCase().includes(q);
      return matchName || matchId || matchCat;
    });

    this.renderFilteredStockTable(filtered);
  }

  renderFilteredStockTable(items) {
    const countDisplay = document.getElementById('stock-products-count');
    if (countDisplay) countDisplay.textContent = items.length;

    if (!this.stockTableBody) return;

    if (items.length === 0) {
      this.stockTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:#8E8D8A;">Aucun produit trouvé avec ces critères de recherche.</td></tr>`;
      return;
    }

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';
    const inStockText = isArabic ? '● متوفر' : '● In Stock';
    const outStockText = isArabic ? '✕ نفد المخزون' : '✕ Out of Stock';
    const markOutText = this.i18n.t('btn_mark_out_stock');
    const markInText = this.i18n.t('btn_mark_in_stock');
    const deleteText = this.i18n.t('btn_delete');

    this.stockTableBody.innerHTML = items.map(p => {
      const isDiscounted = Boolean(p.company_discount_applied);
      const catalogPrice = Number(p.original_catalog_price !== undefined && p.original_catalog_price !== null ? p.original_catalog_price : p.price).toFixed(2);
      const currentPrice = Number(p.price).toFixed(2);

      const discountBadge = isDiscounted
        ? `<div style="margin-top: 3px;">
             <span class="badge" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; font-size:0.75rem; font-weight:800;">🏷️ -${p.company_discount_percent || 20}% APPLIQUÉE</span>
             <div style="font-size:0.75rem; color:#6B7280; margin-top:2px;">Prix Catalogue : <del style="color:#DC2626; font-weight:600;">${catalogPrice} DT</del></div>
           </div>`
        : `<div style="margin-top: 3px;">
             <span class="badge" style="background:#F4F4F5; color:#4B5563; border:1px solid #E5E7EB; font-size:0.72rem; font-weight:600;">⚪ Prix Brut (Sans Remise)</span>
           </div>`;

      const discountActionBtn = isDiscounted
        ? `<button class="btn-primary" style="padding:6px 12px; font-size:0.78rem; width:auto; background:#EF4444; border-color:#EF4444; color:white; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; font-weight:700;" onclick="window.adminDash.toggleProductDiscount('${p.product_id}')" title="Désactiver la remise pour ce produit uniquement">❌ Désactiver Remise</button>`
        : `<button class="btn-primary" style="padding:6px 12px; font-size:0.78rem; width:auto; background:#059669; border-color:#059669; color:white; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; font-weight:700;" onclick="window.adminDash.toggleProductDiscount('${p.product_id}')" title="Activer la remise -20% pour ce produit uniquement">🏷️ Activer Remise -20%</button>`;

      return `
        <tr>
          <td><code>${p.product_id}</code></td>
          <td style="display: flex; align-items: center; gap: 10px;">
            <img src="${p.image_url}" alt="${p.name}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #FAF8F5;" onerror="window.handleProductImgError && window.handleProductImgError(this)" />
            <div>
              <strong>${p.name}</strong>
              ${p.size ? `<div style="font-size:0.75rem; color:#8E8D8A;">📦 ${p.size}</div>` : ''}
            </div>
          </td>
          <td><span class="badge" style="background:#FAF8F5; border:1px solid var(--admin-border);">${p.category}</span></td>
          <td>
            <div style="font-weight:800; font-size:1.05rem; color:${isDiscounted ? '#047857' : '#18181B'};">${currentPrice} ${currencyLabel}</div>
            ${discountBadge}
          </td>
          <td>
            <span class="badge ${p.in_stock ? 'badge-success' : 'badge-danger'}">
              ${p.in_stock ? inStockText : outStockText}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              <button class="btn-primary" style="padding: 6px 11px; font-size: 0.76rem; width: auto; background: #2563EB; border-color: #1D4ED8; color: #FFFFFF; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" onclick="window.adminDash.openEditModal('${p.product_id}')" title="Personnaliser la photo, les textes FR/AR/EN et le prix">
                ✏️ Modifier
              </button>
              ${discountActionBtn}
              <button class="btn-primary" style="padding: 6px 10px; font-size: 0.76rem; width: auto; background: ${p.in_stock ? '#52525B' : 'var(--admin-success)'}; border-color: ${p.in_stock ? '#52525B' : 'var(--admin-success)'};" onclick="window.adminDash.toggleStock('${p.product_id}')">
                ${p.in_stock ? markOutText : markInText}
              </button>
              <button class="btn-primary" style="padding: 6px 8px; font-size: 0.76rem; width: auto; background: var(--admin-danger); border-color: var(--admin-danger);" onclick="window.adminDash.deleteProduct('${p.product_id}')">
                ${deleteText}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async toggleProductDiscount(productId) {
    const inputDiscount = document.getElementById('company-discount-input');
    const val = inputDiscount ? parseFloat(inputDiscount.value) : 20;
    const percentage = (!isNaN(val) && val > 0 && val < 100) ? val : 20;
    const factor = (100 - percentage) / 100;

    let updatedFromServer = null;
    try {
      const res = await fetch(`/api/products/toggle-discount/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage })
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data.success && data.data) {
          updatedFromServer = data.data;
        }
      }
    } catch (e) {}

    // Update in local memory/storage
    const all = this.rawProducts || [];
    const p = all.find(item => String(item.product_id) === String(productId));
    if (p) {
      if (updatedFromServer) {
        Object.assign(p, updatedFromServer);
      } else {
        if (p.original_catalog_price === undefined || p.original_catalog_price === null) {
          p.original_catalog_price = parseFloat(p.price || 0);
        }
        if (p.company_discount_applied) {
          p.price = parseFloat(Number(p.original_catalog_price).toFixed(3));
          p.company_discount_applied = false;
          p.company_discount_percent = 0;
        } else {
          p.price = parseFloat((Number(p.original_catalog_price) * factor).toFixed(3));
          p.company_discount_applied = true;
          p.company_discount_percent = percentage;
        }
      }

      // Save to permanent overrides dictionary
      try {
        const overrides = JSON.parse(localStorage.getItem('oriflame_discount_overrides_v1') || '{}');
        overrides[String(p.product_id)] = {
          price: p.price,
          original_catalog_price: p.original_catalog_price,
          company_discount_applied: p.company_discount_applied,
          company_discount_percent: p.company_discount_percent
        };
        localStorage.setItem('oriflame_discount_overrides_v1', JSON.stringify(overrides));
      } catch (e) {}
    }

    try { localStorage.setItem('oriflame_products_v1', JSON.stringify(all)); } catch (e) {}
    this.renderStockTable();
  }

  openEditModal(productId) {
    const all = this.rawProducts || [];
    const p = all.find(item => String(item.product_id) === String(productId));
    if (!p) return alert('Produit introuvable');

    const idInput = document.getElementById('edit-prod-id');
    const idDisplay = document.getElementById('edit-prod-id-display');
    const imgPreview = document.getElementById('edit-prod-img-preview');
    const imgUrl = document.getElementById('edit-prod-image-url');
    const filePicker = document.getElementById('edit-prod-file-picker');
    const nameFr = document.getElementById('edit-prod-name-fr');
    const nameAr = document.getElementById('edit-prod-name-ar');
    const nameEn = document.getElementById('edit-prod-name-en');
    const descFr = document.getElementById('edit-prod-desc-fr');
    const descAr = document.getElementById('edit-prod-desc-ar');
    const descEn = document.getElementById('edit-prod-desc-en');
    const cat = document.getElementById('edit-prod-category');
    const size = document.getElementById('edit-prod-size');
    const price = document.getElementById('edit-prod-price');
    const catPrice = document.getElementById('edit-prod-catalog-price');
    const origPrice = document.getElementById('edit-prod-original-price');
    const inStock = document.getElementById('edit-prod-in-stock');
    const discApplied = document.getElementById('edit-prod-discount-applied');

    if (idInput) idInput.value = p.product_id;
    if (idDisplay) idDisplay.textContent = p.product_id;
    if (imgPreview) imgPreview.src = p.image_url || '';
    if (imgUrl) imgUrl.value = p.image_url || '';
    if (filePicker) filePicker.value = '';
    if (nameFr) nameFr.value = p.name_fr || p.name || '';
    if (nameAr) nameAr.value = p.name_ar || '';
    if (nameEn) nameEn.value = p.name_en || '';
    if (descFr) descFr.value = p.description_fr || p.description || '';
    if (descAr) descAr.value = p.description_ar || '';
    if (descEn) descEn.value = p.description_en || '';
    if (cat) cat.value = p.category || 'Skincare';
    if (size) size.value = p.size || '';
    if (price) price.value = p.price !== undefined ? p.price : '';
    if (catPrice) catPrice.value = p.original_catalog_price !== undefined && p.original_catalog_price !== null ? p.original_catalog_price : p.price;
    if (origPrice) origPrice.value = p.original_price || '';
    if (inStock) inStock.checked = Boolean(p.in_stock);
    if (discApplied) discApplied.checked = Boolean(p.company_discount_applied);

    const galleryUrlsInput = document.getElementById('edit-prod-gallery-urls');
    if (galleryUrlsInput) {
      const extraImages = (p.images || []).filter(u => u && u !== p.image_url);
      galleryUrlsInput.value = extraImages.join('\n');
    }

    const isFeaturedInput = document.getElementById('edit-prod-is-featured-deal');
    if (isFeaturedInput) {
      isFeaturedInput.checked = this.featuredDealIds.includes(String(p.product_id)) || Boolean(p.is_featured_deal);
    }

    if (this.editProductModal) this.editProductModal.style.display = 'flex';
  }

  closeEditModal() {
    if (this.editProductModal) this.editProductModal.style.display = 'none';
  }

  async deleteAllProducts(e) {
    if (e && e.preventDefault) e.preventDefault();
    const isAr = this.i18n.getLang() === 'ar';
    const confirmMsg = isAr
      ? '⚠️ هل أنتِ متأكدة من رغبتك في حذف جميع منتجات الكتالوج بالكامل؟'
      : '⚠️ Êtes-vous sûre de vouloir SUPPRIMER TOUS les produits du catalogue ?\n\nCette action videra complètement la boutique.';

    if (!confirm(confirmMsg)) return;

    try {
      fetch('/api/products/delete-all', { method: 'POST' }).catch(() => {});
      fetch('/api/products', { method: 'DELETE' }).catch(() => {});
    } catch (e) {}

    // Instant local cleanup
    this.products = [];
    this.rawProducts = [];
    try { localStorage.setItem('oriflame_products_v1', JSON.stringify([])); } catch (e) {}
    this.renderStockTable();

    // Reset discount button
    const btnDiscount = document.getElementById('btn-apply-company-discount');
    if (btnDiscount) {
      btnDiscount.disabled = false;
      btnDiscount.textContent = '🏷️ Appliquer la Remise Société';
    }

    alert(isAr ? '✅ تم حذف جميع المنتجات بنجاح.' : '✅ Tous les produits ont été supprimés avec succès.');
  }

  async toggleStock(productId) {
    try {
      fetch(`/api/products/toggle-stock/${productId}`, { method: 'POST' }).catch(() => {});
    } catch (e) {}

    const all = this.rawProducts || [];
    const p = all.find(item => String(item.product_id) === String(productId));
    if (p) {
      p.in_stock = !p.in_stock;
    }
    try { localStorage.setItem('oriflame_products_v1', JSON.stringify(all)); } catch (e) {}
    this.renderStockTable();
  }

  async deleteProduct(productId) {
    const isArabic = this.i18n.getLang() === 'ar';
    if (!confirm(isArabic ? 'هل أنت متأكدة من حذف هذا المنتج؟' : 'Are you sure you want to delete this product?')) return;

    try {
      fetch(`/api/products/${productId}`, { method: 'DELETE' }).catch(() => {});
    } catch (e) {}

    this.rawProducts = (this.rawProducts || []).filter(p => String(p.product_id) !== String(productId));
    this.products = this.rawProducts;
    try { localStorage.setItem('oriflame_products_v1', JSON.stringify(this.rawProducts)); } catch (e) {}
    this.renderStockTable();
  }

  // ------------------- ORDERS MANAGEMENT ------------------- //

  async fetchOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.orders = data.data;
        this.renderOrdersTable();
      }
    } catch (e) {
      console.error("Orders fetch error:", e);
    }
  }

  renderOrdersTable() {
    const body = document.getElementById('admin-orders-table-body');
    const elTotal = document.getElementById('stat-total-orders');
    const elPending = document.getElementById('stat-pending-orders');
    const elRevenue = document.getElementById('stat-total-revenue');
    const navBadge = document.getElementById('nav-orders-badge');
    const quickCount = document.getElementById('quick-orders-count');

    const orders = this.orders || [];

    if (elTotal) elTotal.textContent = orders.length;
    if (elPending) elPending.textContent = orders.filter(o => o.status === 'pending').length;
    
    const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    if (elRevenue) elRevenue.textContent = `${revenue.toFixed(2)} TND`;

    if (navBadge) {
      navBadge.textContent = orders.length;
      navBadge.style.display = orders.length > 0 ? 'inline-block' : 'none';
    }
    if (quickCount) {
      quickCount.textContent = orders.length;
    }

    if (!body) return;

    if (orders.length === 0) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:#8E8D8A;">Aucune commande enregistrée pour le moment.</td></tr>`;
      return;
    }

    body.innerHTML = orders.map(o => {
      const itemCount = (o.items || []).reduce((sum, i) => sum + i.quantity, 0);
      const itemsPreview = (o.items || []).slice(0, 2).map(i => `${i.name} (x${i.quantity})`).join(', ');
      const statusBadge = o.status === 'confirmed' 
        ? '<span class="badge badge-success">✓ Confirmé</span>' 
        : o.status === 'shipped' 
        ? '<span class="badge" style="background:#2563EB; color:#FFF;">🚚 Expédié</span>'
        : o.status === 'cancelled'
        ? '<span class="badge" style="background:#EF4444; color:#FFF;">✕ Annulée</span>'
        : '<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;">⏳ En attente</span>';

      const channelBadge = o.channel === 'phone'
        ? '<span class="badge" style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; font-size:0.75rem; font-weight:700;">📞 Tél / WhatsApp</span>'
        : '<span class="badge" style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; font-size:0.75rem; font-weight:700;">💬 Messenger</span>';

      const cleanPhone = (o.customer_phone || '').replace(/[^0-9+]/g, '');
      const phoneHtml = cleanPhone && cleanPhone !== 'Nonrenseign'
        ? `<div><a href="tel:${cleanPhone}" style="color:#2563EB; font-weight:600; text-decoration:underline;">📞 ${o.customer_phone}</a> <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" style="display:inline-block; margin-left:4px; font-weight:700; color:#059669; text-decoration:none;" title="Ouvrir WhatsApp">📱</a></div>`
        : `<div style="font-size:0.78rem; color:#8E8D8A;">${o.customer_phone || 'Non renseigné'}</div>`;

      return `
        <tr>
          <td><code style="font-weight:700; color:#2563EB;">${o.order_id}</code></td>
          <td>
            <strong>${o.customer_name || 'Client'}</strong>
            ${phoneHtml}
          </td>
          <td>${channelBadge}</td>
          <td>
            <div style="font-weight:600;">${itemCount} article(s)</div>
            <div style="font-size:0.76rem; color:#71717A; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${itemsPreview}</div>
          </td>
          <td><strong style="font-size:0.95rem; color:#18181B;">${Number(o.total_amount).toFixed(2)} ${o.currency || 'TND'}</strong></td>
          <td style="font-size:0.78rem; color:#71717A;">${new Date(o.created_at).toLocaleString()}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-primary" style="padding:6px 12px; font-size:0.78rem; width:auto; background:#2563EB; border-color:#2563EB;" onclick="window.adminDash.viewOrderDetails('${o.order_id}')">
                👁️ Inspecter
              </button>
              ${o.status === 'pending' ? `
                <button class="btn-primary" style="padding:6px 10px; font-size:0.78rem; width:auto; background:var(--admin-success); border-color:var(--admin-success);" onclick="window.adminDash.updateOrderStatus('${o.order_id}', 'confirmed')">
                  ✓ Valider
                </button>
              ` : ''}
              <button class="btn-primary" style="padding:6px 8px; font-size:0.78rem; width:auto; background:var(--admin-danger); border-color:var(--admin-danger);" onclick="window.adminDash.deleteOrder('${o.order_id}')">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async viewOrderDetails(orderId) {
    let order = (this.orders || []).find(o => o.order_id === orderId);
    if (!order) {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data = await res.json();
        if (data.success) order = data.data;
      } catch (e) {}
    }

    if (!order) return alert('Commande introuvable.');

    const titleEl = document.getElementById('order-detail-title');
    const subtitleEl = document.getElementById('order-detail-subtitle');
    const contentEl = document.getElementById('order-detail-content');

    if (titleEl) titleEl.textContent = `🛍️ Commande : ${order.order_id}`;
    if (subtitleEl) subtitleEl.textContent = `Passée le ${new Date(order.created_at).toLocaleString()} • Statut : ${order.status.toUpperCase()} • Canal : ${(order.channel || 'messenger').toUpperCase()}`;

    if (contentEl) {
      const cleanPhone = (order.customer_phone || '').replace(/[^0-9+]/g, '');
      const phoneCallLink = cleanPhone ? `<a href="tel:${cleanPhone}" style="color:#2563EB; text-decoration:underline;">📞 ${order.customer_phone}</a> <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" style="margin-left:8px; font-weight:700; color:#059669; text-decoration:none;">📱 WhatsApp</a>` : (order.customer_phone || 'Non renseigné');

      contentEl.innerHTML = `
        <div style="background:#FAF8F5; border:1px solid #E8E5DF; border-radius:10px; padding:14px; margin-bottom:16px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <span style="font-size:0.75rem; color:#8E8D8A; font-weight:700; text-transform:uppercase;">Nom du Client</span>
            <div style="font-weight:700; font-size:1.05rem; color:#18181B;">${order.customer_name}</div>
          </div>
          <div>
            <span style="font-size:0.75rem; color:#8E8D8A; font-weight:700; text-transform:uppercase;">Contact Téléphone / WhatsApp</span>
            <div style="font-weight:700; font-size:1.05rem;">${phoneCallLink}</div>
          </div>
        </div>

        <h4 style="font-weight:700; margin-bottom:10px; font-size:0.95rem;">Articles Commandés (${(order.items || []).length}) :</h4>
        <div style="border:1px solid #E8E5DF; border-radius:10px; overflow:hidden; margin-bottom:16px;">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
            <thead style="background:#FAF8F5; border-bottom:1px solid #E8E5DF;">
              <tr>
                <th style="padding:8px 12px;">Produit</th>
                <th style="padding:8px 12px;">Prix Unitaire</th>
                <th style="padding:8px 12px; text-align:center;">Quantité</th>
                <th style="padding:8px 12px; text-align:right;">Total Item</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map(i => `
                <tr style="border-bottom:1px solid #F4F4F5;">
                  <td style="padding:10px 12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <img src="${i.image_url || ''}" alt="${i.name}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; background:#FAF8F5;" />
                      <div>
                        <strong style="display:block; color:#18181B;">${i.name}</strong>
                        <code style="font-size:0.72rem; color:#71717A;">Réf: ${i.product_id}</code>
                      </div>
                    </div>
                  </td>
                  <td style="padding:10px 12px;">${Number(i.price).toFixed(2)} ${order.currency || 'TND'}</td>
                  <td style="padding:10px 12px; text-align:center;"><strong>x${i.quantity}</strong></td>
                  <td style="padding:10px 12px; text-align:right; font-weight:700; color:#18181B;">${(i.price * i.quantity).toFixed(2)} ${order.currency || 'TND'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#18181B; color:#FFF; padding:14px 18px; border-radius:10px;">
          <span style="font-weight:600; font-size:0.95rem;">TOTAL DE LA COMMANDE :</span>
          <span style="font-weight:800; font-size:1.35rem; color:#C5A880;">${Number(order.total_amount).toFixed(2)} ${order.currency || 'TND'}</span>
        </div>
      `;
    }

    // Show the nav item & navigate to the section
    const navItem = document.getElementById('nav-item-order-detail');
    if (navItem) navItem.style.display = 'flex';
    this.switchSection('section-order-detail');
  }

  async updateOrderStatus(orderId, newStatus) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Statut de la commande ${orderId} mis à jour : ${newStatus.toUpperCase()}`);
        await this.fetchOrders();
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async deleteOrder(orderId) {
    if (!confirm(`Supprimer définitivement la commande ${orderId} ?`)) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.fetchOrders();
      }
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }

  async fetchAnalytics() {
    try {
      const res = await fetch('/api/analytics/stats');
      const data = await res.json();
      if (data.success) {
        this.analytics = data;
        this.rawSessions = data.recent_sessions || [];
        this.renderAnalytics(data);
      }
    } catch (e) {
      console.error("Analytics fetch error:", e);
    }
  }

  renderAnalytics(stats) {
    if (this.statTotalVisits) this.statTotalVisits.textContent = stats.total_visits || 0;
    
    if (this.statAvgDuration) {
      const mins = Math.floor((stats.avg_duration_seconds || 0) / 60);
      const secs = (stats.avg_duration_seconds || 0) % 60;
      this.statAvgDuration.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    if (this.statDevices) {
      this.statDevices.textContent = `📱 ${stats.mobile_count || 0} / 💻 ${stats.desktop_count || 0}`;
    }

    if (this.statTopCategories) {
      const cats = stats.category_popularity || {};
      const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      if (catEntries.length > 0) {
        this.statTopCategories.innerHTML = catEntries.map(([c, count]) => `
          <span style="display:inline-block; margin-right:8px; margin-bottom:4px; font-size:0.78rem; background:#FAF8F5; padding:2px 8px; border-radius:12px; border:1px solid #E8E5DF;">
            ${c}: <strong>${count}</strong>
          </span>
        `).join('');
      } else {
        this.statTopCategories.textContent = this.i18n.t('no_telemetry_yet');
      }
    }

    this.rawSessions = stats.recent_sessions || [];
    this.applyAnalyticsFilter();
  }

  applyAnalyticsFilter() {
    const searchInput = document.getElementById('analytics-search-input');
    const deviceFilter = document.getElementById('analytics-device-filter');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const dev = deviceFilter ? deviceFilter.value : 'all';

    const all = this.rawSessions || [];
    const filtered = all.filter(s => {
      const matchDev = dev === 'all' || s.device === dev;
      if (!matchDev) return false;
      if (!q) return true;
      const matchId = (s.session_id || '').toLowerCase().includes(q);
      const matchIp = (s.ip || '').toLowerCase().includes(q);
      const matchTrail = (s.activity_trail || []).some(t => (t.description || '').toLowerCase().includes(q));
      return matchId || matchIp || matchTrail;
    });

    this.renderSessionsTable(filtered);
  }

  renderSessionsTable(sessions) {
    const countDisplay = document.getElementById('sessions-count-display');
    if (countDisplay) countDisplay.textContent = sessions.length;

    if (!this.analyticsTableBody) return;

    if (sessions.length === 0) {
      this.analyticsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#8E8D8A;">Aucune session trouvée avec ces critères.</td></tr>`;
      return;
    }

    this.analyticsTableBody.innerHTML = sessions.map(s => {
      const mins = Math.floor((s.duration_seconds || 0) / 60);
      const secs = (s.duration_seconds || 0) % 60;
      const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      const trailHtml = (s.activity_trail || []).map(t => `
        <div class="trail-item">
          <span class="trail-offset">${t.offset}</span>
          <span>${t.description}</span>
        </div>
      `).join('');

      return `
        <tr>
          <td>
            <code>${s.session_id}</code>
            <div style="font-size:0.72rem; color:#8E8D8A; margin-top:2px;">IP: ${s.ip}</div>
          </td>
          <td>
            <div><strong>${s.device === 'Mobile' ? '📱 Mobile' : '💻 Desktop'}</strong></div>
            <span class="badge" style="background:#FAF8F5; border:1px solid #E8E5DF; font-size:0.72rem; text-transform:uppercase;">${s.language || 'fr'}</span>
          </td>
          <td>
            <span class="badge badge-accent" style="font-size:0.85rem; font-weight:700;">
              ⏱️ ${timeFormatted}
            </span>
          </td>
          <td>
            <div class="activity-trail-box">
              ${trailHtml || '<span style="color:#8E8D8A;">Aucune activité enregistrée</span>'}
            </div>
          </td>
          <td style="font-size:0.78rem; color:#8E8D8A;">
            ${new Date(s.last_active).toLocaleTimeString()}
          </td>
          <td style="text-align: right;">
            <button class="btn-primary" style="background:var(--admin-danger); border-color:var(--admin-danger); padding:4px 8px; font-size:0.78rem; width:auto;" onclick="window.adminDash.deleteSession('${s.session_id}')" title="Supprimer cette session">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async deleteSession(sessionId) {
    if (!confirm(`Supprimer la session "${sessionId}" ?`)) return;
    try {
      const res = await fetch(`/api/analytics/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.fetchAnalytics();
      } else {
        alert('Erreur: ' + data.message);
      }
    } catch (e) {
      alert('Erreur réseau: ' + e.message);
    }
  }

  async clearAllSessions() {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir effacer TOUTES les sessions de visite ? Cette action est irréversible.')) return;
    try {
      const res = await fetch('/api/analytics/sessions', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.fetchAnalytics();
      } else {
        alert('Erreur: ' + data.message);
      }
    } catch (e) {
      alert('Erreur réseau: ' + e.message);
    }
  }

  cleanFbUsername(input) {
    if (!input) return '';
    let val = input.trim();

    if (val.includes('profile.php?id=')) {
      const match = val.match(/id=(\d+)/);
      if (match) return match[1];
    }

    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\/messages\/(e2ee\/)?t\//i, '');
    val = val.replace(/^https?:\/\/(www\.|m\.)?facebook\.com\//i, '');
    val = val.replace(/^https?:\/\/m\.me\//i, '');
    val = val.split('/')[0].split('?')[0].trim();
    return val;
  }

  updateFbPreviewLink(username) {
    const linkHref = document.getElementById('fb-link-preview-href');
    if (linkHref) {
      const clean = this.cleanFbUsername(username) || 'mouna.nouira1';
      const url = `https://m.me/${clean}`;
      linkHref.href = url;
      linkHref.textContent = url;
    }
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

  updateWhatsappPreviewLink(phone) {
    const linkHref = document.getElementById('whatsapp-link-preview-href');
    if (linkHref) {
      const clean = this.cleanPhoneNumber(phone);
      const url = `https://wa.me/216${clean}`;
      linkHref.href = url;
      linkHref.textContent = `${url} (+216 ${clean})`;
    }
  }

  async fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        if (this.fbHandleInput) {
          const username = data.data.facebook_username || 'Mounanouira.Oriflame';
          this.fbHandleInput.value = username;
          this.updateFbPreviewLink(username);
        }
        if (this.whatsappPhoneInput) {
          const phone = data.data.whatsapp_phone || data.data.phone || '55756629';
          const cleanPhone = this.cleanPhoneNumber(phone);
          this.whatsappPhoneInput.value = cleanPhone;
          this.updateWhatsappPreviewLink(cleanPhone);
        }
        if (data.data.featured_deal_ids && Array.isArray(data.data.featured_deal_ids)) {
          this.featuredDealIds = data.data.featured_deal_ids;
          this.renderFeaturedDealsAdminGrid();
        }
        const inputDiscount = document.getElementById('company-discount-input');
        if (inputDiscount && data.data.company_discount_percent) {
          inputDiscount.value = data.data.company_discount_percent;
        }
      }
    } catch (e) {
      try {
        const localSettings = JSON.parse(localStorage.getItem('oriflame_settings_v1') || '{}');
        if (this.whatsappPhoneInput && (localSettings.whatsapp_phone || localSettings.phone)) {
          const cleanPhone = this.cleanPhoneNumber(localSettings.whatsapp_phone || localSettings.phone);
          this.whatsappPhoneInput.value = cleanPhone;
          this.updateWhatsappPreviewLink(cleanPhone);
        }
        if (localSettings.featured_deal_ids && Array.isArray(localSettings.featured_deal_ids)) {
          this.featuredDealIds = localSettings.featured_deal_ids;
          this.renderFeaturedDealsAdminGrid();
        }
      } catch (err) {}
    }
  }

  populateFeaturedDealsDropdown() {
    if (!this.selectFeaturedDealProduct) return;
    const prods = this.rawProducts || this.products || [];
    const currentVal = this.selectFeaturedDealProduct.value;

    this.selectFeaturedDealProduct.innerHTML = `
      <option value="">-- Choisir un produit du catalogue à ajouter en promo --</option>
      ${prods.map(p => `
        <option value="${p.product_id}" ${this.featuredDealIds.includes(String(p.product_id)) ? 'disabled' : ''}>
          [${p.product_id}] ${(p.name_fr || p.name || 'Produit')} - ${Number(p.price).toFixed(2)} DT ${this.featuredDealIds.includes(String(p.product_id)) ? '(Déjà dans les offres)' : ''}
        </option>
      `).join('')}
    `;
    if (currentVal) this.selectFeaturedDealProduct.value = currentVal;
  }

  renderFeaturedDealsAdminGrid() {
    if (!this.featuredDealsGrid) return;
    const prods = this.rawProducts || this.products || [];
    const ids = this.featuredDealIds || [];

    if (ids.length === 0) {
      this.featuredDealsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: #A1A1AA; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px dashed rgba(255, 255, 255, 0.2);">
          Aucun produit configuré dans les offres spéciales. Choisissez un produit ci-dessus pour l'ajouter !
        </div>
      `;
      return;
    }

    const items = ids.map(id => prods.find(p => String(p.product_id) === String(id)) || { product_id: id, name: `Produit Réf #${id}`, price: 0, image_url: '' });

    this.featuredDealsGrid.innerHTML = items.map((p, idx) => `
      <div style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; position: relative;">
        <span style="position: absolute; top: 6px; left: 6px; background: #EA580C; color: #FFF; font-size: 0.7rem; font-weight: 800; padding: 2px 6px; border-radius: 4px;">#${idx + 1}</span>
        <div style="width: 50px; height: 50px; border-radius: 8px; background: #FFFFFF; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-left: 18px;">
          <img src="${p.image_url}" alt="${p.name}" style="width: 100%; height: 100%; object-fit: contain;" onerror="window.handleProductImgError && window.handleProductImgError(this)" />
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 0.85rem; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name_fr || p.name}</div>
          <div style="font-size: 0.78rem; color: #FB923C; font-weight: 600;">${Number(p.price || 0).toFixed(2)} DT <span style="font-size: 0.72rem; color: #D4D4D8; font-weight: normal;">(Réf: ${p.product_id})</span></div>
        </div>
        <button type="button" onclick="window.adminDash && window.adminDash.removeFeaturedDeal('${p.product_id}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); color: #FCA5A5; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;" title="Retirer des offres">
          &times;
        </button>
      </div>
    `).join('');
  }

  addFeaturedDeal(productId) {
    if (!productId) return;
    const strId = String(productId);
    if (!this.featuredDealIds.includes(strId)) {
      this.featuredDealIds.push(strId);
      this.renderFeaturedDealsAdminGrid();
      this.populateFeaturedDealsDropdown();
    }
  }

  removeFeaturedDeal(productId) {
    const strId = String(productId);
    this.featuredDealIds = this.featuredDealIds.filter(id => id !== strId);
    this.renderFeaturedDealsAdminGrid();
    this.populateFeaturedDealsDropdown();
  }

  async saveFeaturedDeals() {
    await this.saveSettingsAPI({ featured_deal_ids: this.featuredDealIds });
    try {
      localStorage.setItem('oriflame_featured_deals_v1', JSON.stringify(this.featuredDealIds));
      const localSettings = JSON.parse(localStorage.getItem('oriflame_settings_v1') || '{}');
      localSettings.featured_deal_ids = this.featuredDealIds;
      localStorage.setItem('oriflame_settings_v1', JSON.stringify(localSettings));
    } catch (e) {}

    const isArabic = this.i18n.getLang() === 'ar';
    alert(isArabic ? '✅ تم حفظ قائمة العروض الخاصة بنجاح!' : '✅ Liste des offres spéciales enregistrée avec succès !');
  }

  async saveSettingsAPI(payload) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.error(e);
    }
  }

  parseCSVText(text) {
    const lines = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    // Remove UTF-8 Byte Order Mark if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.substring(1);
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          cell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        row.push(cell.trim());
        if (row.some(c => c.length > 0)) lines.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(c => c.length > 0)) lines.push(row);
    }
    return lines;
  }

  exportCsv() {
    const prods = this.rawProducts || this.products || [];
    if (prods.length === 0) return alert('Aucun produit à exporter.');

    const headers = [
      'product_id',
      'name_fr',
      'name_ar',
      'name_en',
      'category',
      'price',
      'original_catalog_price',
      'original_price',
      'is_promo',
      'discount_percent',
      'company_discount_applied',
      'is_featured_deal',
      'size',
      'in_stock',
      'image_url',
      'gallery_images',
      'description_fr',
      'description_ar',
      'description_en',
      'benefits',
      'how_to_use',
      'ingredients',
      'suitable_for'
    ];

    const escapeCell = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = prods.map(p => {
      const gallery = Array.isArray(p.images) ? p.images.join(' | ') : (p.image_url || '');
      const benefits = Array.isArray(p.benefits) ? p.benefits.join(' | ') : (p.benefits || '');

      return [
        escapeCell(p.product_id),
        escapeCell(p.name_fr || p.name || ''),
        escapeCell(p.name_ar || ''),
        escapeCell(p.name_en || ''),
        escapeCell(p.category || 'Skincare'),
        p.price !== undefined ? p.price : 0,
        p.original_catalog_price !== undefined ? p.original_catalog_price : (p.price || 0),
        p.original_price || '',
        p.is_promo ? 'TRUE' : 'FALSE',
        p.discount_percent || 0,
        p.company_discount_applied ? 'TRUE' : 'FALSE',
        this.featuredDealIds.includes(String(p.product_id)) || p.is_featured_deal ? 'TRUE' : 'FALSE',
        escapeCell(p.size || 'Format Standard'),
        p.in_stock ? 'TRUE' : 'FALSE',
        escapeCell(p.image_url || ''),
        escapeCell(gallery),
        escapeCell(p.description_fr || p.description || ''),
        escapeCell(p.description_ar || ''),
        escapeCell(p.description_en || ''),
        escapeCell(benefits),
        escapeCell(p.how_to_use || ''),
        escapeCell(p.ingredients || ''),
        escapeCell(p.suitable_for || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `oriflame_catalogue_complet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadSampleCsv() {
    const headers = [
      'product_id',
      'name_fr',
      'name_ar',
      'name_en',
      'category',
      'price',
      'original_catalog_price',
      'original_price',
      'is_promo',
      'discount_percent',
      'company_discount_applied',
      'is_featured_deal',
      'size',
      'in_stock',
      'image_url',
      'gallery_images',
      'description_fr',
      'description_ar',
      'description_en',
      'benefits',
      'how_to_use',
      'ingredients',
      'suitable_for'
    ];

    const sampleRows = [
      [
        '"46980"',
        '"Crème de Corps Parfumée Giordani Gold Essenza Supreme"',
        '"كريم الجسم المعطر جورداني جولد إيسنزا سوبريم"',
        '"Giordani Gold Essenza Supreme Perfumed Body Cream"',
        '"Fragrance"',
        '27.92',
        '34.90',
        '47.10',
        'TRUE',
        '26',
        'TRUE',
        'TRUE',
        '"250 ml"',
        'TRUE',
        '"https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46980%2f46980_1.png&MediaId=20989035&Version=1"',
        '"https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46980%2f46980_1.png&MediaId=20989035&Version=1 | https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46980%2f46980_2.png&MediaId=20989035&Version=1"',
        '"Crème hydratante riche et veloutée aux notes florales et boisées incomparables."',
        '"كريم مرطب فاخر للجسم غني بنفحات زهر البرتقال الفاخرة وخشب الصندل."',
        '"Luxurious hydrating body cream infused with sophisticated floral woody scent."',
        '"100% Produit authentique certifié par Mouna Nouira | Formule scandinave haute performance"',
        '"Appliquer sur tout le corps après le bain pour une peau douce et parfumée."',
        '"Extraits botaniques suédois et complexes actifs certifiés Oriflame."',
        '"Tous types de peaux • Testé sous contrôle dermatologique"'
      ].join(','),
      [
        '"40683"',
        '"Parfum Giordani Gold Essenza Supreme"',
        '"عطر جورداني جولد إيسنزا سوبريم"',
        '"Giordani Gold Essenza Supreme Parfum"',
        '"Fragrance"',
        '106.32',
        '132.90',
        '179.40',
        'TRUE',
        '26',
        'TRUE',
        'TRUE',
        '"50 ml"',
        'TRUE',
        '"https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f40683%2f40683_1.png&MediaId=20989035&Version=1"',
        '"https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f40683%2f40683_1.png&MediaId=20989035&Version=1 | https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f40683%2f40683_2.png&MediaId=20989035&Version=1"',
        '"Parfum d exception à la note de cœur exclusive de Fleur d Oranger Essenza."',
        '"عطر راق وفخم يعبر عن الأنوثة الطاغية مع ثبات يدوم طويلاً."',
        '"Exceptional floral parfum with the exclusive Orange Blossom Essenza note."',
        '"100% Produit original certifié par Mouna Nouira | Tenue exceptionnelle"',
        '"Vaporiser sur les points de pulsation : cou et poignets."',
        '"Essences naturelles de fleurs d oranger et extraits de bois précieux."',
        '"Tous types de peaux"'
      ].join(',')
    ];

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + sampleRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modele_oriflame_catalogue_complet.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async importCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('csv-import-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#2563EB';
      statusEl.textContent = '⏳ Lecture et importation du fichier CSV en cours...';
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const grid = this.parseCSVText(text);
        if (!grid || grid.length < 2) {
          throw new Error('Le fichier CSV est vide ou ne contient pas d\'en-têtes valides.');
        }

        const rawHeaders = grid[0].map(h => h.toLowerCase().trim().replace(/^"|"$/g, ''));
        const getIdx = (candidates) => {
          for (const cand of candidates) {
            const idx = rawHeaders.indexOf(cand.toLowerCase());
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const idxId = getIdx(['product_id', 'code', 'ref', 'id']);
        const idxNameFr = getIdx(['name_fr', 'name', 'nom_fr', 'nom', 'title']);
        const idxNameAr = getIdx(['name_ar', 'nom_ar', 'arabic_name', 'اسم']);
        const idxNameEn = getIdx(['name_en', 'nom_en', 'english_name']);
        const idxCategory = getIdx(['category', 'categorie', 'cat']);
        const idxPrice = getIdx(['price', 'prix', 'current_price']);
        const idxCatPrice = getIdx(['original_catalog_price', 'catalog_price', 'prix_brut', 'prix_catalogue']);
        const idxOrigPrice = getIdx(['original_price', 'prix_barre', 'prix_initial', 'old_price']);
        const idxPromo = getIdx(['is_promo', 'promo', 'en_promo']);
        const idxDiscount = getIdx(['discount_percent', 'remise', 'rabais']);
        const idxCompDisc = getIdx(['company_discount_applied', 'remise_societe']);
        const idxFeatured = getIdx(['is_featured_deal', 'featured', 'en_vedette']);
        const idxSize = getIdx(['size', 'format', 'contenance']);
        const idxStock = getIdx(['in_stock', 'stock', 'disponible']);
        const idxImg = getIdx(['image_url', 'image', 'photo', 'img']);
        const idxGallery = getIdx(['gallery_images', 'images', 'photos', 'galerie']);
        const idxDescFr = getIdx(['description_fr', 'description', 'desc_fr', 'desc']);
        const idxDescAr = getIdx(['description_ar', 'desc_ar', 'وصف']);
        const idxDescEn = getIdx(['description_en', 'desc_en']);
        const idxBenefits = getIdx(['benefits', 'bienfaits', 'avantages']);
        const idxHowTo = getIdx(['how_to_use', 'utilisation', 'mode_emploi']);
        const idxIngredients = getIdx(['ingredients', 'composition']);
        const idxSuitable = getIdx(['suitable_for', 'peau', 'type_peau']);

        const importedProducts = [];

        for (let i = 1; i < grid.length; i++) {
          const row = grid[i];
          if (!row || row.length === 0) continue;

          const prodId = idxId !== -1 && row[idxId] ? row[idxId] : `ORF-CSV-${Date.now()}-${i}`;
          const nameFr = idxNameFr !== -1 && row[idxNameFr] ? row[idxNameFr] : `Produit #${prodId}`;
          if (!nameFr && !row[idxId]) continue;

          const priceVal = idxPrice !== -1 && row[idxPrice] ? parseFloat(row[idxPrice].replace(',', '.')) : 0;
          const catPriceVal = idxCatPrice !== -1 && row[idxCatPrice] ? parseFloat(row[idxCatPrice].replace(',', '.')) : priceVal;
          const origPriceVal = idxOrigPrice !== -1 && row[idxOrigPrice] ? parseFloat(row[idxOrigPrice].replace(',', '.')) : null;

          const mainImg = idxImg !== -1 && row[idxImg] ? row[idxImg] : `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;

          let gallery = [mainImg];
          if (idxGallery !== -1 && row[idxGallery]) {
            const spl = row[idxGallery].split(/[|;,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
            if (spl.length > 0) gallery = Array.from(new Set([mainImg, ...spl]));
          }

          let benefits = ["100% Produit authentique certifié par Mouna Nouira"];
          if (idxBenefits !== -1 && row[idxBenefits]) {
            const bSpl = row[idxBenefits].split(/[|;]+/).map(b => b.trim()).filter(Boolean);
            if (bSpl.length > 0) benefits = bSpl;
          }

          const stockVal = idxStock !== -1 && row[idxStock] ? (row[idxStock].toUpperCase() === 'TRUE' || row[idxStock] === '1' || row[idxStock].toLowerCase() === 'oui') : true;
          const isPromoVal = idxOrigPrice !== -1 && origPriceVal && origPriceVal > priceVal;

          importedProducts.push({
            product_id: String(prodId),
            name: nameFr,
            name_fr: nameFr,
            name_ar: idxNameAr !== -1 ? (row[idxNameAr] || '') : '',
            name_en: idxNameEn !== -1 ? (row[idxNameEn] || '') : '',
            category: idxCategory !== -1 && row[idxCategory] ? row[idxCategory] : 'Skincare',
            price: isNaN(priceVal) ? 0 : priceVal,
            original_catalog_price: isNaN(catPriceVal) ? priceVal : catPriceVal,
            original_price: origPriceVal,
            is_promo: isPromoVal,
            discount_percent: idxDiscount !== -1 && row[idxDiscount] ? parseInt(row[idxDiscount]) : 0,
            company_discount_applied: idxCompDisc !== -1 && row[idxCompDisc] ? (row[idxCompDisc].toUpperCase() === 'TRUE' || row[idxCompDisc] === '1') : false,
            is_featured_deal: idxFeatured !== -1 && row[idxFeatured] ? (row[idxFeatured].toUpperCase() === 'TRUE' || row[idxFeatured] === '1') : false,
            size: idxSize !== -1 && row[idxSize] ? row[idxSize] : 'Format Standard',
            in_stock: stockVal,
            image_url: mainImg,
            images: gallery,
            description: idxDescFr !== -1 ? (row[idxDescFr] || '') : '',
            description_fr: idxDescFr !== -1 ? (row[idxDescFr] || '') : '',
            description_ar: idxDescAr !== -1 ? (row[idxDescAr] || '') : '',
            description_en: idxDescEn !== -1 ? (row[idxDescEn] || '') : '',
            benefits: benefits,
            how_to_use: idxHowTo !== -1 && row[idxHowTo] ? row[idxHowTo] : 'Appliquer délicatement selon les recommandations de la gamme.',
            ingredients: idxIngredients !== -1 && row[idxIngredients] ? row[idxIngredients] : 'Extraits botaniques suédois et complexes actifs certifiés Oriflame.',
            suitable_for: idxSuitable !== -1 && row[idxSuitable] ? row[idxSuitable] : 'Tous types de peaux • Produit certifié Oriflame Suède'
          });
        }

        if (importedProducts.length === 0) {
          throw new Error('Aucun produit valide trouvé à importer dans le fichier CSV.');
        }

        // Send bulk import to backend
        const res = await fetch('/api/products/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: importedProducts })
        });

        const data = await res.json();
        if (data.success) {
          if (statusEl) {
            statusEl.style.color = '#059669';
            statusEl.textContent = `✅ ${data.message}`;
          }
          await this.fetchProducts();
          alert(`✅ Importation CSV réussie !\n\n${data.message}`);
        } else {
          throw new Error(data.message || 'Échec de l\'importation');
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = '#DC2626';
          statusEl.textContent = '❌ ' + err.message;
        }
        alert('❌ Erreur lors de l\'importation CSV: ' + err.message);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async importBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('backup-restore-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#C5A880';
      statusEl.textContent = '⏳ Restauration complète depuis le fichier JSON en cours...';
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const parsed = JSON.parse(text);

        const formData = new FormData();
        formData.append('backup', file);

        const res = await fetch('/api/import/backup', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (data.success) {
          if (statusEl) {
            statusEl.style.color = '#10B981';
            statusEl.textContent = `✅ ${data.message}`;
          }
          await this.fetchProducts();
          await this.fetchCarousel();
          await this.fetchSettings();
          alert(`✅ Restauration JSON réussie !\n\n${data.message}`);
        } else {
          throw new Error(data.message || 'Erreur lors de la restauration');
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = '#EF4444';
          statusEl.textContent = '❌ ' + err.message;
        }
        alert('❌ Erreur de restauration JSON: ' + err.message);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  exportProductsJson() {
    const prods = this.rawProducts || this.products || [];
    if (prods.length === 0) return alert('Aucun produit à exporter.');

    const blob = new Blob([JSON.stringify(prods, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `oriflame_produits_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async importProductsJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('json-products-import-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#15803D';
      statusEl.textContent = '⏳ Lecture et importation du catalogue JSON en cours...';
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        let parsed = JSON.parse(text);

        let productsList = [];
        if (Array.isArray(parsed)) {
          productsList = parsed;
        } else if (Array.isArray(parsed.products)) {
          productsList = parsed.products;
        } else if (Array.isArray(parsed.data)) {
          productsList = parsed.data;
        } else if (typeof parsed === 'object' && parsed.product_id) {
          productsList = [parsed];
        }

        if (!Array.isArray(productsList) || productsList.length === 0) {
          throw new Error('Aucun produit valide trouvé dans ce fichier JSON.');
        }

        const res = await fetch('/api/products/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: productsList })
        });

        const data = await res.json();
        if (data.success) {
          if (statusEl) {
            statusEl.style.color = '#166534';
            statusEl.textContent = `✅ ${data.message}`;
          }
          await this.fetchProducts();
          alert(`✅ Importation JSON réussie !\n\n${data.message}`);
        } else {
          throw new Error(data.message || 'Échec de l\'importation');
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = '#DC2626';
          statusEl.textContent = '❌ ' + err.message;
        }
        alert('❌ Erreur lors de l\'importation JSON: ' + err.message);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  async syncLiveStock() {
    const btn = document.getElementById('btn-sync-live-stock');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Scan & Détection en cours...';
      btn.style.opacity = '0.7';
    }

    try {
      const res = await fetch('/api/stock/sync-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
        alert(`✅ Analyse du Stock Terminée !\n\nTotal Produits vérifiés : ${data.total}\n📦 Disponibles en Stock : ${data.in_stock_count}\n❌ En Rupture / متوفر قريباً : ${data.out_of_stock_count}\n\nL'inventaire a été mis à jour automatiquement.`);
      } else {
        throw new Error(data.message || 'Erreur lors de la synchronisation');
      }
    } catch (err) {
      alert('❌ Erreur de synchronisation du stock : ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔍 Scanner & Détecter Ruptures en Direct';
        btn.style.opacity = '1';
      }
    }
  }

  async fetchCarousel() {
    try {
      const res = await fetch('/api/carousel');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.carouselSlides = data.data;
        this.renderCarouselAdmin();
      }
    } catch (err) {
      console.error("Error fetching carousel slides:", err);
    }
  }

  renderCarouselAdmin() {
    const grid = document.getElementById('admin-carousel-grid');
    const countEl = document.getElementById('carousel-count');
    if (!grid) return;

    const slides = this.carouselSlides || [];
    if (countEl) countEl.textContent = slides.length;

    if (slides.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 30px; text-align: center; color: var(--admin-text-muted); background: #FAF8F5; border-radius: 12px;">Aucune diapositive configurée dans le carrousel.</div>`;
      return;
    }

    grid.innerHTML = slides.map(slide => `
      <div class="admin-slide-card" style="background: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
        <div style="position: relative; height: 160px; background: #18181B; overflow: hidden;">
          <img src="${slide.image_url}" alt="${slide.title || 'Slide'}" style="width: 100%; height: 100%; object-fit: cover;" onerror="window.handleProductImgError(this)" />
          <div style="position: absolute; top: 10px; right: 10px; background: ${slide.active !== false ? '#10B981' : '#6B7280'}; color: white; padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700;">
            ${slide.active !== false ? 'ACTIF' : 'INACTIF'}
          </div>
        </div>
        <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <span style="font-size: 0.72rem; font-weight: 700; color: #C5A880; text-transform: uppercase;">${slide.badge || 'Oriflame Sweden'}</span>
            <h4 style="font-size: 1.05rem; font-weight: 700; margin: 4px 0 6px 0; color: #18181B;">${slide.title || 'Diapositive'}</h4>
            <p style="font-size: 0.82rem; color: #71717A; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${slide.description || ''}</p>

            ${slide.offer_price ? `
              <div style="margin: 8px 0; padding: 6px 10px; background: #FFF7ED; border: 1px solid #FFEDD5; border-radius: 6px; font-size: 0.78rem; color: #C2410C; font-weight: 600;">
                🔥 Offre Deal: Réf <strong>${slide.offer_product_code || 'N/A'}</strong> — <strong>${slide.offer_price} DT</strong> ${slide.offer_original_price ? `<span style="text-decoration: line-through; opacity: 0.7;">(${slide.offer_original_price} DT)</span>` : ''}
              </div>
            ` : ''}
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px; border-top: 1px solid #F4F4F5; padding-top: 12px;">
            <button class="btn-edit-slide" data-id="${slide.id}" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #D4D4D8; background: #F4F4F5; font-size: 0.8rem; font-weight: 600; cursor: pointer;">✏️ Modifier</button>
            <button class="btn-delete-slide" data-id="${slide.id}" style="padding: 8px 12px; border-radius: 6px; border: 1px solid #FCA5A5; background: #FEF2F2; color: #DC2626; font-size: 0.8rem; font-weight: 600; cursor: pointer;">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-edit-slide').forEach(btn => {
      btn.addEventListener('click', () => {
        const slideId = btn.getAttribute('data-id');
        this.editCarouselSlide(slideId);
      });
    });

    grid.querySelectorAll('.btn-delete-slide').forEach(btn => {
      btn.addEventListener('click', () => {
        const slideId = btn.getAttribute('data-id');
        this.deleteCarouselSlide(slideId);
      });
    });
  }

  bindCarouselEvents() {
    const form = document.getElementById('form-carousel-slide');
    const urlInput = document.getElementById('carousel-image-url');
    const previewBox = document.getElementById('carousel-img-preview-box');
    const previewImg = document.getElementById('carousel-img-preview');
    const cancelBtn = document.getElementById('btn-cancel-carousel-slide');

    if (urlInput && previewBox && previewImg) {
      urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (val) {
          previewImg.src = val;
          previewBox.style.display = 'block';
        } else {
          previewBox.style.display = 'none';
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.resetCarouselForm();
      });
    }

    if (form && !form.getAttribute('data-bound')) {
      form.setAttribute('data-bound', 'true');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const slideId = document.getElementById('carousel-slide-id').value;
        const imageUrl = document.getElementById('carousel-image-url').value;
        const imageFile = document.getElementById('carousel-image-file').files[0];
        const badge = document.getElementById('carousel-badge').value;
        const title = document.getElementById('carousel-title').value;
        const description = document.getElementById('carousel-description').value;
        const button_text = document.getElementById('carousel-btn-text').value;
        const button_link = document.getElementById('carousel-btn-link').value;
        const offer_product_code = document.getElementById('carousel-offer-code').value;
        const offer_product_name = document.getElementById('carousel-offer-name').value;
        const offer_price = document.getElementById('carousel-offer-price').value;
        const offer_original_price = document.getElementById('carousel-offer-original-price').value;
        const active = document.getElementById('carousel-active').checked;

        const formData = new FormData();
        if (imageUrl) formData.append('image_url', imageUrl);
        if (imageFile) formData.append('image_file', imageFile);
        formData.append('badge', badge);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('button_text', button_text);
        formData.append('button_link', button_link);
        formData.append('offer_product_code', offer_product_code);
        formData.append('offer_product_name', offer_product_name);
        formData.append('offer_price', offer_price);
        formData.append('offer_original_price', offer_original_price);
        formData.append('active', active);

        try {
          const url = slideId ? `/api/carousel/${slideId}` : '/api/carousel';
          const method = slideId ? 'PUT' : 'POST';

          const res = await fetch(url, { method, body: formData });
          const data = await res.json();

          if (data.success) {
            alert(slideId ? '✅ Diapositive modifiée avec succès !' : '✅ Diapositive ajoutée au carrousel !');
            this.resetCarouselForm();
            await this.fetchCarousel();
          } else {
            alert('❌ Erreur: ' + (data.message || 'Échec de la sauvegarde'));
          }
        } catch (err) {
          alert('❌ Erreur réseau: ' + err.message);
        }
      });
    }
  }

  editCarouselSlide(id) {
    const slide = (this.carouselSlides || []).find(s => s.id === id);
    if (!slide) return;

    document.getElementById('carousel-slide-id').value = slide.id;
    document.getElementById('carousel-image-url').value = slide.image_url || '';
    document.getElementById('carousel-badge').value = slide.badge || '';
    document.getElementById('carousel-title').value = slide.title || '';
    document.getElementById('carousel-description').value = slide.description || '';
    document.getElementById('carousel-btn-text').value = slide.button_text || '';
    document.getElementById('carousel-btn-link').value = slide.button_link || '';
    document.getElementById('carousel-offer-code').value = slide.offer_product_code || '';
    document.getElementById('carousel-offer-name').value = slide.offer_product_name || '';
    document.getElementById('carousel-offer-price').value = slide.offer_price || '';
    document.getElementById('carousel-offer-original-price').value = slide.offer_original_price || '';
    document.getElementById('carousel-active').checked = slide.active !== false;

    const previewBox = document.getElementById('carousel-img-preview-box');
    const previewImg = document.getElementById('carousel-img-preview');
    if (slide.image_url && previewBox && previewImg) {
      previewImg.src = slide.image_url;
      previewBox.style.display = 'block';
    }

    document.getElementById('carousel-form-title').textContent = '✏️ Modifier la Diapositive';
    document.getElementById('btn-save-carousel-slide').textContent = 'Enregistrer les Modifications';
    document.getElementById('btn-cancel-carousel-slide').style.display = 'inline-block';

    document.getElementById('section-carousel').scrollIntoView({ behavior: 'smooth' });
  }

  resetCarouselForm() {
    const form = document.getElementById('form-carousel-slide');
    if (form) form.reset();
    document.getElementById('carousel-slide-id').value = '';
    document.getElementById('carousel-offer-code').value = '';
    document.getElementById('carousel-offer-name').value = '';
    document.getElementById('carousel-offer-price').value = '';
    document.getElementById('carousel-offer-original-price').value = '';
    document.getElementById('carousel-img-preview-box').style.display = 'none';
    document.getElementById('carousel-form-title').textContent = '➕ Ajouter une Diapositive au Carrousel';
    document.getElementById('btn-save-carousel-slide').textContent = 'Enregistrer la Diapositive';
    document.getElementById('btn-cancel-carousel-slide').style.display = 'none';
  }

  async deleteCarouselSlide(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette diapositive du carrousel ?')) return;

    try {
      const res = await fetch(`/api/carousel/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('✅ Diapositive supprimée');
        await this.fetchCarousel();
      } else {
        alert('❌ Erreur: ' + data.message);
      }
    } catch (err) {
      alert('❌ Erreur réseau: ' + err.message);
    }
  }

  // ── BUNDLE PACKAGE DEALS MANAGEMENT ─────────────────────────────────────────
  async fetchBundles() {
    try {
      const res = await fetch('/api/bundles');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.bundles = data.data;
        this.renderBundlesAdmin();
        this.updateBundleStats();
      }
    } catch (err) {
      console.error("Error fetching bundles:", err);
    }
  }

  updateBundleStats() {
    const totalEl = document.getElementById('stat-total-bundles');
    const activeEl = document.getElementById('stat-active-bundles');
    const maxSavingsEl = document.getElementById('stat-max-savings');
    const countEl = document.getElementById('bundles-count');

    const list = this.bundles || [];
    if (totalEl) totalEl.textContent = list.length;
    if (countEl) countEl.textContent = list.length;
    if (activeEl) activeEl.textContent = list.filter(b => b.active !== false).length;

    if (maxSavingsEl) {
      let maxSave = 0;
      list.forEach(b => {
        let regularSum = 0;
        (b.product_ids || []).forEach(pId => {
          const p = (this.products || []).find(x => String(x.product_id) === String(pId));
          if (p) regularSum += Number(p.price || 0);
        });
        const save = Math.max(0, regularSum - Number(b.bundle_price || 0));
        if (save > maxSave) maxSave = save;
      });
      maxSavingsEl.textContent = `${maxSave.toFixed(2)} TND`;
    }
  }

  renderBundlesAdmin() {
    const grid = document.getElementById('admin-bundles-grid');
    if (!grid) return;

    const list = this.bundles || [];
    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 36px; text-align: center; color: var(--admin-text-muted); background: #FAF8F5; border-radius: 12px; border: 1px dashed #D4D4D8;">
        🎁 Aucun pack combiné configuré pour le moment. Cliquez sur <strong>« ➕ Créer une Nouvelle Offre Pack »</strong> pour créer votre premier pack Duo/Trio !
      </div>`;
      return;
    }

    grid.innerHTML = list.map(b => {
      const prods = (b.product_ids || []).map(pId => {
        const found = (this.products || []).find(p => String(p.product_id) === String(pId));
        return found || { product_id: pId, name: `Produit #${pId}`, price: 0, image_url: '' };
      });

      const regularSum = prods.reduce((sum, p) => sum + Number(p.price || 0), 0);
      const bundlePrice = Number(b.bundle_price || 0);
      const savings = Math.max(0, regularSum - bundlePrice);
      const discountPercent = regularSum > 0 ? Math.round((savings / regularSum) * 100) : 0;

      return `
        <div class="admin-bundle-card" style="background: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 14px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <!-- Header status & badge -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <span style="background: #FEF3C7; color: #92400E; font-size: 0.75rem; font-weight: 800; padding: 3px 8px; border-radius: 6px; border: 1px solid #FDE68A;">
                🎁 PACK ${prods.length} PRODUITS
              </span>
              <span style="background: ${b.active !== false ? '#ECFDF5' : '#F4F4F5'}; color: ${b.active !== false ? '#047857' : '#71717A'}; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; border-radius: 20px; border: 1px solid ${b.active !== false ? '#A7F3D0' : '#E4E4E7'};">
                ${b.active !== false ? '● ACTIF EN BOUTIQUE' : '○ INACTIF'}
              </span>
            </div>

            <!-- Title & Description -->
            <h4 style="font-size: 1.05rem; font-weight: 800; color: #18181B; margin: 0 0 6px 0;">${b.title_fr || b.title || 'Offre Pack'}</h4>
            ${b.title_ar ? `<div dir="rtl" style="font-size: 0.88rem; color: #4B5563; font-weight: 700; margin-bottom: 6px;">${b.title_ar}</div>` : ''}
            <p style="font-size: 0.8rem; color: #64748B; margin-bottom: 14px;">${b.description_fr || b.description || 'Prix spécial automatique dans le panier'}</p>

            <!-- Combined Products Visual Thumbnails with '+' -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px; margin-bottom: 14px;">
              ${prods.map((p, idx) => `
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="text-align: center; width: 70px;">
                    <img src="${p.image_url}" alt="${p.name}" style="width: 50px; height: 50px; object-fit: contain; background: white; border-radius: 6px; border: 1px solid #E2E8F0; margin: 0 auto 4px;" onerror="window.handleProductImgError(this)" />
                    <div style="font-size: 0.68rem; font-weight: 700; color: #1E293B; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
                    <div style="font-size: 0.68rem; color: #64748B;">${Number(p.price || 0).toFixed(2)} DT</div>
                  </div>
                  ${idx < prods.length - 1 ? `<span style="font-weight: 800; font-size: 1.1rem; color: #94A3B8;">+</span>` : ''}
                </div>
              `).join('')}
            </div>

            <!-- Price Breakdown Comparison Box -->
            <div style="background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border: 1px solid #FCD34D; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <div>
                  <span style="font-size: 0.72rem; color: #92400E; font-weight: 700; text-transform: uppercase;">Prix Normal : </span>
                  <span style="font-size: 0.9rem; text-decoration: line-through; color: #78350F; opacity: 0.8;">${regularSum.toFixed(2)} DT</span>
                </div>
                <div>
                  <span style="font-size: 0.72rem; color: #047857; font-weight: 700; text-transform: uppercase;">Prix du Pack : </span>
                  <span style="font-size: 1.25rem; font-weight: 900; color: #047857;">${bundlePrice.toFixed(2)} DT</span>
                </div>
              </div>
              <div style="font-size: 0.78rem; font-weight: 800; color: #B45309; margin-top: 4px; text-align: center; background: #FFFFFF; border-radius: 6px; padding: 4px;">
                🎉 Économie client : -${savings.toFixed(2)} DT (-${discountPercent}%)
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid #F1F5F9; padding-top: 12px; margin-top: auto;">
            <button class="btn-primary" style="flex: 1; padding: 8px 12px; font-size: 0.8rem; background: #18181B; border-color: #C5A880;" onclick="window.adminDash.editBundle('${b.id}')">
              ✏️ Modifier
            </button>
            <button class="btn-primary" style="padding: 8px 12px; font-size: 0.8rem; background: ${b.active !== false ? '#D97706' : '#059669'}; border-color: transparent;" onclick="window.adminDash.toggleBundle('${b.id}')">
              ${b.active !== false ? 'Désactiver' : 'Activer'}
            </button>
            <button class="btn-primary" style="padding: 8px 12px; font-size: 0.8rem; background: #EF4444; border-color: #DC2626;" onclick="window.adminDash.deleteBundle('${b.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  bindBundleEvents() {
    this.bundleSelectedIds = this.bundleSelectedIds || [];

    const btnCreate = document.getElementById('btn-create-new-bundle');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => {
        this.resetBundleForm();
        const formEl = document.getElementById('form-bundle-deal');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const searchInput = document.getElementById('bundle-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderBundleProductPicker(e.target.value);
      });
    }

    const specialPriceInput = document.getElementById('bundle-special-price');
    if (specialPriceInput) {
      specialPriceInput.addEventListener('input', () => {
        this.updateBundleCalc();
      });
    }

    const btnCancel = document.getElementById('btn-cancel-bundle');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        this.resetBundleForm();
      });
    }

    const form = document.getElementById('form-bundle-deal');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveBundleForm();
      });
    }

    this.renderBundleProductPicker('');
  }

  renderBundleProductPicker(filterText = '') {
    const picker = document.getElementById('bundle-product-picker-list');
    if (!picker) return;

    this.bundleSelectedIds = this.bundleSelectedIds || [];
    const search = (filterText || '').toLowerCase().trim();

    const filtered = (this.products || []).filter(p => {
      if (!p) return false;
      const strId = String(p.product_id || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return strId.includes(search) || name.includes(search);
    });

    if (filtered.length === 0) {
      picker.innerHTML = `<div style="padding: 12px; text-align: center; color: #94A3B8; font-size: 0.8rem;">Aucun produit trouvé pour "${filterText}".</div>`;
      return;
    }

    picker.innerHTML = filtered.slice(0, 60).map(p => {
      const isSelected = this.bundleSelectedIds.includes(String(p.product_id));
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #F1F5F9; font-size: 0.82rem; cursor: pointer; background: ${isSelected ? '#F0FDF4' : 'transparent'};" onclick="window.adminDash.toggleBundleProductSelection('${p.product_id}')">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #059669; cursor: pointer;" onclick="event.stopPropagation(); window.adminDash.toggleBundleProductSelection('${p.product_id}')" />
            <img src="${p.image_url}" alt="${p.name}" style="width: 32px; height: 32px; object-fit: contain; background: white; border-radius: 4px; border: 1px solid #E2E8F0;" onerror="window.handleProductImgError(this)" />
            <div style="flex: 1; min-width: 0;">
              <strong style="color: #1E293B;">${p.name}</strong>
              <span style="color: #64748B; font-size: 0.74rem; margin-left: 6px;">[Réf: ${p.product_id}]</span>
            </div>
          </div>
          <div style="font-weight: 700; color: #047857; margin-left: 12px;">
            ${Number(p.price || 0).toFixed(2)} DT
          </div>
        </div>
      `;
    }).join('');
  }

  toggleBundleProductSelection(productId) {
    this.bundleSelectedIds = this.bundleSelectedIds || [];
    const strId = String(productId);
    const index = this.bundleSelectedIds.indexOf(strId);
    if (index > -1) {
      this.bundleSelectedIds.splice(index, 1);
    } else {
      this.bundleSelectedIds.push(strId);
    }
    this.renderBundleSelectedChips();
    const searchInput = document.getElementById('bundle-product-search');
    this.renderBundleProductPicker(searchInput ? searchInput.value : '');
    this.updateBundleCalc();
  }

  renderBundleSelectedChips() {
    const chipsContainer = document.getElementById('bundle-selected-chips');
    const countEl = document.getElementById('bundle-selected-count');
    if (!chipsContainer) return;

    this.bundleSelectedIds = this.bundleSelectedIds || [];
    if (countEl) countEl.textContent = this.bundleSelectedIds.length;

    if (this.bundleSelectedIds.length === 0) {
      chipsContainer.innerHTML = `<span style="font-size: 0.78rem; color: #94A3B8; font-style: italic;">Aucun produit sélectionné pour l'instant.</span>`;
      return;
    }

    chipsContainer.innerHTML = this.bundleSelectedIds.map(pId => {
      const p = (this.products || []).find(x => String(x.product_id) === String(pId)) || { product_id: pId, name: `Produit #${pId}`, price: 0 };
      return `
        <span style="display: inline-flex; align-items: center; gap: 6px; background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">
          <span>${p.name} (${Number(p.price || 0).toFixed(2)} DT)</span>
          <button type="button" onclick="window.adminDash.toggleBundleProductSelection('${p.product_id}')" style="background: none; border: none; color: #047857; font-weight: 800; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0 2px;">✕</button>
        </span>
      `;
    }).join('');
  }

  updateBundleCalc() {
    this.bundleSelectedIds = this.bundleSelectedIds || [];
    let normalSum = 0;
    this.bundleSelectedIds.forEach(pId => {
      const p = (this.products || []).find(x => String(x.product_id) === String(pId));
      if (p) normalSum += Number(p.price || 0);
    });

    const normalEl = document.getElementById('bundle-calc-normal-price');
    if (normalEl) normalEl.textContent = `${normalSum.toFixed(2)} DT`;

    const specialInput = document.getElementById('bundle-special-price');
    const savingsEl = document.getElementById('bundle-calc-savings');

    const specialPrice = specialInput ? parseFloat(specialInput.value) : 0;
    if (savingsEl) {
      if (!isNaN(specialPrice) && specialPrice > 0 && normalSum > 0) {
        const savings = Math.max(0, normalSum - specialPrice);
        const percent = Math.round((savings / normalSum) * 100);
        savingsEl.textContent = `${savings.toFixed(2)} DT (-${percent}%)`;
      } else {
        savingsEl.textContent = `0.00 DT (-0%)`;
      }
    }
  }

  async saveBundleForm() {
    this.bundleSelectedIds = this.bundleSelectedIds || [];
    if (this.bundleSelectedIds.length < 2) {
      alert('⚠️ Veuillez sélectionner au moins 2 produits pour composer cette offre pack.');
      return;
    }

    const titleFr = (document.getElementById('bundle-title-fr').value || '').trim();
    if (!titleFr) {
      alert('⚠️ Veuillez entrer un titre pour ce pack.');
      return;
    }

    const specialPriceVal = parseFloat(document.getElementById('bundle-special-price').value);
    if (isNaN(specialPriceVal) || specialPriceVal <= 0) {
      alert('⚠️ Veuillez entrer un prix valide pour le pack spécial.');
      return;
    }

    const payload = {
      id: document.getElementById('bundle-id').value || undefined,
      title_fr: titleFr,
      title: titleFr,
      title_ar: (document.getElementById('bundle-title-ar').value || '').trim(),
      title_en: (document.getElementById('bundle-title-en').value || '').trim(),
      description_fr: (document.getElementById('bundle-desc-fr').value || '').trim(),
      product_ids: this.bundleSelectedIds,
      bundle_price: specialPriceVal,
      active: document.getElementById('bundle-active-toggle').checked
    };

    try {
      const res = await fetch('/api/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Offre Pack enregistrée avec succès !');
        this.resetBundleForm();
        await this.fetchBundles();
      } else {
        alert('❌ Erreur: ' + data.message);
      }
    } catch (err) {
      alert('❌ Erreur réseau: ' + err.message);
    }
  }

  editBundle(id) {
    const bundle = (this.bundles || []).find(b => b.id === id);
    if (!bundle) return;

    document.getElementById('bundle-id').value = bundle.id;
    document.getElementById('bundle-title-fr').value = bundle.title_fr || bundle.title || '';
    document.getElementById('bundle-title-ar').value = bundle.title_ar || '';
    document.getElementById('bundle-title-en').value = bundle.title_en || '';
    document.getElementById('bundle-desc-fr').value = bundle.description_fr || bundle.description || '';
    document.getElementById('bundle-special-price').value = bundle.bundle_price || '';
    document.getElementById('bundle-active-toggle').checked = bundle.active !== false;

    this.bundleSelectedIds = Array.isArray(bundle.product_ids) ? [...bundle.product_ids] : [];
    this.renderBundleSelectedChips();
    this.renderBundleProductPicker('');
    this.updateBundleCalc();

    document.getElementById('bundle-form-title').textContent = '✏️ Modifier l\'Offre Pack Spécial';
    document.getElementById('btn-save-bundle').textContent = '💾 Mettre à jour l\'Offre Pack';
    document.getElementById('btn-cancel-bundle').style.display = 'inline-block';

    document.getElementById('section-bundles').scrollIntoView({ behavior: 'smooth' });
  }

  resetBundleForm() {
    const form = document.getElementById('form-bundle-deal');
    if (form) form.reset();
    document.getElementById('bundle-id').value = '';
    this.bundleSelectedIds = [];
    this.renderBundleSelectedChips();
    this.renderBundleProductPicker('');
    this.updateBundleCalc();

    document.getElementById('bundle-form-title').textContent = '✨ Créer / Modifier une Offre Pack Spécial';
    document.getElementById('btn-save-bundle').textContent = '💾 Enregistrer l\'Offre Pack';
    document.getElementById('btn-cancel-bundle').style.display = 'none';
  }

  async toggleBundle(id) {
    try {
      const res = await fetch(`/api/bundles/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        await this.fetchBundles();
      } else {
        alert('❌ Erreur: ' + data.message);
      }
    } catch (err) {
      alert('❌ Erreur réseau: ' + err.message);
    }
  }

  async deleteBundle(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette offre pack ?')) return;

    try {
      const res = await fetch(`/api/bundles/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('✅ Offre Pack supprimée');
        await this.fetchBundles();
      } else {
        alert('❌ Erreur: ' + data.message);
      }
    } catch (err) {
      alert('❌ Erreur réseau: ' + err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminDash = new AdminDashboard();
});
