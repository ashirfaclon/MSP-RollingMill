/**
 * Bakes the equipment sprites the HSM and RMD process twins draw.
 *
 *   node render.cjs            # every machine, both themes
 *   node render.cjs stand      # one machine, both themes (stand:hot for the hot-bar variant)
 *
 * Under the software renderer here a machine takes about 35 s for its two themes, so bake
 * ONE MACHINE PER RUN (the manifest merges): a run over all of them outlasts a shell timeout.
 *
 * It serves this folder, opens it in headless Chrome, renders each machine off the WebGL
 * canvas and writes a trimmed PNG into frontend/public/twin/. The output is
 * committed; the rig is only re-run when the artwork changes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('../../node_modules/playwright-core');

const ROOT = __dirname;
const OUT = path.resolve(ROOT, '../../public/twin');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  const only = process.argv[2] || null;
  fs.mkdirSync(OUT, { recursive: true });
  /* Port 0: whatever is free. A fixed one collided with a dev server someone else had
     on it, and a rig that cannot run because an unrelated process holds a number is a rig
     that gets skipped. */
  await new Promise((r) => server.listen(0, r));
  const PORT = server.address().port;

  const exe = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction('window.rigReady === true', { timeout: 30000 });

  const machines = only ? [only] : await page.evaluate('window.MACHINES');
  const manifest = {};
  for (const name of machines) {
    for (const theme of ['dark', 'light']) {
      const out = await page.evaluate(
        ([n, t]) => window.renderMachine(n, t, 512),
        [name, theme],
      );
      const buf = Buffer.from(out.url.split(',')[1], 'base64');
      const slug = name.replace(':', '-');
      fs.writeFileSync(path.join(OUT, `${slug}-${theme}.png`), buf);
      /* Geometry is identical between themes; record it once. */
      if (theme === 'dark') manifest[slug] = { w: out.w, h: out.h, pxPerM: out.pxPerM, nozzles: out.nozzles };
      console.log(`${slug}-${theme}.png  ${(buf.length / 1024).toFixed(0)} KB`);
    }
  }

  /*
   * The manifest lives in src/, not public/: the drawing needs these numbers at build
   * time to lay pipework out, and a runtime fetch would mean a frame with every pipe in
   * the wrong place.
   */
  const manifestFile = path.resolve(ROOT, '../../src/components/twin/twinSprites.json');
  const existing = only && fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    : {};
  fs.writeFileSync(manifestFile, `${JSON.stringify({ ...existing, ...manifest }, null, 2)}\n`);
  console.log(`manifest: ${Object.keys(manifest).length} machines -> src/components/twin/twinSprites.json`);

  await browser.close();
  server.close();
})();
