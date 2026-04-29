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
        '<td>' + (d.os||'') + '</td>' +
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
