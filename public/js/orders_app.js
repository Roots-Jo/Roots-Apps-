document.addEventListener('DOMContentLoaded', () => {
    // Set default dates to today
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    startDateInput.value = today;
    endDateInput.value = today;

    const form = document.getElementById('fetch-form');
    const fetchBtn = document.getElementById('fetch-btn');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.getElementById('btn-loader');
    const statusMessage = document.getElementById('status-message');

    const tableContainer = document.getElementById('table-container');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const exportBtn = document.getElementById('export-btn');
    const sellersToggle = document.getElementById('sellers-toggle');
    const sellersToggleText = document.getElementById('sellers-toggle-text');
    const emptyState = document.getElementById('empty-state');
    const themeToggle = document.getElementById('theme-toggle');
    const tabsContainer = document.getElementById('tabs-container');
    const tabRaw = document.getElementById('tab-raw');
    const tabMapped = document.getElementById('tab-mapped');

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

    // Mapping Modal Elements
    const mappingModal = document.getElementById('mapping-modal');
    const modalAddressText = document.getElementById('modal-address-text');
    const newKeywordInput = document.getElementById('new-keyword');
    const areaDropdownToggle = document.getElementById('area-dropdown-toggle');
    const areaDropdownText = document.getElementById('area-dropdown-text');
    const areaDropdownMenu = document.getElementById('area-dropdown-menu');
    const areaSearchInput = document.getElementById('area-search-input');
    const areaOptionsList = document.getElementById('area-options-list');
    let selectedAreaValue = '';
    const saveMappingBtn = document.getElementById('save-mapping-btn');
    const cancelMappingBtn = document.getElementById('cancel-mapping-btn');
    const toggleNewAreaBtn = document.getElementById('toggle-new-area-btn');
    const newAreaFields = document.getElementById('new-area-fields');
    const newAreaEnInput = document.getElementById('new-area-en');
    const newAreaArInput = document.getElementById('new-area-ar');
    const neighborhoodEnInput = document.getElementById('neighborhood-en');
    const neighborhoodArInput = document.getElementById('neighborhood-ar');

    let currentView = 'raw';
    let currentPage = 1;
    let pageSize = 20;
    let baseMappings = [];
    let customMappings = JSON.parse(localStorage.getItem('customMappings')) || [];
    let outsideAmmanList = JSON.parse(localStorage.getItem('outsideAmmanList')) || [];
    let ignoreList = JSON.parse(localStorage.getItem('ignoreList')) || [];

    function normalizeArabic(text) {
        if (!text) return '';
        return text.replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[\u064B-\u0652]/g, '');
    }

    // Fetch base mappings
    fetch('../data/mapping.json')
        .then(res => res.json())
        .then(data => {
            baseMappings = data;
            populateAreaDropdown();
        })
        .catch(err => console.error('Failed to load mapping.json:', err));

    async function saveMappingsToServer(newMappings) {
        try {
            const response = await fetch('/saveMapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings: newMappings })
            });
            if (!response.ok) {
                console.error('Failed to save to master sheet:', await response.text());
            } else {
                console.log('Saved to master sheet successfully');
            }
        } catch (error) {
            console.error('Error saving mappings:', error);
        }
    }

    async function overwriteAllMappingsToServer(allMappings) {
        try {
            const response = await fetch('/updateMappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings: allMappings })
            });
            if (!response.ok) {
                console.error('Failed to update master sheet:', await response.text());
            } else {
                console.log('Updated master sheet successfully');
            }
        } catch (error) {
            console.error('Error updating mappings:', error);
        }
    }

    function populateAreaDropdown() {
        if (!areaOptionsList) return;
        const uniqueAreas = new Map();
        const allMappings = [...baseMappings, ...customMappings];

        allMappings.forEach(m => {
            if (m.area && !uniqueAreas.has(m.area)) {
                uniqueAreas.set(m.area, m.areaAr || '');
            }
        });

        let optionsHtml = '';
        const sortedAreas = Array.from(uniqueAreas.keys()).sort();
        sortedAreas.forEach(area => {
            const areaAr = uniqueAreas.get(area);
            const value = `${area}|${areaAr}`;
            const label = `${area} - ${areaAr}`;
            optionsHtml += `<div class="area-option" data-value="${value.replace(/"/g, '&quot;')}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--bdr); transition: background 0.15s;">${label}</div>`;
        });
        areaOptionsList.innerHTML = optionsHtml;

        // Attach click events to options
        const options = areaOptionsList.querySelectorAll('.area-option');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                selectedAreaValue = e.target.getAttribute('data-value');
                areaDropdownText.textContent = e.target.textContent;
                areaDropdownMenu.classList.add('hidden');
                areaDropdownMenu.style.display = 'none';
            });
            // Hover effect
            opt.addEventListener('mouseenter', (e) => {
                e.target.style.background = 'var(--bg-hover)';
            });
            opt.addEventListener('mouseleave', (e) => {
                e.target.style.background = 'transparent';
            });
        });
    }

    // Dropdown toggle logic
    if (areaDropdownToggle) {
        areaDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (areaDropdownToggle.classList.contains('disabled')) return;

            if (areaDropdownMenu.classList.contains('hidden')) {
                areaDropdownMenu.classList.remove('hidden');
                areaDropdownMenu.style.display = 'flex';
                areaSearchInput.value = '';
                areaSearchInput.focus();

                // Show all options initially
                const options = areaOptionsList.querySelectorAll('.area-option');
                options.forEach(opt => opt.style.display = 'block');
            } else {
                areaDropdownMenu.classList.add('hidden');
                areaDropdownMenu.style.display = 'none';
            }
        });
    }

    // Search logic
    if (areaSearchInput) {
        areaSearchInput.addEventListener('input', (e) => {
            const term = normalizeArabic(e.target.value.toLowerCase());
            const options = areaOptionsList.querySelectorAll('.area-option');
            options.forEach(opt => {
                if (normalizeArabic(opt.textContent.toLowerCase()).includes(term)) {
                    opt.style.display = 'block';
                } else {
                    opt.style.display = 'none';
                }
            });
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (areaDropdownMenu && !areaDropdownMenu.contains(e.target) && !areaDropdownToggle.contains(e.target)) {
            areaDropdownMenu.classList.add('hidden');
            areaDropdownMenu.style.display = 'none';
        }
    });

    // Tab Listeners
    if (tabRaw) {
        tabRaw.addEventListener('click', (e) => {
            e.preventDefault();
            currentView = 'raw';
            tabRaw.classList.add('active');
            tabRaw.style.borderBottomColor = 'var(--orange)';
            tabRaw.style.color = 'var(--orange)';
            tabMapped.classList.remove('active');
            tabMapped.style.borderBottomColor = 'transparent';
            tabMapped.style.color = 'var(--muted)';
            if (exportBtn) exportBtn.innerHTML = '<span>Export Raw Orders</span>';
            const addDeliveriesBtn = document.getElementById('add-deliveries-btn');
            if (addDeliveriesBtn) {
                addDeliveriesBtn.classList.add('hidden');
                addDeliveriesBtn.style.display = 'none';
            }
            if (fetchedOrders.length > 0) renderTable(fetchedOrders);
        });
    }

    if (tabMapped) {
        tabMapped.addEventListener('click', (e) => {
            e.preventDefault();
            currentView = 'mapped';
            tabMapped.classList.add('active');
            tabMapped.style.borderBottomColor = 'var(--orange)';
            tabMapped.style.color = 'var(--orange)';
            tabRaw.classList.remove('active');
            tabRaw.style.borderBottomColor = 'transparent';
            tabRaw.style.color = 'var(--muted)';
            if (exportBtn) exportBtn.innerHTML = '<span>Export Mapped Orders</span>';
            const addDeliveriesBtn = document.getElementById('add-deliveries-btn');
            if (addDeliveriesBtn) {
                addDeliveriesBtn.classList.remove('hidden');
                addDeliveriesBtn.style.display = 'inline-flex';
            }
            if (fetchedOrders.length > 0) renderTable(fetchedOrders);
        });
    }

    // Modal Listeners
    if (cancelMappingBtn) {
        cancelMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            mappingModal.classList.add('hidden');
            mappingModal.style.display = 'none';
        });
    }

    if (toggleNewAreaBtn) {
        toggleNewAreaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (newAreaFields.style.display === 'none' || newAreaFields.classList.contains('hidden')) {
                newAreaFields.style.display = 'block';
                newAreaFields.classList.remove('hidden');
                areaDropdownToggle.classList.add('disabled');
                areaDropdownToggle.style.opacity = '0.5';
                areaDropdownToggle.style.pointerEvents = 'none';
                toggleNewAreaBtn.textContent = 'Cancel New';
            } else {
                newAreaFields.style.display = 'none';
                newAreaFields.classList.add('hidden');
                areaDropdownToggle.classList.remove('disabled');
                areaDropdownToggle.style.opacity = '1';
                areaDropdownToggle.style.pointerEvents = 'auto';
                toggleNewAreaBtn.textContent = '+ New';
            }
        });
    }

    if (saveMappingBtn) {
        saveMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const kw = newKeywordInput.value.trim().toLowerCase();
            const isNewAreaVisible = newAreaFields && newAreaFields.style.display === 'block';
            let area = '';
            let areaAr = '';
            let neighborhood = neighborhoodEnInput ? neighborhoodEnInput.value.trim() : '';
            let neighborhoodAr = neighborhoodArInput ? neighborhoodArInput.value.trim() : '';

            if (isNewAreaVisible) {
                area = newAreaEnInput.value.trim();
                areaAr = newAreaArInput.value.trim();
            } else {
                if (selectedAreaValue) {
                    const parts = selectedAreaValue.split('|');
                    area = parts[0].trim();
                    areaAr = (parts[1] || '').trim();
                }
            }

            if (kw && area) {
                const keywords = kw.split(',').map(k => k.trim()).filter(k => k.length > 0);

                if (keywords.length === 0) {
                    alert('Please provide at least one valid keyword.');
                    return;
                }

                let newMappingsAdded = [];
                let requiresFullOverwrite = false;

                keywords.forEach(keyword => {
                    const newMap = { keyword: keyword, area: area, areaAr: areaAr, neighborhood: neighborhood, neighborhoodAr: neighborhoodAr };

                    // Check if it exists in baseMappings or customMappings to update it
                    let foundIndexBase = baseMappings.findIndex(m => m.keyword === keyword);
                    let foundIndexCustom = customMappings.findIndex(m => m.keyword === keyword);

                    if (foundIndexBase !== -1) {
                        baseMappings[foundIndexBase] = newMap;
                        requiresFullOverwrite = true;
                    } else if (foundIndexCustom !== -1) {
                        customMappings[foundIndexCustom] = newMap;
                        requiresFullOverwrite = true;
                    } else {
                        customMappings.push(newMap);
                        newMappingsAdded.push(newMap);
                    }
                });

                localStorage.setItem('customMappings', JSON.stringify(customMappings));

                if (requiresFullOverwrite) {
                    overwriteAllMappingsToServer([...baseMappings, ...customMappings]);
                } else if (newMappingsAdded.length > 0) {
                    saveMappingsToServer(newMappingsAdded);
                }

                // UI feedback
                const originalText = saveMappingBtn.textContent;
                saveMappingBtn.textContent = 'Saved!';
                saveMappingBtn.style.background = '#27ae60';
                setTimeout(() => {
                    saveMappingBtn.textContent = originalText;
                    saveMappingBtn.style.background = 'var(--orange)';
                    mappingModal.classList.add('hidden');
                    mappingModal.style.display = 'none';
                }, 800);

                if (isNewAreaVisible) {
                    populateAreaDropdown();
                }

                if (fetchedOrders.length > 0) renderTable(fetchedOrders);
            } else {
                alert('Please provide a keyword and select or enter an area.');
            }
        });
    }

    // Event delegation for table action buttons
    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('review-btn')) {
            const index = e.target.getAttribute('data-index');
            const flatOrder = flattenObject(fetchedOrders[index]);
            const city = (flatOrder.billing_address_city || '').trim();
            const addr = (flatOrder.billing_address_address1 || '').trim();
            const searchString = `${city} ${addr}`;

            modalAddressText.textContent = searchString;
            newKeywordInput.value = '';
            selectedAreaValue = '';
            areaDropdownText.textContent = 'Select an Area...';

            if (newAreaFields) {
                newAreaFields.style.display = 'none';
                newAreaFields.classList.add('hidden');
                areaDropdownToggle.classList.remove('disabled');
                areaDropdownToggle.style.opacity = '1';
                areaDropdownToggle.style.pointerEvents = 'auto';
                if (toggleNewAreaBtn) toggleNewAreaBtn.textContent = '+ New';
                if (newAreaEnInput) newAreaEnInput.value = '';
                if (newAreaArInput) newAreaArInput.value = '';
            }
            if (neighborhoodEnInput) neighborhoodEnInput.value = '';
            if (neighborhoodArInput) neighborhoodArInput.value = '';
            mappingModal.classList.remove('hidden');
            mappingModal.style.display = 'flex';
        } else if (e.target.classList.contains('edit-mapping-btn')) {
            const index = e.target.getAttribute('data-index');
            const keyword = e.target.getAttribute('data-keyword');
            const area = e.target.getAttribute('data-area');
            const areaAr = e.target.getAttribute('data-area-ar');
            const neighborhood = e.target.getAttribute('data-neighborhood');
            const neighborhoodAr = e.target.getAttribute('data-neighborhood-ar');

            const flatOrder = flattenObject(fetchedOrders[index]);
            const city = (flatOrder.billing_address_city || '').trim();
            const addr = (flatOrder.billing_address_address1 || '').trim();
            const searchString = `${city} ${addr}`;

            modalAddressText.textContent = searchString;
            newKeywordInput.value = keyword;

            // Set the selected value in the custom dropdown
            if (area) {
                selectedAreaValue = `${area}|${areaAr}`;
                areaDropdownText.textContent = `${area} - ${areaAr}`;
            } else {
                selectedAreaValue = '';
                areaDropdownText.textContent = 'Select an Area...';
            }

            if (newAreaFields) {
                newAreaFields.style.display = 'none';
                newAreaFields.classList.add('hidden');
                areaDropdownToggle.classList.remove('disabled');
                areaDropdownToggle.style.opacity = '1';
                areaDropdownToggle.style.pointerEvents = 'auto';
                if (toggleNewAreaBtn) toggleNewAreaBtn.textContent = '+ New';
                if (newAreaEnInput) newAreaEnInput.value = '';
                if (newAreaArInput) newAreaArInput.value = '';
            }
            if (neighborhoodEnInput) neighborhoodEnInput.value = neighborhood || '';
            if (neighborhoodArInput) neighborhoodArInput.value = neighborhoodAr || '';
            mappingModal.classList.remove('hidden');
            mappingModal.style.display = 'flex';
        } else if (e.target.classList.contains('outside-btn')) {
            const index = e.target.getAttribute('data-index');
            const flatOrder = flattenObject(fetchedOrders[index]);
            const city = (flatOrder.billing_address_city || '').trim();
            const addr = (flatOrder.billing_address_address1 || '').trim();
            const searchString = `${city} ${addr}`.toLowerCase();

            // Add to local outsideAmmanList instead of master sheet
            if (!outsideAmmanList.includes(searchString)) {
                outsideAmmanList.push(searchString);
                localStorage.setItem('outsideAmmanList', JSON.stringify(outsideAmmanList));
            }
            if (fetchedOrders.length > 0) renderTable(fetchedOrders);
        } else if (e.target.classList.contains('ignore-btn')) {
            const index = e.target.getAttribute('data-index');
            const flatOrder = flattenObject(fetchedOrders[index]);
            const city = (flatOrder.billing_address_city || '').trim();
            const addr = (flatOrder.billing_address_address1 || '').trim();
            const searchString = `${city} ${addr}`.toLowerCase();

            // Add to local ignoreList
            if (!ignoreList.includes(searchString)) {
                ignoreList.push(searchString);
                localStorage.setItem('ignoreList', JSON.stringify(ignoreList));
            }
            if (fetchedOrders.length > 0) renderTable(fetchedOrders);
        }
    });

    // Initialize toggle icon (if present)
    if (themeToggle) {
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            themeToggle.textContent = '☀️';
        } else {
            themeToggle.textContent = '🌙';
        }

        themeToggle.addEventListener('click', () => {
            if (document.documentElement.getAttribute('data-theme') === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.textContent = '🌙';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggle.textContent = '☀️';
            }
        });
    }

    const sellersContainer = document.getElementById('sellers-container');
    let allSellersData = [];
    let fetchedOrders = [];

    async function loadSellers() {
        try {
            const targetUrl = '/fetchSellers';
            const response = await fetch(targetUrl, {
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch sellers');
            const data = await response.json();
            allSellersData = data.data.sellers || [];

            if (allSellersData.length === 0) {
                sellersContainer.innerHTML = '<p style="padding:10px">No active sellers found.</p>';
                sellersToggleText.textContent = 'No Sellers';
                return;
            }

            // Build checkboxes
            let html = `<label class="seller-option"><input type="checkbox" id="all-sellers-cb" checked> <strong>All Sellers</strong></label>`;
            allSellersData.forEach(seller => {
                html += `<label class="seller-option"><input type="checkbox" class="seller-cb" value="${seller.code}" checked> ${seller.name} (${seller.code})</label>`;
            });
            sellersContainer.innerHTML = html;

            // Add event listeners for checkboxes
            const allCb = document.getElementById('all-sellers-cb');
            const indCbs = document.querySelectorAll('.seller-cb');

            function updateToggleText() {
                const checked = document.querySelectorAll('.seller-cb:checked');
                if (checked.length === indCbs.length) {
                    sellersToggleText.textContent = 'All Sellers';
                } else if (checked.length === 0) {
                    sellersToggleText.textContent = 'None Selected';
                } else {
                    sellersToggleText.textContent = `${checked.length} Selected`;
                }
            }

            allCb.addEventListener('change', (e) => {
                indCbs.forEach(cb => cb.checked = e.target.checked);
                updateToggleText();
            });

            indCbs.forEach(cb => {
                cb.addEventListener('change', () => {
                    const allChecked = Array.from(indCbs).every(c => c.checked);
                    allCb.checked = allChecked;
                    updateToggleText();
                });
            });

            updateToggleText();

            // Toggle Dropdown Visibility
            sellersToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                sellersContainer.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!document.getElementById('sellers-dropdown').contains(e.target)) {
                    sellersContainer.classList.remove('show');
                }
            });

        } catch (error) {
            console.error(error);
            sellersContainer.innerHTML = '<p class="error-text" style="color:red; font-size:14px; padding:10px;">Failed to load sellers.</p>';
            sellersToggleText.textContent = 'Error loading';
        }
    }

    loadSellers();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Get selected sellers
        const selectedSellerCheckboxes = document.querySelectorAll('.seller-cb:checked');
        const selectedSellers = Array.from(selectedSellerCheckboxes).map(cb => cb.value);

        if (selectedSellers.length === 0) {
            showStatus('Please select at least one seller.', 'error');
            return;
        }

        if (startDate > endDate) {
            showStatus('Start date cannot be after end date.', 'error');
            return;
        }

        setLoadingState(true);
        showStatus('Fetching orders... This may take a moment.', 'success');

        // Hide table/export until fetched
        tableContainer.classList.add('hidden');
        exportBtn.classList.add('hidden');
        emptyState.classList.remove('hidden');
        renderPagination(0);

        try {
            const targetUrl = '/fetchOrders';

            // Create exact local timestamps for precise filtering according to local timezone
            const startTimestamp = new Date(`${startDateInput.value}T00:00:00`).getTime();
            const endTimestamp = new Date(`${endDateInput.value}T23:59:59.999`).getTime();

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: {
                        startDate: startDateInput.value,
                        endDate: endDateInput.value,
                        startTimestamp: startTimestamp,
                        endTimestamp: endTimestamp,
                        sellers: selectedSellers
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const jsonResponse = await response.json();
            const orders = jsonResponse.data.orders || [];

            if (orders.length === 0) {
                showStatus(`No orders found between ${startDate} and ${endDate}.`, 'success');
                setLoadingState(false);
                return;
            }

            // Convert order_created_at to local time for display
            orders.forEach(order => {
                if (order.order_created_at) {
                    let createdAt = order.order_created_at;
                    if (!createdAt.includes('T')) createdAt = createdAt.replace(' ', 'T');
                    if (!createdAt.endsWith('Z') && !createdAt.includes('+')) createdAt += '+03:00';

                    const dateObj = new Date(createdAt);
                    if (!isNaN(dateObj.getTime())) {
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        const hours = String(dateObj.getHours()).padStart(2, '0');
                        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
                        order.order_created_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                    }
                }

                const delAt = order.shipment?.order_delivered_at || order.order_delivered_at || order.shipment?.delivered_at;
                if (delAt) {
                    let rawDel = delAt;
                    if (!rawDel.includes('T')) rawDel = rawDel.replace(' ', 'T');
                    if (!rawDel.endsWith('Z') && !rawDel.includes('+')) rawDel += '+03:00';
                    const delObj = new Date(rawDel);
                    if (!isNaN(delObj.getTime())) {
                        const year = delObj.getFullYear();
                        const month = String(delObj.getMonth() + 1).padStart(2, '0');
                        const day = String(delObj.getDate()).padStart(2, '0');
                        const hours = String(delObj.getHours()).padStart(2, '0');
                        const minutes = String(delObj.getMinutes()).padStart(2, '0');
                        const seconds = String(delObj.getSeconds()).padStart(2, '0');
                        if (order.shipment) {
                            order.shipment.order_delivered_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                        } else {
                            order.order_delivered_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                        }
                    }
                }
            });

            fetchedOrders = orders;
            currentPage = 1;

            // Render to HTML Table
            renderTable(fetchedOrders);

            emptyState.classList.add('hidden');
            tableContainer.classList.remove('hidden');
            if (tabsContainer) tabsContainer.classList.remove('hidden');
            exportBtn.classList.remove('hidden');
            exportBtn.innerHTML = currentView === 'raw' ? '<span>Export Raw Orders</span>' : '<span>Export Mapped Orders</span>';
            showStatus(`Successfully fetched ${orders.length} orders.`, 'success');

        } catch (error) {
            console.error('Fetch error:', error);
            showStatus(`Error fetching orders: ${error.message}`, 'error');
        } finally {
            setLoadingState(false);
        }
    });

    exportBtn.addEventListener('click', () => {
        if (fetchedOrders.length === 0) return;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (currentView === 'raw') {
            const csvData = convertToCSV(fetchedOrders);
            downloadCSV(csvData, `raw_orders_${startDate}_to_${endDate}.csv`);
        } else {
            const csvData = convertToMappedCSV(fetchedOrders);
            downloadCSV(csvData, `mapped_orders_${startDate}_to_${endDate}.csv`);
        }
    });

    function mapOrderToArea(city, addr) {
        city = (city || '').trim();
        addr = (addr || '').trim();
        const searchString = normalizeArabic(`${city} ${addr}`.toLowerCase());

        // Check outside amman first
        if (outsideAmmanList.some(kw => searchString.includes(normalizeArabic(kw.toLowerCase())))) {
            return { area: 'Outside Amman', areaAr: 'خارج عمان', keyword: searchString, neighborhood: '', neighborhoodAr: '' };
        }

        // Check ignore list
        if (ignoreList.some(kw => searchString.includes(normalizeArabic(kw.toLowerCase())))) {
            return { area: '', areaAr: '', keyword: searchString, neighborhood: '', neighborhoodAr: '' };
        }

        const allMappings = [...customMappings, ...baseMappings];

        for (const m of allMappings) {
            if (searchString.includes(normalizeArabic(m.keyword.toLowerCase()))) {
                return { area: m.area, areaAr: m.areaAr, keyword: m.keyword, neighborhood: m.neighborhood, neighborhoodAr: m.neighborhoodAr };
            }
        }
        return { area: 'Under Review', areaAr: '', keyword: '', neighborhood: '', neighborhoodAr: '' };
    }

    function renderPagination(totalCount) {
        const topBar = document.getElementById('pagination-bar-top');
        const bottomBar = document.getElementById('pagination-bar-bottom');

        if (!topBar && !bottomBar) return;

        if (!totalCount || totalCount === 0) {
            if (topBar) { topBar.innerHTML = ''; topBar.classList.add('hidden'); }
            if (bottomBar) { bottomBar.innerHTML = ''; bottomBar.classList.add('hidden'); }
            return;
        }

        const effectivePageSize = pageSize === 'all' ? totalCount : parseInt(pageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));

        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startItem = totalCount === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
        const endItem = pageSize === 'all' ? totalCount : Math.min(currentPage * effectivePageSize, totalCount);

        const barHtml = `
            <div class="pagination-left">
                <span class="pagination-info">Showing <strong>${startItem} - ${endItem}</strong> of <strong>${totalCount}</strong> orders</span>
            </div>
            <div class="pagination-right">
                <div class="pagination-size-wrapper">
                    <label>Rows:</label>
                    <select class="pagination-size-select">
                        <option value="20" ${pageSize == 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${pageSize == 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageSize == 100 ? 'selected' : ''}>100</option>
                        <option value="all" ${pageSize === 'all' ? 'selected' : ''}>All</option>
                    </select>
                </div>
                <div class="pagination-nav">
                    <button class="pagination-btn first-btn" ${currentPage === 1 ? 'disabled' : ''} title="First Page">«</button>
                    <button class="pagination-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
                    <span class="pagination-page-indicator">Page ${currentPage} of ${totalPages}</span>
                    <button class="pagination-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} title="Next Page">›</button>
                    <button class="pagination-btn last-btn" ${currentPage === totalPages ? 'disabled' : ''} title="Last Page">»</button>
                </div>
            </div>
        `;

        [topBar, bottomBar].forEach(bar => {
            if (!bar) return;
            bar.innerHTML = barHtml;
            bar.classList.remove('hidden');

            const sizeSelect = bar.querySelector('.pagination-size-select');
            sizeSelect?.addEventListener('change', (e) => {
                pageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
                currentPage = 1;
                renderTable(fetchedOrders);
            });

            const firstBtn = bar.querySelector('.first-btn');
            firstBtn?.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage = 1;
                    renderTable(fetchedOrders);
                }
            });

            const prevBtn = bar.querySelector('.prev-btn');
            prevBtn?.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable(fetchedOrders);
                }
            });

            const nextBtn = bar.querySelector('.next-btn');
            nextBtn?.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderTable(fetchedOrders);
                }
            });

            const lastBtn = bar.querySelector('.last-btn');
            lastBtn?.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage = totalPages;
                    renderTable(fetchedOrders);
                }
            });
        });
    }

    function renderTable(ordersArray) {
        if (!ordersArray || ordersArray.length === 0) {
            tableBody.innerHTML = '';
            renderPagination(0);
            return;
        }

        const totalCount = ordersArray.length;
        const effectivePageSize = pageSize === 'all' ? totalCount : parseInt(pageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));

        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * effectivePageSize;
        const endIndex = pageSize === 'all' ? totalCount : Math.min(startIndex + effectivePageSize, totalCount);

        const pageSlice = ordersArray.slice(startIndex, endIndex);
        const flattenedPageOrders = pageSlice.map(order => flattenObject(order));

        if (currentView === 'raw') {
            const headersSet = new Set();
            ordersArray.forEach(order => {
                const flat = flattenObject(order);
                Object.keys(flat).forEach(key => headersSet.add(key));
            });

            let headers = Array.from(headersSet).sort();
            const priorityCols = ["order_id", "order_created_at", "shipment_order_delivered_at", "billing_address_city", "billing_address_address1"];
            headers = headers.filter(h => !priorityCols.includes(h));
            headers = [...priorityCols, ...headers];

            tableHead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');

            let bodyHtml = '';
            flattenedPageOrders.forEach(order => {
                bodyHtml += '<tr>';
                headers.forEach(header => {
                    let cellValue = order[header] !== undefined && order[header] !== null ? order[header] : '';
                    cellValue = String(cellValue).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    bodyHtml += `<td>${cellValue}</td>`;
                });
                bodyHtml += '</tr>';
            });
            tableBody.innerHTML = bodyHtml;
        } else {
            // Mapped View
            const headers = [
                "order_id",
                "order_created_at",
                "shipment_order_delivered_at",
                "customer_first_name",
                "customer_last_name",
                "billing_address_city",
                "billing_address_state",
                "billing_address_address1",
                "customer_mobile",
                "invoice_total",
                "shipping_address_latitude",
                "shipping_address_longitude",
                "mapped_area",
                "mapped_area_ar",
                "mapped_neighborhood",
                "mapped_neighborhood_ar",
                "note"
            ];

            tableHead.innerHTML = headers.map(h => `<th>${h}</th>`).join('') + '<th>Action</th>';

            let bodyHtml = '';
            flattenedPageOrders.forEach((order, pageIdx) => {
                const originalIndex = startIndex + pageIdx;
                const city = order.billing_address_city || '';
                const addr = order.billing_address_address1 || '';
                const mapped = mapOrderToArea(city, addr);
                const area = mapped.area;
                const areaAr = mapped.areaAr || '';
                const neighborhood = mapped.neighborhood || '';
                const neighborhoodAr = mapped.neighborhoodAr || '';

                bodyHtml += '<tr>';
                headers.forEach(header => {
                    let cellValue = '';
                    if (header === 'mapped_area') {
                        cellValue = area;
                    } else if (header === 'mapped_area_ar') {
                        cellValue = areaAr;
                    } else if (header === 'mapped_neighborhood') {
                        cellValue = neighborhood;
                    } else if (header === 'mapped_neighborhood_ar') {
                        cellValue = neighborhoodAr;
                    } else if (header === 'shipping_address_latitude' || header === 'shipping_address_longitude') {
                        const val = order[header];
                        cellValue = (val !== undefined && val !== null && val !== 0 && val !== '0') ? val : '';
                    } else {
                        cellValue = order[header] !== undefined && order[header] !== null ? order[header] : '';
                    }
                    cellValue = String(cellValue).replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    if ((header === 'mapped_area' || header === 'mapped_area_ar') && area === 'Under Review') {
                        bodyHtml += `<td><span style="color: red; font-weight: bold;">${cellValue}</span></td>`;
                    } else {
                        bodyHtml += `<td>${cellValue}</td>`;
                    }
                });

                if (area === 'Under Review') {
                    bodyHtml += `<td style="display: flex; gap: 8px;">
                        <button class="review-btn run-btn" data-index="${originalIndex}" style="padding: 4px 8px; font-size: 11px; margin: 0; min-width: auto; height: 28px;">Add to Master Sheet</button>
                        <button class="outside-btn" data-index="${originalIndex}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; font-family: inherit; margin: 0; min-width: auto; height: 28px; border: none; border-radius: 4px; background: var(--red); color: var(--white); cursor: pointer; box-shadow: 0 2px 8px rgba(192, 57, 43, 0.35); transition: all 0.15s;">Outside Amman</button>
                        <button class="ignore-btn" data-index="${originalIndex}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; font-family: inherit; margin: 0; min-width: auto; height: 28px; border: 1px solid var(--bdr); border-radius: 4px; background: var(--bg); color: var(--muted); cursor: pointer; transition: all 0.15s;">Ignore</button>
                    </td>`;
                } else {
                    const escKw = (mapped.keyword || '').replace(/"/g, '&quot;');
                    const escArea = (mapped.area || '').replace(/"/g, '&quot;');
                    const escAreaAr = (mapped.areaAr || '').replace(/"/g, '&quot;');
                    const escNeighborhood = (mapped.neighborhood || '').replace(/"/g, '&quot;');
                    const escNeighborhoodAr = (mapped.neighborhoodAr || '').replace(/"/g, '&quot;');
                    bodyHtml += `<td>
                        <button class="edit-mapping-btn" data-index="${originalIndex}" data-keyword="${escKw}" data-area="${escArea}" data-area-ar="${escAreaAr}" data-neighborhood="${escNeighborhood}" data-neighborhood-ar="${escNeighborhoodAr}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; font-family: inherit; margin: 0; min-width: auto; height: 28px; border: 1px solid var(--orange); border-radius: 4px; background: transparent; color: var(--orange); cursor: pointer; transition: all 0.15s;">Edit</button>
                    </td>`;
                }

                bodyHtml += '</tr>';
            });
            tableBody.innerHTML = bodyHtml;
        }

        renderPagination(totalCount);
    }

    function setLoadingState(isLoading) {
        fetchBtn.disabled = isLoading;
        if (isLoading) {
            btnText.textContent = 'Fetching...';
            btnLoader.classList.remove('hidden');
        } else {
            btnText.textContent = 'Fetch Orders';
            btnLoader.classList.add('hidden');
        }
    }

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
        statusMessage.classList.remove('hidden');
    }

    const addDeliveriesBtnLocal = document.getElementById('add-deliveries-btn');
    if (addDeliveriesBtnLocal) {
        addDeliveriesBtnLocal.addEventListener('click', async () => {
            if (fetchedOrders.length === 0) return;
            if (currentView !== 'mapped') return;

            const ordersToDeliver = [];

            fetchedOrders.forEach(rawOrder => {
                const order = flattenObject(rawOrder);
                const city = order.billing_address_city || '';
                const addr = order.billing_address_address1 || '';
                const mapped = mapOrderToArea(city, addr);

                if (mapped.area !== undefined && mapped.area !== null && mapped.area.toLowerCase() !== 'outside amman' && mapped.area.toLowerCase() !== 'under review') {
                    const deliveryOrder = { ...order };
                    deliveryOrder.mapped_area = mapped.area;
                    deliveryOrder.mapped_area_ar = mapped.areaAr || '';
                    deliveryOrder.mapped_neighborhood = mapped.neighborhood || '';
                    deliveryOrder.mapped_neighborhood_ar = mapped.neighborhoodAr || '';
                    deliveryOrder.status = "N/A";
                    deliveryOrder.toBeDelivered = false;
                    ordersToDeliver.push(deliveryOrder);
                }
            });

            if (ordersToDeliver.length === 0) {
                showStatus('No valid mapped orders found. Make sure your orders are fully mapped (not "Under Review" or "Outside Amman").', 'error');
                return;
            }

            const originalText = addDeliveriesBtnLocal.innerHTML;
            addDeliveriesBtnLocal.innerHTML = '<span>Saving...</span>';
            addDeliveriesBtnLocal.disabled = true;

            try {
                const res = await fetch('/saveDeliveries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deliveries: ordersToDeliver })
                });
                if (!res.ok) throw new Error('Network error');
                showStatus(`Successfully added ${ordersToDeliver.length} orders to Deliveries!`, 'success');
            } catch (e) {
                console.error(e);
                showStatus('Failed to add orders to Deliveries', 'error');
            } finally {
                addDeliveriesBtnLocal.innerHTML = originalText;
                addDeliveriesBtnLocal.disabled = false;
            }
        });
    }

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
        const flattenedOrders = ordersArray.map(order => flattenObject(order));

        const headers = [
            "order_id",
            "order_created_at",
            "display_status",
            "customer_first_name",
            "customer_last_name",
            "billing_address_city",
            "billing_address_state",
            "billing_address_address1",
            "customer_mobile",
            "invoice_total",
            "invoice_total_due",
            "note"
        ];

        let csvString = '\uFEFF';
        csvString += headers.join(',') + '\r\n';

        flattenedOrders.forEach(order => {
            const row = headers.map(header => {
                let cellValue = order[header] !== undefined && order[header] !== null ? order[header] : '';

                cellValue = String(cellValue);

                // Force Excel to treat phone numbers and IDs as text by formatting them as a formula: ="value"
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

    function convertToMappedCSV(ordersArray) {
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
            "shipping_address_latitude",
            "shipping_address_longitude",
            "mapped_area",
            "mapped_area_ar",
            "mapped_neighborhood",
            "mapped_neighborhood_ar",
            "note"
        ];

        let csvString = '\uFEFF';
        csvString += headers.join(',') + '\r\n';

        flattenedOrders.forEach(order => {
            const city = order.billing_address_city || '';
            const addr = order.billing_address_address1 || '';
            const mapped = mapOrderToArea(city, addr);

            const row = headers.map(header => {
                let cellValue = '';
                if (header === 'mapped_area') {
                    cellValue = mapped.area;
                } else if (header === 'mapped_area_ar') {
                    cellValue = mapped.areaAr || '';
                } else if (header === 'mapped_neighborhood') {
                    cellValue = mapped.neighborhood || '';
                } else if (header === 'mapped_neighborhood_ar') {
                    cellValue = mapped.neighborhoodAr || '';
                } else if (header === 'shipping_address_latitude' || header === 'shipping_address_longitude') {
                    const val = order[header];
                    cellValue = (val !== undefined && val !== null && val !== 0 && val !== '0') ? val : '';
                } else {
                    cellValue = order[header] !== undefined && order[header] !== null ? order[header] : '';
                }

                cellValue = String(cellValue);

                // Force Excel to treat phone numbers and IDs as text
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
});
