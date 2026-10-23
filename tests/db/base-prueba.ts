/**
 * Base de datos para pruebas: se reinicia desde cero y se aplican las migraciones.
 * Requiere DATABASE_URL_PRUEBAS (ver `npm run db:prueba`). Por seguridad solo
 * acepta bases cuyo nombre termine en "_pruebas".
 */
import { crearPool, type Db } from '../../src/db/conexion.js';
import { migrar } from '../../scripts/migrar.js';
import { RUC_EMPRESA } from '../ayudantes.js';

export const URL_PRUEBAS = process.env.DATABASE_URL_PRUEBAS;

export async function prepararBase(): Promise<Db> {
  if (!URL_PRUEBAS) throw new Error('Falta DATABASE_URL_PRUEBAS');
  const nombre = new URL(URL_PRUEBAS).pathname.slice(1);
  if (!nombre.endsWith('_pruebas')) {
    throw new Error(`Por seguridad, las pruebas solo corren en bases "*_pruebas" (recibí "${nombre}").`);
  }
  const db = crearPool(URL_PRUEBAS);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrar(db, () => undefined);
  return db;
}

export interface Fixture {
  empresaId: string;
  canalTienda: string;
  canalManual: string;
  marcaId: string;
}

/** Empresa MYPE con series F001, B001, FC01, BC01 y dos canales. */
export async function crearEmpresa(db: Db, ruc = RUC_EMPRESA, regimen = 'MYPE_TRIBUTARIO'): Promise<Fixture> {
  const e = await db.query(
    `INSERT INTO empresas (ruc, razon_social, nombre_comercial, ubigeo, departamento, provincia, distrito, direccion)
     VALUES ($1, 'EMPRESA DE PRUEBA S.A.C.', 'Espacios y Diseño', '150101', 'LIMA', 'LIMA', 'LIMA', 'AV. PRUEBA 123')
     RETURNING id`,
    [ruc],
  );
  const empresaId = e.rows[0].id as string;
  await db.query(`INSERT INTO empresa_regimen (empresa_id, regimen, vigente_desde) VALUES ($1, $2, '2020-01-01')`, [empresaId, regimen]);
  const m = await db.query(`INSERT INTO marcas (empresa_id, nombre) VALUES ($1, 'Espacios y Diseño') RETURNING id`, [empresaId]);
  const t = await db.query(`INSERT INTO canales (empresa_id, nombre, tipo) VALUES ($1, 'Tienda web', 'API') RETURNING id`, [empresaId]);
  const w = await db.query(`INSERT INTO canales (empresa_id, nombre, tipo) VALUES ($1, 'WhatsApp', 'MANUAL') RETURNING id`, [empresaId]);
  for (const [tipo, serie] of [['01', 'F001'], ['03', 'B001'], ['07', 'FC01'], ['07', 'BC01']]) {
    await db.query(`INSERT INTO series (empresa_id, tipo_comprobante, serie) VALUES ($1, $2, $3)`, [empresaId, tipo, serie]);
  }
  return { empresaId, canalTienda: t.rows[0].id, canalManual: w.rows[0].id, marcaId: m.rows[0].id };
}
