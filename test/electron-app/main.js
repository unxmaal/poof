const { app, BrowserWindow } = require('electron');

const page = `<!doctype html><button aria-label="Junk">x</button><button aria-label="Keep">y</button>`;
const url = `data:text/html,${encodeURIComponent(page)}`;

app.whenReady().then(async () => {
  const splash = new BrowserWindow({ show: false });
  await splash.loadURL('data:text/html,splash');
  await new Promise((r) => setTimeout(r, 300));
  const win = new BrowserWindow({ show: false });
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, 500));
  const display = (label) => `getComputedStyle(document.querySelector('[aria-label="${label}"]')).display`;
  const junk = await win.webContents.executeJavaScript(display('Junk'));
  const keep = await win.webContents.executeJavaScript(display('Keep'));
  console.log(JSON.stringify({ junk, keep }));
  app.quit();
});
