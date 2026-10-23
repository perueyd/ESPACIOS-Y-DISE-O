-- =====================================================================
-- 004 · Envío a SUNAT: alertas, catálogo de errores, plazos y anulaciones
-- =====================================================================

-- ---------- Catálogo de códigos de SUNAT ------------------------------
-- El mensaje oficial se carga en 005; la explicación simple solo existe para
-- los códigos más frecuentes (el resto se explica por su rango).
ALTER TABLE sunat_errores ALTER COLUMN explicacion_es DROP NOT NULL;
ALTER TABLE sunat_errores ALTER COLUMN que_corregir DROP NOT NULL;
ALTER TABLE sunat_errores DROP CONSTRAINT sunat_errores_tipo_check;
ALTER TABLE sunat_errores ADD CONSTRAINT sunat_errores_tipo_check
  CHECK (tipo IN ('EXCEPCION', 'RECHAZO', 'OBSERVACION'));
-- Si el facturador debe reintentar solo (falla temporal de SUNAT).
ALTER TABLE sunat_errores ADD COLUMN reintentable boolean NOT NULL DEFAULT false;
ALTER TABLE sunat_errores ADD COLUMN fuente text;

-- ---------- Alertas ----------------------------------------------------
CREATE TYPE severidad_alerta AS ENUM ('VERDE', 'AMARILLO', 'ROJO');

CREATE TABLE alertas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id  uuid NOT NULL REFERENCES empresas(id),
  tipo        text NOT NULL,
  severidad   severidad_alerta NOT NULL,
  mensaje     text NOT NULL,
  entidad     text,
  entidad_id  uuid,
  vista_en    timestamptz,
  resuelta_en timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alertas_abiertas ON alertas (empresa_id, creado_en) WHERE resuelta_en IS NULL;
CREATE TRIGGER alertas_sin_borrado BEFORE DELETE ON alertas FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- ---------- Respuesta de SUNAT por comprobante ------------------------
ALTER TABLE comprobantes ADD COLUMN sunat_observaciones jsonb;
ALTER TABLE comprobantes ADD COLUMN enviado_en timestamptz;
ALTER TABLE comprobantes ADD COLUMN respondido_en timestamptz;
-- Estado al que vuelve si SUNAT rechaza la anulación.
ALTER TABLE comprobantes ADD COLUMN estado_antes_de_anular estado_comprobante;

ALTER TABLE envios_sunat ADD COLUMN resultado text;

-- ---------- Resúmenes y bajas: respuesta de SUNAT ---------------------
ALTER TABLE resumenes_diarios ADD COLUMN sunat_codigo text, ADD COLUMN sunat_mensaje text,
  ADD COLUMN hash_firma text, ADD COLUMN solicitado_por uuid REFERENCES usuarios(id), ADD COLUMN motivo text;
ALTER TABLE comunicaciones_baja ADD COLUMN sunat_codigo text, ADD COLUMN sunat_mensaje text,
  ADD COLUMN hash_firma text;
ALTER TYPE estado_resumen ADD VALUE IF NOT EXISTS 'EN_PROCESO' AFTER 'ENVIADO';

-- ---------- Parámetros de plazos (POR VERIFICAR, ver docs/PLAN.md) -----
INSERT INTO parametros_tributarios (codigo, regimen, valor, vigente_desde, fuente) VALUES
  ('PLAZO_ENVIO_FACTURA_DIAS', NULL, 3, '2019-01-01',
   'POR VERIFICAR: plazo máximo para enviar facturas y sus notas a SUNAT (días calendario).'),
  ('PLAZO_RESUMEN_BOLETAS_DIAS', NULL, 7, '2019-01-01',
   'POR VERIFICAR: plazo del resumen diario de boletas (días calendario desde la emisión).'),
  ('PLAZO_BAJA_DIAS', NULL, 7, '2019-01-01',
   'POR VERIFICAR: plazo de la comunicación de baja. R.S. 000048-2026 podría cambiarlo desde 2027.');
