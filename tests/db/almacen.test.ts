/**
 * Almacén en la base de datos (producción): una vez escrito, un archivo no se cambia ni se borra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenPostgres } from '../../src/almacen/almacen.js';
import type { Db } from '../../src/db/conexion.js';
import { URL_PRUEBAS, prepararBase } from './base-prueba.js';

describe.skipIf(!URL_PRUEBAS)('almacén en PostgreSQL', () => {
  let db: Db;
  let almacen: AlmacenPostgres;
  beforeAll(async () => {
    db = await prepararBase();
    almacen = new AlmacenPostgres(db);
  });
  afterAll(async () => {
    await db?.end();
  });

  it('guarda y lee el contenido exacto (binario)', async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    await almacen.guardar('20600000005/03/B001-1/R-cdr.zip', zip);
    expect((await almacen.leer('20600000005/03/B001-1/R-cdr.zip')).equals(zip)).toBe(true);
  });

  it('reintentar con el mismo contenido no falla; con otro contenido, no sobrescribe', async () => {
    await almacen.guardar('a/x.xml', Buffer.from('<a/>'));
    await expect(almacen.guardar('a/x.xml', Buffer.from('<a/>'))).resolves.toBeUndefined();
    await expect(almacen.guardar('a/x.xml', Buffer.from('<b/>'))).rejects.toThrow(/no se sobrescribe/);
    expect((await almacen.leer('a/x.xml')).toString()).toBe('<a/>');
  });

  it('nadie puede editarlo ni borrarlo, ni siquiera con SQL directo', async () => {
    await almacen.guardar('b/y.xml', Buffer.from('<y/>'));
    await expect(db.query(`UPDATE archivos_contenido SET contenido = 'x' WHERE ruta = 'b/y.xml'`)).rejects.toThrow();
    await expect(db.query(`DELETE FROM archivos_contenido WHERE ruta = 'b/y.xml'`)).rejects.toThrow();
  });

  it('rutas raras o inexistentes: error claro', async () => {
    await expect(almacen.guardar('../fuera.xml', Buffer.from('x'))).rejects.toThrow(/no permitida/);
    await expect(almacen.leer('no/existe.xml')).rejects.toThrow(/No existe/);
  });
});
