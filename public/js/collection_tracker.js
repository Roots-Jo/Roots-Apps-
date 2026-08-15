import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, push, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const currentUser = localStorage.getItem("roots-user");
const isAdmin = currentUser === "Roots" || localStorage.getItem("roots-isAdmin") === "true";

if (!currentUser) {
  window.location.href = "/";
}

let activeTripData = null;
let timerInterval = null;
let historicalTrips = [];
let availableLocations = {};

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// ── DOM Elements ──
const punchBtn = document.getElementById("punch-btn");
const punchBtnText = document.getElementById("punch-btn-text");
const punchTimerEl = document.getElementById("punch-timer");
const punchStatusEl = document.getElementById("punch-status");
const tripLocationSelect = document.getElementById("trip-location-select");
const locationSelectWrap = document.getElementById("location-select-wrap");

// Admin Elements
const adminTabsNav = document.getElementById("admin-tabs");
const viewPunch = document.getElementById("view-punch");
const viewAdmin = document.getElementById("view-admin");
const historyTbody = document.getElementById("history-tbody");
const locationsTbody = document.getElementById("locations-tbody");
const filterUser = document.getElementById("filter-user");
const filterWeek = document.getElementById("filter-week");
const totalPayEl = document.getElementById("history-total-pay");
const selectAllBtn = document.getElementById("select-all-trips");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");

const newLocName = document.getElementById("new-location-name");
const newLocRate = document.getElementById("new-location-rate");
const addLocBtn = document.getElementById("add-location-btn");

// ── Tabs Logic ──
if (isAdmin) {
  adminTabsNav.style.display = "flex";
  
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const target = btn.getAttribute("data-tab");
      if (target === "punch") {
        viewPunch.style.display = "block";
        viewAdmin.style.display = "none";
      } else {
        viewPunch.style.display = "none";
        viewAdmin.style.display = "block";
      }
    });
  });
}

// ── Helpers ──
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDatetimeLocal(timestamp) {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  return d.toLocaleString('en-GB', { hour12: true, hour: '2-digit', minute: '2-digit' });
}

function getWeekIdentifier(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); 
  let daysToFriday = 5 - day;
  if (daysToFriday < 0) daysToFriday += 7; 
  d.setDate(d.getDate() + daysToFriday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dateStr = String(d.getDate()).padStart(2, '0');
  return `Week ending ${year}-${month}-${dateStr}`;
}

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);  
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
  return parseFloat(d.toFixed(2));
}

function getGPSPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
  });
}

// ── App Logic ──

// Load Locations
onValue(ref(db, 'collection_tracker/locations'), (snapshot) => {
  availableLocations = snapshot.val() || {};
  
  // Update select dropdown
  const currVal = tripLocationSelect.value;
  tripLocationSelect.innerHTML = `<option value="" disabled selected>-- Choose Location --</option>`;
  Object.keys(availableLocations).forEach(key => {
    const loc = availableLocations[key];
    const opt = document.createElement("option");
    opt.value = key; // Use the node key as the value
    opt.textContent = isAdmin ? `${loc.name} - ${loc.rate} JOD` : loc.name;
    opt.setAttribute("data-name", loc.name);
    opt.setAttribute("data-rate", loc.rate);
    tripLocationSelect.appendChild(opt);
  });
  if (availableLocations[currVal]) {
    tripLocationSelect.value = currVal;
  }

  // Render Admin Table if admin
  if (isAdmin) {
    if (Object.keys(availableLocations).length === 0) {
      locationsTbody.innerHTML = `<tr><td colspan="3" class="empty-msg">No locations configured.</td></tr>`;
    } else {
      locationsTbody.innerHTML = Object.keys(availableLocations).map(key => {
        const loc = availableLocations[key];
        return `
          <tr>
            <td style="font-weight: 600;">${loc.name}</td>
            <td style="font-weight: 600; color: var(--green);">${loc.rate}</td>
            <td>
              <button class="btn-action btn-delete-loc" data-id="${key}" title="Delete Location">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }
  }
});

// Load Active Trip
const localStartTime = localStorage.getItem("coll-active-trip-start");
if (localStartTime) {
  activeTripData = { startTime: parseInt(localStartTime) };
  setTripActiveState();
}

onValue(ref(db, `collection_tracker/active/${currentUser}`), (snapshot) => {
  if (snapshot.exists()) {
    activeTripData = snapshot.val();
    localStorage.setItem("coll-active-trip-start", activeTripData.startTime);
    setTripActiveState(activeTripData);
  } else {
    activeTripData = null;
    localStorage.removeItem("coll-active-trip-start");
    setTripInactiveState();
  }
});

function startLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (activeTripData && activeTripData.startTime) {
      const diff = Date.now() - activeTripData.startTime;
      punchTimerEl.textContent = formatTime(diff);
    }
  }, 1000);
}

function stopLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  punchTimerEl.textContent = "00:00:00";
}

function setTripActiveState(data = null) {
  punchStatusEl.textContent = t("coll_status_trip_prog", "Trip in Progress");
  punchStatusEl.classList.add("active");
  punchBtn.classList.remove("btn-green");
  punchBtn.classList.add("btn-red");
  punchBtnText.textContent = t("coll_btn_end_trip", "END TRIP");
  locationSelectWrap.style.display = "none";
  startLocalTimer();
  
  if (data && data.locationName) {
    punchStatusEl.textContent = `${t("coll_status_trip_to", "Trip to")} ${data.locationName}`;
  }
}

function setTripInactiveState() {
  punchStatusEl.textContent = t("coll_status_not_trip", "Not on a trip");
  punchStatusEl.classList.remove("active");
  punchBtn.classList.remove("btn-red");
  punchBtn.classList.add("btn-green");
  punchBtnText.textContent = t("coll_btn_start_trip", "START TRIP");
  locationSelectWrap.style.display = "block";
  stopLocalTimer();
}

punchBtn.addEventListener("click", async () => {
  punchBtn.disabled = true;
  punchBtn.style.opacity = "0.7";
  
  try {
    if (activeTripData) {
      // End Trip
      punchStatusEl.textContent = t("coll_status_fetching", "Fetching GPS & Ending...");
      
      let endLat = null, endLon = null;
      try {
        const pos = await getGPSPosition();
        endLat = pos.coords.latitude;
        endLon = pos.coords.longitude;
      } catch (err) {
        console.error("GPS Error:", err);
        alert(t("coll_alert_gps_err", "Failed to get GPS location. The trip will be ended without distance calculation."));
      }

      const endTime = Date.now();
      const startTime = activeTripData.startTime;
      const durationMs = endTime - startTime;
      
      const distanceKm = calculateDistance(
        activeTripData.startLat, activeTripData.startLon,
        endLat, endLon
      );
      
      const newTrip = {
        username: currentUser,
        date: new Date(startTime).toISOString().split('T')[0],
        startTime: startTime,
        endTime: endTime,
        durationFormatted: formatTime(durationMs),
        locationName: activeTripData.locationName || "Unknown",
        locationId: activeTripData.locationId || "",
        price: parseFloat(activeTripData.rate || 0),
        distanceKm: distanceKm,
        weekIdentifier: getWeekIdentifier(new Date(startTime)),
        startLat: activeTripData.startLat || null,
        startLon: activeTripData.startLon || null,
        endLat: endLat,
        endLon: endLon
      };
      
      await push(ref(db, 'collection_tracker/history'), newTrip);
      await remove(ref(db, `collection_tracker/active/${currentUser}`));
      
      activeTripData = null;
      setTripInactiveState();
      
    } else {
      // Start Trip
      const locId = tripLocationSelect.value;
      if (!locId) {
        alert(t("coll_alert_sel_loc", "Please select a location first."));
        punchBtn.disabled = false;
        punchBtn.style.opacity = "1";
        return;
      }
      
      const opt = tripLocationSelect.options[tripLocationSelect.selectedIndex];
      const locName = opt.getAttribute("data-name");
      const locRate = opt.getAttribute("data-rate");

      punchStatusEl.textContent = t("coll_status_fetching", "Fetching GPS to start...");
      
      let startLat = null, startLon = null;
      try {
        const pos = await getGPSPosition();
        startLat = pos.coords.latitude;
        startLon = pos.coords.longitude;
      } catch (err) {
        console.error("GPS Error:", err);
        alert(t("coll_alert_gps_err", "Failed to get GPS location. Please ensure location permissions are granted."));
        punchBtn.disabled = false;
        punchBtn.style.opacity = "1";
        punchStatusEl.textContent = t("coll_status_not_trip", "Not on a trip");
        return;
      }
      
      const startTime = Date.now();
      await set(ref(db, `collection_tracker/active/${currentUser}`), {
        startTime: startTime,
        locationId: locId,
        locationName: locName,
        rate: locRate,
        startLat: startLat,
        startLon: startLon
      });
    }
  } catch (error) {
    console.error("Error toggling trip:", error);
    alert(t("coll_alert_err_toggle", "Failed to process trip action. Please try again."));
    if (activeTripData) setTripActiveState(activeTripData);
    else setTripInactiveState();
  }
  
  punchBtn.disabled = false;
  punchBtn.style.opacity = "1";
});

// ── Admin Logic ──
if (isAdmin) {
  
  addLocBtn.addEventListener("click", async () => {
    const name = newLocName.value.trim();
    const rate = parseFloat(newLocRate.value);
    
    if (!name || isNaN(rate)) {
      alert(t("coll_alert_valid_loc", "Please provide a valid location name and rate."));
      return;
    }
    
    addLocBtn.disabled = true;
    try {
      await push(ref(db, 'collection_tracker/locations'), {
        name: name,
        rate: rate
      });
      newLocName.value = "";
      newLocRate.value = "";
    } catch (e) {
      console.error(e);
      alert("Failed to add location.");
    }
    addLocBtn.disabled = false;
  });

  locationsTbody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-delete-loc");
    if (btn) {
      const id = btn.getAttribute("data-id");
      if (confirm(t("coll_conf_del_loc", "Are you sure you want to delete this location?"))) {
        try {
          await remove(ref(db, `collection_tracker/locations/${id}`));
        } catch (error) {
          console.error(error);
          alert("Failed to delete location.");
        }
      }
    }
  });

  // History
  onValue(ref(db, 'collection_tracker/history'), (snapshot) => {
    const data = snapshot.val() || {};
    historicalTrips = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    })).sort((a, b) => b.startTime - a.startTime);
    
    populateFilters();
    renderHistoryTable();
  });
  
  function populateFilters() {
    const users = new Set();
    const weeks = new Set();
    
    historicalTrips.forEach(trip => {
      users.add(trip.username);
      weeks.add(trip.weekIdentifier);
    });
    
    const currUserVal = filterUser.value;
    filterUser.innerHTML = `<option value="all">All Users</option>`;
    Array.from(users).sort().forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      filterUser.appendChild(opt);
    });
    if (users.has(currUserVal)) filterUser.value = currUserVal;
    
    const currWeekVal = filterWeek.value;
    filterWeek.innerHTML = `<option value="all">All Weeks</option>`;
    Array.from(weeks).sort().reverse().forEach(w => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w;
      filterWeek.appendChild(opt);
    });
    if (weeks.has(currWeekVal)) filterWeek.value = currWeekVal;
  }
  
  function renderHistoryTable() {
    const selectedUser = filterUser.value;
    const selectedWeek = filterWeek.value;
    
    const filtered = historicalTrips.filter(trip => {
      if (selectedUser !== "all" && trip.username !== selectedUser) return false;
      if (selectedWeek !== "all" && trip.weekIdentifier !== selectedWeek) return false;
      return true;
    });
    
    let totalPay = 0;
    
    if (filtered.length === 0) {
      historyTbody.innerHTML = `<tr><td colspan="11" class="empty-msg">No trips found.</td></tr>`;
      totalPayEl.textContent = `0.00 JOD`;
      if (selectAllBtn) {
        selectAllBtn.checked = false;
        selectAllBtn.indeterminate = false;
      }
      updateBulkDeleteButton();
      return;
    }

    const weeksMap = {};
    filtered.forEach(trip => {
      const wk = trip.weekIdentifier || "Unknown Week";
      if (!weeksMap[wk]) weeksMap[wk] = { trips: [], weekTotal: 0 };
      weeksMap[wk].trips.push(trip);
      weeksMap[wk].weekTotal += (trip.price || 0);
      totalPay += (trip.price || 0);
    });

    const weekKeys = Object.keys(weeksMap).sort().reverse();
    
    let html = "";
    weekKeys.forEach(wk => {
      const weekObj = weeksMap[wk];
      
      html += `
        <tr class="week-separator" style="pointer-events: none;">
          <td colspan="11" style="background: rgba(39, 174, 96, 0.05); padding: 8px 16px; border-bottom: 2px solid var(--border); border-top: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 11px; color: var(--green); text-transform: uppercase;">
              <span>${wk}</span>
              <span>Subtotal: ${weekObj.weekTotal.toFixed(2)} JOD</span>
            </div>
          </td>
        </tr>
      `;
      
      html += weekObj.trips.map(trip => {
        const dayStr = new Date(trip.startTime).toLocaleDateString("en-US", { weekday: "long" });
        const distanceStr = trip.distanceKm !== undefined && trip.distanceKm !== null ? `${trip.distanceKm} km` : "-";
        
        return `
          <tr>
            <td><input type="checkbox" class="trip-checkbox" data-id="${trip.id}" style="pointer-events: auto;"></td>
            <td style="font-weight: 600;">${trip.username}</td>
            <td>${trip.date}</td>
            <td style="color: var(--dim); font-size: 13px;">${dayStr}</td>
            <td>${formatDatetimeLocal(trip.startTime)}</td>
            <td>${formatDatetimeLocal(trip.endTime)}</td>
            <td style="font-weight: 600;">${trip.locationName}</td>
            <td>${distanceStr}</td>
            <td style="font-family: var(--mono); font-weight: 600;">${trip.durationFormatted}</td>
            <td style="font-weight: 600; color: var(--accent);">${(trip.price || 0).toFixed(2)}</td>
            <td>
              <button class="btn-action btn-delete" data-id="${trip.id}" title="Delete Trip" style="pointer-events: auto;">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join("");
    });
    
    historyTbody.innerHTML = html;
    
    totalPayEl.textContent = `${totalPay.toFixed(2)} JOD`;

    if (selectAllBtn) {
      selectAllBtn.checked = false;
      selectAllBtn.indeterminate = false;
    }
    updateBulkDeleteButton();
  }
  
  filterUser.addEventListener("change", renderHistoryTable);
  filterWeek.addEventListener("change", renderHistoryTable);

  function updateBulkDeleteButton() {
    if (!deleteSelectedBtn) return;
    const checkedCount = document.querySelectorAll(".trip-checkbox:checked").length;
    if (checkedCount > 0) {
      deleteSelectedBtn.style.display = "inline-block";
      deleteSelectedBtn.textContent = `Delete Selected (${checkedCount})`;
    } else {
      deleteSelectedBtn.style.display = "none";
    }
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      const checkboxes = document.querySelectorAll(".trip-checkbox");
      checkboxes.forEach(cb => cb.checked = isChecked);
      updateBulkDeleteButton();
    });
  }

  if (historyTbody) {
    historyTbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("trip-checkbox")) {
        updateBulkDeleteButton();
        
        const checkboxes = document.querySelectorAll(".trip-checkbox");
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        if (selectAllBtn) {
          selectAllBtn.checked = allChecked;
          selectAllBtn.indeterminate = someChecked && !allChecked;
        }
      }
    });

    historyTbody.addEventListener("click", async (e) => {
      const deleteBtn = e.target.closest(".btn-delete");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        if (confirm(t("coll_conf_del_trip", "Are you sure you want to delete this trip?"))) {
          try {
            await remove(ref(db, `collection_tracker/history/${id}`));
          } catch (error) {
            console.error(error);
            alert("Failed to delete trip.");
          }
        }
      }
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const checkedBoxes = document.querySelectorAll(".trip-checkbox:checked");
      if (checkedBoxes.length === 0) return;
      
      if (confirm(`Are you sure you want to delete ${checkedBoxes.length} trip(s)?`)) {
        try {
          const promises = Array.from(checkedBoxes).map(cb => {
            const id = cb.getAttribute("data-id");
            return remove(ref(db, `collection_tracker/history/${id}`));
          });
          await Promise.all(promises);
        } catch (error) {
          console.error(error);
          alert("Failed to delete some trips.");
        }
      }
    });
  }
}
