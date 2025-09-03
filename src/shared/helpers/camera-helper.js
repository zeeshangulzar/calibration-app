let currentStream = null;
let isScanning = true;

/**
 * Start the camera and begin scanning for QR codes
 * @param {HTMLVideoElement} videoElement - The video element to show camera feed
 * @param {(qrData: string) => void} onScanCallback - Called when QR is scanned
 */
export function startCamera(videoElement, onScanCallback) {
  if (!videoElement || typeof onScanCallback !== 'function') {
    console.error("Invalid video element or callback provided to startCamera");
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
            }
          }

          requestAnimationFrame(scanQRCode);
        }

        requestAnimationFrame(scanQRCode);
        console.log("---- Camera started successfully with QR scanning");
      })
      .catch((err) => {
        console.error("---- Camera access failed:", err);
        alert("🚫 Camera access denied or not found.");
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
