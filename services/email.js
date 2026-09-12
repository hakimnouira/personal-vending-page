// Email Notification Service for Oriflame Customer Orders
// Supports:
// 1. Native SMTP (e.g. Gmail with App Password, Outlook, OVH, or custom SMTP)
// 2. Resend API (if RESEND_API_KEY is configured)
// 3. Graceful fallback logging when SMTP credentials are not yet configured

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
  }

  return transporter;
}

/**
 * Send an email notification when a customer submits an order (Messenger, WhatsApp, or Phone).
 * @param {object} order - The order object
 * @param {string} recipientEmail - Email address configured in Admin Settings
 */
export async function sendOrderNotificationEmail(order, recipientEmail) {
  const targetEmail = (recipientEmail || process.env.ADMIN_NOTIFICATION_EMAIL || '').trim();
  if (!targetEmail || !targetEmail.includes('@')) {
    console.log(`[Email] Aucune adresse email valide configurée pour la notification (${targetEmail}). Envoi ignoré.`);
    return { success: false, reason: 'no_email_configured' };
  }

  const channelLabel = order.channel === 'whatsapp' || order.channel === 'phone'
    ? '📞 WhatsApp / Téléphone'
    : '💬 Facebook Messenger';

  const itemsHtml = (order.items || [])
    .map(i => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 10px; font-size: 14px; color: #1F2937;">
          <strong>${escapeHtml(i.name)}</strong>
          <div style="font-size: 12px; color: #6B7280;">Réf: ${escapeHtml(i.product_id)}</div>
        </td>
        <td style="padding: 10px; text-align: center; font-size: 14px; color: #1F2937;">${i.quantity}</td>
        <td style="padding: 10px; text-align: right; font-size: 14px; font-weight: 600; color: #1F2937;">
          ${(Number(i.price) * Number(i.quantity)).toFixed(2)} ${order.currency || 'TND'}
        </td>
      </tr>
    `).join('');

  const subject = `🛍️ Nouvelle Commande Oriflame : ${order.order_id} (${Number(order.total_amount).toFixed(2)} ${order.currency || 'TND'})`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #18181B 0%, #27272A 100%); padding: 24px; color: #FFFFFF; text-align: center; border-bottom: 3px solid #C5A880;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #C5A880; letter-spacing: 0.5px;">Mouna Nouira — Oriflame</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #D4D4D8; text-transform: uppercase; letter-spacing: 1px;">Nouvelle Commande Reçue</p>
        </div>

        <!-- Body -->
        <div style="padding: 24px;">
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 800; color: #166534; margin-bottom: 4px;">
              Commande ${escapeHtml(order.order_id)}
            </div>
            <div style="font-size: 13px; color: #15803D;">
              Canal sélectionné par la cliente : <strong>${channelLabel}</strong>
            </div>
          </div>

          <!-- Customer info -->
          <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin: 0 0 10px 0; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px;">
            👤 Informations Cliente
          </h3>
          <table style="width: 100%; margin-bottom: 22px; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0; color: #6B7280; width: 140px;">Nom de la cliente :</td>
              <td style="padding: 4px 0; font-weight: 700; color: #111827;">${escapeHtml(order.customer_name || 'Non renseigné')}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280;">Téléphone / WhatsApp :</td>
              <td style="padding: 4px 0; font-weight: 700; color: #059669;">
                <a href="tel:${escapeHtml(order.customer_phone)}" style="color: #059669; text-decoration: none;">${escapeHtml(order.customer_phone || 'Non renseigné')}</a>
              </td>
            </tr>
            ${order.customer_address && order.customer_address !== 'Non renseignée' ? `
            <tr>
              <td style="padding: 4px 0; color: #6B7280;">Adresse de livraison :</td>
              <td style="padding: 4px 0; font-weight: 700; color: #111827;">${escapeHtml(order.customer_address)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 4px 0; color: #6B7280;">Délai de livraison :</td>
              <td style="padding: 4px 0; font-weight: 600; color: #047857;">🚚 2 à 3 jours ouvrables (Paiement à la livraison)</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280;">Date & Heure :</td>
              <td style="padding: 4px 0; color: #374151;">${new Date(order.created_at || Date.now()).toLocaleString('fr-FR')}</td>
            </tr>
          </table>

          <!-- Items list -->
          <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin: 0 0 10px 0; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px;">
            🛍️ Détails des Articles
          </h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB;">
                <th style="padding: 8px 10px; text-align: left; font-size: 12px; color: #6B7280; text-transform: uppercase;">Article</th>
                <th style="padding: 8px 10px; text-align: center; font-size: 12px; color: #6B7280; text-transform: uppercase;">Qté</th>
                <th style="padding: 8px 10px; text-align: right; font-size: 12px; color: #6B7280; text-transform: uppercase;">Prix</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Total Breakdown -->
          <div style="background: #FAF8F5; border: 1.5px solid #C5A880; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #6B7280; margin-bottom: 6px;">
              <span>Sous-total articles :</span>
              <span style="font-weight: 600; color: #18181B;">${Number(order.subtotal || 0).toFixed(2)} ${order.currency || 'TND'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #6B7280; margin-bottom: 6px;">
              <span>Taxes estimées (3%) :</span>
              <span style="font-weight: 600; color: #7C3AED;">+${Number(order.taxes_amount || (Number(order.subtotal || 0) * 0.03)).toFixed(3)} ${order.currency || 'TND'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #6B7280; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #E5E7EB;">
              <span>Frais de livraison :</span>
              <span style="font-weight: 600; color: #047857;">+9.755 ${order.currency || 'TND'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 15px; font-weight: 700; color: #18181B;">TOTAL AVEC LIVRAISON &amp; TAXES :</span>
              <span style="font-size: 20px; font-weight: 800; color: #059669;">
                ${Number(order.total_amount).toFixed(3)} ${order.currency || 'TND'}
              </span>
            </div>
          </div>

          <!-- Note -->
          <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin: 0;">
            Ce message vous est envoyé automatiquement par votre boutique en ligne Oriflame dès qu'une cliente clique sur Commander via Messenger ou WhatsApp.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Try sending via configured SMTP
  const smtp = getTransporter();
  if (smtp) {
    try {
      const fromUser = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@oriflame-assistant.com';
      const info = await smtp.sendMail({
        from: `"Boutique Oriflame" <${fromUser}>`,
        to: targetEmail,
        subject,
        html: htmlContent
      });
      console.log(`[Email] ✅ Notification envoyée à ${targetEmail} (Message ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[Email] ❌ Échec envoi via SMTP:', err.message);
    }
  }

  // 2. Try sending via Resend API if RESEND_API_KEY is defined
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Oriflame Assistant <onboarding@resend.dev>',
          to: [targetEmail],
          subject,
          html: htmlContent
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[Email] ✅ Notification envoyée via Resend à ${targetEmail} (ID: ${data.id})`);
        return { success: true, messageId: data.id };
      } else {
        console.warn('[Email] ❌ Erreur Resend API:', data);
        const errDetail = data?.message || 'Erreur Resend API';
        return { success: false, reason: 'resend_error', error: `Resend API: ${errDetail}` };
      }
    } catch (err) {
      console.error('[Email] ❌ Erreur réseau Resend:', err.message);
      return { success: false, reason: 'resend_network_error', error: `Erreur réseau Resend: ${err.message}` };
    }
  }

  // Fallback: log notification preview to console if credentials not configured yet
  console.log(`[Email Notice] Nouvelle commande pour ${targetEmail} : ${order.order_id} (${Number(order.total_amount).toFixed(2)} ${order.currency || 'TND'})`);
  return { success: false, reason: 'smtp_not_configured' };
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
