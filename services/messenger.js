// Facebook Messenger Send API Service
// Sends automatic order confirmation messages from Mounanouira.Oriflame page to clients

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Send an order confirmation message to a client via Messenger.
 * @param {string} psid - The client's Page-Scoped ID (received via Send to Messenger opt-in)
 * @param {object} order - The order object from orders.json
 * @param {string} pageAccessToken - The Facebook Page Access Token
 */
export async function sendOrderConfirmation(psid, order, pageAccessToken) {
  const itemsList = order.items
    .map(i => `• ${i.name} (x${i.quantity}) — ${(i.price * i.quantity).toFixed(2)} ${order.currency}`)
    .join('\n');

  const message =
    `🛍️ Bonjour ${order.customer_name !== 'Client Anonyme' ? order.customer_name.split(' ')[0] : ''} !\n\n` +
    `Voici votre commande Oriflame :\n\n` +
    `${itemsList}\n\n` +
    `💰 Total : ${order.total_amount.toFixed(2)} ${order.currency}\n\n` +
    `Confirmez-vous cette commande ? Répondez OUI pour confirmer ou NON pour annuler. 🌸\n\n` +
    `— Mouna Nouira, Oriflame Sweden`;

  const body = {
    recipient: { id: psid },
    message: { text: message },
    messaging_type: 'RESPONSE',
  };

  const url = `${GRAPH_API_BASE}/me/messages?access_token=${pageAccessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message || `Graph API error: ${response.status}`
    );
  }

  return data;
}

/**
 * Send a generic text message to a client via Messenger.
 * @param {string} psid
 * @param {string} text
 * @param {string} pageAccessToken
 */
export async function sendTextMessage(psid, text, pageAccessToken) {
  const body = {
    recipient: { id: psid },
    message: { text },
    messaging_type: 'RESPONSE',
  };

  const url = `${GRAPH_API_BASE}/me/messages?access_token=${pageAccessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Graph API error: ${response.status}`);
  }
  return data;
}
