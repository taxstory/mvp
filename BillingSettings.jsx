import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';

// ─── Plan definitions ─────────────────────────────────────────────────────────
const PLANS = {
  cpa_basic: {
    label: 'CPA Basic', price: 49, color: '#6B698A',
    features: ['100 projections / year', 'PDF upload & parsing', 'Live 2025 tax projection'],
    missing:  ['Video credits', 'RIA scenario modeling'],
  },
  cpa_pro: {
    label: 'CPA Pro', price: 99, color: '#6B5CE7', badge: 'Most popular',
    features: ['300 projections / year', 'PDF upload & parsing', '100 video credits / year', 'PDF export', 'Priority support'],
    missing:  [],
  },
  ria_basic: {
    label: 'RIA Basic', price: 99, color: '#6B5CE7',
    features: ['50 RIA projections / year', 'Multi-year scenario modeling', 'Roth + TLH + RMD tools'],
    missing:  ['Video credits', 'Priority support'],
  },
  ria_pro: {
    label: 'RIA Pro', price: 149, color: '#6B5CE7', badge: 'Full featured',
    features: ['150 projections / year', 'Multi-year scenario modeling', 'Roth + TLH + RMD tools', '25 video credits / year', 'PDF export', 'Priority support'],
    missing:  [],
  },
  trial: {
    label: 'Free Trial', price: 0, color: '#6B698A',
    features: ['10 projections', '3 video credits', 'Full feature access for 14 days'],
    missing:  [],
  },
};

const CREDIT_PACKS = [
  { id: 'credits_10', count: 10, price: 29, perCredit: '$2.90' },
  { id: 'credits_25', count: 25, price: 59, perCredit: '$2.36', badge: 'Best value' },
  { id: 'credits_50', count: 50, price: 99, perCredit: '$1.98' },
];

const OTHER_PLANS = [
  { tier: 'cpa_basic', label: 'CPA Basic',  price: 49,  desc: '100 projections, no video credits' },
  { tier: 'cpa_pro',   label: 'CPA Pro',    price: 99,  desc: '300 projections + 100 video credits', badge: 'Popular' },
  { tier: 'ria_basic', label: 'RIA Basic',  price: 99,  desc: '50 RIA projections, scenario modeling' },
  { tier: 'ria_pro',   label: 'RIA Pro',    price: 149, desc: '150 projections + 25 video credits' },
];

// ─── Billing Page ─────────────────────────────────────────────────────────────
export function BillingPage() {
  const { subscription, tier, creditsRemaining, creditsTotal, creditsUsed,
          projectionsRemaining, loading, limits, refetch } = useSubscription();
  const { user } = useAuth();

  const [portalLoading,   setPortalLoading]   = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState('');
  const [creditsLoading,  setCreditsLoading]  = useState('');
  const [showPlans,       setShowPlans]       = useState(false);
  const [showCredits,     setShowCredits]     = useState(false);

  const plan       = PLANS[tier] || PLANS.trial;
  const isTrial    = !subscription || subscription.status === 'trialing';
  const isActive   = subscription?.status === 'active';
  const renewDate  = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const creditPct  = creditsTotal > 0 ? Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100)) : 0;
  const projPct    = limits?.projections > 0 ? Math.min(100, Math.round((projectionsRemaining / limits.projections) * 100)) : 0;
  const lowCredits = creditsRemaining <= 10 && creditsTotal > 0;

  async function openPortal() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error('Could not open billing portal');
      const { url } = await res.json();
      window.location.href = url;
    } catch(e) { alert(e.message); }
    finally { setPortalLoading(false); }
  }

  async function startCheckout(targetTier) {
    setCheckoutLoading(targetTier);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ tier: targetTier, userId: user.id }),
      });
      if (!res.ok) throw new Error('Could not start checkout');
      const { url } = await res.json();
      window.location.href = url;
    } catch(e) { alert(e.message); }
    finally { setCheckoutLoading(''); }
  }

  async function buyCredits(pack) {
    setCreditsLoading(pack.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ creditPack: pack.id, userId: user.id }),
      });
      if (!res.ok) throw new Error('Could not start checkout');
      const { url } = await res.json();
      window.location.href = url;
    } catch(e) { alert(e.message); }
    finally { setCreditsLoading(''); }
  }

  if (loading) return (
    <div className="ts-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
      <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 10px' }} />
        Loading billing info…
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="ts-page" style={{ maxWidth: '860px' }}>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Subscriptions & billing</div>
          <div className="ts-page-sub">Manage your plan, video credits, and payment details</div>
        </div>
        {isActive && subscription?.stripe_customer_id && (
          <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={openPortal} disabled={portalLoading}>
            {portalLoading ? 'Opening…' : '↗ View invoices & payment method'}
          </button>
        )}
      </div>

      {/* ── 1. Current subscription widget ── */}
      <div className="ts-card" style={{ marginBottom: '14px', border: '2px solid var(--purple)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: '20px', fontWeight: 700, color: 'var(--dark)' }}>
                {plan.label}
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                background: isActive ? '#D1FAE5' : isTrial ? '#FEF3C7' : '#FEE2E2',
                color:      isActive ? '#065F46' : isTrial ? '#92400E' : '#991B1B',
              }}>
                {isActive ? '● Active' : isTrial ? '◐ Trial' : '✗ Inactive'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              {plan.price > 0 ? `$${plan.price}/month` : 'Free'}
              {renewDate && ` · Renews ${renewDate}`}
              {isTrial && ' · No credit card required'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--dark)', background: 'var(--bg)', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span> {f}
                </div>
              ))}
              {plan.missing.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#C4C2D8', background: '#FAFAFE', padding: '4px 10px', borderRadius: '20px', border: '1px solid #F0EEF8' }}>
                  <span style={{ fontWeight: 700 }}>✗</span> {f}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
            <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => { setShowPlans(!showPlans); setShowCredits(false); }}>
              {showPlans ? 'Hide plans ↑' : 'Change plan ↓'}
            </button>
            {isTrial && (
              <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={() => { setShowPlans(true); setShowCredits(false); }}>
                Subscribe now
              </button>
            )}
          </div>
        </div>

        {/* Inline plan switcher */}
        {showPlans && (
          <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1.5px solid var(--border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Available plans</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px' }}>
              {OTHER_PLANS.map(p => {
                const isCur = p.tier === tier;
                return (
                  <div key={p.tier} style={{ padding: '14px', borderRadius: '12px', border: `1.5px solid ${isCur ? 'var(--purple)' : 'var(--border)'}`, background: isCur ? 'var(--purple3)' : 'white', position: 'relative' }}>
                    {p.badge && !isCur && (
                      <div style={{ position: 'absolute', top: '-9px', left: '12px', fontSize: '9px', background: 'var(--purple)', color: 'white', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>{p.badge}</div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--dark)', marginBottom: '2px' }}>{p.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isCur ? 'var(--purple)' : 'var(--dark)', marginBottom: '4px' }}>${p.price}<span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted)' }}>/mo</span></div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', lineHeight: 1.4 }}>{p.desc}</div>
                    {isCur ? (
                      <div style={{ fontSize: '11px', color: 'var(--purple)', fontWeight: 600 }}>✓ Current plan</div>
                    ) : (
                      <button className="ts-btn ts-btn-primary ts-btn-sm" style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
                        onClick={() => startCheckout(p.tier)} disabled={!!checkoutLoading}>
                        {checkoutLoading === p.tier ? '…' : 'Select plan'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>Plan changes take effect immediately. You'll be credited for unused time.</div>
          </div>
        )}
      </div>

      {/* ── 2. Usage row ── */}
      <div className="ts-g2" style={{ marginBottom: '14px' }}>

        {/* Video credits widget */}
        <div className="ts-card" style={{ border: lowCredits ? '1.5px solid #FDE68A' : '1.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)' }}>🎬 Video credits</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Resets annually · stack when purchased</div>
            </div>
            <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={() => { setShowCredits(!showCredits); setShowPlans(false); }}>
              {showCredits ? 'Hide ↑' : '+ Buy credits'}
            </button>
          </div>

          {/* Big number */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'Playfair Display,serif', fontSize: '40px', fontWeight: 700, lineHeight: 1, color: lowCredits ? 'var(--red)' : 'var(--dark)' }}>
              {creditsRemaining}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>of {creditsTotal} remaining</span>
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--border)', borderRadius: '6px', height: '8px', marginBottom: '6px' }}>
            <div style={{ width: `${creditPct}%`, height: '8px', borderRadius: '6px', background: lowCredits ? 'var(--red)' : 'var(--purple)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
            <span>{creditsUsed} used this year</span>
            <span>{creditsRemaining} remaining</span>
          </div>

          {lowCredits && (
            <div style={{ marginTop: '10px', background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500 }}>
              ⚠️ Running low — purchase credits to keep generating videos
            </div>
          )}

          {/* Inline credit packs */}
          {showCredits && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Buy a credit pack — credits never expire
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {CREDIT_PACKS.map(pack => (
                  <div key={pack.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: '10px',
                    border: pack.badge ? '1.5px solid var(--purple)' : '1.5px solid var(--border)',
                    background: pack.badge ? 'var(--purple3)' : 'white',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dark)' }}>{pack.count} credits</span>
                        {pack.badge && <span style={{ fontSize: '9px', background: 'var(--purple)', color: 'white', padding: '2px 7px', borderRadius: '20px', fontWeight: 700 }}>{pack.badge}</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{pack.perCredit} per credit</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontFamily: 'Playfair Display,serif', fontSize: '20px', fontWeight: 700, color: 'var(--dark)' }}>${pack.price}</span>
                      <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={() => buyCredits(pack)} disabled={!!creditsLoading} style={{ minWidth: '80px' }}>
                        {creditsLoading === pack.id ? '…' : 'Buy'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>Paid via Stripe · Credits added instantly · Non-refundable</div>
            </div>
          )}
        </div>

        {/* Projections widget */}
        <div className="ts-card">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)' }}>📊 Projections</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>CPA returns & RIA scenarios · resets annually</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'Playfair Display,serif', fontSize: '40px', fontWeight: 700, lineHeight: 1, color: 'var(--dark)' }}>
              {projectionsRemaining}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>of {limits?.projections || '—'} remaining</span>
          </div>
          <div style={{ background: 'var(--border)', borderRadius: '6px', height: '8px', marginBottom: '6px' }}>
            <div style={{ width: `${projPct}%`, height: '8px', borderRadius: '6px', background: 'var(--purple)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            <span>{(limits?.projections || 0) - projectionsRemaining} used this year</span>
            <span>{projectionsRemaining} remaining</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
            Need more projections?{' '}
            <span style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setShowPlans(true); setShowCredits(false); }}>
              Upgrade your plan →
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Payment method / portal ── */}
      <div className="ts-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)', marginBottom: '3px' }}>💳 Payment method & invoices</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {isActive
                ? 'Update your card, download invoices, or cancel your subscription via the Stripe billing portal.'
                : isTrial
                ? 'No payment method required during your trial. Subscribe to add a card.'
                : 'Your subscription is inactive. Subscribe to reactivate.'}
            </div>
          </div>
          {isActive && subscription?.stripe_customer_id ? (
            <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={openPortal} disabled={portalLoading} style={{ flexShrink: 0 }}>
              {portalLoading ? 'Opening…' : '↗ Open billing portal'}
            </button>
          ) : (
            <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={() => { setShowPlans(true); setShowCredits(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ flexShrink: 0 }}>
              Subscribe now
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const logoRef = useRef();

  const [firmForm, setFirmForm] = useState({ firm_name: '', phone: '', website: '', brand_color: '#6B5CE7' });
  const [firmSaving, setFirmSaving] = useState(false);
  const [firmSaved,  setFirmSaved]  = useState(false);
  const [firmError,  setFirmError]  = useState('');

  const [pwForm,   setPwForm]   = useState({ next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState('');
  const [pwError,  setPwError]  = useState('');

  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved,  setNotifSaved]  = useState(false);
  const [notifs, setNotifs] = useState({ video_complete: true, credits_low: true, intake_complete: true, message_received: true });
  const [colorSwatch, setColorSwatch] = useState('#6B5CE7');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (!profile) return;
    setFirmForm({ firm_name: profile.firm_name || '', phone: profile.phone || '', website: profile.website || '', brand_color: profile.brand_color || '#6B5CE7' });
    setColorSwatch(profile.brand_color || '#6B5CE7');
    setNotifs({ video_complete: profile.notif_video_complete ?? true, credits_low: profile.notif_credits_low ?? true, intake_complete: profile.notif_intake_complete ?? true, message_received: profile.notif_message_received ?? true });
    setLogoUrl(profile.logo_url || '');
  }, [profile]);

  const updFirm = k => e => setFirmForm(f => ({ ...f, [k]: e.target.value }));

  async function saveFirmProfile() {
    setFirmSaving(true); setFirmError(''); setFirmSaved(false);
    const { error } = await supabase.from('profiles').update({ firm_name: firmForm.firm_name, phone: firmForm.phone || null, website: firmForm.website || null, brand_color: firmForm.brand_color || null }).eq('id', user.id);
    if (error) setFirmError(error.message);
    else { setFirmSaved(true); setTimeout(() => setFirmSaved(false), 2500); }
    setFirmSaving(false);
  }

  async function handleLogoUpload(file) {
    if (!file || file.size > 2097152) { setFirmError('Logo must be under 2 MB.'); return; }
    setLogoUploading(true);
    const path = `${user.id}/logo.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setFirmError(upErr.message); setLogoUploading(false); return; }
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    await supabase.from('profiles').update({ logo_url: data.publicUrl }).eq('id', user.id);
    setLogoUrl(data.publicUrl); setLogoUploading(false);
  }

  async function changePassword() {
    if (!pwForm.next) { setPwError('Enter a new password.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setPwSaving(true); setPwError(''); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: pwForm.next });
    if (error) setPwError(error.message);
    else { setPwMsg('Password updated successfully.'); setPwForm({ next: '', confirm: '' }); }
    setPwSaving(false);
  }

  async function saveNotifications() {
    setNotifSaving(true); setNotifSaved(false);
    await supabase.from('profiles').update({ notif_video_complete: notifs.video_complete, notif_credits_low: notifs.credits_low, notif_intake_complete: notifs.intake_complete, notif_message_received: notifs.message_received }).eq('id', user.id);
    setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500); setNotifSaving(false);
  }

  function Toggle({ value, onChange }) {
    return (
      <div className={`ts-toggle${value ? '' : ' ts-toggle-off'}`} onClick={onChange}>
        <div className="ts-toggle-knob" />
      </div>
    );
  }

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Settings</div><div className="ts-page-sub">Manage your account, firm details, and preferences</div></div>
        <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={signOut}>Sign out</button>
      </div>
      <div className="ts-g2">
        <div className="ts-card">
          <div className="ts-card-title">Firm profile</div>
          <div className="ts-frow"><label className="ts-fl">Firm name</label><input type="text" value={firmForm.firm_name} onChange={updFirm('firm_name')} placeholder="Your firm name" /></div>
          <div className="ts-input-row">
            <div className="ts-frow"><label className="ts-fl">Phone <span>optional</span></label><input type="text" value={firmForm.phone} onChange={updFirm('phone')} placeholder="(555) 000-0000" /></div>
            <div className="ts-frow"><label className="ts-fl">Website <span>optional</span></label><input type="text" value={firmForm.website} onChange={updFirm('website')} placeholder="yourfirm.com" /></div>
          </div>
          <div className="ts-frow"><label className="ts-fl">Account email</label><input type="email" value={user?.email || ''} disabled style={{ background: 'var(--bg)', color: 'var(--muted)' }} /></div>
          {firmError && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '10px' }}>{firmError}</div>}
          <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={saveFirmProfile} disabled={firmSaving}>{firmSaved ? '✓ Saved' : firmSaving ? 'Saving…' : 'Save changes'}</button>
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Branding</div>
          <div className="ts-frow">
            <label className="ts-fl">Firm logo <span>optional · PNG or SVG · max 2MB</span></label>
            <div className="ts-upload-zone" style={{ padding: '16px' }} onClick={() => logoRef.current?.click()}>
              <input ref={logoRef} type="file" accept=".png,.svg,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => handleLogoUpload(e.target.files[0])} />
              {logoUrl ? <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><img src={logoUrl} alt="Firm logo" style={{ height: '36px', objectFit: 'contain' }} /><span style={{ fontSize: '12px', color: 'var(--purple)', fontWeight: 600 }}>Change logo</span></div>
                       : <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{logoUploading ? 'Uploading…' : 'Click to upload logo'}</div>}
            </div>
          </div>
          <div className="ts-frow">
            <label className="ts-fl">Brand color</label>
            <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
              <input type="text" value={firmForm.brand_color} onChange={e => { updFirm('brand_color')(e); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setColorSwatch(e.target.value); }} style={{ flex: 1 }} placeholder="#6B5CE7" />
              <input type="color" value={colorSwatch} onChange={e => { setColorSwatch(e.target.value); setFirmForm(f => ({ ...f, brand_color: e.target.value })); }} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1.5px solid var(--border)', cursor: 'pointer', padding: '2px' }} />
            </div>
          </div>
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Change password</div>
          <div className="ts-frow"><label className="ts-fl">New password</label><input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="Min 8 characters" /></div>
          <div className="ts-frow"><label className="ts-fl">Confirm password</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" /></div>
          {pwError && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '10px' }}>{pwError}</div>}
          {pwMsg   && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '10px' }}>{pwMsg}</div>}
          <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={changePassword} disabled={pwSaving}>{pwSaving ? 'Updating…' : 'Update password'}</button>
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Email notifications</div>
          {[
            { k: 'video_complete',   l: 'Video script completed',  s: 'When an AI video is ready to review' },
            { k: 'credits_low',      l: 'Credits running low',     s: 'When you have 10 or fewer credits left' },
            { k: 'intake_complete',  l: 'Intake form completed',   s: 'When a client submits their intake form' },
            { k: 'message_received', l: 'New message from client', s: 'When a client replies to a message' },
          ].map((n, i, arr) => (
            <div key={n.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #F0EEF8' : 'none' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>{n.l}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{n.s}</div>
              </div>
              <Toggle value={notifs[n.k]} onChange={() => setNotifs(p => ({ ...p, [n.k]: !p[n.k] }))} />
            </div>
          ))}
          <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{ marginTop: '12px' }} onClick={saveNotifications} disabled={notifSaving}>
            {notifSaved ? '✓ Saved' : notifSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
