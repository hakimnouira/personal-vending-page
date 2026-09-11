// Visitor Telemetry & Activity Tracker (Privacy-first)

export class TelemetryTracker {
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.startTime = Date.now();
    this.device = this.detectDevice();
    this.initHeartbeat();
  }

  getOrCreateSessionId() {
    let id = sessionStorage.getItem('oriflame_session_id');
    if (!id) {
      id = 'SES-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
      sessionStorage.setItem('oriflame_session_id', id);
    }
    return id;
  }

  detectDevice() {
    const ua = navigator.userAgent || '';
    if (/android|iphone|ipad|ipod|mobile/i.test(ua.toLowerCase())) {
      return 'Mobile';
    }
    return 'Desktop';
  }

  getDurationSeconds() {
    return Math.round((Date.now() - this.startTime) / 1000);
  }

  trackEvent(eventName, category = null, productName = null) {
    try {
      const payload = {
        session_id: this.sessionId,
        event: eventName,
        category: category,
        product_name: productName,
        duration_seconds: this.getDurationSeconds(),
        device: this.device,
        language: localStorage.getItem('oriflame_lang_v1') || 'fr'
      };

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/ping', blob);
      } else {
        fetch('/api/analytics/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => {});
      }
    } catch (e) {
      // Non-blocking
    }
  }

  trackAnalytics(eventName, params = {}) {
    try {
      // 1. RGPD Sanity Check: strictly exclude PII
      const sanitized = {};
      const forbiddenKeys = ['name', 'customer_name', 'phone', 'customer_phone', 'email', 'address', 'password'];
      for (const [k, v] of Object.entries(params)) {
        if (!forbiddenKeys.includes(k.toLowerCase())) {
          sanitized[k] = v;
        }
      }

      // 2. Google Tag Manager (GTM) dataLayer
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: eventName,
          ...sanitized
        });

        // 3. Google Analytics 4 (GA4) gtag
        if (typeof window.gtag === 'function') {
          window.gtag('event', eventName, sanitized);
        }

        // 4. Custom DOM Event for tests/debugging
        window.dispatchEvent(new CustomEvent('analytics_event', {
          detail: { event: eventName, params: sanitized }
        }));
      }

      // 5. Internal Telemetry Ping
      const pingCategory = sanitized.category || null;
      const pingProd = sanitized.product_name || sanitized.product_reference || null;
      this.trackEvent(eventName, pingCategory, pingProd);
    } catch (e) {
      console.warn('[Telemetry] Tracking note:', e);
    }
  }

  initHeartbeat() {
    // Initial ping
    this.trackEvent('Visited Storefront');

    // Heartbeat every 15 seconds to update time spent
    setInterval(() => {
      this.trackEvent(null);
    }, 15000);

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.trackEvent('Left Storefront');
    });
  }
}
