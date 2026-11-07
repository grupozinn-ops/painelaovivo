import crypto from 'node:crypto';
import { config } from './config.js';

export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

export function json(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}

export function redirecionar(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

export function pagina(res, status, titulo, texto, link) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0b0a;color:#f5efe9;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:460px}h1{font-size:22px;margin:0 0 8px}p{color:#b3a79b;margin:0 0 20px}a{display:inline-block;background:#ff6b1a;color:#140c06;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px}</style></head>
<body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p>${link ? `<a href="${esc(link.href)}">${esc(link.texto)}</a>` : ''}</main></body></html>`);
}

export function autorizado(req) {
  if (!config.senha) return false;
  const q = query(req);
  const enviada = String(req.headers['x-painel-senha'] || q.k || '');
  const a = Buffer.from(enviada);
  const b = Buffer.from(config.senha);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let txt = '';
  for await (const parte of req) txt += parte;
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}
