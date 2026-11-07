// Servidor para rodar fora da Vercel (no seu PC, num VPS, Render, Railway...): node server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));

// lê o .env sem precisar de biblioteca
try {
  for (const linha of fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
const publico = path.join(raiz, 'public');

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) {
      const arquivo = path.join(raiz, 'api', url.pathname.slice(5).replace(/\.\./g, '') + '.js');
      if (!fs.existsSync(arquivo)) {
        res.statusCode = 404;
        return res.end('Não encontrado');
      }
      const mod = await import(pathToFileURL(arquivo).href);
      return await mod.default(req, res);
    }
    let alvo = path.normalize(path.join(publico, url.pathname));
    if (!alvo.startsWith(publico)) alvo = publico;
    if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
    if (!fs.existsSync(alvo)) {
      if (path.extname(url.pathname)) {
        res.statusCode = 404;
        return res.end('Não encontrado');
      }
      alvo = path.join(publico, 'index.html');
    }
    res.setHeader('Content-Type', TIPOS[path.extname(alvo)] || 'application/octet-stream');
    fs.createReadStream(alvo).pipe(res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Erro interno');
  }
});

const porta = Number(process.env.PORT || 3000);
servidor.listen(porta, () => console.log(`Painel rodando em http://localhost:${porta}`));
