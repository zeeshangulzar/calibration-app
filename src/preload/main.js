const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  //======== Index ========
  loadHomeScreen: () => ipcRenderer.send("load-home-screen"),
  onShowAppVersion: (callback) =>
    ipcRenderer.on("show-app-version", (event, version) => callback(version)),
});

// contextBridge.exposeInMainWorld("ipcRenderer", {
//   on: (channel, listener) => ipcRenderer.on(channel, listener),
// });
