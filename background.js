// SSS Crawler — background.js
// Handles Jina API calls, token consumption tracking, and data storage

const JINA_BASE = 'https://r.jina.ai/';
const JINA_SEARCH = 'https://s.jina.ai/';
let scrapedData = {};       // { tabId: [...records] }
let tokenLedger = [];       // { ts, url, tokens, cost }
let totalTokensUsed = 0;

// ── Jina Fetch ────────────────────────────────────────────────────────────────
async function jinaFetch(targetUrl, apiKey, options = {}) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'X-Return-Format': options.format || 'text',
  };

  if (options.engine)      headers['X-Engine']           = options.engine;
  if (options.timeout)     headers['X-Timeout']          = String(options.timeout);
  if (options.selector)    headers['X-Wait-For-Selector'] = options.selector;
  if (options.cookies)     headers['X-Set-Cookie']        = options.cookies;
  if (options.noCache)     headers['X-No-Cache']          = 'true';

  const jinaUrl = JINA_BASE + encodeURIComponent(targetUrl);

  const startTs = Date.now();
  let resp;
  try {
    resp = await fetch(jinaUrl, { headers, method: 'GET' });
  } catch (e) {
    return { ok: false, error: e.message, tokens: 0 };
  }

  // Read token headers
  const tokensUsed  = parseInt(resp.headers.get('x-token-used')         || resp.headers.get('x-tokens-used')         || '0');
  const tokensLeft  = parseInt(resp.headers.get('x-ratelimit-tokens-remaining') || resp.headers.get('x-tokens-remaining') || '-1');
  const requestId   = resp.headers.get('x-request-id') || '';
  const elapsed     = Date.now() - startTs;

  // Record in ledger
  const entry = {
    ts:       new Date().toISOString(),
    url:      targetUrl,
    tokens:   tokensUsed,
    remaining: tokensLeft,
    elapsed,
    requestId,
    status:   resp.status,
  };
  tokenLedger.push(entry);
  totalTokensUsed += tokensUsed;

  // Persist
  await chrome.storage.local.set({ tokenLedger, totalTokensUsed });

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: await resp.text(), tokens: tokensUsed };
  }

  const text = await resp.text();
  return { ok: true, text, tokens: tokensUsed, remaining: tokensLeft, elapsed, requestId };
}

// ── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case 'JINA_FETCH': {
        const { url, apiKey, options } = msg;
        const result = await jinaFetch(url, apiKey, options || {});
        sendResponse(result);
        break;
      }

      case 'GET_TOKEN_STATS': {
        const stored = await chrome.storage.local.get(['tokenLedger','totalTokensUsed']);
        sendResponse({
          ledger: stored.tokenLedger || tokenLedger,
          total:  stored.totalTokensUsed || totalTokensUsed,
          count:  (stored.tokenLedger || tokenLedger).length,
        });
        break;
      }

      case 'RESET_TOKEN_STATS': {
        tokenLedger = [];
        totalTokensUsed = 0;
        await chrome.storage.local.set({ tokenLedger: [], totalTokensUsed: 0 });
        sendResponse({ ok: true });
        break;
      }

      case 'STORE_DATA': {
        const tabId = sender.tab?.id || msg.tabId;
        if (!scrapedData[tabId]) scrapedData[tabId] = [];
        const incoming = msg.data || [];
        const existing = new Set(scrapedData[tabId].map(r => JSON.stringify(r)));
        incoming.forEach(r => {
          const k = JSON.stringify(r);
          if (!existing.has(k)) { scrapedData[tabId].push(r); existing.add(k); }
        });
        sendResponse({ count: scrapedData[tabId].length });
        break;
      }

      case 'GET_DATA': {
        const tabId = sender.tab?.id || msg.tabId;
        sendResponse({ data: scrapedData[tabId] || [], count: (scrapedData[tabId] || []).length });
        break;
      }

      case 'CLEAR_DATA': {
        const tabId = sender.tab?.id || msg.tabId;
        scrapedData[tabId] = [];
        sendResponse({ ok: true });
        break;
      }

      case 'GET_SETTINGS': {
        const s = await chrome.storage.local.get(['jinaKey','autoScrape','maxPages','exportFormat']);
        sendResponse(s);
        break;
      }

      case 'SAVE_SETTINGS': {
        await chrome.storage.local.set(msg.settings);
        sendResponse({ ok: true });
        break;
      }

      case 'SHOW_PANEL': {
        // Forward to content script
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' });
        } catch(e) {}
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true; // keep async channel open
});

// Load persisted data on start
(async () => {
  const s = await chrome.storage.local.get(['tokenLedger','totalTokensUsed']);
  if (s.tokenLedger)      tokenLedger      = s.tokenLedger;
  if (s.totalTokensUsed)  totalTokensUsed  = s.totalTokensUsed;
})();
