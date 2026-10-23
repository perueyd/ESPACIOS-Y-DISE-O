import { describe, expect, it } from 'vitest';
import { calcularItem, calcularTotales } from '../src/calculos/igv.js';
import { enteroEnLetras, montoEnLetras } from '../src/calculos/monto-en-letras.js';
import { Decimal, aTexto2, aTextoHasta, dec, redondear } from '../src/dinero.js';
import { Afectacion } from '../src/tipos.js';
import { item } from './ayudantes.js';

const IGV = new Decimal('0.18');

describe('dinero', () => {
  it('no tiene errores de punto flotante', () => {
    // En JavaScript 0.1 + 0.2 = 0.30000000000000004
    expect(dec('0.1').plus(dec('0.2')).toString()).toBe('0.3');
  });
  it('rechaza formatos ambiguos y números de JavaScript', () => {
    expect(() => dec('1,50')).toThrow();
    expect(() => dec('1e3')).toThrow();
    expect(() => dec('')).toThrow();
    expect(() => dec(1.5 as unknown as string)).toThrow();
  });
  it('redondea "comercialmente" a 2 decimales', () => {
    expect(aTexto2(dec('2.675'))).toBe('2.68'); // en JS (2.675).toFixed(2) = "2.67"
    expect(aTexto2(dec('2.674'))).toBe('2.67');
    expect(aTexto2(dec('100'))).toBe('100.00');
  });
  it('formatea valores unitarios con hasta 10 decimales', () => {
    expect(aTextoHasta(dec('100'))).toBe('100.00');
    expect(aTextoHasta(dec('50.762711864406779661'))).toBe('50.7627118644');
    expect(aTextoHasta(dec('84.7457627119'))).toBe('84.7457627119');
  });
});

describe('IGV con precio incluido', () => {
  it('S/ 118.00 → valor 100.00 + IGV 18.00', () => {
    const r = calcularItem(item('118.00'), IGV);
    expect(r.valorVenta.toFixed(2)).toBe('100.00');
    expect(r.igv.toFixed(2)).toBe('18.00');
    expect(r.total.toFixed(2)).toBe('118.00');
    expect(r.valorUnitario.toString()).toBe('100');
    expect(r.porcentajeIgv.toString()).toBe('18');
  });

  it('S/ 59.90 × 2 → total exacto 119.80', () => {
    const r = calcularItem(item('59.90', '2'), IGV);
    expect(r.total.toFixed(2)).toBe('119.80');
    expect(r.valorVenta.toFixed(2)).toBe('101.53');
    expect(r.igv.toFixed(2)).toBe('18.27');
    expect(r.valorUnitario.toString()).toBe('50.7627118644');
  });

  it('exonerado: sin IGV, el valor es el precio', () => {
    const r = calcularItem(item('15.00', '1', { afectacion: Afectacion.EXONERADO }), IGV);
    expect(r.valorVenta.toFixed(2)).toBe('15.00');
    expect(r.igv.isZero()).toBe(true);
    expect(r.porcentajeIgv.isZero()).toBe(true);
  });

  it('rechaza cantidad o precio en cero', () => {
    expect(() => calcularItem(item('0'), IGV)).toThrow(/precio/);
    expect(() => calcularItem(item('10', '0'), IGV)).toThrow(/cantidad/);
  });

  it('totales: el importe es la suma exacta de lo cobrado por ítem', () => {
    const items = [
      calcularItem(item('1180.00'), IGV),
      calcularItem(item('59.90', '2'), IGV),
      calcularItem(item('15.00', '1', { afectacion: Afectacion.EXONERADO }), IGV),
    ];
    const t = calcularTotales(items);
    expect(t.gravado.toFixed(2)).toBe('1101.53');
    expect(t.igv.toFixed(2)).toBe('198.27');
    expect(t.exonerado.toFixed(2)).toBe('15.00');
    expect(t.importeTotal.toFixed(2)).toBe('1314.80');
  });

  it('miles de precios al azar: base + IGV = total y diferencias ≤ S/ 0.01 frente a las fórmulas de SUNAT', () => {
    let semilla = 12345;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 5000; i++) {
      const precio = (Math.floor(azar() * 500000) / 100 + 0.01).toFixed(2); // 0.01 a 5000.00
      const cantidad = String(1 + Math.floor(azar() * 20));
      const r = calcularItem(item(precio, cantidad), IGV);
      expect(r.valorVenta.plus(r.igv).eq(r.total)).toBe(true);
      expect(r.total.eq(redondear(dec(precio).times(cantidad)))).toBe(true);
      // IGV ≈ base × 18 %
      expect(r.igv.minus(r.valorVenta.times(IGV)).abs().lte('0.01')).toBe(true);
      // valor de venta ≈ cantidad × valor unitario
      expect(r.valorVenta.minus(r.cantidad.times(r.valorUnitario)).abs().lte('0.01')).toBe(true);
    }
  });
});

describe('monto en letras', () => {
  it.each([
    [0, 'CERO'],
    [1, 'UNO'],
    [15, 'QUINCE'],
    [21, 'VEINTIUNO'],
    [30, 'TREINTA'],
    [99, 'NOVENTA Y NUEVE'],
    [100, 'CIEN'],
    [101, 'CIENTO UNO'],
    [118, 'CIENTO DIECIOCHO'],
    [500, 'QUINIENTOS'],
    [1000, 'MIL'],
    [1001, 'MIL UNO'],
    [2500, 'DOS MIL QUINIENTOS'],
    [21000, 'VEINTIÚN MIL'],
    [31000, 'TREINTA Y UN MIL'],
    [100000, 'CIEN MIL'],
    [101000, 'CIENTO UN MIL'],
    [1000000, 'UN MILLÓN'],
    [2000001, 'DOS MILLONES UNO'],
    [21000000, 'VEINTIÚN MILLONES'],
  ])('%i → %s', (n, texto) => {
    expect(enteroEnLetras(n)).toBe(texto);
  });

  it('incluye céntimos y moneda', () => {
    expect(montoEnLetras(dec('1314.80'))).toBe('SON MIL TRESCIENTOS CATORCE CON 80/100 SOLES');
    expect(montoEnLetras(dec('118'))).toBe('SON CIENTO DIECIOCHO CON 00/100 SOLES');
    expect(montoEnLetras(dec('0.05'))).toBe('SON CERO CON 05/100 SOLES');
  });
});
