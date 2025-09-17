/**
 * Formats a date string to a localized string
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted date string or empty string if invalid
 */
function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Formats a date to a short date string (MM/DD/YYYY)
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted short date string or empty string if invalid
 */
function formatShortDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Formats a date to a time string (HH:MM:SS)
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted time string or empty string if invalid
 */
function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString();
}

export { formatDateTime, formatShortDate, formatTime };
