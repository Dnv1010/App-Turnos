import webpush from "web-push";

let configured = false;

export function ensureWebPushConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const contact = process.env.VAPID_CONTACT_EMAIL?.startsWith("mailto:")
    ? process.env.VAPID_CONTACT_EMAIL
    : `mailto:${process.env.VAPID_CONTACT_EMAIL || "noreply@bia.app"}`;
  webpush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
  return true;
}

export { webpush };
