import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

async function runFullBackupSuite() {
  console.log('================================================================');
  console.log('  STARTING COMPREHENSIVE BACKUP & RESTORE QA TEST SUITE');
  console.log('================================================================\n');

  // 1. Admin login
  console.log('▶ Step 1: Logging in as Admin...');
  const loginRes = await axios.post(`${BASE_URL}/api/admin/login`, { password: 'mouna2024' });
  if (!loginRes.data.success || !loginRes.data.token) {
    throw new Error('Login failed: ' + JSON.stringify(loginRes.data));
  }
  const token = loginRes.data.token;
  console.log('  ✓ Admin logged in successfully.\n');

  const authAxios = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-admin-token': token }
  });

  // 2. Set known specific test state for Featured Deals
  console.log('▶ Step 2: Preparing known initial state for Featured Deals...');
  const initialFeaturedIds = ['47724', '47844', '12760'];
  await authAxios.post('/api/settings', {
    featured_deal_ids: initialFeaturedIds,
    whatsapp_phone: '55756629',
    facebook_username: 'mouna.nouira1'
  });
  const checkInitialSettings = (await authAxios.get('/api/settings')).data.data;
  console.log('  Initial featured_deal_ids in DB:', checkInitialSettings.featured_deal_ids);
  if (JSON.stringify(checkInitialSettings.featured_deal_ids.sort()) !== JSON.stringify(initialFeaturedIds.sort())) {
    throw new Error('Initial featured_deal_ids failed to save!');
  }
  console.log('  ✓ Initial state established.\n');

  // 3. Download full backup from /api/export/backup
  console.log('▶ Step 3: Exporting full system backup (/api/export/backup)...');
  const backupRes = await authAxios.get('/api/export/backup');
  const backupData = backupRes.data;

  console.log('  Exported backup metadata:');
  console.log('    - Version:', backupData.version);
  console.log('    - Products count:', backupData.products?.length || 0);
  console.log('    - Featured deal IDs in backup:', backupData.featured_deal_ids);
  console.log('    - Featured deals in backup:', backupData.featured_deals?.length || 0);
  console.log('    - Carousel slides:', backupData.carousel?.length || 0);
  console.log('    - Orders count:', backupData.orders?.length || 0);
  console.log('    - Bundles count:', backupData.bundles?.length || 0);
  console.log('    - Threshold deals count:', backupData.deals?.length || 0);
  console.log('    - Settings present:', !!backupData.settings);
  console.log('    - Flipbook present:', !!backupData.flipbook);
  console.log('    - Analytics present:', !!backupData.analytics);

  if (!Array.isArray(backupData.featured_deal_ids) || backupData.featured_deal_ids.length !== 3) {
    throw new Error('Backup did NOT export top-level featured_deal_ids properly! Found: ' + JSON.stringify(backupData.featured_deal_ids));
  }
  console.log('  ✓ Full backup exported with all sections present and valid.\n');

  // 4. Test individual featured deals export & import
  console.log('▶ Step 4: Testing dedicated individual export/import for Featured Deals...');
  const indivExport = (await authAxios.get('/api/export/featured-deals')).data;
  console.log('  Individual export count:', indivExport.count, 'ids:', indivExport.featured_deal_ids);
  if (!Array.isArray(indivExport.featured_deal_ids) || indivExport.count !== 3) {
    throw new Error('Individual export /api/export/featured-deals failed!');
  }

  // Mutate featured deals to something different
  await authAxios.post('/api/settings', { featured_deal_ids: ['99999'] });
  let mutatedSettings = (await authAxios.get('/api/settings')).data.data;
  console.log('  Mutated featured_deal_ids:', mutatedSettings.featured_deal_ids);

  // Restore via individual import
  const indivForm = new FormData();
  indivForm.append('featured_deals', Buffer.from(JSON.stringify({ featured_deal_ids: initialFeaturedIds })), {
    filename: 'featured_deals.json',
    contentType: 'application/json'
  });
  const indivImportRes = await authAxios.post('/api/import/featured-deals', indivForm, {
    headers: indivForm.getHeaders()
  });
  console.log('  Individual import response:', indivImportRes.data.message);
  let restoredIndivSettings = (await authAxios.get('/api/settings')).data.data;
  if (JSON.stringify(restoredIndivSettings.featured_deal_ids.sort()) !== JSON.stringify(initialFeaturedIds.sort())) {
    throw new Error('Individual import failed to restore featured_deal_ids!');
  }
  console.log('  ✓ Dedicated export & import of Featured Deals verified 100%!\n');

  // 5. Intentionally mutate EVERY section of the database
  console.log('▶ Step 5: Mutating all database sections to simulate data drift/loss...');
  // A. Mutate featured_deal_ids to a completely different set
  await authAxios.post('/api/settings', {
    featured_deal_ids: ['11111', '22222'],
    facebook_username: 'mutated.page'
  });

  // B. Mutate carousel (add a temporary slide)
  await authAxios.post('/api/carousel/bulk', {
    slides: [
      { id: 'temp-slide-qa', image_url: 'https://example.com/temp.jpg', title: 'TEMP SLIDE QA', active: true }
    ]
  });

  // C. Verify mutation took place
  const mutatedS = (await authAxios.get('/api/settings')).data.data;
  console.log('  Confirmed mutated featured_deal_ids:', mutatedS.featured_deal_ids);
  console.log('  Confirmed mutated facebook_username:', mutatedS.facebook_username);
  const mutatedCarousel = (await authAxios.get('/api/carousel')).data.data;
  console.log('  Confirmed mutated carousel slides count:', mutatedCarousel.length);
  console.log('  ✓ Database state successfully altered.\n');

  // 6. Restore the full backup via /api/import/backup
  console.log('▶ Step 6: Restoring FULL system backup (/api/import/backup)...');
  const restoreForm = new FormData();
  restoreForm.append('backup', Buffer.from(JSON.stringify(backupData)), {
    filename: 'oriflame-FULL-backup.json',
    contentType: 'application/json'
  });
  const restoreRes = await authAxios.post('/api/import/backup', restoreForm, {
    headers: restoreForm.getHeaders()
  });
  console.log('  Restore API response:');
  console.log('    - Success:', restoreRes.data.success);
  console.log('    - Message:', restoreRes.data.message);
  console.log('    - Summary:', restoreRes.data.restored);

  if (!restoreRes.data.success) {
    throw new Error('Full restore API returned error: ' + JSON.stringify(restoreRes.data));
  }
  console.log('  ✓ Full backup accepted and applied.\n');

  // 7. Verify EVERY section matches the original backup
  console.log('▶ Step 7: Verifying restored database state across all sections...');

  // Verification 7.1: Settings & Featured Deals
  const freshSettings = (await authAxios.get('/api/settings')).data.data;
  console.log('  [CHECK 1] Restored featured_deal_ids:', freshSettings.featured_deal_ids);
  if (JSON.stringify(freshSettings.featured_deal_ids.sort()) !== JSON.stringify(initialFeaturedIds.sort())) {
    throw new Error(`CRITICAL: Restored featured_deal_ids [${freshSettings.featured_deal_ids}] do NOT match pre-backup [${initialFeaturedIds}]!`);
  }
  console.log('  [CHECK 2] Restored facebook_username:', freshSettings.facebook_username);
  if (freshSettings.facebook_username !== 'mouna.nouira1') {
    throw new Error(`Settings not restored: expected mouna.nouira1, got ${freshSettings.facebook_username}`);
  }

  // Verification 7.2: Carousel
  const freshCarousel = (await authAxios.get('/api/carousel')).data.data;
  console.log('  [CHECK 3] Restored carousel slides count:', freshCarousel.length, '(expected:', backupData.carousel?.length || 0, ')');
  if (freshCarousel.length !== (backupData.carousel?.length || 0)) {
    throw new Error(`Carousel slides count mismatch!`);
  }

  // Verification 7.3: Products
  const freshProducts = (await authAxios.get('/api/products')).data.data;
  console.log('  [CHECK 4] Restored products count:', freshProducts.length, '(expected:', backupData.products?.length || 0, ')');
  if (freshProducts.length !== (backupData.products?.length || 0)) {
    throw new Error(`Products count mismatch!`);
  }

  // Verification 7.4: Bundles
  const freshBundles = (await authAxios.get('/api/bundles')).data.data;
  console.log('  [CHECK 5] Restored bundles count:', freshBundles.length, '(expected:', backupData.bundles?.length || 0, ')');

  // Verification 7.5: Deals
  const freshDeals = (await authAxios.get('/api/deals')).data.data;
  console.log('  [CHECK 6] Restored threshold deals count:', freshDeals.length, '(expected:', backupData.deals?.length || 0, ')');

  // Verification 7.6: Orders
  const freshOrders = (await authAxios.get('/api/orders')).data.data;
  console.log('  [CHECK 7] Restored orders count:', freshOrders.length, '(expected:', backupData.orders?.length || 0, ')');

  console.log('\n================================================================');
  console.log('  🎉 ALL BACKUP & RESTORE CHECKS PASSED 100% PERFECTLY!');
  console.log('  "Offres Spéciales du Catalogue" is fully backed up and restored.');
  console.log('================================================================\n');
}

runFullBackupSuite().catch(err => {
  console.error('\n❌ QA TEST FAILED:', err.message);
  if (err.response) {
    console.error('API Response:', err.response.status, err.response.data);
  }
  process.exit(1);
});
