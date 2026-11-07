// O Bling volta pra cá depois da autorização (cadastre esta URL como "Link de redirecionamento" no app)
import { trocarCodigo, salvarTokensConta, dadosEmpresa } from '../../lib/bling.js';
import { listarContas, salvarConta, nomeCurto } from '../../lib/contas.js';
import * as store from '../../lib/store.js';
import { K, montarSnapshot } from '../../lib/sync.js';
import { query, pagina, redirecionar } from '../../lib/http.js';

const voltar = { href: '/', texto: 'Voltar ao painel' };

export default async function handler(req, res) {
  const { code, state, error } = query(req);
  if (error) {
    return pagina(res, 400, 'Autorização cancelada', 'O Bling não autorizou o acesso. Tente conectar de novo pelo painel.', voltar);
  }
  const pedido = state ? await store.getJSON(`painel:state:${state}`) : null;
  if (!code || !pedido?.conta) {
    return pagina(res, 400, 'Link expirado', 'Esse retorno do Bling não é válido ou já foi usado. Conecte de novo pelo painel.', voltar);
  }
  await store.del(`painel:state:${state}`);
  const conta = pedido.conta;

  let tokens;
  try {
    tokens = await trocarCodigo(code, conta);
  } catch (e) {
    return pagina(res, 502, 'Não deu pra conectar', `${e.message} Confira o Client ID e o Client Secret dessa conta.`, voltar);
  }

  const empresa = await dadosEmpresa(tokens.access_token);
  const contas = await listarContas();
  const repetida = empresa
    ? contas.find((c) => c.id !== conta && ((empresa.id && c.empresaId === empresa.id) || (empresa.cnpj && c.cnpj === empresa.cnpj)))
    : null;
  if (repetida) {
    return pagina(
      res,
      409,
      'Essa empresa já está conectada',
      `Você autorizou de novo a conta de ${repetida.apelido}. Para conectar a outra empresa, saia do Bling (ou abra uma janela anônima), entre com o login da outra empresa e clique em "Conectar outra conta" no painel.`,
      voltar
    );
  }

  await salvarTokensConta(conta, tokens);
  const anterior = contas.find((c) => c.id === conta);
  const razao = empresa?.nome || anterior?.nome || `Empresa ${conta}`;
  const lista = await salvarConta({
    id: conta,
    nome: razao,
    apelido: anterior?.apelido || nomeCurto(razao),
    cnpj: empresa?.cnpj || anterior?.cnpj || '',
    empresaId: empresa?.id || anterior?.empresaId || '',
    conectadoEm: Date.now(),
  });

  // libera a conta para sincronizar já e força uma consulta nova
  const estado = (await store.getJSON(K.estado)) || {};
  if (estado.contas) delete estado.contas[conta];
  estado.ultimaSync = 0;
  await store.setJSON(K.estado, estado);
  await store.setJSON(K.snap, await montarSnapshot(lista));

  redirecionar(res, `/?conectado=${conta}`);
}
