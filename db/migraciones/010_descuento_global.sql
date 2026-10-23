-- =====================================================================
-- 010 · Descuento global (catálogo 53, código 02: rebaja la base imponible)
-- Montos SIN IGV, tal como van en el XML. total_gravado ya es el neto.
-- =====================================================================

ALTER TABLE comprobantes
  ADD COLUMN descuento_global      numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento_global >= 0),
  ADD COLUMN descuento_global_base numeric(14,2),
  ADD CHECK ((descuento_global = 0) = (descuento_global_base IS NULL)),
  ADD CHECK (descuento_global = 0 OR (tipo_comprobante IN ('01', '03') AND descuento_global < descuento_global_base));

-- El descuento también es parte del contenido inmutable del comprobante.
CREATE OR REPLACE FUNCTION comprobantes_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.empresa_id, NEW.serie_id, NEW.tipo_comprobante, NEW.serie, NEW.numero, NEW.fecha_emision,
      NEW.hora_emision, NEW.moneda, NEW.cliente_tipo_doc, NEW.cliente_numero_doc, NEW.cliente_nombre,
      NEW.cliente_direccion, NEW.canal_id, NEW.pedido_externo_id, NEW.forma_pago, NEW.total_gravado,
      NEW.total_exonerado, NEW.total_inafecto, NEW.total_igv, NEW.importe_total, NEW.parametros_usados,
      NEW.comprobante_referencia_id, NEW.motivo_nota_codigo, NEW.motivo_nota_texto, NEW.ambiente_sunat,
      NEW.descuento_global, NEW.descuento_global_base)
     IS DISTINCT FROM
     (OLD.empresa_id, OLD.serie_id, OLD.tipo_comprobante, OLD.serie, OLD.numero, OLD.fecha_emision,
      OLD.hora_emision, OLD.moneda, OLD.cliente_tipo_doc, OLD.cliente_numero_doc, OLD.cliente_nombre,
      OLD.cliente_direccion, OLD.canal_id, OLD.pedido_externo_id, OLD.forma_pago, OLD.total_gravado,
      OLD.total_exonerado, OLD.total_inafecto, OLD.total_igv, OLD.importe_total, OLD.parametros_usados,
      OLD.comprobante_referencia_id, OLD.motivo_nota_codigo, OLD.motivo_nota_texto, OLD.ambiente_sunat,
      OLD.descuento_global, OLD.descuento_global_base)
  THEN
    RAISE EXCEPTION 'El comprobante %-% ya fue emitido y no se puede modificar: usa una nota de crédito.',
      OLD.serie, OLD.numero USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
