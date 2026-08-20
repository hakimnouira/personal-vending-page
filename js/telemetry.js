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
