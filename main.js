// Inyectar estilos espaciales para módulos
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'custom_styles.css';
document.head.appendChild(link);
/**
 * SeaCharter Core PRO - Electron Main Process Orchestrator
 * This file manages the application lifecycle and coordinates the windows:
 * - SeaCharter Core PRO (Main User Interface, always visible)
 * - SeaCharter Data Bridge (Background data sync module, hidden by default)
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let dataBridgeWindow = null;

// Track if the app is intentionally quitting to bypass close interception
app.isQuitting = false;

function createWindows() {
  // 1. Create the main SeaCharter Core PRO window
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    title: "SeaCharter Core PRO - Enterprise Maritime Suite",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Load the main interface
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 2. Create the SeaCharter Data Bridge window
  // Started concurrently, but silently in the background (show: false)
  dataBridgeWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    title: "SeaCharter Data Bridge - Live Sync Console",
    show: false, // Starts hidden as requested
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Load the data bridge simulation console
  dataBridgeWindow.loadFile(path.join(__dirname, 'public', 'databridge.html'));

  // --- Prevent Orphan Processes / Intercept Close ---
  // If the user tries to close the Data Bridge window, intercept the event.
  // We hide the window instead of destroying it, ensuring data synchronization continues.
  dataBridgeWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      dataBridgeWindow.hide();
      
      // Notify the main window that the visibility state has updated to hidden
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('databridge-visibility-change', false);
      }
    }
  });

  // Keep state in sync with Core PRO when shown or hidden from other triggers
  dataBridgeWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('databridge-visibility-change', true);
    }
  });

  dataBridgeWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('databridge-visibility-change', false);
    }
  });

  // When Core PRO is closed, clean up all windows and quit
  mainWindow.on('closed', () => {
    mainWindow = null;
    
    // Explicitly destroy the data bridge window to allow clean shutdown
    if (dataBridgeWindow) {
      dataBridgeWindow.destroy();
      dataBridgeWindow = null;
    }
    
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// When Electron has finished initialization
app.whenReady().then(() => {
  createWindows();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

// Set isQuitting flag when the application is closing down completely
app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Communication Handlers ---
// 1. Toggle visibility of the Data Bridge window
ipcMain.on('toggle-databridge', () => {
  if (dataBridgeWindow && !dataBridgeWindow.isDestroyed()) {
    const isVisible = dataBridgeWindow.isVisible();
    if (isVisible) {
      dataBridgeWindow.hide();
    } else {
      dataBridgeWindow.show();
      dataBridgeWindow.focus();
    }
  }
});

ipcMain.on('hide-databridge', () => {
  if (dataBridgeWindow && !dataBridgeWindow.isDestroyed()) {
    dataBridgeWindow.hide();
  }
});

ipcMain.on('minimize-databridge', () => {
  if (dataBridgeWindow && !dataBridgeWindow.isDestroyed()) {
    if (!dataBridgeWindow.isVisible()) {
      dataBridgeWindow.show();
    }
    dataBridgeWindow.minimize();
  }
});

ipcMain.on('toggle-databridge-fullscreen', () => {
  if (dataBridgeWindow && !dataBridgeWindow.isDestroyed()) {
    if (!dataBridgeWindow.isVisible()) {
      dataBridgeWindow.show();
    }
    if (dataBridgeWindow.isMinimized()) {
      dataBridgeWindow.restore();
    }
    dataBridgeWindow.setFullScreen(!dataBridgeWindow.isFullScreen());
    dataBridgeWindow.focus();
  }
});

// 2. Allow Core PRO to query the current visibility status of Data Bridge on startup/refresh
ipcMain.on('request-databridge-status', (event) => {
  if (dataBridgeWindow && !dataBridgeWindow.isDestroyed()) {
    event.reply('databridge-visibility-change', dataBridgeWindow.isVisible());
  } else {
    event.reply('databridge-visibility-change', false);
  }
});

// 3. Flow Matching Engine -> Audit in Data Bridge
ipcMain.on('enviar-a-auditoria', (event, vesselsList) => {
    console.log(`[IPC MAIN] Recibidos ${vesselsList.length} buques. Redirigiendo a Data Bridge...`);
    if (dataBridgeWindow && !dataBridgeWindow.webContents.isDestroyed()) {
        dataBridgeWindow.webContents.send('recibir-auditoria', vesselsList);
    } else {
        console.error("[IPC MAIN] Error: dataBridgeWindow no está disponible.");
    }
});
