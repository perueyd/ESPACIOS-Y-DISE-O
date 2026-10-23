/**
 * Carga el Certificado Digital Tributario (.pfx o .p12) de una empresa, cifrado en la base.
 *
 * Uso:
 *   DATABASE_URL=... LLAVE_MAESTRA=... npm run certificado:cargar -- --ruc 20XXXXXXXXX --pfx ruta/al/certificado.pfx
 *
 * La contraseña del .pfx se pide por teclado (no se muestra ni queda en el historial).
 * Después de cargarlo, BORRA el .pfx de tu computadora o guárdalo en un lugar seguro:
 * nunca lo pongas dentro de la carpeta del proyecto ni lo subas a GitHub.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { crearPool } from '../src/db/conexion.js';
import { guardarCertificado } from '../src/firma/repositorio-certificados.js';
import { diasParaVencer } from '../src/firma/certificado.js';
import { llaveMaestraDesdeEntorno } from '../src/seguridad/cifrado.js';
import { empresaPorRuc, pedirOculto } from './lib/consola.js';

const { values } = parseArgs({ options: { ruc: { type: 'string' }, pfx: { type: 'string' } } });
if (!values.ruc || !values.pfx) {
  console.error('Uso: npm run certificado:cargar -- --ruc 20XXXXXXXXX --pfx ruta/al/certificado.pfx');
  process.exit(1);
}

const db = crearPool();
try {
  const llaveMaestra = llaveMaestraDesdeEntorno();
  const empresa = await empresaPorRuc(db, values.ruc);
  const pfx = await readFile(values.pfx);
  const clave = await pedirOculto('Contraseña del certificado: ');
  const { certificado } = await guardarCertificado(db, { empresaId: empresa.id, pfx, clave, llaveMaestra });
  console.log(`✔ Certificado cargado para ${empresa.razonSocial}`);
  console.log(`  Titular:  ${certificado.sujeto.replaceAll('\n', ', ')}`);
  console.log(`  Vence:    ${certificado.validoHasta.toISOString().slice(0, 10)} (en ${diasParaVencer(certificado)} días)`);
  console.log(`  Huella:   ${certificado.huella}`);
  console.log('Recuerda: registra este certificado en SUNAT Operaciones en Línea si aún no lo hiciste.');
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
