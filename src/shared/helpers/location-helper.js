import { exec } from 'child_process';

class LocationService {
  constructor() {
    this.lastKnownLocation = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.fetchLocationData();
      this.isInitialized = true;
    } catch (error) {
      console.warn('Failed to initialize location service:', error.message);
      // Set fallback data even if initialization fails
      this.setFallbackLocation();
      this.isInitialized = true;
    }
  }

  async getLocation() {
    // If not initialized, initialize first
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Return cached data (no expiry - stays in memory until app closes)
    if (this.lastKnownLocation) {
      return this.lastKnownLocation;
    }

    // If no cached data, fetch it
    await this.fetchLocationData();
    return this.lastKnownLocation;
  }

  async fetchLocationData() {
    try {
      // Get location details from ipinfo.io (automatically detects current IP)
      const response = await fetch('https://ipinfo.io/json');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      this.lastKnownLocation = {
        city: data.city || 'Unknown',
        country: data.country || 'Unknown',
        ip: data.ip || 'Unknown',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn('Failed to get location from ipinfo.io:', error.message);
      this.setFallbackLocation();
    }
  }

  setFallbackLocation() {
    this.lastKnownLocation = {
      city: 'Unknown',
      country: 'Unknown',
      ip: 'Unknown',
      timestamp: Date.now(),
    };
  }

  isInitialized() {
    return this.isInitialized;
  }
}

// Export singleton instance
const locationService = new LocationService();
export function getLocationService() {
  return locationService;
}
