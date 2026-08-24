const axios = require('axios');
const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODg2OTU5NDgsImp0aSI6ImVhY2QxYjJkLTExYmYtNGZmZC04M2NhLTQzNGI0Y2Q5YzRhNiIsInVzZXJfZGV0YWlscyI6eyJUZW5hbnRDb2RlIjoiMzAyNjgyNTUzNCIsIlRlbmFudElEIjoiIiwiVXNlcklEIjoiMTQ0NDAiLCJVc2VyTmFtZSI6IkJhc2hhciIsIlJhdGVMaW1pdERldGFpbHMiOnsiRW5hYmxlZCI6dHJ1ZSwiUmVxdWVzdHNQZXJNaW51dGUiOjEyMH19LCJ0b2tlbl90eXBlIjoiQmVhcmVyIn0.ckEiC9UrSbidem6ITi6vR87yBbe3Ng1QBpruqY260OlK9R7WlvudfRmwn_8U-dnyjCXtI9z_nf99P9cdOIYbF5noLMi4krn_fvMzD6ZoRQfJxN-cdfbIh8X9QNYZY_-jYBNQFmKXF0DdKn-EDoTLEPvlk82re-cw_f0kuVdwqBwhmxPjU-GEkvN8JlSNxDSlfvsWc5BZgibIuZOfgsf5Zwy52egfMXpz5YzQ-FduN6VT4kqzKZuDgZajwGbtRB-SvJqlddJlcDK3ttsotiGLI0Gstoxnfa3xgnJGGGKpPXtHlI1HXqNlN5YWiOWsr2rK0ahhJwYp77Z7PeroLjUsyMAb3CAvUkalIx1EYKX07J9JgpkyYlFt1h3Dl_KqREiMAGGYJjgkS3ybpV9-8Qdxq6UjlmlBXDVglsYn4fqvF4GnJ0KZkT3xgF5XgHOiajJJqdw4BNbd4KqGIj39oiYhfujG7DbvUKmO1E7j_g_Tv3IZ4NgYXoF0u2ESykkEDMC5-y53ZGsRsxFOrC1r5_1zKTxLiyj6EZFSJIUUgfM8KaDg6Qd1SYAa8mxJcyLEnmFskydA4LLRBciiqcMCUKsMSNdvADBp2GEVCjLHvJ-E4dAEqvKNBCLDVvpyliLzCk3hA4sAs6TYpMKnOh6QBmD1-Sq77jHNr-YQEylrdiUY2pI';
const sellerCode = 'SEM';
const url = `https://prodapi.omniful.com/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders?per_page=10`;

axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
  .then(res => {
    const orders = res.data.data;
    const order = orders.find(o => o.order_id === '8897' || o.order_id === '8895' || String(o.id) === '8897') || orders[0];
    if (order) {
      console.log(JSON.stringify(order, null, 2));
    }
  })
  .catch(err => console.error(err.message));
