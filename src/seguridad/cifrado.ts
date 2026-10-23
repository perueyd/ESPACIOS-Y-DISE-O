/**
 * Cifrado de datos sensibles (certificados, claves SOL) con AES-256-GCM.
 *
 * La llave maestra vive SOLO en la variable de entorno LLAVE_MAESTRA (32 bytes en
 * base64). Sin ella, lo guardado en la base de datos es ilegible.
 *
 * Formato: [versión 1 byte][iv 12 bytes][etiqueta 16 bytes][datos cifrados]
 * El "contexto" (ej. "certificado:<empresa_id>") se autentica junto con los datos:
 * un valor cifrado copiado a otra fila u otra empresa no se puede descifrar.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV = 12;
const ETIQUETA = 16;

export class ErrorCifrado extends Error {}

export function llaveMaestraDesdeEntorno(valor = process.env.LLAVE_MAESTRA): Buffer {
  if (!valor) throw new ErrorCifrado('Falta la variable de entorno LLAVE_MAESTRA. Genera una con: npm run llave:generar');
  const llave = Buffer.from(valor, 'base64');
  if (llave.length !== 32) throw new ErrorCifrado('LLAVE_MAESTRA debe tener 32 bytes en base64.');
  return llave;
}

export function generarLlaveMaestra(): string {
  return randomBytes(32).toString('base64');
}

export function cifrar(datos: Buffer, llave: Buffer, contexto: string): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', llave, iv);
  c.setAAD(Buffer.from(contexto, 'utf8'));
  const cifrado = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), cifrado]);
}

export function descifrar(paquete: Buffer, llave: Buffer, contexto: string): Buffer {
  if (paquete.length < 1 + IV + ETIQUETA || paquete[0] !== VERSION) {
    throw new ErrorCifrado('Dato cifrado con formato desconocido.');
  }
  const iv = paquete.subarray(1, 1 + IV);
  const etiqueta = paquete.subarray(1 + IV, 1 + IV + ETIQUETA);
  const d = createDecipheriv('aes-256-gcm', llave, iv);
  d.setAAD(Buffer.from(contexto, 'utf8'));
  d.setAuthTag(etiqueta);
  try {
    return Buffer.concat([d.update(paquete.subarray(1 + IV + ETIQUETA)), d.final()]);
  } catch {
    throw new ErrorCifrado('No se pudo descifrar: la llave maestra no corresponde o el dato fue alterado.');
  }
}
