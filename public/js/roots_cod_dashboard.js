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
    ui.ordersFileList.innerHTML = `<div class="dfn">${file.name} (Parsing...)</div>`;
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
    ui.partnersFileList.innerHTML = `<div class="dfn">Parsing ${files.length} file(s)...</div>`;
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
        const mapping = { id: null, amt: null, fee: null };
        const findCol = (kws) => {
             for(let kw of kws) {
                 let idx = columnOptions.findIndex(o => o.rawName.toLowerCase().includes(kw));
                 if(idx !== -1) return idx;
             }
             return null;
        };

        if (isRoots) {
            mapping.id = findCol(['order id', 'reference', 'tracking', 'awb']);
            mapping.amt = findCol(['collection amount', 'cod amount', 'order amount', 'total']);
            mapping.fee = findCol(['delivery', 'shipping', 'fee']);
            mapping.date = findCol(['date', 'created', 'delivery date', 'delivered at']);
            mapping.status = findCol(['status', 'payment status', 'type']);
        } else {
            mapping.id = findCol(['order id', 'reference', 'tracking', 'awb', 'ref']);
            mapping.amt = findCol(['net', 'due amount', 'duo amt', 'amount', 'cod', 'total', 'amt']);
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
  ui.runBtn.textContent = 'Processing...';
  ui.runBtn.disabled = true;

  try {
    const rootsMap = new Map();
    rootsFileObj.dataObjects.forEach(row => {
      const id = String(row[rootsFileObj.mapping.id] || '').trim();
      if (id) {
          rootsMap.set(id, extractDetails(row, rootsFileObj.mapping));
      }
    });

    const partnerMap = new Map();
    partnerFileObjs.forEach(pObj => {
      pObj.dataObjects.forEach(row => {
        const id = String(row[pObj.mapping.id] || '').trim();
        if (id) {
          const details = extractDetails(row, pObj.mapping);
          details.fileName = pObj.file.name;
          partnerMap.set(id, details);
        }
      });
    });

    let totalCodTransferred = 0;
    const finalReport = [];
    const outliers = [];
    let postpaidCount = 0;

    // Check Roots vs Partners
    rootsMap.forEach((rInfo, id) => {
      if (partnerMap.has(id)) {
        const pInfo = partnerMap.get(id);
        totalCodTransferred += pInfo.net;
        postpaidCount++;
        
        finalReport.push({
          'ORDER ID': id,
          'COD Applicable': 'TRUE',
          'Order Amount': rInfo.amt || rInfo.net,
          'COD Amount': rInfo.net,
          'Shipping Fees (roots)': rInfo.fee,
          'Due to Merchant': pInfo.net,
          'ORDER DELIVERED AT': pInfo.date || rInfo.date || '',
          'PAYMENT STATUS': pInfo.status || rInfo.status || 'POSTPAID',
          'NOTES': ''
        });
      } else {
        outliers.push({
          type: 'Missing in Partners',
          id: id,
          amount: rInfo.net,
          source: 'Roots Orders'
        });
        finalReport.push({
           'ORDER ID': id,
           'COD Applicable': 'FALSE',
           'Order Amount': rInfo.amt || rInfo.net,
           'COD Amount': rInfo.net,
           'Shipping Fees (roots)': rInfo.fee,
           'Due to Merchant': 0,
           'ORDER DELIVERED AT': '',
           'PAYMENT STATUS': rInfo.status || '',
           'NOTES': 'Missing in Partners'
        });
      }
    });

    // Check Partners vs Roots
    partnerMap.forEach((pInfo, id) => {
      if (!rootsMap.has(id)) {
        outliers.push({
          type: 'Not in Roots Orders',
          id: id,
          amount: pInfo.net,
          source: pInfo.fileName
        });
        finalReport.push({
           'ORDER ID': id,
           'COD Applicable': 'FALSE',
           'Order Amount': pInfo.amt || pInfo.net,
           'COD Amount': pInfo.net,
           'Shipping Fees (roots)': pInfo.fee,
           'Due to Merchant': pInfo.net,
           'ORDER DELIVERED AT': pInfo.date || '',
           'PAYMENT STATUS': pInfo.status || '',
           'NOTES': 'Not in Roots Orders'
        });
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
    ui.runBtn.textContent = 'Run Reconciliation';
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
  if(ui.outliersSearch) ui.outliersSearch.value = '';
  if(ui.outliersTypeFilter) ui.outliersTypeFilter.value = 'All';
  
  renderOutliers();
}

// Pagination & Filtering Logic
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
      ui.outliersPageInfo.textContent = `Page ${currentPage} of ${totalPages} (${filteredOutliers.length} records)`;
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
            if (ui.historyTableBody) ui.historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No runs found</td></tr>';
            return;
        }
        
        window.codHistoryData = metaData;
        const runs = Object.values(metaData).sort((a, b) => b.timestamp - a.timestamp);
        
        if (ui.historyTableBody) {
          ui.historyTableBody.innerHTML = runs.map(r => {
            const isTransferred = r.isTransferred === true;
            const statusHtml = isTransferred 
              ? `<span class="badge bc" style="cursor:pointer;" onclick="toggleRunStatus('${r.runId}', true)" title="Click to mark Pending">Transferred ✓</span>`
              : `<span class="badge bo" style="cursor:pointer; background: #fff0eb; color: var(--orange);" onclick="toggleRunStatus('${r.runId}', false)" title="Click to mark Transferred">Pending</span>`;
              
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
                 <button class="pay-btn" style="background: var(--bg); color: var(--dark); border: 1px solid var(--bdr);" onclick="viewHistoryRun('${r.runId}', this)">View</button>
                 <button class="pay-btn paid" onclick="downloadHistoryRun('${r.runId}', this)">Download</button>
                 <button class="pay-btn" style="background: var(--rbg); color: var(--red); border: 1px solid #f5c2c7;" onclick="deleteHistoryRun('${r.runId}', this)">Delete</button>
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
                 btn.textContent = 'Download';
             });
        }
    }).catch(err => {
        alert("Failed to download: " + err.message);
        btn.textContent = 'Download';
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
