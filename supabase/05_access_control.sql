-- TaxStory — 05_access_control.sql
-- Fixes from the access-control audit (23 Nov 2026). Every item was demonstrated by supabase/test/20_tenant_isolation.sql, which runs as a
-- real signed-in user calling the API directly (no frontend) and now passes. SAFE TO RE-RUN; never deletes data. Run after 04, then 01_verify.
--
--  1. REGRESSION from 04: the privacy guards on clients/messages call a server-only helper, so signed-in users could not add or edit
--     clients or send messages ("permission denied for function ts_firm_labels_only"). The guards now run with the definer's rights.
--  2. A user could make themselves a founding member (45% lifetime discount at checkout) or change their role by updating their profile.
--  3. A user could insert tax returns / planning projections directly, skipping the projection allowance and plan checks the server applies.
--  4. A user could rewrite a return's figures and status directly, after the server recorded what they approved for narration, and could
--     set a portal token of their choosing, or a portal link's expiry and visit counts.
--  5. A user could attach their return or message to ANOTHER firm's client (needs that client's ID), which would show their return in that
--     firm's client portal.

begin;

-- ── 1. Privacy guards run with the definer's rights (they only read the row's own firm setting) ──────────────────────────────────────
alter function public.guard_client_contact() security definer;
alter function public.guard_client_contact() set search_path = public, pg_temp;
alter function public.guard_link_contact()   security definer;
alter function public.guard_link_contact()   set search_path = public, pg_temp;

-- ── 2. Profile: billing/role flags are set by TaxStory, never by the user ───────────────────────────────────────────────────────────
create or replace function public.ts_protect_profile_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.founding_member := old.founding_member;
    new.role            := old.role;
    new.id              := old.id;
  end if;
  return new;
end $$;
drop trigger if exists ts_protect_profile_columns on public.profiles;
create trigger ts_protect_profile_columns before update on public.profiles for each row execute function public.ts_protect_profile_columns();

-- ── 3. Returns and planning projections are created only by the server (which charges the allowance / checks the plan) ──────────────
revoke insert on public.tax_returns     from anon, authenticated;
revoke insert on public.ria_projections from anon, authenticated;

-- ── 4. What the browser may change directly ─────────────────────────────────────────────────────────────────────────────────────────
--     tax_returns / ria_projections: notes only (everything else is written by server functions with the service role).
--     clients: the details the firm edits, plus revoking a portal link (setting the token to null). New tokens come from the server.
create or replace function public.ts_browser_edit_rules() returns trigger language plpgsql as $$
declare keep jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if tg_table_name in ('tax_returns', 'ria_projections') then
    keep := to_jsonb(old) || jsonb_build_object('notes', new.notes);
    return jsonb_populate_record(new, keep);                 -- every column back to its old value except notes
  end if;
  -- clients
  if new.portal_token is not null and new.portal_token is distinct from old.portal_token then
    raise exception 'Portal links are created by TaxStory' using errcode = '42501';
  end if;
  new.portal_access_count     := old.portal_access_count;
  new.portal_last_accessed_at := old.portal_last_accessed_at;
  if new.portal_token is not distinct from old.portal_token then new.portal_token_expires_at := old.portal_token_expires_at; end if;
  return new;
end $$;
-- Named to run before ts_portal_token_expiry (triggers fire in name order), so revoking a link still clears its expiry.
drop trigger if exists ts_a_browser_edit_rules on public.tax_returns;
create trigger ts_a_browser_edit_rules before update on public.tax_returns for each row execute function public.ts_browser_edit_rules();
drop trigger if exists ts_a_browser_edit_rules on public.ria_projections;
create trigger ts_a_browser_edit_rules before update on public.ria_projections for each row execute function public.ts_browser_edit_rules();
drop trigger if exists ts_a_browser_edit_rules on public.clients;
create trigger ts_a_browser_edit_rules before update on public.clients for each row execute function public.ts_browser_edit_rules();
-- Browser inserts of clients: no portal token (the server creates them).
create or replace function public.ts_client_insert_rules() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.portal_token := null; new.portal_token_expires_at := null; new.portal_access_count := 0; new.portal_last_accessed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists ts_a_client_insert_rules on public.clients;
create trigger ts_a_client_insert_rules before insert on public.clients for each row execute function public.ts_client_insert_rules();

-- ── 5. A row's client must belong to the same firm (applies to everyone, the server included) ──────────────────────────────────────
create or replace function public.ts_same_firm_client() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.user_id = new.user_id) then
    raise exception 'That client belongs to another account' using errcode = '42501';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['tax_returns', 'messages', 'ria_projections'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'client_id') then
      execute format('drop trigger if exists ts_same_firm_client on public.%I', t);
      execute format('create trigger ts_same_firm_client before insert or update of client_id, user_id on public.%I for each row execute function public.ts_same_firm_client()', t);
    end if;
  end loop;
end $$;

-- Helper functions are not callable through the API.
revoke all on function public.ts_same_firm_client() from public, anon, authenticated;

commit;

-- Existing rows that already point at another firm's client (should be none; run to check):
--   select r.id from tax_returns r join clients c on c.id = r.client_id where c.user_id <> r.user_id;
