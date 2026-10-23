/**
 * Cálculo del IGV y de los totales a partir de precios CON IGV incluido.
 *
 * Criterio (para que el cliente pague exactamente el precio publicado):
 *   total del ítem   = cantidad × precio con IGV, redondeado a 2 decimales
 *   valor de venta   = total ÷ (1 + tasa), redondeado a 2 decimales
 *   IGV del ítem     = total − valor de venta   (así base + IGV = total, sin descuadres)
 *   valor unitario   = precio con IGV ÷ (1 + tasa), hasta 10 decimales
 *
 * Los totales del comprobante son la suma de los ítems, por lo que el importe
 * total siempre es igual a la suma de lo que se cobra por cada ítem.
 *
 * ⚠️ SUNAT valida con una tolerancia que el IGV ≈ base × tasa y que el valor de venta
 * ≈ cantidad × valor unitario. Con este criterio la diferencia máxima es de S/ 0.01.
 * Confirmar las tolerancias vigentes con la lista oficial de validaciones (fase 4).
 */
import { Decimal, dec, redondear, sumar } from '../dinero.js';
import { Afectacion, type ItemCalculado, type ItemEntrada, type Totales } from '../tipos.js';

export function calcularItem(item: ItemEntrada, igvTasa: Decimal): ItemCalculado {
  const cantidad = dec(item.cantidad);
  const precioUnitario = dec(item.precioUnitarioConIgv);
  if (cantidad.lte(0)) throw new Error(`La cantidad de "${item.descripcion}" debe ser mayor que cero.`);
  if (precioUnitario.lte(0)) throw new Error(`El precio de "${item.descripcion}" debe ser mayor que cero.`);

  const total = redondear(cantidad.times(precioUnitario), 2);
  const base = {
    descripcion: item.descripcion,
    unidad: item.unidad,
    cantidad,
    afectacion: item.afectacion,
    precioUnitario,
    total,
    ...(item.codigo !== undefined ? { codigo: item.codigo } : {}),
  };

  if (item.afectacion === Afectacion.GRAVADO) {
    const divisor = igvTasa.plus(1);
    const valorVenta = redondear(total.div(divisor), 2);
    return {
      ...base,
      valorUnitario: redondear(precioUnitario.div(divisor), 10),
      valorVenta,
      igv: total.minus(valorVenta),
      porcentajeIgv: igvTasa.times(100),
    };
  }

  // Exonerado o inafecto: no lleva IGV, el precio es igual al valor.
  return {
    ...base,
    valorUnitario: precioUnitario,
    valorVenta: total,
    igv: new Decimal(0),
    porcentajeIgv: new Decimal(0),
  };
}

export function calcularItems(items: ItemEntrada[], igvTasa: Decimal): ItemCalculado[] {
  return items.map((i) => calcularItem(i, igvTasa));
}

export function calcularTotales(items: ItemCalculado[]): Totales {
  const de = (a: Afectacion) => sumar(items.filter((i) => i.afectacion === a).map((i) => i.valorVenta));
  const gravado = de(Afectacion.GRAVADO);
  const exonerado = de(Afectacion.EXONERADO);
  const inafecto = de(Afectacion.INAFECTO);
  const igv = sumar(items.map((i) => i.igv));
  const valorVenta = gravado.plus(exonerado).plus(inafecto);
  const precioVenta = valorVenta.plus(igv);
  return { gravado, exonerado, inafecto, igv, valorVenta, precioVenta, importeTotal: precioVenta };
}
