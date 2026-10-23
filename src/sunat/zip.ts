/**
 * SUNAT recibe y devuelve los XML dentro de archivos ZIP.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** Un ZIP con un solo archivo `{nombre}.xml`. */
export function comprimirXml(nombreSinExtension: string, xml: string): Buffer {
  return Buffer.from(zipSync({ [`${nombreSinExtension}.xml`]: strToU8(xml) }, { level: 9 }));
}

export class ErrorZip extends Error {}

/** Un CDR pesa pocos KB: nada razonable pasa de 5 MB una vez descomprimido. */
const MAXIMO_DESCOMPRIMIDO = 5 * 1024 * 1024;

/** Devuelve el primer archivo .xml del ZIP (el CDR que responde SUNAT). */
export function extraerXml(zip: Buffer): { nombre: string; xml: string } {
  let archivos: Record<string, Uint8Array>;
  try {
    // Solo se descomprimen los .xml y con tamaño acotado: una respuesta maliciosa (una
    // "bomba ZIP" que ocupa gigas al abrirse) no puede llenar la memoria del servidor.
    archivos = unzipSync(new Uint8Array(zip), {
      filter: (f) => f.name.toLowerCase().endsWith('.xml') && f.originalSize <= MAXIMO_DESCOMPRIMIDO,
    });
  } catch {
    throw new ErrorZip('La respuesta de SUNAT no es un ZIP válido.');
  }
  const nombre = Object.keys(archivos).find((n) => n.toLowerCase().endsWith('.xml') && !n.endsWith('/'));
  if (!nombre) throw new ErrorZip('El ZIP de SUNAT no contiene ningún XML.');
  return { nombre, xml: strFromU8(archivos[nombre]!) };
}
