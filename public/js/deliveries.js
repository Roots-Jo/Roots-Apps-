let allDeliveries = [];
let displayedDeliveries = [];
let statuses = [];
window.allDeliveries = [];
window.renderTable = null;

document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.getElementById('deliveries-table-body');
    const totalCountEl = document.getElementById('total-count');
    const shownCountEl = document.getElementById('shown-count');
    const toDeliverCountEl = document.getElementById('to-deliver-count');
    const deliveredCountEl = document.getElementById('delivered-count');
    const selectAllCb = document.getElementById('select-all-cb');
    const selectAllTbdCb = document.getElementById('select-all-tbd-cb');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const saveDeliveriesBtn = document.getElementById('save-deliveries-btn');
    const exportBtn = document.getElementById('export-btn');
    const statusMessage = document.getElementById('status-message');
    const themeToggle = document.getElementById('theme-toggle');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        });

        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            themeToggle.textContent = '☀️';
        }
    }
    
    // Filters
    const filterStartDate = document.getElementById('filter-start-date');
    const filterEndDate = document.getElementById('filter-end-date');
    const filterArea = document.getElementById('filter-area');
    const filterNeighborhood = document.getElementById('filter-neighborhood');
    const areaDatalist = document.getElementById('area-datalist');
    const neighborhoodDatalist = document.getElementById('neighborhood-datalist');

    // Manage Statuses
    const manageStatusBtn = document.getElementById('manage-status-btn');
    const statusModal = document.getElementById('status-modal');
    const closeStatusModalBtn = document.getElementById('close-status-modal-btn');
    const saveStatusBtn = document.getElementById('save-status-btn');
    const statusListEl = document.getElementById('status-list');
    const newStatusInput = document.getElementById('new-status-input');
    const addStatusBtn = document.getElementById('add-status-btn');
    
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
        statusMessage.classList.remove('hidden');
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 3000);
    }

    async function fetchData() {
        try {
            const [delRes, statRes] = await Promise.all([
                fetch('/data/deliveries.json?t=' + Date.now()),
                fetch('/data/statuses.json?t=' + Date.now())
            ]);
            
            if (delRes.ok) {
                const data = await delRes.json();
                allDeliveries = data || [];
                window.allDeliveries = allDeliveries;
            }
            if (statRes.ok) {
                statuses = await statRes.json();
            } else {
                statuses = ['Delivered', 'Returned', 'N/A', 'Attempt 1', 'To be updated'];
            }
            
            // Populate datalists
            const uniqueAreas = [...new Set(allDeliveries.map(d => d.mapped_area).filter(Boolean))].sort();
            const uniqueNeighborhoods = [...new Set(allDeliveries.map(d => d.mapped_neighborhood).filter(Boolean))].sort();
            
            if (areaDatalist) {
                areaDatalist.innerHTML = uniqueAreas.map(a => `<option value="${a}">`).join('');
            }
            if (neighborhoodDatalist) {
                neighborhoodDatalist.innerHTML = uniqueNeighborhoods.map(n => `<option value="${n}">`).join('');
            }
            
            applyFilters();
        } catch (e) {
            console.error(e);
            tableBody.innerHTML = `<tr><td colspan="16" style="padding: 12px; text-align: center; color: red;">Error loading data</td></tr>`;
        }
    }

    window.renderTable = function() {
        if (displayedDeliveries.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="16" style="padding: 12px; text-align: center;">No deliveries match filters.</td></tr>`;
        } else {
            let html = '';
            displayedDeliveries.forEach(del => {
                const dateOnly = del.order_created_at ? del.order_created_at.split(' ')[0] : '';
                const isChecked = del.toBeDelivered ? 'checked' : '';
                
                let statusOptions = statuses.map(st => 
                    `<option value="${st}" ${del.status === st ? 'selected' : ''}>${st}</option>`
                ).join('');
                
                // Ensure current status is in the dropdown even if removed from the master list
                if (del.status && !statuses.includes(del.status)) {
                    statusOptions += `<option value="${del.status}" selected>${del.status}</option>`;
                }

                const rowColor = del.status === 'Delivered' ? 'color: var(--green);' : '';

                html += `
                <tr style="border-bottom: 1px solid var(--bdr); scroll-snap-align: start; scroll-snap-stop: always; ${rowColor}">
                    <td style="padding: 12px;">
                        <input type="checkbox" class="row-cb" data-id="${del.order_id}">
                    </td>
                    <td style="padding: 12px;">${del.order_id || ''}</td>
                    <td style="padding: 12px;">${dateOnly}</td>
                    <td style="padding: 12px;">${del.customer_first_name || ''}</td>
                    <td style="padding: 12px;">${del.customer_last_name || ''}</td>
                    <td style="padding: 12px;">${del.billing_address_city || ''}</td>
                    <td style="padding: 12px;">${del.billing_address_state || ''}</td>
                    <td style="padding: 12px;">${del.billing_address_address1 || ''}</td>
                    <td style="padding: 12px;">${del.customer_mobile || ''}</td>
                    <td style="padding: 12px;">${del.invoice_total || ''}</td>
                    <td style="padding: 12px; text-align: center;">
                        <input type="checkbox" class="to-deliver-cb" data-id="${del.order_id}" style="transform: scale(1.5);" ${isChecked}>
                    </td>
                    <td style="padding: 12px;">
                        <select class="sbox status-dropdown" data-id="${del.order_id}" style="width: auto; height: 32px; padding: 0 8px; ${rowColor}">
                            ${statusOptions}
                        </select>
                    </td>
                    <td style="padding: 12px;">${del.mapped_area || ''}</td>
                    <td style="padding: 12px;">${del.mapped_area_ar || ''}</td>
                    <td style="padding: 12px;">${del.mapped_neighborhood || ''}</td>
                    <td style="padding: 12px;">${del.mapped_neighborhood_ar || ''}</td>
                    <td style="padding: 12px;">${(del.note || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                    <td style="padding: 12px;">
                        <button class="edit-mapping-btn" data-id="${del.order_id}" data-city="${(del.billing_address_city || '').replace(/"/g, '&quot;')}" data-addr="${(del.billing_address_address1 || '').replace(/"/g, '&quot;')}" data-area="${(del.mapped_area || '').replace(/"/g, '&quot;')}" data-area-ar="${(del.mapped_area_ar || '').replace(/"/g, '&quot;')}" data-neighborhood="${(del.mapped_neighborhood || '').replace(/"/g, '&quot;')}" data-neighborhood-ar="${(del.mapped_neighborhood_ar || '').replace(/"/g, '&quot;')}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; font-family: inherit; margin: 0; min-width: auto; height: 28px; border: 1px solid var(--orange); border-radius: 4px; background: transparent; color: var(--orange); cursor: pointer; transition: all 0.15s;">Edit</button>
                    </td>
                </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        updateCounters();
        attachRowListeners();
    }

    function applyFilters() {
        const start = filterStartDate.value;
        const end = filterEndDate.value;
        const area = filterArea.value.toLowerCase();
        const neighborhood = filterNeighborhood.value.toLowerCase();

        displayedDeliveries = allDeliveries.filter(del => {
            let matches = true;
            const dateOnly = del.order_created_at ? del.order_created_at.split(' ')[0] : '';
            
            if (start && dateOnly < start) matches = false;
            if (end && dateOnly > end) matches = false;
            if (area && !(del.mapped_area || '').toLowerCase().includes(area)) matches = false;
            if (neighborhood && !(del.mapped_neighborhood || '').toLowerCase().includes(neighborhood)) matches = false;

            return matches;
        });

        renderTable();
        
        // Reset select all
        selectAllCb.checked = false;
        deleteSelectedBtn.style.display = 'none';
    }

    function updateCounters() {
        totalCountEl.textContent = allDeliveries.length;
        shownCountEl.textContent = displayedDeliveries.length;
        
        const toDeliverCount = displayedDeliveries.filter(d => d.toBeDelivered).length;
        if(toDeliverCountEl) toDeliverCountEl.textContent = toDeliverCount;
        
        const deliveredCount = displayedDeliveries.filter(d => d.status === 'Delivered').length;
        if(deliveredCountEl) deliveredCountEl.textContent = deliveredCount;
    }

    function attachRowListeners() {
        // Toggle delete button based on selections
        const rowCbs = document.querySelectorAll('.row-cb');
        rowCbs.forEach(cb => {
            cb.addEventListener('change', () => {
                const anyChecked = Array.from(rowCbs).some(c => c.checked);
                deleteSelectedBtn.style.display = anyChecked ? 'inline-flex' : 'none';
                selectAllCb.checked = Array.from(rowCbs).every(c => c.checked);
            });
        });

        // Toggle 'To Be Delivered' for individual rows
        document.querySelectorAll('.to-deliver-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const order = allDeliveries.find(d => d.order_id === id);
                if (order) {
                    order.toBeDelivered = e.target.checked;
                    updateCounters();
                }
            });
        });

        // Update status
        document.querySelectorAll('.status-dropdown').forEach(dd => {
            dd.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const order = allDeliveries.find(d => d.order_id === id);
                if (order) {
                    order.status = e.target.value;
                    renderTable(); // Re-render to show color changes and update counter
                }
            });
        });
    }

    if (selectAllTbdCb) {
        selectAllTbdCb.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            displayedDeliveries.forEach(del => {
                del.toBeDelivered = isChecked;
            });
            renderTable();
            // Re-apply focus or checked state for the 'select all' since renderTable might redraw things (though the header is outside tbody)
            selectAllTbdCb.checked = isChecked;
        });
    }

    // Event Listeners for Filters
    filterStartDate.addEventListener('change', applyFilters);
    filterEndDate.addEventListener('change', applyFilters);
    filterArea.addEventListener('input', applyFilters);
    filterNeighborhood.addEventListener('input', applyFilters);

    selectAllCb.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.row-cb').forEach(cb => {
            cb.checked = isChecked;
        });
        deleteSelectedBtn.style.display = isChecked && displayedDeliveries.length > 0 ? 'inline-flex' : 'none';
    });

    deleteSelectedBtn.addEventListener('click', () => {
        const checkedCbs = document.querySelectorAll('.row-cb:checked');
        const idsToDelete = Array.from(checkedCbs).map(cb => cb.getAttribute('data-id'));
        
        if (confirm(`Are you sure you want to delete ${idsToDelete.length} row(s)?`)) {
            allDeliveries = allDeliveries.filter(d => !idsToDelete.includes(d.order_id));
            applyFilters();
            showStatus('Rows removed from view. Click Save Changes to apply.', 'success');
        }
    });

    saveDeliveriesBtn.addEventListener('click', async () => {
        const ogText = saveDeliveriesBtn.textContent;
        saveDeliveriesBtn.textContent = 'Saving...';
        saveDeliveriesBtn.disabled = true;
        try {
            const res = await fetch('/updateDeliveries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveries: allDeliveries })
            });
            if (res.ok) {
                showStatus('Deliveries saved successfully!', 'success');
            } else {
                showStatus('Failed to save deliveries.', 'error');
            }
        } catch (e) {
            console.error(e);
            showStatus('Network error while saving.', 'error');
        } finally {
            saveDeliveriesBtn.textContent = ogText;
            saveDeliveriesBtn.disabled = false;
        }
    });

    // --- Manage Statuses Modal Logic ---

    function renderStatusList() {
        statusListEl.innerHTML = statuses.map((st, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg); border: 1px solid var(--bdr); border-radius: 4px;">
                <span style="font-size: 14px; font-weight: 500; color: var(--dark);">${st}</span>
                <button type="button" class="remove-status-btn run-btn" data-index="${i}" style="margin: 0; padding: 4px 8px; background: var(--red); min-width: auto; height: 28px; font-size: 11px;">Remove</button>
            </div>
        `).join('');

        document.querySelectorAll('.remove-status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                statuses.splice(idx, 1);
                renderStatusList();
            });
        });
    }

    manageStatusBtn.addEventListener('click', () => {
        renderStatusList();
        statusModal.style.display = 'flex';
        statusModal.classList.remove('hidden');
    });

    closeStatusModalBtn.addEventListener('click', () => {
        statusModal.style.display = 'none';
        statusModal.classList.add('hidden');
        renderTable(); // Re-render table in case statuses were removed locally
    });

    addStatusBtn.addEventListener('click', () => {
        const newSt = newStatusInput.value.trim();
        if (newSt && !statuses.includes(newSt)) {
            statuses.push(newSt);
            newStatusInput.value = '';
            renderStatusList();
        }
    });

    saveStatusBtn.addEventListener('click', async () => {
        const ogText = saveStatusBtn.textContent;
        saveStatusBtn.textContent = 'Saving...';
        saveStatusBtn.disabled = true;
        try {
            const res = await fetch('/updateStatuses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statuses: statuses })
            });
            if (res.ok) {
                showStatus('Statuses saved!', 'success');
                statusModal.style.display = 'none';
                statusModal.classList.add('hidden');
                renderTable(); // Update dropdowns in the table
            } else {
                showStatus('Failed to save statuses.', 'error');
            }
        } catch (e) {
            console.error(e);
            showStatus('Network error while saving.', 'error');
        } finally {
            saveStatusBtn.textContent = ogText;
            saveStatusBtn.disabled = false;
        }
    });

    // --- CSV Conversion Logic ---
    function flattenObject(ob) {
        var toReturn = {};
        for (var i in ob) {
            if (!ob.hasOwnProperty(i)) continue;
            if ((typeof ob[i]) == 'object' && ob[i] !== null) {
                if (Array.isArray(ob[i])) {
                    toReturn[i] = JSON.stringify(ob[i]);
                } else {
                    var flatObject = flattenObject(ob[i]);
                    for (var x in flatObject) {
                        if (!flatObject.hasOwnProperty(x)) continue;
                        toReturn[i + '_' + x] = flatObject[x];
                    }
                }
            } else {
                toReturn[i] = ob[i];
            }
        }
        return toReturn;
    }

    function convertToCSV(ordersArray) {
        if (!ordersArray || ordersArray.length === 0) return '';
        const flattenedOrders = ordersArray.map(order => flattenObject(order));
        
        const headers = [
            "order_id", 
            "order_created_at", 
            "customer_first_name",
            "customer_last_name",
            "billing_address_city", 
            "billing_address_state",
            "billing_address_address1", 
            "customer_mobile", 
            "invoice_total",
            "toBeDelivered",
            "status",
            "mapped_area",
            "mapped_area_ar",
            "mapped_neighborhood",
            "mapped_neighborhood_ar",
            "note"
        ];
        
        const headerLabels = {
            "order_id": "Order ID",
            "order_created_at": "Created At",
            "customer_first_name": "First Name",
            "customer_last_name": "Last Name",
            "billing_address_city": "City",
            "billing_address_state": "State",
            "billing_address_address1": "Address 1",
            "customer_mobile": "Mobile",
            "invoice_total": "Total",
            "toBeDelivered": "To Be Delivered",
            "status": "Status",
            "mapped_area": "Mapped Area",
            "mapped_area_ar": "Mapped Area Ar",
            "mapped_neighborhood": "Neighborhood",
            "mapped_neighborhood_ar": "Neighborhood Ar",
            "note": "Note"
        };
        
        let csvString = '\uFEFF'; 
        csvString += headers.map(h => headerLabels[h] || h).join(',') + '\r\n';
        
        flattenedOrders.forEach(order => {
            const row = headers.map(header => {
                let cellValue = order[header] !== undefined && order[header] !== null ? order[header] : '';
                
                if (header === 'toBeDelivered') {
                    cellValue = cellValue ? 'Yes' : 'No';
                } else if (header === 'order_created_at' && cellValue) {
                    cellValue = cellValue.split(' ')[0];
                }
                
                cellValue = String(cellValue);
                if (header === 'customer_mobile' || header === 'billing_address_phone' || header === 'order_id') {
                    cellValue = `="${cellValue}"`;
                } else if (cellValue.includes(',') || cellValue.includes('"') || cellValue.includes('\n') || cellValue.includes('\r')) {
                    cellValue = `"${cellValue.replace(/"/g, '""')}"`;
                }
                return cellValue;
            });
            csvString += row.join(',') + '\r\n';
        });
        
        return csvString;
    }

    function downloadCSV(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (displayedDeliveries.length === 0) {
                showStatus('No deliveries to export.', 'error');
                return;
            }
            const csv = convertToCSV(displayedDeliveries);
            downloadCSV(csv, 'Deliveries.csv');
        });
    }

    fetchData();
});
