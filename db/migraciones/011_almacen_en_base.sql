-- =====================================================================
-- 011 · Contenido de los archivos (XML firmados, CDR, logos) en la base.
-- Son pocos KB por comprobante: guardarlos aquí evita depender de otro
-- servicio y los respaldos diarios de la base los incluyen (conservación
-- de 5 años). Solo se insertan: nunca se editan ni se borran.
-- La tabla `archivos` sigue registrando a qué empresa y comprobante
-- pertenece cada ruta.
-- =====================================================================

CREATE TABLE archivos_contenido (
  ruta       text PRIMARY KEY CHECK (ruta ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'),
  contenido  bytea NOT NULL,
  sha256     char(64) NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER archivos_contenido_solo_insercion BEFORE UPDATE OR DELETE ON archivos_contenido
  FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();
