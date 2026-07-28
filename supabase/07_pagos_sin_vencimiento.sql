-- =====================================================================
-- PASO 7 — Los pagos dejan de tener vencimiento
--
-- Un pago pasa a ser el registro de plata que YA entró: queda sólo la
-- fecha de cobro. Se van `due_date` y `status`, y con ellos el estado
-- "Vencido" y las alertas de atraso, que sin una fecha contra la cual
-- atrasarse no tienen cómo calcularse.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Los pagos sin fecha de cobro heredan su vencimiento, que era el único
-- dato de fecha que tenían.
--
-- ⚠️  Los que estaban en "Pendiente" quedan registrados como cobrados,
--     con la fecha en que vencían. Revisalos después de correr esto.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'due_date'
  ) then
    update public.payments
       set paid_date = coalesce(paid_date, due_date)
     where paid_date is null;
  end if;
end $$;

alter table public.payments drop column if exists due_date;
alter table public.payments drop column if exists status;

-- Sin vencimiento, un pago sin fecha de cobro no significa nada.
-- Si esto falla es porque quedó alguna fila sin fecha: completala a mano
-- y volvé a correr el script.
alter table public.payments alter column paid_date set not null;

-- Ya no lo usa ninguna columna.
drop type if exists payment_status;

-- Los índices de las columnas borradas se van con ellas; el de fecha de
-- cobro es el que pasa a ordenar la pantalla de Cobros.
drop index if exists payments_due_date_idx;
drop index if exists payments_status_idx;
create index if not exists payments_paid_date_idx on public.payments (paid_date desc);
