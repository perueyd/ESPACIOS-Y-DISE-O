/**
 * PDF de comprobantes guardados: formato por defecto del canal y elección en cada pedido.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenLocal } from '../../src/almacen/almacen.js';
import { emitirComprobante } from '../../src/comprobantes/emitir.js';
import { firmarComprobante, type ServiciosFirma } from '../../src/comprobantes/firmar-comprobante.js';
import { pdfDeComprobante } from '../../src/comprobantes/pdf-comprobante.js';
import type { Db } from '../../src/db/conexion.js';
import { guardarCertificado } from '../../src/firma/repositorio-certificados.js';
import { generarLlaveMaestra } from '../../src/seguridad/cifrado.js';
import { digitoVerificadorRuc } from '../../src/validaciones/documentos.js';
import { solicitudBoleta } from '../ayudantes.js';
import { crearPfxPrueba } from '../certificado-prueba.js';
import { URL_PRUEBAS, crearEmpresa, prepararBase, type Fixture } from './base-prueba.js';

async function anchoPagina(pdf: Buffer): Promise<number> {
  const ruta = join(await mkdtemp(join(tmpdir(), 'pdfdb-')), 'c.pdf');
  await writeFile(ruta, pdf);
  return Number(/Page size:\s+([\d.]+)/.exec(execFileSync('pdfinfo', [ruta]).toString())![1]);
}

describe.skipIf(!URL_PRUEBAS)('PDF de comprobantes guardados', () => {
  let db: Db;
  let f: Fixture;
  let s: ServiciosFirma;
  const llaveMaestra = Buffer.from(generarLlaveMaestra(), 'base64');

  beforeAll(async () => {
    db = await prepararBase();
    s = { almacen: new AlmacenLocal(await mkdtemp(join(tmpdir(), 'almacen-pdf-'))), llaveMaestra, algoritmo: 'SHA256' };
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    const base = `20${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    f = await crearEmpresa(db, base + digitoVerificadorRuc(base));
    await guardarCertificado(db, { empresaId: f.empresaId, pfx: crearPfxPrueba(), clave: 'clave-de-prueba', llaveMaestra });
  });

  async function emitidaYFirmada(canalId: string): Promise<string> {
    const r = await emitirComprobante(db, { empresaId: f.empresaId, canalId, marcaId: f.marcaId, solicitud: solicitudBoleta() });
    if (r.resultado === 'ERROR_VALIDACION') throw new Error(r.errores.join());
    await firmarComprobante(db, s, r.guardado.id);
    return r.guardado.id;
  }

  it('usa el formato por defecto del canal, y se puede elegir otro en cada pedido', async () => {
    await db.query(`UPDATE canales SET formato_pdf = 'TICKET_80' WHERE id = $1`, [f.canalManual]);
    const enPersona = await emitidaYFirmada(f.canalManual);
    const web = await emitidaYFirmada(f.canalTienda);

    const a = await pdfDeComprobante(db, enPersona);
    expect(a.formato).toBe('TICKET_80');
    expect(await anchoPagina(a.pdf)).toBeCloseTo(226.77, 1);
    expect(a.nombreArchivo).toMatch(/-03-B001-1-ticket\.pdf$/);

    const b = await pdfDeComprobante(db, web);
    expect(b.formato).toBe('A4');
    expect(await anchoPagina(b.pdf)).toBeCloseTo(595.28, 1);

    const c = await pdfDeComprobante(db, enPersona, { formato: 'A4' }); // elegido por el cliente
    expect(c.formato).toBe('A4');
  });

  it('imprime la marca del comprobante y la marca de prueba en BETA', async () => {
    const id = await emitidaYFirmada(f.canalTienda);
    const { pdf } = await pdfDeComprobante(db, id);
    const ruta = join(await mkdtemp(join(tmpdir(), 'pdfdb-')), 'c.pdf');
    await writeFile(ruta, pdf);
    const t = execFileSync('pdftotext', ['-raw', ruta, '-']).toString();
    expect(t).toContain('Espacios y Diseño');
    expect(t).toContain('PRUEBA - SIN VALOR LEGAL');
  });

  it('un comprobante sin firmar no se imprime', async () => {
    const r = await emitirComprobante(db, { empresaId: f.empresaId, canalId: f.canalTienda, solicitud: solicitudBoleta() });
    if (r.resultado === 'ERROR_VALIDACION') throw new Error(r.errores.join());
    await expect(pdfDeComprobante(db, r.guardado.id)).rejects.toThrow(/no está firmado/);
  });

  it('el formato por defecto del canal solo acepta A4 o TICKET_80', async () => {
    await expect(db.query(`UPDATE canales SET formato_pdf = 'CARTA' WHERE id = $1`, [f.canalTienda])).rejects.toThrow();
  });
});
