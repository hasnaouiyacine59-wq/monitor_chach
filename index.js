const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.get('/', (req, res) => res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Live Visits Log</title>
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
    table { width:100%; border-collapse:collapse; font-size:0.8rem; }
    th { text-align:left; border-bottom:1px solid #333; padding:4px 8px; color:#888; }
    td { padding:4px 8px; border-bottom:1px solid #1a1a1a; vertical-align:top; }
    tr:hover td { background:#1a1a1a; }
    .new { animation: flash 1s; }
    @keyframes flash { from { background:#003300; } to { background:transparent; } }
  </style>
</head>
<body>
  <h2>🟢 Live Visits — <span id="count">0</span> records</h2>
  <table>
    <thead><tr>
      <th>IP</th><th>Country</th><th>City</th><th>OS</th><th>Locale</th><th>Timezone</th><th>Titles</th>
    </tr></thead>
    <tbody id="log"></tbody>
  </table>
  <script>
    const es = new EventSource('/stream');
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      const tbody = document.getElementById('log');
      const existing = document.getElementById('row-' + d.ip);
      const row = existing || document.createElement('tr');
      row.id = 'row-' + d.ip;
      row.className = 'new';
      row.innerHTML = \`
        <td>\${d.ip}</td>
        <td>\${d.country||''} \${d.cc||''}</td>
        <td>\${d.city||''}</td>
        <td>\${d.os||''}</td>
        <td>\${d.locale||''}</td>
        <td>\${d.timezone||''}</td>
        <td>\${JSON.stringify(d.titles||'')}</td>
      \`;
      if (!existing) tbody.prepend(row);
      document.getElementById('count').textContent = tbody.querySelectorAll('tr').length;
    };
  </script>
</body>
</html>`));

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
