-- =====================================================================
-- PADEL COACH HUB – Migration 009 : SHOP & PADEL COINS
-- Monnaie de fidélité gagnée uniquement sur les séances payées et consommées,
-- boutique, commandes, stocks et contrôle budgétaire.
-- Indépendant des XP (Padel Legends inchangé). AJOUTS UNIQUEMENT.
-- Ré-exécutable sans risque. Le shop démarre DÉSACTIVÉ : aucun Coin n'est
-- émis tant que le coach ne l'a pas activé dans ses réglages.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Réglages financiers du coach
-- ---------------------------------------------------------------------
create table if not exists public.loyalty_settings (
  owner_id                uuid primary key references auth.users(id) on delete cascade,
  enabled                 boolean not null default false,
  start_date              date,                                   -- les séances antérieures ne rapportent pas de Coins
  coin_value              numeric(6,4) not null default 0.05 check (coin_value > 0),
  rate_cap_pct            numeric(5,2) not null default 5 check (rate_cap_pct between 0 and 10),
  rate_pct                numeric(5,2) not null default 5 check (rate_pct >= 0),
  urssaf_pct              numeric(5,2) not null default 25.8 check (urssaf_pct between 0 and 80),
  court_cost_per_hour     numeric(8,2) not null default 0 check (court_cost_per_hour >= 0),
  court_split             text not null default 'present' check (court_split in ('present','capacity')),
  other_cost_per_session  numeric(8,2) not null default 0 check (other_cost_per_session >= 0),
  other_cost_per_player   numeric(8,2) not null default 0 check (other_cost_per_player >= 0),
  safety_margin_pct       numeric(5,2) not null default 20 check (safety_margin_pct between 0 and 300),
  budget_alert_eur        numeric(8,2) not null default 20 check (budget_alert_eur >= 0),
  max_pending_orders      int not null default 3 check (max_pending_orders between 1 and 20),
  manual_max_coins        int not null default 200 check (manual_max_coins between 1 and 5000),
  updated_at              timestamptz not null default now(),
  check (rate_pct <= rate_cap_pct)
);

-- Coûts propres à un groupe (terrain, frais) ; vide = valeurs générales
create table if not exists public.loyalty_group_costs (
  group_id                uuid primary key references public.groups(id) on delete cascade,
  owner_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  court_cost_per_hour     numeric(8,2) check (court_cost_per_hour >= 0),
  other_cost_per_session  numeric(8,2) check (other_cost_per_session >= 0),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Portefeuilles et grand livre des Coins (écritures jamais modifiées)
-- ---------------------------------------------------------------------
create table if not exists public.coin_wallets (
  player_id     uuid primary key references public.players(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  balance       int not null default 0,
  earned_total  int not null default 0,
  spent_total   int not null default 0,
  updated_at    timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  kind        text not null check (kind in ('earn','earn_reversal','order','order_refund','adjust')),
  coins       int not null,
  source_key  text,                       -- session:<id> pour les gains
  euro_budget numeric(10,4) not null default 0,   -- budget fidélité correspondant (€)
  details     jsonb not null default '{}',        -- détail du calcul (prix, URSSAF, terrain…)
  label       text not null,
  order_id    uuid,
  reason      text,
  created_by  uuid,
  op_id       uuid,
  created_at  timestamptz not null default now(),
  check ((kind = 'earn' and coins >= 0) or (kind = 'earn_reversal' and coins <= 0) or (kind = 'order' and coins < 0)
         or (kind = 'order_refund' and coins > 0) or (kind = 'adjust' and coins <> 0))
);
create index if not exists coin_tx_player_idx on public.coin_transactions(player_id, created_at desc);
create index if not exists coin_tx_key_idx on public.coin_transactions(player_id, source_key);
create unique index if not exists coin_tx_op_uniq on public.coin_transactions(op_id, kind) where op_id is not null;

create or replace function app_private._coin_immutable() returns trigger language plpgsql as $$
begin raise exception 'Écriture comptable non modifiable : passer une écriture compensatoire'; end $$;
drop trigger if exists trg_coin_immutable on public.coin_transactions;
create trigger trg_coin_immutable before update on public.coin_transactions for each row execute function app_private._coin_immutable();

-- ---------------------------------------------------------------------
-- 3. Catalogue, variantes, commandes
-- ---------------------------------------------------------------------
create table if not exists public.shop_products (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                 text not null,
  description          text,
  category             text not null default 'equipement' check (category in ('equipement','textile','numerique','evenement','autre')),
  image_path           text,
  price_coins          int not null check (price_coins > 0),
  unit_cost            numeric(10,2) not null default 0 check (unit_cost >= 0),   -- coût d'achat réel
  extra_cost           numeric(10,2) not null default 0 check (extra_cost >= 0),  -- personnalisation, port…
  commercial_value     numeric(10,2) check (commercial_value >= 0),              -- valeur de vente (information)
  rarity               text not null default 'commun' check (rarity in ('commun','rare','epique','legendaire')),
  is_ambassador        boolean not null default false,
  min_level            int check (min_level between 1 and 20),
  stock                int check (stock >= 0),            -- vide = illimité (récompense numérique)
  low_stock_threshold  int not null default 2 check (low_stock_threshold >= 0),
  active               boolean not null default false,
  sort                 int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.shop_product_variants (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  uuid not null references public.shop_products(id) on delete cascade,
  label       text not null,
  stock       int check (stock >= 0),
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','validated','ready','delivered','cancelled')),
  total_coins    int not null check (total_coins > 0),
  total_cost     numeric(10,2) not null default 0,
  op_id          uuid not null unique,
  note           text,
  cancel_reason  text,
  created_at     timestamptz not null default now(),
  validated_at   timestamptz,
  ready_at       timestamptz,
  delivered_at   timestamptz,
  cancelled_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists shop_orders_owner_idx on public.shop_orders(owner_id, status, created_at desc);

create table if not exists public.shop_order_items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  order_id       uuid not null references public.shop_orders(id) on delete cascade,
  product_id     uuid references public.shop_products(id) on delete set null,
  variant_id     uuid references public.shop_product_variants(id) on delete set null,
  product_name   text not null,
  variant_label  text,
  qty            int not null check (qty between 1 and 10),
  unit_coins     int not null,
  unit_cost      numeric(10,2) not null
);

create table if not exists public.loyalty_audit (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  player_id   uuid references public.players(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}',
  reason      text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_audit_owner_idx on public.loyalty_audit(owner_id, created_at desc);

drop trigger if exists trg_shop_products_touch on public.shop_products;
create trigger trg_shop_products_touch before update on public.shop_products for each row execute function app_private._touch_updated_at();
drop trigger if exists trg_loyalty_settings_touch on public.loyalty_settings;
create trigger trg_loyalty_settings_touch before update on public.loyalty_settings for each row execute function app_private._touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Sécurité (RLS)
--    • Réglages, coûts, catalogue : le coach les gère directement.
--    • Portefeuilles, écritures, commandes : lecture seule ; écriture uniquement par les fonctions serveur.
--    • Les joueurs ne voient JAMAIS le coût d'achat : le catalogue leur est servi par une fonction.
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['loyalty_settings','loyalty_group_costs','shop_products','shop_product_variants'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists coach_all on public.%I', t);
    execute format('create policy coach_all on public.%I for all to authenticated using (owner_id = auth.uid() and (select app_private.is_coach())) with check (owner_id = auth.uid() and (select app_private.is_coach()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['coin_wallets','coin_transactions','shop_orders','shop_order_items','loyalty_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists coach_read on public.%I', t);
    execute format('create policy coach_read on public.%I for select to authenticated using (owner_id = auth.uid() and (select app_private.is_coach()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
revoke delete on public.loyalty_settings from authenticated;
drop policy if exists player_read on public.coin_wallets;
create policy player_read on public.coin_wallets for select to authenticated using (player_id = (select app_private.my_player_id()));
drop policy if exists player_read on public.coin_transactions;
create policy player_read on public.coin_transactions for select to authenticated using (player_id = (select app_private.my_player_id()));
drop policy if exists player_read on public.shop_orders;
create policy player_read on public.shop_orders for select to authenticated using (player_id = (select app_private.my_player_id()));
drop policy if exists player_read on public.shop_order_items;
create policy player_read on public.shop_order_items for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = order_id and o.player_id = (select app_private.my_player_id())));

-- ---------------------------------------------------------------------
-- 5. MOTEUR DE CALCUL DES COINS
-- ---------------------------------------------------------------------
create or replace function app_private.loyal_ensure(p_owner uuid) returns public.loyalty_settings
language plpgsql security definer set search_path = public as $$
declare s public.loyalty_settings;
begin
  insert into public.loyalty_settings(owner_id) values (p_owner) on conflict do nothing;
  select * into s from public.loyalty_settings where owner_id = p_owner;
  return s;
end $$;

-- Montant réellement payé pour une séance consommée (prix du forfait ÷ nombre de séances, remboursements déduits)
create or replace function app_private.coins_paid_value(p_session uuid, p_player uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(-t.delta * (k.price / k.total_credits)), 0)::numeric
  from public.credit_transactions t join public.packages k on k.id = t.package_id
  where t.session_id = p_session and t.player_id = p_player and t.kind in ('consume','refund') and k.price > 0
$$;

-- Calcul détaillé pour une séance et un joueur, avec les réglages actuels
create or replace function app_private.coins_compute(p_session uuid, p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; st public.loyalty_settings; gc public.loyalty_group_costs; v_paid numeric; v_dur numeric; v_n int;
        v_court_h numeric; v_other numeric; v_urssaf numeric; v_court numeric; v_other_share numeric; v_avail numeric; v_budget numeric; v_coins int;
begin
  select se.*, g.capacity, g.name gname into s from public.sessions se join public.groups g on g.id = se.group_id where se.id = p_session;
  select * into st from public.loyalty_settings where owner_id = s.owner_id;
  select * into gc from public.loyalty_group_costs where group_id = s.group_id;
  v_paid := round(app_private.coins_paid_value(p_session, p_player), 2);
  v_dur := extract(epoch from (s.end_time - s.start_time)) / 3600.0;
  v_n := greatest(1, case when st.court_split = 'capacity' then s.capacity
           else (select count(*) from public.session_attendances where session_id = p_session and status = 'present') end);
  v_court_h := coalesce(gc.court_cost_per_hour, st.court_cost_per_hour);
  v_other := coalesce(gc.other_cost_per_session, st.other_cost_per_session);
  v_urssaf := round(v_paid * st.urssaf_pct / 100, 2);
  v_court := round(v_court_h * v_dur / v_n, 2);
  v_other_share := round(v_other / v_n + st.other_cost_per_player, 2);
  v_avail := v_paid - v_urssaf - v_court - v_other_share;
  v_budget := greatest(0, round(v_avail * st.rate_pct / 100, 4));
  v_coins := floor(v_budget / st.coin_value)::int;
  return jsonb_build_object('paid', v_paid, 'urssaf', v_urssaf, 'urssaf_pct', st.urssaf_pct, 'court', v_court, 'court_per_hour', v_court_h,
    'duration_h', round(v_dur, 2), 'players', v_n, 'other', v_other_share, 'available', round(v_avail, 2), 'rate_pct', st.rate_pct,
    'budget', v_budget, 'coin_value', st.coin_value, 'coins', v_coins, 'group', s.gname, 'date', s.session_date);
end $$;

-- Recalcule le portefeuille à partir du grand livre (source de vérité)
create or replace function app_private.coins_refresh_wallet(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.players where id = p_player;
  if v_owner is null then return; end if;
  insert into public.coin_wallets as w(player_id, owner_id, balance, earned_total, spent_total, updated_at)
  select p_player, v_owner, coalesce(sum(coins), 0),
         coalesce(sum(coins) filter (where kind in ('earn','earn_reversal','adjust')), 0),
         coalesce(-sum(coins) filter (where kind in ('order','order_refund')), 0), now()
  from public.coin_transactions where player_id = p_player
  on conflict (player_id) do update set balance = excluded.balance, earned_total = excluded.earned_total,
    spent_total = excluded.spent_total, updated_at = now();
end $$;

-- Gains : une écriture par séance payée et consommée ; écriture compensatoire si elle ne l'est plus
create or replace function app_private.coins_sync_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl record; st public.loyalty_settings; r record; c jsonb; v_total int := 0;
begin
  select id, owner_id, user_id into pl from public.players where id = p_player;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('coins:' || p_player::text));
  st := app_private.loyal_ensure(pl.owner_id);

  for r in
    with cand as (   -- séances validées, joueur présent, payées (crédit de forfait consommé)
      select s.id, s.session_date from public.session_attendances sa join public.sessions s on s.id = sa.session_id
      where sa.player_id = p_player and sa.status = 'present' and s.status = 'validated' and s.validated_at is not null
        and app_private.coins_paid_value(s.id, p_player) > 0),
    led as (         -- état actuel par séance dans le grand livre
      select source_key, (array_agg(kind order by created_at desc, id))[1] last_kind, sum(coins)::int net, sum(euro_budget) net_eur
      from public.coin_transactions where player_id = p_player and kind in ('earn','earn_reversal') group by source_key)
    select coalesce('session:' || cand.id, led.source_key) key, cand.id session_id, cand.session_date,
           coalesce(led.last_kind = 'earn', false) awarded, coalesce(led.net, 0) net, coalesce(led.net_eur, 0) net_eur, cand.id is not null qualifies
    from cand full join led on led.source_key = 'session:' || cand.id
  loop
    if r.qualifies and not r.awarded then
      if st.enabled and st.start_date is not null and r.session_date >= st.start_date then
        c := app_private.coins_compute(r.session_id, p_player);
        insert into public.coin_transactions(owner_id, player_id, kind, coins, source_key, euro_budget, details, label)
        values (pl.owner_id, p_player, 'earn', (c ->> 'coins')::int, r.key, (c ->> 'budget')::numeric, c,
                'Séance ' || (c ->> 'group') || ' du ' || to_char(r.session_date, 'DD/MM'));
        v_total := v_total + (c ->> 'coins')::int;
      end if;
    elsif not r.qualifies and r.awarded then
      insert into public.coin_transactions(owner_id, player_id, kind, coins, source_key, euro_budget, label, reason)
      values (pl.owner_id, p_player, 'earn_reversal', -r.net, r.key, -r.net_eur, 'Annulation de gain',
              'Séance corrigée : absence, remboursement du crédit ou validation annulée');
    end if;
  end loop;
  perform app_private.coins_refresh_wallet(p_player);
end $$;

create or replace function app_private.coins_sync_safe(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_player is null then return; end if;
  perform app_private.coins_sync_player(p_player);
exception when others then
  raise warning 'Padel Coins : calcul impossible pour %: %', p_player, sqlerrm;
end $$;

-- Déclencheurs (une erreur ici ne bloque jamais la validation d'une séance)
create or replace function app_private._coins_att_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform app_private.coins_sync_safe(old.player_id);
  elsif tg_op = 'INSERT' or new.status <> old.status then perform app_private.coins_sync_safe(new.player_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_coins_att on public.session_attendances;
create trigger trg_coins_att after insert or update of status or delete on public.session_attendances
for each row execute function app_private._coins_att_trg();

create or replace function app_private._coins_credit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.session_id is not null and new.kind in ('consume','refund') then perform app_private.coins_sync_safe(new.player_id); end if;
  return null;
end $$;
drop trigger if exists trg_coins_credit on public.credit_transactions;
create trigger trg_coins_credit after insert on public.credit_transactions
for each row execute function app_private._coins_credit_trg();

create or replace function app_private._coins_session_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if (new.status, new.validated_at) is distinct from (old.status, old.validated_at) then
    for v in select player_id from public.session_attendances where session_id = new.id loop
      perform app_private.coins_sync_safe(v);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_coins_session on public.sessions;
create trigger trg_coins_session after update on public.sessions
for each row execute function app_private._coins_session_trg();

-- ---------------------------------------------------------------------
-- 6. Espace joueur : portefeuille, catalogue (sans coûts), commandes
-- ---------------------------------------------------------------------
create or replace function public.shop_player_space(p_player uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coach bool := app_private.is_coach(); v_pid uuid; pl record; st public.loyalty_settings; w public.coin_wallets; v_level int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  v_pid := case when v_coach and p_player is not null then p_player else app_private.my_player_id() end;
  if v_pid is null then raise exception 'Aucun profil joueur lié à ce compte'; end if;
  select id, owner_id, first_name, last_name into pl from public.players where id = v_pid;
  if not found or (v_coach and pl.owner_id <> auth.uid()) then raise exception 'Joueur introuvable'; end if;
  st := app_private.loyal_ensure(pl.owner_id);
  perform app_private.coins_refresh_wallet(v_pid);
  select * into w from public.coin_wallets where player_id = v_pid;
  select coalesce(level, 1) into v_level from public.player_gamification_profiles where player_id = v_pid;
  return jsonb_build_object(
    'player', jsonb_build_object('id', pl.id, 'name', trim(pl.first_name || ' ' || pl.last_name), 'level', coalesce(v_level, 1)),
    'enabled', st.enabled, 'coin_value', st.coin_value,
    'wallet', jsonb_build_object('balance', coalesce(w.balance, 0), 'earned', coalesce(w.earned_total, 0), 'spent', coalesce(w.spent_total, 0),
              'pending', (select coalesce(sum(total_coins), 0) from public.shop_orders where player_id = v_pid and status in ('pending','validated','ready'))),
    'history', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, kind, coins, label, reason, created_at, order_id, details ->> 'paid' paid from public.coin_transactions
        where player_id = v_pid and not (kind = 'earn' and coins = 0) order by created_at desc limit 100) x), '[]'),
    'avg_coins_per_session', (select round(avg(coins), 1) from public.coin_transactions where owner_id = pl.owner_id and kind = 'earn'
        and created_at >= now() - interval '120 days'),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'category', p.category,
          'image_path', p.image_path, 'price_coins', p.price_coins, 'rarity', p.rarity, 'is_ambassador', p.is_ambassador, 'min_level', p.min_level,
          'in_stock', case when exists (select 1 from public.shop_product_variants v where v.product_id = p.id and v.active)
                           then exists (select 1 from public.shop_product_variants v where v.product_id = p.id and v.active and coalesce(v.stock, 1) > 0)
                           else coalesce(p.stock, 1) > 0 end,
          'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', v.label, 'in_stock', coalesce(v.stock, 1) > 0) order by v.sort, v.label)
                                from public.shop_product_variants v where v.product_id = p.id and v.active), '[]'))
        order by p.is_ambassador desc, p.sort, p.price_coins)
      from public.shop_products p where p.owner_id = pl.owner_id and p.active), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'total_coins', o.total_coins, 'created_at', o.created_at,
          'delivered_at', o.delivered_at, 'cancel_reason', o.cancel_reason,
          'items', (select jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'qty', i.qty, 'product_id', i.product_id)) from public.shop_order_items i where i.order_id = o.id))
        order by o.created_at desc) from public.shop_orders o where o.player_id = v_pid), '[]')
  );
end $$;
revoke all on function public.shop_player_space(uuid) from public, anon;
grant execute on function public.shop_player_space(uuid) to authenticated;

-- Commande : solde, stock et niveau vérifiés ; Coins et stock réservés dans la même transaction
create or replace function public.shop_place_order(p_op uuid, p_product uuid, p_variant uuid default null, p_qty int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := app_private.my_player_id(); pl record; st public.loyalty_settings; p public.shop_products; v public.shop_product_variants;
        w public.coin_wallets; v_r jsonb; v_level int; v_total int; v_order uuid; v_has_var bool; v_pending int;
begin
  if p_op is null then raise exception 'Clé d''opération manquante'; end if;
  if v_pid is null then raise exception 'Réservé aux joueurs'; end if;
  v_r := app_private._op_begin(p_op, 'shop_order'); if v_r is not null then return v_r; end if;
  select id, owner_id, user_id, first_name, last_name into pl from public.players where id = v_pid;
  st := app_private.loyal_ensure(pl.owner_id);
  if not st.enabled then raise exception 'La boutique n''est pas encore ouverte'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'Quantité invalide'; end if;

  -- 1. verrous (portefeuille puis produit) : deux commandes simultanées ne peuvent pas dépenser les mêmes Coins
  perform app_private.coins_refresh_wallet(v_pid);
  select * into w from public.coin_wallets where player_id = v_pid for update;
  select * into p from public.shop_products where id = p_product and owner_id = pl.owner_id for update;
  if not found or not p.active then raise exception 'Produit indisponible'; end if;
  v_has_var := exists (select 1 from public.shop_product_variants where product_id = p.id and active);
  if v_has_var then
    select * into v from public.shop_product_variants where id = p_variant and product_id = p.id and active for update;
    if not found then raise exception 'Choisis une option (taille, couleur…)'; end if;
  end if;

  -- 2. conditions
  select count(*) into v_pending from public.shop_orders where player_id = v_pid and status in ('pending','validated','ready');
  if v_pending >= st.max_pending_orders then raise exception 'Tu as déjà % commande(s) en cours : attends leur remise', v_pending; end if;
  select coalesce(level, 1) into v_level from public.player_gamification_profiles where player_id = v_pid;
  if p.min_level is not null and coalesce(v_level, 1) < p.min_level then raise exception 'Niveau Padel Legends % requis', p.min_level; end if;
  if v_has_var then
    if v.stock is not null and v.stock < p_qty then raise exception 'Stock insuffisant'; end if;
  elsif p.stock is not null and p.stock < p_qty then raise exception 'Stock insuffisant'; end if;
  v_total := p.price_coins * p_qty;
  if coalesce(w.balance, 0) < v_total then raise exception 'Solde insuffisant : % Coins disponibles, % nécessaires', coalesce(w.balance, 0), v_total; end if;

  -- 3. réservation atomique
  insert into public.shop_orders(owner_id, player_id, total_coins, total_cost, op_id)
  values (pl.owner_id, v_pid, v_total, (p.unit_cost + p.extra_cost) * p_qty, p_op) returning id into v_order;
  insert into public.shop_order_items(owner_id, order_id, product_id, variant_id, product_name, variant_label, qty, unit_coins, unit_cost)
  values (pl.owner_id, v_order, p.id, case when v_has_var then v.id end, p.name, case when v_has_var then v.label end, p_qty, p.price_coins, p.unit_cost + p.extra_cost);
  insert into public.coin_transactions(owner_id, player_id, kind, coins, label, order_id, op_id, created_by)
  values (pl.owner_id, v_pid, 'order', -v_total, 'Commande · ' || p.name || coalesce(' (' || v.label || ')', ''), v_order, p_op, auth.uid());
  if v_has_var then
    if v.stock is not null then update public.shop_product_variants set stock = stock - p_qty where id = v.id; end if;
  elsif p.stock is not null then update public.shop_products set stock = stock - p_qty where id = p.id; end if;
  perform app_private.coins_refresh_wallet(v_pid);
  select * into w from public.coin_wallets where player_id = v_pid;
  if w.balance < 0 then raise exception 'Solde insuffisant'; end if;   -- garde-fou ultime

  insert into public.loyalty_audit(owner_id, player_id, action, details)
  values (pl.owner_id, v_pid, 'order_placed', jsonb_build_object('order', v_order, 'product', p.name, 'coins', v_total));
  perform app_private.notify(pl.owner_id, pl.owner_id, 'shop_order', 'Nouvelle commande boutique',
    trim(pl.first_name || ' ' || pl.last_name) || ' · ' || p.name || ' (' || v_total || ' Coins)', '/shop?tab=orders');
  return app_private._op_end(p_op, jsonb_build_object('status', 'ok', 'order_id', v_order, 'balance', w.balance));
end $$;
revoke all on function public.shop_place_order(uuid, uuid, uuid, int) from public, anon;
grant execute on function public.shop_place_order(uuid, uuid, uuid, int) to authenticated;

-- Suivi d'une commande (coach) ou annulation (coach, ou joueur tant qu'elle est en attente)
create or replace function public.shop_update_order(p_op uuid, p_order uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.shop_orders; v_coach bool := app_private.is_coach(); v_r jsonb; i record; v_user uuid; v_title text;
begin
  if p_op is null then raise exception 'Clé d''opération manquante'; end if;
  v_r := app_private._op_begin(p_op, 'shop_order_status'); if v_r is not null then return v_r; end if;
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_coach then
    if o.owner_id <> auth.uid() then raise exception 'Commande introuvable'; end if;
  elsif o.player_id is distinct from app_private.my_player_id() or p_status <> 'cancelled' or o.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée par le joueur';
  end if;
  if o.status in ('delivered','cancelled') then raise exception 'Commande déjà %', case when o.status = 'delivered' then 'remise' else 'annulée' end; end if;
  if p_status not in ('validated','ready','delivered','cancelled') then raise exception 'Statut invalide'; end if;

  if p_status = 'cancelled' then
    -- restitution des Coins et du stock (écriture compensatoire)
    insert into public.coin_transactions(owner_id, player_id, kind, coins, label, order_id, reason, op_id, created_by)
    values (o.owner_id, o.player_id, 'order_refund', o.total_coins, 'Remboursement · commande annulée', o.id, nullif(trim(p_reason), ''), p_op, auth.uid());
    for i in select * from public.shop_order_items where order_id = o.id loop
      if i.variant_id is not null then update public.shop_product_variants set stock = stock + i.qty where id = i.variant_id and stock is not null;
      elsif i.product_id is not null then update public.shop_products set stock = stock + i.qty where id = i.product_id and stock is not null; end if;
    end loop;
    update public.shop_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), ''), updated_at = now() where id = o.id;
    perform app_private.coins_refresh_wallet(o.player_id);
  else
    update public.shop_orders set status = p_status, updated_at = now(),
      validated_at = case when p_status in ('validated','ready','delivered') then coalesce(validated_at, now()) else validated_at end,
      ready_at = case when p_status in ('ready','delivered') then coalesce(ready_at, now()) else ready_at end,
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end
    where id = o.id;
  end if;
  insert into public.loyalty_audit(owner_id, player_id, action, details, reason)
  values (o.owner_id, o.player_id, 'order_' || p_status, jsonb_build_object('order', o.id, 'coins', o.total_coins, 'cost', o.total_cost), nullif(trim(p_reason), ''));

  select user_id into v_user from public.players where id = o.player_id;
  v_title := case p_status when 'validated' then 'Commande validée ✅' when 'ready' then 'Ta récompense est prête 🎁'
             when 'delivered' then 'Récompense remise 🎉' else 'Commande annulée' end;
  if v_coach then
    perform app_private.notify(o.owner_id, v_user, 'shop_order', v_title,
      case when p_status = 'cancelled' then o.total_coins || ' Coins t''ont été restitués' || coalesce(' · ' || nullif(trim(p_reason), ''), '')
           when p_status = 'ready' then 'Récupère-la auprès de ton coach au prochain entraînement.' else 'Suivi dans ta boutique.' end, '/shop?tab=orders');
  else
    perform app_private.notify(o.owner_id, o.owner_id, 'shop_order', 'Commande annulée par le joueur', o.total_coins || ' Coins restitués', '/shop?tab=orders');
  end if;
  return app_private._op_end(p_op, jsonb_build_object('status', 'ok'));
end $$;
revoke all on function public.shop_update_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.shop_update_order(uuid, uuid, text, text) to authenticated;

-- Ajustement manuel (geste commercial, correction) : motivé, plafonné, journalisé, jamais de solde négatif
create or replace function public.shop_adjust_coins(p_op uuid, p_player uuid, p_coins int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); st public.loyalty_settings; w public.coin_wallets; v_r jsonb; v_n int;
begin
  if not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  if p_op is null then raise exception 'Clé d''opération manquante'; end if;
  v_r := app_private._op_begin(p_op, 'shop_adjust'); if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.players where id = p_player and owner_id = v_owner) then raise exception 'Joueur introuvable'; end if;
  st := app_private.loyal_ensure(v_owner);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Indique un motif (5 caractères minimum)'; end if;
  if p_coins = 0 or abs(p_coins) > st.manual_max_coins then raise exception 'Montant entre 1 et % Coins', st.manual_max_coins; end if;
  select count(*) into v_n from public.coin_transactions where player_id = p_player and kind = 'adjust' and created_at >= now() - interval '24 hours';
  if v_n >= 3 then raise exception 'Limite atteinte : 3 ajustements par joueur et par 24 h'; end if;
  perform app_private.coins_refresh_wallet(p_player);
  select * into w from public.coin_wallets where player_id = p_player for update;
  if coalesce(w.balance, 0) + p_coins < 0 then raise exception 'Le solde ne peut pas devenir négatif (solde actuel : %)', coalesce(w.balance, 0); end if;
  insert into public.coin_transactions(owner_id, player_id, kind, coins, euro_budget, label, reason, op_id, created_by)
  values (v_owner, p_player, 'adjust', p_coins, p_coins * st.coin_value, case when p_coins > 0 then 'Geste du coach' else 'Correction du coach' end,
          trim(p_reason), p_op, auth.uid());
  perform app_private.coins_refresh_wallet(p_player);
  insert into public.loyalty_audit(owner_id, player_id, action, details, reason) values (v_owner, p_player, 'coins_adjusted', jsonb_build_object('coins', p_coins), trim(p_reason));
  return app_private._op_end(p_op, jsonb_build_object('status', 'ok'));
end $$;
revoke all on function public.shop_adjust_coins(uuid, uuid, int, text) from public, anon;
grant execute on function public.shop_adjust_coins(uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Tableau de bord coach et contrôle budgétaire
-- ---------------------------------------------------------------------
create or replace function public.shop_coach_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); st public.loyalty_settings; v_gen numeric; v_deliv numeric; v_commit numeric; v_circ int;
begin
  if v_owner is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  st := app_private.loyal_ensure(v_owner);
  select coalesce(sum(euro_budget), 0) into v_gen from public.coin_transactions where owner_id = v_owner and kind in ('earn','earn_reversal','adjust');
  select coalesce(sum(total_cost) filter (where status = 'delivered'), 0), coalesce(sum(total_cost) filter (where status in ('pending','validated','ready')), 0)
    into v_deliv, v_commit from public.shop_orders where owner_id = v_owner;
  select coalesce(sum(coins), 0) into v_circ from public.coin_transactions where owner_id = v_owner;
  return jsonb_build_object(
    'settings', to_jsonb(st),
    'kpis', jsonb_build_object(
      'coins_issued', (select coalesce(sum(coins), 0) from public.coin_transactions where owner_id = v_owner and kind in ('earn','earn_reversal','adjust')),
      'coins_spent', (select coalesce(-sum(coins), 0) from public.coin_transactions where owner_id = v_owner and kind in ('order','order_refund')),
      'coins_circulation', v_circ,
      'circulation_value', round(v_circ * st.coin_value, 2),
      'budget_generated', round(v_gen, 2),
      'delivered_cost', v_deliv, 'committed_cost', v_commit,
      'budget_remaining', round(v_gen - v_deliv - v_commit, 2),
      'paid_sessions', (select count(*) from public.coin_transactions where owner_id = v_owner and kind = 'earn'),
      'avg_coins_per_session', (select round(avg(coins), 1) from public.coin_transactions where owner_id = v_owner and kind = 'earn' and created_at >= now() - interval '120 days'),
      'negative_wallets', (select count(*) from public.coin_wallets where owner_id = v_owner and balance < 0),
      'pending_orders', (select count(*) from public.shop_orders where owner_id = v_owner and status in ('pending','validated','ready'))),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'total_coins', o.total_coins, 'total_cost', o.total_cost,
          'created_at', o.created_at, 'delivered_at', o.delivered_at, 'cancel_reason', o.cancel_reason, 'player_id', o.player_id,
          'player', trim(p.first_name || ' ' || p.last_name),
          'items', (select jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'qty', i.qty)) from public.shop_order_items i where i.order_id = o.id))
        order by (o.status in ('pending','validated','ready')) desc, o.created_at desc)
      from (select * from public.shop_orders where owner_id = v_owner order by created_at desc limit 150) o join public.players p on p.id = o.player_id), '[]'),
    'products', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort, x.name) from (
        select pr.*, (select coalesce(sum(i.qty), 0) from public.shop_order_items i join public.shop_orders o on o.id = i.order_id
                       where i.product_id = pr.id and o.status = 'delivered') delivered_qty,
               coalesce((select jsonb_agg(to_jsonb(v) order by v.sort, v.label) from public.shop_product_variants v where v.product_id = pr.id), '[]') variants
        from public.shop_products pr where pr.owner_id = v_owner) x), '[]'),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('player_id', p.id, 'name', trim(p.first_name || ' ' || p.last_name),
          'balance', coalesce(w.balance, 0), 'earned', coalesce(w.earned_total, 0), 'spent', coalesce(w.spent_total, 0)) order by coalesce(w.balance, 0) desc, p.last_name)
        from public.players p left join public.coin_wallets w on w.player_id = p.id where p.owner_id = v_owner and p.archived_at is null), '[]'),
    'ledger', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
        select c.id, c.kind, c.coins, c.label, c.reason, c.euro_budget, c.details, c.created_at, trim(p.first_name || ' ' || p.last_name) player
        from public.coin_transactions c join public.players p on p.id = c.player_id where c.owner_id = v_owner order by c.created_at desc limit 120) t), '[]'),
    'group_costs', coalesce((select jsonb_agg(jsonb_build_object('group_id', g.id, 'name', g.name, 'capacity', g.capacity, 'start_time', g.start_time, 'end_time', g.end_time,
          'court_cost_per_hour', gc.court_cost_per_hour, 'other_cost_per_session', gc.other_cost_per_session) order by g.weekday, g.start_time)
        from public.groups g left join public.loyalty_group_costs gc on gc.group_id = g.id where g.owner_id = v_owner and g.status <> 'archived'), '[]'),
    'package_prices', jsonb_build_object(
        'without_price', (select count(*) from public.packages where owner_id = v_owner and coalesce(price, 0) = 0),
        'avg_session_price', (select round(avg(price / total_credits), 2) from public.packages where owner_id = v_owner and price > 0)),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
        select la.action, la.details, la.reason, la.created_at, trim(p.first_name || ' ' || p.last_name) player
        from public.loyalty_audit la left join public.players p on p.id = la.player_id where la.owner_id = v_owner order by la.created_at desc limit 60) a), '[]')
  );
end $$;
revoke all on function public.shop_coach_overview() from public, anon;
grant execute on function public.shop_coach_overview() to authenticated;

-- Ouverture / réglages : à l'activation, la date de départ est fixée (aucun Coin rétroactif sans le vouloir)
create or replace function public.shop_save_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); old public.loyalty_settings; v uuid;
begin
  if v_owner is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  old := app_private.loyal_ensure(v_owner);
  update public.loyalty_settings set
    enabled = coalesce((p ->> 'enabled')::boolean, enabled),
    start_date = coalesce((p ->> 'start_date')::date, start_date,
                          case when coalesce((p ->> 'enabled')::boolean, enabled) then app_private._today() end),
    rate_cap_pct = coalesce((p ->> 'rate_cap_pct')::numeric, rate_cap_pct),
    rate_pct = least(coalesce((p ->> 'rate_pct')::numeric, rate_pct), coalesce((p ->> 'rate_cap_pct')::numeric, rate_cap_pct)),
    urssaf_pct = coalesce((p ->> 'urssaf_pct')::numeric, urssaf_pct),
    court_cost_per_hour = coalesce((p ->> 'court_cost_per_hour')::numeric, court_cost_per_hour),
    court_split = coalesce(p ->> 'court_split', court_split),
    other_cost_per_session = coalesce((p ->> 'other_cost_per_session')::numeric, other_cost_per_session),
    other_cost_per_player = coalesce((p ->> 'other_cost_per_player')::numeric, other_cost_per_player),
    safety_margin_pct = coalesce((p ->> 'safety_margin_pct')::numeric, safety_margin_pct),
    budget_alert_eur = coalesce((p ->> 'budget_alert_eur')::numeric, budget_alert_eur),
    max_pending_orders = coalesce((p ->> 'max_pending_orders')::int, max_pending_orders),
    manual_max_coins = coalesce((p ->> 'manual_max_coins')::int, manual_max_coins)
  where owner_id = v_owner;
  insert into public.loyalty_audit(owner_id, action, details) values (v_owner, 'settings_updated', p);
  -- à l'ouverture (ou si la date de départ est avancée), on calcule les gains des séances concernées
  for v in select id from public.players where owner_id = v_owner loop perform app_private.coins_sync_player(v); end loop;
end $$;
revoke all on function public.shop_save_settings(jsonb) from public, anon;
grant execute on function public.shop_save_settings(jsonb) to authenticated;

-- Coûts propres à un groupe (vide = valeurs générales) ; s'appliquent aux prochains gains
create or replace function public.shop_save_group_cost(p_group uuid, p_court numeric, p_other numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  if not exists (select 1 from public.groups where id = p_group and owner_id = v_owner) then raise exception 'Groupe introuvable'; end if;
  if coalesce(p_court, 0) < 0 or coalesce(p_other, 0) < 0 then raise exception 'Montants positifs uniquement'; end if;
  if p_court is null and p_other is null then
    delete from public.loyalty_group_costs where group_id = p_group;
  else
    insert into public.loyalty_group_costs(group_id, owner_id, court_cost_per_hour, other_cost_per_session)
    values (p_group, v_owner, p_court, p_other)
    on conflict (group_id) do update set court_cost_per_hour = excluded.court_cost_per_hour,
      other_cost_per_session = excluded.other_cost_per_session, updated_at = now();
  end if;
  insert into public.loyalty_audit(owner_id, action, details)
  values (v_owner, 'group_cost_updated', jsonb_build_object('group', (select name from public.groups where id = p_group), 'court_per_hour', p_court, 'other', p_other));
end $$;
revoke all on function public.shop_save_group_cost(uuid, numeric, numeric) from public, anon;
grant execute on function public.shop_save_group_cost(uuid, numeric, numeric) to authenticated;

-- Vérification des soldes : recalcul complet depuis le grand livre
create or replace function public.shop_verify()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); v uuid; v_before int; v_after int; v_mismatch int;
begin
  if v_owner is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  select count(*) into v_mismatch from public.coin_wallets w
   where w.owner_id = v_owner and w.balance <> (select coalesce(sum(coins), 0) from public.coin_transactions t where t.player_id = w.player_id);
  select coalesce(sum(coins), 0) into v_before from public.coin_transactions where owner_id = v_owner;
  for v in select id from public.players where owner_id = v_owner loop perform app_private.coins_sync_player(v); end loop;
  select coalesce(sum(coins), 0) into v_after from public.coin_transactions where owner_id = v_owner;
  insert into public.loyalty_audit(owner_id, action, details) values (v_owner, 'verified', jsonb_build_object('wallets_fixed', v_mismatch, 'coins_delta', v_after - v_before));
  return jsonb_build_object('wallets_fixed', v_mismatch, 'coins_delta', v_after - v_before,
    'negative_wallets', (select count(*) from public.coin_wallets where owner_id = v_owner and balance < 0));
end $$;
revoke all on function public.shop_verify() from public, anon;
grant execute on function public.shop_verify() to authenticated;

-- Produits de départ (brouillons inactifs : à compléter avec tes coûts réels avant de les activer)
create or replace function public.shop_add_starter_products()
returns int language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); n int;
begin
  if v_owner is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  insert into public.shop_products(owner_id, name, description, category, price_coins, rarity, is_ambassador, stock, sort)
  select v_owner, x.name, x.descr, x.cat, x.price, x.rarity, x.amb, x.stock, x.sort from (values
    ('Surgrip personnalisé', 'Surgrip aux couleurs du coaching.', 'equipement', 40, 'commun', false, 0, 1),
    ('Serviette', 'Serviette brodée Coach Padel Toulouse.', 'textile', 200, 'rare', false, 0, 2),
    ('Gourde', 'Gourde isotherme personnalisée.', 'equipement', 300, 'rare', false, 0, 3),
    ('T-shirt ambassadeur', 'Le t-shirt réservé aux ambassadeurs du groupe.', 'textile', 500, 'legendaire', true, 0, 4),
    ('Analyse vidéo d''un match', 'Récompense numérique : retour vidéo commenté par le coach.', 'numerique', 150, 'epique', false, null, 5),
    ('Place pour un événement', 'Récompense événementielle : stage, soirée ou tournoi interne.', 'evenement', 250, 'epique', false, 0, 6)
  ) as x(name, descr, cat, price, rarity, amb, stock, sort)
  where not exists (select 1 from public.shop_products p where p.owner_id = v_owner and p.name = x.name);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.shop_add_starter_products() from public, anon;
grant execute on function public.shop_add_starter_products() to authenticated;

-- Mise en place des réglages pour les coachs existants (shop désactivé)
do $$ declare o uuid; begin
  for o in select distinct owner_id from public.players loop perform app_private.loyal_ensure(o); end loop;
end $$;

notify pgrst, 'reload schema';
