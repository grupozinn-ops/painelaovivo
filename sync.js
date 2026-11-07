// Busca os pedidos de cada conta do Bling, agrega por dia e canal e monta o "snapshot"
// que o painel mostra, somando todas as empresas conectadas.
import { config } from './config.js';
import * as store from './store.js';
import { ClienteBling } from './bling.js';
import { listarContas } from './contas.js';
import { partesNoFuso, diasNoMes, isoDia, diaAnterior } from './datas.js';
import { identificarCanal } from './canais.js';

export const K = {
  lock: 'painel:lock',
  estado: 'painel:estado',
  snap: 'painel:snapshot',
  situ: (c) => `painel:situacoes:${c}`,
  canais: (c) => `painel:canais:${c}`,
  dia: (c, d) => `painel:dia:${c}:${d}`,
  visto: (c, d) => `painel:visto:${c}:${d}`,
  inicio: (c, d) => `painel:inicio:${c}:${d}`,
};

const HORA = 3600e3;
const DIA_SEG = 86400;
const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;
const zeros = () => Array(24).fill(0);

// Distribuição típica das vendas ao longo do dia (marketplaces BR). Usada na previsão
// até o painel ter 3 dias inteiros monitorados; depois disso usa a curva real.
const CURVA_PADRAO = (() => {
  const pesos = [2, 1, 0.5, 0.3, 0.3, 0.5, 1.2, 2.5, 4, 5.2, 6, 6, 5.8, 5.8, 6, 5.9, 5.7, 5.4, 5.4, 5.8, 6.3, 6.6, 5.8, 4];
  const soma = pesos.reduce((a, b) => a + b, 0);
  return pesos.map((p) => p / soma);
})();

function valorPedido(o) {
  const v = o?.[config.campoValor];
  return centavos(v ?? o?.total ?? 0);
}

// ---------- Cadastros auxiliares (por conta) ----------
async function carregarSituacoes(cli) {
  const c = await store.getJSON(K.situ(cli.conta));
  if (c && Date.now() - c.at < 24 * HORA) return c;
  const cancelados = new Set([12, ...config.situacoesIgnorar]);
  const nomes = {};
  try {
    const mods = (await cli.get('situacoes/modulos'))?.data || [];
    const texto = (m) => `${m.nome || ''} ${m.descricao || ''}`;
    const mod =
      mods.find((m) => /pedidos?\s+de\s+vendas?/i.test(texto(m))) ||
      mods.find((m) => /vendas?/i.test(texto(m)) && !/compra|nota|nf|servi|proposta|pdv/i.test(texto(m)));
    if (mod) {
      const sits = (await cli.get(`situacoes/modulos/${mod.id}`))?.data || [];
      for (const s of sits) {
        nomes[s.id] = s.nome;
        if (s.id === 12 || s.idHerdado === 12 || /cancel/i.test(s.nome || '')) cancelados.add(s.id);
      }
    }
  } catch (e) {
    if (e.reconectar) throw e;
    console.warn(`Conta ${cli.conta}: situações no padrão (12 = cancelado).`, e.message);
  }
  const r = { at: Date.now(), cancelados: [...cancelados], nomes };
  await store.setJSON(K.situ(cli.conta), r);
  return r;
}

async function carregarCanais(cli) {
  const c = await store.getJSON(K.canais(cli.conta));
  if (c && Date.now() - c.at < 6 * HORA) return c;
  const lista = { ...(c?.lista || {}) };
  let at = Date.now();
  try {
    const d = await cli.todasPaginas('canais-venda', {}, 5);
    for (const x of d) lista[String(x.id)] = { nome: x.descricao, tipo: x.tipo };
  } catch (e) {
    if (e.reconectar) throw e;
    console.warn(`Conta ${cli.conta}: canais de venda indisponíveis (confira o escopo do app).`, e.message);
    at = Date.now() - 5 * HORA; // tenta de novo em 1 hora
  }
  const r = { at, lista };
  await store.setJSON(K.canais(cli.conta), r);
  return r;
}

// ---------- Um dia de pedidos de uma conta ----------
async function atualizarDia(cli, dia, situ, { ehHoje = false } = {}) {
  const conta = cli.conta;
  const pedidos = await cli.todasPaginas('pedidos/vendas', { dataInicial: dia, dataFinal: dia });
  const cancelados = new Set(situ.cancelados);
  const validos = pedidos.filter(
    (o) => !cancelados.has(o?.situacao?.id) && (!o.data || String(o.data).slice(0, 10) === dia)
  );

  const visto = await store.hgetall(K.visto(conta, dia));
  let inicio = await store.getJSON(K.inicio(conta, dia));
  if (ehHoje) {
    const agora = Date.now();
    if (!inicio) {
      inicio = agora;
      await store.setJSON(K.inicio(conta, dia), inicio, { ex: 45 * DIA_SEG });
    }
    const novos = {};
    for (const o of validos) {
      if (!visto[o.id]) {
        novos[o.id] = agora;
        visto[o.id] = String(agora);
      }
    }
    await store.hset(K.visto(conta, dia), novos, 45 * DIA_SEG);
  }

  const pIni = inicio ? partesNoFuso(new Date(inicio), config.fuso) : null;
  const ag = {
    dia,
    at: Date.now(),
    total: 0,
    pedidos: 0,
    canais: {},
    horas: zeros(),
    // monitorado = o painel acompanhou esse dia desde a 1h da manhã (curva por hora confiável)
    monitorado: Boolean(pIni && pIni.iso === dia && pIni.hora < 1),
    ultimos: [],
  };
  for (const o of validos) {
    const v = valorPedido(o);
    ag.total += v;
    ag.pedidos++;
    const lid = String(o?.loja?.id || 0);
    const c = (ag.canais[lid] ||= { total: 0, pedidos: 0 });
    c.total += v;
    c.pedidos++;
    const ts = Number(visto[o.id]);
    if (ts) {
      const p = partesNoFuso(new Date(ts), config.fuso);
      if (p.iso === dia) ag.horas[p.hora] += v;
    }
  }
  if (ehHoje) {
    ag.ultimos = validos
      .map((o) => ({
        id: o.id,
        numero: o.numero,
        loja: String(o?.loja?.id || 0),
        valor: valorPedido(o),
        visto: Number(visto[o.id]) || 0,
      }))
      .sort((a, b) => b.visto - a.visto || b.id - a.id)
      .slice(0, 15);
  }
  await store.setJSON(K.dia(conta, dia), ag, { ex: 70 * DIA_SEG });
  return ag;
}

// ---------- Sincronização ----------
export async function sincronizar({ forcar = false, maxReq = 40, maxMs = 22000 } = {}) {
  const estado = (await store.getJSON(K.estado)) || {};
  const agora = Date.now();
  if (!forcar && estado.ultimaSync && agora - estado.ultimaSync < config.intervaloSync * 1000) return { pulou: 'recente' };
  const contas = await listarContas();
  if (!contas.length) return { pulou: 'sem contas' };
  const pegou = await store.setJSON(K.lock, agora, { ex: 60, nx: true });
  if (!pegou) return { pulou: 'em andamento' };

  const t0 = Date.now();
  const porConta = { ...(estado.contas || {}) };
  const ativos = [];
  try {
    const p = partesNoFuso(new Date(), config.fuso);
    const hoje = p.iso;
    const ontem = diaAnterior(hoje);

    // 1) Hoje, em cada conta
    for (const c of contas) {
      const ant = porConta[c.id] || {};
      if (!forcar && ant.reconectar) continue; // espera a pessoa reconectar essa conta
      if (!forcar && ant.erro && ant.ultimaTentativa && agora - ant.ultimaTentativa < 60e3) continue;
      const cli = new ClienteBling(c.id);
      try {
        const situ = await carregarSituacoes(cli);
        await carregarCanais(cli);
        await atualizarDia(cli, hoje, situ, { ehHoje: true });
        ativos.push({ c, cli, situ, falhou: false });
        porConta[c.id] = { ultimaSync: Date.now(), erro: null, reconectar: false };
      } catch (e) {
        porConta[c.id] = { ...ant, erro: e.message, reconectar: Boolean(e.reconectar), ultimaTentativa: Date.now() };
      }
    }

    // 2) Demais dias do mês (ontem primeiro), alternando entre as contas
    const outros = [ontem];
    for (let d = p.dia - 1; d >= 1; d--) {
      const iso = isoDia(p.ano, p.mes, d);
      if (iso !== ontem) outros.push(iso);
    }
    const fila = [];
    for (const a of ativos) {
      const ags = await store.mgetJSON(outros.map((d) => K.dia(a.c.id, d)));
      outros.forEach((d, i) => {
        const ag = ags[i];
        if (!ag) return fila.push({ a, d, pri: 0, i });
        const validade = d === ontem ? 10 * 60e3 : 3 * HORA;
        if (Date.now() - ag.at > validade) fila.push({ a, d, pri: 1, i });
      });
    }
    fila.sort((x, y) => x.pri - y.pri || x.i - y.i);
    const gastas = () => ativos.reduce((s, a) => s + a.cli.requisicoes, 0);
    for (const item of fila) {
      if (gastas() >= maxReq || Date.now() - t0 > maxMs) break;
      if (item.a.falhou) continue;
      try {
        await atualizarDia(item.a.cli, item.d, item.a.situ);
      } catch (e) {
        item.a.falhou = true;
        porConta[item.a.c.id] = { ...porConta[item.a.c.id], erro: e.message, reconectar: Boolean(e.reconectar), ultimaTentativa: Date.now() };
      }
    }

    const snap = await montarSnapshot(contas);
    await store.setJSON(K.snap, snap);
    await store.setJSON(K.estado, {
      ultimaSync: Date.now(),
      duracaoMs: Date.now() - t0,
      requisicoes: gastas(),
      contas: porConta,
    });
    return { ok: true, requisicoes: gastas(), ms: Date.now() - t0, completo: snap?.mes.completo, contas: porConta };
  } finally {
    await store.del(K.lock);
  }
}

// ---------- Números do painel ----------
function fracaoDoDia(p, curva) {
  let f = 0;
  for (let h = 0; h < p.hora; h++) f += curva[h];
  f += curva[p.hora] * ((p.minuto * 60 + p.segundo) / 3600);
  return Math.min(Math.max(f, 0), 1);
}

function acumuladoAte(horas, p) {
  let s = 0;
  for (let h = 0; h < p.hora; h++) s += horas[h];
  return s + horas[p.hora] * ((p.minuto * 60 + p.segundo) / 3600);
}

// Soma os agregados das contas de um mesmo dia
function somarDia(lista, dia) {
  const presentes = lista.filter(Boolean);
  const r = { dia, total: 0, pedidos: 0, horas: zeros(), carregado: presentes.length === lista.length && lista.length > 0 };
  r.monitorado = r.carregado && presentes.every((a) => a.monitorado);
  for (const a of presentes) {
    r.total += a.total;
    r.pedidos += a.pedidos;
    a.horas.forEach((v, h) => (r.horas[h] += v));
  }
  return r;
}

export async function montarSnapshot(contas) {
  if (!contas) contas = await listarContas();
  if (!contas.length) return null;
  const p = partesNoFuso(new Date(), config.fuso);
  const D = diasNoMes(p.ano, p.mes);
  const hoje = p.iso;
  const ontem = diaAnterior(hoje);
  const diasMes = Array.from({ length: p.dia }, (_, i) => isoDia(p.ano, p.mes, i + 1));

  const chaves = [];
  for (const c of contas) chaves.push(...diasMes.map((d) => K.dia(c.id, d)), K.dia(c.id, ontem), K.canais(c.id));
  const lidos = await store.mgetJSON(chaves);
  const porConta = contas.map((c, k) => {
    const base = k * (diasMes.length + 2);
    return {
      c,
      mes: lidos.slice(base, base + diasMes.length),
      ontem: lidos[base + diasMes.length],
      canais: lidos[base + diasMes.length + 1]?.lista || {},
    };
  });
  const varias = contas.length > 1;

  // Dias do mês somando as empresas
  const dias = diasMes.map((d, i) => somarDia(porConta.map((x) => x.mes[i]), d));
  const agHoje = dias[p.dia - 1];
  const agOntem = somarDia(porConta.map((x) => x.ontem), ontem);
  const carregados = dias.filter((d) => d.carregado).length;
  const totalMes = dias.reduce((s, d) => s + d.total, 0);
  const pedidosMes = dias.reduce((s, d) => s + d.pedidos, 0);
  const fechados = dias.slice(0, p.dia - 1);
  const somaFechados = fechados.reduce((s, d) => s + d.total, 0);
  const media = p.dia > 1 ? somaFechados / (p.dia - 1) : null;

  // Curva do dia: real (dias monitorados com venda) ou padrão
  const candidatos = [...fechados];
  if (!candidatos.some((d) => d.dia === ontem)) candidatos.push(agOntem);
  const monitorados = candidatos.filter((d) => d.monitorado && d.horas.reduce((s, v) => s + v, 0) > 0);
  let curva = CURVA_PADRAO;
  let curvaFonte = 'padrao';
  if (monitorados.length >= 3) {
    curva = zeros();
    for (const a of monitorados) {
      const soma = a.horas.reduce((s, v) => s + v, 0);
      a.horas.forEach((v, h) => (curva[h] += v / soma / monitorados.length));
    }
    curvaFonte = `${monitorados.length} dias monitorados`;
  }

  const frac = fracaoDoDia(p, curva);
  let hojeEsperado;
  let projecao;
  if (media == null) {
    hojeEsperado = agHoje.total / Math.max(frac, 0.15);
    projecao = hojeEsperado * D;
  } else {
    const peloRitmoDoMes = agHoje.total + media * (1 - frac);
    const peloRitmoDeHoje = frac > 0.02 ? agHoje.total / frac : peloRitmoDoMes;
    hojeEsperado = Math.max(agHoje.total, frac * peloRitmoDeHoje + (1 - frac) * peloRitmoDoMes);
    projecao = somaFechados + hojeEsperado + media * (D - p.dia);
  }

  // Canais (somando as empresas)
  const grupos = {};
  for (const x of porConta) {
    for (const a of x.mes) {
      if (!a) continue;
      for (const [lid, c] of Object.entries(a.canais || {})) {
        const info = identificarCanal(lid, x.canais[lid]);
        const porMarketplace = config.agruparCanais === 'marketplace' && info.chave !== 'outro';
        const chave = porMarketplace ? info.chave : `${x.c.id}:${lid}`;
        const g = (grupos[chave] ||= {
          id: chave,
          info,
          porMarketplace,
          total: 0,
          pedidos: 0,
          hojeTotal: 0,
          hojePedidos: 0,
          lojas: new Set(),
          empresas: new Set(),
        });
        g.total += c.total;
        g.pedidos += c.pedidos;
        g.lojas.add(`${x.c.id}:${lid}`);
        g.empresas.add(x.c.apelido);
        if (a.dia === hoje) {
          g.hojeTotal += c.total;
          g.hojePedidos += c.pedidos;
        }
      }
    }
  }
  const listaCanais = Object.values(grupos)
    .map((g) => {
      const { info } = g;
      let nome = g.porMarketplace ? (info.chave === 'direta' ? 'Venda direta' : info.rotulo) : info.nome;
      let sub = '';
      if (varias) sub = g.empresas.size > 1 ? `${g.empresas.size} empresas` : [...g.empresas][0];
      else if (g.porMarketplace && g.lojas.size > 1) sub = `${g.lojas.size} lojas`;
      else if (g.porMarketplace && info.nome !== nome && info.chave !== 'direta') nome = info.nome;
      return {
        id: g.id,
        nome,
        sub,
        chave: info.chave,
        cor: info.cor,
        logo: info.logo,
        sigla: info.sigla,
        total: reais(g.total),
        pedidos: g.pedidos,
        participacao: totalMes ? g.total / totalMes : 0,
        hoje: { total: reais(g.hojeTotal), pedidos: g.hojePedidos },
      };
    })
    .sort((a, b) => b.total - a.total);

  // Por empresa
  const empresas = porConta.map((x) => {
    const tMes = x.mes.reduce((s, a) => s + (a?.total || 0), 0);
    const hj = x.mes[p.dia - 1];
    return {
      id: x.c.id,
      nome: x.c.apelido,
      razao: x.c.nome,
      hoje: { total: reais(hj?.total || 0), pedidos: hj?.pedidos || 0 },
      mes: { total: reais(tMes), pedidos: x.mes.reduce((s, a) => s + (a?.pedidos || 0), 0) },
      participacao: totalMes ? tMes / totalMes : 0,
    };
  });

  // Últimas vendas de todas as empresas
  const ultimos = porConta
    .flatMap((x) =>
      (x.mes[p.dia - 1]?.ultimos || []).map((u) => {
        const info = identificarCanal(u.loja, x.canais[u.loja]);
        return {
          ...u,
          id: `${x.c.id}:${u.id}`,
          valor: reais(u.valor),
          canal: info.nome,
          canalRotulo: info.rotulo,
          cor: info.cor,
          logo: info.logo,
          sigla: info.sigla,
          empresa: varias ? x.c.apelido : '',
        };
      })
    )
    .sort((a, b) => b.visto - a.visto || String(b.id).localeCompare(String(a.id)))
    .slice(0, 15);

  return {
    geradoEm: Date.now(),
    nome: config.nome,
    fuso: config.fuso,
    campoValor: config.campoValor,
    agora: { data: hoje, dia: p.dia, hora: p.hora, minuto: p.minuto, horaDecimal: p.hora + p.minuto / 60 },
    hoje: {
      total: reais(agHoje.total),
      pedidos: agHoje.pedidos,
      ticket: agHoje.pedidos ? reais(agHoje.total / agHoje.pedidos) : 0,
      horas: agHoje.horas.map(reais),
      esperado: reais(hojeEsperado),
    },
    ontem: agOntem.carregado
      ? {
          total: reais(agOntem.total),
          pedidos: agOntem.pedidos,
          monitorado: agOntem.monitorado,
          horas: agOntem.monitorado ? agOntem.horas.map(reais) : null,
          ateAgora: agOntem.monitorado ? reais(acumuladoAte(agOntem.horas, p)) : null,
        }
      : null,
    mes: {
      total: reais(totalMes),
      pedidos: pedidosMes,
      ticket: pedidosMes ? reais(totalMes / pedidosMes) : 0,
      diasNoMes: D,
      diaAtual: p.dia,
      mediaDiaria: media == null ? null : reais(media),
      projecao: reais(projecao),
      meta: config.metaMes || null,
      curva: curvaFonte,
      carregados,
      completo: carregados === p.dia,
      porDia: dias.map((d, i) => ({
        dia: i + 1,
        total: d.carregado ? reais(d.total) : null,
        pedidos: d.carregado ? d.pedidos : null,
      })),
    },
    empresas,
    canais: listaCanais,
    ultimos,
  };
}
