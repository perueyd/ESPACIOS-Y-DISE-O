/**
 * Enlaces para que el CLIENTE vea su comprobante sin llave de API (la tienda lo muestra en
 * el seguimiento del pedido; el dueño lo manda por WhatsApp).
 *
 *   /c/<id>.<vence>.<firma>
 *
 * La firma es un HMAC-SHA256 con una clave derivada de la LLAVE_MAESTRA: nadie puede
 * fabricar un enlace a otro comprobante ni alargar su vigencia sin esa llave. Vence al año.
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const VIGENCIA_DIAS = 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Clave propia para los enlaces: si alguna vez se filtrara, no sirve para descifrar nada. */
function claveEnlaces(llaveMaestra: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', llaveMaestra, Buffer.alloc(0), 'enlaces-comprobante-v1', 32));
}

function firma(llaveMaestra: Buffer, id: string, vence: string): string {
  return createHmac('sha256', claveEnlaces(llaveMaestra)).update(`${id}.${vence}`).digest('base64url');
}

export function tokenComprobante(llaveMaestra: Buffer, id: string, ahora = new Date()): string {
  const vence = Math.floor(ahora.getTime() / 1000 + VIGENCIA_DIAS * 86_400).toString(36);
  return `${id}.${vence}.${firma(llaveMaestra, id, vence)}`;
}

/** Id del comprobante si el token es auténtico y está vigente; si no, undefined (sin decir por qué). */
export function leerToken(llaveMaestra: Buffer, token: string, ahora = new Date()): string | undefined {
  const [id, vence, recibida, ...resto] = token.split('.');
  if (!id || !vence || !recibida || resto.length || !UUID.test(id) || !/^[0-9a-z]{1,12}$/.test(vence)) return undefined;
  const esperada = Buffer.from(firma(llaveMaestra, id, vence));
  const dada = Buffer.from(recibida);
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return undefined;
  if (parseInt(vence, 36) * 1000 < ahora.getTime()) return undefined;
  return id;
}
