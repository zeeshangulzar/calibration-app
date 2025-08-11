// window.electronAPI.onShowAppVersion((version) => {
//   let element = document.getElementById("app-version");

//   element.innerHTML = `App version: ${version}`;
// });

// In your renderer JS (e.g., src/renderer/layout/index.js)
// const { ipcRenderer } = window.require ? window.require('electron') : require('electron');

// ipcRenderer.on("show-app-version", (event, version) => {
//   document.getElementById("app-version").textContent = version;
// });

document.addEventListener("DOMContentLoaded", () => {

  window.electronAPI.onShowAppVersion((version) => {
    let element = document.getElementById("app-version");

    element.innerHTML = `App version: ${version}`;
  });
})

