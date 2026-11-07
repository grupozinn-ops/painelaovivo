// Reconhece o marketplace pelo nome/tipo do canal de venda cadastrado no Bling.
// A cor segue o marketplace (nunca a posição no ranking).
// logo = nome do arquivo em public/logos/ (ex.: public/logos/mercadolivre.png)
const REGRAS = [
  { chave: 'ml', rotulo: 'Mercado Livre', sigla: 'ML', logo: 'mercadolivre', cor: '#c98500', teste: /mercado\s*livre|mercadolivre|meli\b/i },
  { chave: 'shopee', rotulo: 'Shopee', sigla: 'SH', logo: 'shopee', cor: '#d95926', teste: /shopee/i },
  { chave: 'amazon', rotulo: 'Amazon', sigla: 'AM', logo: 'amazon', cor: '#199e70', teste: /amazon/i },
  { chave: 'magalu', rotulo: 'Magalu', sigla: 'MG', logo: 'magalu', cor: '#3987e5', teste: /magalu|magazine\s*luiza/i },
  { chave: 'tiktok', rotulo: 'TikTok Shop', sigla: 'TT', logo: 'tiktokshop', cor: '#d55181', teste: /tik\s*tok/i },
  { chave: 'madeira', rotulo: 'MadeiraMadeira', sigla: 'MM', logo: 'madeiramadeira', cor: '#2f9e44', teste: /madeira/i },
  { chave: 'shein', rotulo: 'Shein', sigla: 'SN', logo: 'shein', cor: '#9085e9', teste: /shein/i },
  { chave: 'americanas', rotulo: 'Americanas', sigla: 'AC', logo: 'americanas', cor: '#e66767', teste: /americanas|b2w/i },
  { chave: 'casasbahia', rotulo: 'Casas Bahia', sigla: 'CB', logo: 'casasbahia', cor: '#5f8bd6', teste: /casas\s*bahia|via\s*varejo|grupo\s*casas/i },
  { chave: 'site', rotulo: 'Loja virtual', sigla: 'LV', logo: 'lojavirtual', cor: '#b08968', teste: /nuvemshop|shopify|tray|loja\s*integrada|woo|vtex|yampi|site/i },
];

export function identificarCanal(id, canal) {
  if (!id || id === '0') {
    return { chave: 'direta', rotulo: 'Venda direta', nome: 'Venda direta (sem loja)', sigla: 'VD', logo: 'vendadireta', cor: '#8c8178' };
  }
  const texto = `${canal?.nome || ''} ${canal?.tipo || ''}`;
  const r = REGRAS.find((x) => x.teste.test(texto));
  const nome = canal?.nome || (r ? r.rotulo : `Loja ${id}`);
  if (r) return { chave: r.chave, rotulo: r.rotulo, nome, sigla: r.sigla, logo: r.logo, cor: r.cor };
  const sigla = (nome.match(/[A-Za-zÀ-ú0-9]/g) || ['?']).slice(0, 2).join('').toUpperCase();
  return { chave: 'outro', rotulo: canal?.tipo || 'Outro canal', nome, sigla, logo: `loja-${id}`, cor: '#9a8f86' };
}
