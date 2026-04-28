-- ═══════════════════════════════════════════════════════════════════
-- TaxStory — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('cpa', 'ria')),
  firm_name   TEXT,
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, firm_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'cpa'),
    NEW.raw_user_meta_data->>'firm_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Subscriptions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  tier                 TEXT NOT NULL CHECK (tier IN ('cpa_basic','cpa_pro','ria_basic','ria_pro')),
  status               TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_end            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- ── 3. Usage Counters ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  projections_used    INT  DEFAULT 0,
  credits_used        INT  DEFAULT 0,
  period_start        TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage" ON public.usage_counters FOR SELECT USING (auth.uid() = user_id);

-- ── 4. Tax Returns (CPA uploads) ─────────────────────────────────────
-- SOC 2 Control: Only financial fields extracted — no PII stored.
CREATE TABLE IF NOT EXISTS public.tax_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded','parsing','parsed','script_ready','audio_ready','video_ready','error')),
  storage_path    TEXT,               -- Path in Supabase Storage (PDF)
  parsed_data     JSONB,              -- PII-free financial fields only
  script_text     TEXT,               -- Claude-generated walkthrough script
  audio_url       TEXT,               -- OpenAI TTS audio file URL
  video_url       TEXT,               -- Rendered video URL
  share_token     TEXT UNIQUE,        -- Time-limited share token
  share_expires_at TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CPAs can manage own returns" ON public.tax_returns
  FOR ALL USING (auth.uid() = user_id);

-- ── 5. RIA Projections ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ria_projections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_label    TEXT,               -- No real names; CPA/RIA assigns their own label
  inputs          JSONB NOT NULL,     -- Projection parameters
  results         JSONB,              -- Calculated projection results
  scenarios       JSONB,              -- Comparison scenarios
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ria_projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RIAs can manage own projections" ON public.ria_projections
  FOR ALL USING (auth.uid() = user_id);

-- ── 6. Audit Log (SOC 2 requirement) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  resource    TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own audit log" ON public.audit_log FOR SELECT USING (auth.uid() = user_id);

-- ── 7. Referrals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES auth.users(id),
  referred_email  TEXT,
  referred_user_id UUID REFERENCES auth.users(id),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','signed_up','converted')),
  coupon_applied  BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);

-- ── 8. Storage Buckets ───────────────────────────────────────────────
-- Run these in the Supabase SQL Editor:
INSERT INTO storage.buckets (id, name, public) VALUES ('tax-returns', 'tax-returns', false)
ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false)
ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false)
ON CONFLICT DO NOTHING;

-- RLS on storage: users can only access their own files
CREATE POLICY "Users access own tax returns" ON storage.objects FOR ALL
  USING (bucket_id = 'tax-returns' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users access own videos" ON storage.objects FOR ALL
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users access own audio" ON storage.objects FOR ALL
  USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
