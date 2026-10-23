/**
 * Manejo exacto de dinero.
 *
 * Regla del proyecto: PROHIBIDO usar `number` de JavaScript para montos.
 * Todo monto entra como texto ("118.00") o como Decimal, y sale como texto.
 */
import { Decimal as DecimalBase } from 'decimal.js';

// Instancia propia para no depender de la configuración global de decimal.js.
export const Decimal = DecimalBase.clone({
  precision: 40,
  rounding: DecimalBase.ROUND_HALF_UP,
});
export type Decimal = InstanceType<typeof Decimal>;

/** Monto aceptado como entrada: texto decimal o Decimal. Nunca `number`. */
export type MontoEntrada = string | Decimal;

const PATRON_DECIMAL = /^-?\d+(\.\d+)?$/;

/** Convierte una entrada a Decimal, rechazando formatos ambiguos ("1,5", "1e3", ""). */
export function dec(valor: MontoEntrada): Decimal {
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    if (!PATRON_DECIMAL.test(limpio)) {
      throw new Error(`Monto inválido: "${valor}". Usa punto decimal, por ejemplo "118.50".`);
    }
    return new Decimal(limpio);
  }
  if (valor instanceof Decimal) return valor;
  throw new Error('Monto inválido: se esperaba texto o Decimal, no number.');
}

/** Redondea a N decimales con "redondeo comercial" (0.005 → 0.01). */
export function redondear(valor: Decimal, decimales = 2): Decimal {
  return valor.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
}

/** Texto con exactamente 2 decimales, para montos en el XML ("118.00"). */
export function aTexto2(valor: Decimal): string {
  return redondear(valor, 2).toFixed(2);
}

/**
 * Texto con hasta N decimales sin ceros de relleno a la derecha (mínimo 2),
 * para valores unitarios en el XML (SUNAT acepta hasta 10 decimales).
 */
export function aTextoHasta(valor: Decimal, maxDecimales = 10): string {
  const r = redondear(valor, maxDecimales);
  const dp = Math.max(2, r.decimalPlaces());
  return r.toFixed(dp);
}

export function sumar(valores: Decimal[]): Decimal {
  return valores.reduce((acc, v) => acc.plus(v), new Decimal(0));
}
