/**
 * View Helper Functions
 * Reusable utility functions for DOM manipulation and UI interactions
 */

/**
 * Generic function to enable/disable HTML elements
 * @param {HTMLElement} element - The HTML element to modify
 * @param {boolean} disabled - Whether to disable the element
 * @param {string} className - Optional custom CSS class to apply
 */
export function setElementState(element, disabled, className = '') {
  if (!element) return;

  element.disabled = disabled;

  if (disabled) {
    element.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    element.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  if (className) {
    element.className = className;
  }
}

/**
 * Populate a select dropdown with options
 * @param {string} selectId - The ID of the select element
 * @param {Object} options - Object containing key-value pairs for options
 * @param {string} placeholder - Optional placeholder text for the first option
 */
export function populateSelectOptions(selectId, options, placeholder = 'Select an option') {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) {
    console.warn(`Select element with ID '${selectId}' not found`);
    return;
  }

  // Clear existing options except the first one
  selectElement.innerHTML = `<option value="">${placeholder}</option>`;

  // Add options from the provided object
  Object.entries(options).forEach(([key, value]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}
