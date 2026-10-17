/**
 * The LevelUp support WhatsApp line (also printed in the payment receipt
 * email). One home for the number so the checkout, the floating help bubble
 * and the footer cannot drift apart.
 */
export const SUPPORT_WHATSAPP_PHONE = "919791520177";

/** api.whatsapp.com deep link with a prefilled message. */
export function supportWhatsAppLink(text: string): string {
  return `https://api.whatsapp.com/send?phone=${SUPPORT_WHATSAPP_PHONE}&text=${encodeURIComponent(text)}`;
}
