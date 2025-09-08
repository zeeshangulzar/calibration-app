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

  // Add click handler for Monster Meter card
  const monsterMeterCard = document.getElementById('monster-meter-card');
  if (monsterMeterCard) {
    monsterMeterCard.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.loadMonsterMeter) {
        window.electronAPI.loadMonsterMeter();
      }
    });
  }

  // Add click handler for Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.loadSettings) {
        window.electronAPI.loadSettings();
      }
    });
  }

  // Add click handler for Developer Settings button
  const developerSettingsBtn = document.getElementById('developerSettingsBtn');
  if (developerSettingsBtn) {
    developerSettingsBtn.addEventListener('click', () => {
      window.location.href = '../developer-settings/index.html';
    });
  }
});

window.electronAPI.onShowAppVersion(version => {
  let element = document.getElementById('app-version');
  element.innerHTML = `App version: ${version}`;
});
