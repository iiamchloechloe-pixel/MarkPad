// Renders the app icon PNG using Chrome/Core Text so real macOS serif fonts
// (Didot / Bodoni) are available. Run: electron build/render-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

const FONT = process.env.ICON_FONT || "Didot, 'Bodoni 72', 'Times New Roman', serif";
const WEIGHT = process.env.ICON_WEIGHT || '700';
const SIZE = process.env.ICON_MSIZE || '560';

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
  .tile{position:absolute;left:112px;top:112px;width:800px;height:800px;background:#ffffff;
    border-radius:186px;box-shadow:0 16px 38px rgba(0,0,0,0.16);
    display:flex;align-items:center;justify-content:center}
  .m{font-family:${FONT};font-weight:${WEIGHT};font-size:${SIZE}px;color:#111111;
    line-height:1;letter-spacing:0;transform:translateY(-2.5%)}
</style></head><body>
  <div class="tile"><span class="m">M</span></div>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'icon_1024.png'), img.toPNG());
  console.log('wrote icon_1024.png using font:', FONT);
  app.quit();
});
