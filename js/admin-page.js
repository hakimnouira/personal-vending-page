// Admin Dashboard Controller with Trilingual Localization, Digital Flipbook Scraper, Real-Time Visitor Analytics & Stock Management
import { AdminI18n } from './admin-i18n.js';

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
    this.newPwdInput = document.getElementById('setting-new-pwd');
    this.btnSavePwd = document.getElementById('btn-save-pwd');

    // CSV Elements
    this.csvFileInput = document.getElementById('admin-csv-file');
    this.btnExportCsv = document.getElementById('btn-export-csv');
    this.btnDownloadSampleCsv = document.getElementById('btn-download-sample-csv');
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
        const pwd = this.pwdInput.value;
        try {
          const res = await fetch('/api/settings');
          const data = await res.json();
          const targetPwd = data.data?.admin_pwd || 'mouna2026';

          if (pwd === targetPwd) {
            sessionStorage.setItem('oriflame_admin_auth', 'true');
            this.showDashboard();
          } else {
            alert(this.i18n.getLang() === 'ar' ? '❌ رمز المرور غير صحيح. يرجى المحاولة مرة أخرى.' : '❌ Invalid passcode. Please try again.');
          }
        } catch (err) {
          if (pwd === 'mouna2026') {
            sessionStorage.setItem('oriflame_admin_auth', 'true');
            this.showDashboard();
          } else {
            alert('❌ Authentication failed.');
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

    // ── Company Discount: Apply customizable % to all products (One-time only) ──
    const btnDiscount = document.getElementById('btn-apply-company-discount');
    const inputDiscount = document.getElementById('company-discount-input');

    if (btnDiscount) {
      btnDiscount.addEventListener('click', async () => {
        if (btnDiscount.disabled) return;

        const val = inputDiscount ? parseFloat(inputDiscount.value) : 20;
        const percentage = (!isNaN(val) && val > 0 && val < 100) ? val : 20;

        const confirmed = confirm(
          `🏷️ Appliquer une réduction de ${percentage}% sur TOUS les prix du catalogue ?\n\n⚠️ Cette action est PERMANENTE et NE PEUT ÊTRE EXÉCUTÉE QU'UNE SEULE FOIS pour protéger vos prix contre les doubles réductions.\n\nIl s'agit de votre remise société (aucun badge promo ne sera affiché).\n\nContinuer ?`
        );
        if (!confirmed) return;

        btnDiscount.disabled = true;
        btnDiscount.textContent = '⏳ Application en cours...';

        try {
          const res = await fetch('/api/products/apply-company-discount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percentage })
          });
          const data = await res.json();
          if (data.success) {
            alert(`✅ ${data.message}`);
            this.lockCompanyDiscountUI(data.percentage || percentage);
            await this.fetchProducts();
          } else {
            alert(`❌ ${data.message}`);
            if (data.already_applied) {
              this.lockCompanyDiscountUI(data.percentage || percentage);
            } else {
              btnDiscount.disabled = false;
              btnDiscount.textContent = '🏷️ Appliquer la Remise Société';
            }
          }
        } catch (err) {
          alert(`❌ Erreur réseau: ${err.message}`);
          btnDiscount.disabled = false;
          btnDiscount.textContent = '🏷️ Appliquer la Remise Société';
        }
      });
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
  }

  async fetchProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        this.products = data.data;
        this.renderStockTable();
      }
    } catch (e) {
      console.error(e);
    }
  }

  renderStockTable() {
    if (!this.stockTableBody) return;

    const total = this.products.length;
    const inStock = this.products.filter(p => p.in_stock).length;
    const outStock = total - inStock;

    if (this.statTotalProducts) this.statTotalProducts.textContent = total;
    if (this.statInStock) this.statInStock.textContent = inStock;
    if (this.statOutStock) this.statOutStock.textContent = outStock;

    const isArabic = this.i18n.getLang() === 'ar';
    const currencyLabel = isArabic ? 'د.ت' : 'TND';
    const inStockText = isArabic ? '● متوفر' : '● In Stock';
    const outStockText = isArabic ? '✕ نفد المخزون' : '✕ Out of Stock';
    const markOutText = this.i18n.t('btn_mark_out_stock');
    const markInText = this.i18n.t('btn_mark_in_stock');
    const deleteText = this.i18n.t('btn_delete');

    this.stockTableBody.innerHTML = this.products.map(p => `
      <tr>
        <td><code>${p.product_id}</code></td>
        <td style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.image_url}" alt="${p.name}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #FAF8F5;" />
          <div>
            <strong>${p.name}</strong>
            ${p.size ? `<div style="font-size:0.75rem; color:#8E8D8A;">📦 ${p.size}</div>` : ''}
          </div>
        </td>
        <td><span class="badge" style="background:#FAF8F5; border:1px solid var(--admin-border);">${p.category}</span></td>
        <td><strong>${Number(p.price).toFixed(2)} ${currencyLabel}</strong></td>
        <td>
          <span class="badge ${p.in_stock ? 'badge-success' : 'badge-danger'}">
            ${p.in_stock ? inStockText : outStockText}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.78rem; width: auto; background: ${p.in_stock ? '#52525B' : 'var(--admin-success)'};" onclick="window.adminDash.toggleStock('${p.product_id}')">
              ${p.in_stock ? markOutText : markInText}
            </button>
            <button class="btn-primary" style="padding: 6px 10px; font-size: 0.78rem; width: auto; background: var(--admin-danger); border-color: var(--admin-danger);" onclick="window.adminDash.deleteProduct('${p.product_id}')">
              ${deleteText}
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async toggleStock(productId) {
    try {
      const res = await fetch(`/api/products/toggle-stock/${productId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
      }
    } catch (e) {
      alert('Error toggling stock: ' + e.message);
    }
  }

  async deleteProduct(productId) {
    const isArabic = this.i18n.getLang() === 'ar';
    if (!confirm(isArabic ? 'هل أنت متأكدة من حذف هذا المنتج؟' : 'Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
      }
    } catch (e) {
      alert('Error deleting product: ' + e.message);
    }
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

  lockCompanyDiscountUI(percentage = 20) {
    const btnDiscount = document.getElementById('btn-apply-company-discount');
    const inputDiscount = document.getElementById('company-discount-input');
    const wrapper = document.getElementById('company-discount-wrapper');

    if (inputDiscount) {
      inputDiscount.value = percentage;
      inputDiscount.disabled = true;
      inputDiscount.style.color = '#64748B';
    }
    if (wrapper) {
      wrapper.style.opacity = '0.75';
      wrapper.style.background = '#F1F5F9';
      wrapper.title = 'Remise déjà appliquée';
    }
    if (btnDiscount) {
      btnDiscount.disabled = true;
      btnDiscount.style.background = '#475569';
      btnDiscount.style.borderColor = '#334155';
      btnDiscount.style.cursor = 'not-allowed';
      btnDiscount.style.opacity = '0.9';
      btnDiscount.innerHTML = `🔒 Remise de ${percentage}% Déjà Appliquée`;
      btnDiscount.title = 'Cette remise a déjà été appliquée sur les prix du catalogue. Action verrouillée pour éviter les doubles réductions.';
    }
  }

  async fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        if (this.fbHandleInput) {
          const username = data.data.facebook_username || 'mouna.nouira1';
          this.fbHandleInput.value = username;
          this.updateFbPreviewLink(username);
        }
        if (data.data.company_discount_applied) {
          this.lockCompanyDiscountUI(data.data.company_discount_percent || 20);
        }
      }
    } catch (e) {}
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

  exportCsv() {
    if (this.products.length === 0) return alert('No products to export');
    const headers = ['product_id', 'name', 'category', 'price', 'original_price', 'size', 'in_stock', 'image_url', 'description'];
    const rows = this.products.map(p => [
      `"${p.product_id || ''}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.category || 'Skincare'}"`,
      p.price || 0,
      p.original_price || '',
      `"${p.size || ''}"`,
      p.in_stock ? 'TRUE' : 'FALSE',
      `"${p.image_url || ''}"`,
      `"${(p.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `oriflame_catalog_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  downloadSampleCsv() {
    const csvContent = 'data:text/csv;charset=utf-8,product_id,name,category,price,original_price,size,in_stock,image_url,description\nORF-001,NovAge Ecollagen Day Cream,Skincare,85.00,110.00,50 ml,TRUE,https://images.unsplash.com/photo-1556228720-195a672e8a03,Anti-wrinkle daytime moisture cream\nORF-002,Giordani Gold Essenza Parfum,Fragrance,125.00,165.00,50 ml,TRUE,https://images.unsplash.com/photo-1592945403244-b3fbafd7f539,Luxury Orange Blossom scent';
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'sample_oriflame_template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async importCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) return alert('CSV file is empty or missing headers');

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
        if (parts.length >= 4) {
          const product_id = parts[0] || `ORF-CSV-${Date.now()}-${i}`;
          const name = parts[1];
          const category = parts[2] || 'Skincare';
          const price = parseFloat(parts[3]) || 0;
          const original_price = parts[4] ? parseFloat(parts[4]) : null;
          const size = parts[5] || 'Format Standard';
          const in_stock = parts[6] ? parts[6].toUpperCase() === 'TRUE' : true;
          const image_url = parts[7] || 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80';
          const description = parts[8] || '';

          if (name && price > 0) {
            const formData = new FormData();
            formData.append('product_id', product_id);
            formData.append('name', name);
            formData.append('category', category);
            formData.append('price', price);
            if (original_price) formData.append('original_price', original_price);
            formData.append('size', size);
            formData.append('in_stock', in_stock);
            formData.append('image_url', image_url);
            formData.append('description', description);

            try {
              await fetch('/api/products', { method: 'POST', body: formData });
              imported++;
            } catch (err) {}
          }
        }
      }

      alert(`✅ Bulk import complete: ${imported} products loaded into catalog!`);
      await this.fetchProducts();
      event.target.value = '';
    };
    reader.readAsText(file);
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
          <img src="${slide.image_url}" alt="${slide.title || 'Slide'}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'" />
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
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminDash = new AdminDashboard();
});
