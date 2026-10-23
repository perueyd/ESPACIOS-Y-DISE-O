/**
 * Cliente del servicio web de SUNAT (billService, SOAP 1.1 con WS-Security).
 *
 * Métodos:
 *   sendBill(fileName, contentFile)    → applicationResponse (ZIP con el CDR)   [facturas, boletas, notas]
 *   sendSummary(fileName, contentFile) → ticket                                [resumen diario, baja]
 *   getStatus(ticket)                  → status { statusCode, content }        [0 listo, 98 en proceso, 99 con errores]
 *
 * Estructura tomada del WSDL oficial (namespace http://service.sunat.gob.pe, elementos
 * hijos sin prefijo) y del cliente abierto Greenter.
 */
import { DOMParser } from '@xmldom/xmldom';
import { create } from 'xmlbuilder2';
import { leerCdr, type Cdr } from './cdr.js';
import { comprimirXml } from './zip.js';

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_SERVICIO = 'http://service.sunat.gob.pe';
const NS_WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const TIPO_PASSWORD = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';

export interface CredencialesSunat {
  /** RUC + usuario, todo junto (ej. "20123456789MODDATOS"). */
  usuario: string;
  clave: string;
}

/** Falla de comunicación: no hubo respuesta válida de SUNAT (se puede reintentar). */
export class ErrorConexionSunat extends Error {
  constructor(message: string, readonly httpEstado?: number) {
    super(message);
  }
}

/** SUNAT respondió con un error (SOAP Fault). `codigo` es el código de SUNAT (ej. "0102"). */
export class ErrorRespuestaSunat extends Error {
  constructor(readonly codigo: string, readonly mensajeSunat: string, readonly httpEstado: number) {
    super(`SUNAT ${codigo}: ${mensajeSunat}`);
  }
}

export interface EstadoTicket {
  /** "0" listo, "98" en proceso, "99" procesado con errores. */
  statusCode: string;
  cdr?: Cdr;
}

export interface ClienteSunat {
  sendBill(nombreArchivo: string, xmlFirmado: string): Promise<Cdr>;
  sendSummary(nombreArchivo: string, xmlFirmado: string): Promise<string>;
  getStatus(ticket: string): Promise<EstadoTicket>;
}

export interface OpcionesCliente {
  url: string;
  credenciales: CredencialesSunat;
  /** Tiempo máximo de espera por respuesta (ms). */
  tiempoMaximoMs?: number;
  fetch?: typeof fetch;
}

export function construirSobre(operacion: string, parametros: Record<string, string>, cred: CredencialesSunat): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(NS_SOAP, 'soapenv:Envelope', {
    'xmlns:ser': NS_SERVICIO,
    'xmlns:wsse': NS_WSSE,
  });
  const token = doc.ele('soapenv:Header').ele('wsse:Security').ele('wsse:UsernameToken');
  token.ele('wsse:Username').txt(cred.usuario);
  token.ele('wsse:Password', { Type: TIPO_PASSWORD }).txt(cred.clave);
  const op = doc.ele('soapenv:Body').ele(`ser:${operacion}`);
  for (const [k, v] of Object.entries(parametros)) op.ele(k).txt(v); // hijos sin namespace (WSDL)
  return doc.end();
}

/** Extrae el texto de un elemento de la respuesta por su nombre local. */
function texto(doc: Document, nombre: string): string | undefined {
  const lista = doc.getElementsByTagName('*');
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i]!;
    if (e.localName === nombre) return e.textContent?.trim() ?? '';
  }
  return undefined;
}

/** "soap-env:Client.0102" → "0102"; si el código no tiene números, se busca en el mensaje. */
export function codigoDeFault(faultcode: string, faultstring: string): string {
  const deCodigo = faultcode.replace(/\D+/g, '');
  if (deCodigo) return deCodigo.padStart(4, '0');
  const deMensaje = faultstring.match(/\b\d{3,4}\b/)?.[0];
  return deMensaje ? deMensaje.padStart(4, '0') : 'DESCONOCIDO';
}

export class ClienteSunatSoap implements ClienteSunat {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly o: OpcionesCliente) {
    this.fetchFn = o.fetch ?? fetch;
  }

  private async llamar(operacion: string, parametros: Record<string, string>): Promise<Document> {
    const sobre = construirSobre(operacion, parametros, this.o.credenciales);
    let r: Response;
    try {
      r = await this.fetchFn(this.o.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:${operacion}` },
        body: sobre,
        signal: AbortSignal.timeout(this.o.tiempoMaximoMs ?? 45_000),
      });
    } catch (e) {
      const motivo = e instanceof Error && e.name === 'TimeoutError' ? 'SUNAT no respondió a tiempo' : 'No se pudo conectar con SUNAT';
      throw new ErrorConexionSunat(`${motivo}.`);
    }
    const cuerpo = await r.text().catch(() => '');
    let doc: Document | undefined;
    try {
      doc = cuerpo ? (new DOMParser().parseFromString(cuerpo, 'text/xml') as unknown as Document) : undefined;
    } catch {
      doc = undefined;
    }
    const faultcode = doc ? texto(doc, 'faultcode') : undefined;
    if (doc && faultcode !== undefined) {
      const faultstring = texto(doc, 'faultstring') ?? '';
      throw new ErrorRespuestaSunat(codigoDeFault(faultcode, faultstring), faultstring, r.status);
    }
    if (!r.ok || !doc) {
      throw new ErrorConexionSunat(`SUNAT respondió con un error HTTP ${r.status}.`, r.status);
    }
    return doc;
  }

  async sendBill(nombreArchivo: string, xmlFirmado: string): Promise<Cdr> {
    const zip = comprimirXml(nombreArchivo, xmlFirmado);
    const doc = await this.llamar('sendBill', { fileName: `${nombreArchivo}.zip`, contentFile: zip.toString('base64') });
    const respuesta = texto(doc, 'applicationResponse');
    if (!respuesta) throw new ErrorConexionSunat('SUNAT no devolvió la constancia (CDR).');
    return leerCdr(Buffer.from(respuesta, 'base64'));
  }

  async sendSummary(nombreArchivo: string, xmlFirmado: string): Promise<string> {
    const zip = comprimirXml(nombreArchivo, xmlFirmado);
    const doc = await this.llamar('sendSummary', { fileName: `${nombreArchivo}.zip`, contentFile: zip.toString('base64') });
    const ticket = texto(doc, 'ticket');
    if (!ticket) throw new ErrorConexionSunat('SUNAT no devolvió el número de ticket.');
    return ticket;
  }

  async getStatus(ticket: string): Promise<EstadoTicket> {
    const doc = await this.llamar('getStatus', { ticket });
    const statusCode = texto(doc, 'statusCode');
    if (statusCode === undefined) throw new ErrorConexionSunat('Respuesta de getStatus sin statusCode.');
    const contenido = texto(doc, 'content');
    return { statusCode, ...(contenido ? { cdr: leerCdr(Buffer.from(contenido, 'base64')) } : {}) };
  }
}
