document.addEventListener('DOMContentLoaded', () => {
  // Setup app version display

  // Add click handler for Smart Monster card
  const smartMonsterCard = document.getElementById('smart-monster-card');
  if (smartMonsterCard) {
    smartMonsterCard.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.loadKrakenList) {
        window.electronAPI.loadKrakenList();
      }
    });
  }
});

window.electronAPI.onShowAppVersion(version => {
  let element = document.getElementById('app-version');
  element.innerHTML = `App version: ${version}`;
});
