// Trilingual Internationalization for Admin Portal (Français, العربية, English)

export const adminTranslations = {
  fr: {
    // Auth
    portal_subtitle: "Portail Privé de la Consultante",
    passcode_placeholder: "Entrez le mot de passe administrateur",
    btn_access_dashboard: "Accéder au Tableau de Bord",
    btn_logout: "Se déconnecter",
    open_storefront: "↗ Ouvrir la Boutique Client",
    
    // Sidebar Tabs
    tab_analytics: "📊 Statistiques & Visiteurs",
    tab_orders: "🛍️ Commandes Client",
    tab_stock: "📦 Gestion du Stock & Produits",
    tab_scraper: "🤖 Scrapers Oriflame & Flipbook",
    tab_settings: "⚙️ Paramètres & Import/Export CSV",
    tab_carousel: "🖼️ Carrousel Page d'Accueil",
    tab_order_detail: "📋 Détail Commande",

    // Section 1: Analytics
    analytics_title: "Statistiques & Parcours des Visiteurs",
    analytics_desc: "Consultez qui a visité votre boutique, combien de temps ils y sont restés et quels produits ils ont consultés.",
    btn_refresh_stats: "🔄 Actualiser les Statistiques",
    stat_total_visits: "Total des Visites",
    stat_total_visits_sub: "Sessions clients enregistrées",
    stat_avg_duration: "Temps Moyen Passé",
    stat_avg_duration_sub: "Durée moyenne sur le site",
    stat_devices: "Mobiles vs Ordinateurs",
    stat_devices_sub: "Smartphones / Ordinateurs",
    stat_top_categories: "Catégories les Plus Vues",
    table_journey_title: "Journal en Direct des Visites & Temps Passé",
    th_session_id: "ID de Session Visiteur",
    th_device_lang: "Appareil & Langue",
    th_time_spent: "Temps Passé sur le Site",
    th_activity_trail: "Parcours de Navigation (Où ils ont cliqué)",
    th_last_active: "Dernière Activité",
    no_telemetry_yet: "Aucune donnée de visite pour le moment.",

    // Section 2: Stock
    stock_title: "Gestion du Stock & des Produits",
    stock_desc: "Gérez votre inventaire Oriflame, activez/désactivez la disponibilité ou ajoutez de nouveaux produits.",
    stat_total_products: "Total Produits au Catalogue",
    stat_in_stock: "Disponibles en Stock",
    stat_out_stock: "En Rupture de Stock",
    add_product_toggle: "➕ Ajouter un Nouveau Produit (Photo ou Lien Direct)",
    lbl_product_title: "Nom du Produit *",
    lbl_category: "Catégorie *",
    lbl_price_tnd: "Prix Catalogue (en TND) *",
    lbl_original_price: "Prix d'Origine avant remise (Optionnel)",
    lbl_size: "Contenance / Format",
    lbl_upload_image: "Photo du Produit (Fichier local ou URL de l'image)",
    lbl_description: "Description & Bienfaits",
    btn_save_product: "Enregistrer le Produit dans la Boutique",
    th_prod_id: "Réf Produit",
    th_photo_name: "Photo & Nom",
    th_category: "Catégorie",
    th_price: "Prix (TND)",
    th_stock_status: "Disponibilité",
    th_actions: "Actions",
    btn_mark_out_stock: "Marquer Épuisé",
    btn_mark_in_stock: "Marquer en Stock",
    btn_delete: "Supprimer",

    // Section 3: Scrapers
    scraper_title: "Scrapers Automatiques d'eCatalogue & Flipbook",
    scraper_desc: "Scrapez l'intégralité du Digital Flipbook avec ses 150 pages, ou synchronisez les offres de tn.oriflame.com.",
    badge_new: "NOUVEAU",
    flipbook_scraper_title: "📖 Scraper le Digital Flipbook Complet (Toutes les Pages)",
    flipbook_scraper_desc: "Collez n'importe quel lien du catalogue officiel Oriflame pour extraire automatiquement toutes les pages, photos haute résolution, vidéo et pastilles interactives.",
    btn_scrape_flipbook: "🚀 Scraper le Flipbook & Toutes ses Pages",
    sync_title: "🤖 Scraping Global de Toutes les Catégories & Produits",
    sync_desc: "Scrapez l'intégralité des produits de toutes les catégories (Parfums, Soins, Maquillage, Wellness, Cheveux, Homme) avec leurs références exactes, prix en TND et remises.",
    btn_sync_catalog: "⚡ Lancer le Scraping Global & Synchroniser le Catalogue",
    badge_multi_cat: "MULTI-CATÉGORIES + DIFF",
    stat_total_scraped: "Total Scrappé",
    stat_new_added: "Nouveaux",
    stat_modified: "Modifiés (Prix/Promo)",
    stat_deleted: "Supprimés",
    stat_unchanged: "Inchangés",
    lbl_diff_preview: "Détails des Modifications Récentes :",
    th_code: "Réf.",
    th_name: "Nom du Produit",
    th_status: "Statut",
    th_price_diff: "Prix / Modification",
    single_scrape_title: "Scraper une Page Produit Oriflame Unique",
    single_scrape_desc: "Collez le lien direct d'un produit Oriflame Tunisie pour l'ajouter automatiquement.",
    btn_scrape_single: "Scraper & Ajouter le Produit",

    // Section 4: Settings
    settings_title: "Paramètres & Gestion Massive CSV",
    settings_desc: "Configurez votre lien Messenger, modifiez vos identifiants et exportez/importez votre catalogue.",
    fb_handle_title: "Nom d'Utilisateur Facebook Messenger",
    fb_handle_desc: "Ce compte recevra les commandes des clients lorsqu'ils cliquent sur Commander via Messenger.",
    btn_save_handle: "Enregistrer le Nom",
    pwd_title: "Code d'Accès Administrateur",
    btn_save_pwd: "Mettre à Jour le Mot de Passe",
    csv_title: "Opérations Massives en CSV",
    btn_import_csv: "📥 Importer des Produits depuis CSV",
    btn_export_csv: "📤 Exporter le Catalogue en CSV",
    btn_sample_csv: "📄 Télécharger un Modèle CSV"
  },

  ar: {
    // Auth
    portal_subtitle: "البوابة الخاصة بمستشارة أوريفلام",
    passcode_placeholder: "أدخلي رمز المرور السري",
    btn_access_dashboard: "الدخول إلى لوحة التحكم",
    btn_logout: "تسجيل الخروج",
    open_storefront: "↗ فتح المتجر العام للزبائن",

    // Sidebar Tabs
    tab_analytics: "📊 إحصائيات الزوار ووقت التصفح",
    tab_orders: "🛍️ طلبات الزبائن",
    tab_stock: "📦 إدارة المخزون والمنتجات",
    tab_scraper: "🤖 سحب الكتالوج والكتيب الرقمي",
    tab_settings: "⚙️ الإعدادات وتصدير/استيراد CSV",
    tab_carousel: "🖼️ شريط الصور المتحرك",
    tab_order_detail: "📋 تفاصيل الطلب",

    // Section 1: Analytics
    analytics_title: "تحليلات الزوار ومسار التصفح المباشر",
    analytics_desc: "تابعي من زار متجرك، والوقت الدقيق الذي قضوه في التصفح، والمنتجات التي شاهدوها.",
    btn_refresh_stats: "🔄 تحديث الإحصائيات المباشرة",
    stat_total_visits: "إجمالي الزيارات",
    stat_total_visits_sub: "جلسات الزوار المسجلة",
    stat_avg_duration: "متوسط وقت التصفح",
    stat_avg_duration_sub: "معدل تفاعل الزبائن على الموقع",
    stat_devices: "الهواتف مقابل الحواسيب",
    stat_devices_sub: "الهواتف الذكية / أجهزة الكمبيوتر",
    stat_top_categories: "الأقسام الأكثر مشاهدة",
    table_journey_title: "سجل الزوار المباشر ووقت التصفح",
    th_session_id: "معرف الجلسة",
    th_device_lang: "الجهاز واللغة",
    th_time_spent: "الوقت المقضي في الموقع",
    th_activity_trail: "مسار التصفح (أين نقر الزائر)",
    th_last_active: "آخر نشاط",
    no_telemetry_yet: "لا توجد سجلات زيارة حتى الآن.",

    // Section 2: Stock
    stock_title: "إدارة المخزون والمنتجات",
    stock_desc: "تحكمي في مخزون أوريفلام، تفعيل أو تعطيل توفر المنتجات، أو إضافة منتجات جديدة.",
    stat_total_products: "إجمالي المنتجات في الكتالوج",
    stat_in_stock: "متوفر في المخزون",
    stat_out_stock: "غير متوفر (نفد المخزون)",
    add_product_toggle: "➕ إضافة منتج جديد (رفع صورة أو رابط مباشر)",
    lbl_product_title: "اسم المنتج *",
    lbl_category: "القسم *",
    lbl_price_tnd: "سعر الكتالوج (بالدينار التونسي د.ت) *",
    lbl_original_price: "السعر الأصلي قبل التخفيض (اختياري)",
    lbl_size: "الحجم / السعة",
    lbl_upload_image: "صورة المنتج (ملف محلي أو رابط الصورة)",
    lbl_description: "الوصف والفوائد",
    btn_save_product: "حفظ المنتج في المتجر المباشر",
    th_prod_id: "رمز المنتج",
    th_photo_name: "الصورة والاسم",
    th_category: "القسم",
    th_price: "السعر (د.ت)",
    th_stock_status: "حالة المخزون",
    th_actions: "الإجراءات",
    btn_mark_out_stock: "تحديد كـ غير متوفر",
    btn_mark_in_stock: "تحديد كـ متوفر",
    btn_delete: "حذف",

    // Section 3: Scrapers
    scraper_title: "سحب الكتالوج الرقمي التفاعلي والمنتجات",
    scraper_desc: "اسحبي الكتالوج الرقمي بجميع صفحاته الـ 150 تلقائياً، أو زامني عروض موقع أوريفلام تونس.",
    badge_new: "جديد",
    flipbook_scraper_title: "📖 سحب الكتالوج الرقمي الكامل (جميع الصفحات)",
    flipbook_scraper_desc: "الصقي أي رابط كتالوج من موقع أوريفلام الرسمي لسحب جميع الصفحات، الصور فائقة الدقة، الفيديو والنقاط التفاعلية.",
    sync_title: "🤖 سحب شامل لجميع الفئات والمنتجات والأسعار",
    sync_desc: "سحب واستخراج جميع المنتجات من كافة الأقسام (العطور، العناية بالبشرة، المكياج، الصحة، العناية بالشعر، العناية بالرجل) مع الرموز الرسمية والأسعار والتخفيضات.",
    btn_sync_catalog: "⚡ بدء الفحص والاستخراج الشامل وتحديث المتجر",
    badge_multi_cat: "فئات متعددة + فحص الفروقات",
    stat_total_scraped: "إجمالي المسحوب",
    stat_new_added: "جديد مضاف",
    stat_modified: "معدل (أسعار/عروض)",
    stat_deleted: "محذوف",
    stat_unchanged: "بدون تغيير",
    lbl_diff_preview: "تفاصيل التغييرات الأخيرة في الأسعار والمنتجات :",
    th_code: "الرمز",
    th_name: "اسم المنتج",
    th_status: "الحالة",
    th_price_diff: "السعر / التعديل",
    single_scrape_title: "سحب صفحة منتج أوريفلام منفرد",
    single_scrape_desc: "الصقي رابط أي منتج من موقع أوريفلام تونس لإضافته مباشرة إلى متجرك.",
    btn_scrape_single: "سحب وإضافة المنتج",

    // Section 4: Settings
    settings_title: "الإعدادات وإدارة ملفات CSV",
    settings_desc: "تعديل رابط الماسنجر، تحديث الرمز السري، وتصدير/استيراد المنتجات بالجملة.",
    fb_handle_title: "اسم مستخدم فيسبوك ماسنجر",
    fb_handle_desc: "هذا الحساب يستقبل طلبات الزبائن مباشرة عند الضغط على إرسال الطلب عبر ماسنجر.",
    btn_save_handle: "حفظ اسم المستخدم",
    pwd_title: "رمز المرور السري للوحة الإدارة",
    btn_save_pwd: "تحديث رمز المرور",
    csv_title: "عمليات CSV بالجملة",
    btn_import_csv: "📥 استيراد المنتجات من ملف CSV",
    btn_export_csv: "📤 تصدير الكتالوج الحالي إلى CSV",
    btn_sample_csv: "📄 تحميل نموذج ملف CSV تجريبي"
  },

  en: {
    // Auth
    portal_subtitle: "Private Consultant Admin Portal",
    passcode_placeholder: "Enter Admin Passcode",
    btn_access_dashboard: "Access Dashboard",
    btn_logout: "Log Out",
    open_storefront: "↗ Open Public Storefront",

    // Sidebar Tabs
    tab_analytics: "📊 Visitor Analytics & Time Spent",
    tab_orders: "🛍️ Customer Orders",
    tab_stock: "📦 Stock & Catalog Manager",
    tab_scraper: "🤖 Oriflame & Flipbook Scraper",
    tab_settings: "⚙️ Settings & CSV Data",
    tab_carousel: "🖼️ Homepage Carousel",
    tab_order_detail: "📋 Order Details",

    // Section 1: Analytics
    analytics_title: "Visitor Analytics & Behavioral Tracking",
    analytics_desc: "Monitor who visited your catalog, how much time they spent, and what products they browsed.",
    btn_refresh_stats: "🔄 Refresh Live Stats",
    stat_total_visits: "Total Visitor Sessions",
    stat_total_visits_sub: "Storefront visits tracked",
    stat_avg_duration: "Avg. Time Spent on Site",
    stat_avg_duration_sub: "Average engagement duration",
    stat_devices: "Mobile vs Desktop",
    stat_devices_sub: "Mobile phones / Desktop computers",
    stat_top_categories: "Top Viewed Categories",
    table_journey_title: "Live Visitor Journey & Time Spent Log",
    th_session_id: "Visitor Session ID",
    th_device_lang: "Device & Language",
    th_time_spent: "Time Spent on Site",
    th_activity_trail: "Browsing Activity Trail (Where They Visited)",
    th_last_active: "Last Active",
    no_telemetry_yet: "No visitor telemetry records yet.",

    // Section 2: Stock
    stock_title: "Stock & Products Management",
    stock_desc: "Manage your Oriflame inventory, toggle availability or add new products.",
    stat_total_products: "Total Catalog Products",
    stat_in_stock: "In Stock & Available",
    stat_out_stock: "Out of Stock",
    add_product_toggle: "➕ Add New Product (Upload Image or Direct Link)",
    lbl_product_title: "Product Title *",
    lbl_category: "Category *",
    lbl_price_tnd: "Catalog Price (in TND) *",
    lbl_original_price: "Original Price before discount (Optional)",
    lbl_size: "Volume / Size",
    lbl_upload_image: "Product Image (Local file or direct URL)",
    lbl_description: "Description & Key Benefits",
    btn_save_product: "Save Product to Live Storefront",
    th_prod_id: "Product Code",
    th_photo_name: "Photo & Name",
    th_category: "Category",
    th_price: "Price (TND)",
    th_stock_status: "Stock Status",
    th_actions: "Actions",
    btn_mark_out_stock: "Mark Out of Stock",
    btn_mark_in_stock: "Mark In Stock",
    btn_delete: "Delete",

    // Section 3: Scrapers
    scraper_title: "Automated eCatalog & Flipbook Scrapers",
    scraper_desc: "Scrape the entire 150-page Digital Flipbook or sync live products from tn.oriflame.com.",
    badge_new: "NEW",
    flipbook_scraper_title: "📖 Scrape Full Digital Flipbook (All Pages)",
    flipbook_scraper_desc: "Paste any link from the official Oriflame catalog to extract all pages, HD images, video and interactive hotspot tags.",
    btn_scrape_flipbook: "🚀 Scrape Flipbook & All Pages",
    sync_title: "🤖 Global Category & Product Scraping",
    sync_desc: "Scrape all products across all categories (Fragrance, Skincare, Makeup, Wellness, Hair, Men) with exact codes, TND prices and discounts.",
    btn_sync_catalog: "⚡ Start Global Scraping & Sync Catalog",
    badge_multi_cat: "MULTI-CATEGORY + DIFF",
    stat_total_scraped: "Total Scraped",
    stat_new_added: "New Added",
    stat_modified: "Modified (Price/Promo)",
    stat_deleted: "Deleted",
    stat_unchanged: "Unchanged",
    lbl_diff_preview: "Recent Price & Product Changes:",
    th_code: "Code",
    th_name: "Product Name",
    th_status: "Status",
    th_price_diff: "Price / Change",
    single_scrape_title: "Scrape Single Oriflame Product Page",
    single_scrape_desc: "Paste the direct URL of an Oriflame Tunisia website to extract and add it automatically.",
    btn_scrape_single: "Scrape & Add Product",

    // Section 4: Settings
    fb_handle_desc: "This username is where customer orders will be sent when they click Order via Messenger.",
    btn_save_handle: "Save Handle",
    pwd_title: "Admin Security Passcode",
    btn_save_pwd: "Update Passcode",
    csv_title: "Bulk CSV Operations",
    btn_import_csv: "📥 Import Products from CSV",
    btn_export_csv: "📤 Export Current Catalog to CSV",
    btn_sample_csv: "📄 Download Sample CSV Template"
  }
};

export class AdminI18n {
  constructor() {
    this.currentLang = localStorage.getItem('oriflame_admin_lang') || 'fr';
  }

  getLang() {
    return this.currentLang;
  }

  setLang(lang) {
    if (['fr', 'ar', 'en'].includes(lang)) {
      this.currentLang = lang;
      localStorage.setItem('oriflame_admin_lang', lang);
      this.apply();
    }
  }

  t(key) {
    return adminTranslations[this.currentLang]?.[key] || adminTranslations['fr']?.[key] || key;
  }

  apply() {
    const isArabic = this.currentLang === 'ar';
    // Admin dashboard layout is strictly LTR to keep sidebar/navbar pinned to the left
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = this.currentLang;
    if (isArabic) {
      document.body.classList.add('rtl-layout');
    } else {
      document.body.classList.remove('rtl-layout');
    }

    document.querySelectorAll('[data-admin-i18n]').forEach(el => {
      const key = el.getAttribute('data-admin-i18n');
      const translation = this.t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translation;
      } else {
        el.innerHTML = translation;
      }
    });

    const langSelect = document.getElementById('admin-lang-select');
    if (langSelect) langSelect.value = this.currentLang;
    const loginLangSelect = document.getElementById('admin-login-lang-select');
    if (loginLangSelect) loginLangSelect.value = this.currentLang;
  }
}
