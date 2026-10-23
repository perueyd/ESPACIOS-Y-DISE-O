-- =====================================================================
-- 007 · Formato de PDF por defecto de cada canal
-- El formato también se puede elegir en cada solicitud; este es el que se usa
-- cuando no se indica (ej. tienda web → A4, venta en persona → ticket 80 mm).
-- =====================================================================
ALTER TABLE canales ADD COLUMN formato_pdf text NOT NULL DEFAULT 'A4'
  CHECK (formato_pdf IN ('A4', 'TICKET_80'));
