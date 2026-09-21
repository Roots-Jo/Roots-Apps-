// Debug helper: list active sellers from Omniful.
// Reads credentials from functions/.env — never hardcode a token here, this file is in git.
require('dotenv').config();
const axios = require('axios');

const token = process.env.OMNIFUL_API_TOKEN;
if (!token) {
  console.error('Missing OMNIFUL_API_TOKEN in functions/.env');
  process.exit(1);
}

const baseUrl = (process.env.OMNIFUL_BASE_URL || 'https://prodapi.omniful.com').replace(/\/+$/, '');

async function test() {
  try {
    const url = `${baseUrl}/sales-channel/public/v1/tenants/sellers`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: 1, per_page: 10, is_active: true, include_all_sellers: true }
    });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.error(e.response ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}` : e.message);
  }
}

test();
