document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('mappings-table-body');
    const saveAllBtn = document.getElementById('save-all-btn');
    const statusMessage = document.getElementById('status-message');
    const themeToggle = document.getElementById('theme-toggle');

    let currentMappings = [];

    function normalizeArabic(text) {
        if (!text) return '';
        return text.replace(/[أإآ]/g, 'ا')
                   .replace(/ة/g, 'ه')
                   .replace(/ى/g, 'ي')
                   .replace(/[\u064B-\u0652]/g, '');
    }

    const searchInput = document.getElementById('mapping-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderTable();
        });
    }

    // Theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        });

        // Initialize toggle button state
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            themeToggle.textContent = '☀️';
        }
    }

    // Fetch and render mappings
    function fetchMappings() {
        fetch('../data/mapping.json')
            .then(res => res.json())
            .then(data => {
                currentMappings = data;
                renderTable();
            })
            .catch(err => {
                console.error('Error fetching mappings:', err);
                tableBody.innerHTML = `<tr><td colspan="4" style="padding: 12px; color: red;">Failed to load mappings.</td></tr>`;
            });
    }

    function renderTable() {
        if (currentMappings.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="padding: 12px; text-align: center;">No mappings found.</td></tr>`;
            return;
        }

        const filterText = searchInput ? normalizeArabic(searchInput.value.toLowerCase()) : '';
        let html = '';
        let count = 0;

        let maxArea = 20;
        let maxAreaAr = 20;
        currentMappings.forEach(m => {
            if (m.area && m.area.length > maxArea) maxArea = m.area.length;
            if (m.areaAr && m.areaAr.length > maxAreaAr) maxAreaAr = m.areaAr.length;
        });

        const areaWidth = `${Math.min(maxArea + 2, 80)}ch`;
        const areaArWidth = `${Math.min(maxAreaAr + 2, 80)}ch`;

        currentMappings.forEach((m, index) => {
            if (filterText) {
                const rowText = normalizeArabic(`${m.keyword || ''} ${m.area || ''} ${m.areaAr || ''} ${m.neighborhood || ''} ${m.neighborhoodAr || ''}`.toLowerCase());
                if (!rowText.includes(filterText)) return;
            }

            count++;
            html += `
                <tr style="border-bottom: 1px solid var(--bdr);">
                    <td style="padding: 12px;">
                        <input type="text" class="sbox mapping-input" data-field="keyword" data-index="${index}" value="${m.keyword}" style="width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 12px;">
                        <input type="text" class="sbox mapping-input" data-field="area" data-index="${index}" value="${m.area || ''}" style="width: 100%; min-width: ${areaWidth}; box-sizing: border-box;">
                    </td>
                    <td style="padding: 12px;">
                        <input type="text" class="sbox mapping-input" data-field="areaAr" data-index="${index}" value="${m.areaAr || ''}" style="width: 100%; min-width: ${areaArWidth}; box-sizing: border-box;" dir="rtl">
                    </td>
                    <td style="padding: 12px;">
                        <input type="text" class="sbox mapping-input" data-field="neighborhood" data-index="${index}" value="${m.neighborhood || ''}" style="width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 12px;">
                        <input type="text" class="sbox mapping-input" data-field="neighborhoodAr" data-index="${index}" value="${m.neighborhoodAr || ''}" style="width: 100%; box-sizing: border-box;" dir="rtl">
                    </td>
                    <td style="padding: 12px;">
                        <button class="delete-btn" data-index="${index}" style="padding: 6px 12px; background: var(--red); color: white; border: none; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600;">Delete</button>
                    </td>
                </tr>
            `;
        });

        if (count === 0) {
            html = `<tr><td colspan="6" style="padding: 12px; text-align: center;">No mappings match your search.</td></tr>`;
        }

        tableBody.innerHTML = html;
    }

    // Event delegation for input changes and delete clicks
    tableBody.addEventListener('input', (e) => {
        if (e.target.classList.contains('mapping-input')) {
            const index = parseInt(e.target.getAttribute('data-index'));
            const field = e.target.getAttribute('data-field');
            currentMappings[index][field] = e.target.value;
        }
    });

    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const index = parseInt(e.target.getAttribute('data-index'));
            currentMappings.splice(index, 1);
            renderTable();
        }
    });

    // Save changes
    saveAllBtn.addEventListener('click', () => {
        saveAllBtn.textContent = 'Saving...';
        saveAllBtn.disabled = true;

        // Filter out any entries where keyword is empty
        const validMappings = currentMappings.filter(m => m.keyword && m.keyword.trim() !== '');

        fetch('/updateMappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings: validMappings })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showStatus('Mappings saved successfully!', 'success');
                const originalText = saveAllBtn.textContent;
                saveAllBtn.textContent = 'Saved!';
                saveAllBtn.style.background = '#27ae60';
                saveAllBtn.style.color = 'white';
                setTimeout(() => {
                    saveAllBtn.textContent = 'Save Changes';
                    saveAllBtn.style.background = 'var(--orange)';
                }, 1000);

                currentMappings = validMappings;
                renderTable();
            } else {
                showStatus('Failed to save mappings: ' + (data.error || 'Unknown error'), 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showStatus('Error saving mappings.', 'error');
        })
        .finally(() => {
            saveAllBtn.textContent = 'Save Changes';
            saveAllBtn.disabled = false;
        });
    });

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
        statusMessage.classList.remove('hidden');
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }

    // Initial fetch
    fetchMappings();
});
