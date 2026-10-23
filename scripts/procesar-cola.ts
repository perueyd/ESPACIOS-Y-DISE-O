/**
 * Procesa una vuelta de la cola de envíos a SUNAT. Pensado para ejecutarse cada
 * minuto (cron). En la fase 6 se expondrá también como endpoint protegido.
 *
 * Variables: DATABASE_URL, LLAVE_MAESTRA, ALMACEN_DIR (carpeta de archivos),
 *            FIRMA_ALGORITMO (SHA1|SHA256). Producción exige además SUNAT_PERMITIR_PRODUCCION=si.
 */
import { AlmacenLocal } from '../src/almacen/almacen.js';
import { procesarCola } from '../src/cola/procesar.js';
import { crearPool } from '../src/db/conexion.js';
import { algoritmoDesdeEntorno } from '../src/firma/firmar.js';
import { llaveMaestraDesdeEntorno } from '../src/seguridad/cifrado.js';
import { ClienteSunatSoap } from '../src/sunat/cliente.js';

const db = crearPool();
try {
  const r = await procesarCola(db, {
    almacen: new AlmacenLocal(process.env.ALMACEN_DIR ?? 'almacen'),
    llaveMaestra: llaveMaestraDesdeEntorno(),
    algoritmo: algoritmoDesdeEntorno(),
    crearCliente: (url, credenciales) => new ClienteSunatSoap({ url, credenciales }),
  });
  console.log(`Procesados: ${r.procesados} · listos: ${r.hechos} · por reintentar: ${r.reintentos} · por revisar: ${r.revisar}`);
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
