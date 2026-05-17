// SSS Crawler — content.js v1.0
// Universal page analyzer & scraper by Salahuddin Softtech Solutions

(function () {
  'use strict';
  if (window.__SSS_CRAWLER_LOADED__) return;
  window.__SSS_CRAWLER_LOADED__ = true;

  let capturedRecords = [];
  let pageAnalysis = null;
  let isRunning = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK INTERCEPTOR — capture all XHR/Fetch responses
  // ═══════════════════════════════════════════════════════════════════════════
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (!shouldCapture(url)) return resp;
      resp.clone().json().then(data => processNetworkData(url, data, 'fetch')).catch(() => {
        resp.clone().text().then(text => {
          if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            try { processNetworkData(url, JSON.parse(text), 'fetch'); } catch (_) {}
          }
        }).catch(() => {});
      });
    } catch (_) {}
    return resp;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...a) {
    this._sss_url = url; this._sss_method = m;
    return origOpen.apply(this, [m, url, ...a]);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener('load', function () {
      try {
        if (!this._sss_url || !shouldCapture(this._sss_url)) return;
        const ct = this.getResponseHeader?.('content-type') || '';
        if (ct.includes('json') || this.responseText.trim().startsWith('[') || this.responseText.trim().startsWith('{')) {
          processNetworkData(this._sss_url, JSON.parse(this.responseText), 'xhr');
        }
      } catch (_) {}
    });
    return origSend.apply(this, a);
  };

  function shouldCapture(url) {
    if (!url) return false;
    const skip = ['google-analytics','googletagmanager','facebook','doubleclick',
                   'livechat','intercom','stripe','addthis','hotjar','segment',
                   '.png','.jpg','.svg','.css','.woff','favicon'];
    return !skip.some(s => url.includes(s));
  }

  function processNetworkData(url, data, source) {
    const records = flattenApiData(data);
    if (records.length >= 2) {
      const before = capturedRecords.length;
      mergeRecords(records);
      const added = capturedRecords.length - before;
      if (added > 0) {
        notifyBg();
        updateCounter();
        logToPanel(`[API] +${added} records from ${shortUrl(url)}`);
      }
    }
  }

  function flattenApiData(data) {
    if (!data) return [];
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') return data;
    if (typeof data === 'object') {
      // Search common keys for arrays of objects
      const searchKeys = ['data','items','results','records','rows','list','content',
                          'activities','products','users','entries','documents','assets',
                          'jsonData','payload','response','body'];
      for (const k of searchKeys) {
        if (Array.isArray(data[k]) && data[k].length > 0 && typeof data[k][0] === 'object') return data[k];
      }
      // Deeper scan
      for (const v of Object.values(data)) {
        if (Array.isArray(v) && v.length > 2 && typeof v[0] === 'object') return v;
        if (typeof v === 'object' && v) {
          for (const v2 of Object.values(v)) {
            if (Array.isArray(v2) && v2.length > 2 && typeof v2[0] === 'object') return v2;
          }
        }
      }
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE ANALYZER
  // ═══════════════════════════════════════════════════════════════════════════
  function analyzePage() {
    const analysis = {
      url:      location.href,
      title:    document.title,
      type:     detectPageType(),
      sources:  [],
      estimate: 0,
      columns:  [],
      login:    isLoggedIn(),
    };

    // Detect data sources
    const tables = detectTables();
    const lists  = detectLists();
    const cards  = detectCards();
    const forms  = detectForms();
    const paged  = detectPagination();

    if (tables.length)  analysis.sources.push({ kind: 'table',  count: tables.length,  sample: tables[0]  });
    if (lists.length)   analysis.sources.push({ kind: 'list',   count: lists.length,   sample: lists[0]   });
    if (cards.length)   analysis.sources.push({ kind: 'cards',  count: cards.length,   sample: cards[0]   });
    if (forms.length)   analysis.sources.push({ kind: 'form',   count: forms.length,   sample: forms[0]   });
    if (paged)          analysis.sources.push({ kind: 'paged',  count: paged           });

    // Estimate record count
    if (tables.length)  analysis.estimate = Math.max(analysis.estimate, tables.reduce((s,t) => s + t.rows, 0));
    if (cards.length)   analysis.estimate = Math.max(analysis.estimate, cards.reduce((s,c) => s + c.count, 0));
    if (lists.length)   analysis.estimate = Math.max(analysis.estimate, lists.reduce((s,l) => s + l.count, 0));

    // Best columns
    if (tables.length && tables[0].headers) analysis.columns = tables[0].headers;
    else if (cards.length && cards[0].fields) analysis.columns = cards[0].fields;

    analysis.hasPagination = !!paged;
    pageAnalysis = analysis;
    return analysis;
  }

  function detectPageType() {
    const url  = location.href.toLowerCase();
    const html = document.documentElement.innerHTML.toLowerCase();
    const title = document.title.toLowerCase();

    if (url.includes('dashboard') || url.includes('/admin'))             return 'Dashboard / Admin';
    if (url.includes('product') || url.includes('shop') || url.includes('store')) return 'E-Commerce';
    if (url.includes('search') || url.includes('result') || url.includes('query')) return 'Search Results';
    if (url.includes('directory') || url.includes('listing') || url.includes('catalog')) return 'Directory / Catalog';
    if (url.includes('report') || url.includes('analytics'))            return 'Report / Analytics';
    if (document.querySelectorAll('table').length > 2)                  return 'Data Table';
    if (document.querySelectorAll('[class*="card"]').length > 5)        return 'Card Layout';
    if (document.querySelectorAll('form').length > 0)                   return 'Form Page';
    if (html.includes('login') || html.includes('sign in'))             return 'Login / Auth';
    return 'General Web Page';
  }

  function isLoggedIn() {
    const html = document.documentElement.innerHTML.toLowerCase();
    return html.includes('logout') || html.includes('sign out') ||
           html.includes('dashboard') || html.includes('profile') ||
           document.cookie.length > 50;
  }

  function detectTables() {
    const results = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = Array.from(tbl.querySelectorAll('th')).map(th => th.textContent.trim()).filter(Boolean);
      const rows    = tbl.querySelectorAll('tbody tr').length;
      if (rows > 0 || headers.length > 0) {
        results.push({ el: tbl, headers, rows, id: tbl.id || tbl.className.split(' ')[0] });
      }
    });
    return results;
  }

  function detectCards() {
    const results = [];
    const selectors = ['[class*="card"]','[class*="item"]','[class*="product"]',
                       '[class*="entry"]','[class*="result"]','[class*="tile"]',
                       '[class*="row"]','article','[data-id]','[data-item]'];
    selectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length >= 3) {
          const fields = getCardFields(els[0]);
          results.push({ selector: sel, count: els.length, fields });
        }
      } catch (_) {}
    });
    // Deduplicate by approximate count
    const seen = new Set();
    return results.filter(r => { const k = Math.round(r.count/5)*5; if(seen.has(k)) return false; seen.add(k); return true; });
  }

  function getCardFields(el) {
    const fields = [];
    el.querySelectorAll('[class*="title"],[class*="name"],[class*="label"],[class*="price"],[class*="date"],[class*="id"]').forEach(f => {
      const cls = f.className.split(' ').find(c => c.length > 2) || f.tagName;
      if (!fields.includes(cls)) fields.push(cls);
    });
    return fields.slice(0, 6);
  }

  function detectLists() {
    const results = [];
    document.querySelectorAll('ul,ol').forEach(list => {
      const items = list.querySelectorAll('li');
      if (items.length >= 3 && items[0].textContent.trim().length > 5) {
        results.push({ el: list, count: items.length });
      }
    });
    return results.filter(l => l.count >= 5).slice(0, 3);
  }

  function detectForms() {
    return Array.from(document.querySelectorAll('form')).map(f => ({
      el: f, fields: Array.from(f.querySelectorAll('input,select,textarea')).length
    })).filter(f => f.fields > 0);
  }

  function detectPagination() {
    const sels = ['.pagination','.pager','[aria-label="pagination"]',
                  '.paginate_button','[class*="next"]','[class*="prev"]',
                  'nav[role="navigation"]'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        const nums = el.querySelectorAll('a,button,span').length;
        return nums > 1 ? nums : null;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTORS
  // ═══════════════════════════════════════════════════════════════════════════
  function extractTables() {
    const records = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = Array.from(tbl.querySelectorAll('th')).map(th => th.textContent.trim());
      tbl.querySelectorAll('tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const record = {};
        cells.forEach((td, i) => {
          record[headers[i] || `col_${i+1}`] = td.textContent.trim();
        });
        if (Object.values(record).some(v => v.length > 0)) records.push(record);
      });
    });
    return records;
  }

  function extractCards(selector) {
    const records = [];
    const els = document.querySelectorAll(selector || '[class*="card"],[class*="item"]');
    els.forEach(el => {
      const record = {};
      // Try to extract key-value pairs from the card
      el.querySelectorAll('[class*="title"],[class*="name"],[class*="heading"],h1,h2,h3,h4').forEach(e => {
        record['Title'] = e.textContent.trim();
      });
      el.querySelectorAll('[class*="price"],[class*="cost"],[class*="amount"]').forEach(e => {
        record['Price'] = e.textContent.trim();
      });
      el.querySelectorAll('[class*="desc"],[class*="text"],[class*="body"],p').forEach((e,i) => {
        if (i === 0) record['Description'] = e.textContent.trim().substring(0, 200);
      });
      el.querySelectorAll('[class*="date"],[class*="time"],[datetime]').forEach(e => {
        record['Date'] = e.textContent.trim() || e.getAttribute('datetime') || '';
      });
      el.querySelectorAll('[class*="id"],[data-id]').forEach(e => {
        record['ID'] = e.textContent.trim() || e.getAttribute('data-id') || '';
      });
      el.querySelectorAll('a[href]').forEach((e,i) => {
        if (i===0) record['Link'] = e.href;
      });
      // Get all visible text as fallback
      if (Object.keys(record).length === 0) {
        record['Content'] = el.textContent.trim().substring(0, 300);
      }
      if (Object.values(record).some(v => v && v.length > 1)) records.push(record);
    });
    return records;
  }

  function extractLists() {
    const records = [];
    document.querySelectorAll('ul,ol').forEach(list => {
      const items = list.querySelectorAll('li');
      if (items.length < 3) return;
      items.forEach(li => {
        const text = li.textContent.trim();
        const link = li.querySelector('a');
        if (text.length > 3) {
          records.push({
            'Item': text.substring(0, 200),
            'Link': link ? link.href : '',
          });
        }
      });
    });
    return records;
  }

  function extractDataTable() {
    const records = [];
    try {
      if (typeof $ !== 'undefined' && $.fn?.dataTable) {
        $.fn.dataTable.tables().forEach(tbl => {
          try {
            const dt = $(tbl).DataTable();
            const hdrs = dt.columns().header().toArray().map(h => h.textContent.trim());
            dt.rows().data().toArray().forEach(row => {
              const rec = {};
              if (Array.isArray(row)) {
                hdrs.forEach((h, i) => { rec[h] = stripHtml(String(row[i] || '')); });
              } else if (typeof row === 'object') {
                Object.assign(rec, row);
              }
              if (Object.values(rec).some(v => String(v).length > 0)) records.push(rec);
            });
          } catch (_) {}
        });
      }
    } catch (_) {}
    return records;
  }

  function extractAll() {
    const all = [
      ...extractDataTable(),
      ...extractTables(),
      ...extractCards(),
      ...capturedRecords,
    ];
    return dedupe(all);
  }

  function dedupe(arr) {
    const seen = new Set();
    return arr.filter(item => {
      const k = JSON.stringify(item);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }

  function mergeRecords(incoming) {
    const existing = new Set(capturedRecords.map(r => JSON.stringify(r)));
    incoming.forEach(r => {
      const k = JSON.stringify(r);
      if (!existing.has(k)) { capturedRecords.push(r); existing.add(k); }
    });
  }

  function stripHtml(html) {
    const d = document.createElement('div'); d.innerHTML = html; return d.textContent?.trim() || '';
  }
  function shortUrl(url) { try { return new URL(url).pathname.split('/').filter(Boolean).slice(-2).join('/'); } catch { return url.substring(0,40); } }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function notifyBg() {
    chrome.runtime.sendMessage({ type: 'STORE_DATA', data: capturedRecords });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-PAGINATOR
  // ═══════════════════════════════════════════════════════════════════════════
  async function autoPaginate(maxPages = 20) {
    let page = 0;
    while (page < maxPages) {
      const next = findNextButton();
      if (!next) break;
      const before = capturedRecords.length;
      next.click();
      await sleep(2500);
      const pageData = extractAll();
      mergeRecords(pageData);
      updateCounter();
      if (capturedRecords.length === before) break;
      page++;
      logToPanel(`Page ${page+1} → ${capturedRecords.length} total`);
    }
  }

  function findNextButton() {
    const sels = [
      '.paginate_button.next:not(.disabled)',
      '[aria-label="Next page"]',
      '[aria-label="Next"]',
      'a[rel="next"]',
      'button:not(:disabled)[class*="next"]',
      'a[class*="next"]:not([class*="disabled"])',
      '[data-page="next"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && !el.disabled && !el.classList.contains('disabled')) return el;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════
  function exportExcel(records, filename) {
    if (!records.length) { logToPanel('No data to export'); return; }
    const headers = [...new Set(records.flatMap(r => Object.keys(r)))];

    const total = records.length;
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <style>
      body{font-family:Arial;font-size:10pt;}
      h1{color:#1B2A4A;font-size:14pt;}
      .meta{color:#888;font-size:9pt;margin-bottom:8px;}
      table{border-collapse:collapse;width:100%;}
      th{background:#1B2A4A;color:white;padding:7px 10px;border:1px solid #888;font-size:10pt;white-space:nowrap;}
      td{padding:5px 9px;border:1px solid #ddd;font-size:9.5pt;vertical-align:top;}
      tr:nth-child(even) td{background:#f3f7fb;}
      .num{text-align:right;color:#888;font-family:monospace;}
    </style></head><body>
    <h1>SSS Crawler Export</h1>
    <p class="meta">
      Source: ${document.title} | URL: ${location.href}<br>
      Exported: ${new Date().toLocaleString()} | Records: ${total} | By Salahuddin Softtech Solutions
    </p>
    <table border="1" cellspacing="0">
    <thead><tr><th style="width:32px">#</th>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>`;

    records.forEach((rec, i) => {
      html += `<tr><td class="num">${i+1}</td>${headers.map(h=>`<td>${escHtml(String(rec[h]||''))}</td>`).join('')}</tr>`;
    });

    html += `</tbody></table>
    <p style="color:#bbb;font-size:8pt;margin-top:8px;">SSS Crawler by Salahuddin Softtech Solutions | ${new Date().toLocaleString()}</p>
    </body></html>`;

    dl(new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8;'}), filename || `SSS_Crawler_${ts()}.xls`);
    logToPanel(`Excel exported: ${total} records, ${headers.length} columns`);
  }

  function exportCSV(records, filename) {
    if (!records.length) { logToPanel('No data to export'); return; }
    const headers = [...new Set(records.flatMap(r => Object.keys(r)))];
    const rows = records.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','));
    dl(new Blob(['\uFEFF'+[headers.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8;'}), filename || `SSS_Crawler_${ts()}.csv`);
    logToPanel(`CSV exported: ${records.length} rows`);
  }

  function exportJSON(records, filename) {
    dl(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}), filename || `SSS_Crawler_${ts()}.json`);
    logToPanel(`JSON exported: ${records.length} records`);
  }

  function dl(blob, name) {
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function ts() { return new Date().toISOString().slice(0,10); }
  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL UI
  // ═══════════════════════════════════════════════════════════════════════════
  function createPanel() {
    if (document.getElementById('sss-crawler-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sss-crawler-panel';
    panel.innerHTML = `
    <div id="sss-wrap" style="
      position:fixed; bottom:16px; right:16px; z-index:2147483647;
      background:#0a0f1a; color:white; border-radius:14px;
      width:290px; font-family:Arial,sans-serif;
      box-shadow:0 16px 48px rgba(0,0,0,0.7);
      border:2px solid #B8961E; overflow:hidden;
      transition: all 0.3s;
    ">
      <!-- Header -->
      <div style="background:#1B2A4A; padding:10px 14px; display:flex; align-items:center; gap:8px; border-bottom:2px solid #B8961E; cursor:move;" id="sss-drag-handle">
        <img src="data:image/png;base64,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" style="width:32px;height:32px;object-fit:contain;border-radius:6px;flex-shrink:0;" alt="SSS">
        <div style="flex:1;">
          <div style="font-weight:bold;font-size:13px;color:#B8961E;letter-spacing:0.5px;">SSS Crawler</div>
          <div style="font-size:10px;color:#5a7898;">Universal Web Scraper v1.0</div>
        </div>
        <button id="sss-min" title="Minimize" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:0;margin-right:4px;">─</button>
        <button id="sss-close" title="Close" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0;">✕</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex; border-bottom:1px solid #1a2a3a;">
        <button class="sss-tab active" data-tab="scrape" style="flex:1;padding:8px;background:none;border:none;color:#B8961E;cursor:pointer;font-size:11px;font-weight:bold;border-bottom:2px solid #B8961E;">SCRAPE</button>
        <button class="sss-tab" data-tab="analyze" style="flex:1;padding:8px;background:none;border:none;color:#444;cursor:pointer;font-size:11px;">ANALYZE</button>
        <button class="sss-tab" data-tab="jina" style="flex:1;padding:8px;background:none;border:none;color:#444;cursor:pointer;font-size:11px;">JINA</button>
        <button class="sss-tab" data-tab="settings" style="flex:1;padding:8px;background:none;border:none;color:#444;cursor:pointer;font-size:11px;">⚙</button>
      </div>

      <!-- SCRAPE TAB -->
      <div id="sss-tab-scrape" class="sss-tab-content" style="padding:12px;">
        <div id="sss-status" style="background:#0A6E6C;border-radius:7px;padding:6px 10px;font-size:11px;text-align:center;margin-bottom:9px;font-weight:bold;">Ready</div>
        <div style="text-align:center;margin-bottom:9px;">
          <div id="sss-count" style="font-size:42px;font-weight:bold;color:#B8961E;line-height:1;">0</div>
          <div style="font-size:10px;color:#444;margin-top:2px;">records captured</div>
        </div>
        <div style="height:3px;background:#1a2035;border-radius:2px;margin-bottom:9px;">
          <div id="sss-bar" style="height:100%;background:#B8961E;border-radius:2px;width:0%;transition:width 0.4s;"></div>
        </div>
        <button id="sss-go" style="width:100%;background:#B8961E;color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;margin-bottom:6px;">⚡ Scrape This Page</button>
        <button id="sss-paginate" style="width:100%;background:#1B2A4A;color:#B8961E;border:1px solid #B8961E;border-radius:8px;padding:8px;font-size:12px;cursor:pointer;margin-bottom:6px;">📄 Scrape + All Pages</button>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;">
          <button id="sss-xl"  style="background:#1A6B3C;color:white;border:none;border-radius:7px;padding:8px;font-size:11px;cursor:pointer;">⬇ Excel</button>
          <button id="sss-csv" style="background:#1A6B3C;color:white;border:none;border-radius:7px;padding:8px;font-size:11px;cursor:pointer;">⬇ CSV</button>
          <button id="sss-json" style="background:#0A4E6C;color:white;border:none;border-radius:7px;padding:8px;font-size:11px;cursor:pointer;">⬇ JSON</button>
        </div>
        <button id="sss-clr" style="width:100%;background:transparent;color:#333;border:1px solid #1a2a3a;border-radius:8px;padding:6px;font-size:11px;cursor:pointer;margin-bottom:6px;">🗑 Clear</button>
        <div id="sss-log" style="background:#040810;border-radius:6px;padding:5px 8px;font-size:9.5px;color:#3a5060;max-height:65px;overflow-y:auto;font-family:monospace;line-height:1.5;"></div>
      </div>

      <!-- ANALYZE TAB -->
      <div id="sss-tab-analyze" class="sss-tab-content" style="display:none;padding:12px;">
        <button id="sss-analyze-btn" style="width:100%;background:#B8961E;color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;margin-bottom:10px;">🔍 Analyze This Page</button>
        <div id="sss-analysis-result" style="font-size:11px;color:#aaa;line-height:1.7;">Click Analyze to detect data sources on this page.</div>
      </div>

      <!-- JINA TAB -->
      <div id="sss-tab-jina" class="sss-tab-content" style="display:none;padding:12px;">
        <div style="background:#1B2A4A;border-radius:8px;padding:10px;margin-bottom:10px;">
          <div style="font-size:11px;color:#B8961E;font-weight:bold;margin-bottom:6px;">Token Consumption</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <div style="text-align:center;background:#0a0f1a;border-radius:6px;padding:8px;">
              <div id="sss-j-total" style="font-size:22px;font-weight:bold;color:#B8961E;">0</div>
              <div style="font-size:10px;color:#444;">Total Tokens</div>
            </div>
            <div style="text-align:center;background:#0a0f1a;border-radius:6px;padding:8px;">
              <div id="sss-j-calls" style="font-size:22px;font-weight:bold;color:#0A6E6C;">0</div>
              <div style="font-size:10px;color:#444;">API Calls</div>
            </div>
          </div>
        </div>
        <button id="sss-jina-scrape" style="width:100%;background:#0A4E6C;color:white;border:none;border-radius:8px;padding:9px;font-size:12px;cursor:pointer;margin-bottom:6px;">🤖 Scrape via Jina AI</button>
        <div style="font-size:10px;color:#444;margin-bottom:6px;">Uses Jina reader to scrape this page with full rendering. Good for JS-heavy sites.</div>
        <button id="sss-j-reset" style="width:100%;background:transparent;color:#555;border:1px solid #1a2a3a;border-radius:8px;padding:6px;font-size:11px;cursor:pointer;margin-bottom:6px;">Reset Token Counter</button>
        <div id="sss-j-log" style="background:#040810;border-radius:6px;padding:5px 8px;font-size:9.5px;color:#3a5060;max-height:80px;overflow-y:auto;font-family:monospace;line-height:1.5;"></div>
      </div>

      <!-- SETTINGS TAB -->
      <div id="sss-tab-settings" class="sss-tab-content" style="display:none;padding:12px;">
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;color:#B8961E;display:block;margin-bottom:4px;">Jina API Key</label>
          <input id="sss-jina-key" type="password" placeholder="jina_..." style="width:100%;background:#1B2A4A;color:white;border:1px solid #2a3a4a;border-radius:7px;padding:8px;font-size:11px;font-family:monospace;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;color:#B8961E;display:block;margin-bottom:4px;">Max Pages (auto-paginate)</label>
          <input id="sss-max-pages" type="number" value="20" min="1" max="100" style="width:100%;background:#1B2A4A;color:white;border:1px solid #2a3a4a;border-radius:7px;padding:8px;font-size:12px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;color:#B8961E;display:block;margin-bottom:4px;">Export Format</label>
          <select id="sss-export-fmt" style="width:100%;background:#1B2A4A;color:white;border:1px solid #2a3a4a;border-radius:7px;padding:8px;font-size:12px;box-sizing:border-box;">
            <option value="excel">Excel (.xls)</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <button id="sss-save-settings" style="width:100%;background:#B8961E;color:white;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:bold;cursor:pointer;">💾 Save Settings</button>
        <div id="sss-settings-msg" style="margin-top:8px;font-size:11px;color:#1A6B3C;text-align:center;"></div>
      </div>
    </div>
    `;

    document.body.appendChild(panel);
    bindPanelEvents();
    loadSettings();
    refreshJinaStats();
  }

  function bindPanelEvents() {
    // Tab switching
    document.querySelectorAll('.sss-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.sss-tab').forEach(t => {
          t.style.color = '#444'; t.style.borderBottom = 'none';
          t.classList.remove('active');
        });
        document.querySelectorAll('.sss-tab-content').forEach(c => c.style.display='none');
        tab.style.color = '#B8961E'; tab.style.borderBottom = '2px solid #B8961E';
        tab.classList.add('active');
        const id = 'sss-tab-' + tab.dataset.tab;
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
        if (tab.dataset.tab === 'jina') refreshJinaStats();
      };
    });

    // Minimize
    let minimized = false;
    document.getElementById('sss-min').onclick = () => {
      minimized = !minimized;
      const body = document.getElementById('sss-wrap').querySelectorAll('.sss-tab-content, [class*="sss-tab"]:not(#sss-drag-handle), #sss-drag-handle ~ *');
      const tabs = document.getElementById('sss-wrap').querySelector('.sss-tab')?.parentElement;
      if (minimized) {
        if (tabs) tabs.style.display = 'none';
        document.querySelectorAll('.sss-tab-content').forEach(c => c.style.display='none');
        document.getElementById('sss-min').textContent = '▢';
      } else {
        if (tabs) tabs.style.display = 'flex';
        document.getElementById('sss-tab-scrape').style.display = 'block';
        document.getElementById('sss-min').textContent = '─';
      }
    };

    document.getElementById('sss-close').onclick = () => {
      const p = document.getElementById('sss-crawler-panel');
      if (p) p.style.display = 'none';
    };

    // Scrape buttons
    document.getElementById('sss-go').onclick = async () => {
      capturedRecords = [];
      setStatus('Extracting...', '#B8961E');
      logToPanel('Starting extraction...');
      const records = extractAll();
      mergeRecords(records);
      updateCounter();
      notifyBg();
      setStatus(`Done: ${capturedRecords.length} records`, '#1A6B3C');
      logToPanel(`Extracted ${capturedRecords.length} records`);
    };

    document.getElementById('sss-paginate').onclick = async () => {
      setStatus('Paginating...', '#B8961E');
      const records = extractAll();
      mergeRecords(records);
      updateCounter();
      const maxPages = parseInt(document.getElementById('sss-max-pages')?.value || '20');
      await autoPaginate(maxPages);
      setStatus(`Done: ${capturedRecords.length} records`, '#1A6B3C');
      logToPanel(`Finished: ${capturedRecords.length} total`);
      notifyBg();
    };

    document.getElementById('sss-xl').onclick   = () => exportExcel(capturedRecords);
    document.getElementById('sss-csv').onclick  = () => exportCSV(capturedRecords);
    document.getElementById('sss-json').onclick = () => exportJSON(capturedRecords);

    document.getElementById('sss-clr').onclick = () => {
      capturedRecords = [];
      updateCounter();
      setStatus('Cleared', '#555');
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
    };

    // Analyze tab
    document.getElementById('sss-analyze-btn').onclick = () => {
      const a = analyzePage();
      renderAnalysis(a);
    };

    // Jina tab
    document.getElementById('sss-jina-scrape').onclick = async () => {
      const key = document.getElementById('sss-jina-key')?.value?.trim();
      if (!key) {
        jinaLog('⚠ No Jina API key — set it in Settings tab');
        return;
      }
      jinaLog(`Sending to Jina: ${location.href.substring(0,50)}...`);
      setStatus('Jina fetch...', '#0A4E6C');
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'JINA_FETCH',
          url: location.href,
          apiKey: key,
          options: { format: 'text', engine: 'browser' }
        });
        if (result.ok) {
          jinaLog(`✅ Got ${result.text?.length || 0} chars | Tokens: ${result.tokens} | Remaining: ${result.remaining}`);
          // Parse the markdown text into records
          const lines = (result.text || '').split('\n').filter(l => l.trim().length > 5);
          const records = lines.map((l, i) => ({ '#': i+1, 'Content': l.trim() }));
          mergeRecords(records);
          updateCounter();
          notifyBg();
          setStatus(`Jina: ${capturedRecords.length} lines`, '#1A6B3C');
          refreshJinaStats();
        } else {
          jinaLog(`❌ Error: ${result.error || result.status}`);
          setStatus('Jina error', '#9B1C1C');
        }
      } catch (e) {
        jinaLog(`❌ ${e.message}`);
      }
    };

    document.getElementById('sss-j-reset').onclick = async () => {
      await chrome.runtime.sendMessage({ type: 'RESET_TOKEN_STATS' });
      refreshJinaStats();
      jinaLog('Token counter reset');
    };

    // Settings
    document.getElementById('sss-save-settings').onclick = async () => {
      const settings = {
        jinaKey:      document.getElementById('sss-jina-key')?.value?.trim() || '',
        maxPages:     parseInt(document.getElementById('sss-max-pages')?.value || '20'),
        exportFormat: document.getElementById('sss-export-fmt')?.value || 'excel',
      };
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
      document.getElementById('sss-settings-msg').textContent = '✅ Saved!';
      setTimeout(() => { document.getElementById('sss-settings-msg').textContent = ''; }, 2000);
    };

    // Draggable panel
    makeDraggable(document.getElementById('sss-wrap'), document.getElementById('sss-drag-handle'));
  }

  function renderAnalysis(a) {
    const el = document.getElementById('sss-analysis-result');
    if (!el) return;
    const loginBadge = a.login ? `<span style="color:#1A6B3C;font-weight:bold;">✅ Logged in</span>` : `<span style="color:#9B1C1C;">⚠ Not logged in</span>`;
    const sourceHtml = a.sources.map(s => {
      const icons = { table:'📊', cards:'🃏', list:'📋', form:'📝', paged:'📄' };
      return `<div style="background:#1B2A4A;border-radius:6px;padding:6px 8px;margin-bottom:4px;">
        ${icons[s.kind]||'📌'} <strong>${s.kind.toUpperCase()}</strong> — ${s.count} found
        ${s.sample?.headers ? `<br><span style="color:#888;font-size:10px;">Columns: ${s.sample.headers.slice(0,4).join(', ')}</span>` : ''}
        ${s.sample?.fields ? `<br><span style="color:#888;font-size:10px;">Fields: ${s.sample.fields.slice(0,4).join(', ')}</span>` : ''}
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="margin-bottom:8px;">
        <div style="color:#B8961E;font-weight:bold;font-size:12px;">📄 ${a.type}</div>
        <div style="color:#666;font-size:10px;">${loginBadge}</div>
      </div>
      <div style="margin-bottom:8px;">
        <span style="color:#888;">Est. records: </span>
        <strong style="color:#B8961E;">${a.estimate || 'Unknown'}</strong>
        ${a.hasPagination ? ' &nbsp;| <span style="color:#0A6E6C;">Multi-page ✓</span>' : ''}
      </div>
      ${a.columns.length ? `<div style="color:#888;font-size:10px;margin-bottom:8px;">Columns: ${a.columns.slice(0,6).join(', ')}</div>` : ''}
      <div>${sourceHtml || '<span style="color:#666;">No structured data detected — try Jina tab</span>'}</div>
      <button onclick="document.querySelector('#sss-tab-scrape [data-tab=scrape]');document.getElementById('sss-go').click();" 
        style="width:100%;background:#1A6B3C;color:white;border:none;border-radius:7px;padding:8px;font-size:12px;cursor:pointer;margin-top:8px;">
        ▶ Scrape Now
      </button>
    `;
  }

  async function loadSettings() {
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (s?.jinaKey)   { const el=document.getElementById('sss-jina-key');   if(el) el.value=s.jinaKey; }
      if (s?.maxPages)  { const el=document.getElementById('sss-max-pages');  if(el) el.value=s.maxPages; }
      if (s?.exportFormat){ const el=document.getElementById('sss-export-fmt'); if(el) el.value=s.exportFormat; }
    } catch (_) {}
  }

  async function refreshJinaStats() {
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATS' });
      const totEl   = document.getElementById('sss-j-total');
      const callsEl = document.getElementById('sss-j-calls');
      if (totEl)   totEl.textContent   = (s?.total || 0).toLocaleString();
      if (callsEl) callsEl.textContent = (s?.count || 0).toLocaleString();
    } catch (_) {}
  }

  function setStatus(msg, bg='#0A6E6C') {
    const el=document.getElementById('sss-status'); if(el){el.textContent=msg;el.style.background=bg;}
  }
  function updateCounter() {
    const n=document.getElementById('sss-count'); if(n) n.textContent=capturedRecords.length;
    const bar=document.getElementById('sss-bar'); if(bar) bar.style.width=Math.min(100,(capturedRecords.length/500)*100)+'%';
  }
  function logToPanel(msg, color='#4a7070') {
    const el=document.getElementById('sss-log'); if(!el) return;
    const d=document.createElement('div'); d.style.color=color;
    d.textContent=`${new Date().toLocaleTimeString()} ${msg}`;
    el.appendChild(d); el.scrollTop=el.scrollHeight;
  }
  function jinaLog(msg) {
    const el=document.getElementById('sss-j-log'); if(!el) return;
    const d=document.createElement('div'); d.style.color='#4a7090';
    d.textContent=`${new Date().toLocaleTimeString()} ${msg}`;
    el.appendChild(d); el.scrollTop=el.scrollHeight;
  }

  function makeDraggable(el, handle) {
    let ox=0, oy=0, mx=0, my=0;
    handle.onmousedown = e => {
      e.preventDefault();
      ox=e.clientX; oy=e.clientY;
      document.onmousemove = ev => {
        mx=ox-ev.clientX; my=oy-ev.clientY;
        ox=ev.clientX; oy=ev.clientY;
        el.style.top = (el.offsetTop-my)+'px';
        el.style.left= (el.offsetLeft-mx)+'px';
        el.style.bottom='auto'; el.style.right='auto';
      };
      document.onmouseup = () => { document.onmousemove=null; document.onmouseup=null; };
    };
  }

  // ── Message listener ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type==='SHOW_PANEL') {
      const p=document.getElementById('sss-crawler-panel');
      if (p) p.style.display='block'; else createPanel();
      sendResponse({ok:true});
    }
    if (msg.type==='GET_DATA') sendResponse({data:capturedRecords, count:capturedRecords.length});
    if (msg.type==='ANALYZE') sendResponse(analyzePage());
    return true;
  });

  // ── Init ────────────────────────────────────────────────────────────────────
  const init = () => setTimeout(createPanel, 1500);
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', init) : init();

})();
