/**
 * Genera XML y PDF de ejemplo en docs/ejemplos/ (firmados con un certificado ficticio) para revisarlos a mano
 * o mostrárselos al contador. Uso: npm run ejemplos
 * Los datos son ficticios.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepararComprobante, type SolicitudComprobante } from '../src/comprobantes/preparar.js';
import { CondicionResumen } from '../src/catalogos.js';
import { generarXmlComprobante } from '../src/xml/comprobante.js';
import { nombreArchivoComprobante, nombreArchivoResumen } from '../src/xml/nombres.js';
import { generarXmlComunicacionBaja, generarXmlResumenDiario, idResumen } from '../src/xml/resumenes.js';
import { TipoComprobante, type Comprobante } from '../src/tipos.js';
import { leerPfx } from '../src/firma/certificado.js';
import { firmarXml } from '../src/firma/firmar.js';
import { generarPdf } from '../src/pdf/representacion.js';
import { contextoPrueba, empresaPrueba, item, solicitudBoleta, solicitudFactura } from '../tests/ayudantes.js';
import { crearPfxPrueba } from '../tests/certificado-prueba.js';

const CARPETA = fileURLToPath(new URL('../docs/ejemplos/', import.meta.url));

function armar(s: SolicitudComprobante, numero: number): Comprobante {
  const r = prepararComprobante(s, contextoPrueba);
  if (!r.ok) throw new Error(r.errores.join('\n'));
  return { ...r.comprobante, numero };
}

await mkdir(CARPETA, { recursive: true });
const ruc = empresaPrueba.ruc;

const factura = armar(solicitudFactura(), 1);
const boleta = armar(solicitudBoleta(), 1);
const nc = armar(
  solicitudFactura({
    tipo: TipoComprobante.NOTA_CREDITO,
    serie: 'FC01',
    items: [item('59.90', '1', { descripcion: 'Almohada devuelta' })],
    notaCredito: { referencia: { tipo: '01', serie: 'F001', numero: 1 }, motivoCodigo: '07', motivoDescripcion: 'Devolución de una almohada' },
  }),
  1,
);

const archivos: [string, string][] = [
  [nombreArchivoComprobante(ruc, factura.tipo, factura.serie, factura.numero), generarXmlComprobante(factura, true)],
  [nombreArchivoComprobante(ruc, boleta.tipo, boleta.serie, boleta.numero), generarXmlComprobante(boleta, true)],
  [nombreArchivoComprobante(ruc, nc.tipo, nc.serie, nc.numero), generarXmlComprobante(nc, true)],
  [
    nombreArchivoResumen(ruc, idResumen('RC', '2026-10-21', 1)),
    generarXmlResumenDiario(
      { empresa: empresaPrueba, correlativo: 1, fechaReferencia: '2026-10-20', fechaGeneracion: '2026-10-21', lineas: [{ comprobante: boleta, condicion: CondicionResumen.ADICIONAR }] },
      true,
    ),
  ],
  [
    nombreArchivoResumen(ruc, idResumen('RA', '2026-10-22', 1)),
    generarXmlComunicacionBaja(
      { empresa: empresaPrueba, correlativo: 1, fechaReferencia: '2026-10-20', fechaGeneracion: '2026-10-22', lineas: [{ tipo: '01', serie: 'F001', numero: 1, motivo: 'Error en el RUC del cliente' }] },
      true,
    ),
  ],
];
// Ejemplo firmado con un certificado FICTICIO generado al momento (no sirve ante SUNAT).
const certFicticio = leerPfx(crearPfxPrueba(), 'clave-de-prueba');
archivos.push([
  `${nombreArchivoComprobante(ruc, boleta.tipo, boleta.serie, boleta.numero)}-firmado`,
  firmarXml(generarXmlComprobante(boleta), certFicticio).xmlFirmado,
]);

for (const [nombre, xml] of archivos) {
  await writeFile(`${CARPETA}${nombre}.xml`, xml);
  console.log(`✔ docs/ejemplos/${nombre}.xml`);
}

// PDF de ejemplo en ambos formatos (con la marca "PRUEBA - SIN VALOR LEGAL").
const firmaFactura = firmarXml(generarXmlComprobante(factura), certFicticio);
for (const [c, hash, nombre] of [
  [factura, firmaFactura.digestValue, nombreArchivoComprobante(ruc, factura.tipo, factura.serie, factura.numero)],
  [boleta, firmarXml(generarXmlComprobante(boleta), certFicticio).digestValue, nombreArchivoComprobante(ruc, boleta.tipo, boleta.serie, boleta.numero)],
] as const) {
  for (const formato of ['A4', 'TICKET_80'] as const) {
    const pdf = await generarPdf({ comprobante: c, hashFirma: hash, estado: 'ACEPTADO', ambiente: 'BETA', marca: 'Espacios y Diseño' }, formato);
    const archivo = `${nombre}${formato === 'TICKET_80' ? '-ticket' : '-A4'}.pdf`;
    await writeFile(`${CARPETA}${archivo}`, pdf);
    console.log(`✔ docs/ejemplos/${archivo}`);
  }
}
