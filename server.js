import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pix from './api/pix.js';
import status from './api/status.js';
const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return res.status(400).end(); }
  try {
    if (url.pathname === '/api/pix' || url.pathname === '/api/status') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return res.status(413).json({ message:'Dados muito grandes.' }); }
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { return res.status(400).json({ message:'JSON inválido.' }); }
      return await (url.pathname === '/api/pix' ? pix : status)(req,res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root + path.sep)) return res.status(403).end();
    const data = await readFile(filename);
    res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.status(404).end('Não encontrado'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Checkout: http://localhost:${server.address().port}`));
