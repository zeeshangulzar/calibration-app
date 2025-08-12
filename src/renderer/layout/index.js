document.addEventListener("DOMContentLoaded", () => {

  window.electronAPI.onShowAppVersion((version) => {
    let element = document.getElementById("app-version");

    element.innerHTML = `App version: ${version}`;
  });
})
