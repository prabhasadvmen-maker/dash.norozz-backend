/**
 * Utility functions for Phone Number Standardization across NOROZZ Platform
 */

/**
 * Standardizes any Indian phone number string into a canonical +91 format (+91XXXXXXXXXX)
 * Examples:
 *  - "8726600653"         -> "+918726600653"
 *  - "+918726600653"      -> "+918726600653"
 *  - "+91 8726600653"     -> "+918726600653"
 *  - "918726600653"       -> "+918726600653"
 *  - "08726600653"        -> "+918726600653"
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  const clean = phone.trim();
  if (clean.includes('@')) return clean;

  const digits = clean.replace(/\D/g, '');
  if (!digits) return clean;

  const base10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return `+91${base10}`;
};

/**
 * Extracts raw 10-digit phone number without prefix (e.g. "8726600653")
 */
export const getBase10PhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.trim().replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/**
 * Generates consistent Partner User ID (e.g. "NRZ-P-600653")
 */
export const generatePartnerUserId = (phone) => {
  const base10 = getBase10PhoneNumber(phone);
  const lastDigits = base10.length >= 6 ? base10.slice(-6) : Math.floor(100000 + Math.random() * 900000).toString();
  return `NRZ-P-${lastDigits}`;
};
