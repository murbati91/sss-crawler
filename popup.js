// SSS Crawler — popup.js
const $ = id => document.getElementById(id);

let currentTab = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Show page info
  if (currentTab) {
    $('page-title').textContent = currentTab.title?.substring(0, 50) || 'Unknown Page';
    $('page-url').textContent   = currentTab.url?.substring(0, 60)   || '—';
  }

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const id = 'tab-' + tab.dataset.tab;
      const el = $(id); if (el) el.classList.add('active');
      if (tab.dataset.tab === 'jina') refreshJinaStats();
    };
  });

  // Load settings
  await loadSettings();

  // Get current count
  await refreshCount();

  // Bind buttons
  bindButtons();

  // Refresh Jina stats on load
  refreshJinaStats();
}

// ── Button Bindings ───────────────────────────────────────────────────────────
function bindButtons() {

  $('btn-scrape').onclick = async () => {
    setStatus('Scraping...', '#B8961E');
    addLog('Extracting page data...');
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          // Trigger the SSS panel scrape
          const ev = new CustomEvent('sss_scrape');
          document.dispatchEvent(ev);

          // Also directly extract
          const records = [];

          // DataTables
          try {
            if (typeof $ !== 'undefined' && $.fn?.dataTable) {
              $.fn.dataTable.tables().forEach(tbl => {
                try {
                  const dt = $(tbl).DataTable();
                  const hdrs = dt.columns().header().toArray().map(h => h.textContent.trim());
                  dt.rows().data().toArray().forEach(row => {
                    const rec = {};
                    if (Array.isArray(row)) { hdrs.forEach((h,i) => { rec[h]=typeof row[i]==='string'?row[i].replace(/<[^>]*>/g,'').trim():(row[i]||''); }); }
                    else Object.assign(rec, row);
                    if (Object.values(rec).some(v => String(v).length > 0)) records.push(rec);
                  });
                } catch(_) {}
              });
            }
          } catch(_) {}

          // DOM tables
          if (records.length === 0) {
            document.querySelectorAll('table').forEach(tbl => {
              const hdrs = Array.from(tbl.querySelectorAll('th')).map(h => h.textContent.trim());
              tbl.querySelectorAll('tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                const rec = {};
                cells.forEach((td, i) => { rec[hdrs[i]||`col_${i+1}`] = td.textContent.trim(); });
                if (Object.values(rec).some(v => v)) records.push(rec);
              });
            });
          }

          return records;
        }
      });

      const records = result?.result || [];
      if (records.length > 0) {
        await chrome.runtime.sendMessage({ type: 'STORE_DATA', data: records, tabId: currentTab.id });
        await refreshCount();
        setStatus(`Got ${records.length} records`, '#1A6B3C');
        addLog(`Extracted ${records.length} records`);
      } else {
        // Show panel in page for manual extraction
        await chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_PANEL' }).catch(() => {});
        setStatus('Opened panel in page', '#0A6E6C');
        addLog('No table data — panel opened in page for API capture');
      }
    } catch(e) {
      addLog(`Error: ${e.message}`);
      setStatus('Error', '#9B1C1C');
    }
  };

  $('btn-paginate').onclick = async () => {
    setStatus('Paginating...', '#B8961E');
    addLog('Auto-paginating...');
    await chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_PANEL' }).catch(() => {});
    // Tell content script to paginate
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        document.dispatchEvent(new CustomEvent('sss_paginate'));
      }
    }).catch(() => {});
    setStatus('Paginating in page...', '#B8961E');
    addLog('Pagination started in page panel');
  };

  $('btn-xl').onclick   = () => doExport('excel');
  $('btn-csv').onclick  = () => doExport('csv');
  $('btn-json').onclick = () => doExport('json');

  $('btn-clear').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DATA', tabId: currentTab.id });
    $('count').textContent = '0';
    $('prog').style.width = '0%';
    setStatus('Cleared', '#444');
    addLog('Data cleared');
  };

  $('btn-analyze').onclick = async () => {
    $('analysis-out').innerHTML = '<div style="color:#B8961E;">Analyzing...</div>';
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          const a = {
            title: document.title,
            url: location.href,
            type: 'Web Page',
            tables: document.querySelectorAll('table').length,
            forms: document.querySelectorAll('form').length,
            links: document.querySelectorAll('a[href]').length,
            images: document.querySelectorAll('img').length,
            inputs: document.querySelectorAll('input,select,textarea').length,
            scripts: document.querySelectorAll('script[src]').length,
            hasDataTable: typeof $ !== 'undefined' && !!$.fn?.dataTable,
            hasPagination: !!document.querySelector('.pagination,.paginate_button,nav[aria-label*="page" i]'),
            isLoggedIn: document.documentElement.innerHTML.toLowerCase().includes('logout') ||
                        document.documentElement.innerHTML.toLowerCase().includes('sign out'),
            tableRows: Array.from(document.querySelectorAll('table')).reduce((s,t)=>s+t.querySelectorAll('tbody tr').length,0),
            tableHeaders: Array.from(document.querySelectorAll('th')).map(t=>t.textContent.trim()).filter(Boolean).slice(0,8),
            cards: document.querySelectorAll('[class*="card"],[class*="item"]').length,
            apiHints: [...new Set(Array.from(document.querySelectorAll('script[src]')).map(s=>s.src).filter(s=>s.includes('/api/')||s.includes('/json/')))].slice(0,3),
          };
          if (a.tables > 0) a.type = 'Data Table Page';
          else if (a.cards > 5) a.type = 'Card/Grid Layout';
          else if (a.forms > 0) a.type = 'Form Page';
          return a;
        }
      });

      const a = result?.result;
      if (!a) { $('analysis-out').innerHTML = '<div style="color:#9B1C1C;">Could not analyze</div>'; return; }

      const loginTag = a.isLoggedIn
        ? `<span style="color:#1A6B3C;font-weight:bold;">✅ Logged In</span>`
        : `<span style="color:#9B1C1C;">⚠ Not Logged In</span>`;

      $('analysis-out').innerHTML = `
        <div style="background:#1B2A4A;border-radius:8px;padding:10px;margin-bottom:8px;">
          <div style="color:#B8961E;font-weight:bold;font-size:12px;margin-bottom:4px;">${a.type}</div>
          <div style="font-size:10px;line-height:1.7;color:#7a90b0;">
            ${loginTag}<br>
            📊 Tables: <strong style="color:white;">${a.tables}</strong> &nbsp;|&nbsp; Rows: <strong style="color:#B8961E;">${a.tableRows}</strong><br>
            🃏 Cards/Items: <strong style="color:white;">${a.cards}</strong><br>
            📄 Pagination: <strong style="color:${a.hasPagination?'#0A6E6C':'#555'}">${a.hasPagination?'Detected':'None'}</strong><br>
            🔗 DataTable: <strong style="color:${a.hasDataTable?'#1A6B3C':'#555'}">${a.hasDataTable?'Yes':'No'}</strong>
          </div>
        </div>
        ${a.tableHeaders.length ? `
          <div style="background:#0a0f1a;border-radius:7px;padding:8px;margin-bottom:8px;font-size:10px;">
            <div style="color:#B8961E;margin-bottom:3px;">Detected Columns:</div>
            <div style="color:#7a90b0;">${a.tableHeaders.join(', ')}</div>
          </div>` : ''}
        <button onclick="document.querySelector('[data-tab=scrape]').click();document.getElementById('btn-scrape').click();"
          style="width:100%;background:#1A6B3C;color:white;border:none;border-radius:8px;padding:9px;font-size:12px;cursor:pointer;font-weight:bold;">
          ▶ Scrape This Page
        </button>
      `;
    } catch(e) {
      $('analysis-out').innerHTML = `<div style="color:#9B1C1C;">Error: ${e.message}</div>`;
    }
  };

  // Jina fetch
  $('btn-jina-fetch').onclick = async () => {
    const key = $('jina-key').value.trim();
    if (!key) { jinaLog('⚠ Set Jina API key in Settings'); return; }
    if (!currentTab?.url) return;

    jinaLog(`Fetching: ${currentTab.url.substring(0,50)}...`);
    setStatus('Jina fetch...', '#0A4E6C');

    const result = await chrome.runtime.sendMessage({
      type: 'JINA_FETCH',
      url: currentTab.url,
      apiKey: key,
      options: { format: 'text', engine: 'browser', timeout: 20 }
    });

    if (result.ok) {
      const lines = (result.text || '').split('\n').filter(l => l.trim().length > 5);
      const records = lines.map((l, i) => ({ '#': i+1, 'Content': l.trim() }));
      await chrome.runtime.sendMessage({ type: 'STORE_DATA', data: records, tabId: currentTab.id });
      await refreshCount();
      jinaLog(`✅ ${result.tokens} tokens | ${result.elapsed}ms | ${lines.length} lines`);
      setStatus(`Jina: ${lines.length} lines`, '#1A6B3C');
    } else {
      jinaLog(`❌ ${result.error || result.status}`);
      setStatus('Jina error', '#9B1C1C');
    }
    refreshJinaStats();
  };

  $('btn-reset-tokens').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_TOKEN_STATS' });
    refreshJinaStats();
    jinaLog('Counter reset');
  };

  $('btn-save').onclick = async () => {
    const settings = {
      jinaKey:      $('jina-key').value.trim(),
      maxPages:     parseInt($('max-pages').value || '20'),
      exportFormat: $('export-fmt').value,
    };
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    $('save-msg').textContent = '✅ Settings saved!';
    setTimeout(() => { $('save-msg').textContent = ''; }, 2000);
    addLog('Settings saved');
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function doExport(fmt) {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_DATA', tabId: currentTab.id });
  const records = resp?.data || [];
  if (!records.length) { addLog('No data to export'); return; }

  await chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_PANEL' }).catch(() => {});

  await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (recs, format) => {
      const headers = [...new Set(recs.flatMap(r => Object.keys(r)))];

      function dl(blob, name) {
        const url=URL.createObjectURL(blob), a=document.createElement('a');
        a.href=url; a.download=name; document.body.appendChild(a); a.click();
        document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      const ts = () => new Date().toISOString().slice(0,10);

      if (format === 'csv') {
        const rows = recs.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','));
        dl(new Blob(['\uFEFF'+[headers.join(','),...rows].join('\n')],{type:'text/csv'}), `SSS_${ts()}.csv`);
      } else if (format === 'json') {
        dl(new Blob([JSON.stringify(recs,null,2)],{type:'application/json'}), `SSS_${ts()}.json`);
      } else {
        // Excel
        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
          <head><meta charset="utf-8"><style>
            body{font-family:Arial;font-size:10pt;}
            th{background:#1B2A4A;color:white;padding:7px 10px;border:1px solid #888;font-size:10pt;}
            td{padding:5px 9px;border:1px solid #ddd;font-size:9.5pt;}
            tr:nth-child(even) td{background:#f3f7fb;}
            h1{color:#1B2A4A;}
          </style></head><body>
          <h1>SSS Crawler Export</h1>
          <p style="color:#888;font-size:9pt;">Source: ${document.title} | Records: ${recs.length} | ${new Date().toLocaleString()}</p>
          <table border="1" cellspacing="0"><thead><tr><th>#</th>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>`;
        recs.forEach((r,i) => {
          html += `<tr><td style="text-align:right;color:#888">${i+1}</td>${headers.map(h=>`<td>${String(r[h]||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`).join('')}</tr>`;
        });
        html += '</tbody></table></body></html>';
        dl(new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8;'}), `SSS_${ts()}.xls`);
      }
    },
    args: [records, fmt]
  });
  addLog(`Exported ${records.length} records as ${fmt.toUpperCase()}`);
}

async function refreshCount() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_DATA', tabId: currentTab.id });
    const count = resp?.count || 0;
    $('count').textContent = count;
    $('prog').style.width = Math.min(100, (count/500)*100) + '%';
  } catch(_) {}
}

async function loadSettings() {
  try {
    const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (s?.jinaKey)      $('jina-key').value   = s.jinaKey;
    if (s?.maxPages)     $('max-pages').value  = s.maxPages;
    if (s?.exportFormat) $('export-fmt').value = s.exportFormat;
  } catch(_) {}
}

async function refreshJinaStats() {
  try {
    const s = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATS' });
    $('j-total').textContent = (s?.total || 0).toLocaleString();
    $('j-calls').textContent = (s?.count || 0).toLocaleString();

    // Last call stats
    const ledger = s?.ledger || [];
    if (ledger.length > 0) {
      const last = ledger[ledger.length-1];
      $('j-remaining').textContent = last.remaining >= 0 ? last.remaining.toLocaleString() : '—';
      $('j-last-ms').textContent   = last.elapsed ? last.elapsed + 'ms' : '—';

      // Render ledger
      const ledgerEl = $('token-ledger');
      if (ledgerEl) {
        ledgerEl.innerHTML = ledger.slice(-10).reverse().map(e =>
          `<div class="token-row">
            <span style="color:#3a6060;">${new Date(e.ts).toLocaleTimeString()}</span>
            <span style="color:#5a7090;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                  title="${e.url}">${shortUrl(e.url)}</span>
            <span style="color:#B8961E;">${e.tokens}t</span>
          </div>`
        ).join('');
      }
    }
  } catch(_) {}
}

function setStatus(msg, bg='#0A6E6C') {
  const el=$('status-chip');
  if (el) { el.textContent=msg; el.style.background=bg; }
}

function addLog(msg, color='#3a6060') {
  const el = $('log'); if (!el) return;
  const d = document.createElement('div');
  d.style.color = color;
  d.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}

function jinaLog(msg) {
  // Also log to main log
  addLog(`[Jina] ${msg}`, '#3a5080');
}

function shortUrl(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).slice(-2).join('/') || new URL(url).hostname; }
  catch { return url.substring(0, 30); }
}

init();
