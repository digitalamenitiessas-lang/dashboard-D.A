-- =====================================================================
-- PASO 4 — SEED (opcional)
-- Los mismos datos que hoy tiene lib/mock-data.ts, para poder probar
-- la app contra la base real sin cargar nada a mano.
-- Fecha de referencia de los datos: 2026-07-27.
--
-- REQUIERE haber corrido antes el 03 y el 06.
-- Si vas a cargar proyectos reales, saltealo: no hace falta.
-- =====================================================================

-- Las filas 1:1 las inserta el seed explícitamente, así que apagamos
-- el trigger que las crearía en blanco.
alter table projects disable trigger projects_init_children;


-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
insert into clients (id, name, contact_person, phone, email, notes) values
('aaaaaaaa-0000-4000-8000-000000000001', 'Hotel Costa Serena', 'Marina López', '+54 11 5544-1020', 'marina@costaserena.com', 'Cadena hotelera boutique. Muy interesados en automatizar check-in.'),
('aaaaaaaa-0000-4000-8000-000000000002', 'Grupo Andes Retail', 'Diego Fernández', '+54 351 244-9911', 'diego.f@andesretail.com', 'Retail con 12 sucursales. Pagos siempre puntuales.'),
('aaaaaaaa-0000-4000-8000-000000000003', 'Clínica Nova Salud', 'Dra. Paula Giménez', '+54 11 4788-3322', 'sistemas@novasalud.com', 'Requieren cumplimiento estricto de datos de pacientes.'),
('aaaaaaaa-0000-4000-8000-000000000004', 'Estudio Contable Ferreyra', 'Luis Ferreyra', '+54 341 655-8080', 'luis@estudioferreyra.com', 'Cliente chico pero recurrente. Mantenimiento mensual.');


-- ---------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------
insert into projects (id, name, description, type, client_id, owner_name, contact_person, internal_lead, status, priority, start_date, estimated_delivery, implementation_date, quoted_amount, currency, created_at, updated_at) values
('bbbbbbbb-0000-4000-8000-000000000001', 'Portal de Reservas Costa Serena', 'Plataforma de reservas online con motor de disponibilidad, pagos y panel de administración para el hotel.', 'terceros', 'aaaaaaaa-0000-4000-8000-000000000001', 'Hotel Costa Serena', 'Marina López', 'Sofía Ramírez', 'En desarrollo', 'Alta', '2026-04-10', '2026-08-30', null, 18500, 'USD', '2026-03-28', '2026-07-24'),
('bbbbbbbb-0000-4000-8000-000000000002', 'Sistema de Inventario Andes', 'ERP ligero de inventario multi-sucursal con sincronización en tiempo real y reportes.', 'terceros', 'aaaaaaaa-0000-4000-8000-000000000002', 'Grupo Andes Retail', 'Diego Fernández', 'Martín Torres', 'En mantenimiento', 'Media', '2025-09-01', '2026-01-20', '2026-02-01', 24000, 'USD', '2025-08-20', '2026-07-20'),
('bbbbbbbb-0000-4000-8000-000000000003', 'Turnos Nova Salud', 'Sistema de gestión de turnos médicos con historia clínica básica y recordatorios automáticos.', 'terceros', 'aaaaaaaa-0000-4000-8000-000000000003', 'Clínica Nova Salud', 'Dra. Paula Giménez', 'Sofía Ramírez', 'Bloqueado', 'Crítica', '2026-05-15', '2026-09-15', null, 15000, 'USD', '2026-05-02', '2026-07-10'),
('bbbbbbbb-0000-4000-8000-000000000004', 'Automatización Contable Ferreyra', 'Bot de automatización que concilia extractos bancarios y genera asientos contables.', 'terceros', 'aaaaaaaa-0000-4000-8000-000000000004', 'Estudio Contable Ferreyra', 'Luis Ferreyra', 'Martín Torres', 'Implementado', 'Baja', '2026-02-10', '2026-05-01', '2026-05-06', 6800, 'USD', '2026-01-30', '2026-07-06'),
('bbbbbbbb-0000-4000-8000-000000000005', 'Digital Amenities · CRM Interno', 'Producto propio: CRM ligero para gestionar leads y propuestas de la agencia.', 'propio', null, 'Digital Amenities', 'Equipo interno', 'Sofía Ramírez', 'En pruebas', 'Media', '2026-06-01', '2026-08-15', null, 0, 'USD', '2026-05-25', '2026-07-25'),
('bbbbbbbb-0000-4000-8000-000000000006', 'Landing IA Digital Amenities', 'Producto propio: generador de landing pages con IA para vender como servicio recurrente.', 'propio', null, 'Digital Amenities', 'Equipo interno', 'Martín Torres', 'Idea', 'Baja', null, null, null, 0, 'USD', '2026-07-18', '2026-07-18'),
('bbbbbbbb-0000-4000-8000-000000000007', 'App Fidelidad Andes', 'Programa de fidelidad con puntos y cupones integrado al sistema de inventario existente.', 'terceros', 'aaaaaaaa-0000-4000-8000-000000000002', 'Grupo Andes Retail', 'Diego Fernández', 'Sofía Ramírez', 'Presupuestado', 'Media', null, '2026-10-30', null, 11200, 'USD', '2026-07-08', '2026-07-15');


-- ---------------------------------------------------------------------
-- Desarrollo
-- ---------------------------------------------------------------------
insert into project_development (project_id, stage, progress, next_goal, last_update) values
('bbbbbbbb-0000-4000-8000-000000000001', 'Integración de pagos', 62, 'Cerrar pasarela de pagos y flujo de confirmación', '2026-07-24'),
('bbbbbbbb-0000-4000-8000-000000000002', 'En producción', 100, 'Módulo de predicción de stock (fase 2)', '2026-07-20'),
('bbbbbbbb-0000-4000-8000-000000000003', 'Definición de historia clínica', 35, 'Recibir requisitos legales de manejo de datos', '2026-07-10'),
('bbbbbbbb-0000-4000-8000-000000000004', 'Entregado', 100, 'Activar mantenimiento mensual', '2026-07-06'),
('bbbbbbbb-0000-4000-8000-000000000005', 'QA interno', 78, 'Lanzar versión interna 1.0', '2026-07-25'),
('bbbbbbbb-0000-4000-8000-000000000006', 'Conceptualización', 5, 'Validar demanda con 5 clientes actuales', '2026-07-18'),
('bbbbbbbb-0000-4000-8000-000000000007', 'Esperando aprobación de presupuesto', 0, 'Firmar propuesta', '2026-07-15');


-- ---------------------------------------------------------------------
-- Tareas / pendientes
-- ---------------------------------------------------------------------
insert into project_tasks (project_id, kind, title) values
('bbbbbbbb-0000-4000-8000-000000000001', 'interno', 'Terminar webhook de Stripe'),
('bbbbbbbb-0000-4000-8000-000000000001', 'interno', 'QA del calendario de disponibilidad'),
('bbbbbbbb-0000-4000-8000-000000000001', 'cliente', 'Enviar textos legales'),
('bbbbbbbb-0000-4000-8000-000000000001', 'cliente', 'Aprobar diseño del email de confirmación'),
('bbbbbbbb-0000-4000-8000-000000000002', 'interno', 'Optimizar consultas de reportes'),
('bbbbbbbb-0000-4000-8000-000000000003', 'interno', 'Modelar entidad paciente'),
('bbbbbbbb-0000-4000-8000-000000000003', 'cliente', 'Definir permisos por rol médico'),
('bbbbbbbb-0000-4000-8000-000000000003', 'cliente', 'Enviar política de datos'),
('bbbbbbbb-0000-4000-8000-000000000003', 'bloqueador', 'Falta aprobación legal del área de compliance'),
('bbbbbbbb-0000-4000-8000-000000000004', 'cliente', 'Confirmar arranque de mantenimiento'),
('bbbbbbbb-0000-4000-8000-000000000005', 'interno', 'Testear pipeline de leads'),
('bbbbbbbb-0000-4000-8000-000000000005', 'interno', 'Escribir documentación'),
('bbbbbbbb-0000-4000-8000-000000000006', 'interno', 'Armar prototipo de una página'),
('bbbbbbbb-0000-4000-8000-000000000007', 'cliente', 'Aprobar presupuesto');


-- ---------------------------------------------------------------------
-- Infraestructura
-- ---------------------------------------------------------------------
insert into project_infrastructure (project_id, production_url, staging_url, repo, deploy_platform, hosting, domain, domain_expiry, database, external_services, automations, tech_lead) values
('bbbbbbbb-0000-4000-8000-000000000001', 'https://reservas.costaserena.com', 'https://staging.reservas.costaserena.com', 'github.com/digital-amenities/costaserena-reservas', 'Vercel', 'Vercel + Supabase', 'costaserena.com', '2027-02-15', 'Supabase Postgres', array['Stripe','Resend','Cloudinary'], array['Email de confirmación','Recordatorio 24h antes del check-in'], 'Sofía Ramírez'),
('bbbbbbbb-0000-4000-8000-000000000002', 'https://inventario.andesretail.com', 'https://staging.inventario.andesretail.com', 'github.com/digital-amenities/andes-inventario', 'AWS', 'AWS ECS + RDS', 'andesretail.com', '2026-08-12', 'PostgreSQL (RDS)', array['Twilio','AWS S3'], array['Alerta de stock bajo','Reporte semanal por email'], 'Martín Torres'),
('bbbbbbbb-0000-4000-8000-000000000003', '', 'https://staging.turnos.novasalud.com', 'github.com/digital-amenities/nova-turnos', 'Vercel', 'Vercel + Neon', 'novasalud.com', '2026-11-30', 'Neon Postgres', array['Twilio'], array['Recordatorio de turno por SMS'], 'Sofía Ramírez'),
('bbbbbbbb-0000-4000-8000-000000000004', 'https://conciliador.estudioferreyra.com', '', 'github.com/digital-amenities/ferreyra-conciliador', 'Vercel', 'Vercel', 'estudioferreyra.com', '2026-08-05', 'Supabase Postgres', array['OpenAI'], array['Conciliación diaria automática'], 'Martín Torres'),
('bbbbbbbb-0000-4000-8000-000000000005', '', 'https://crm.digitalamenities.dev', 'github.com/digital-amenities/crm-interno', 'Vercel', 'Vercel + Neon', 'digitalamenities.dev', '2026-09-01', 'Neon Postgres', array['Resend'], array['Asignación automática de leads'], 'Sofía Ramírez'),
('bbbbbbbb-0000-4000-8000-000000000006', '', '', '', '', '', '', null, '', '{}', '{}', 'Martín Torres'),
('bbbbbbbb-0000-4000-8000-000000000007', '', '', '', '', '', '', null, '', '{}', '{}', 'Sofía Ramírez');


-- ---------------------------------------------------------------------
-- Costos de infraestructura
-- ---------------------------------------------------------------------
insert into infrastructure_costs (id, project_id, concept, amount, currency, frequency) values
('ffffffff-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Hosting Vercel Pro', 20, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'Supabase', 25, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Dominio', 15, 'USD', 'Anual'),
('ffffffff-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'AWS ECS', 90, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000002', 'RDS', 55, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000003', 'Neon', 19, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000004', 'OpenAI API', 30, 'USD', 'Mensual'),
('ffffffff-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000005', 'Neon', 19, 'USD', 'Mensual');


-- ---------------------------------------------------------------------
-- Mantenimiento
-- ---------------------------------------------------------------------
insert into project_maintenance (project_id, active, implementation_date, start_date, amount, currency, frequency, due_day, services, status, last_collected_date) values
('bbbbbbbb-0000-4000-8000-000000000001', false, null, null, 0, 'USD', 'Mensual', 1, '{}', 'Pausado', null),
('bbbbbbbb-0000-4000-8000-000000000002', true, '2026-02-01', '2026-03-01', 450, 'USD', 'Mensual', 5, array['Soporte prioritario','Backups diarios','Actualizaciones de seguridad'], 'Activo', '2026-07-05'),
('bbbbbbbb-0000-4000-8000-000000000003', false, null, null, 0, 'USD', 'Mensual', 1, '{}', 'Pausado', null),
('bbbbbbbb-0000-4000-8000-000000000004', false, '2026-05-06', null, 180, 'USD', 'Mensual', 10, array['Soporte por email','Ajustes de reglas'], 'Pausado', null),
('bbbbbbbb-0000-4000-8000-000000000005', false, null, null, 0, 'USD', 'Mensual', 1, '{}', 'Pausado', null),
('bbbbbbbb-0000-4000-8000-000000000006', false, null, null, 0, 'USD', 'Mensual', 1, '{}', 'Pausado', null),
('bbbbbbbb-0000-4000-8000-000000000007', false, null, null, 0, 'USD', 'Mensual', 1, '{}', 'Pausado', null);


-- ---------------------------------------------------------------------
-- Pagos
-- ---------------------------------------------------------------------
insert into payments (id, project_id, concept, amount, currency, due_date, paid_date, method, status, receipt, notes) values
('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Anticipo 40%', 7400, 'USD', '2026-04-10', '2026-04-11', 'Transferencia', 'Cobrado', 'REC-0041', ''),
('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'Cuota 2 - 30%', 5550, 'USD', '2026-07-15', '2026-07-16', 'Transferencia', 'Cobrado', 'REC-0058', ''),
('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Cuota final 30%', 5550, 'USD', '2026-08-30', null, null, 'Pendiente', null, 'Al entregar'),
('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'Pago total del proyecto', 24000, 'USD', '2026-02-01', '2026-02-03', 'Transferencia', 'Cobrado', 'REC-0022', ''),
('cccccccc-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000003', 'Anticipo 50%', 7500, 'USD', '2026-05-20', '2026-05-22', 'Transferencia', 'Cobrado', 'REC-0049', ''),
('cccccccc-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000003', 'Cuota 2', 3750, 'USD', '2026-07-01', null, null, 'Vencido', null, 'Retrasado por bloqueo del proyecto'),
('cccccccc-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000003', 'Cuota final', 3750, 'USD', '2026-09-15', null, null, 'Pendiente', null, ''),
('cccccccc-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000004', 'Anticipo 50%', 3400, 'USD', '2026-02-10', '2026-02-10', 'Mercado Pago', 'Cobrado', 'REC-0031', ''),
('cccccccc-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000004', 'Pago final', 3400, 'USD', '2026-05-06', '2026-05-08', 'Transferencia', 'Cobrado', 'REC-0050', ''),
('cccccccc-0000-4000-8000-000000000010', 'bbbbbbbb-0000-4000-8000-000000000007', 'Anticipo previsto 40%', 4480, 'USD', '2026-08-05', null, null, 'Pendiente', null, 'Sujeto a aprobación');


-- ---------------------------------------------------------------------
-- Cobros de mantenimiento ya realizados
-- ---------------------------------------------------------------------
insert into maintenance_charges (project_id, charged_on, amount, currency, method, receipt, notes) values
('bbbbbbbb-0000-4000-8000-000000000002', '2026-07-05', 450, 'USD', 'Transferencia', 'REC-0055', 'Mantenimiento de julio');


-- ---------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------
insert into notes (id, title, content, author, priority, tags, category, created_at, reminder_date, converted_to_project_id) values
('dddddddd-0000-4000-8000-000000000001', 'Idea: módulo de reseñas con IA', 'Agregar a Costa Serena un módulo que resuma las reseñas de huéspedes usando IA y sugiera mejoras.', 'Sofía Ramírez', 'Media', array['ia','upsell','costa-serena'], 'Idea', '2026-07-22', '2026-08-05', null),
('dddddddd-0000-4000-8000-000000000002', 'Reunión con Andes - fase 2 inventario', 'Diego quiere predicción de stock con ML. Presupuestar como proyecto aparte. Interesados también en app de fidelidad.', 'Martín Torres', 'Alta', array['andes','reunión','oportunidad'], 'Reunión', '2026-07-15', null, null),
('dddddddd-0000-4000-8000-000000000003', 'Recordatorio: renovar dominios', 'Varios dominios vencen en agosto (andesretail.com, estudioferreyra.com). Revisar renovación automática.', 'Sofía Ramírez', 'Crítica', array['infra','dominios'], 'Recordatorio', '2026-07-20', '2026-08-01', null),
('dddddddd-0000-4000-8000-000000000004', 'Mejora: dashboard de métricas para clientes', 'Ofrecer un panel de métricas white-label como add-on de mantenimiento. Posible ingreso recurrente extra.', 'Martín Torres', 'Baja', array['producto','recurrente'], 'Mejora', '2026-07-10', null, null);


-- ---------------------------------------------------------------------
-- Actividad
-- ---------------------------------------------------------------------
insert into activity (project_id, type, message, date) values
('bbbbbbbb-0000-4000-8000-000000000005', 'estado', 'CRM Interno pasó a "En pruebas"', '2026-07-25'),
('bbbbbbbb-0000-4000-8000-000000000001', 'pago', 'Cobro registrado: Cuota 2 - 30% ($5.550)', '2026-07-16'),
('bbbbbbbb-0000-4000-8000-000000000002', 'mantenimiento', 'Mantenimiento de julio cobrado ($450)', '2026-07-05'),
('bbbbbbbb-0000-4000-8000-000000000003', 'estado', 'Turnos Nova Salud pasó a "Bloqueado"', '2026-07-10'),
(null, 'nota', 'Nueva nota: Idea módulo de reseñas con IA', '2026-07-22'),
('bbbbbbbb-0000-4000-8000-000000000007', 'proyecto', 'Nuevo proyecto presupuestado: App Fidelidad Andes', '2026-07-08');


-- Reactivar el trigger para los proyectos que se creen desde la app
alter table projects enable trigger projects_init_children;
