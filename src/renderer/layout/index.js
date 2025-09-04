document.addEventListener('DOMContentLoaded', () => {
  // Setup app version display
  
  // Check and display migration status
  checkMigrationStatus();

  // Add click handler for Smart Monster card
  const smartMonsterCard = document.getElementById('smart-monster-card');
  if (smartMonsterCard) {
    smartMonsterCard.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.loadKrakenList) {
        window.electronAPI.loadKrakenList();
      }
    });
  }

  // Add click handler for Assembly Sensor card
  const assemblySensorCard = document.getElementById('assembly-sensor-card');
  if (assemblySensorCard) {
    assemblySensorCard.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.assemblySensors) {
        window.electronAPI.assemblySensors();
      }
    });
  }

  // Add click handler for Settings button
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (window.electronAPI && window.electronAPI.loadSettings) {
        window.electronAPI.loadSettings();
      }
    });
  }
});

window.electronAPI.onShowAppVersion(version => {
  let element = document.getElementById('app-version');
  element.innerHTML = `App version: ${version}`;
});

/**
 * Check and display migration status (development only)
 */
async function checkMigrationStatus() {
  try {
    if (window.electronAPI && window.electronAPI.getMigrationStatus) {
      const result = await window.electronAPI.getMigrationStatus();
      
      // Only show migration status in development mode
      if (!result.success || !result.isDevelopment) {
        return;
      }
      
      if (result.status) {
        const { currentVersion, appliedCount, pendingCount, totalMigrations } = result.status;
        
        const migrationBanner = document.getElementById('migration-status');
        const migrationText = document.getElementById('migration-status-text');
        
        if (pendingCount > 0) {
          // Show pending migrations
          migrationText.textContent = `Database update available: ${pendingCount} new migration(s) pending`;
          migrationBanner.classList.remove('hidden');
          migrationBanner.classList.add('bg-yellow-50', 'border-yellow-200', 'text-yellow-800');
        } else if (appliedCount > 0) {
          // Show current status
          migrationText.textContent = `Database up to date (Version ${currentVersion}, ${appliedCount}/${totalMigrations} migrations applied)`;
          migrationBanner.classList.remove('hidden');
          migrationBanner.classList.add('bg-green-50', 'border-green-200', 'text-green-800');
        }
      }
    }
  } catch (error) {
    console.error('Failed to check migration status:', error);
    Sentry.captureException(error);
  }
}
