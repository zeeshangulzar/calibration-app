let currentStream = null;
let isScanning = true;

/**
 * Check if camera is available and accessible
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function checkCameraAvailability() {
  try {
    // Check if navigator.mediaDevices is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { 
        success: false, 
        error: 'Media devices API not supported' 
      };
    }

    // Try to enumerate devices to check for camera
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    if (videoDevices.length === 0) {
      return { 
        success: false, 
        error: 'No camera device found' 
      };
    }

    // Try to access camera with minimal constraints
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    
    // Immediately stop the stream since we're just checking
    stream.getTracks().forEach(track => track.stop());
    
    return { success: true };
  } catch (error) {
    console.error("---- Camera availability check failed:", error);
    
    let errorMessage = 'Camera access failed';
    if (error.name === 'NotAllowedError') {
      errorMessage = 'Camera permission denied';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No camera device found';
    } else if (error.name === 'NotReadableError') {
      errorMessage = 'Camera is already in use';
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

/**
 * Start the camera and begin scanning for QR codes
 * @param {HTMLVideoElement} videoElement - The video element to show camera feed
 * @param {(qrData: string) => void} onScanCallback - Called when QR is scanned
 * @param {(error: string) => void} onErrorCallback - Called when camera access fails
 */
export function startCamera(videoElement, onScanCallback, onErrorCallback) {
  if (!videoElement || typeof onScanCallback !== 'function') {
    console.error("Invalid video element or callback provided to startCamera");
    if (onErrorCallback) onErrorCallback("Invalid parameters");
    return;
  }

  if (!currentStream) {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        currentStream = stream;
        videoElement.srcObject = stream;
        videoElement.play();

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = 640;
        canvas.height = 480;

        function scanQRCode() {
          if (isScanning) {
            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

            try {
              if (typeof jsQR === 'undefined') {
                console.error("jsQR is not loaded.");
                return;
              }

              const code = jsQR(imageData.data, canvas.width, canvas.height);
              if (code && code.data) {
                console.log("---- QR Code detected:", code.data);
                isScanning = false;
                onScanCallback(code.data);
              }
            } catch (error) {
              console.error("---- Error scanning QR code:", error);
              Sentry.captureException(error);
            }
          }

          requestAnimationFrame(scanQRCode);
        }

        requestAnimationFrame(scanQRCode);
        console.log("---- Camera started successfully with QR scanning");
      })
      .catch((err) => {
        console.error("---- Camera access failed:", err);
        if (typeof Sentry !== 'undefined') {
          Sentry.captureException(err);
        }
  
        let errorMessage = "🚫 No camera found or permission denied. Please connect a camera and reload.";
        if (err.name === 'NotAllowedError') {
          errorMessage = "🚫 Camera permission denied. Please allow camera access and reload.";
        } else if (err.name === 'NotFoundError') {
          errorMessage = "🚫 No camera found. Please connect a camera and reload.";
        } else if (err.name === 'NotReadableError') {
          errorMessage = "🚫 Camera is already in use by another application. Please close other applications and reload.";
        }
        
        if (onErrorCallback) {
          onErrorCallback(errorMessage);
        } else {
          alert(errorMessage);
        }
      });
  }
}

export function pauseScanning() {
  isScanning = false;
}

export function resumeScanning() {
  isScanning = true;
}

export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
}
