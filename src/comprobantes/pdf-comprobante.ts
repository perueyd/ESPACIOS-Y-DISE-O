/**
 * PDF de un comprobante guardado. El formato se elige en cada pedido; si no se
 * indica, se usa el formato por defecto del canal que emitió el comprobante.
 * El PDF se genera a pedido desde los datos guardados (no se almacena).
 */
import type { Almacen } from '../almacen/almacen.js';
import type { Db, Tx } from '../db/conexion.js';
import { generarPdf, type FormatoPdf } from '../pdf/representacion.js';
import { cargarComprobante } from './repositorio.js';

export const FORMATOS_PDF: readonly FormatoPdf[] = ['A4', 'TICKET_80'];

export function esFormatoPdf(valor: unknown): valor is FormatoPdf {
  return typeof valor === 'string' && (FORMATOS_PDF as readonly string[]).includes(valor);
}

export interface PdfComprobante {
  pdf: Buffer;
  formato: FormatoPdf;
  nombreArchivo: string;
}

export async function pdfDeComprobante(
  q: Db | Tx,
  comprobanteId: string,
  opciones: { formato?: FormatoPdf; almacen?: Almacen } = {},
): Promise<PdfComprobante> {
  const r = await q.query(
    `SELECT c.hash_firma, c.estado, c.ambiente_sunat, ca.formato_pdf, m.nombre AS marca,
            coalesce(am.ruta_almacenamiento, ae.ruta_almacenamiento) AS logo
     FROM comprobantes c
     JOIN canales ca ON ca.id = c.canal_id
     LEFT JOIN marcas m ON m.id = c.marca_id
     LEFT JOIN archivos am ON am.id = m.logo_archivo_id
     LEFT JOIN empresas e ON e.id = c.empresa_id
     LEFT JOIN archivos ae ON ae.id = e.logo_archivo_id
     WHERE c.id = $1`,
    [comprobanteId],
  );
  const f = r.rows[0];
  if (!f) throw new Error('Comprobante no encontrado.');
  const { comprobante } = await cargarComprobante(q, comprobanteId);
  const formato = opciones.formato ?? (f.formato_pdf as FormatoPdf);
  let logo: Buffer | undefined;
  if (f.logo && opciones.almacen) logo = await opciones.almacen.leer(f.logo).catch(() => undefined);
  const pdf = await generarPdf(
    {
      comprobante,
      hashFirma: f.hash_firma ?? '',
      estado: f.estado,
      ambiente: f.ambiente_sunat,
      ...(f.marca ? { marca: f.marca as string } : {}),
      ...(logo ? { logo } : {}),
    },
    formato,
  );
  const nombreArchivo = `${comprobante.empresa.ruc}-${comprobante.tipo}-${comprobante.serie}-${comprobante.numero}${formato === 'TICKET_80' ? '-ticket' : ''}.pdf`;
  return { pdf, formato, nombreArchivo };
}
