-- =====================================================================
-- 009 · Inventario, compras a proveedores, metas
-- El stock es la SUMA de los movimientos (nunca un número editado a mano).
-- =====================================================================

CREATE TYPE tipo_movimiento AS ENUM ('VENTA', 'DEVOLUCION', 'COMPRA', 'AJUSTE', 'ANULACION');

CREATE TABLE movimientos_stock (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id     uuid NOT NULL REFERENCES empresas(id),
  producto_id    uuid NOT NULL,
  tipo           tipo_movimiento NOT NULL,
  cantidad       numeric(22,10) NOT NULL CHECK (cantidad <> 0),   -- + entra, − sale
  costo_unitario numeric(22,10),                                   -- sin IGV
  comprobante_id uuid REFERENCES comprobantes(id),
  compra_id      uuid,
  motivo         text,
  usuario_id     uuid REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, producto_id) REFERENCES productos (empresa_id, id),
  CHECK (tipo <> 'AJUSTE' OR length(trim(coalesce(motivo, ''))) > 0)
);
CREATE INDEX movimientos_producto ON movimientos_stock (producto_id);
CREATE TRIGGER movimientos_solo_insercion BEFORE UPDATE OR DELETE ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

CREATE TABLE proveedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id),
  ruc             char(11) NOT NULL,
  razon_social    text NOT NULL,
  estado_sunat    text,
  condicion_sunat text,
  verificado_en   timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ruc),
  UNIQUE (empresa_id, id)
);

CREATE TABLE compras (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id),
  proveedor_id      uuid NOT NULL,
  tipo_comprobante  char(2) NOT NULL DEFAULT '01',
  serie             text NOT NULL,
  numero            bigint NOT NULL CHECK (numero > 0),
  fecha_emision     date NOT NULL,
  periodo           char(7) NOT NULL,                 -- AAAA-MM (registro de compras)
  base_imponible    numeric(14,2) NOT NULL,
  igv               numeric(14,2) NOT NULL,
  otros             numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL CHECK (total > 0),
  -- Validación en SUNAT (módulo de crédito fiscal, pendiente): PENDIENTE hasta verificarla.
  estado_validacion text NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado_validacion IN ('PENDIENTE', 'VALIDA', 'NO_EXISTE', 'NO_RECONOCIDA', 'PROVEEDOR_NO_HABIDO')),
  notas             text,
  anulada_en        timestamptz,
  anulada_motivo    text,
  registrado_por    uuid REFERENCES usuarios(id),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id),
  UNIQUE (empresa_id, proveedor_id, tipo_comprobante, serie, numero),
  CHECK (base_imponible + igv + otros = total),
  CHECK ((anulada_en IS NULL) = (anulada_motivo IS NULL))
);
CREATE INDEX compras_periodo ON compras (empresa_id, periodo);
CREATE TRIGGER compras_sin_borrado BEFORE DELETE ON compras FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
ALTER TABLE movimientos_stock ADD FOREIGN KEY (compra_id) REFERENCES compras(id);

CREATE TABLE compra_items (
  compra_id      uuid NOT NULL REFERENCES compras(id),
  orden          integer NOT NULL CHECK (orden > 0),
  producto_id    uuid REFERENCES productos(id),
  descripcion    text NOT NULL,
  cantidad       numeric(22,10) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(22,10) NOT NULL CHECK (costo_unitario >= 0),  -- sin IGV
  total          numeric(14,2) NOT NULL,
  PRIMARY KEY (compra_id, orden)
);
CREATE TRIGGER compra_items_solo_insercion BEFORE UPDATE OR DELETE ON compra_items FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

-- Metas del negocio (ej. margen semanal de S/ 3,000), con vigencia.
CREATE TABLE metas (
  empresa_id    uuid NOT NULL REFERENCES empresas(id),
  tipo          text NOT NULL CHECK (tipo IN ('MARGEN_SEMANAL')),
  monto         numeric(14,2) NOT NULL CHECK (monto > 0),
  vigente_desde date NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, tipo, vigente_desde)
);
