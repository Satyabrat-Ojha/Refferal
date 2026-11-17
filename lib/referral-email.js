export function canEditReferralEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@juspay\.in$/i.test(email.trim());
}
