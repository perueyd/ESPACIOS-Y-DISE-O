/**
 * Guarda (cifrado) el usuario SOL SECUNDARIO que el facturador usará en PRODUCCIÓN.
 * En beta no hace falta: se usa el usuario público RUC + MODDATOS.
 *
 *   npm run sol:configurar -- --ruc 20XXXXXXXXX --usuario CAEABC26
 *
 * La clave se pide por teclado (no se muestra). Nunca uses la Clave SOL principal.
 */
import { parseArgs } from 'node:util';
import { crearPool } from '../src/db/conexion.js';
import { llaveMaestraDesdeEntorno } from '../src/seguridad/cifrado.js';
import { guardarCredencialesSol } from '../src/sunat/configuracion.js';
import { pedirOculto } from './lib/consola.js';

const { values } = parseArgs({ options: { ruc: { type: 'string' }, usuario: { type: 'string' } } });
if (!values.ruc || !values.usuario) {
  console.error('Uso: npm run sol:configurar -- --ruc 20XXXXXXXXX --usuario CAEABC26');
  process.exit(1);
}

const db = crearPool();
try {
  const emp = await db.query(`SELECT id FROM empresas WHERE ruc = $1`, [values.ruc]);
  if (!emp.rows[0]) throw new Error(`No existe la empresa ${values.ruc}.`);
  const clave = await pedirOculto(`Clave del usuario secundario ${values.usuario.toUpperCase()}: `);
  if (clave.length < 8 || clave.length > 12) throw new Error('La clave SOL tiene entre 8 y 12 caracteres.');
  await guardarCredencialesSol(db, emp.rows[0].id, values.usuario, clave, llaveMaestraDesdeEntorno());
  console.log(`✔ Usuario SOL secundario guardado y cifrado: ${values.ruc}${values.usuario.toUpperCase()}`);
  console.log('  Solo se usará cuando la empresa pase a PRODUCCIÓN (con tu autorización).');
} catch (e) {
  console.error('✘', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
