/**
 * Lectura del CDR (Constancia de Recepción) que devuelve SUNAT.
 *   ResponseCode 0       → aceptado
 *   ResponseCode ≥ 4000  → aceptado con observaciones
 *   ResponseCode 2000–3999 → rechazado
 * Las observaciones también llegan como <cbc:Note> ("4252 - texto").
 */
import { DOMParser } from '@xmldom/xmldom';
import { extraerXml } from './zip.js';

const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';

export type ResultadoCdr = 'ACEPTADO' | 'ACEPTADO_OBS' | 'RECHAZADO';

export interface Cdr {
  resultado: ResultadoCdr;
  codigo: string;
  descripcion: string;
  /** Id del documento al que responde (ej. "B001-1"). */
  referenciaId: string;
  observaciones: string[];
  xml: string;
  zip: Buffer;
}

export class ErrorCdr extends Error {}

export function clasificarRespuesta(codigo: string, observaciones: string[]): ResultadoCdr {
  const n = Number(codigo);
  if (!Number.isInteger(n)) throw new ErrorCdr(`Código de respuesta de SUNAT inválido: "${codigo}"`);
  if (n >= 2000 && n < 4000) return 'RECHAZADO';
  if (n >= 4000 || observaciones.length > 0) return 'ACEPTADO_OBS';
  if (n === 0) return 'ACEPTADO';
  // 0100–1999 dentro de un CDR: SUNAT no lo procesó. Lo tratamos como rechazo para revisar.
  return 'RECHAZADO';
}

export function leerCdr(zip: Buffer): Cdr {
  const { xml } = extraerXml(zip);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const respuesta = doc.getElementsByTagNameNS(CAC, 'DocumentResponse')[0]?.getElementsByTagNameNS(CAC, 'Response')[0];
  if (!respuesta) throw new ErrorCdr('El CDR no tiene la respuesta de SUNAT (DocumentResponse/Response).');
  const valor = (nombre: string) => respuesta.getElementsByTagNameNS(CBC, nombre)[0]?.textContent?.trim() ?? '';
  const codigo = valor('ResponseCode');
  if (!codigo) throw new ErrorCdr('El CDR no trae código de respuesta.');

  // Solo las notas que cuelgan directamente de la raíz (no las de otros nodos).
  const raiz = doc.documentElement!;
  const observaciones: string[] = [];
  for (let i = 0; i < raiz.childNodes.length; i++) {
    const n = raiz.childNodes[i]!;
    const e = n as unknown as { localName: string; namespaceURI: string | null };
    if (n.nodeType === 1 && e.localName === 'Note' && e.namespaceURI === CBC) {
      const t = n.textContent?.trim();
      if (t) observaciones.push(t);
    }
  }
  return {
    resultado: clasificarRespuesta(codigo, observaciones),
    codigo,
    descripcion: valor('Description'),
    referenciaId: valor('ReferenceID'),
    observaciones,
    xml,
    zip,
  };
}
