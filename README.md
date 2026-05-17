# SSS Crawler 🕷️

> **Universal Web Scraper & AI Crawler Chrome Extension**  
> by [Salahuddin Softtech Solutions](https://salahuddinss.com.bh)

![SSS Crawler](https://img.shields.io/badge/SSS-Crawler-1B2A4A?style=for-the-badge&logo=googlechrome&logoColor=B8961E)
![Version](https://img.shields.io/badge/version-1.1.0-B8961E?style=flat-square)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## What is SSS Crawler?

SSS Crawler is a Chrome Extension that lets you **scrape, analyze, and export data from any website** — including login-protected portals, JavaScript-heavy dashboards, and government databases.

Built for real-world use at SSS, it was originally developed to extract the full Bahrain business activity database from [sijilat.bh](https://sijilat.bh), and has since been expanded into a universal crawling tool.

---

## Features

### 🔍 Page Analyzer
Before scraping, analyze any page to detect:
- Data tables (including DataTables.js)
- Card/grid layouts
- Pagination (auto-detected)
- Login state (rides your existing session)
- Estimated record count
- Column headers

### ⚡ Universal Scraper
- **Scrape This Page** — instant extraction from tables, cards, lists, DataTable APIs
- **Scrape + All Pages** — auto-paginator crawls through every page automatically
- Intercepts XHR/Fetch responses to capture API data in real time
- Works on any site you're already logged into

### 🤖 Jina AI Integration
- Send any URL through [Jina Reader](https://jina.ai) for full JS rendering
- Real-time **token consumption tracking** — every call logged
- Persistent token ledger across sessions
- Shows tokens used, remaining, elapsed time per call

### 📊 Export Options
| Format | Description |
|--------|-------------|
| **Excel (.xls)** | Formatted, colour-coded, with metadata header |
| **CSV** | UTF-8 BOM encoded, ready for Excel/Sheets |
| **JSON** | Pretty-printed, structured output |

---

## Installation

### From Source (Developer Mode)

1. **Download or clone** this repository
   ```bash
   git clone https://github.com/murbati91/sss-crawler.git
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked**

5. Select the `sss-crawler` folder (the one containing `manifest.json`)

6. The SSS Crawler icon will appear in your toolbar

7. **Pin it** for easy access (click puzzle icon → pin SSS Crawler)

---

## Setup

### Add Your Jina API Key
1. Click the SSS Crawler icon in your toolbar
2. Go to the **⚙ SET** tab
3. Paste your [Jina API key](https://jina.ai)
4. Click **💾 Save Settings**

---

## Usage

### Quick Scrape
1. Go to any website (log in if needed — your session is used automatically)
2. Click the SSS Crawler icon
3. Click **ANALYZE** to see what data is available
4. Click **⚡ Scrape This Page**
5. Export as Excel, CSV, or JSON

### Scrape Multi-Page Tables
1. Navigate to a paginated table or list
2. Click **📄 Scrape + All Pages**
3. Extension auto-clicks Next → captures all pages
4. Export when complete

### Jina AI Scrape (JS-heavy sites)
1. Go to the **JINA** tab
2. Click **🤖 Fetch via Jina AI**
3. Jina renders the full page and returns clean content
4. Token usage shown in real time

---

## Architecture

```
sss-crawler/
├── manifest.json       # Chrome Extension Manifest v3
├── background.js       # Service worker: Jina API calls, token tracking, storage
├── content.js          # Injected into all pages: interceptors, extractors, floating UI
├── popup.html          # Extension popup (4 tabs: Scrape, Analyze, Jina, Settings)
├── popup.js            # Popup logic and event handlers
├── icon16.png          # Extension icons (SSS brand mark)
├── icon48.png
└── icon128.png
```

### Data Flow
```
User visits page
      ↓
content.js injected → intercepts XHR/Fetch
      ↓
API responses captured automatically
      ↓
User clicks Scrape → DOM extraction + API data merged
      ↓
background.js stores data across popup opens
      ↓
User exports → Excel/CSV/JSON downloaded
```

---

## Tech Stack

- **Manifest V3** Chrome Extension API
- **Vanilla JS** — zero dependencies in content/background scripts
- **Jina AI Reader API** — for JS-rendered page scraping
- **Chrome Storage API** — persistent token ledger and settings

---

## Use Cases

| Use Case | How |
|----------|-----|
| Government portals (Bahrain SIJILAT, RERA, etc.) | Login + Scrape All Pages |
| Company directories | Analyze → auto-detect cards → Scrape |
| E-commerce product listings | Paginate + export |
| CRM/ERP data export | API intercept captures data automatically |
| Research & competitive analysis | Jina AI + export |

---

## Roadmap

- [ ] Scheduled/recurring scrapes
- [ ] Webhook output (send data to n8n / Zapier)
- [ ] Claude AI integration for data categorization
- [ ] Export to Google Sheets
- [ ] Multi-tab parallel scraping
- [ ] MORPHEUS AI integration (SSS internal)

---

## Built By

**Salahuddin Softtech Solutions (SSS)**  
ISO 9001:2015 Certified | 25+ Years in the GCC Market  
🌐 [salahuddinss.com.bh](https://salahuddinss.com.bh)  
📧 faisal@salahuddinss.com.bh

**Director of Digital Growth:** Faisal Al-Murbati  
*Certified AI Expert | Blockchain Expert | Six Sigma Black Belt*

---

## License

MIT License — free to use, modify, and distribute with attribution.

---

<p align="center">
  <strong>Built with ❤️ by SSS — Kingdom of Bahrain</strong>
</p>
