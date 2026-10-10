/**
 * Expiry Notifications Engine
 * Formats and generates SMS and WhatsApp alert messages for account holders
 * regarding near-expiry or expired inventory batches.
 */

/**
 * Normalizes phone number to international format (digits only).
 * If a 10-digit number is provided, automatically prepends the 91 country code.
 */
export function formatPhoneNumber(phone = '') {
  let cleaned = String(phone || '').replace(/[^0-9+]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  // If 10 digits (e.g. 9876543210), prepend 91 (India)
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned
  }
  return cleaned
}

/**
 * Generates an itemized, formatted WhatsApp alert message.
 */
export function buildWhatsAppExpiryMessage({
  shopName = 'My Store',
  accountHolderName = 'Account Holder',
  items = [],
}) {
  const count = items.length
  const totalUnits = items.reduce((s, it) => s + (Number(it.qty) || 0), 0)

  let text = `⚠️ *STOCKFLOW INVENTORY EXPIRY ALERT*\n`
  text += `🏢 *Store*: ${shopName}\n`
  text += `👤 *To*: ${accountHolderName}\n\n`
  text += `Attention: *${count} product batch${count > 1 ? 'es' : ''}* (${totalUnits} total units) are nearing expiry or expired:\n\n`

  items.slice(0, 10).forEach((it, idx) => {
    const name = it.product?.productName || it.productName || it.sku
    const exp = it.expiryDate || 'N/A'
    const daysLabel =
      it.days !== null && it.days !== undefined
        ? it.days < 0
          ? `EXPIRED ${Math.abs(it.days)}d ago`
          : it.days === 0
          ? 'Expires TODAY'
          : `${it.days} days left`
        : 'Near Expiry'
    const action = it.actionRecommendation || (it.days < 0 ? 'Dispose / Write-off' : 'Flash Clearance')

    text += `${idx + 1}. *${name}*\n`
    text += `   • Batch: ${it.batchNo || 'DEFAULT'}\n`
    text += `   • Expiry: ${exp} (${daysLabel})\n`
    text += `   • Qty: ${it.qty} units\n`
    text += `   • Action: ${action}\n\n`
  })

  if (items.length > 10) {
    text += `...and ${items.length - 10} more batch(es) at risk.\n\n`
  }

  text += `💡 *Action Required*: Please log in to StockFlow to initiate FEFO clearance or apply flash discounts to prevent stock loss.\n\n`
  text += `_Sent via StockFlow Inventory Management System._`

  return text
}

/**
 * Generates a concise SMS message optimized for SMS character limits.
 */
export function buildSmsExpiryMessage({
  shopName = 'My Store',
  items = [],
}) {
  const count = items.length
  const totalUnits = items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  const topNames = items.slice(0, 2).map((it) => it.product?.productName || it.productName || it.sku).join(', ')
  const more = count > 2 ? ` +${count - 2} more` : ''

  return `[StockFlow Alert] ${shopName}: ${count} batches (${totalUnits} units) expiring soon (${topNames}${more}). Please review FEFO clearance in StockFlow.`
}

/**
 * Generates the WhatsApp Click-to-Chat URL.
 */
export function getWhatsAppUrl(phone, message) {
  const cleanPhone = formatPhoneNumber(phone)
  const encoded = encodeURIComponent(message)
  return cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`
}

/**
 * Generates the native SMS URI.
 */
export function getSmsUrl(phone, message) {
  const cleanPhone = formatPhoneNumber(phone)
  const encoded = encodeURIComponent(message)
  return cleanPhone ? `sms:${cleanPhone}?body=${encoded}` : `sms:?body=${encoded}`
}
