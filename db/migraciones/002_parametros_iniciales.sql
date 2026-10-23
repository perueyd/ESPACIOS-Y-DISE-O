-- =====================================================================
-- 002 · Parámetros tributarios iniciales (configurables, con vigencia)
-- Cada valor indica su fuente. Los marcados "POR VERIFICAR" vienen de fuentes
-- secundarias consultadas en oct-2026 y deben confirmarse en la norma oficial
-- antes de pasar a producción (ver docs/PLAN.md, sección 2).
-- Para cambiar un valor: NO editar esta fila; insertar una nueva con su
-- vigente_desde y cerrar la anterior con vigente_hasta.
-- =====================================================================

INSERT INTO parametros_tributarios (codigo, regimen, valor, vigente_desde, fuente) VALUES
  ('IGV_TASA', NULL, 0.18, '2011-03-01',
   'TUO Ley del IGV: 16% IGV + 2% IPM. Consultado oct-2026.'),
  ('UIT', NULL, 5500, '2026-01-01',
   'Decreto Supremo MEF, UIT 2026 = S/ 5,500. Consultado oct-2026.'),
  ('BOLETA_MONTO_IDENTIFICAR', NULL, 700, '2019-01-01',
   'R.S. 007-99/SUNAT y Anexo 2 de R.S. 303-2018/SUNAT: identificar al adquirente si la boleta supera S/ 700.'),
  ('NRUS_LIMITE_ANUAL', 'NUEVO_RUS', 96000, '2017-01-01',
   'POR VERIFICAR: D.Leg. 937 y modificatorias, límite anual de ingresos del Nuevo RUS.'),
  ('NRUS_LIMITE_MENSUAL', 'NUEVO_RUS', 8000, '2017-01-01',
   'POR VERIFICAR: D.Leg. 937 y modificatorias, límite mensual de la categoría 2.'),
  ('RMT_PAGO_CUENTA_TASA', 'MYPE_TRIBUTARIO', 0.01, '2017-01-01',
   'POR VERIFICAR: D.Leg. 1269, pago a cuenta 1% de ingresos netos hasta 300 UIT.'),
  ('RMT_LIMITE_PAGO_CUENTA_UIT', 'MYPE_TRIBUTARIO', 300, '2017-01-01',
   'POR VERIFICAR: D.Leg. 1269.');

INSERT INTO regimen_comprobantes_permitidos (regimen, tipo_comprobante, permitido, fuente) VALUES
  ('NUEVO_RUS', '01', false, 'D.Leg. 937: el Nuevo RUS no emite facturas.'),
  ('NUEVO_RUS', '03', true,  'D.Leg. 937'),
  ('NUEVO_RUS', '07', true,  'Nota de crédito de boletas'),
  ('RER', '01', true, 'Reglamento de Comprobantes de Pago'),
  ('RER', '03', true, 'Reglamento de Comprobantes de Pago'),
  ('RER', '07', true, 'Reglamento de Comprobantes de Pago'),
  ('MYPE_TRIBUTARIO', '01', true, 'Reglamento de Comprobantes de Pago'),
  ('MYPE_TRIBUTARIO', '03', true, 'Reglamento de Comprobantes de Pago'),
  ('MYPE_TRIBUTARIO', '07', true, 'Reglamento de Comprobantes de Pago'),
  ('GENERAL', '01', true, 'Reglamento de Comprobantes de Pago'),
  ('GENERAL', '03', true, 'Reglamento de Comprobantes de Pago'),
  ('GENERAL', '07', true, 'Reglamento de Comprobantes de Pago');

INSERT INTO exoneraciones (codigo, descripcion, tipo_afectacion_igv, vigente_desde, vigente_hasta, fuente) VALUES
  ('TRANSPORTE_PASAJEROS',
   'Servicio de transporte público de pasajeros dentro del país (incluye taxi). No incluye la comisión de aplicativos.',
   '20', '2000-01-01', '2028-12-31',
   'POR VERIFICAR: Apéndice II num. 2 TUO Ley del IGV; prórroga a 31-12-2028 según Ley 32542 (fuente secundaria). Informe 000107-2025-SUNAT/7T0000.');
