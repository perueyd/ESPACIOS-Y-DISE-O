/**
 * Procesa una vuelta de la cola de envíos a SUNAT (para un cron cada minuto).
 * Variables: las de .env.example. Producción exige además SUNAT_PERMITIR_PRODUCCION=si.
 */
import { procesarCola } from '../src/cola/procesar.js';
import { serviciosDesdeEntorno } from '../src/config.js';
import { crearPool } from '../src/db/conexion.js';

const db = crearPool();
try {
  const r = await procesarCola(db, serviciosDesdeEntorno());
  console.log(`Procesados: ${r.procesados} · listos: ${r.hechos} · por reintentar: ${r.reintentos} · por revisar: ${r.revisar}`);
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
