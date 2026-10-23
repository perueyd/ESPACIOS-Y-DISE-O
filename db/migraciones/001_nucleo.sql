-- =====================================================================
-- 001 · Núcleo: empresas, parámetros, canales y comprobantes
-- Diseño: docs/BASE_DE_DATOS.md (secciones A, B y C)
-- Reglas: montos en NUMERIC (nunca float); nada se borra.
-- =====================================================================

-- ---------- Funciones de protección ----------------------------------

-- Impide borrar filas de tablas de documentos y registros (regla "nunca borrar").
CREATE FUNCTION impedir_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se permite borrar registros de %: corrige con nota de crédito o baja.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- Impide cualquier modificación (tablas de solo inserción: historial, auditoría).
CREATE FUNCTION impedir_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- ---------- A. Empresas, usuarios y canales ---------------------------

CREATE TYPE regimen_tributario AS ENUM ('NUEVO_RUS', 'RER', 'MYPE_TRIBUTARIO', 'GENERAL');
CREATE TYPE ambiente_sunat AS ENUM ('BETA', 'PRODUCCION');

CREATE TABLE usuarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL,
  nombre               text NOT NULL,
  password_hash        text,
  totp_secreto_cifrado bytea,
  totp_activo          boolean NOT NULL DEFAULT false,
  intentos_fallidos    integer NOT NULL DEFAULT 0,
  bloqueado_hasta      timestamptz,
  activo               boolean NOT NULL DEFAULT true,
  creado_en            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));

CREATE TABLE empresas (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc                        char(11) NOT NULL UNIQUE CHECK (ruc ~ '^(10|15|16|17|20)\d{9}$'),
  razon_social               text NOT NULL,
  nombre_comercial           text,
  ubigeo                     char(6) NOT NULL CHECK (ubigeo ~ '^\d{6}$'),
  departamento               text NOT NULL,
  provincia                  text NOT NULL,
  distrito                   text NOT NULL,
  direccion                  text NOT NULL,
  urbanizacion               text,
  codigo_establecimiento     char(4) NOT NULL DEFAULT '0000',
  ambiente_sunat             ambiente_sunat NOT NULL DEFAULT 'BETA',
  produccion_autorizada_por  uuid REFERENCES usuarios(id),
  produccion_autorizada_en   timestamptz,
  logo_archivo_id            uuid,
  indicadores_visibles       jsonb NOT NULL DEFAULT '[]',
  creado_en                  timestamptz NOT NULL DEFAULT now(),
  -- Pasar a producción exige saber quién y cuándo lo autorizó.
  CHECK (ambiente_sunat = 'BETA' OR (produccion_autorizada_por IS NOT NULL AND produccion_autorizada_en IS NOT NULL))
);

CREATE TABLE empresa_regimen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id),
  regimen        regimen_tributario NOT NULL,
  categoria_nrus text,
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, vigente_desde),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE TYPE rol_usuario AS ENUM ('DUENO', 'ADMIN', 'VENDEDOR', 'CONTADOR', 'SOLO_LECTURA');

CREATE TABLE usuario_empresa (
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  rol        rol_usuario NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, empresa_id)
);

-- Credenciales SOL del usuario SECUNDARIO (nunca la Clave SOL principal), cifradas.
CREATE TABLE credenciales_sol (
  empresa_id     uuid NOT NULL REFERENCES empresas(id),
  ambiente       ambiente_sunat NOT NULL,
  usuario_sol    text NOT NULL,
  clave_cifrada  bytea NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, ambiente)
);

CREATE TABLE certificados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id),
  pfx_cifrado       bytea NOT NULL,
  clave_pfx_cifrada bytea NOT NULL,
  numero_serie      text NOT NULL,
  emisor            text NOT NULL,
  valido_desde      timestamptz NOT NULL,
  valido_hasta      timestamptz NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX certificados_un_activo ON certificados (empresa_id) WHERE activo;

CREATE TABLE marcas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre     text NOT NULL,
  logo_archivo_id uuid,
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre),
  UNIQUE (empresa_id, id)
);

CREATE TYPE tipo_canal AS ENUM ('API', 'MANUAL');

CREATE TABLE canales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id),
  nombre                text NOT NULL,
  tipo                  tipo_canal NOT NULL,
  marca_id_por_defecto  uuid,
  activo                boolean NOT NULL DEFAULT true,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre),
  UNIQUE (empresa_id, id),
  FOREIGN KEY (empresa_id, marca_id_por_defecto) REFERENCES marcas (empresa_id, id)
);

-- La llave completa solo se muestra al crearla; aquí se guarda su hash.
CREATE TABLE api_llaves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id),
  canal_id      uuid NOT NULL,
  prefijo       text NOT NULL UNIQUE,
  hash          text NOT NULL UNIQUE,
  permisos      jsonb NOT NULL DEFAULT '[]',
  ultimo_uso_en timestamptz,
  revocada_en   timestamptz,
  revocada_por  uuid REFERENCES usuarios(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, canal_id) REFERENCES canales (empresa_id, id)
);

-- ---------- B. Parámetros tributarios y catálogos --------------------

CREATE TABLE parametros_tributarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        text NOT NULL,
  regimen       regimen_tributario,          -- NULL = aplica a todos
  valor         numeric(20,6) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date,
  fuente        text NOT NULL,               -- norma, enlace y fecha de consulta
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
-- NULLS NOT DISTINCT (PostgreSQL 15+): un solo valor general (regimen NULL) por código y fecha.
CREATE UNIQUE INDEX parametros_unicos ON parametros_tributarios (codigo, regimen, vigente_desde) NULLS NOT DISTINCT;

CREATE TABLE regimen_comprobantes_permitidos (
  regimen          regimen_tributario NOT NULL,
  tipo_comprobante char(2) NOT NULL,
  permitido        boolean NOT NULL,
  fuente           text NOT NULL,
  PRIMARY KEY (regimen, tipo_comprobante)
);

-- Exoneraciones/inafectaciones de IGV (ej. transporte de pasajeros).
CREATE TABLE exoneraciones (
  codigo              text PRIMARY KEY,
  descripcion         text NOT NULL,
  tipo_afectacion_igv char(2) NOT NULL CHECK (tipo_afectacion_igv IN ('20', '30')),
  vigente_desde       date NOT NULL,
  vigente_hasta       date,
  fuente              text NOT NULL
);

CREATE TABLE empresa_exoneraciones (
  empresa_id         uuid NOT NULL REFERENCES empresas(id),
  exoneracion_codigo text NOT NULL REFERENCES exoneraciones(codigo),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, exoneracion_codigo)
);

-- Códigos de error/observación de SUNAT explicados en español (se cargan en la fase 4
-- desde la lista oficial vigente).
CREATE TABLE sunat_errores (
  codigo          text PRIMARY KEY,
  mensaje_oficial text NOT NULL,
  explicacion_es  text NOT NULL,
  que_corregir    text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('RECHAZO', 'OBSERVACION', 'EXCEPCION'))
);

-- ---------- C. Clientes, productos y comprobantes --------------------

CREATE TABLE clientes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES empresas(id),
  tipo_doc_identidad  text NOT NULL,
  numero_doc          text NOT NULL,
  nombre_razon_social text NOT NULL,
  direccion           text,
  email               text,
  telefono            text,
  ruc_estado          text,
  ruc_condicion       text,
  verificado_en       timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo_doc_identidad, numero_doc),
  UNIQUE (empresa_id, id)
);

CREATE TABLE productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES empresas(id),
  marca_id            uuid,
  sku                 text NOT NULL,
  nombre              text NOT NULL,
  unidad_medida       text NOT NULL DEFAULT 'NIU',
  precio_con_igv      numeric(22,10) NOT NULL CHECK (precio_con_igv >= 0),
  tipo_afectacion_igv char(2) NOT NULL DEFAULT '10',
  controla_stock      boolean NOT NULL DEFAULT false,
  stock_minimo        numeric(14,4),
  costo_promedio      numeric(22,10),
  activo              boolean NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, sku),
  UNIQUE (empresa_id, id),
  FOREIGN KEY (empresa_id, marca_id) REFERENCES marcas (empresa_id, id)
);

-- Una fila por serie. `ultimo_numero` solo avanza dentro de la misma transacción
-- que inserta el comprobante: si algo falla, se deshace y no hay saltos.
CREATE TABLE series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES empresas(id),
  tipo_comprobante char(2) NOT NULL CHECK (tipo_comprobante IN ('01', '03', '07', '08')),
  serie            char(4) NOT NULL CHECK (serie ~ '^[FB][A-Z0-9]{3}$'),
  ultimo_numero    bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero BETWEEN 0 AND 99999999),
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo_comprobante, serie),
  UNIQUE (empresa_id, id),
  CHECK (tipo_comprobante NOT IN ('01') OR serie LIKE 'F%'),
  CHECK (tipo_comprobante NOT IN ('03') OR serie LIKE 'B%')
);
CREATE TRIGGER series_sin_borrado BEFORE DELETE ON series FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- El número de una serie nunca retrocede (evita reutilizar números).
CREATE FUNCTION series_no_retroceder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ultimo_numero < OLD.ultimo_numero THEN
    RAISE EXCEPTION 'El correlativo de la serie % no puede retroceder.', OLD.serie USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.serie <> OLD.serie OR NEW.tipo_comprobante <> OLD.tipo_comprobante OR NEW.empresa_id <> OLD.empresa_id THEN
    RAISE EXCEPTION 'No se puede cambiar la identidad de una serie.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER series_correlativo BEFORE UPDATE ON series FOR EACH ROW EXECUTE FUNCTION series_no_retroceder();

CREATE TYPE estado_comprobante AS ENUM (
  'EMITIDO_LOCAL',          -- numerado y guardado, aún no enviado
  'PENDIENTE_ENVIO',        -- se intentó enviar y SUNAT no respondió
  'ACEPTADO',
  'ACEPTADO_OBS',
  'RECHAZADO',
  'ANULACION_EN_PROCESO',
  'ANULADO'
);
CREATE TYPE estado_pago AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO');

CREATE TABLE comprobantes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                 uuid NOT NULL REFERENCES empresas(id),
  serie_id                   uuid NOT NULL,
  tipo_comprobante           char(2) NOT NULL,
  serie                      char(4) NOT NULL,
  numero                     bigint NOT NULL CHECK (numero BETWEEN 1 AND 99999999),
  fecha_emision              date NOT NULL,
  hora_emision               time NOT NULL,
  moneda                     char(3) NOT NULL DEFAULT 'PEN',
  -- Cliente: referencia + copia fija de sus datos al momento de emitir.
  cliente_id                 uuid,
  cliente_tipo_doc           text NOT NULL,
  cliente_numero_doc         text NOT NULL,
  cliente_nombre             text NOT NULL,
  cliente_direccion          text,
  -- Origen
  marca_id                   uuid,
  canal_id                   uuid NOT NULL,
  pedido_externo_id          text,
  -- Pago
  forma_pago                 text NOT NULL CHECK (forma_pago IN ('CONTADO', 'CREDITO')),
  estado_pago                estado_pago NOT NULL DEFAULT 'PENDIENTE',
  -- Totales (2 decimales)
  total_gravado              numeric(14,2) NOT NULL,
  total_exonerado            numeric(14,2) NOT NULL,
  total_inafecto             numeric(14,2) NOT NULL,
  total_igv                  numeric(14,2) NOT NULL,
  importe_total              numeric(14,2) NOT NULL CHECK (importe_total > 0),
  parametros_usados          jsonb NOT NULL,
  -- Notas de crédito
  comprobante_referencia_id  uuid,
  motivo_nota_codigo         char(2),
  motivo_nota_texto          text,
  -- Estado y SUNAT
  estado                     estado_comprobante NOT NULL DEFAULT 'EMITIDO_LOCAL',
  ambiente_sunat             ambiente_sunat NOT NULL,
  hash_firma                 text,
  sunat_codigo_respuesta     text,
  sunat_mensaje              text,
  emitido_por_usuario        uuid REFERENCES usuarios(id),
  emitido_por_llave          uuid REFERENCES api_llaves(id),
  creado_en                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo_comprobante, serie, numero),
  UNIQUE (empresa_id, id),
  FOREIGN KEY (empresa_id, serie_id) REFERENCES series (empresa_id, id),
  FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes (empresa_id, id),
  FOREIGN KEY (empresa_id, marca_id) REFERENCES marcas (empresa_id, id),
  FOREIGN KEY (empresa_id, canal_id) REFERENCES canales (empresa_id, id),
  FOREIGN KEY (empresa_id, comprobante_referencia_id) REFERENCES comprobantes (empresa_id, id),
  CHECK (total_gravado + total_exonerado + total_inafecto + total_igv = importe_total),
  CHECK ((tipo_comprobante = '07') = (comprobante_referencia_id IS NOT NULL AND motivo_nota_codigo IS NOT NULL))
);
-- Idempotencia: un pedido de un canal produce un solo comprobante. Si el mismo pedido
-- llega dos veces, se devuelve el que ya existe. (Una nota de crédito usa su propio id.)
CREATE UNIQUE INDEX comprobantes_pedido_unico
  ON comprobantes (empresa_id, canal_id, pedido_externo_id)
  WHERE pedido_externo_id IS NOT NULL;
CREATE INDEX comprobantes_fecha ON comprobantes (empresa_id, fecha_emision);
CREATE INDEX comprobantes_estado ON comprobantes (empresa_id, estado);
CREATE TRIGGER comprobantes_sin_borrado BEFORE DELETE ON comprobantes FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- Una vez emitido, el contenido del comprobante es inmutable; solo cambian estado y datos de SUNAT/pago.
CREATE FUNCTION comprobantes_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.empresa_id, NEW.serie_id, NEW.tipo_comprobante, NEW.serie, NEW.numero, NEW.fecha_emision,
      NEW.hora_emision, NEW.moneda, NEW.cliente_tipo_doc, NEW.cliente_numero_doc, NEW.cliente_nombre,
      NEW.cliente_direccion, NEW.canal_id, NEW.pedido_externo_id, NEW.forma_pago, NEW.total_gravado,
      NEW.total_exonerado, NEW.total_inafecto, NEW.total_igv, NEW.importe_total, NEW.parametros_usados,
      NEW.comprobante_referencia_id, NEW.motivo_nota_codigo, NEW.motivo_nota_texto, NEW.ambiente_sunat)
     IS DISTINCT FROM
     (OLD.empresa_id, OLD.serie_id, OLD.tipo_comprobante, OLD.serie, OLD.numero, OLD.fecha_emision,
      OLD.hora_emision, OLD.moneda, OLD.cliente_tipo_doc, OLD.cliente_numero_doc, OLD.cliente_nombre,
      OLD.cliente_direccion, OLD.canal_id, OLD.pedido_externo_id, OLD.forma_pago, OLD.total_gravado,
      OLD.total_exonerado, OLD.total_inafecto, OLD.total_igv, OLD.importe_total, OLD.parametros_usados,
      OLD.comprobante_referencia_id, OLD.motivo_nota_codigo, OLD.motivo_nota_texto, OLD.ambiente_sunat)
  THEN
    RAISE EXCEPTION 'El comprobante %-% ya fue emitido y no se puede modificar: usa una nota de crédito.',
      OLD.serie, OLD.numero USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER comprobantes_contenido_fijo BEFORE UPDATE ON comprobantes FOR EACH ROW EXECUTE FUNCTION comprobantes_inmutables();

CREATE TABLE comprobante_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id          uuid NOT NULL REFERENCES comprobantes(id),
  orden                   integer NOT NULL CHECK (orden > 0),
  producto_id             uuid REFERENCES productos(id),
  codigo                  text,
  descripcion             text NOT NULL,
  unidad_medida           text NOT NULL,
  cantidad                numeric(22,10) NOT NULL CHECK (cantidad > 0),
  precio_unitario_con_igv numeric(22,10) NOT NULL,
  valor_unitario_sin_igv  numeric(22,10) NOT NULL,
  tipo_afectacion_igv     char(2) NOT NULL,
  porcentaje_igv          numeric(5,2) NOT NULL,
  valor_venta             numeric(14,2) NOT NULL,
  igv                     numeric(14,2) NOT NULL,
  total                   numeric(14,2) NOT NULL,
  costo_unitario          numeric(22,10),
  UNIQUE (comprobante_id, orden),
  CHECK (valor_venta + igv = total)
);
CREATE TRIGGER items_sin_borrado BEFORE DELETE ON comprobante_items FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER items_sin_cambios BEFORE UPDATE ON comprobante_items FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

CREATE TABLE comprobante_cuotas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id    uuid NOT NULL REFERENCES comprobantes(id),
  numero_cuota      integer NOT NULL CHECK (numero_cuota > 0),
  monto             numeric(14,2) NOT NULL CHECK (monto > 0),
  fecha_vencimiento date NOT NULL,
  pagada            boolean NOT NULL DEFAULT false,
  UNIQUE (comprobante_id, numero_cuota)
);
CREATE TRIGGER cuotas_sin_borrado BEFORE DELETE ON comprobante_cuotas FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- Historial: quién, cuándo y por qué cambió cada comprobante.
CREATE TABLE comprobante_eventos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comprobante_id  uuid NOT NULL REFERENCES comprobantes(id),
  estado_anterior estado_comprobante,
  estado_nuevo    estado_comprobante NOT NULL,
  detalle         text,
  motivo          text,
  usuario_id      uuid REFERENCES usuarios(id),
  api_llave_id    uuid REFERENCES api_llaves(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER eventos_solo_insercion BEFORE UPDATE OR DELETE ON comprobante_eventos FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

-- ---------- Cola de envíos e intentos --------------------------------

CREATE TYPE tipo_trabajo AS ENUM ('COMPROBANTE', 'RESUMEN_DIARIO', 'BAJA', 'CONSULTA_TICKET', 'CONSULTA_ESTADO');
CREATE TYPE estado_trabajo AS ENUM ('PENDIENTE', 'PROCESANDO', 'HECHO', 'FALLIDO_REVISAR');

CREATE TABLE cola_envios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresas(id),
  tipo               tipo_trabajo NOT NULL,
  referencia_id      uuid NOT NULL,
  estado             estado_trabajo NOT NULL DEFAULT 'PENDIENTE',
  intentos           integer NOT NULL DEFAULT 0,
  proximo_intento_en timestamptz NOT NULL DEFAULT now(),
  bloqueado_hasta    timestamptz,
  ultimo_error       text,
  fecha_limite_legal date,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cola_pendientes ON cola_envios (proximo_intento_en) WHERE estado = 'PENDIENTE';
CREATE UNIQUE INDEX cola_un_trabajo_activo ON cola_envios (tipo, referencia_id) WHERE estado IN ('PENDIENTE', 'PROCESANDO');
CREATE TRIGGER cola_sin_borrado BEFORE DELETE ON cola_envios FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

CREATE TABLE envios_sunat (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id       uuid NOT NULL REFERENCES empresas(id),
  tipo             tipo_trabajo NOT NULL,
  referencia_id    uuid NOT NULL,
  metodo           text NOT NULL,
  ambiente         ambiente_sunat NOT NULL,
  ticket           text,
  http_estado      integer,
  codigo_respuesta text,
  mensaje          text,
  duracion_ms      integer,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER envios_solo_insercion BEFORE UPDATE OR DELETE ON envios_sunat FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

-- Referencias a archivos guardados en almacenamiento externo (XML, CDR, PDF…).
CREATE TABLE archivos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES empresas(id),
  entidad              text NOT NULL,
  entidad_id           uuid NOT NULL,
  tipo                 text NOT NULL CHECK (tipo IN ('XML', 'XML_FIRMADO', 'ZIP', 'CDR', 'PDF', 'LOGO', 'EXTRACTO_BANCO', 'SUSTENTO')),
  ruta_almacenamiento  text NOT NULL,
  sha256               char(64) NOT NULL,
  tamano               bigint NOT NULL,
  conservar_hasta      date NOT NULL,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  CHECK (conservar_hasta >= (creado_en::date + interval '5 years')::date)
);
CREATE TRIGGER archivos_solo_insercion BEFORE UPDATE OR DELETE ON archivos FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

-- ---------- Resúmenes diarios y comunicaciones de baja ---------------

CREATE TYPE estado_resumen AS ENUM ('GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO');

CREATE TABLE resumenes_diarios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES empresas(id),
  fecha_generacion date NOT NULL,
  correlativo      integer NOT NULL CHECK (correlativo BETWEEN 1 AND 99999),
  fecha_referencia date NOT NULL,
  ticket           text,
  estado           estado_resumen NOT NULL DEFAULT 'GENERADO',
  ambiente_sunat   ambiente_sunat NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, fecha_generacion, correlativo)
);
CREATE TRIGGER resumenes_sin_borrado BEFORE DELETE ON resumenes_diarios FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

CREATE TABLE resumen_items (
  resumen_id     uuid NOT NULL REFERENCES resumenes_diarios(id),
  linea          integer NOT NULL,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  condicion      char(1) NOT NULL CHECK (condicion IN ('1', '2', '3')),
  PRIMARY KEY (resumen_id, linea)
);
CREATE TRIGGER resumen_items_solo_insercion BEFORE UPDATE OR DELETE ON resumen_items FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

CREATE TABLE comunicaciones_baja (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES empresas(id),
  fecha_generacion date NOT NULL,
  correlativo      integer NOT NULL CHECK (correlativo BETWEEN 1 AND 99999),
  fecha_referencia date NOT NULL,
  ticket           text,
  estado           estado_resumen NOT NULL DEFAULT 'GENERADO',
  ambiente_sunat   ambiente_sunat NOT NULL,
  solicitado_por   uuid REFERENCES usuarios(id),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, fecha_generacion, correlativo)
);
CREATE TRIGGER bajas_sin_borrado BEFORE DELETE ON comunicaciones_baja FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

CREATE TABLE baja_items (
  baja_id        uuid NOT NULL REFERENCES comunicaciones_baja(id),
  linea          integer NOT NULL,
  comprobante_id uuid NOT NULL REFERENCES comprobantes(id),
  motivo         text NOT NULL CHECK (length(trim(motivo)) > 0),
  PRIMARY KEY (baja_id, linea)
);
CREATE TRIGGER baja_items_solo_insercion BEFORE UPDATE OR DELETE ON baja_items FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();

-- ---------- Auditoría ------------------------------------------------

CREATE TABLE auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id   uuid REFERENCES empresas(id),
  usuario_id   uuid REFERENCES usuarios(id),
  api_llave_id uuid REFERENCES api_llaves(id),
  accion       text NOT NULL,
  entidad      text NOT NULL,
  entidad_id   uuid,
  antes        jsonb,
  despues      jsonb,
  motivo       text,
  ip           inet,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_entidad ON auditoria (entidad, entidad_id);
CREATE TRIGGER auditoria_solo_insercion BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION impedir_modificacion();
