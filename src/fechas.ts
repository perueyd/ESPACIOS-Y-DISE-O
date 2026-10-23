/** Fecha y hora oficiales de Lima (UTC−5), sin depender de la zona del servidor. */
export function ahoraLima(ahora: Date = new Date()): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00';
  return { fecha: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}:${p('second')}` };
}
