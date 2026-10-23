-- =====================================================================
-- 008 · Cobros: pagos, aplicación a comprobantes y cuotas
-- El estado de pago del comprobante (PENDIENTE / PARCIAL / PAGADO) se recalcula
-- desde los pagos; nunca se edita a mano.
-- =====================================================================

CREATE TYPE medio_pago AS ENUM ('YAPE', 'PLIN', 'EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PASARELA', 'OTRO');

CREATE TABLE pagos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES empresas(id),
  comprobante_id       uuid NOT NULL,
  fecha                date NOT NULL,
  monto                numeric(14,2) NOT NULL CHECK (monto > 0),
  medio                medio_pago NOT NULL,
  -- Número de operación (Yape, Plin, transferencia…): evita registrar dos veces el mismo pago.
  referencia_operacion text,
  notas                text,
  registrado_por       uuid REFERENCES usuarios(id),
  api_llave_id         uuid REFERENCES api_llaves(id),
  anulado_en           timestamptz,
  anulado_motivo       text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, comprobante_id) REFERENCES comprobantes (empresa_id, id),
  CHECK ((anulado_en IS NULL) = (anulado_motivo IS NULL))
);
CREATE UNIQUE INDEX pagos_operacion_unica ON pagos (empresa_id, medio, referencia_operacion)
  WHERE referencia_operacion IS NOT NULL AND anulado_en IS NULL;
CREATE INDEX pagos_comprobante ON pagos (comprobante_id);
CREATE INDEX pagos_fecha ON pagos (empresa_id, fecha);
CREATE TRIGGER pagos_sin_borrado BEFORE DELETE ON pagos FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- De un pago solo se puede registrar su anulación (con motivo); nada más cambia.
CREATE FUNCTION pagos_solo_anular() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.empresa_id, NEW.comprobante_id, NEW.fecha, NEW.monto, NEW.medio, NEW.referencia_operacion, NEW.creado_en)
     IS DISTINCT FROM (OLD.empresa_id, OLD.comprobante_id, OLD.fecha, OLD.monto, OLD.medio, OLD.referencia_operacion, OLD.creado_en)
     OR OLD.anulado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Un pago registrado no se modifica; anúlalo con un motivo y registra el correcto.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pagos_inmutables BEFORE UPDATE ON pagos FOR EACH ROW EXECUTE FUNCTION pagos_solo_anular();

-- Los pagos de una cuota se reparten en orden de vencimiento: esto marca hasta dónde llegan.
ALTER TABLE comprobante_cuotas ADD COLUMN monto_pagado numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0);
