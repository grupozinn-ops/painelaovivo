const limpar = (u) => String(u || '').replace(/\/+$/, '');

export const MAX_CONTAS = 5;

export const config = {
  clientId: process.env.BLING_CLIENT_ID || '',
  clientSecret: process.env.BLING_CLIENT_SECRET || '',
  apiUrl: limpar(process.env.BLING_API_URL || 'https://api.bling.com.br/Api/v3'),
  oauthUrl: limpar(process.env.BLING_OAUTH_URL || 'https://www.bling.com.br/Api/v3'),
  senha: process.env.PAINEL_SENHA || '',
  fuso: process.env.FUSO || 'America/Sao_Paulo',
  campoValor: process.env.CAMPO_VALOR === 'total' ? 'total' : 'totalProdutos',
  metaMes: Number(String(process.env.META_MES || '').replace(/\./g, '').replace(',', '.')) || 0,
  nome: process.env.NOME_PAINEL || 'Vendas ao vivo',
  // marketplace = soma Mercado Livre das duas empresas numa linha só; loja = uma linha por loja do Bling
  agruparCanais: process.env.AGRUPAR_CANAIS === 'loja' ? 'loja' : 'marketplace',
  situacoesIgnorar: String(process.env.SITUACOES_IGNORAR || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  // de quantos em quantos segundos o painel pode consultar o Bling de novo
  intervaloSync: Number(process.env.INTERVALO_SYNC_SEG || 40),
};

// Cada conta pode usar um app próprio do Bling (BLING_CLIENT_ID_2, BLING_CLIENT_SECRET_2...).
// Sem essas variáveis, usa o app principal.
export function credenciais(conta) {
  const s = String(conta) === '1' ? '' : `_${conta}`;
  return {
    clientId: process.env[`BLING_CLIENT_ID${s}`] || config.clientId,
    clientSecret: process.env[`BLING_CLIENT_SECRET${s}`] || config.clientSecret,
  };
}

export function contaValida(conta) {
  const n = Number(conta);
  return Number.isInteger(n) && n >= 1 && n <= MAX_CONTAS ? String(n) : null;
}

export function faltandoConfig() {
  const falta = [];
  if (!config.clientId) falta.push('BLING_CLIENT_ID');
  if (!config.clientSecret) falta.push('BLING_CLIENT_SECRET');
  if (!config.senha) falta.push('PAINEL_SENHA');
  return falta;
}
