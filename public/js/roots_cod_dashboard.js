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

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

let apiOrders = [];
let partnerFileObjs = [];
let reconciliationResult = null;
window.codHistoryData = {};
let previousView = 'uploadView';
let currentPage = 1;
const itemsPerPage = 25;
let filteredOutliers = [];

const ui = {
  uploadView: document.getElementById('uploadView'),
  dashboardView: document.getElementById('dashboardView'),
  historyView: document.getElementById('historyView'),
  
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  fetchOrdersBtn: document.getElementById('fetchOrdersBtn'),
  fetchStatus: document.getElementById('fetchStatus'),
  previewContainer: document.getElementById('previewContainer'),
  previewCount: document.getElementById('previewCount'),
  previewTableBody: document.getElementById('previewTableBody'),

  partnersFiles: document.getElementById('partnersFiles'),
  partnersFileList: document.getElementById('partnersFileList'),
  runBtn: document.getElementById('runReconciliationBtn'),
  runError: document.getElementById('runError'),
  dropPartners: document.getElementById('dropPartners'),
  viewHistoryBtn: document.getElementById('viewHistoryBtn'),
  backFromHistoryBtn: document.getElementById('backFromHistoryBtn'),
  
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
  
  outliersSearch: document.getElementById('outliersSearch'),
  outliersTypeFilter: document.getElementById('outliersTypeFilter'),
  outliersPrev: document.getElementById('outliersPrev'),
  outliersNext: document.getElementById('outliersNext'),
  outliersPageInfo: document.getElementById('outliersPageInfo'),
};

// --- Fetching API Orders ---
ui.fetchOrdersBtn.addEventListener('click', async () => {
    if (!ui.startDate.value || !ui.endDate.value) {
        alert("Please select both Start Date and End Date.");
        return;
    }

    ui.fetchOrdersBtn.disabled = true;
    ui.fetchOrdersBtn.textContent = 'Fetching...';
    ui.fetchStatus.textContent = '';
    apiOrders = [];
    ui.previewContainer.style.display = 'none';
    checkRunReady();

    try {
        const startTs = new Date(ui.startDate.value + 'T00:00:00Z').getTime();
        const endTs = new Date(ui.endDate.value + 'T23:59:59Z').getTime();

        const payload = {
            data: {
                startDate: ui.startDate.value,
                endDate: ui.endDate.value,
                startTimestamp: startTs,
                endTimestamp: endTs,
                sellers: ["SEM", "BAM"]
            }
        };

        const url = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://127.0.0.1:5001/roots-weekly/us-central1/getCODOrders'
            : 'https://us-central1-roots-weekly.cloudfunctions.net/getCODOrders';

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const resData = await response.json();
        const rawOrders = resData?.data?.orders || [];
        
        // Filter out non-COD if needed, but for now we map them
        apiOrders = rawOrders.map(order => {
            const tags = Array.isArray(order.tags) ? order.tags.join(', ') : (order.tags || '');
            const note = order.note || '';
            const remarks = order.shipment_details?.remarks || '';
            
            // Reconstruct the mapping object
            return {
                id: String(order.order_id || ''),
                ref: String(order.order_alias || ''),
                amt: parseFloat(order.invoice?.total_due || order.invoice?.total || 0),
                fee: parseFloat(order.invoice?.shipping_price || 0),
                date: order.order_created_at || '',
                status: order.payment_method || 'POSTPAID',
                courier: order.shipment_details?.courier_partner_name || order.shipment?.courier_partner?.name || '',
                tags: tags,
                note: note,
                remarks: remarks,
                originalOrder: order
            };
        });

        ui.previewCount.textContent = apiOrders.length;
        
        ui.previewTableBody.innerHTML = apiOrders.map(o => `
            <tr>
                <td><b>${o.id}</b></td>
                <td>${new Date(o.date).toLocaleDateString()}</td>
                <td>${o.amt.toFixed(3)} JOD</td>
                <td><span class="badge" style="background:#eee;color:#333;border:1px solid #ccc">${o.status}</span></td>
                <td>${o.tags}</td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${o.note}">${o.note}</td>
                <td>${o.remarks}</td>
            </tr>
        `).join('');

        ui.previewContainer.style.display = 'block';
        ui.fetchStatus.textContent = `Successfully fetched ${apiOrders.length} orders.`;
        ui.fetchStatus.style.color = "green";

    } catch (e) {
        console.error(e);
        ui.fetchStatus.textContent = `Error fetching orders: ${e.message}`;
        ui.fetchStatus.style.color = "red";
    } finally {
        ui.fetchOrdersBtn.disabled = false;
        ui.fetchOrdersBtn.textContent = 'Fetch COD Orders';
        checkRunReady();
    }
});


// --- Upload Partner Files ---
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

        const mapping = { id: null, ref: null, amt: null, fee: null, date: null, status: null };
        const findCol = (kws) => {
             for(let kw of kws) {
                 let idx = columnOptions.findIndex(o => o.rawName.toLowerCase().includes(kw));
                 if(idx !== -1) return idx;
             }
             return null;
        };

        mapping.id = findCol(['order id', 'tracking', 'awb']);
        mapping.ref = findCol(['reference', 'ref', 'client ref']);
        mapping.amt = findCol(['net', 'due to merchant', 'due amount', 'duo amt', 'amount', 'cod', 'total', 'amt']);
        mapping.fee = findCol(['delivery fee', 'shipping fee', 'fee', 'charge']);
        mapping.date = findCol(['date', 'delivered at', 'delivery date']);
        mapping.status = findCol(['payment status', 'status', 'type']);
        
        if (mapping.amt !== null && headers[mapping.amt]) {
            const amtName = String(headers[mapping.amt]).toLowerCase();
            if (amtName.includes('net') || amtName.includes('due') || amtName.includes('duo')) {
                mapping.fee = null;
            }
        }

        if (mapping.id === null && columnOptions.length > 0) mapping.id = 0;
        if (mapping.amt === null && columnOptions.length > 1) mapping.amt = 1;

        resolve({
          file: file,
          dataObjects: actualData,
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
  let isReady = apiOrders.length > 0 && partnerFileObjs.length > 0;
  for(let p of partnerFileObjs) {
      if (p.mapping.id == null || p.mapping.amt == null) isReady = false;
  }
  ui.runBtn.disabled = !isReady;
}

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

// --- Run Reconciliation ---
ui.runBtn.addEventListener('click', async () => {
  ui.runError.textContent = '';
  ui.runBtn.textContent = t("cod_toast_processing", "Processing...");
  ui.runBtn.disabled = true;

  try {
    const rootsOrders = [];
    const rootsLookupMap = new Map();

    apiOrders.forEach(o => {
      const details = {
          rootsId: o.id,
          rootsRef: o.ref,
          amt: o.amt,
          fee: o.fee,
          net: o.amt - o.fee,
          date: o.date,
          status: o.status,
          courier: o.courier,
          tags: o.tags,
          note: o.note,
          remarks: o.remarks,
          isMatched: false
      };
      rootsOrders.push(details);
      if (o.id) rootsLookupMap.set(o.id, details);
      if (o.ref) rootsLookupMap.set(o.ref, details);
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
              'API Tags': matchedRoots.tags,
              'API Remarks': matchedRoots.remarks,
              'API Note': matchedRoots.note
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
               'API Tags': '',
               'API Remarks': '',
               'API Note': ''
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
                  'API Tags': rInfo.tags,
                  'API Remarks': rInfo.remarks,
                  'API Note': rInfo.note
                });
            } else {
                outliers.push({
                  type: 'Missing in Partners',
                  id: rInfo.rootsId || rInfo.rootsRef,
                  amount: rInfo.net,
                  source: 'Roots Orders API'
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
                   'API Tags': rInfo.tags,
                   'API Remarks': rInfo.remarks,
                   'API Note': rInfo.note
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
      isTransferred: false
    };

    // Note: We skip saveHistory for now or can implement it later
    // await saveHistory(reconciliationResult);
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

  currentPage = 1;
  currentMatchedPage = 1;
  if(ui.outliersSearch) ui.outliersSearch.value = '';
  if(ui.outliersTypeFilter) ui.outliersTypeFilter.value = 'All';
  
  renderOutliers();
  renderMatched();
}

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

ui.viewHistoryBtn.addEventListener('click', () => {
  ui.uploadView.style.display = 'none';
  ui.dashboardView.style.display = 'none';
  ui.historyView.style.display = 'block';
});
ui.backFromHistoryBtn.addEventListener('click', () => {
  ui.historyView.style.display = 'none';
  ui.dashboardView.style.display = 'none';
  ui.uploadView.style.display = 'block'; // Or whatever display was default
});

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

ui.backBtn.addEventListener('click', () => {
  ui.dashboardView.style.display = 'none';
  if (previousView === 'historyView') {
    ui.historyView.style.display = 'block';
  } else {
    ui.uploadView.style.display = 'block';
  }
});
