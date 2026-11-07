// Dados do painel. Se os números tiverem mais de ~40 s, consulta o Bling antes de responder.
import { faltandoConfig } from '../lib/config.js';
import { listarContas } from '../lib/contas.js';
import * as store from '../lib/store.js';
import { sincronizar, K } from '../lib/sync.js';
import { autorizado, json } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    const falta = faltandoConfig();
    if (falta.length) return json(res, 500, { erro: 'config', falta });
    if (!autorizado(req)) return json(res, 401, { erro: 'senha' });

    const contas = await listarContas();
    if (!contas.length) return json(res, 200, { conectado: false });

    let erroSync = null;
    try {
      await sincronizar({ maxReq: 24, maxMs: 9000 });
    } catch (e) {
      erroSync = e.message;
    }
    const [snapshot, estado] = await store.mgetJSON([K.snap, K.estado]);
    json(res, 200, {
      conectado: true,
      contas: contas.map((c) => ({ id: c.id, apelido: c.apelido, status: estado?.contas?.[c.id] || null })),
      snapshot,
      estado,
      erroSync,
      servidor: Date.now(),
    });
  } catch (e) {
    json(res, 500, { erro: 'interno', mensagem: e.message });
  }
}
