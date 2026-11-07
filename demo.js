// Demonstração com dados de mentira: npm run demo e abra http://localhost:3000/?k=demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT || 3000);
const PORTA_MOCK = 4010;

Object.assign(process.env, {
  BLING_CLIENT_ID: 'demo',
  BLING_CLIENT_SECRET: 'demo',
  BLING_CLIENT_ID_2: 'demo2',
  BLING_CLIENT_SECRET_2: 'demo2',
  BLING_API_URL: `http://localhost:${PORTA_MOCK}/Api/v3`,
  BLING_OAUTH_URL: `http://localhost:${PORTA_MOCK}/Api/v3`,
  PAINEL_SENHA: 'demo',
  NOME_PAINEL: process.env.NOME_PAINEL || 'Loja demonstração',
  META_MES: process.env.META_MES ?? '900000',
  ARQUIVO_DADOS: path.join(raiz, '.data/demo.json'),
  UPSTASH_REDIS_REST_URL: '',
  KV_REST_API_URL: '',
});
fs.rmSync(process.env.ARQUIVO_DADOS, { force: true });

const { iniciarMock, pedidosDoDia } = await import('./bling-mock.js');
const store = await import('../lib/store.js');
const { K } = await import('../lib/sync.js');
const { partesNoFuso, diaAnterior } = await import('../lib/datas.js');

await iniciarMock(PORTA_MOCK, `http://localhost:${PORTA}/api/auth/callback`);

// Simula um painel que já está rodando há 10 dias (pra ter a curva por hora e o "ontem até agora")
const agora = partesNoFuso(new Date(), 'America/Sao_Paulo');
const minAgora = agora.hora * 60 + agora.minuto;
for (const [conta, chave] of [['1', 'demo'], ['2', 'demo2']]) {
  let dia = agora.iso;
  for (let i = 0; i < 10; i++) {
    const meiaNoite = Date.parse(`${dia}T00:00:00-03:00`);
    const visto = {};
    for (const p of pedidosDoDia(dia, chave)) {
      if (dia === agora.iso && p._minuto > minAgora) continue;
      visto[p.id] = meiaNoite + p._minuto * 60000 + 20000;
    }
    await store.hset(K.visto(conta, dia), visto);
    await store.setJSON(K.inicio(conta, dia), meiaNoite + 2 * 60000);
    dia = diaAnterior(dia);
  }
}

await import('../server.js');
console.log(`\nDemonstração: abra http://localhost:${PORTA}/?k=demo e clique em "Conectar Bling".`);
console.log('Para a segunda empresa: botão de contas no topo > "Conectar outra conta".\n');
