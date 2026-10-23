/**
 * Nombres de archivo que exige SUNAT para el XML y el ZIP.
 *   Comprobante:  {RUC}-{TIPO}-{SERIE}-{NUMERO}   ej. 20123456789-03-B001-15
 *   Resumen/baja: {RUC}-{RC|RA}-{AAAAMMDD}-{N}    ej. 20123456789-RC-20261023-1
 */
import type { TipoComprobante } from '../tipos.js';

export function nombreArchivoComprobante(ruc: string, tipo: TipoComprobante, serie: string, numero: number): string {
  return `${ruc}-${tipo}-${serie}-${numero}`;
}

export function nombreArchivoResumen(ruc: string, idResumen: string): string {
  return `${ruc}-${idResumen}`;
}
