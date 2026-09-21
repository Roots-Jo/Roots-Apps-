// ============================================================
// ROOTS DASHBOARD — CONFIGURATION
// ============================================================
// 
// HOW TO SET UP:
//
// 1. Go to https://sheets.new to create a Google Sheet
//
// 2. Open your orders CSV file in a text editor (or Excel),
//    select all, and paste into cell A1 of the sheet.
//    Row 1 should have the headers (ORDER ID, ORDER REFERENCE, etc.)
//
// 3. Rename the sheet tab at the bottom to "Orders"
//
// 4. Click Share → General Access → "Anyone with the link" → Viewer
//
// 5. Copy the Sheet ID from the URL:
//    https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
//
// 6. Paste it below, replacing YOUR_GOOGLE_SHEET_ID_HERE
//
// 7. Push to Netlify — done!
//
// TO UPDATE DATA WEEKLY:
//   Just paste new CSV data into the same Google Sheet.
//   The dashboard will show the latest data on refresh.
//
// ============================================================

const ROOTS_CONFIG = {
  // Paste your Google Sheet ID here:
  SHEET_ID: "YOUR_GOOGLE_SHEET_ID_HERE",

  // Name of the sheet tab (default: "Orders")
  SHEET_NAME: "Orders",
};
