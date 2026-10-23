/**
 * Saca la parte PÚBLICA (.cer) del Certificado Digital Tributario (.p12/.pfx).
 * El .cer es el que se registra en SUNAT Operaciones en Línea. No contiene la
 * llave privada: se puede subir a SOL sin riesgo.
 *
 * Uso: npm run certificado:exportar-cer -- --p12 ruta/certificado.p12 [--salida ruta/certificado.cer]
 */
import { writeFile, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { diasParaVencer, leerPfx } from '../src/firma/certificado.js';
import { pedirOculto } from './lib/consola.js';

const { values } = parseArgs({ options: { p12: { type: 'string' }, salida: { type: 'string' } } });
if (!values.p12) {
  console.error('Uso: npm run certificado:exportar-cer -- --p12 ruta/certificado.p12 [--salida ruta/certificado.cer]');
  process.exit(1);
}
const salida = values.salida ?? values.p12.replace(/\.(p12|pfx)$/i, '') + '.cer';

try {
  const clave = await pedirOculto('Contraseña del certificado: ');
  const cert = leerPfx(await readFile(values.p12), clave);
  // DER binario: el formato .cer estándar de Windows.
  await writeFile(salida, Buffer.from(cert.certificadoBase64, 'base64'), { flag: 'wx' });
  console.log(`✔ Archivo público creado: ${salida}`);
  console.log(`  Titular: ${cert.sujeto.replaceAll('\n', ', ')}`);
  console.log(`  Vence:   ${cert.validoHasta.toISOString().slice(0, 10)} (en ${diasParaVencer(cert)} días)`);
  console.log('Súbelo en SOL (registro de certificados digitales). El .p12 NO se sube a ningún lado.');
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  console.error('✘', err.code === 'EEXIST' ? `Ya existe ${salida}; bórralo o usa --salida.` : err.message);
  process.exitCode = 1;
}
