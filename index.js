const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { version } = require('./package.json');

const html = `<!DOCTYPE html>
<html>
<head>
  <title>Live Visits Log</title>
  <link id="favicon" rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='5' fill='%23444'/></svg>">
  <style>
    body {
      background:#0a0a0a;
      color:#0f0;
      font-family:monospace;
      padding:1rem;
      background-image:
        repeating-linear-gradient(
          0deg,
          rgba(0,255,0,0.03) 0px,
          rgba(0,255,0,0.03) 1px,
          transparent 1px,
          transparent 4px
        );
      min-height:100vh;
    }
    body::before {
      content:'';
      position:fixed;
      inset:0;
      background: radial-gradient(ellipse at center, rgba(0,40,0,0.6) 0%, rgba(0,0,0,0.95) 100%);
      pointer-events:none;
      z-index:0;
    }
    h2, table { position:relative; z-index:1; }
    h2 { text-shadow: 0 0 8px #0f0; letter-spacing:2px; }
    #version { position:fixed; top:0.6rem; right:1rem; color:#444; font-size:0.7rem; z-index:10; }
    table { width:100%; border-collapse:collapse; font-size:0.8rem; }
    th { text-align:left; border-bottom:1px solid #333; padding:4px 8px; color:#888; }
    td { padding:4px 8px; border-bottom:1px solid #1a1a1a; vertical-align:top; }
    tr:hover td { background:#1a1a1a; }
    .new { animation: flash 1s; }
    @keyframes flash { from { background:#003300; } to { background:transparent; } }
  </style>
</head>
<body>
  <span id="version">v${version}</span>
  <h2><span id="led" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#444;margin-right:8px;transition:background 0.2s;box-shadow:none"></span>Live Visits — <span id="count">0</span> records</h2>
  <table>
    <thead><tr>
      <th>IP</th><th>Country</th><th>City</th><th>OS</th><th>Identicon</th><th>Device ID</th><th>Locale</th><th>Timezone</th><th>Titles</th>
    </tr></thead>
    <tbody id="log"></tbody>
  </table>
  <script>
    const es = new EventSource('/stream');
    const flag = cc => cc ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0))) : '';
    const osIcons = {
      windows: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#00adef" d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.551H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.949"/></svg>',
      macos:   '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#999" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
      linux:   '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#ffcc00" d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587.34 1.23.491 1.8.41.433-.06.845-.24 1.158-.542.3.147.6.24.905.24.3 0 .605-.09.905-.24.313.302.725.482 1.158.542.57.08 1.213-.07 1.8-.41.238.482.682.83 1.208.946.75.2 1.69-.004 2.616-.47.864-.465 1.963-.4 2.774-.6.405-.131.766-.267.94-.601.174-.339.143-.804-.106-1.484-.076-.242-.018-.571.04-.97.028-.136.055-.337.055-.536a1.27 1.27 0 00-.132-.602c.123-.805-.009-1.657-.287-2.489-.589-1.771-1.831-3.47-2.716-4.521-.75-1.067-.974-1.928-1.05-3.02-.065-1.491 1.056-5.965-3.17-6.298-.165-.013-.325-.021-.48-.021zm0 1.265c.07 0 .14.004.21.01 2.775.218 2.538 3.036 2.538 5.517 0 .086.003.17.007.254.018.422.05.83.12 1.207.14.75.435 1.39.93 2.045.823 1.077 1.927 2.62 2.44 4.148.217.65.33 1.29.24 1.87-.08.52-.33.96-.72 1.28-.39.32-.9.5-1.47.5-.57 0-1.08-.18-1.47-.5-.39-.32-.64-.76-.72-1.28-.09-.58.023-1.22.24-1.87.513-1.528 1.617-3.071 2.44-4.148.495-.655.79-1.295.93-2.045.07-.377.102-.785.12-1.207.004-.084.007-.168.007-.254 0-2.481-.237-5.299 2.538-5.517.07-.006.14-.01.21-.01z"/></svg>',
      android: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#3ddc84" d="M17.523 15.341a.5.5 0 01-.5.5H6.977a.5.5 0 01-.5-.5V9.5h11.046v5.841zM8.29 5.988l-1.3-2.252a.25.25 0 10-.433.25l1.31 2.27A7.445 7.445 0 0012 5.5c1.278 0 2.48.32 3.533.756l1.31-2.27a.25.25 0 10-.433-.25l-1.3 2.252A7.5 7.5 0 008.29 5.988zM9.5 12a1 1 0 100-2 1 1 0 000 2zm5 0a1 1 0 100-2 1 1 0 000 2z"/><path fill="#3ddc84" d="M5.477 9.5H4a1 1 0 000 2v3a1 1 0 002 0V9.5zm14.523 0h-1.477V14.5a1 1 0 002 0v-3a1 1 0 000-2z"/></svg>',
    };
    const osIcon = os => { const s = (os||'').toLowerCase(); const k = s.includes('win')?'windows':s.includes('mac')||s.includes('ios')?'macos':s.includes('android')?'android':s.includes('linux')?'linux':null; return k ? osIcons[k] : (os||''); };
    const led = document.getElementById('led');
    let blinkTimer, titleTimer;
    const origTitle = 'Live Visits Log';
    const favicon = document.getElementById('favicon');
    const greenDot = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='5' fill='%2300ff00'/></svg>";
    const greyDot  = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='5' fill='%23444'/></svg>";
    function flash() {
      led.style.background = '#0f0';
      led.style.boxShadow = '0 0 6px #0f0';
      clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => { led.style.background = '#444'; led.style.boxShadow = 'none'; }, 800);
      let on = true, count = 0;
      clearInterval(titleTimer);
      titleTimer = setInterval(() => {
        document.title = on ? '\\u{1F7E2} NEW VISIT!' : origTitle;
        favicon.href = on ? greenDot : greyDot;
        on = !on;
        if (++count >= 6) { clearInterval(titleTimer); document.title = origTitle; favicon.href = greyDot; }
      }, 400);
    }
    function identicon(id) {
      if (!id) return '';
      let h = 5381;
      for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i);
      h = h >>> 0;
      const hue = h % 360;
      const color = 'hsl(' + hue + ',65%,55%)';
      const size = 5, cell = 6, pad = 1, total = size * cell + pad * 2;
      let rects = '';
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < Math.ceil(size / 2); col++) {
          if (!((h >> (row * 3 + col)) & 1)) continue;
          const mc = size - 1 - col;
          const x1 = pad + col * cell, x2 = pad + mc * cell, y = pad + row * cell;
          rects += '<rect x="' + x1 + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + color + '"/>';
          if (col !== mc) rects += '<rect x="' + x2 + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + color + '"/>';
        }
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + total + '" height="' + total + '" style="display:block;border-radius:2px;background:#111">' + rects + '</svg>';
    }
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      const tbody = document.getElementById('log');
      const existing = document.getElementById('row-' + d.ip);
      const row = existing || document.createElement('tr');
      row.id = 'row-' + d.ip;
      row.className = 'new';
      row.innerHTML =
        '<td>' + d.ip + '</td>' +
        '<td>' + flag(d.cc) + ' ' + (d.country||'') + '</td>' +
        '<td>' + (d.city||'') + '</td>' +
        '<td style="text-align:center;font-size:1.2rem">' + osIcon(d.os) + '</td>' +
        '<td style="text-align:center">' + identicon(d.device_id) + '</td>' +
        '<td>' + (d.device_id||'') + '</td>' +
        '<td>' + (d.locale||'') + '</td>' +
        '<td>' + (d.timezone||'') + '</td>' +
        '<td>' + (d.titles||[]).map(t => t.trim().split(' ')[0]).join(', ') + '</td>';
      if (!existing) { tbody.prepend(row); flash(); }
      document.getElementById('count').textContent = tbody.querySelectorAll('tr').length;
    };
  </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(html));

// SSE stream
app.get('/stream', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  // Send existing rows first
  const { rows } = await pool.query('SELECT * FROM visits ORDER BY ip');
  rows.forEach(r => res.write(`data: ${JSON.stringify(r)}\n\n`));

  // Poll for changes every 3s
  let known = new Map(rows.map(r => [r.ip, JSON.stringify(r)]));
  const interval = setInterval(async () => {
    try {
      const { rows: latest } = await pool.query('SELECT * FROM visits ORDER BY ip');
      latest.forEach(r => {
        const sig = JSON.stringify(r);
        if (known.get(r.ip) !== sig) { known.set(r.ip, sig); res.write(`data: ${JSON.stringify(r)}\n\n`); }
      });
    } catch {}
  }, 3000);

  req.on('close', () => clearInterval(interval));
});

app.listen(process.env.PORT || 3000);
