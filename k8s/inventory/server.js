// inventory: answers stock lookups and keeps a cache of recent stock reports in memory.
// The cache size comes from CACHE_SIZE_MB (set in k8s/inventory.yaml).
const http = require('http');

const CACHE_SIZE_MB = Number(process.env.CACHE_SIZE_MB || 32);
const ENTRY_KB = 256;
const maxEntries = Math.floor((CACHE_SIZE_MB * 1024) / ENTRY_KB);
const cache = new Map();

function stockReport(sku) {
  if (cache.has(sku)) return cache.get(sku);
  const report = { sku, stock: Math.floor(Math.random() * 100), payload: Buffer.alloc(ENTRY_KB * 1024, 1) };
  cache.set(sku, report);
  if (cache.size > maxEntries) cache.delete(cache.keys().next().value); // evict oldest
  return report;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return res.end('ok');
    if (url.pathname === '/stock') {
      const sku = url.searchParams.get('sku') || 'unknown';
      const r = stockReport(sku);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ sku: r.sku, stock: r.stock }));
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(8080, () => console.log(`inventory listening on :8080, cache up to ${CACHE_SIZE_MB} MB (${maxEntries} entries)`));
