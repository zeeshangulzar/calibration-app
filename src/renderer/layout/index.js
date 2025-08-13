document.addEventListener("DOMContentLoaded", () => {
  // Setup app version display

  // Add click handler for Smart Monster card
  console.log("IN INDEX>JSSSSS");
  const smartMonsterCard = document.getElementById("smart-monster-card");
  console.log(smartMonsterCard);
  if (smartMonsterCard) {
    smartMonsterCard.addEventListener("click", () => {
      if (window.electronAPI && window.electronAPI.loadKrakenList) {
        window.electronAPI.loadKrakenList();
      }
    });
  } else {
    // Fallback: find by text content
    const smartMonsterByText = Array.from(document.querySelectorAll('h3')).find(h3 => h3.textContent === 'Smart Monster');
    if (smartMonsterByText) {
      const parentCard = smartMonsterByText.closest('.calibration-card');
      if (parentCard) {
        parentCard.addEventListener("click", () => {
          if (window.electronAPI && window.electronAPI.loadKrakenList) {
            window.electronAPI.loadKrakenList();
          }
        });
      }
    }
  }
});

window.electronAPI.onShowAppVersion((version) => {
  let element = document.getElementById("app-version");
  element.innerHTML = `App version: ${version}`;
});
