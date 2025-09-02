// create a function to populate options in a select input

function populateSelectOptions(selectId, options) {
  const selectElement = document.getElementById(selectId);

  if (!selectElement) return;
  // Clear existing options
  selectElement.innerHTML = '';

  // Add new options
  Object.entries(options).forEach(([value, label]) => {
    const optionElement = document.createElement('option');
    optionElement.value = value;
    optionElement.textContent = label;
    selectElement.appendChild(optionElement);
  });
}

export { populateSelectOptions };
