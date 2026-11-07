// Contas do Bling conectadas ao painel (uma por empresa)
import * as store from './store.js';
import { MAX_CONTAS } from './config.js';

const K_CONTAS = 'painel:contas';

export async function listarContas() {
  const l = await store.getJSON(K_CONTAS);
  return Array.isArray(l) ? l : [];
}

export async function salvarConta(dados) {
  const l = await listarContas();
  const i = l.findIndex((c) => c.id === dados.id);
  if (i >= 0) l[i] = { ...l[i], ...dados };
  else l.push(dados);
  l.sort((a, b) => Number(a.id) - Number(b.id));
  await store.setJSON(K_CONTAS, l);
  return l;
}

export async function removerConta(id) {
  const l = (await listarContas()).filter((c) => c.id !== id);
  await store.setJSON(K_CONTAS, l);
  return l;
}

export function proximaConta(lista) {
  for (let i = 1; i <= MAX_CONTAS; i++) if (!lista.some((c) => c.id === String(i))) return String(i);
  return null;
}

// "ZINN COMPANY COMERCIO E SERVICOS LTDA" -> "Zinn Company"
const PARADAS = new Set([
  'COMERCIO', 'COMÉRCIO', 'SERVICOS', 'SERVIÇOS', 'INDUSTRIA', 'INDÚSTRIA', 'IMPORTACAO', 'IMPORTAÇÃO',
  'EXPORTACAO', 'EXPORTAÇÃO', 'LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S/A', 'S.A.', 'S.A', 'MEI', 'LIMITADA',
]);
export function nomeCurto(razao) {
  const palavras = String(razao || '').trim().split(/\s+/).filter(Boolean);
  const curtas = [];
  for (const p of palavras) {
    if (PARADAS.has(p.toUpperCase().replace(/[,]/g, ''))) break;
    curtas.push(p);
  }
  while (curtas.length && /^(E|DE|DA|DO|DOS|DAS|&|-)$/i.test(curtas[curtas.length - 1])) curtas.pop();
  const base = (curtas.length ? curtas : palavras).slice(0, 3).join(' ');
  if (base !== base.toUpperCase()) return base;
  return base.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, s, l) => s + l.toUpperCase());
}
