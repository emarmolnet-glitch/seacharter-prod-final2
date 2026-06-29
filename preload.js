/**
 * SeaCharter - Preload Script
 * Secure bridge exposing IPC messaging safely to the renderer processes (frontend).
 * Adheres strictly to security best practices (contextIsolation: true, nodeIntegration: false).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dataBridgeAPI', {
  /**
   * Request main process to toggle the visibility of the Data Bridge window.
   */
  toggleVisibility: () => {
    ipcRenderer.send('toggle-databridge');
  },

  /**
   * Hide Data Bridge without closing its background sync process.
   */
  hide: () => {
    ipcRenderer.send('hide-databridge');
  },

  /**
   * Minimize Data Bridge while keeping the window and sync process alive.
   */
  minimize: () => {
    ipcRenderer.send('minimize-databridge');
  },

  /**
   * Toggle Data Bridge full screen mode for better data review.
   */
  toggleFullScreen: () => {
    ipcRenderer.send('toggle-databridge-fullscreen');
  },

  /**
   * Request the current visibility state of the Data Bridge window.
   */
  requestVisibilityStatus: () => {
    ipcRenderer.send('request-databridge-status');
  },

  /**
   * Listen for Data Bridge visibility changes.
   * @param {function} callback - Function called with isVisible (boolean)
   */
  onVisibilityChange: (callback) => {
    // Validate that callback is a function to prevent malicious code injection
    if (typeof callback === 'function') {
      const listener = (_event, isVisible) => callback(isVisible);
      ipcRenderer.on('databridge-visibility-change', listener);
      
      // Return a cleanup function in case the renderer wants to unsubscribe
      return () => {
        ipcRenderer.removeListener('databridge-visibility-change', listener);
      };
    }
  }
});

// Expose electronAPI for Core PRO to safely communicate with the main process for auditing
contextBridge.exposeInMainWorld('electronAPI', {
  sendVesselsForAudit: (vesselsList) => ipcRenderer.send('enviar-a-auditoria', vesselsList),
  onVesselsForAudit: (callback) => ipcRenderer.on('recibir-auditoria', (event, data) => callback(data)),
});
