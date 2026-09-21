// Debug helper: dump a single order payload from Omniful.
// Reads credentials from functions/.env — never hardcode a token here, this file is in git.
require('dotenv').config();
const axios = require('axios');

const token = process.env.OMNIFUL_API_TOKEN;
if (!token) {
  console.error('Missing OMNIFUL_API_TOKEN in functions/.env');
  process.exit(1);
}

const baseUrl = (process.env.OMNIFUL_BASE_URL || 'https://prodapi.omniful.com').replace(/\/+$/, '');
const sellerCode = process.argv[2] || 'SEM';
const wantedOrderId = process.argv[3] || null;
const url = `${baseUrl}/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders?per_page=10`;

axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  .then(res => {
    const orders = res.data.data || [];
    const order = wantedOrderId
      ? orders.find(o => String(o.order_id) === wantedOrderId || String(o.id) === wantedOrderId)
      : orders[0];
    if (order) {
      console.log(JSON.stringify(order, null, 2));
    } else {
      console.log(`No matching order found (fetched ${orders.length}).`);
    }
  })
  .catch(err => console.error(err.response ? `HTTP ${err.response.status}` : err.message));
