import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function diagnose() {
  console.log('=== DIAGNOSTIC SAUVEGARDE GLOBALE & OFFRES SPÉCIALES ===\n');

  // 1. Login admin
  const loginRes = await axios.post(`${BASE_URL}/api/admin/login`, { password: 'mouna2024' });
  const token = loginRes.data.token;
  console.log('Admin loggé, token obtenu.');

  const authAxios = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-admin-token': token }
  });

  // 2. Fetch current settings from API
  const settingsRes = await authAxios.get('/api/settings');
  console.log('Current API settings.featured_deal_ids:', settingsRes.data.data?.featured_deal_ids);

  // 3. Check data/settings.json on disk
  const diskSettingsPath = path.join(process.cwd(), 'data', 'settings.json');
  if (fs.existsSync(diskSettingsPath)) {
    const diskSettings = JSON.parse(fs.readFileSync(diskSettingsPath, 'utf8'));
    console.log('data/settings.json on disk featured_deal_ids:', diskSettings.featured_deal_ids);
  }

  // 4. Download backup from /api/export/backup
  const backupRes = await authAxios.get('/api/export/backup');
  const backup = backupRes.data;
  console.log('\nBackup Exported Structure:');
  console.log('  Top-level keys:', Object.keys(backup));
  console.log('  backup.settings.featured_deal_ids:', backup.settings?.featured_deal_ids);
  console.log('  Does backup have top-level featured_deal_ids?', 'featured_deal_ids' in backup);
  console.log('  Does backup have top-level featured_deals?', 'featured_deals' in backup);
  console.log('  backup.deals count (threshold deals):', backup.deals?.length);
  console.log('  backup.products count:', backup.products?.length);
  console.log('  backup.carousel count:', backup.carousel?.length);
  console.log('  backup.bundles count:', backup.bundles?.length);
  console.log('  backup.orders count:', backup.orders?.length);

  // 5. Test changing featured_deals to test ids: ['47724', '47844']
  console.log('\n--- Test: Set featured_deal_ids to [47724, 47844] ---');
  await authAxios.post('/api/settings', { featured_deal_ids: ['47724', '47844'] });
  const updatedSettings = (await authAxios.get('/api/settings')).data.data;
  console.log('After update, API featured_deal_ids:', updatedSettings.featured_deal_ids);

  // Check disk after update
  if (fs.existsSync(diskSettingsPath)) {
    const diskAfter = JSON.parse(fs.readFileSync(diskSettingsPath, 'utf8'));
    console.log('After update, data/settings.json on disk:', diskAfter.featured_deal_ids);
  }

  // 6. Now create a backup with [47724, 47844]
  const backup2 = (await authAxios.get('/api/export/backup')).data;

  // 7. Now change settings to something else: ['12760']
  console.log('\n--- Change featured_deal_ids to [12760] ---');
  await authAxios.post('/api/settings', { featured_deal_ids: ['12760'] });
  console.log('Settings changed to [12760]');

  // 8. Now restore from backup2 (which has [47724, 47844])
  console.log('\n--- Restoring from backup2 (which had [47724, 47844]) ---');
  const restoreRes = await authAxios.post('/api/import/backup', { data: backup2 });
  console.log('Restore Response:', restoreRes.data);

  // 9. Now check what /api/settings returns!
  const afterRestoreRes = await authAxios.get('/api/settings');
  console.log('AFTER RESTORE: /api/settings featured_deal_ids:', afterRestoreRes.data.data?.featured_deal_ids);

  if (fs.existsSync(diskSettingsPath)) {
    const diskAfterRestore = JSON.parse(fs.readFileSync(diskSettingsPath, 'utf8'));
    console.log('AFTER RESTORE: data/settings.json featured_deal_ids:', diskAfterRestore.featured_deal_ids);
  }
}

diagnose().catch(console.error);
