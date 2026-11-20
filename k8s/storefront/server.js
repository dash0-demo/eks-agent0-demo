// storefront: serves product pages and asks inventory for the stock of each product.
const http = require('http');

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://inventory:8080';

function getStock(sku) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${INVENTORY_URL}/stock?sku=${encodeURIComponent(sku)}`, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`inventory returned ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('inventory timed out')));
    req.on('error', reject);
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return res.end('ok');
    if (url.pathname === '/products') {
      const skus = Array.from({ length: 3 }, () => `sku-${Math.floor(Math.random() * 100000)}`);
      try {
        const stock = await Promise.all(skus.map(getStock));
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ products: stock }));
      } catch (err) {
        console.error(`failed to load stock: ${err.message}`);
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: 'inventory unavailable' }));
      }
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(8080, () => console.log('storefront listening on :8080'));
