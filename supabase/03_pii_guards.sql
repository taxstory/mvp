-- TaxStory — database-side PII guards and brand-colour repair. SAFE TO RE-RUN.
-- The app checks free text for SSNs/EINs before saving, but several screens write straight to the database from the browser, so the
-- database must refuse identifiers itself. These guards use their own names (ts_*) and sit alongside any existing guards; nothing is dropped
-- except this script's own triggers, which it recreates.

begin;

-- ── 1. Identifier test: SSN/ITIN (with separators), EIN, and nine bare digits (how SSNs are usually typed) ──────────────────────
-- Matches netlify/functions/_pii.js and src/utils/pii.js. Amounts are not caught: a nine-digit run next to $ , or . is ignored.
create or replace function public.ts_has_identifier(t text) returns boolean
language sql immutable as $$
  select t is not null and (
       t ~ '(?<![0-9])[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}(?![0-9])'
    or t ~ '(?<![0-9])[0-9]{2}-[0-9]{7}(?![0-9])'
    or t ~ '(?<![0-9$,.])[0-9]{9}(?![0-9,.])'
  );
$$;

-- ── 2. Trigger: rejects a row whose listed text columns contain an identifier. Columns are passed as trigger arguments. ──────────
create or replace function public.ts_reject_identifiers() returns trigger
language plpgsql as $$
declare
  col text;
  val text;
begin
  foreach col in array tg_argv loop
    val := to_jsonb(new) ->> col;
    if public.ts_has_identifier(val) then
      raise exception 'This text looks like it contains a Social Security or tax ID number. TaxStory does not need these — please remove it.'
        using errcode = 'check_violation', hint = format('%s.%s', tg_table_name, col);
    end if;
  end loop;
  return new;
end $$;

-- ── 3. Attach to every free-text column the browser can write ──────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select * from (values
      ('clients',           'name, notes',  'name, notes'),
      ('tax_returns',       'notes',        'notes'),
      ('ria_projections',   'notes',        'notes'),
      ('messages',          'body',         'body'),
      ('video_share_links', 'label',        'label')
    ) as v(tbl, cols, args)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists ts_reject_identifiers on public.%I', r.tbl);
      execute format(
        'create trigger ts_reject_identifiers before insert or update of %s on public.%I for each row execute function public.ts_reject_identifiers(%s)',
        r.cols, r.tbl,
        (select string_agg(quote_literal(trim(c)), ', ') from unnest(string_to_array(r.args, ',')) c));
    end if;
  end loop;
end $$;

-- ── 4. Brand colours: the swatches used to save CSS variables, which emails and the video cannot use (every firm got violet) ──
update public.profiles set brand_color = case brand_color
    when 'var(--purple)'          then '#6B5CE7' when 'var(--color-purple)'    then '#6B5CE7'
    when 'var(--color-blue-mid)'  then '#2563EB' when 'var(--color-green-mid)' then '#059669'
    when 'var(--color-red-mid)'   then '#DC2626' when 'var(--color-amber)'     then '#D97706'
    when 'var(--color-violet)'    then '#7C3AED' when 'var(--color-teal)'      then '#0891B2'
    when 'var(--dark)'            then '#1A1230' when 'var(--color-dark)'      then '#1A1230'
    else '#6B5CE7' end
 where brand_color like 'var(--%';

do $$ begin
  if to_regclass('public.onboarding_state') is not null then
    update public.onboarding_state set brand_color = case brand_color
        when 'var(--color-purple)'    then '#6B5CE7' when 'var(--color-blue-mid)'  then '#2563EB'
        when 'var(--color-green-mid)' then '#059669' when 'var(--color-red-mid)'   then '#DC2626'
        when 'var(--color-amber)'     then '#D97706' when 'var(--color-violet)'    then '#7C3AED'
        when 'var(--color-teal)'      then '#0891B2' when 'var(--color-dark)'      then '#1A1230'
        else '#6B5CE7' end
     where brand_color like 'var(--%';
  end if;
end $$;

commit;

-- Quick self-test (returns true, true, false, false):
-- select public.ts_has_identifier('ssn 123-45-6789'), public.ts_has_identifier('123456789'),
--        public.ts_has_identifier('refund $123456789'), public.ts_has_identifier('phone 9145551234');
