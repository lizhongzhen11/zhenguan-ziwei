import http from 'http';
import fs from 'fs';
import path from 'path';

// 以本文件所在目录为站点根——不写死绝对路径，任意机器可跑
const root = import.meta.dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const p = path.resolve(root, '.' + url);
  const rel = path.relative(root, p);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 Not Found: ' + url); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(3001, () => console.log('Server on http://localhost:3001'));
