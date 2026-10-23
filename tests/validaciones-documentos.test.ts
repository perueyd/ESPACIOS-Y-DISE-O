import { describe, expect, it } from 'vitest';
import { digitoVerificadorRuc, esDniValido, esRucValido } from '../src/validaciones/documentos.js';

describe('DNI', () => {
  it('acepta exactamente 8 dígitos', () => {
    expect(esDniValido('12345678')).toBe(true);
    expect(esDniValido('00000001')).toBe(true);
  });
  it.each(['1234567', '123456789', '1234567a', '', ' 12345678', '1234-5678'])('rechaza "%s"', (dni) => {
    expect(esDniValido(dni)).toBe(false);
  });
});

describe('RUC', () => {
  it('acepta RUCs reales con dígito verificador correcto', () => {
    expect(esRucValido('20131312955')).toBe(true); // RUC de la propia SUNAT
    expect(esRucValido('20100070970')).toBe(true);
  });
  it('acepta RUC 10 (persona natural) y RUC 20 (empresa)', () => {
    expect(esRucValido('10456789124')).toBe(true);
    expect(esRucValido('20600000005')).toBe(true);
  });
  it('rechaza un dígito verificador equivocado', () => {
    expect(esRucValido('20131312956')).toBe(false);
    expect(esRucValido('20600000004')).toBe(false);
  });
  it.each(['2013131295', '201313129551', '30131312955', 'abcdefghijk', ''])('rechaza "%s"', (ruc) => {
    expect(esRucValido(ruc)).toBe(false);
  });
  it('convierte los restos 10 y 11 en 0 y 1', () => {
    // Recorre muchos RUC y confirma que el dígito siempre es 0–9.
    for (let i = 0; i < 2000; i++) {
      const base = `20${String(100000000 + i * 4999).slice(0, 8)}`;
      const d = digitoVerificadorRuc(base);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
      expect(esRucValido(base + d)).toBe(true);
    }
  });
});
