// Shopping Cart Manager with Smart Mobile/Desktop Messenger Routing, i18n & Bundle Deals
const CART_STORAGE_KEY = 'oriflame_cart_v1';
const BUNDLES_STORAGE_KEY = 'oriflame_bundles_cache_v1';

export class CartManager {
  constructor(i18n) {
    this.i18n = i18n;
    this.cart = this.loadCart();
    this.bundles = this.loadBundlesCache();
    this.listeners = [];
    this.fetchBundles();
  }

  loadCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load cart from LocalStorage", e);
      return [];
    }
  }

  saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this.cart));
      this.notifyListeners();
    } catch (e) {
      console.error("Failed to save cart to LocalStorage", e);
    }
  }

  loadBundlesCache() {
    try {
      const data = localStorage.getItem(BUNDLES_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  async fetchBundles() {
    try {
      const res = await fetch('/api/bundles');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.bundles = data.data;
        localStorage.setItem(BUNDLES_STORAGE_KEY, JSON.stringify(this.bundles));
        this.notifyListeners();
      }
    } catch (e) {
      // Offline / network fallback to cache
    }
  }

  setBundles(bundles) {
    if (Array.isArray(bundles)) {
      this.bundles = bundles;
      localStorage.setItem(BUNDLES_STORAGE_KEY, JSON.stringify(bundles));
      this.notifyListeners();
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.cart);
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.cart));
  }

  addItem(product, quantity = 1) {
    const existingIndex = this.cart.findIndex(item => item.product_id === product.product_id);
    if (existingIndex > -1) {
      this.cart[existingIndex].quantity += quantity;
    } else {
      this.cart.push({
        product_id: product.product_id,
        name: product.name,
        price: Number(product.price),
        image_url: product.image_url,
        quantity: quantity
      });
    }
    this.saveCart();
  }

  updateQuantity(productId, delta) {
    const item = this.cart.find(i => i.product_id === productId);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        this.removeItem(productId);
      } else {
        this.saveCart();
      }
    }
  }

  removeItem(productId) {
    this.cart = this.cart.filter(item => item.product_id !== productId);
    this.saveCart();
  }

  clearCart() {
    this.cart = [];
    this.saveCart();
  }

  getTotalCount() {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  getRawSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  // Detect applied bundle deals based on items currently in cart
  getAppliedBundles() {
    if (!Array.isArray(this.bundles) || this.bundles.length === 0 || this.cart.length === 0) return [];

    const activeBundles = this.bundles.filter(b => b.active !== false && Array.isArray(b.product_ids) && b.product_ids.length >= 2);
    const cartQtyMap = new Map();
    const cartPriceMap = new Map();
    this.cart.forEach(item => {
      cartQtyMap.set(String(item.product_id), item.quantity);
      cartPriceMap.set(String(item.product_id), Number(item.price));
    });

    const applied = [];

    activeBundles.forEach(bundle => {
      // Check if all product_ids for this bundle are in the cart
      let maxSets = Infinity;
      let regularCombinedPrice = 0;
      let allFound = true;

      for (const prodId of bundle.product_ids) {
        const qty = cartQtyMap.get(String(prodId)) || 0;
        if (qty <= 0) {
          allFound = false;
          break;
        }
        maxSets = Math.min(maxSets, qty);
        regularCombinedPrice += (cartPriceMap.get(String(prodId)) || 0);
      }

      if (allFound && maxSets > 0 && maxSets !== Infinity) {
        const bundlePrice = Number(bundle.bundle_price);
        const savingsPerSet = Math.max(0, regularCombinedPrice - bundlePrice);
        const totalSavings = savingsPerSet * maxSets;

        if (totalSavings > 0) {
          applied.push({
            bundle,
            sets: maxSets,
            regular_price: regularCombinedPrice,
            bundle_price: bundlePrice,
            savings_per_set: savingsPerSet,
            total_savings: totalSavings
          });
        }
      }
    });

    return applied;
  }

  // Total bundle savings discount in TND
  getBundleDiscount() {
    const applied = this.getAppliedBundles();
    return applied.reduce((sum, a) => sum + a.total_savings, 0);
  }

  // Final subtotal with bundle package prices applied
  getSubtotal() {
    const raw = this.getRawSubtotal();
    const discount = this.getBundleDiscount();
    return Math.max(0, raw - discount);
  }

  // Find incomplete bundles in cart to suggest 1-click upsells (e.g. "Add X to complete the Duo Pack!")
  getUpsellBundles(allProducts = []) {
    if (!Array.isArray(this.bundles) || this.bundles.length === 0 || this.cart.length === 0) return [];

    const activeBundles = this.bundles.filter(b => b.active !== false && Array.isArray(b.product_ids) && b.product_ids.length >= 2);
    const cartProdIds = new Set(this.cart.map(item => String(item.product_id)));
    const upsells = [];

    activeBundles.forEach(bundle => {
      const presentCount = bundle.product_ids.filter(id => cartProdIds.has(String(id))).length;
      const missingIds = bundle.product_ids.filter(id => !cartProdIds.has(String(id)));

      // If customer has at least 1 item from the bundle but not all:
      if (presentCount > 0 && missingIds.length > 0) {
        const missingProducts = missingIds.map(mId => {
          const foundInCatalog = (allProducts || []).find(p => String(p.product_id) === String(mId));
          return foundInCatalog || { product_id: mId, name: `Produit #${mId}`, price: 0 };
        });

        upsells.push({
          bundle,
          present_count: presentCount,
          missing_products: missingProducts
        });
      }
    });

    return upsells;
  }

  getCartItems() {
    return this.cart;
  }

  // Device Detection: Check if visitor is on Mobile Phone / Tablet vs Desktop
  isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase());
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileUA || (isSmallScreen && 'ontouchstart' in window);
  }

  // Generate plain text order message formatted in user's active language
  generateOrderTextMessage(customerName = '', customerPhone = '', currency = 'TND', orderUrl = '') {
    if (this.cart.length === 0) return '';

    const lang = this.i18n ? this.i18n.getLang() : 'fr';
    const currencyLabel = (lang === 'ar') ? 'د.ت' : 'TND';

    const header = this.i18n ? this.i18n.t('msg_template_header') : 'Bonjour Mouna ! Je souhaite passer une commande depuis votre catalogue Oriflame :';
    const totalLabel = this.i18n ? this.i18n.t('msg_template_total') : 'Total de la commande :';
    const nameLabel = this.i18n ? this.i18n.t('msg_template_name') : 'Nom du Client :';
    const phoneLabel = this.i18n ? this.i18n.t('msg_template_phone') : 'Téléphone :';
    const footer = this.i18n ? this.i18n.t('msg_template_footer') : 'Merci de confirmer la disponibilité et la livraison en Tunisie. Merci !';

    let message = `${header}\n\n`;

    this.cart.forEach((item, index) => {
      const itemTotal = (item.price * item.quantity).toFixed(2);
      const refLabel = (lang === 'ar') ? 'مرجع' : 'Réf';
      const refStr = item.product_id ? ` [${refLabel}: ${item.product_id}]` : '';
      message += `${index + 1}. ${item.name}${refStr} (x${item.quantity}) - ${item.price.toFixed(2)} ${currencyLabel} [Total: ${itemTotal} ${currencyLabel}]\n`;
    });

    const appliedBundles = this.getAppliedBundles();
    if (appliedBundles.length > 0) {
      message += `\n🎁 Offres Packs Spéciaux Appliquées :\n`;
      appliedBundles.forEach(ab => {
        const bTitle = (lang === 'ar' && ab.bundle.title_ar) ? ab.bundle.title_ar : (ab.bundle.title_fr || ab.bundle.title);
        message += `  • ${bTitle} : ${ab.bundle_price.toFixed(2)} ${currencyLabel} au lieu de ${ab.regular_price.toFixed(2)} ${currencyLabel} (-${ab.total_savings.toFixed(2)} ${currencyLabel})\n`;
      });
    }

    const rawSubtotal = this.getRawSubtotal().toFixed(2);
    const bundleDiscount = this.getBundleDiscount().toFixed(2);
    const finalTotal = this.getSubtotal().toFixed(2);

    message += `\n-----------------------------------\n`;
    if (Number(bundleDiscount) > 0) {
      message += `Sous-total brut : ${rawSubtotal} ${currencyLabel}\n`;
      message += `Remise Packs Combinés : -${bundleDiscount} ${currencyLabel}\n`;
    }
    message += `${totalLabel} ${finalTotal} ${currencyLabel}\n`;

    if (customerName && customerName.trim()) {
      message += `${nameLabel} ${customerName.trim()}\n`;
    }
    if (customerPhone && customerPhone.trim()) {
      message += `${phoneLabel} ${customerPhone.trim()}\n`;
    }

    if (orderUrl) {
      message += `\n🔒 Lien Inspection Admin : ${orderUrl}\n`;
    }

    message += `\n${footer}`;
    return message;
  }

  // Smart Mobile vs Desktop Facebook / Messenger Link Generator
  generateMessengerLink(fbUsername = 'Mounanouira.Oriflame', customerName = '', customerPhone = '', currency = 'TND', orderUrl = '', orderId = '') {
    if (this.cart.length === 0) return '#';

    const message = this.generateOrderTextMessage(customerName, customerPhone, currency, orderUrl);
    const encodedText = encodeURIComponent(message);

    if (this.isMobileDevice()) {
      return `https://m.me/${fbUsername}?text=${encodedText}`;
    } else {
      return `https://www.facebook.com/messages/t/${fbUsername}`;
    }
  }

  getDesktopFacebookUrl(fbUsername = 'Mounanouira.Oriflame') {
    return `https://www.facebook.com/messages/t/${fbUsername}`;
  }
}

