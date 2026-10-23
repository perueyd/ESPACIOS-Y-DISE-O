/**
 * Conexión a PostgreSQL y ayuda para transacciones.
 * La URL de conexión viene SOLO de variables de entorno (nunca en el código).
 */
import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function crearPool(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error('Falta la variable de entorno DATABASE_URL.');
  // NUMERIC llega como texto (pg no lo convierte a number): así no se pierden decimales.
  // Con DATABASE_CA_CERT (el certificado que entrega Supabase) la conexión va cifrada y
  // verificando al servidor: nadie en el camino puede hacerse pasar por la base.
  const ca = process.env.DATABASE_CA_CERT;
  const pool = new pg.Pool({ connectionString: url, max: 10, ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}) });
  // Sin este manejador, una conexión inactiva que se corta tumbaría todo el proceso.
  pool.on('error', (e) => console.error('Conexión a PostgreSQL perdida:', e.message));
  return pool;
}

/**
 * Ejecuta `fn` dentro de una transacción. Si `fn` lanza un error, se deshace
 * TODO (incluido el número de serie que se hubiera tomado).
 */
export async function enTransaccion<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const resultado = await fn(tx);
    await tx.query('COMMIT');
    return resultado;
  } catch (e) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    tx.release();
  }
}

/** Código de error de PostgreSQL (ej. '23505' = valor duplicado). */
export function codigoErrorPg(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

export function restriccionPg(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'constraint' in e
    ? String((e as { constraint: unknown }).constraint)
    : undefined;
}
