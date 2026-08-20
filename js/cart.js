// Shopping Cart Manager with Smart Mobile/Desktop Messenger Routing & i18n
const CART_STORAGE_KEY = 'oriflame_cart_v1';

export class CartManager {
  constructor(i18n) {
    this.i18n = i18n;
    this.cart = this.loadCart();
    this.listeners = [];
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

  getSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
      message += `${index + 1}. ${item.name} (x${item.quantity}) - ${item.price.toFixed(2)} ${currencyLabel} [${itemTotal} ${currencyLabel}]\n`;
    });

    const subtotal = this.getSubtotal().toFixed(2);
    message += `\n-----------------------------------\n`;
    message += `${totalLabel} ${subtotal} ${currencyLabel}\n`;

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
  // Desktop: facebook.com/messages/t/ (uses active FB session, no login prompt)
  // Mobile: m.me deep link with ?text= pre-filled (native Messenger app auto-types)
  generateMessengerLink(fbUsername = 'Mounanouira.Oriflame', customerName = '', customerPhone = '', currency = 'TND', orderUrl = '', orderId = '') {
    if (this.cart.length === 0) return '#';

    const message = this.generateOrderTextMessage(customerName, customerPhone, currency, orderUrl);
    const encodedText = encodeURIComponent(message);

    if (this.isMobileDevice()) {
      // Mobile: Launches native Messenger App with text pre-filled in composer
      return `https://m.me/${fbUsername}?text=${encodedText}`;
    } else {
      // Desktop: Direct Facebook Web Messages (uses active facebook.com session)
      // NOTE: Facebook does NOT allow pre-filling text on desktop web via URL — this is a Meta platform limit.
      // The order text is auto-copied to clipboard; client pastes it with Ctrl+V.
      return `https://www.facebook.com/messages/t/${fbUsername}`;
    }
  }

  // Generate Direct Desktop Facebook Message URL
  getDesktopFacebookUrl(fbUsername = 'Mounanouira.Oriflame') {
    return `https://www.facebook.com/messages/t/${fbUsername}`;
  }
}
