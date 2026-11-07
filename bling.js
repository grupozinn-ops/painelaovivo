// Cliente da API v3 do Bling: OAuth2 por conta, renovação automática do token e limite de 3 req/s por conta
import { config, credenciais } from './config.js';
import * as store from './store.js';

const kTokens = (conta) => `bling:tokens:${conta}`;
const INTERVALO_MS = 360; // o Bling aceita até 3 requisições por segundo em cada conta

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function basic(conta) {
  const { clientId, clientSecret } = credenciais(conta);
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
}

export function urlAutorizacao(state, conta) {
  const u = new URL(`${config.oauthUrl}/oauth/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', credenciais(conta).clientId);
  u.searchParams.set('state', state);
  return u.toString();
}

function erroReconectar(msg) {
  const e = new Error(msg);
  e.reconectar = true;
  return e;
}

async function pedirToken(params, conta) {
  const r = await fetch(`${config.oauthUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basic(conta),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'enable-jwt': '1',
    },
    body: new URLSearchParams(params),
  });
  const txt = await r.text();
  let j = {};
  try {
    j = JSON.parse(txt);
  } catch {
    j = { bruto: txt.slice(0, 200) };
  }
  if (!r.ok || !j.access_token) {
    const motivo =
      j.error?.description || j.error_description || j.error?.message || j.error || j.bruto || r.status;
    const e = erroReconectar(`O Bling recusou o acesso (${typeof motivo === 'string' ? motivo : r.status}).`);
    e.status = r.status;
    throw e;
  }
  return j;
}

async function salvarTokens(conta, j, anterior) {
  const t = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || anterior?.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 21600) * 1000,
    renovadoEm: Date.now(),
  };
  // o refresh_token do Bling vale 30 dias e renova a cada uso
  await store.setJSON(kTokens(conta), t, { ex: 31 * 86400 });
  return t;
}

// Troca o código da autorização por tokens (ainda sem salvar: o callback confere a empresa antes)
export async function trocarCodigo(code, conta) {
  return pedirToken({ grant_type: 'authorization_code', code }, conta);
}
export const salvarTokensConta = (conta, j) => salvarTokens(conta, j);

// Razão social e CNPJ da conta que acabou de autorizar
export async function dadosEmpresa(accessToken) {
  try {
    const r = await fetch(`${config.apiUrl}/empresas/me/dados-basicos`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' },
    });
    if (!r.ok) return null;
    return (await r.json())?.data || null;
  } catch {
    return null;
  }
}

export const tokensSalvos = (conta) => store.getJSON(kTokens(conta));
export const apagarTokens = (conta) => store.del(kTokens(conta));

export class ClienteBling {
  constructor(conta) {
    this.conta = String(conta);
    this.requisicoes = 0;
    this.tokens = null;
    this.ultimaReq = 0;
  }

  async token(forcar = false) {
    if (!this.tokens) this.tokens = await tokensSalvos(this.conta);
    if (!this.tokens?.refresh_token && !this.tokens?.access_token) {
      throw erroReconectar('Essa conta do Bling não está conectada.');
    }
    const vencendo = !this.tokens.expires_at || this.tokens.expires_at - Date.now() < 5 * 60 * 1000;
    if (forcar || !this.tokens.access_token || vencendo) {
      if (!this.tokens.refresh_token) throw erroReconectar('O acesso ao Bling expirou.');
      const j = await pedirToken({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token }, this.conta);
      this.tokens = await salvarTokens(this.conta, j, this.tokens);
    }
    return this.tokens.access_token;
  }

  async get(caminho, params = {}) {
    const u = new URL(`${config.apiUrl}/${caminho}`);
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(`${k}[]`, x));
      else u.searchParams.set(k, v);
    }
    let renovou = false;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const falta = this.ultimaReq + INTERVALO_MS - Date.now();
      if (falta > 0) await espera(falta);
      this.ultimaReq = Date.now();
      this.requisicoes++;
      const r = await fetch(u, {
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: 'application/json',
          'enable-jwt': '1',
        },
      });
      if (r.status === 401 && !renovou) {
        renovou = true;
        await this.token(true);
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        await espera(1100 * (tentativa + 1));
        continue;
      }
      const txt = await r.text();
      let j = null;
      try {
        j = JSON.parse(txt);
      } catch {}
      if (r.status === 404 && j?.error?.type === 'RESOURCE_NOT_FOUND') return { data: [] };
      if (!r.ok) {
        const msg = j?.error?.description || j?.error?.message || txt.slice(0, 160);
        const e = new Error(`Bling ${r.status} em /${caminho}: ${msg}`);
        e.status = r.status;
        if (r.status === 401) e.reconectar = true;
        throw e;
      }
      return j || { data: [] };
    }
    throw new Error(`O Bling não respondeu em /${caminho} (limite de requisições). Tento de novo já já.`);
  }

  async todasPaginas(caminho, params = {}, maxPaginas = 60) {
    const todos = [];
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const j = await this.get(caminho, { ...params, pagina, limite: 100 });
      const d = Array.isArray(j?.data) ? j.data : [];
      todos.push(...d);
      if (d.length < 100) break;
    }
    return todos;
  }
}
