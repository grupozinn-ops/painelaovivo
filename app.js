// Painel de vendas ao vivo: busca /api/dashboard a cada 30 s e desenha tudo.
const $ = (id) => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const CHAVE_SENHA = 'painel:senha';
const POLL_MS = 30000;

const st = {
  senha: null,
  resp: null,
  snap: null,
  offset: 0,
  erroRede: null,
  periodoCanais: ls.get('painel:canais') === 'hoje' ? 'hoje' : 'mes',
  som: ls.get('painel:som') === '1',
  idsVistos: null,
  valorHero: null,
  timer: null,
  carregando: false,
  jaTentou: false,
  fuso: 'America/Sao_Paulo',
};

// ---------- Formatação ----------
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => `R$ ${nf0.format(Math.round(v || 0))}`;
const brl2 = (v) => `R$ ${nf2.format(v || 0)}`;
const pct = (v) => `${nf0.format(Math.round((v || 0) * 100))}%`;
function compacto(v) {
  const a = Math.abs(v || 0);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} mil`;
  return `R$ ${nf0.format(Math.round(v || 0))}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const agoraServidor = () => Date.now() + st.offset;
function horaFuso(ms, comSeg = false) {
  return new Date(ms).toLocaleTimeString('pt-BR', {
    timeZone: st.fuso, hour: '2-digit', minute: '2-digit', ...(comSeg ? { second: '2-digit' } : {}),
  });
}
function dataLonga(iso) {
  const t = new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Na TV a lista tem altura fixa: tira itens do fim até caber, sem linha cortada
function caber(lista, minimo = 3) {
  let guarda = 40;
  while (lista.children.length > minimo && lista.scrollHeight > lista.clientHeight + 1 && guarda--) lista.lastElementChild.remove();
}
function haQuanto(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `às ${horaFuso(agoraServidor() - ms)}`;
}

// ---------- Logos dos marketplaces (arquivos em /logos/) ----------
const logos = {}; // nome -> url | null (sem arquivo) | 'buscando'
let reRenderLogo = 0;
function buscarLogo(nome) {
  if (!nome || nome in logos) return;
  logos[nome] = 'buscando';
  const tentar = (exts) => {
    if (!exts.length) { logos[nome] = null; return; }
    const url = `/logos/${nome}.${exts[0]}`;
    const img = new Image();
    img.onload = () => {
      logos[nome] = url;
      cancelAnimationFrame(reRenderLogo);
      reRenderLogo = requestAnimationFrame(() => { if (st.snap) { renderCanais(); renderUltimos(st.snap); } });
    };
    img.onerror = () => tentar(exts.slice(1));
    img.src = url;
  };
  tentar(['png', 'svg']);
}
// Logo do marketplace; enquanto não houver arquivo, mostra a sigla na cor do canal
function marcaCanal(c, classe = '') {
  buscarLogo(c.logo);
  const url = logos[c.logo];
  if (url && url !== 'buscando') return `<span class="marca-mp ${classe}"><img src="${url}" alt="" loading="lazy"></span>`;
  return `<span class="marca-mp sigla ${classe}" style="--cor:${c.cor}" aria-hidden="true">${esc(c.sigla || '?')}</span>`;
}

// ---------- Telas ----------
const TELAS = ['telaSenha', 'telaConectar', 'telaCarregando', 'telaErro'];
function mostrar(id) {
  for (const t of TELAS) $(t).hidden = t !== id;
  $('app').hidden = id !== 'app';
  if (id === 'app') manterTelaLigada();
}
function mostrarErro(titulo, texto) {
  $('erroTitulo').textContent = titulo;
  $('erroTexto').textContent = texto;
  mostrar('telaErro');
}

// ---------- Dados ----------
function agendar(ms) {
  clearTimeout(st.timer);
  st.timer = setTimeout(carregar, ms);
}

async function carregar() {
  if (st.carregando || !st.senha) return;
  if (document.visibilityState === 'hidden') return; // volta quando a aba ficar visível
  st.carregando = true;
  try {
    const r = await fetch('/api/dashboard', { headers: { 'x-painel-senha': st.senha }, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      ls.del(CHAVE_SENHA);
      st.senha = null;
      $('erroSenha').hidden = !st.jaTentou;
      mostrar('telaSenha');
      $('campoSenha').focus();
      return;
    }
    if (j.erro === 'config') return mostrarErro('Faltam variáveis de ambiente', `Cadastre no servidor: ${(j.falta || []).join(', ')}.`);
    if (!r.ok) throw new Error(j.mensagem || `O servidor respondeu ${r.status}.`);
    st.erroRede = null;
    st.offset = (j.servidor || Date.now()) - Date.now();
    st.resp = j;
    $('btnConectar').href = `/api/auth/login?k=${encodeURIComponent(st.senha)}`;

    if (!j.conectado) return mostrar('telaConectar');
    const problemas = contasComProblema();
    if (!j.snapshot) {
      if (problemas.length && problemas.length === (j.contas || []).length && problemas.every((c) => c.status.reconectar)) {
        $('telaConectar').querySelector('p').textContent = 'O acesso ao Bling expirou ou foi recusado. Conecte de novo pra voltar a ver as vendas.';
        $('btnConectar').href = linkConectar(problemas[0].id);
        mostrar('telaConectar');
        return;
      }
      const erro = j.erroSync || problemas[0]?.status?.erro;
      $('carregTexto').textContent = erro
        ? `O Bling respondeu: ${erro} Tentando de novo.`
        : 'Lendo os pedidos do mês no Bling. Na primeira vez leva alguns segundos.';
      mostrar('telaCarregando');
      agendar(5000);
      return;
    }
    st.snap = j.snapshot;
    st.fuso = j.snapshot.fuso || st.fuso;
    mostrar('app');
    render();
    agendar(j.snapshot.mes.completo || problemas.length ? POLL_MS : 6000);
  } catch (e) {
    st.erroRede = e.message;
    if (st.snap) renderStatus();
    else mostrarErro('Sem conexão com o servidor', e.message);
    agendar(15000);
  } finally {
    st.carregando = false;
  }
}

const linkConectar = (conta) => `/api/auth/login?k=${encodeURIComponent(st.senha)}${conta ? `&conta=${conta}` : ''}`;
function contasComProblema() {
  return (st.resp?.contas || []).filter((c) => c.status && (c.status.reconectar || c.status.erro));
}

// ---------- Render ----------
function render() {
  const s = st.snap;
  document.title = `${brl(s.hoje.total)} hoje · ${s.nome}`;
  $('nome').textContent = s.nome;
  $('dataHoje').textContent = dataLonga(s.agora.data);
  const novos = detectarNovas(s);
  renderHero(s);
  renderEmpresas(s);
  renderKpis(s);
  renderCanais();
  renderUltimos(s, novos);
  desenharRitmo();
  desenharDias();
  renderStatus();
}

function pintarHero(v) {
  const [inteiro, cent] = nf2.format(v).split(',');
  const el = $('hojeTotal');
  el.querySelector('.inteiro').textContent = inteiro;
  el.querySelector('.cent').textContent = `,${cent}`;
}

function animarHero(alvo) {
  const de = st.valorHero;
  st.valorHero = alvo;
  const el = $('hojeTotal');
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (de == null || de === alvo || reduzir) return pintarHero(alvo);
  if (alvo > de) {
    el.classList.add('subiu');
    setTimeout(() => el.classList.remove('subiu'), 1400);
  }
  const t0 = performance.now();
  const dur = 1200;
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    pintarHero(de + (alvo - de) * e);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function renderHero(s) {
  animarHero(s.hoje.total);
  $('hojePedidos').textContent = nf0.format(s.hoje.pedidos);
  $('hojeTicket').textContent = brl2(s.hoje.ticket);
  $('hojeEsperado').textContent = brl(Math.max(s.hoje.esperado, s.hoje.total));
  const o = s.ontem;
  const delta = $('compDelta');
  delta.hidden = true;
  if (o?.monitorado && o.ateAgora != null) {
    $('compRot').textContent = `Ontem até ${horaFuso(agoraServidor())}`;
    $('compValor').textContent = brl(o.ateAgora);
    if (o.ateAgora > 0) {
      const d = (s.hoje.total - o.ateAgora) / o.ateAgora;
      delta.hidden = false;
      delta.className = `delta ${d >= 0 ? 'up' : 'down'}`;
      delta.textContent = `${d >= 0 ? '▲' : '▼'} ${pct(Math.abs(d))}`;
    }
  } else if (o) {
    $('compRot').textContent = 'Ontem (dia inteiro)';
    $('compValor').textContent = brl(o.total);
  } else {
    $('compRot').textContent = 'Ontem';
    $('compValor').textContent = 'carregando';
  }
}

function renderEmpresas(s) {
  const lista = s.empresas || [];
  const mostrar = lista.length > 1;
  $('empresas').hidden = !mostrar;
  document.querySelector('.hero').classList.toggle('com-empresas', mostrar);
  if (!mostrar) return;
  const status = Object.fromEntries((st.resp?.contas || []).map((c) => [c.id, c.status]));
  const totalHoje = lista.reduce((t, e) => t + e.hoje.total, 0);
  $('listaEmpresas').innerHTML = lista.map((e) => {
    const stt = status[e.id];
    const alerta = stt?.reconectar ? ' · <span class="alerta">desconectada</span>' : stt?.erro ? ' · <span class="alerta">sem resposta</span>' : '';
    const parte = totalHoje ? e.hoje.total / totalHoje : 0;
    return `<li class="empresa" title="${esc(e.razao)}">
      <div class="empresa-topo"><span class="empresa-nome">${esc(e.nome)}</span><span class="empresa-hoje">${brl(e.hoje.total)}</span></div>
      <div class="empresa-barra"><span style="width:${Math.max(1.5, parte * 100)}%"></span></div>
      <div class="empresa-info">${pct(parte)} de hoje · ${nf0.format(e.hoje.pedidos)} ped. · mês ${compacto(e.mes.total)}${alerta}</div>
    </li>`;
  }).join('');
}

function renderKpis(s) {
  const m = s.mes;
  const selo = (t) => ` <span class="selo">${esc(t)}</span>`;
  $('mesTotal').textContent = brl(m.total);
  $('mesNota').innerHTML = `Dia <b>${m.diaAtual}</b> de ${m.diasNoMes}` + (m.completo ? '' : selo(`lendo ${m.carregados}/${m.diaAtual} dias`));
  $('mesProj').textContent = brl(m.projecao);
  $('projNota').innerHTML =
    (m.mediaDiaria != null ? `Ritmo de <b>${compacto(m.mediaDiaria)}</b> por dia` : 'Pelo ritmo de hoje') +
    (m.completo ? '' : selo('parcial'));
  $('mesTicket').textContent = brl2(m.ticket);
  $('ticketNota').innerHTML = `Hoje <b>${brl2(s.hoje.ticket)}</b>`;
  $('mesPedidos').textContent = nf0.format(m.pedidos);
  const fechados = m.diaAtual - 1;
  $('pedidosNota').innerHTML = fechados > 0
    ? `Média de <b>${nf0.format(Math.round((m.pedidos - s.hoje.pedidos) / fechados))}</b> por dia`
    : `Hoje <b>${nf0.format(s.hoje.pedidos)}</b>`;
  if (m.meta) {
    $('meta').hidden = false;
    $('metaFeito').style.width = `${Math.min(100, (m.total / m.meta) * 100)}%`;
    $('metaProj').style.width = `${Math.min(100, (m.projecao / m.meta) * 100)}%`;
    $('metaNota').innerHTML = `<b>${pct(m.total / m.meta)}</b> da meta de ${compacto(m.meta)} · projeção ${pct(m.projecao / m.meta)}`;
  } else {
    $('meta').hidden = true;
  }
}

function renderCanais(limite = 7) {
  const s = st.snap;
  if (!s) return;
  const mes = st.periodoCanais === 'mes';
  $('segMes').setAttribute('aria-selected', String(mes));
  $('segHoje').setAttribute('aria-selected', String(!mes));
  let itens = s.canais
    .map((c) => ({ ...c, v: mes ? c.total : c.hoje.total, n: mes ? c.pedidos : c.hoje.pedidos }))
    .filter((c) => c.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = itens.reduce((a, c) => a + c.v, 0);
  if (itens.length > limite) {
    const resto = itens.slice(limite - 1);
    itens = itens.slice(0, limite - 1);
    itens.push({
      nome: `Outros ${resto.length} canais`, cor: '#6e645b', sigla: '+', logo: null,
      v: resto.reduce((a, c) => a + c.v, 0), n: resto.reduce((a, c) => a + c.n, 0), hoje: { total: 0 },
    });
  }
  const max = itens[0]?.v || 1;
  $('listaCanais').innerHTML = itens.length
    ? itens.map((c, i) => `
      <li class="canal" title="${esc(c.nome)}">
        <span class="canal-pos">${i + 1}</span>
        <span class="canal-nome">${marcaCanal(c)}<span class="txt">${esc(c.nome)}${c.sub ? ` <small>${esc(c.sub)}</small>` : ''}</span></span>
        <span class="canal-valor">${brl(c.v)}</span>
        <span class="canal-barra"><span style="width:${Math.max(1.5, (c.v / max) * 100)}%;background:${c.cor}"></span></span>
        <span class="canal-info">${pct(c.v / total)} · ${nf0.format(c.n)} ped.</span>
      </li>`).join('')
    : `<li class="vazio-lista">Nenhuma venda ${mes ? 'no mês' : 'hoje'} ainda.</li>`;
  const ol = $('listaCanais');
  if (limite > 3 && ol.scrollHeight > ol.clientHeight + 1) renderCanais(limite - 1);
}

function detectarNovas(s) {
  const lista = s.ultimos || [];
  const novos = new Set();
  if (st.idsVistos) {
    const recentes = lista.filter((u) => !st.idsVistos.has(u.id) && u.visto > agoraServidor() - 15 * 60e3);
    recentes.forEach((u) => novos.add(u.id));
    recentes.slice(0, 3).reverse().forEach(toastVenda);
    if (recentes.length && st.som) tocar();
  }
  st.idsVistos = new Set([...(st.idsVistos || []), ...lista.map((u) => u.id)]);
  return novos;
}

function renderUltimos(s, novos = new Set()) {
  const lista = (s.ultimos || []).slice(0, innerWidth < 760 ? 8 : 10);
  $('ultimosNota').textContent = `${nf0.format(s.hoje.pedidos)} pedidos hoje`;
  $('listaUltimos').innerHTML = lista.length
    ? lista.map((u) => `
      <li class="venda${novos.has(u.id) ? ' nova' : ''}">
        <span class="venda-hora">${u.visto ? horaFuso(u.visto) : '--:--'}</span>
        <span class="venda-canal">${marcaCanal(u, 'pequena')}<span class="txt">${esc(u.canal)} ${u.empresa ? `<small class="empresa-tag">${esc(u.empresa)}</small>` : `<small>#${esc(u.numero)}</small>`}</span></span>
        <span class="venda-valor">${brl2(u.valor)}</span>
      </li>`).join('')
    : '<li class="vazio-lista">As vendas de hoje aparecem aqui assim que entrarem no Bling.</li>';
  caber($('listaUltimos'), 2);
}

function renderStatus() {
  const s = st.snap;
  const r = st.resp || {};
  if (!s) return;
  const idade = agoraServidor() - s.geradoEm;
  let estado = 'ok';
  let txt = `Ao vivo · ${haQuanto(idade)}`;
  const aviso = $('aviso');
  aviso.hidden = true;
  aviso.className = 'aviso';
  if (st.erroRede) {
    estado = 'erro';
    txt = 'Sem conexão';
    aviso.hidden = false;
    aviso.textContent = `Sem conexão com o servidor. Mostrando os números de ${haQuanto(idade)}.`;
  } else if (contasComProblema().some((c) => c.status.reconectar)) {
    const c = contasComProblema().find((x) => x.status.reconectar);
    estado = 'erro';
    txt = 'Bling desconectado';
    aviso.hidden = false;
    const varias = (r.contas || []).length > 1;
    aviso.innerHTML = `O acesso ao Bling${varias ? ` de ${esc(c.apelido)}` : ''} expirou${varias ? ' e os números dela pararam de atualizar' : ''}. <a href="${linkConectar(c.id)}">Conectar de novo</a>`;
  } else if (contasComProblema().length || r.erroSync) {
    const c = contasComProblema()[0];
    estado = 'atrasado';
    txt = idade > 3 * 60e3 ? `Atualizado ${haQuanto(idade)}` : `Ao vivo · ${haQuanto(idade)}`;
    aviso.hidden = false;
    aviso.classList.add('leve');
    const varias = (r.contas || []).length > 1;
    aviso.textContent = `O Bling${varias && c ? ` de ${c.apelido}` : ''} não respondeu na última tentativa (${c?.status?.erro || r.erroSync}). Tentando de novo.`;
  } else if (idade > 3 * 60e3) {
    estado = 'atrasado';
    txt = `Atualizado ${haQuanto(idade)}`;
  }
  $('status').dataset.estado = estado;
  $('statusTxt').textContent = txt;
}

// ---------- Gráficos (SVG feito à mão) ----------
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}
function passoBonito(max, n = 4) {
  const bruto = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const opcoes = [1, 2, 2.5, 5, 10];
  return mag * opcoes.find((o) => o * mag >= bruto);
}
function escala(max, n = 4) {
  const passo = passoBonito(Math.max(max, 1), n);
  const topo = Math.ceil(Math.max(max, 1) / passo) * passo;
  const ticks = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  return { topo, ticks };
}
function eixoValor(v) {
  if (v === 0) return '0';
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return nf0.format(v);
}
function acumuladoEm(horas, t) {
  if (!horas) return null;
  const h = Math.floor(t);
  let s = 0;
  for (let i = 0; i < Math.min(h, 24); i++) s += horas[i];
  if (h < 24) s += horas[h] * (t - h);
  return s;
}
function preparar(box) {
  box.replaceChildren();
  const W = box.clientWidth;
  const H = box.clientHeight;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, box);
  return { svg, W, H };
}
function mostrarDica(ev, html) {
  const d = $('dica');
  d.innerHTML = html;
  d.hidden = false;
  const r = d.getBoundingClientRect();
  let x = ev.clientX + 14;
  let y = ev.clientY - r.height - 12;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y < 8) y = ev.clientY + 16;
  d.style.left = `${Math.max(8, x)}px`;
  d.style.top = `${y}px`;
}
const esconderDica = () => ($('dica').hidden = true);

function desenharRitmo() {
  const s = st.snap;
  const box = $('grafRitmo');
  if (!s || !box.clientWidth) return;
  const { svg, W, H } = preparar(box);
  const estreito = W < 520;
  const m = { t: 14, r: estreito ? 12 : 84, b: 24, l: 44 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const agora = s.agora.horaDecimal;
  const horasHoje = s.hoje.horas;
  const horasOntem = s.ontem?.horas || null;
  $('legOntem').hidden = !horasOntem;
  const esperado = Math.max(s.hoje.esperado, s.hoje.total);
  const totalOntem = horasOntem ? acumuladoEm(horasOntem, 24) : 0;
  const { topo, ticks } = escala(Math.max(esperado, totalOntem, s.hoje.total) * 1.05, estreito ? 3 : 4);
  const X = (t) => m.l + (t / 24) * iw;
  const Y = (v) => m.t + ih - (v / topo) * ih;

  for (const v of ticks) {
    el('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = eixoValor(v);
  }
  for (let h = 0; h <= 24; h += estreito ? 6 : 3) {
    el('text', { x: X(h), y: H - 6, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg).textContent = `${h}h`;
  }

  const ptsHoje = [[0, 0]];
  for (let h = 0; h < Math.floor(agora); h++) ptsHoje.push([h + 1, acumuladoEm(horasHoje, h + 1)]);
  ptsHoje.push([agora, s.hoje.total]);
  const caminho = (pts) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('');

  if (horasOntem) {
    const pts = [[0, 0]];
    for (let h = 0; h < 24; h++) pts.push([h + 1, acumuladoEm(horasOntem, h + 1)]);
    el('path', { d: caminho(pts), fill: 'none', stroke: 'var(--ontem)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }
  // previsão até 24h
  el('path', {
    d: `M${X(agora)},${Y(s.hoje.total)}L${X(24)},${Y(esperado)}`,
    fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', opacity: 0.85,
  }, svg);
  // área + linha de hoje
  el('path', { d: `${caminho(ptsHoje)}L${X(agora)},${Y(0)}L${X(0)},${Y(0)}Z`, fill: 'var(--accent-wash)' }, svg);
  el('path', { d: caminho(ptsHoje), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  el('circle', { cx: X(agora), cy: Y(s.hoje.total), r: 5.5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);

  if (!estreito) {
    // rótulo de hoje à esquerda do ponto quando já é fim do dia, pra não bater na previsão
    const aDireita = agora < 18;
    el('text', {
      class: 'rotulo-valor', x: X(agora) + (aDireita ? 10 : -10), y: Y(s.hoje.total) - 12, 'text-anchor': aDireita ? 'start' : 'end',
    }, svg).textContent = compacto(s.hoje.total);
    el('text', { x: X(24) + 8, y: Y(esperado) + 4 }, svg).textContent = `prev. ${compacto(esperado)}`;
  }

  // hover
  const mira = el('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--muted)', 'stroke-width': 1, opacity: 0 }, svg);
  const alvo = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
  alvo.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(24, ((ev.clientX - r.left - m.l) / iw) * 24));
    const hh = Math.floor(t);
    const mm = Math.round((t - hh) * 60);
    mira.setAttribute('x1', X(t));
    mira.setAttribute('x2', X(t));
    mira.setAttribute('opacity', 0.6);
    const vh = t <= agora ? acumuladoEm(horasHoje, t) : null;
    const vo = horasOntem ? acumuladoEm(horasOntem, t) : null;
    mostrarDica(ev, `<b>Até ${String(hh).padStart(2, '0')}:${String(Math.min(mm, 59)).padStart(2, '0')}</b>
      <div class="linha"><span class="ponto" style="background:var(--accent)"></span>Hoje ${vh == null ? 'ainda não' : brl(vh)}</div>
      ${vo != null ? `<div class="linha"><span class="ponto" style="background:var(--ontem)"></span>Ontem ${brl(vo)}</div>` : ''}`);
  });
  alvo.addEventListener('pointerleave', () => { mira.setAttribute('opacity', 0); esconderDica(); });
}

function barra(x, y, w, base, r = 4) {
  const h = base - y;
  if (h <= 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${base}Z`;
}

function desenharDias() {
  const s = st.snap;
  const box = $('grafDias');
  if (!s || !box.clientWidth) return;
  const { svg, W, H } = preparar(box);
  const m = { t: 22, r: 8, b: 24, l: 44 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const D = s.mes.diasNoMes;
  const hoje = s.agora.dia;
  const media = s.mes.mediaDiaria ?? Math.max(s.hoje.esperado, s.hoje.total);
  const esperado = Math.max(s.hoje.esperado, s.hoje.total);
  const valores = s.mes.porDia.map((d) => d.total || 0);
  const { topo, ticks } = escala(Math.max(...valores, esperado, media) * 1.08, 3);
  const banda = iw / D;
  const bw = Math.max(3, Math.min(24, banda * 0.7));
  const Y = (v) => m.t + ih - (v / topo) * ih;
  const base = Y(0);
  const cx = (d) => m.l + banda * (d - 0.5);

  for (const v of ticks) {
    el('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = eixoValor(v);
  }

  for (let d = 1; d <= D; d++) {
    const x = cx(d) - bw / 2;
    if (d < hoje) {
      const v = s.mes.porDia[d - 1]?.total;
      if (v != null) el('path', { d: barra(x, Y(v), bw, base), fill: 'var(--passado)' }, svg);
    } else if (d === hoje) {
      el('path', { d: barra(x, Y(esperado), bw, base), fill: 'var(--ghost)' }, svg);
      el('path', { d: barra(x, Y(s.hoje.total), bw, base), fill: 'var(--accent)' }, svg);
    } else {
      el('path', { d: barra(x, Y(media), bw, base), fill: 'var(--ghost)' }, svg);
    }
  }

  // linha da média
  $('legMedia').hidden = s.mes.mediaDiaria == null;
  if (s.mes.mediaDiaria != null) {
    const ym = Y(media);
    el('line', { x1: m.l, x2: m.l + iw, y1: ym, y2: ym, stroke: 'var(--fg-2)', 'stroke-width': 1, opacity: 0.45 }, svg);
    $('legMediaTxt').textContent = `Média ${compacto(media)}`;
  }
  // valor de hoje no topo da barra (no celular as barras são finas demais; fica só na dica)
  const yTopo = Math.min(Y(esperado), Y(s.hoje.total));
  if (W >= 520) el('text', { class: 'rotulo-valor', x: cx(hoje), y: Math.max(12, yTopo - 6), 'text-anchor': hoje > D - 2 ? 'end' : hoje < 3 ? 'start' : 'middle' }, svg)
    .textContent = compacto(s.hoje.total);

  // eixo dos dias
  const marcas = new Set([1, D]);
  const passo = W < 520 ? 10 : 5;
  for (let d = passo; d < D; d += passo) marcas.add(d);
  for (const d of marcas) {
    if (d !== hoje && Math.abs(d - hoje) < (W < 520 ? 3 : 2)) continue;
    el('text', { x: cx(d), y: H - 6, 'text-anchor': 'middle' }, svg).textContent = d;
  }
  el('text', { x: cx(hoje), y: H - 6, 'text-anchor': 'middle', fill: 'var(--fg)', 'font-weight': 700 }, svg).textContent = hoje;

  // hover por dia
  const alvo = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
  alvo.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const d = Math.max(1, Math.min(D, Math.floor((ev.clientX - r.left - m.l) / banda) + 1));
    const info = s.mes.porDia[d - 1];
    const mm = s.agora.data.split('-')[1];
    const dt = `${String(d).padStart(2, '0')}/${mm}`;
    let html;
    if (d < hoje) html = info?.total != null ? `<b>${dt}</b><br>${brl(info.total)} · ${nf0.format(info.pedidos)} pedidos` : `<b>${dt}</b><br>Carregando do Bling`;
    else if (d === hoje) html = `<b>Hoje, ${dt}</b><br>${brl(s.hoje.total)} · ${nf0.format(s.hoje.pedidos)} pedidos<br>Previsão ${brl(esperado)}`;
    else html = `<b>${dt}</b><br>Projeção ${brl(media)}`;
    mostrarDica(ev, html);
  });
  alvo.addEventListener('pointerleave', esconderDica);
}

// ---------- Avisos de venda ----------
let audio = null;
function tocar() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    [[1318.5, 0], [1760, 0.13]].forEach(([f, dt]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.22, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.55);
      o.connect(g).connect(audio.destination);
      o.start(t + dt);
      o.stop(t + dt + 0.6);
    });
  } catch {}
}
function toastVenda(u) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${marcaCanal(u)}<span>Nova venda · ${esc(u.canalRotulo || u.canal)}</span><b>${brl2(u.valor)}</b>`;
  $('toasts').prepend(t);
  setTimeout(() => t.remove(), 5200);
}
function toastTexto(texto) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  $('toasts').prepend(t);
  setTimeout(() => t.remove(), 5200);
}

// ---------- Contas do Bling ----------
async function chamarContas(corpo) {
  const r = await fetch('/api/contas', {
    method: corpo ? 'POST' : 'GET',
    headers: { 'x-painel-senha': st.senha, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

function pilula(status) {
  if (!status) return '<span class="pilula espera">Carregando</span>';
  if (status.reconectar) return '<span class="pilula erro">Desconectada</span>';
  if (status.erro) return '<span class="pilula espera">Sem resposta</span>';
  return '<span class="pilula ok">Ao vivo</span>';
}

function desenharContas(dados) {
  const ul = $('listaContas');
  ul.innerHTML = dados.contas.length
    ? dados.contas.map((c) => `
      <li class="conta" data-conta="${esc(c.id)}">
        <div class="conta-topo">
          <span class="conta-num">#${esc(c.id)}</span>
          <input class="conta-apelido" id="apelido-${esc(c.id)}" value="${esc(c.apelido)}" maxlength="40" aria-label="Nome da empresa no painel">
          ${pilula(c.status)}
        </div>
        <p class="conta-dados">${esc(c.nome)}${c.cnpj ? ` · CNPJ ${esc(c.cnpj)}` : ''}${c.status?.erro ? `<br>${esc(c.status.erro)}` : ''}</p>
        <div class="conta-acoes">
          <a class="btn-sec" href="${linkConectar(c.id)}">Reconectar</a>
          <button class="btn-sec perigo" type="button" data-remover="${esc(c.id)}">Remover</button>
        </div>
      </li>`).join('')
    : '<li class="vazio-lista">Nenhuma conta conectada.</li>';
  $('novaConta').hidden = !dados.proxima;
  if (dados.proxima) {
    $('btnNovaConta').href = linkConectar(dados.proxima);
    $('numNova').textContent = dados.proxima;
    $('numNova2').textContent = dados.proxima;
    $('btnNovaConta').textContent = dados.contas.length ? 'Conectar outra conta' : 'Conectar Bling';
  }

  ul.querySelectorAll('.conta-apelido').forEach((inp) => {
    const salvar = async () => {
      const conta = inp.closest('.conta').dataset.conta;
      const original = dados.contas.find((c) => c.id === conta)?.apelido;
      const novo = inp.value.trim();
      if (!novo || novo === original) { inp.value = original; return; }
      try {
        desenharContas(await chamarContas({ acao: 'renomear', conta, apelido: novo }));
        toastTexto('Nome salvo');
        carregar();
      } catch (e) { toastTexto(e.message); }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('blur', salvar);
  });
  ul.querySelectorAll('[data-remover]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!b.classList.contains('confirmar')) {
        b.classList.add('confirmar');
        b.textContent = 'Confirmar remoção';
        setTimeout(() => { b.classList.remove('confirmar'); b.textContent = 'Remover'; }, 5000);
        return;
      }
      try {
        desenharContas(await chamarContas({ acao: 'remover', conta: b.dataset.remover }));
        toastTexto('Conta removida do painel');
        carregar();
      } catch (e) { toastTexto(e.message); }
    });
  });
}

async function abrirContas() {
  $('modalContas').hidden = false;
  $('listaContas').innerHTML = '<li class="vazio-lista">Carregando…</li>';
  try {
    desenharContas(await chamarContas());
  } catch (e) {
    $('listaContas').innerHTML = `<li class="vazio-lista">${esc(e.message)}</li>`;
  }
  $('fecharContas').focus();
}
function fecharContas() {
  $('modalContas').hidden = true;
  $('btnContas').focus();
}

// ---------- Tela ligada, tela cheia, relógio ----------
let travaTela = null;
async function manterTelaLigada() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !travaTela) {
      travaTela = await navigator.wakeLock.request('screen');
      travaTela.addEventListener('release', () => (travaTela = null));
    }
  } catch {}
}

function tick() {
  $('relogio').textContent = horaFuso(agoraServidor(), true);
  if (st.snap && !$('app').hidden) renderStatus();
}

// ---------- Início ----------
function iniciar() {
  const url = new URL(location.href);
  const k = url.searchParams.get('k');
  if (k) {
    ls.set(CHAVE_SENHA, k);
    st.senha = k;
    url.searchParams.delete('k');
  }
  if (url.searchParams.has('conectado')) {
    url.searchParams.delete('conectado');
    setTimeout(() => toastTexto('Conta do Bling conectada'), 600);
  }
  history.replaceState(null, '', url.pathname + url.search);
  st.senha = st.senha || ls.get(CHAVE_SENHA);

  $('formSenha').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('campoSenha').value.trim();
    if (!v) return;
    st.senha = v;
    st.jaTentou = true;
    ls.set(CHAVE_SENHA, v);
    carregar();
  });

  const som = $('btnSom');
  som.setAttribute('aria-pressed', String(st.som));
  som.addEventListener('click', () => {
    st.som = !st.som;
    ls.set('painel:som', st.som ? '1' : '0');
    som.setAttribute('aria-pressed', String(st.som));
    if (st.som) tocar();
  });

  const tela = $('btnTela');
  if (!document.documentElement.requestFullscreen) tela.hidden = true;
  tela.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  $('btnContas').addEventListener('click', abrirContas);
  $('fecharContas').addEventListener('click', fecharContas);
  $('modalContas').addEventListener('click', (e) => { if (e.target === $('modalContas')) fecharContas(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modalContas').hidden) fecharContas(); });

  for (const [id, per] of [['segMes', 'mes'], ['segHoje', 'hoje']]) {
    $(id).addEventListener('click', () => {
      st.periodoCanais = per;
      ls.set('painel:canais', per);
      renderCanais();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      manterTelaLigada();
      carregar();
    }
  });

  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      desenharRitmo();
      desenharDias();
      if (st.snap) { renderCanais(); renderUltimos(st.snap); }
    });
  });
  ro.observe($('grafRitmo'));
  ro.observe($('grafDias'));
  ro.observe(document.querySelector('.canais'));
  ro.observe(document.querySelector('.ultimos'));

  setInterval(tick, 1000);
  tick();

  if (!st.senha) {
    mostrar('telaSenha');
    return;
  }
  mostrar('telaCarregando');
  carregar();
}

iniciar();
