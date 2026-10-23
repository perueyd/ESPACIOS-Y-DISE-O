-- =====================================================================
-- 006 · Explicaciones en español simple de los códigos más frecuentes
-- Los demás códigos se explican con su mensaje oficial y su rango.
-- =====================================================================
UPDATE sunat_errores e SET explicacion_es = v.explicacion, que_corregir = v.corregir
FROM (VALUES
  ('0100', 'SUNAT tuvo una falla temporal y no pudo atender el envío.', 'Nada: el facturador lo reintenta solo en unos minutos.'),
  ('0101', 'El mensaje enviado a SUNAT no tenía bien la identificación del usuario.', 'Revisa la configuración del usuario SOL del facturador.'),
  ('0102', 'El usuario o la clave SOL que usa el facturador no son correctos.', 'Revisa el usuario SOL secundario (se escribe RUC + usuario, todo junto) y su clave.'),
  ('0103', 'El usuario SOL configurado no existe.', 'Crea el usuario secundario en SOL o corrige el nombre configurado.'),
  ('0104', 'La clave del usuario SOL es incorrecta.', 'Actualiza la clave del usuario secundario en el facturador.'),
  ('0105', 'El usuario SOL está desactivado.', 'Actívalo en SOL (Mantenimiento de usuarios secundarios).'),
  ('0109', 'El servicio de SUNAT para validar usuarios no estaba disponible.', 'Nada: el facturador lo reintenta solo.'),
  ('0111', 'El usuario SOL no tiene permiso para enviar comprobantes electrónicos.', 'En SOL, dale al usuario secundario los permisos de comprobantes de pago electrónicos.'),
  ('0112', 'SUNAT exige usar un usuario SOL secundario, no el principal.', 'Crea un usuario secundario con permisos mínimos y configúralo en el facturador.'),
  ('0113', 'La empresa no está afiliada a la emisión electrónica.', 'Completa la incorporación al Sistema de Emisión Electrónica en SOL.'),
  ('0127', 'SUNAT no reconoce el número de ticket consultado.', 'Revisa el resumen o la baja: puede que deba enviarse de nuevo.'),
  ('0130', 'SUNAT no pudo generar el número de ticket del envío.', 'Nada: el facturador lo reintenta solo.'),
  ('0138', 'SUNAT tuvo un error en su base de datos.', 'Nada: el facturador lo reintenta solo.'),
  ('0140', 'SUNAT ya está procesando un documento igual.', 'Nada: el facturador vuelve a consultar más tarde.'),
  ('0151', 'El nombre del archivo enviado no tiene el formato de SUNAT.', 'Error del facturador: avisa a soporte técnico.'),
  ('0154', 'El RUC del archivo no corresponde al usuario SOL usado.', 'Revisa que el usuario SOL configurado sea de la misma empresa que emite.'),
  ('0156', 'El archivo ZIP llegó dañado a SUNAT.', 'Se puede reenviar; si se repite, avisa a soporte técnico.'),
  ('0306', 'SUNAT no pudo leer el XML.', 'Error del facturador: avisa a soporte técnico.'),
  ('1032', 'Ese comprobante ya figura en SUNAT como anulado o rechazado.', 'No lo reenvíes: emite un comprobante nuevo con otro número.'),
  ('1033', 'Ese número de comprobante ya existe en SUNAT (quizá ya se envió antes).', 'No lo reenvíes: consulta su estado en SUNAT. Si ya fue aceptado, márcalo como aceptado.'),
  ('1034', 'El RUC del nombre del archivo no coincide con el del XML.', 'Error del facturador: avisa a soporte técnico.'),
  ('2017', 'Para una factura, el cliente debe identificarse con RUC.', 'Emite una boleta, o pide al cliente su RUC.'),
  ('2108', 'El comprobante se envió fuera del plazo permitido.', 'Consulta con tu contador cómo regularizarlo.'),
  ('2223', 'Ese archivo ya se había presentado antes.', 'No lo reenvíes: revisa el resultado del envío anterior.'),
  ('2324', 'Esa comunicación de baja ya se había presentado.', 'No la reenvíes: revisa el resultado del envío anterior.'),
  ('2325', 'El certificado digital usado no es el que registraste en SUNAT.', 'Registra el certificado (.cer) en SOL o carga en el facturador el certificado registrado.'),
  ('2326', 'El certificado digital usado fue dado de baja.', 'Solicita un certificado nuevo y cárgalo en el facturador.'),
  ('2327', 'El certificado digital usado no está vigente.', 'Solicita un certificado nuevo y cárgalo en el facturador.'),
  ('2334', 'SUNAT detectó que el XML fue modificado después de firmarlo.', 'No modifiques el XML firmado. Si se repite, avisa a soporte técnico.'),
  ('2335', 'SUNAT detectó que el XML fue modificado después de firmarlo.', 'No modifiques el XML firmado. Si se repite, avisa a soporte técnico.'),
  ('2800', 'El tipo de documento del cliente no está permitido para este comprobante.', 'Revisa el tipo de documento del cliente (DNI, RUC, etc.).'),
  ('2801', 'El DNI del cliente no tiene el formato correcto.', 'Corrige el DNI: deben ser 8 dígitos.')
) AS v(codigo, explicacion, corregir)
WHERE e.codigo = v.codigo;
