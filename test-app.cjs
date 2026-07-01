const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 900, frame: false,
    backgroundColor: '#121214',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });

  win.webContents.on('did-finish-load', async () => {
    console.log('=== Page loaded, testing API ===');
    
    // Wait 3s for React to fetch data
    await new Promise(r => setTimeout(r, 3000));
    
    // Dump page text
    const text = await win.webContents.executeJavaScript('document.body.innerText');
    console.log('=== PAGE TEXT ===');
    console.log(text);
    
    // Check store state
    const storeTest = await win.webContents.executeJavaScript(`
      ({
        url: window.location.href,
        rootExists: !!document.getElementById('root'),
        bodyChildren: document.body.children.length,
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).slice(0, 10)
      })
    `);
    console.log('=== STORE TEST ===');
    console.log(JSON.stringify(storeTest, null, 2));
  });

  win.webContents.on('did-fail-load', (e, err) => {
    console.error('Failed to load:', err);
  });

  win.loadURL('http://localhost:8080');
});

app.on('window-all-closed', e => e.preventDefault());
