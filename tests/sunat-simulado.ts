/**
 * SUNAT SIMULADO para pruebas: un servidor HTTP que habla el mismo SOAP que billService.
 * Permite programar qué responde (aceptar, observar, rechazar, fallar, colgarse…) y
 * revisa lo que recibe igual que SUNAT: usuario, nombres de archivo y firma.
 * NO reemplaza la prueba real en SUNAT beta.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DOMParser } from '@xmldom/xmldom';
import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate';
import { verificarFirma } from '../src/firma/firmar.js';

export type RespuestaBill =
  | { modo: 'aceptar' }
  | { modo: 'observar'; notas: string[] }
  | { modo: 'rechazarCdr'; codigo: string; descripcion?: string } // CDR con código 2000-3999
  | { modo: 'fault'; codigo: string; mensaje?: string } // SOAP Fault (excepción o rechazo)
  | { modo: 'http500' }
  | { modo: 'colgar' } // nunca responde (para probar el tiempo máximo)
  | { modo: 'cortar' }; // corta la conexión

export type RespuestaStatus =
  | { modo: 'procesando' }
  | { modo: 'aceptado' }
  | { modo: 'rechazado'; codigo: string; descripcion?: string }
  | { modo: 'fault'; codigo: string; mensaje?: string };

export interface PeticionRecibida {
  operacion: string;
  usuario: string;
  clave: string;
  fileName?: string;
  xml?: string;
  ticket?: string;
  firmaValida?: boolean;
}

function textoDe(doc: Document, nombre: string): string | undefined {
  const l = doc.getElementsByTagName('*');
  for (let i = 0; i < l.length; i++) if (l[i]!.localName === nombre) return l[i]!.textContent ?? '';
  return undefined;
}

function cdrXml(referencia: string, codigo: string, descripcion: string, notas: string[] = []): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:UBLVersionID>2.0</cbc:UBLVersionID><cbc:ID>${Date.now()}</cbc:ID>
${notas.map((n) => `<cbc:Note>${n}</cbc:Note>`).join('')}
<cac:DocumentResponse><cac:Response><cbc:ReferenceID>${referencia}</cbc:ReferenceID><cbc:ResponseCode>${codigo}</cbc:ResponseCode><cbc:Description>${descripcion}</cbc:Description></cac:Response></cac:DocumentResponse>
</ar:ApplicationResponse>`;
}

/** Como SUNAT: el ZIP del CDR trae una carpeta "dummy/" y el archivo R-{nombre}.xml. */
function zipCdr(nombre: string, xml: string): string {
  return Buffer.from(zipSync({ 'dummy/': new Uint8Array(0), [`R-${nombre}.xml`]: strToU8(xml) })).toString('base64');
}

function sobre(cuerpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>${cuerpo}</soap-env:Body></soap-env:Envelope>`;
}

function fault(codigo: string, mensaje: string): string {
  return sobre(`<soap-env:Fault><faultcode>soap-env:Client.${codigo}</faultcode><faultstring>${mensaje}</faultstring></soap-env:Fault>`);
}

export class SunatSimulado {
  private server?: Server;
  url = '';
  readonly recibidas: PeticionRecibida[] = [];
  /** Respuestas programadas en orden; cuando se acaban se usa la de por defecto. */
  readonly colaBill: RespuestaBill[] = [];
  readonly colaStatus: RespuestaStatus[] = [];
  porDefectoBill: RespuestaBill = { modo: 'aceptar' };
  porDefectoStatus: RespuestaStatus = { modo: 'aceptado' };
  private tickets = new Map<string, { nombre: string; referencia: string }>();
  private colgadas: ServerResponse[] = [];

  async iniciar(): Promise<this> {
    this.server = createServer((req, res) => void this.atender(req, res));
    await new Promise<void>((ok) => this.server!.listen(0, '127.0.0.1', ok));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}/ol-ti-itcpfegem-beta/billService`;
    return this;
  }

  async detener(): Promise<void> {
    for (const r of this.colgadas) r.destroy();
    this.server?.closeAllConnections();
    await new Promise<void>((ok) => this.server?.close(() => ok()) ?? ok());
  }

  reiniciar(): void {
    this.recibidas.length = 0;
    this.colaBill.length = 0;
    this.colaStatus.length = 0;
    this.porDefectoBill = { modo: 'aceptar' };
    this.porDefectoStatus = { modo: 'aceptado' };
  }

  contar(operacion: string): number {
    return this.recibidas.filter((r) => r.operacion === operacion).length;
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const partes: Buffer[] = [];
    for await (const p of req) partes.push(p as Buffer);
    const doc = new DOMParser().parseFromString(Buffer.concat(partes).toString('utf8'), 'text/xml') as unknown as Document;
    const body = Array.from({ length: doc.getElementsByTagName('*').length }, (_, i) => doc.getElementsByTagName('*')[i]!).find(
      (e) => ['sendBill', 'sendSummary', 'getStatus'].includes(e.localName),
    );
    const operacion = body?.localName ?? 'desconocida';
    const p: PeticionRecibida = { operacion, usuario: textoDe(doc, 'Username') ?? '', clave: textoDe(doc, 'Password') ?? '' };
    this.recibidas.push(p);
    const responder = (xml: string, estado = 200) => {
      res.writeHead(estado, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(xml);
    };

    // Como SUNAT beta: usuario = RUC + MODDATOS, clave MODDATOS.
    if (!/^\d{11}MODDATOS$/.test(p.usuario) || p.clave !== 'MODDATOS') return responder(fault('0102', 'Usuario o contraseña incorrectos'), 500);

    if (operacion === 'getStatus') {
      p.ticket = textoDe(doc, 'ticket') ?? '';
      const t = this.tickets.get(p.ticket);
      if (!t) return responder(fault('0127', 'El ticket no existe'), 500);
      const r = this.colaStatus.shift() ?? this.porDefectoStatus;
      if (r.modo === 'fault') return responder(fault(r.codigo, r.mensaje ?? 'Error'), 500);
      if (r.modo === 'procesando') return responder(sobre(`<br:getStatusResponse xmlns:br="http://service.sunat.gob.pe"><status><statusCode>98</statusCode></status></br:getStatusResponse>`));
      const [code, cdrCod, desc] = r.modo === 'aceptado' ? ['0', '0', `El Resumen ${t.referencia} ha sido aceptado`] : ['99', r.codigo, r.descripcion ?? 'Rechazado'];
      const content = zipCdr(t.nombre, cdrXml(t.referencia, cdrCod, desc));
      return responder(sobre(`<br:getStatusResponse xmlns:br="http://service.sunat.gob.pe"><status><content>${content}</content><statusCode>${code}</statusCode></status></br:getStatusResponse>`));
    }

    p.fileName = textoDe(doc, 'fileName') ?? '';
    const contenido = Buffer.from(textoDe(doc, 'contentFile') ?? '', 'base64');
    const nombre = p.fileName.replace(/\.zip$/, '');
    let archivos: Record<string, Uint8Array>;
    try {
      archivos = unzipSync(new Uint8Array(contenido));
    } catch {
      return responder(fault('0156', 'El archivo ZIP esta corrupto'), 500);
    }
    const xmlArchivo = archivos[`${nombre}.xml`];
    if (!xmlArchivo) return responder(fault('0161', 'El nombre del archivo XML no coincide con el nombre del archivo ZIP'), 500);
    p.xml = strFromU8(xmlArchivo);
    if (nombre.slice(0, 11) !== p.usuario.slice(0, 11)) return responder(fault('0154', 'El RUC del archivo no corresponde al RUC del usuario'), 500);
    p.firmaValida = verificarFirma(p.xml).valida;
    if (!p.firmaValida) return responder(fault('2335', 'El documento electrónico ingresado ha sido alterado'), 500);
    const referencia = nombre.split('-').slice(2).join('-');

    if (operacion === 'sendSummary') {
      if (!/-(RC|RA)-\d{8}-\d+$/.test(nombre)) return responder(fault('0151', 'El nombre del archivo ZIP es incorrecto'), 500);
      const ticket = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      this.tickets.set(ticket, { nombre, referencia });
      return responder(sobre(`<br:sendSummaryResponse xmlns:br="http://service.sunat.gob.pe"><ticket>${ticket}</ticket></br:sendSummaryResponse>`));
    }

    const r = this.colaBill.shift() ?? this.porDefectoBill;
    switch (r.modo) {
      case 'colgar':
        this.colgadas.push(res);
        return;
      case 'cortar':
        res.socket?.destroy();
        return;
      case 'http500':
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body>Internal Server Error</body></html>');
        return;
      case 'fault':
        return responder(fault(r.codigo, r.mensaje ?? 'Error'), 500);
      default: {
        const [codigo, desc, notas] =
          r.modo === 'aceptar' ? ['0', `La Factura numero ${referencia}, ha sido aceptada`, []]
          : r.modo === 'observar' ? ['0', `La Factura numero ${referencia}, ha sido aceptada`, r.notas]
          : [r.codigo, r.descripcion ?? 'Rechazado', []];
        const app = zipCdr(nombre, cdrXml(referencia, codigo, desc, notas));
        return responder(sobre(`<br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${app}</applicationResponse></br:sendBillResponse>`));
      }
    }
  }
}
