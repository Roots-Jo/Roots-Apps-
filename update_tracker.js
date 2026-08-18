const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'public', 'js', 'collection_tracker.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Add manual KM prompt
content = content.replace(
    'const distanceKm = calculateDistance(\n        activeTripData.startLat, activeTripData.startLon,\n        endLat, endLon\n      );\n      \n      const newTrip = {',
    `const distanceKm = calculateDistance(
        activeTripData.startLat, activeTripData.startLon,
        endLat, endLon
      );
      
      const manualKmStr = prompt(t("coll_prompt_manual_km", "Please enter manual KM driven:"), "");
      const manualKm = manualKmStr ? parseFloat(manualKmStr) : null;
      
      const newTrip = {`
);

// Add manualKm to newTrip
content = content.replace(
    'distanceKm: distanceKm,\n        weekIdentifier: getWeekIdentifier(new Date(startTime)),',
    `distanceKm: distanceKm,
        manualKm: manualKm,
        weekIdentifier: getWeekIdentifier(new Date(startTime)),`
);

// 2. Add extra column for Auto and Manual KM in the subtotal header
content = content.replace(
    '<td colspan="11" style="background: rgba(39, 174, 96, 0.05); padding: 8px 16px; border-bottom: 2px solid var(--border); border-top: 2px solid var(--border);">',
    '<td colspan="12" style="background: rgba(39, 174, 96, 0.05); padding: 8px 16px; border-bottom: 2px solid var(--border); border-top: 2px solid var(--border);">'
);

// 3. Make table cells editable and add manual KM column
content = content.replace(
    'const distanceStr = trip.distanceKm !== undefined && trip.distanceKm !== null ? `${trip.distanceKm} km` : "-";\n        \n        return `\n          <tr>\n            <td><input type="checkbox" class="trip-checkbox" data-id="${trip.id}" style="pointer-events: auto;"></td>\n            <td style="font-weight: 600;">${trip.username}</td>\n            <td>${trip.date}</td>\n            <td style="color: var(--dim); font-size: 13px;">${dayStr}</td>\n            <td>${formatDatetimeLocal(trip.startTime)}</td>\n            <td>${formatDatetimeLocal(trip.endTime)}</td>\n            <td style="font-weight: 600;">${trip.locationName}</td>\n            <td>${distanceStr}</td>\n            <td style="font-family: var(--mono); font-weight: 600;">${trip.durationFormatted}</td>\n            <td style="font-weight: 600; color: var(--accent);">${(trip.price || 0).toFixed(2)}</td>\n            <td>',
    `const distanceStr = trip.distanceKm !== undefined && trip.distanceKm !== null ? \`\${trip.distanceKm}\` : "-";
        const manualDistanceStr = trip.manualKm !== undefined && trip.manualKm !== null ? \`\${trip.manualKm}\` : "-";
        
        return \`
          <tr>
            <td><input type="checkbox" class="trip-checkbox" data-id="\${trip.id}" style="pointer-events: auto;"></td>
            <td contenteditable="true" data-field="username" style="font-weight: 600;">\${trip.username}</td>
            <td contenteditable="true" data-field="date">\${trip.date}</td>
            <td style="color: var(--dim); font-size: 13px;">\${dayStr}</td>
            <td>\${formatDatetimeLocal(trip.startTime)}</td>
            <td>\${formatDatetimeLocal(trip.endTime)}</td>
            <td contenteditable="true" data-field="locationName" style="font-weight: 600;">\${trip.locationName}</td>
            <td contenteditable="true" data-field="distanceKm">\${distanceStr}</td>
            <td contenteditable="true" data-field="manualKm">\${manualDistanceStr}</td>
            <td contenteditable="true" data-field="durationFormatted" style="font-family: var(--mono); font-weight: 600;">\${trip.durationFormatted}</td>
            <td contenteditable="true" data-field="price" style="font-weight: 600; color: var(--accent);">\${(trip.price || 0).toFixed(2)}</td>
            <td>`
);

// 4. Add focusout event listener for contenteditable updates
content = content.replace(
    'if (historyTbody) {\n    historyTbody.addEventListener("change", (e) => {',
    `if (historyTbody) {
    historyTbody.addEventListener("focusout", async (e) => {
      if (e.target.hasAttribute("contenteditable")) {
        const id = e.target.closest("tr").querySelector(".btn-delete").getAttribute("data-id");
        const field = e.target.getAttribute("data-field");
        let val = e.target.textContent.trim();
        
        if (field === "price" || field === "distanceKm" || field === "manualKm") {
          val = parseFloat(val);
          if (isNaN(val)) val = null;
        }

        try {
          // Import update if not already available
          await update(ref(db, \`collection_tracker/history/\${id}\`), { [field]: val });
        } catch (error) {
          console.error("Failed to update field", error);
        }
      }
    });

    historyTbody.addEventListener("change", (e) => {`
);

fs.writeFileSync(file, content);
console.log("Updated collection_tracker.js successfully!");
