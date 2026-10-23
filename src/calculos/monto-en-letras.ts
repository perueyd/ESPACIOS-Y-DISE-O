/**
 * Monto en letras para la leyenda 1000 del comprobante.
 * Ejemplo: 1250.50 → "SON MIL DOSCIENTOS CINCUENTA CON 50/100 SOLES"
 */
import { type Decimal, redondear } from '../dinero.js';

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function menorQueMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[c]!;
  if (resto > 0) {
    let r: string;
    if (resto < 30) r = UNIDADES[resto]!;
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      r = DECENAS[d]! + (u > 0 ? ` Y ${UNIDADES[u]!}` : '');
    }
    texto = texto ? `${texto} ${r}` : r;
  }
  return texto;
}

/** Convierte un entero (0 a 999 999 999 999) a letras en mayúsculas. */
export function enteroEnLetras(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n > 999_999_999_999) {
    throw new Error('Número fuera de rango para convertir a letras');
  }
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${apocopar(enteroEnLetras(millones))} MILLONES`);
  }
  if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${apocopar(menorQueMil(miles))} MIL`);
  if (resto > 0) partes.push(menorQueMil(resto));
  return partes.join(' ');
}

/** "UNO" → "UN" delante de MIL/MILLONES ("VEINTIUNO MIL" → "VEINTIÚN MIL"). */
function apocopar(texto: string): string {
  if (texto.endsWith('VEINTIUNO')) return texto.slice(0, -'VEINTIUNO'.length) + 'VEINTIÚN';
  if (texto.endsWith('UNO')) return texto.slice(0, -3) + 'UN';
  return texto;
}

export function montoEnLetras(monto: Decimal, moneda: 'PEN' = 'PEN'): string {
  const r = redondear(monto, 2);
  const entero = r.trunc();
  const centimos = r.minus(entero).times(100).toFixed(0).padStart(2, '0');
  const nombreMoneda = moneda === 'PEN' ? 'SOLES' : moneda;
  return `SON ${enteroEnLetras(entero.toNumber())} CON ${centimos}/100 ${nombreMoneda}`;
}
