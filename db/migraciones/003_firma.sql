-- =====================================================================
-- 003 · Firma digital
-- =====================================================================

-- Los certificados no se borran (historial); solo se desactivan.
CREATE TRIGGER certificados_sin_borrado BEFORE DELETE ON certificados FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- Del certificado solo puede cambiar `activo` (de true a false).
CREATE FUNCTION certificados_solo_desactivar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.empresa_id, NEW.pfx_cifrado, NEW.clave_pfx_cifrada, NEW.numero_serie, NEW.emisor, NEW.valido_desde, NEW.valido_hasta)
     IS DISTINCT FROM
     (OLD.empresa_id, OLD.pfx_cifrado, OLD.clave_pfx_cifrada, OLD.numero_serie, OLD.emisor, OLD.valido_desde, OLD.valido_hasta)
     OR (NEW.activo AND NOT OLD.activo) THEN
    RAISE EXCEPTION 'Un certificado guardado no se modifica ni se reactiva: carga uno nuevo.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER certificados_inmutables BEFORE UPDATE ON certificados FOR EACH ROW EXECUTE FUNCTION certificados_solo_desactivar();

-- Datos visibles del certificado (sin secretos) para mostrar y auditar.
ALTER TABLE certificados ADD COLUMN sujeto text NOT NULL DEFAULT '';
ALTER TABLE certificados ADD COLUMN huella_sha256 text NOT NULL DEFAULT '';

-- Un comprobante tiene UN solo XML firmado: una vez firmado no se vuelve a generar.
CREATE UNIQUE INDEX archivos_un_xml_firmado ON archivos (entidad, entidad_id) WHERE tipo = 'XML_FIRMADO';

-- Qué certificado y algoritmo se usaron para firmar cada comprobante.
ALTER TABLE comprobantes ADD COLUMN firmado_con_certificado uuid REFERENCES certificados(id);
ALTER TABLE comprobantes ADD COLUMN firma_algoritmo text CHECK (firma_algoritmo IN ('SHA1', 'SHA256'));
ALTER TABLE comprobantes ADD COLUMN firmado_en timestamptz;

-- La firma se registra una sola vez: hash, certificado, algoritmo y fecha no cambian después.
CREATE FUNCTION comprobantes_firma_unica() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.hash_firma IS NOT NULL AND
     (NEW.hash_firma, NEW.firmado_con_certificado, NEW.firma_algoritmo, NEW.firmado_en)
     IS DISTINCT FROM (OLD.hash_firma, OLD.firmado_con_certificado, OLD.firma_algoritmo, OLD.firmado_en) THEN
    RAISE EXCEPTION 'El comprobante %-% ya fue firmado; su firma no se puede cambiar.', OLD.serie, OLD.numero
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER comprobantes_firma_fija BEFORE UPDATE ON comprobantes FOR EACH ROW EXECUTE FUNCTION comprobantes_firma_unica();
