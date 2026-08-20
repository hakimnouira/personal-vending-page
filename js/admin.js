// Admin Manager with Express API Integration, Direct Image Upload, and Web Scraper
const ADMIN_AUTH_KEY = 'oriflame_admin_auth_v1';

export class AdminManager {
  constructor(i18n) {
    this.i18n = i18n;
    this.products = [];
    this.settings = {
      facebook_username: 'mouna.nouira',
      currency: 'TND',
      admin_pwd: 'mouna2026'
    };
  }

  async init() {
    await this.fetchSettings();
    await this.fetchProducts();
  }

  async fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        this.settings = data.data;
      }
    } catch (e) {
      console.warn("Using offline settings fallback", e);
    }
  }

  async saveSettings(newSettings) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        this.settings = { ...this.settings, ...newSettings };
        return true;
      }
    } catch (e) {
      console.error("Failed to save settings", e);
    }
    return false;
  }

  getFacebookUsername() {
    return this.settings.facebook_username || 'mouna.nouira';
  }

  async fetchProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.products = data.data;
        return this.products;
      }
    } catch (e) {
      console.error("Failed to fetch products from backend", e);
    }
    return this.products;
  }

  getProducts() {
    return this.products;
  }

  isAuthenticated() {
    return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  }

  login(password) {
    const validPwd = this.settings.admin_pwd || 'mouna2026';
    if (password === validPwd) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
      return true;
    }
    return false;
  }

  logout() {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
  }

  // Add Product (Supports multipart/form-data for file uploads OR json)
  async addProduct(formData) {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
        return data.data;
      }
      throw new Error(data.message || 'Failed to add product');
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // Delete Product
  async deleteProduct(productId) {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.products = this.products.filter(p => p.product_id !== productId);
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }

  // Toggle Stock
  async toggleStock(productId) {
    try {
      const res = await fetch(`/api/products/toggle-stock/${productId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        const product = this.products.find(p => p.product_id === productId);
        if (product) product.in_stock = data.in_stock;
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }

  // Scrape Product from specific URL
  async scrapeProductUrl(url, autoAdd = true) {
    try {
      const res = await fetch('/api/scrape/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, auto_add: autoAdd })
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
        return data.data;
      }
      throw new Error(data.message || 'Scraping failed');
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // Scrape / Sync Official Oriflame Tunisia Catalog
  async scrapeOriflameTunisia() {
    try {
      const res = await fetch('/api/scrape/oriflame-catalog', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProducts();
        return data;
      }
      throw new Error(data.message || 'Catalog scrape failed');
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // CSV Bulk Import
  async importCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("CSV file must contain a header row and data rows.");

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
      if (!row || row.length === 0) continue;

      const cleanRow = row.map(val => val.trim().replace(/^["']|["']$/g, ''));
      const productObj = {};
      headers.forEach((h, idx) => { productObj[h] = cleanRow[idx] || ''; });

      if (productObj.name && productObj.price) {
        const formData = new FormData();
        formData.append('product_id', productObj.product_id || `ORF-CSV-${Date.now()}-${i}`);
        formData.append('name', productObj.name);
        formData.append('category', productObj.category || 'Skincare');
        formData.append('price', productObj.price);
        formData.append('image_url', productObj.image_url || '');
        formData.append('description', productObj.description || '');
        formData.append('in_stock', String(productObj.in_stock).toLowerCase() !== 'false');

        await fetch('/api/products', { method: 'POST', body: formData });
        imported++;
      }
    }

    await this.fetchProducts();
    return imported;
  }

  // CSV Export
  exportCSV() {
    const headers = ['product_id', 'name', 'category', 'price', 'image_url', 'description', 'in_stock'];
    let csvContent = headers.join(',') + '\n';

    this.products.forEach(p => {
      const row = [
        `"${p.product_id}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        p.price,
        `"${p.image_url}"`,
        `"${(p.description || '').replace(/"/g, '""')}"`,
        p.in_stock ? 'true' : 'false'
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oriflame_catalog_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadSampleCSV() {
    const sample = `product_id,name,category,price,image_url,description,in_stock
ORF-TN-001,"NovAge Ecollagen Day Cream",Skincare,85.00,"https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80","Soin hydratant anti-rides",true
ORF-TN-002,"Giordani Gold Matte Lipstick",Makeup,42.00,"https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80","Rouge à lèvres velours mat",true
`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oriflame_tunisia_sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
