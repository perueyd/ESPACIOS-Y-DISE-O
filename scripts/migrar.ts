/**
 * Aplica las migraciones de db/migraciones en orden, una sola vez cada una.
 * Uso: DATABASE_URL=postgres://... npm run db:migrar
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool, enTransaccion, type Db } from '../src/db/conexion.js';

const CARPETA = fileURLToPath(new URL('../db/migraciones/', import.meta.url));

export async function migrar(db: Db, log: (m: string) => void = console.log): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
  const archivos = (await readdir(CARPETA)).filter((f) => f.endsWith('.sql')).sort();
  for (const nombre of archivos) {
    const ya = await db.query('SELECT 1 FROM migraciones_aplicadas WHERE nombre = $1', [nombre]);
    if (ya.rowCount) continue;
    const sql = await readFile(join(CARPETA, nombre), 'utf8');
    await enTransaccion(db, async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)', [nombre]);
    });
    log(`✔ Migración aplicada: ${nombre}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = crearPool();
  migrar(db)
    .then(() => console.log('Base de datos al día.'))
    .catch((e: unknown) => {
      console.error('Error al migrar:', e);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
