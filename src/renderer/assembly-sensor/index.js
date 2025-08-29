import { formatDateTime } from "../../shared/helpers/index.js";

let currentStream = null;
let isScanning = true;
let currentPage = 1;
const pageSize = 20;

document.addEventListener("DOMContentLoaded", () => {
  // Check if jsQR library is loaded
  if (typeof jsQR === 'undefined') {
    console.error('jsQR library not loaded! QR scanning will not work.');
    showCustomAlert("---- QR scanning library not loaded. Please check if jsQR.min.js is available.");
  } else {
    console.log('jsQR library loaded successfully:', jsQR);
  }

  document
    .getElementById("back-button-assembly")
    .addEventListener("click", () => {
      if (window.electronAPI && window.electronAPI.loadHomeScreen) {
        window.electronAPI.loadHomeScreen();
      }
    });

  document
    .getElementById("saveAssembly")
    .addEventListener("click", async () => {
      const bodyQR = document.getElementById("bodyQR").value.trim();
      const capQR = document.getElementById("capQR").value.trim();

      if (!bodyQR && !capQR) {
        showCustomAlert("Please scan both Body QR and Cap QR.");
        return;
      } else if (!bodyQR) {
        showCustomAlert("Please scan Body QR code first.");
        return;
      } else if (!capQR) {
        showCustomAlert("Please scan Cap QR code first.");
        return;
      }

      // Save the assembly
      if (window.electronAPI && window.electronAPI.saveAssembledSensor) {
        window.electronAPI.saveAssembledSensor({ bodyQR, capQR });
      }
    });

  document.getElementById("resetAssembly").addEventListener("click", () => {
    resetAssemblyForm();
  });

  document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      fetchAssembledSensors();
    }
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    currentPage++;
    fetchAssembledSensors();
  });

  fetchAssembledSensors();
  startCamera();
});

function fetchAssembledSensors() {
  if (window.electronAPI && window.electronAPI.getAssembledSensors) {
    window.electronAPI
      .getAssembledSensors({ page: currentPage, size: pageSize })
      .then((data) => {
        const totalPages = Math.ceil(data.totalCount / pageSize);

        // ---- adjust currentPage if it's now out of bounds
        if (currentPage > totalPages && totalPages > 0) {
          currentPage = totalPages;
          fetchAssembledSensors(); // recall with adjusted page
          return;
        }

        renderAssembledList(data.rows);

        const prevBtn = document.getElementById("prevPage");
        const nextBtn = document.getElementById("nextPage");
        const pageNumbers = document.getElementById("pageNumbers");

        if (data.totalCount === 0) {
          prevBtn.classList.add("hidden");
          nextBtn.classList.add("hidden");
          pageNumbers.classList.add("hidden");
          return;
        } else {
          prevBtn.classList.remove("hidden");
          nextBtn.classList.remove("hidden");
          pageNumbers.classList.remove("hidden");
        }

        prevBtn.disabled = currentPage === 1;
        prevBtn.classList.toggle("opacity-50", prevBtn.disabled);
        prevBtn.classList.toggle("cursor-not-allowed", prevBtn.disabled);

        nextBtn.disabled = currentPage === totalPages;
        nextBtn.classList.toggle("opacity-50", nextBtn.disabled);
        nextBtn.classList.toggle("cursor-not-allowed", nextBtn.disabled);

        renderPageNumbers(totalPages);
      });
  }
}

function renderAssembledList(list) {
  const tbody = document.getElementById("assembledList");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-neutral-500">No assembled sensors yet.</td>
      </tr>
    `;
    return;
  }

  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", item.id);
    tr.innerHTML = `
      <td class="py-2 px-2 text-left">${item.id}</td>
      <td class="py-2 px-2 text-left">${item.bodyQR}</td>
      <td class="py-2 px-2 text-left">${item.capQR}</td>
      <td class="py-2 px-2 text-left">${formatDateTime(item.created_at)}</td>
      <td class="py-2 px-2 text-left">${
        item.updated_at
          ? formatDateTime(item.updated_at)
          : formatDateTime(item.created_at)
      }</td>
      <td class="py-2 px-2 text-left space-x-2">
        <button
          class="rounded-md bg-red-600 hover:bg-red-700 px-4 py-1 text-white text-sm"
          onclick="deleteSensor(${item.id})"
        >Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function startCamera() {
  const video = document.getElementById("video");

  if (!currentStream) {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        currentStream = stream;
        video.srcObject = stream;
        video.play();

        // Create canvas for QR scanning
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = 640;
        canvas.height = 480;

        function scanQRCode() {
          if (isScanning) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            
            try {
              // Check if jsQR is available
              if (typeof jsQR === 'undefined') {
                console.error('---- jsQR library not loaded!');
                return;
              }
              
              const code = jsQR(imageData.data, canvas.width, canvas.height);
              
              if (code && code.data) {
                console.log("---- QR Code detected:", code.data);
                isScanning = false;
                handleScannedQR(code.data);
              }
            } catch (error) {
              console.error("---- Error scanning QR code:", error);
              // Continue scanning even if there's an error
            }
          }
          requestAnimationFrame(scanQRCode);
        }

        requestAnimationFrame(scanQRCode);
        console.log("---- Camera started successfully with QR scanning");
      })
      .catch((err) => {
        console.error("---- Camera access failed:", err);
        showCustomAlert(
          "🚫 No camera found or permission denied. Please connect a camera and reload."
        );
      });
  }
}

async function handleScannedQR(qrValue) {
  const bodyQRField = document.getElementById("bodyQR");
  const capQRField = document.getElementById("capQR");

  const capPattern = /^(\d{2})-(\d{2})-(\d{4})$/; // 25-28-0030
  const bodyPattern = /^\d{6}$/; // 000003

  let targetField = null;

  // Pause scanning immediately
  isScanning = false;

  if (capPattern.test(qrValue)) {
    const [, yearStr, weekStr] = qrValue.match(capPattern);
    const week = parseInt(weekStr, 10);
    if (week < 1 || week > 53) {
      showCustomAlert(`Invalid week number in Cap QR: ${week}`, () => {
        isScanning = true;
      });
      return;
    }
    targetField = "capQR";
  } else if (bodyPattern.test(qrValue)) {
    targetField = "bodyQR";
  } else {
    showCustomAlert("Invalid QR format scanned: " + qrValue, () => {
      isScanning = true;
    });
    return;
  }

  if (document.getElementById(targetField).value.trim()) {
    showCustomAlert(
      `The ${targetField === "bodyQR" ? "Body" : "Cap"} QR is already filled.`,
      () => {
        isScanning = true;
      }
    );
    return;
  }

  // Prepare data to check duplicates
  const bodyQR = targetField === "bodyQR" ? qrValue : bodyQRField.value.trim();
  const capQR = targetField === "capQR" ? qrValue : capQRField.value.trim();

  if (window.electronAPI && window.electronAPI.checkDuplicateQR) {
    const duplicateField = await window.electronAPI.checkDuplicateQR({
      bodyQR,
      capQR,
    });

    if (
      (duplicateField === "body" && targetField === "bodyQR") ||
      (duplicateField === "cap" && targetField === "capQR") ||
      duplicateField === "both"
    ) {
      showCustomAlert(
        `This ${targetField === "bodyQR" ? "Body" : "Cap"} QR (${
          targetField === "bodyQR" ? bodyQR : capQR
        }) is already saved.`,
        () => {
          isScanning = true;
        }
      );
      return;
    }
  }

  // If all good, assign value
  document.getElementById(targetField).value = qrValue;

  showCustomAlert(
    `Scanned ${targetField === "bodyQR" ? "Body" : "Cap"} QR: ${qrValue}`,
    () => {
      if (
        !document.getElementById("bodyQR").value.trim() ||
        !document.getElementById("capQR").value.trim()
      ) {
        isScanning = true; // resume scanning if the other field is still empty
      }
    }
  );
}

// Listen for assembly saved events
if (window.electronAPI && window.electronAPI.onAssembledSaved) {
  window.electronAPI.onAssembledSaved((action) => {
    resetAssemblyForm();
    fetchAssembledSensors();

    const toastAssembly = document.getElementById("toast-assembly");
    if (toastAssembly) {
      toastAssembly.textContent =
        action === "deleted"
          ? "Assembled sensor deleted successfully."
          : "Sensor assembled successfully.";

      toastAssembly.classList.add("show");

      setTimeout(() => {
        toastAssembly.classList.remove("show");
      }, 3000);
    }
  });
}

function resetAssemblyForm({ body = true, cap = true } = {}) {
  if (body) document.getElementById("bodyQR").value = "";
  if (cap) document.getElementById("capQR").value = "";
  isScanning = true;
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }
});

function showCustomAlert(message, onConfirm = null, onCancel = null) {
  const alertBox = document.getElementById("custom-alert");
  const alertMessage = document.getElementById("custom-alert-message");
  const alertOkBtn = document.getElementById("custom-alert-ok");
  const alertCancelBtn = document.getElementById("custom-alert-cancel");

  alertMessage.textContent = message;
  alertBox.classList.remove("hidden");

  // Show or hide Cancel button
  if (typeof onCancel === "function") {
    alertCancelBtn.classList.remove("hidden");
  } else {
    alertCancelBtn.classList.add("hidden");
  }

  alertOkBtn.onclick = () => {
    alertBox.classList.add("hidden");
    if (typeof onConfirm === "function") {
      onConfirm();
      isScanning = true;
    }
  };

  alertCancelBtn.onclick = () => {
    alertBox.classList.add("hidden");
    if (typeof onCancel === "function") {
      onCancel();
      isScanning = true;
    }
  };
}

function deleteSensor(id) {
  isScanning = false;
  showCustomAlert(
    "Are you sure you want to delete this sensor?",
    () => {
      isScanning = true;
      if (window.electronAPI && window.electronAPI.deleteAssembledSensor) {
        window.electronAPI.deleteAssembledSensor(id);
      }
    },
    () => {
      isScanning = true;
      console.log("---- Deletion cancelled");
    }
  );
}

function renderPageNumbers(totalPages) {
  const container = document.getElementById("pageNumbers");
  container.innerHTML = "";

  const pages = [];

  if (totalPages <= 7) {
    // show all pages if <=7
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);

    if (currentPage > 4) {
      pages.push("…");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 3) {
      pages.push("…");
    }

    pages.push(totalPages);
  }

  pages.forEach((page) => {
    const btn = document.createElement("button");
    btn.textContent = page;

    if (page === "…") {
      btn.disabled = true;
      btn.className = "px-2 py-1 text-gray-500 cursor-default text-sm";
    } else {
      btn.className =
        "px-3 py-1 rounded text-sm" +
        (page === currentPage
          ? " bg-neutral-800 text-white font-medium"
          : " bg-gray-200 hover:bg-gray-300");

      btn.addEventListener("click", () => {
        currentPage = page;
        fetchAssembledSensors();
      });
    }

    container.appendChild(btn);
  });
}

function pauseScanning() {
  isScanning = false;
}

function resumeScanning() {
  isScanning = true;
}

// Make deleteSensor globally available
window.deleteSensor = deleteSensor;
