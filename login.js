// Abre a tela de autorização do Bling.
// Uso: /api/auth/login?k=SUA_SENHA            -> conecta a próxima conta livre
//      /api/auth/login?k=SUA_SENHA&conta=2    -> conecta (ou reconecta) a conta 2
import crypto from 'node:crypto';
import { faltandoConfig, contaValida, credenciais } from '../../lib/config.js';
import { urlAutorizacao } from '../../lib/bling.js';
import { listarContas, proximaConta } from '../../lib/contas.js';
import * as store from '../../lib/store.js';
import { autorizado, pagina, query, redirecionar } from '../../lib/http.js';

export default async function handler(req, res) {
  const falta = faltandoConfig();
  if (falta.length) {
    return pagina(res, 500, 'Faltam variáveis de ambiente', `Cadastre no servidor: ${falta.join(', ')}.`);
  }
  if (!autorizado(req)) {
    return pagina(res, 401, 'Senha incorreta', 'Abra o painel, digite a senha e conecte o Bling por lá.', {
      href: '/',
      texto: 'Abrir o painel',
    });
  }
  const q = query(req);
  const conta = q.conta ? contaValida(q.conta) : proximaConta(await listarContas());
  if (!conta) {
    return pagina(res, 400, 'Limite de contas', 'O painel aceita até 5 contas do Bling. Remova uma antes de conectar outra.', {
      href: '/',
      texto: 'Voltar ao painel',
    });
  }
  if (!credenciais(conta).clientId) {
    return pagina(res, 500, 'Falta o app do Bling', `Cadastre BLING_CLIENT_ID_${conta} e BLING_CLIENT_SECRET_${conta}.`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  await store.setJSON(`painel:state:${state}`, { conta }, { ex: 600 });
  redirecionar(res, urlAutorizacao(state, conta));
}
