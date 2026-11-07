// Bling de mentira, só pra testar o painel sem mexer na conta real.
// Imita OAuth, situações, canais de venda e pedidos de venda da API v3 (com limite de 3 req/s).
import http from 'node:http';
import { partesNoFuso } from '../lib/datas.js';

const FUSO = 'America/Sao_Paulo';
const CANAIS = [
  { id: 204001, descricao: 'Mercado Livre Zinn', tipo: 'MercadoLivre', peso: 44 },
  { id: 204002, descricao: 'Shopee Zinn Casa', tipo: 'Shopee', peso: 27 },
  { id: 204003, descricao: 'Amazon', tipo: 'Amazon', peso: 10 },
  { id: 204004, descricao: 'Magalu', tipo: 'MagazineLuiza', peso: 8 },
  { id: 204005, descricao: 'TikTok Shop', tipo: 'TikTokShop', peso: 6 },
  { id: 204006, descricao: 'MadeiraMadeira', tipo: 'MadeiraMadeira', peso: 4 },
  { id: 0, descricao: '', tipo: '', peso: 1 },
];
const CANAIS_B = [
  { id: 305001, descricao: 'Mercado Livre Móveis', tipo: 'MercadoLivre', peso: 50 },
  { id: 305002, descricao: 'Shopee Móveis', tipo: 'Shopee', peso: 25 },
  { id: 305003, descricao: 'TikTok Shop Móveis', tipo: 'TikTokShop', peso: 15 },
  { id: 305004, descricao: 'MadeiraMadeira', tipo: 'MadeiraMadeira', peso: 10 },
];
// Duas empresas de mentira, uma por client_id
const EMPRESAS = {
  demo: { id: 'emp-a', nome: 'LOJA DEMONSTRACAO COMERCIO E SERVICOS LTDA', cnpj: '11.111.111/0001-11', fator: 1, canais: CANAIS },
  demo2: { id: 'emp-b', nome: 'MOVEIS DEMONSTRACAO INDUSTRIA LTDA', cnpj: '22.222.222/0001-22', fator: 0.45, canais: CANAIS_B },
};
const CURVA = [2, 1, 0.5, 0.3, 0.3, 0.5, 1.2, 2.5, 4, 5.2, 6, 6, 5.8, 5.8, 6, 5.9, 5.7, 5.4, 5.4, 5.8, 6.3, 6.6, 5.8, 4];
const HORAS = CURVA.map((p, h) => ({ p, h }));
const PRODUTOS = [129.9, 159.9, 189.9, 219.9, 249.9, 289.9, 329.9, 389.9, 459.9, 89.9, 119.9];

function rng(semente) {
  let a = 0;
  for (const c of semente) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 0x9e3779b9) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const escolher = (r, itens, peso) => {
  const total = itens.reduce((s, x) => s + peso(x), 0);
  let v = r() * total;
  for (const x of itens) if ((v -= peso(x)) <= 0) return x;
  return itens[itens.length - 1];
};

// Todos os pedidos de um dia, com a hora em que "entraram" (minutos desde 00:00)
export function pedidosDoDia(iso, chave = 'demo') {
  const emp = EMPRESAS[chave];
  const r = rng(chave === 'demo' ? iso : `${chave}:${iso}`);
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  const fator = [0.85, 1.15, 1.1, 1.0, 0.98, 0.95, 0.8][dow];
  const n = Math.round((70 + r() * 45) * fator * emp.fator);
  const diaNum = Number(iso.replaceAll('-', '')) + (chave === 'demo' ? 0 : 50000000);
  const lista = [];
  for (let i = 0; i < n; i++) {
    const hora = escolher(r, HORAS, (x) => x.p).h;
    const minuto = hora * 60 + Math.floor(r() * 60);
    const canal = escolher(r, emp.canais, (c) => c.peso);
    const qtd = r() < 0.18 ? 2 : 1;
    const produtos = Math.round(PRODUTOS[Math.floor(r() * PRODUTOS.length)] * qtd * 100) / 100;
    const frete = canal.id === 0 ? 0 : Math.round(r() * 3500) / 100;
    const x = r();
    const situacao = x < 0.04 ? 12 : x < 0.06 ? 777001 : x < 0.5 ? 9 : x < 0.8 ? 15 : 6;
    lista.push({
      id: diaNum * 1000 + i,
      numero: 40000 + (diaNum % 10000) * 10 + i,
      numeroLoja: canal.id ? String(2000009000000000 + diaNum * 100 + i) : '',
      data: iso,
      dataSaida: '0000-00-00',
      dataPrevista: '0000-00-00',
      totalProdutos: produtos,
      total: Math.round((produtos + frete) * 100) / 100,
      contato: { id: 1000 + i, nome: 'Cliente teste', tipoPessoa: 'F', numeroDocumento: '' },
      situacao: { id: situacao, valor: situacao === 12 ? 2 : 0 },
      loja: { id: canal.id, unidadeNegocio: { id: 0 } },
      _minuto: minuto,
    });
  }
  return lista.sort((a, b) => b._minuto - a._minuto);
}

function pedidosVisiveis(iso, chave) {
  const agora = partesNoFuso(new Date(), FUSO);
  if (iso > agora.iso) return [];
  const todos = pedidosDoDia(iso, chave);
  if (iso < agora.iso) return todos;
  const minAgora = agora.hora * 60 + agora.minuto;
  return todos.filter((p) => p._minuto <= minAgora);
}

const limpar = ({ _minuto, ...p }) => p;

export function iniciarMock(porta, callbackUrl) {
  const marcas = {};
  const codigos = new Map(); // code -> client_id
  const tokens = new Map(); // access -> client_id
  const refresh = new Map(); // refresh -> client_id
  const novoToken = () => `tok_${Math.random().toString(36).slice(2)}`;

  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    const p = url.pathname.replace(/^\/Api\/v3/, '');
    const enviar = (status, corpo) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };

    if (p === '/oauth/authorize') {
      const codigo = `cod_${Math.random().toString(36).slice(2)}`;
      codigos.set(codigo, url.searchParams.get('client_id'));
      res.writeHead(302, { Location: `${callbackUrl}?code=${codigo}&state=${url.searchParams.get('state')}` });
      return res.end();
    }
    if (p === '/oauth/token' && req.method === 'POST') {
      let corpo = '';
      req.on('data', (c) => (corpo += c));
      req.on('end', () => {
        const f = new URLSearchParams(corpo);
        const auth = Buffer.from(String(req.headers.authorization || '').replace('Basic ', ''), 'base64').toString();
        const [cid, segredo] = auth.split(':');
        if (!EMPRESAS[cid] || segredo !== cid) return enviar(401, { error: { type: 'invalid_client', description: 'Credenciais inválidas' } });
        const g = f.get('grant_type');
        const dono = g === 'authorization_code' ? codigos.get(f.get('code')) : refresh.get(f.get('refresh_token'));
        if (!dono || dono !== cid) return enviar(400, { error: { type: 'invalid_grant', description: 'Código ou refresh token inválido' } });
        if (g === 'refresh_token') refresh.delete(f.get('refresh_token'));
        else codigos.delete(f.get('code'));
        const t = { access_token: novoToken(), expires_in: 21600, token_type: 'Bearer', scope: '', refresh_token: novoToken() };
        tokens.set(t.access_token, cid);
        refresh.set(t.refresh_token, cid);
        enviar(200, t);
      });
      return;
    }

    // recursos: exige token e respeita 3 req/s
    const tok = String(req.headers.authorization || '').replace('Bearer ', '');
    const chave = tokens.get(tok);
    if (!chave) return enviar(401, { error: { type: 'invalid_token', message: 'invalid_token' } });
    const emp = EMPRESAS[chave];
    const fila = (marcas[chave] ||= []);
    const agora = Date.now();
    while (fila.length && agora - fila[0] > 1000) fila.shift();
    if (fila.length >= 3) return enviar(429, { error: { type: 'TOO_MANY_REQUESTS', message: 'Limite de requisições atingido' } });
    fila.push(agora);

    if (p === '/empresas/me/dados-basicos') {
      return enviar(200, { data: { id: emp.id, nome: emp.nome, cnpj: emp.cnpj, email: 'teste@exemplo.com', dataContrato: '2024-01-01' } });
    }

    if (p === '/situacoes/modulos') {
      return enviar(200, { data: [
        { id: 98309, nome: 'Compras', descricao: 'Pedidos de compra', criarSituacoes: true },
        { id: 98310, nome: 'Vendas', descricao: 'Pedidos de venda', criarSituacoes: true },
      ] });
    }
    if (p === '/situacoes/modulos/98310') {
      return enviar(200, { data: [
        { id: 6, nome: 'Em aberto' }, { id: 9, nome: 'Atendido' }, { id: 12, nome: 'Cancelado' },
        { id: 15, nome: 'Em andamento' }, { id: 777001, nome: 'Devolvido ML', idHerdado: 12 },
      ] });
    }
    if (p === '/canais-venda') {
      return enviar(200, { data: emp.canais.filter((c) => c.id).map(({ peso, ...c }) => ({ ...c, situacao: 1 })) });
    }
    if (p === '/pedidos/vendas') {
      const ini = url.searchParams.get('dataInicial');
      const fim = url.searchParams.get('dataFinal') || ini;
      const pagina = Number(url.searchParams.get('pagina') || 1);
      const limite = Math.min(100, Number(url.searchParams.get('limite') || 100));
      let todos = [];
      for (let d = new Date(`${ini}T12:00:00Z`); d.toISOString().slice(0, 10) <= fim; d = new Date(d.getTime() + 86400000)) {
        todos = todos.concat(pedidosVisiveis(d.toISOString().slice(0, 10), chave));
      }
      return enviar(200, { data: todos.slice((pagina - 1) * limite, pagina * limite).map(limpar) });
    }
    enviar(404, { error: { type: 'RESOURCE_NOT_FOUND', message: 'Recurso não encontrado' } });
  });
  return new Promise((ok) => srv.listen(porta, () => ok(srv)));
}
