const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'public', 'js', 'collection_tracker.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Build Location Options
const locationOptionsCode = \
        let locSelectHtml = '<select class="inline-edit-select" data-id="' + trip.id + '" data-field="locationName" style="border:1px solid #ddd; background:transparent; border-radius:4px; padding:2px;">';
        Object.keys(availableLocations).forEach(k => {
            const l = availableLocations[k];
            const sel = trip.locationName === l.name ? 'selected' : '';
            locSelectHtml += '<option value="' + l.name + '" data-rate="' + l.rate + '" ' + sel + '>' + l.name + '</option>';
        });
        locSelectHtml += '</select>';
\;

content = content.replace(
    'const dayStr = new Date(trip.startTime).toLocaleDateString("en-US", { weekday: "long" });',
    locationOptionsCode + '\n        const dayStr = new Date(trip.startTime).toLocaleDateString("en-US", { weekday: "long" });'
);

// 2. Format times
const timeCode = \
        const startDate = new Date(trip.startTime);
        const startTime24 = startDate.getHours().toString().padStart(2, '0') + ':' + startDate.getMinutes().toString().padStart(2, '0');
        const endDate = new Date(trip.endTime);
        const endTime24 = endDate.getHours().toString().padStart(2, '0') + ':' + endDate.getMinutes().toString().padStart(2, '0');
\;
content = content.replace(
    'const distanceStr = trip.distanceKm !== undefined && trip.distanceKm !== null ? \\\ : "-";',
    timeCode + '\n        const distanceStr = trip.distanceKm !== undefined && trip.distanceKm !== null ? \\\ : "-";'
);

// 3. Update table row
const oldRow = \            <td contenteditable="true" data-field="date">\</td>
            <td style="color: var(--dim); font-size: 13px;">\</td>
            <td>\</td>
            <td>\</td>
            <td contenteditable="true" data-field="locationName" style="font-weight: 600;">\</td>\;
            
const newRow = \            <td><input type="date" value="\" class="inline-edit-date" data-id="\" style="border:1px solid #ddd; background:transparent; padding:2px; border-radius:4px;"></td>
            <td style="color: var(--dim); font-size: 13px;">\</td>
            <td><input type="time" value="\" class="inline-edit-time" data-id="\" data-field="startTime" data-date="\" style="border:1px solid #ddd; background:transparent; padding:2px; border-radius:4px;"></td>
            <td><input type="time" value="\" class="inline-edit-time" data-id="\" data-field="endTime" data-date="\" style="border:1px solid #ddd; background:transparent; padding:2px; border-radius:4px;"></td>
            <td style="font-weight: 600;">\</td>\;
            
content = content.replace(oldRow, newRow);

// 4. Update event listeners in historyTbody
const newListeners = \
    historyTbody.addEventListener("change", async (e) => {
      // Inputs and selects
      if (e.target.classList.contains("inline-edit-date")) {
          const id = e.target.getAttribute("data-id");
          const val = e.target.value;
          // Just update the date string
          try { await update(ref(db, \collection_tracker/history/\\), { date: val }); } catch(err){}
      }
      else if (e.target.classList.contains("inline-edit-time")) {
          const id = e.target.getAttribute("data-id");
          const field = e.target.getAttribute("data-field");
          const timeVal = e.target.value; // HH:mm
          const dateVal = e.target.getAttribute("data-date"); // YYYY-MM-DD
          const newTimestamp = new Date(\\T\:00\).getTime();
          try { await update(ref(db, \collection_tracker/history/\\), { [field]: newTimestamp }); } catch(err){}
      }
      else if (e.target.classList.contains("inline-edit-select")) {
          const id = e.target.getAttribute("data-id");
          const val = e.target.value;
          const opt = e.target.options[e.target.selectedIndex];
          const rate = parseFloat(opt.getAttribute("data-rate"));
          try { await update(ref(db, \collection_tracker/history/\\), { locationName: val, price: rate }); } catch(err){}
      }
\;

content = content.replace('historyTbody.addEventListener("change", (e) => {', newListeners + '\n        if (e.target.classList.contains("trip-checkbox")) {');

fs.writeFileSync(file, content);
console.log("Updated collection_tracker.js successfully!");
