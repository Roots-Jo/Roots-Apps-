# Roots — Fulfilment KPI Dashboard

Live dashboard for Roots e-fulfilment operations. Reads order data from a Google Sheet and calculates KPIs automatically.

## Business Rules Built In
- **Friday excluded** from all working-hour calculations
- **10 PM cutoff**: orders before 10pm must ship next working day; after 10pm, day after next
- **SLA breach flagging**: any order shipped past its deadline is flagged
- **Shipped vs Delivered split**: internal metrics (what we control) separated from courier time

## Setup (5 minutes)

### 1. Create the Google Sheet
- Go to [sheets.new](https://sheets.new)
- Open your orders CSV export, select all, paste into cell A1
- Rename the sheet tab to `Orders`
- Share → "Anyone with the link" → Viewer

### 2. Configure the Dashboard
- Edit `config.js` and replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID
- The Sheet ID is the long string in the URL: `docs.google.com/spreadsheets/d/THIS_PART/edit`

### 3. Deploy to Netlify
- Push this folder to a GitHub repo
- Connect the repo to Netlify (or drag-and-drop the folder at app.netlify.com/drop)
- Your dashboard is live!

## Weekly Update Workflow
1. Export orders CSV from your system
2. Open the Google Sheet
3. Clear existing data (Ctrl+A → Delete)
4. Paste the new CSV data
5. Dashboard updates automatically on next page load

## Tabs
- **Overview** — top-level KPIs, pipeline flow, revenue
- **SLA Compliance** — before/after 10pm split, by merchant, by day
- **Merchants** — comparison table with SLA rates and fulfilment speed
- **Breached Orders** — full audit trail of every late shipment
- **Suggested KPIs** — recommended metrics and action items

## Tech Stack
- Pure HTML/CSS/JS (no build step)
- PapaParse for CSV parsing
- Google Sheets public CSV API (no API key needed)
- Netlify for hosting
