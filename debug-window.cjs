const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    backgroundColor: '#121214',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Log when page loads
  win.webContents.on('did-finish-load', () => {
    console.log('[electron] Page loaded successfully');
    
    // Dump page text
    win.webContents.executeJavaScript('document.body.innerText')
      .then(text => {
        console.log('[electron] Page text:');
        console.log(text.slice(0, 2000));
      })
      .catch(err => console.error('[electron] JS error:', err.message));
    
    // Count elements
    win.webContents.executeJavaScript('document.querySelectorAll("*").length')
      .then(count => console.log(`[electron] Total elements: ${count}`))
      .catch(() => {});
    
    // Check root div
    win.webContents.executeJavaScript('document.getElementById("root")?.innerHTML?.length || "no root"')
      .then(len => console.log(`[electron] Root HTML length: ${len}`))
      .catch(() => {});
  });

  win.webContents.on('did-fail-load', (e, err) => {
    console.error('[electron] Failed to load:', err);
  });

  win.loadURL('http://localhost:8080');
  console.log('[electron] Loading http://localhost:8080');
});

app.on('window-all-closed', e => e.preventDefault());
