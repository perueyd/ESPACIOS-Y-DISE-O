-- =====================================================================
-- 012 · Devoluciones: nota de crédito + stock + reembolso, en un registro.
-- Solo inserción: una devolución equivocada se corrige anulando su nota
-- de crédito, nunca borrando.
-- =====================================================================

CREATE TYPE destino_devolucion AS ENUM ('REINGRESO', 'DANADO');

CREATE TABLE devoluciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id),
  comprobante_origen_id uuid NOT NULL REFERENCES comprobantes(id),
  nota_credito_id       uuid NOT NULL UNIQUE REFERENCES comprobantes(id),
  tipo                  text NOT NULL CHECK (tipo IN ('TOTAL', 'PARCIAL')),
  motivo                text NOT NULL CHECK (length(trim(motivo)) > 0),
  usuario_id            uuid REFERENCES usuarios(id),
  creado_en             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devoluciones_origen ON devoluciones (comprobante_origen_id);

CREATE TABLE devolucion_items (
  devolucion_id uuid NOT NULL REFERENCES devoluciones(id),
  item_orden    integer NOT NULL CHECK (item_orden > 0),
  cantidad      numeric(22,10) NOT NULL CHECK (cantidad > 0),
  destino       destino_devolucion NOT NULL,
  PRIMARY KEY (devolucion_id, item_orden)
);

CREATE TABLE reembolsos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id),
  devolucion_id uuid NOT NULL REFERENCES devoluciones(id),
  monto         numeric(14,2) NOT NULL CHECK (monto > 0),
  medio         medio_pago NOT NULL,
  referencia    text,
  fecha         date NOT NULL,
  usuario_id    uuid REFERENCES usuarios(id),
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER devoluciones_solo_insercion BEFORE UPDATE OR DELETE ON devoluciones FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();
CREATE TRIGGER devolucion_items_solo_insercion BEFORE UPDATE OR DELETE ON devolucion_items FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();
CREATE TRIGGER reembolsos_solo_insercion BEFORE UPDATE OR DELETE ON reembolsos FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();
