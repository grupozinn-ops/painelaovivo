// Guarda tokens e números já calculados.
// Na nuvem usa Upstash Redis (REST). Rodando local, usa um arquivo em .data/
import fs from 'node:fs';
import path from 'node:path';

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN_REDIS = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const usaRedis = Boolean(URL_REDIS && TOKEN_REDIS);

export const tipoArmazenamento = usaRedis ? 'redis' : 'arquivo';

if (!usaRedis && process.env.VERCEL) {
  console.error('Faltou configurar o Upstash Redis (UPSTASH_REDIS_REST_URL / KV_REST_API_URL).');
}

// ---------- Redis (Upstash REST) ----------
async function redis(comando) {
  const r = await fetch(URL_REDIS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_REDIS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
  });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

// ---------- Arquivo local ----------
const ARQ = path.resolve(process.env.ARQUIVO_DADOS || '.data/store.json');
let mem = null;
function carregar() {
  if (mem) return mem;
  if (process.env.VERCEL) {
    throw new Error('Banco não configurado: ligue o Upstash Redis no projeto da Vercel.');
  }
  try {
    mem = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  } catch {
    mem = {};
  }
  return mem;
}
function salvar() {
  fs.mkdirSync(path.dirname(ARQ), { recursive: true });
  fs.writeFileSync(ARQ, JSON.stringify(mem));
}
function vivo(k) {
  const m = carregar();
  const e = m[k];
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) {
    delete m[k];
    return undefined;
  }
  return e;
}

// ---------- API comum ----------
const parse = (v) => {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

export async function getJSON(k) {
  if (usaRedis) return parse(await redis(['GET', k]));
  return vivo(k)?.v ?? null;
}

export async function mgetJSON(chaves) {
  if (!chaves.length) return [];
  if (usaRedis) return ((await redis(['MGET', ...chaves])) || []).map(parse);
  return chaves.map((k) => vivo(k)?.v ?? null);
}

// opts: { ex: segundos, nx: true } -> com nx devolve false se a chave já existia
export async function setJSON(k, valor, opts = {}) {
  if (usaRedis) {
    const cmd = ['SET', k, JSON.stringify(valor)];
    if (opts.ex) cmd.push('EX', String(opts.ex));
    if (opts.nx) cmd.push('NX');
    const r = await redis(cmd);
    return r === 'OK';
  }
  if (opts.nx && vivo(k)) return false;
  carregar()[k] = { v: valor, exp: opts.ex ? Date.now() + opts.ex * 1000 : 0 };
  salvar();
  return true;
}

export async function del(k) {
  if (usaRedis) return redis(['DEL', k]);
  delete carregar()[k];
  salvar();
}

export async function hset(k, obj, ex) {
  const pares = Object.entries(obj);
  if (!pares.length) return;
  if (usaRedis) {
    await redis(['HSET', k, ...pares.flat().map(String)]);
    if (ex) await redis(['EXPIRE', k, String(ex)]);
    return;
  }
  const atual = vivo(k)?.v || {};
  for (const [c, v] of pares) atual[c] = String(v);
  carregar()[k] = { v: atual, exp: ex ? Date.now() + ex * 1000 : 0 };
  salvar();
}

export async function hgetall(k) {
  if (usaRedis) {
    const arr = (await redis(['HGETALL', k])) || [];
    if (!Array.isArray(arr)) return arr || {};
    const o = {};
    for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
    return o;
  }
  return { ...(vivo(k)?.v || {}) };
}
