// Datas sempre no fuso da loja (padrão America/Sao_Paulo), mesmo com o servidor em UTC
const cache = new Map();
function formatador(fuso) {
  if (!cache.has(fuso)) {
    cache.set(
      fuso,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: fuso,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    );
  }
  return cache.get(fuso);
}

export function partesNoFuso(data, fuso) {
  const p = Object.fromEntries(formatador(fuso).formatToParts(data).map((x) => [x.type, x.value]));
  return {
    ano: +p.year,
    mes: +p.month,
    dia: +p.day,
    hora: +p.hour,
    minuto: +p.minute,
    segundo: +p.second,
    iso: `${p.year}-${p.month}-${p.day}`,
  };
}

export const diasNoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

export const isoDia = (ano, mes, dia) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

export function diaAnterior(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) - 86400000).toISOString().slice(0, 10);
}
