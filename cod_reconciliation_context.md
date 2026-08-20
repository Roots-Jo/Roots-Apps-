
# COD Reconciliation Page Context

## HTML (roots_cod_dashboard.html)
`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title data-i18n="cod_title">Roots COD Reconciliation</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/roots_cod_dashboard.css">
<link rel="stylesheet" href="/css/navbar.css?v=10.0.7">
<script type="module" src="/js/auth.js"></script>
  <script>if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark');</script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js"></script>
<script src="/js/arabic.js?v=2"></script>
  </head>
<body>

  <div id="navbar"></div>
  <script src="/js/navbar.js?v=1.0.7"></script>

  <!-- Upload View -->
  <div id="uploadView">
    <div class="upload-hero">
      <h1 data-i18n="cod_hero_title">COD <span>Reconciliation</span></h1>
      <p data-i18n="cod_hero_sub">Upload your Orders and Shipping Partner sheets to reconcile</p>
      <button class="hbtn" id="viewHistoryBtn" style="margin-top: 15px; background: var(--bg); color: var(--dark); border: 1px solid var(--bdr);" data-i18n="cod_btn_history">View Past Reconciliations</button>
    </div>

    <div class="ugrid">
      <div class="drop-card" id="dropOrders">
        <div class="di">ðŸ“„</div>
        <div class="dsrc" data-i18n="cod_lbl_roots">ROOTS</div>
        <div class="dlbl" data-i18n="cod_hint_orders">Drop Orders CSV/Excel here</div>
        <div class="dhint" data-i18n="cod_hint_browse">or click to browse</div>
        <input type="file" id="ordersFile" accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel">
        <div class="dfiles" id="ordersFileList"></div>
      </div>

      <div class="drop-card" id="dropPartners">
        <div class="di">ðŸšš</div>
        <div class="dsrc" data-i18n="cod_lbl_partners">PARTNERS</div>
        <div class="dlbl" data-i18n="cod_hint_partners">Drop Shipping Partner Excel(s) here</div>
        <div class="dhint" data-i18n="cod_hint_browse_multi">or click to browse (multiple allowed)</div>
        <input type="file" id="partnersFiles" multiple accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel">
        <div class="dfiles" id="partnersFileList"></div>
      </div>
    </div>


    <button class="run-btn" id="runReconciliationBtn" disabled data-i18n="cod_btn_run">Run Reconciliation</button>
    <div class="run-err" id="runError"></div>
  </div>

  <!-- Dashboard View -->
  <div id="dashboardView">
    <div class="topbar">
      <div>
        <div class="topbar-title" data-i18n="cod_res_title">Reconciliation Results</div>
        <div class="topbar-meta" id="runMeta"></div>
      </div>
      <div class="cod-actions">
        <button class="hbtn btn-excel" id="downloadExcelBtn">
          <svg style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span data-i18n="cod_btn_excel">Download Excel</span>
        </button>
        <button class="hbtn" id="backToUploadBtn" data-i18n="cod_btn_back">Back</button>
      </div>
    </div>

    <div class="scards">
      <div class="sc dark">
        <div class="sc-l" data-i18n="cod_stat_total">Total COD to be Transferred</div>
        <div class="sc-v" id="statTotalCod">0 JOD</div>
        <div class="sc-s" data-i18n="cod_stat_total_sub">Matched orders (Partner Net)</div>
      </div>
      <div class="sc gc">
        <div class="sc-l" data-i18n="cod_stat_matched">Matched Orders</div>
        <div class="sc-v" id="statMatched">0</div>
        <div class="sc-s" data-i18n="cod_stat_matched_sub">Found in both sheets</div>
      </div>
      <div class="sc rc">
        <div class="sc-l" data-i18n="cod_stat_outliers">Outliers</div>
        <div class="sc-v" id="statOutliers">0</div>
        <div class="sc-s" data-i18n="cod_stat_outliers_sub">Mismatched or missing</div>
      </div>
      <div class="sc oc">
        <div class="sc-l" data-i18n="cod_stat_postpaid">Postpaid Verified</div>
        <div class="sc-v" id="statPostpaid">0</div>
        <div class="sc-s" data-i18n="cod_stat_postpaid_sub">COD Applicable = TRUE</div>
      </div>
    </div>

    <!-- Outliers Table -->
    <div class="orders-box">
      <div class="orders-hdr" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div class="tgrp">
          <div class="topbar-title" data-i18n="cod_outliers_list">Outliers List</div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <div style="position: relative; width: 240px;">
            <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted);" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" id="outliersSearch" data-i18n-placeholder="cod_search_ph" placeholder="Search Order ID..." class="outliers-filter search-input" style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid var(--bdr); border-radius: 8px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--dark); outline: none;">
          </div>
          <select id="outliersTypeFilter" class="outliers-filter filter-select" style="padding: 8px 12px; border: 1px solid var(--bdr); border-radius: 8px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--dark); outline: none;">
            <option value="All" data-i18n="cod_filter_all">All Types</option>
            <option value="Missing in Partners" data-i18n="cod_filter_missing_part">Missing in Partners</option>
            <option value="Not in Roots Orders" data-i18n="cod_filter_not_roots">Not in Roots Orders</option>
          </select>
        </div>
      </div>
      <div class="split-tables" style="display: flex; gap: 1rem; align-items: flex-start; margin-top: 1rem;">
        
        <!-- Matched Orders Table -->
        <div style="flex: 1; background: var(--bg); border: 1px solid var(--bdr); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--bdr); font-weight: 600;" data-i18n="cod_stat_matched">Matched Orders</div>
          <div class="twrap" style="max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="position: sticky; top: 0; background: var(--bg); box-shadow: 0 1px 0 var(--bdr);">
                <tr class="hrow">
                  <th style="padding: 10px 16px; text-align: left; font-size: 12px; color: var(--muted);" data-i18n="th_courier">Courier</th>
                  <th style="padding: 10px 16px; text-align: left; font-size: 12px; color: var(--muted);" data-i18n="th_order_ref">Order ID</th>
                  <th style="padding: 10px 16px; text-align: left; font-size: 12px; color: var(--muted);" data-i18n="th_amount">Amount</th>
                </tr>
              </thead>
              <tbody id="matchedTableBody">
              </tbody>
            </table>
          </div>
          <div class="pagination" id="matchedPagination" style="padding: 10px 16px; border-top: 1px solid var(--bdr); display: flex; justify-content: space-between; align-items: center;">
            <button id="matchedPrev" disabled style="padding: 6px 12px; border: 1px solid var(--bdr); background: transparent; border-radius: 6px; cursor: pointer;">Previous</button>
            <span id="matchedPageInfo" style="font-size: 12px; color: var(--muted);">Page 1 of 1</span>
            <button id="matchedNext" disabled style="padding: 6px 12px; border: 1px solid var(--bdr); background: transparent; border-radius: 6px; cursor: pointer;">Next</button>
          </div>
        </div>

        <!-- Outliers Table -->
        <div style="flex: 1; background: var(--bg); border: 1px solid var(--bdr); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--bdr); font-weight: 600;" data-i18n="cod_stat_outliers">Outliers</div>
          <div class="twrap" style="max-height: 400px; overflow-y: auto;">
        <table>
          <thead>
            <tr class="hrow">
              <th data-i18n="th_type">Type</th>
              <th data-i18n="th_order_ref">Order ID / Ref</th>
              <th data-i18n="th_amount">Amount</th>
              <th data-i18n="th_source">Source</th>
            </tr>
          </thead>
          <tbody id="outliersTableBody">
          </tbody>
        </table>
      </div>
      <div class="pagination" id="outliersPagination">
        <button id="outliersPrev" disabled>Previous</button>
        <span id="outliersPageInfo">Page 1 of 1</span>
            <button id="outliersNext" disabled style="padding: 6px 12px; border: 1px solid var(--bdr); background: transparent; border-radius: 6px; cursor: pointer;">Next</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- History Section moved to separate view -->
  </div>

  <!-- History View -->
  <div id="historyView" style="display: none; padding: 1.5rem 2rem;">
    <div class="topbar">
      <div>
        <div class="topbar-title" data-i18n="cod_hist_title">Past Reconciliations</div>
        <div class="topbar-meta" data-i18n="cod_hist_sub">Review all your previous COD runs</div>
      </div>
      <div class="cod-actions" style="position: static;">
        <button class="hbtn" id="backFromHistoryBtn" data-i18n="cod_btn_back_up">Back to Upload</button>
      </div>
    </div>
    <div class="orders-box" style="margin-top: 1rem;">
      <div class="twrap">
        <table>
          <thead>
            <tr class="hrow">
              <th data-i18n="th_run_id">Run ID</th>
              <th data-i18n="th_date">Date</th>
              <th data-i18n="th_total_cod">Total COD</th>
              <th data-i18n="th_matched_outliers">Matched / Outliers</th>
              <th data-i18n="th_status">Status</th>
              <th data-i18n="th_actions">Actions</th>
            </tr>
          </thead>
          <tbody id="historyTableBody">
          </tbody>
        </table>
      </div>
    </div>
  </div>

<script type="module" src="/js/roots_cod_dashboard.js"></script>
</body>
</html>




`

## JavaScript (roots_cod_dashboard.js)
`javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDd8w3D3i0fehq-uvyCzag3PbtknAuV0jQ",
  authDomain: "roots-weekly.firebaseapp.com",
  projectId: "roots-weekly",
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "roots-weekly.firebasestorage.app",
  messagingSenderId: "844033965231",
  appId: "1:844033965231:web:2269218005bc40d86be85a",
  measurementId: "G-YJZY8XN577"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Setup your new COD logic here

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// Auto-detection Keywords
const KEYWORDS_ID = ['order id', 'order_id', 'reference number', 'reference no', 'reference', 'tracking number'];
const KEYWORDS_AMT = ['cod amount', 'net', 'sender duo amt', 'amount', 'total cod', 'cod', 'total'];

function detectColumn(headers, keywords) {
  if (!headers || !headers.length) return null;
  // Exact match first
  for (let kw of keywords) {
    const idx = headers.findIndex(h => h && h.toString().toLowerCase().trim() === kw);
    if (idx !== -1) return headers[idx];
  }
  // Partial match fallback
  for (let kw of keywords) {
    const idx = headers.findIndex(h => h && h.toString().toLowerCase().trim().includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

let rootsFileObj = null;
let partnerFileObjs = [];
let reconciliationResult = null;
window.codHistoryData = {}; // For history downloads
let previousView = 'uploadView';
// Pagination & Filter State
let currentPage = 1;
const itemsPerPage = 25;
let filteredOutliers = [];

// UI Elements
const ui = {
  uploadView: document.getElementById('uploadView'),
  dashboardView: document.getElementById('dashboardView'),
  historyView: document.getElementById('historyView'),
  ordersFile: document.getElementById('ordersFile'),
  partnersFiles: document.getElementById('partnersFiles'),
  ordersFileList: document.getElementById('ordersFileList'),
  partnersFileList: document.getElementById('partnersFileList'),
  runBtn: document.getElementById('runReconciliationBtn'),
  runError: document.getElementById('runError'),
  dropOrders: document.getElementById('dropOrders'),
  dropPartners: document.getElementById('dropPartners'),
  viewHistoryBtn: document.getElementById('viewHistoryBtn'),
  backFromHistoryBtn: document.getElementById('backFromHistoryBtn'),
  
  // Dashboard elements
  statTotalCod: document.getElementById('statTotalCod'),
  statMatched: document.getElementById('statMatched'),
  statOutliers: document.getElementById('statOutliers'),
  statPostpaid: document.getElementById('statPostpaid'),
  
  matchedTableBody: document.getElementById('matchedTableBody'),
  matchedPrev: document.getElementById('matchedPrev'),
  matchedNext: document.getElementById('matchedNext'),
  matchedPageInfo: document.getElementById('matchedPageInfo'),
  
  outliersTableBody: document.getElementById('outliersTableBody'),
  historyTableBody: document.getElementById('historyTableBody'),
  downloadBtn: document.getElementById('downloadExcelBtn'),
  backBtn: document.getElementById('backToUploadBtn'),
  runMeta: document.getElementById('runMeta'),
  
  // Pagination & Filter Elements
  outliersSearch: document.getElementById('outliersSearch'),
  outliersTypeFilter: document.getElementById('outliersTypeFilter'),
  outliersPrev: document.getElementById('outliersPrev'),
  outliersNext: document.getElementById('outliersNext'),
  outliersPageInfo: document.getElementById('outliersPageInfo'),
};

// Event Listeners for File Selection
ui.ordersFile.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    ui.ordersFileList.innerHTML = `<div class="dfn">${file.name} (${t("cod_toast_parsing", "Parsing...")})</div>`;
    rootsFileObj = await parseFileForMapping(file, true);
    ui.ordersFileList.innerHTML = `<div class="dfn">${file.name}</div>`;
    ui.dropOrders.classList.add('loaded');
  } else {
    rootsFileObj = null;
    ui.ordersFileList.innerHTML = '';
    ui.dropOrders.classList.remove('loaded');
  }
  checkRunReady();
});

ui.partnersFiles.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    ui.partnersFileList.innerHTML = `<div class="dfn">${t("cod_toast_parsing", "Parsing...")} ${files.length} file(s)...</div>`;
    partnerFileObjs = [];
    for(let f of files) {
      partnerFileObjs.push(await parseFileForMapping(f, false));
    }
    ui.partnersFileList.innerHTML = files.map(f => `<div class="dfn">${f.name}</div>`).join('');
    ui.dropPartners.classList.add('loaded');
  } else {
    partnerFileObjs = [];
    ui.partnersFileList.innerHTML = '';
    ui.dropPartners.classList.remove('loaded');
  }
  checkRunReady();
});

// File Parser to extract headers and generic column indices
async function parseFileForMapping(file, isRoots = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonArr = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ''});
        
        let headerRowIdx = 0;
        let maxStrCount = 0;
        // Search top 25 rows to find the actual header row (the one with the most columns)
        for (let i = 0; i < Math.min(jsonArr.length, 25); i++) {
            if (jsonArr[i]) {
                const strCount = jsonArr[i].filter(x => x !== undefined && x !== null && String(x).trim() !== '').length;
                if (strCount > maxStrCount) {
                    maxStrCount = strCount;
                    headerRowIdx = i;
                }
            }
        }
        let headers = jsonArr[headerRowIdx] || [];

        const actualData = jsonArr.slice(headerRowIdx + 1).filter(r => r.length > 0);
        const maxCols = Math.max(...jsonArr.map(r => r.length));
        const columnOptions = [];
        
        for(let c=0; c<maxCols; c++) {
            let hName = headers[c] ? String(headers[c]).trim() : `Column ${c+1}`;
            columnOptions.push({ index: c, rawName: hName });
        }

        // Intelligent backend auto-detection
        const mapping = { id: null, ref: null, amt: null, fee: null, date: null, status: null };
        const findCol = (kws) => {
             for(let kw of kws) {
                 let idx = columnOptions.findIndex(o => o.rawName.toLowerCase().includes(kw));
                 if(idx !== -1) return idx;
             }
             return null;
        };

        if (isRoots) {
            mapping.id = findCol(['order id', 'tracking', 'awb']);
            mapping.ref = findCol(['reference', 'ref']);
            mapping.amt = findCol(['collection amount', 'cod amount', 'order amount', 'total']);
            mapping.fee = findCol(['delivery', 'shipping', 'fee']);
            mapping.date = findCol(['date', 'created', 'delivery date', 'delivered at']);
            mapping.status = findCol(['status', 'payment status', 'type']);
            mapping.courier = findCol(['courier', 'delivered by', 'shipping account', 'partner']);
        } else {
            mapping.id = findCol(['order id', 'tracking', 'awb']);
            mapping.ref = findCol(['reference', 'ref', 'client ref']);
            mapping.amt = findCol(['net', 'due to merchant', 'due amount', 'duo amt', 'amount', 'cod', 'total', 'amt']);
            mapping.fee = findCol(['delivery fee', 'shipping fee', 'fee', 'charge']);
            mapping.date = findCol(['date', 'delivered at', 'delivery date']);
            mapping.status = findCol(['payment status', 'status', 'type']);
        }
        
        if (mapping.amt !== null && headers[mapping.amt]) {
            const amtName = String(headers[mapping.amt]).toLowerCase();
            if (amtName.includes('net') || amtName.includes('due') || amtName.includes('duo')) {
                mapping.fee = null;
            }
        }

        // Fallbacks
        if (mapping.id === null && columnOptions.length > 0) mapping.id = 0;
        if (mapping.amt === null && columnOptions.length > 1) mapping.amt = 1;

        resolve({
          file: file,
          dataObjects: actualData, // array of arrays
          columnOptions: columnOptions,
          mapping: mapping
        });
      } catch (err) {
        alert("Error parsing file " + file.name + ": " + err.message);
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function checkRunReady() {
  let isReady = rootsFileObj != null && partnerFileObjs.length > 0;
  
  if (rootsFileObj) {
      if (rootsFileObj.mapping.id == null || rootsFileObj.mapping.amt == null) isReady = false;
  }
  for(let p of partnerFileObjs) {
      if (p.mapping.id == null || p.mapping.amt == null) isReady = false;
  }

  ui.runBtn.disabled = !isReady;
}

// Calculate numeric amount from a row given amtCol and feeCol
function extractDetails(row, m) {
    let amt = 0;
    if (m.amt != null && row[m.amt] != null) {
        amt = parseFloat(String(row[m.amt]).replace(/[^0-9.-]+/g,"")) || 0;
    }
    let fee = 0;
    if (m.fee != null && row[m.fee] != null) {
        fee = parseFloat(String(row[m.fee]).replace(/[^0-9.-]+/g,"")) || 0;
    }
    let date = '';
    if (m.date != null && row[m.date] != null) {
        date = String(row[m.date]).trim();
    }
    let status = '';
    if (m.status != null && row[m.status] != null) {
        status = String(row[m.status]).trim();
    }
    return { amt, fee, net: amt - fee, date, status };
}

// Run Reconciliation
ui.runBtn.addEventListener('click', async () => {
  ui.runError.textContent = '';
  ui.runBtn.textContent = t("cod_toast_processing", "Processing...");
  ui.runBtn.disabled = true;

  try {
    const rootsOrders = [];
    const rootsLookupMap = new Map();

    rootsFileObj.dataObjects.forEach(row => {
      const id = String(row[rootsFileObj.mapping.id] || '').trim();
      const refId = String(row[rootsFileObj.mapping.ref] || '').trim();
      let courier = '';
      if(rootsFileObj.mapping.courier !== null && rootsFileObj.mapping.courier !== undefined) {
          courier = String(row[rootsFileObj.mapping.courier] || '').trim();
      }
      
      if (id || refId) {
          const details = extractDetails(row, rootsFileObj.mapping);
          details.rootsId = id;
          details.rootsRef = refId;
          details.courier = courier;
          details.isMatched = false;
          rootsOrders.push(details);
          if (id) rootsLookupMap.set(id, details);
          if (refId) rootsLookupMap.set(refId, details);
      }
    });

    const partnerOrders = [];
    partnerFileObjs.forEach(pObj => {
      pObj.dataObjects.forEach(row => {
        const id = String(row[pObj.mapping.id] || '').trim();
        const refId = String(row[pObj.mapping.ref] || '').trim();
        if (id || refId) {
          const details = extractDetails(row, pObj.mapping);
          details.partnerId = id;
          details.partnerRef = refId;
          details.fileName = pObj.file.name;
          details.isMatched = false;
          partnerOrders.push(details);
        }
      });
    });

    let totalCodTransferred = 0;
    const finalReport = [];
    const outliers = [];
    let postpaidCount = 0;

    partnerOrders.forEach(pInfo => {
        let matchedRoots = null;
        if (pInfo.partnerId && rootsLookupMap.has(pInfo.partnerId)) matchedRoots = rootsLookupMap.get(pInfo.partnerId);
        else if (pInfo.partnerRef && rootsLookupMap.has(pInfo.partnerRef)) matchedRoots = rootsLookupMap.get(pInfo.partnerRef);

        if (matchedRoots) {
            matchedRoots.isMatched = true;
            pInfo.isMatched = true;
            
            totalCodTransferred += pInfo.net;
            postpaidCount++;
            
            finalReport.push({
              'ORDER ID': pInfo.partnerId || matchedRoots.rootsId,
              'COD Applicable': 'TRUE',
              'Order Amount': matchedRoots.amt || matchedRoots.net,
              'COD Amount': matchedRoots.net,
              'Shipping Fees (roots)': matchedRoots.fee,
              'Due to Merchant': pInfo.net,
              'ORDER DELIVERED AT': pInfo.date || matchedRoots.date || '',
              'PAYMENT STATUS': pInfo.status || matchedRoots.status || 'POSTPAID',
              'Courier': matchedRoots.courier || pInfo.fileName,
              'NOTES': ''
            });
        } else {
            outliers.push({
              type: 'Not in Roots Orders',
              id: pInfo.partnerId || pInfo.partnerRef,
              amount: pInfo.net,
              source: pInfo.fileName
            });
            finalReport.push({
               'ORDER ID': pInfo.partnerId || pInfo.partnerRef,
               'COD Applicable': 'FALSE',
               'Order Amount': pInfo.amt || pInfo.net,
               'COD Amount': pInfo.net,
               'Shipping Fees (roots)': pInfo.fee,
               'Due to Merchant': pInfo.net,
               'ORDER DELIVERED AT': pInfo.date || '',
               'PAYMENT STATUS': pInfo.status || '',
               'Courier': pInfo.fileName,
               'NOTES': 'Not in Roots Orders'
            });
        }
    });

    rootsOrders.forEach(rInfo => {
        if (!rInfo.isMatched) {
            const courierLower = rInfo.courier.toLowerCase();
            const isManual = courierLower && !courierLower.includes('skynet') && !courierLower.includes('click') && !courierLower.includes('wassel');
            
            if (isManual) {
                // Auto-match private driver
                totalCodTransferred += rInfo.net;
                postpaidCount++;
                finalReport.push({
                  'ORDER ID': rInfo.rootsId || rInfo.rootsRef,
                  'COD Applicable': 'TRUE',
                  'Order Amount': rInfo.amt || rInfo.net,
                  'COD Amount': rInfo.net,
                  'Shipping Fees (roots)': rInfo.fee,
                  'Due to Merchant': rInfo.net,
                  'ORDER DELIVERED AT': rInfo.date || '',
                  'PAYMENT STATUS': rInfo.status || 'POSTPAID',
                  'Courier': rInfo.courier || 'Private Driver',
                  'NOTES': 'Auto-matched private driver'
                });
            } else {
                outliers.push({
                  type: 'Missing in Partners',
                  id: rInfo.rootsId || rInfo.rootsRef,
                  amount: rInfo.net,
                  source: 'Roots Orders'
                });
                finalReport.push({
                   'ORDER ID': rInfo.rootsId || rInfo.rootsRef,
                   'COD Applicable': 'FALSE',
                   'Order Amount': rInfo.amt || rInfo.net,
                   'COD Amount': rInfo.net,
                   'Shipping Fees (roots)': rInfo.fee,
                   'Due to Merchant': 0,
                   'ORDER DELIVERED AT': '',
                   'PAYMENT STATUS': rInfo.status || '',
                   'Courier': rInfo.courier || 'SkyNet/Click',
                   'NOTES': 'Missing in Partners'
                });
            }
        }
    });

    reconciliationResult = {
      report: finalReport,
      outliers: outliers,
      totalCod: totalCodTransferred,
      matched: postpaidCount,
      timestamp: Date.now(),
      isTransferred: false // Default new runs to pending
    };

    await saveHistory(reconciliationResult);
    previousView = 'uploadView';
    showDashboard(reconciliationResult);

  } catch (err) {
    ui.runError.textContent = err.message;
  } finally {
    ui.runBtn.textContent = t("cod_btn_run", "Run Reconciliation");
    ui.runBtn.disabled = false;
  }
});

function showDashboard(res) {
  ui.uploadView.style.display = 'none';
  ui.historyView.style.display = 'none';
  ui.dashboardView.style.display = 'block';

  const dateStr = new Date(res.timestamp).toLocaleString();
  ui.runMeta.textContent = `Run Date: ${dateStr}`;

  ui.statTotalCod.textContent = `${res.totalCod.toFixed(3)} JOD`;
  ui.statMatched.textContent = res.matched;
  ui.statOutliers.textContent = res.outliers.length;
  ui.statPostpaid.textContent = res.matched; 

  // Reset pagination
  currentPage = 1;
  currentMatchedPage = 1;
  if(ui.outliersSearch) ui.outliersSearch.value = '';
  if(ui.outliersTypeFilter) ui.outliersTypeFilter.value = 'All';
  
  renderOutliers();
  renderMatched();
}

// Pagination & Filtering Logic
let currentMatchedPage = 1;

function renderMatched() {
  if (!reconciliationResult) return;
  const matchedOrders = reconciliationResult.report.filter(r => r['COD Applicable'] === 'TRUE' || r['COD Applicable'] === true);
  
  const totalPages = Math.ceil(matchedOrders.length / itemsPerPage) || 1;
  if (currentMatchedPage > totalPages) currentMatchedPage = totalPages;
  if (currentMatchedPage < 1) currentMatchedPage = 1;
  
  if (ui.matchedPageInfo) {
      ui.matchedPageInfo.textContent = `${t("cod_page", "Page")} ${currentMatchedPage} ${t("cod_of", "of")} ${totalPages} (${matchedOrders.length} ${t("cod_records", "records")})`;
  }
  
  if (ui.matchedPrev) ui.matchedPrev.disabled = currentMatchedPage === 1;
  if (ui.matchedNext) ui.matchedNext.disabled = currentMatchedPage === totalPages;
  
  const start = (currentMatchedPage - 1) * itemsPerPage;
  const pageData = matchedOrders.slice(start, start + itemsPerPage);
  
  if(ui.matchedTableBody) {
      ui.matchedTableBody.innerHTML = pageData.map(o => `
        <tr>
          <td><span class="badge" style="background: var(--light); color: var(--dark); border-color: var(--bdr);">${o.Courier || 'Partner'}</span></td>
          <td style="font-weight: 600;">${o['ORDER ID']}</td>
          <td>${Number(o['Due to Merchant']).toFixed(3)}</td>
        </tr>
      `).join('');
  }
}

function renderOutliers() {
  if (!reconciliationResult) return;
  
  const query = ui.outliersSearch ? ui.outliersSearch.value.toLowerCase().trim() : '';
  const typeFilter = ui.outliersTypeFilter ? ui.outliersTypeFilter.value : 'All';
  
  filteredOutliers = reconciliationResult.outliers.filter(o => {
     const matchQuery = String(o.id).toLowerCase().includes(query);
     const matchType = typeFilter === 'All' || o.type === typeFilter;
     return matchQuery && matchType;
  });
  
  const totalPages = Math.ceil(filteredOutliers.length / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  
  if (ui.outliersPageInfo) {
      ui.outliersPageInfo.textContent = `${t("cod_page", "Page")} ${currentPage} ${t("cod_of", "of")} ${totalPages} (${filteredOutliers.length} ${t("cod_records", "records")})`;
  }
  
  if (ui.outliersPrev) ui.outliersPrev.disabled = currentPage === 1;
  if (ui.outliersNext) ui.outliersNext.disabled = currentPage === totalPages;
  
  const start = (currentPage - 1) * itemsPerPage;
  const pageData = filteredOutliers.slice(start, start + itemsPerPage);
  
  ui.outliersTableBody.innerHTML = pageData.map(o => `
    <tr>
      <td><span class="badge ${o.type.includes('Missing') ? 'bc' : 'bo'}">${o.type}</span></td>
      <td style="font-weight: 600;">${o.id}</td>
      <td>${Number(o.amount).toFixed(3)}</td>
      <td style="color: var(--muted);">${o.source}</td>
    </tr>
  `).join('');
}

// Event listeners for pagination and filters
if (ui.outliersSearch) ui.outliersSearch.addEventListener('input', () => { currentPage = 1; renderOutliers(); });
if (ui.outliersTypeFilter) ui.outliersTypeFilter.addEventListener('change', () => { currentPage = 1; renderOutliers(); });
if (ui.outliersPrev) ui.outliersPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderOutliers(); } });
if (ui.outliersNext) ui.outliersNext.addEventListener('click', () => { 
  const totalPages = Math.ceil(filteredOutliers.length / itemsPerPage);
  if (currentPage < totalPages) { currentPage++; renderOutliers(); } 
});

if (ui.matchedPrev) ui.matchedPrev.addEventListener('click', () => { if (currentMatchedPage > 1) { currentMatchedPage--; renderMatched(); } });
if (ui.matchedNext) ui.matchedNext.addEventListener('click', () => { 
  const matchedOrders = reconciliationResult.report.filter(r => r['COD Applicable'] === 'TRUE' || r['COD Applicable'] === true);
  const totalPages = Math.ceil(matchedOrders.length / itemsPerPage);
  if (currentMatchedPage < totalPages) { currentMatchedPage++; renderMatched(); } 
});

// View Toggles
ui.viewHistoryBtn.addEventListener('click', () => {
  ui.uploadView.style.display = 'none';
  ui.dashboardView.style.display = 'none';
  ui.historyView.style.display = 'block';
});
ui.backFromHistoryBtn.addEventListener('click', () => {
  ui.historyView.style.display = 'none';
  ui.dashboardView.style.display = 'none';
  ui.uploadView.style.display = 'flex';
});

// Download Current Excel
ui.downloadBtn.addEventListener('click', async () => {
  if (!reconciliationResult) return;
  await generateExcelFile(reconciliationResult.report, reconciliationResult.outliers, new Date().toISOString().slice(0,10));
});

async function generateExcelFile(reportData, outliersData, dateStr) {
  const workbook = new ExcelJS.Workbook();
  const wsReport = workbook.addWorksheet('Reconciliation');
  
  if (reportData.length > 0) {
      const headers = Object.keys(reportData[0]);
      wsReport.columns = headers.map(h => ({ header: h, key: h, width: 22 }));
      
      reportData.forEach(row => {
          wsReport.addRow(row);
      });
      
      // Style header row
      const headerRow = wsReport.getRow(1);
      headerRow.eachCell((cell) => {
          cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF37828' }
          };
          cell.font = {
              color: { argb: 'FFFFFFFF' },
              bold: true
          };
          cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
          };
      });
  }

  const wsOutliers = workbook.addWorksheet('Outliers');
  if (outliersData.length > 0) {
      const headers = Object.keys(outliersData[0]);
      wsOutliers.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
      outliersData.forEach(row => {
          wsOutliers.addRow(row);
      });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `COD_Reconc_${dateStr}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Back Button
ui.backBtn.addEventListener('click', () => {
  ui.dashboardView.style.display = 'none';
  if (previousView === 'historyView') {
      ui.historyView.style.display = 'block';
  } else {
      ui.uploadView.style.display = 'flex';
  }
  
  rootsFileObj = null;
  partnerFileObjs = [];
  ui.ordersFileList.innerHTML = '';
  ui.partnersFileList.innerHTML = '';
  ui.ordersFile.value = '';
  ui.partnersFiles.value = '';
  ui.dropOrders.classList.remove('loaded');
  ui.dropPartners.classList.remove('loaded');
  checkRunReady();
});

// Firebase History
async function saveHistory(res) {
  const runId = `COD-REC-${res.timestamp}`;
  const histRef = ref(db, `roots_cod_dashboard/history_meta/${runId}`);
  const dataRef = ref(db, `roots_cod_dashboard/history_data/${runId}`);
  
  await set(histRef, {
    runId,
    timestamp: res.timestamp,
    totalCod: res.totalCod,
    matched: res.matched,
    outliersCount: res.outliers.length,
    isTransferred: res.isTransferred || false
  });
  
  await set(dataRef, {
    reportJson: JSON.stringify(res.report),
    outliersJson: JSON.stringify(res.outliers)
  });
}

function loadHistory() {
  const oldHistoryRef = ref(db, 'roots_cod_dashboard/history');
  get(oldHistoryRef).then(async (snapshot) => {
      const data = snapshot.val();
      if (data) {
          // Perform one-time migration to split data
          for (let key in data) {
              const run = data[key];
              if (run.reportJson) {
                  await set(ref(db, `roots_cod_dashboard/history_data/${key}`), {
                      reportJson: run.reportJson,
                      outliersJson: run.outliersJson
                  });
                  await set(ref(db, `roots_cod_dashboard/history_meta/${key}`), {
                      runId: run.runId,
                      timestamp: run.timestamp,
                      totalCod: run.totalCod,
                      matched: run.matched,
                      outliersCount: run.outliersCount,
                      isTransferred: run.isTransferred || false
                  });
                  await set(ref(db, `roots_cod_dashboard/history/${key}`), null); // delete old big node
              }
          }
      }
      
      // Listen only to lightweight meta
      const metaRef = ref(db, 'roots_cod_dashboard/history_meta');
      onValue(metaRef, (metaSnap) => {
        const metaData = metaSnap.val();
        if (!metaData) {
            if (ui.historyTableBody) ui.historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">${t("cod_toast_no_runs", "No runs found")}</td></tr>`;
            return;
        }
        
        window.codHistoryData = metaData;
        const runs = Object.values(metaData).sort((a, b) => b.timestamp - a.timestamp);
        
        if (ui.historyTableBody) {
          ui.historyTableBody.innerHTML = runs.map(r => {
            const isTransferred = r.isTransferred === true;
            const statusHtml = isTransferred 
              ? `<span class="badge bc" style="cursor:pointer;" onclick="toggleRunStatus('${r.runId}', true)" title="Click to mark Pending">${t("cod_transferred", "Transferred âœ“")}</span>`
              : `<span class="badge bo" style="cursor:pointer; background: #fff0eb; color: var(--orange);" onclick="toggleRunStatus('${r.runId}', false)" title="Click to mark Transferred">${t("cod_pending", "Pending")}</span>`;
              
            return `
            <tr>
              <td style="font-weight: 600; color: var(--orange);">${r.runId}</td>
              <td>${new Date(r.timestamp).toLocaleString()}</td>
              <td style="font-weight: 700;">${Number(r.totalCod).toFixed(3)} JOD</td>
              <td>
                 <span style="color: var(--green); font-weight: 600;">${r.matched}</span> / 
                 <span style="color: var(--red); font-weight: 600;">${r.outliersCount}</span>
              </td>
              <td>${statusHtml}</td>
              <td style="display: flex; gap: 5px;">
                 <button class="pay-btn" style="background: var(--bg); color: var(--dark); border: 1px solid var(--bdr);" onclick="viewHistoryRun('${r.runId}', this)">${t("cod_btn_view", "View")}</button>
                 <button class="pay-btn paid" onclick="downloadHistoryRun('${r.runId}', this)">${t("cod_btn_download", "Download")}</button>
                 <button class="pay-btn" style="background: var(--rbg); color: var(--red); border: 1px solid #f5c2c7;" onclick="deleteHistoryRun('${r.runId}', this)">${t("cod_btn_delete", "Delete")}</button>
              </td>
            </tr>
          `}).join('');
        }
      });
  });
}

// Global function for the inline onclick handlers
window.viewHistoryRun = async function(runId, btn) {
    btn.textContent = '...';
    btn.disabled = true;
    try {
        const dataRef = ref(db, `roots_cod_dashboard/history_data/${runId}`);
        const snap = await get(dataRef);
        const data = snap.val();
        if (data) {
            const report = JSON.parse(data.reportJson || '[]');
            const outliers = JSON.parse(data.outliersJson || '[]');
            const runInfo = window.codHistoryData[runId] || { timestamp: Date.now() };
            
            reconciliationResult = {
                report: report,
                outliers: outliers,
                totalCod: runInfo.totalCod || 0,
                matched: runInfo.matched || 0,
                timestamp: runInfo.timestamp
            };
            
            previousView = 'historyView';
            showDashboard(reconciliationResult);
        } else {
            alert("No heavy data found for this run.");
        }
    } catch(e) {
        alert("Error fetching historical data: " + e.message);
    } finally {
        btn.textContent = 'View';
        btn.disabled = false;
    }
};

window.downloadHistoryRun = function(runId, btn) {
    if (!window.codHistoryData || !window.codHistoryData[runId]) return;
    btn.textContent = '...';
    get(ref(db, `roots_cod_dashboard/history_data/${runId}`)).then((snapshot) => {
        const data = snapshot.val();
        if (data) {
             const report = JSON.parse(data.reportJson);
             const outliers = JSON.parse(data.outliersJson);
             const ts = window.codHistoryData[runId].timestamp;
             const d = new Date(ts).toISOString().slice(0,10);
             generateExcelFile(report, outliers, d).finally(() => {
                 btn.textContent = t("cod_btn_download", "Download");
             });
        }
    }).catch(err => {
        alert("Failed to download: " + err.message);
        btn.textContent = t("cod_btn_download", "Download");
    });
}

window.deleteHistoryRun = async function(runId, btn) {
    if (!confirm(`Are you sure you want to permanently delete this COD run (${runId})?`)) return;
    
    btn.textContent = '...';
    btn.disabled = true;
    try {
        await set(ref(db, `roots_cod_dashboard/history_meta/${runId}`), null);
        await set(ref(db, `roots_cod_dashboard/history_data/${runId}`), null);
    } catch (err) {
        alert("Error deleting run: " + err.message);
        btn.textContent = 'Delete';
        btn.disabled = false;
    }
}

window.toggleRunStatus = async function(runId, currentStatus) {
    const newStatus = !currentStatus;
    const histRef = ref(db, `roots_cod_dashboard/history_meta/${runId}`);
    try {
        await update(histRef, { isTransferred: newStatus });
    } catch (e) {
        alert("Failed to update status: " + e.message);
    }
};

// Initialize
loadHistory();

`

