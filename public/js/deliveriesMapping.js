let baseMappings = [];
let customMappings = JSON.parse(localStorage.getItem('customMappings')) || [];

function normalizeArabic(text) {
    if (!text) return '';
    return text.replace(/[أإآ]/g, 'ا')
               .replace(/ة/g, 'ه')
               .replace(/ى/g, 'ي')
               .replace(/[\u064B-\u0652]/g, '');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/data/mapping.json');
        if (res.ok) baseMappings = await res.json();
    } catch (e) { console.error('Error loading base mappings', e); }

    const mappingModal = document.getElementById('mapping-modal');
    const cancelMappingBtn = document.getElementById('cancel-mapping-btn');
    const saveMappingBtn = document.getElementById('save-mapping-btn');
    const modalAddressText = document.getElementById('modal-address-text');
    const newKeywordInput = document.getElementById('new-keyword');
    const areaDropdownToggle = document.getElementById('area-dropdown-toggle');
    const areaDropdownMenu = document.getElementById('area-dropdown-menu');
    const areaSearchInput = document.getElementById('area-search-input');
    const areaOptionsList = document.getElementById('area-options-list');
    const areaDropdownText = document.getElementById('area-dropdown-text');
    const toggleNewAreaBtn = document.getElementById('toggle-new-area-btn');
    const newAreaFields = document.getElementById('new-area-fields');
    const newAreaEnInput = document.getElementById('new-area-en');
    const newAreaArInput = document.getElementById('new-area-ar');
    const neighborhoodEnInput = document.getElementById('neighborhood-en');
    const neighborhoodArInput = document.getElementById('neighborhood-ar');

    let selectedAreaValue = '';

    function populateAreaDropdown() {
        const uniqueAreas = new Map();
        [...baseMappings, ...customMappings].forEach(m => {
            if (m.area) uniqueAreas.set(m.area, m.areaAr || '');
        });

        const sorted = Array.from(uniqueAreas.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        let html = '';
        sorted.forEach(([en, ar]) => {
            html += `<div class="area-option" style="padding: 8px 12px; cursor: pointer; transition: background 0.1s;" data-value="${en}|${ar}">
                        <strong>${en}</strong> <span style="color:var(--muted); font-size:0.9em; float:right;">${ar}</span>
                     </div>`;
        });
        areaOptionsList.innerHTML = html;

        areaOptionsList.querySelectorAll('.area-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = e.currentTarget.getAttribute('data-value');
                selectedAreaValue = val;
                const parts = val.split('|');
                areaDropdownText.textContent = `${parts[0]} - ${parts[1]}`;
                areaDropdownMenu.classList.add('hidden');
                areaDropdownMenu.style.display = 'none';
            });
            opt.addEventListener('mouseenter', (e) => { e.currentTarget.style.background = 'var(--bg-hover)'; });
            opt.addEventListener('mouseleave', (e) => { e.currentTarget.style.background = 'transparent'; });
        });
    }

    populateAreaDropdown();

    if (areaDropdownToggle) {
        areaDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (areaDropdownToggle.classList.contains('disabled')) return;
            if (areaDropdownMenu.classList.contains('hidden')) {
                areaDropdownMenu.classList.remove('hidden');
                areaDropdownMenu.style.display = 'flex';
                areaSearchInput.value = '';
                areaSearchInput.focus();
                areaOptionsList.querySelectorAll('.area-option').forEach(opt => opt.style.display = 'block');
            } else {
                areaDropdownMenu.classList.add('hidden');
                areaDropdownMenu.style.display = 'none';
            }
        });
    }

    if (areaSearchInput) {
        areaSearchInput.addEventListener('input', (e) => {
            const term = normalizeArabic(e.target.value.toLowerCase());
            areaOptionsList.querySelectorAll('.area-option').forEach(opt => {
                opt.style.display = normalizeArabic(opt.textContent.toLowerCase()).includes(term) ? 'block' : 'none';
            });
        });
    }

    document.addEventListener('click', (e) => {
        if (areaDropdownMenu && !areaDropdownMenu.contains(e.target) && !areaDropdownToggle.contains(e.target)) {
            areaDropdownMenu.classList.add('hidden');
            areaDropdownMenu.style.display = 'none';
        }
    });

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
        saveMappingBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const kw = newKeywordInput.value.trim().toLowerCase();
            const isNewAreaVisible = newAreaFields && newAreaFields.style.display === 'block';
            let area = '', areaAr = '', neighborhood = neighborhoodEnInput ? neighborhoodEnInput.value.trim() : '', neighborhoodAr = neighborhoodArInput ? neighborhoodArInput.value.trim() : '';
            
            if (isNewAreaVisible) {
                area = newAreaEnInput.value.trim();
                areaAr = newAreaArInput.value.trim();
            } else if (selectedAreaValue) {
                const parts = selectedAreaValue.split('|');
                area = parts[0].trim();
                areaAr = (parts[1] || '').trim();
            }
            
            if (!kw || !area) return alert('Please provide a keyword and select or enter an area.');
            
            const keywords = kw.split(',').map(k => k.trim()).filter(k => k.length > 0);
            if (keywords.length === 0) return alert('Please provide at least one valid keyword.');
            
            let requiresFullOverwrite = false;
            let newMappingsAdded = [];
            
            keywords.forEach(keyword => {
                const newMap = { keyword, area, areaAr, neighborhood, neighborhoodAr };
                let foundBase = baseMappings.findIndex(m => m.keyword === keyword);
                let foundCustom = customMappings.findIndex(m => m.keyword === keyword);
                
                if (foundBase !== -1) { baseMappings[foundBase] = newMap; requiresFullOverwrite = true; }
                else if (foundCustom !== -1) { customMappings[foundCustom] = newMap; requiresFullOverwrite = true; }
                else { customMappings.push(newMap); newMappingsAdded.push(newMap); }
            });
            
            localStorage.setItem('customMappings', JSON.stringify(customMappings));
            
            if (requiresFullOverwrite) {
                fetch('/updateMappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: [...baseMappings, ...customMappings] }) });
            } else if (newMappingsAdded.length > 0) {
                fetch('/saveMapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: newMappingsAdded }) });
            }
            
            // Re-map ALL deliveries in memory that match the keywords
            const allMappings = [...baseMappings, ...customMappings];
            if (window.allDeliveries) {
                window.allDeliveries.forEach(del => {
                    const searchString = normalizeArabic(`${del.billing_address_city || ''} ${del.billing_address_address1 || ''}`.toLowerCase());
                    for (const m of allMappings) {
                        if (searchString.includes(normalizeArabic(m.keyword.toLowerCase()))) {
                            del.mapped_area = m.area;
                            del.mapped_area_ar = m.areaAr;
                            del.mapped_neighborhood = m.neighborhood;
                            del.mapped_neighborhood_ar = m.neighborhoodAr;
                            break;
                        }
                    }
                });
            }

            if (window.renderTable) window.renderTable();
            
            const originalText = saveMappingBtn.textContent;
            saveMappingBtn.textContent = 'Saved!';
            saveMappingBtn.style.background = '#27ae60';
            setTimeout(() => {
                saveMappingBtn.textContent = originalText;
                saveMappingBtn.style.background = 'var(--orange)';
                mappingModal.classList.add('hidden');
                mappingModal.style.display = 'none';
            }, 800);
            
            if (isNewAreaVisible) populateAreaDropdown();
        });
    }

    // Event delegation for Edit button
    document.getElementById('deliveries-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-mapping-btn')) {
            const area = e.target.getAttribute('data-area');
            const areaAr = e.target.getAttribute('data-area-ar');
            const neighborhood = e.target.getAttribute('data-neighborhood');
            const neighborhoodAr = e.target.getAttribute('data-neighborhood-ar');
            const city = e.target.getAttribute('data-city');
            const addr = e.target.getAttribute('data-addr');
            
            const searchString = `${city} ${addr}`;
            modalAddressText.textContent = searchString;
            newKeywordInput.value = '';
            
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
                if(toggleNewAreaBtn) toggleNewAreaBtn.textContent = '+ New';
                if(newAreaEnInput) newAreaEnInput.value = '';
                if(newAreaArInput) newAreaArInput.value = '';
            }
            if(neighborhoodEnInput) neighborhoodEnInput.value = neighborhood || '';
            if(neighborhoodArInput) neighborhoodArInput.value = neighborhoodAr || '';
            
            mappingModal.classList.remove('hidden');
            mappingModal.style.display = 'flex';
        }
    });
});
