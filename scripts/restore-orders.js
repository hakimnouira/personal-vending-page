#!/usr/bin/env node
/**
 * Script de Restauration Dédié de la Base COMMANDES
 * 
 * Utilisation :
 *   node scripts/restore-orders.js [chemin/vers/sauvegarde.json]
 * 
 * Exemples :
 *   node scripts/restore-orders.js data/orders.json
 *   node scripts/restore-orders.js backups/oriflame_orders_2026-09-12.json
 *   node scripts/restore-orders.js backups/oriflame-FULL-backup-2026-09-12.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveOrders } from '../dataAccess.js';
import { pool } from '../db.js';

async function runOrdersRestore() {
  const filePathArg = process.argv[2];

  if (!filePathArg) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║        RESTAURATION DÉDIÉE DE LA BASE COMMANDES ORIFLAME             ║
╚══════════════════════════════════════════════════════════════════════╝

Usage : node scripts/restore-orders.js <chemin_du_fichier_json>

Exemples :
  node scripts/restore-orders.js data/orders.json
  node scripts/restore-orders.js my-orders-backup.json
`);
    process.exit(1);
  }

  const resolvedPath = path.isAbsolute(filePathArg)
    ? filePathArg
    : path.join(process.cwd(), filePathArg);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Fichier introuvable : ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`\n⏳ Lecture du fichier de sauvegarde : ${resolvedPath}`);
  let raw = '';
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    console.error(`❌ Erreur lors de la lecture du fichier :`, err.message);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Le fichier n'est pas un JSON valide :`, err.message);
    process.exit(1);
  }

  let ordersList = [];
  if (Array.isArray(parsed)) {
    ordersList = parsed;
  } else if (parsed && Array.isArray(parsed.orders)) {
    ordersList = parsed.orders;
  } else if (parsed && Array.isArray(parsed.data)) {
    ordersList = parsed.data;
  } else if (parsed && typeof parsed === 'object' && (parsed.order_id || parsed.order_number)) {
    ordersList = [parsed];
  } else {
    console.error(`❌ Aucune commande trouvée dans ce fichier.`);
    process.exit(1);
  }

  console.log(`📋 ${ordersList.length} commande(s) détectée(s). Normalisation en cours...`);

  const normalized = ordersList.map((o, idx) => {
    const orderId = String(o.order_id || o.order_number || o.id || `ORD-${Date.now()}-${idx}`).trim();
    const orderNumber = String(o.order_number || o.order_id || o.id || orderId).trim();
    const customerName = String(o.customer_name || o.name || 'Client Anonyme').trim();
    const customerPhone = String(o.customer_phone || o.phone || '').trim();
    const deliveryArea = String(o.delivery_area || o.city || '').trim();
    const deliveryAddress = String(o.delivery_address || o.customer_address || o.address || '').trim();
    const customerNote = String(o.customer_note || o.notes || o.note || '').trim();
    const consentGiven = Boolean(o.consent_given !== false);
    const channel = String(o.channel || 'direct_site').trim();

    const rawItems = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items || '[]') : []);
    const items = rawItems.map(item => ({
      product_id: String(item.product_id || item.product_reference || item.id || '').trim(),
      product_reference: String(item.product_reference || item.product_id || '').trim(),
      name: item.name || item.product_name || 'Article',
      product_name: item.product_name || item.name || 'Article',
      price: item.price != null ? Number(item.price) : (item.unit_price != null ? Number(item.unit_price) : 0),
      unit_price: item.unit_price != null ? Number(item.unit_price) : (item.price != null ? Number(item.price) : 0),
      quantity: item.quantity != null ? Math.max(1, parseInt(item.quantity, 10)) : 1,
      line_total: item.line_total != null ? Number(item.line_total) : ((item.price || 0) * (item.quantity || 1)),
      image_url: item.image_url || ''
    }));

    const subtotal = o.subtotal != null ? Number(o.subtotal) : items.reduce((s, i) => s + (i.line_total || 0), 0);
    const discount = o.discount != null ? Number(o.discount) : 0;
    const taxesAmount = o.taxes_amount != null ? Number(o.taxes_amount) : Number((subtotal * 0.03).toFixed(3));
    const shippingFee = o.shipping_fee != null ? Number(o.shipping_fee) : 9.755;
    const totalAmount = o.total_amount != null ? Number(o.total_amount) : (o.total != null ? Number(o.total) : (subtotal + taxesAmount + shippingFee));

    return {
      id: orderId,
      order_id: orderId,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      delivery_area: deliveryArea,
      city: deliveryArea,
      delivery_address: deliveryAddress,
      customer_address: deliveryAddress,
      customer_note: customerNote,
      consent_given: consentGiven,
      channel: channel,
      notes: customerNote,
      items: items,
      subtotal: subtotal,
      discount: discount,
      taxes_amount: taxesAmount,
      shipping_fee: shippingFee,
      shipping_and_taxes: o.shipping_and_taxes != null ? Number(o.shipping_and_taxes) : Number((taxesAmount + shippingFee).toFixed(3)),
      total_amount: totalAmount,
      total: totalAmount,
      currency: o.currency || 'TND',
      status: o.status || 'nouvelle',
      notification_status: o.notification_status || 'pending',
      delivery_estimate: o.delivery_estimate || '2 à 3 jours ouvrables',
      payment_method: o.payment_method || 'Paiement à la livraison',
      created_at: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString()
    };
  });

  console.log(`💾 Écriture dans la base PostgreSQL et sauvegarde locale data/orders.json...`);
  await saveOrders(normalized);

  console.log(`\n✅ RESTAURATION TERMINÉE AVEC SUCCÈS !`);
  console.log(`──────────────────────────────────────────────────────────`);
  console.log(`• Nombre de commandes restaurées : ${normalized.length}`);
  if (normalized.length > 0) {
    const totalRevenue = normalized.reduce((acc, o) => acc + (o.total_amount || 0), 0);
    console.log(`• Chiffre d'affaires cumulé      : ${totalRevenue.toFixed(3)} TND`);
    console.log(`• Exemple de commande restaurée  :`);
    console.log(`  - N° Commande : ${normalized[0].order_number}`);
    console.log(`  - Client      : ${normalized[0].customer_name} (${normalized[0].customer_phone})`);
    console.log(`  - Lieu        : ${normalized[0].delivery_area} - ${normalized[0].delivery_address}`);
    console.log(`  - Statut      : ${normalized[0].status}`);
    console.log(`  - Articles    : ${normalized[0].items.length} article(s)`);
    console.log(`  - Total       : ${normalized[0].total_amount.toFixed(3)} TND`);
  }
  console.log(`──────────────────────────────────────────────────────────\n`);

  try {
    await pool.end();
  } catch (_) {}

  process.exit(0);
}

runOrdersRestore().catch(err => {
  console.error('❌ Erreur inattendue durant la restauration :', err);
  process.exit(1);
});
