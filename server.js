const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(__dirname, p);
  if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('listening on ' + PORT));
