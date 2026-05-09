import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';

// ─── Billing Page ────────────────────────────────────────────────────────────

const PLANS = [
  {
    tier: 'cpa_basic',  label: 'CPA Basic',  price: '$49/mo',
    features: ['100 projections/yr', 'No video credits', 'Email support'],
  },
  {
    tier: 'cpa_pro',    label: 'CPA Pro',    price: '$99/mo',
    features: ['300 projections/yr', '100 video credits/yr', 'Priority support', 'PDF export'],
  },
  {
    tier: 'ria_basic',  label: 'RIA Basic',  price: '$99/mo',
    features: ['50 RIA projections/yr', 'No video credits', 'Scenario modeling'],
  },
  {
    tier: 'ria_pro',    label: 'RIA Pro',    price: '$149/mo',
    features: ['150 projections/yr', '25 video credits/yr', 'Roth + TLH tools', 'Priority support'],
  },
];

export function BillingPage() {
  const { subscription, tier, creditsRemaining, creditsTotal,
          projectionsRemaining, loading } = useSubscription();
  const { user } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState('');

  const currentPlan = PLANS.find(p => p.tier === tier) || PLANS[1];
  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
    : null;

  async function handleManageBilling() {
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
    } catch(e) {
      alert(e.message);
    } finally { setPortalLoading(false); }
  }

  async function handleUpgrade(targetTier) {
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
    } catch(e) {
      alert(e.message);
    } finally { setCheckoutLoading(''); }
  }

  if (loading) return (
    <div className="ts-page">
      <div className="ts-page-title">Billing & plans</div>
      <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Loading…</div>
    </div>
  );

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Billing & plans</div>
          <div className="ts-page-sub">
            {currentPlan.label} · {currentPlan.price}
            {renewalDate && ` · renews ${renewalDate}`}
          </div>
        </div>
        {subscription?.stripe_customer_id && (
          <button className="ts-btn ts-btn-secondary" onClick={handleManageBilling} disabled={portalLoading}>
            {portalLoading ? 'Opening…' : '↗ Manage billing'}
          </button>
        )}
      </div>

      {/* Usage summary */}
      <div className="ts-g3" style={{marginBottom:'16px'}}>
        <div className="ts-kpi">
          <div className="ts-kpi-label">Video credits</div>
          <div className="ts-kpi-val">{creditsRemaining}</div>
          <div className="ts-kpi-delta ts-delta-nt">of {creditsTotal} remaining this year</div>
        </div>
        <div className="ts-kpi">
          <div className="ts-kpi-label">Projections remaining</div>
          <div className="ts-kpi-val">{projectionsRemaining}</div>
          <div className="ts-kpi-delta ts-delta-nt">resets annually</div>
        </div>
        <div className="ts-kpi">
          <div className="ts-kpi-label">Plan status</div>
          <div className="ts-kpi-val" style={{fontSize:'18px',textTransform:'capitalize'}}>
            {subscription?.status || 'Trial'}
          </div>
          <div className="ts-kpi-delta ts-delta-nt">{currentPlan.label}</div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="ts-g2">
        {PLANS.map(plan => {
          const isCurrent = plan.tier === tier;
          return (
            <div key={plan.tier} className="ts-card" style={{border: isCurrent ? '2px solid var(--purple)' : '1.5px solid var(--border)'}}>
              {isCurrent && (
                <div style={{fontSize:'10px',background:'var(--purple3)',color:'var(--purple)',padding:'3px 10px',borderRadius:'20px',display:'inline-block',marginBottom:'10px',fontWeight:700}}>
                  Current plan
                </div>
              )}
              <div style={{fontFamily:'Playfair Display,serif',fontSize:'18px',fontWeight:700,color:'var(--dark)',marginBottom:'4px'}}>
                {plan.label}
              </div>
              <div style={{fontSize:'20px',fontWeight:700,color:'var(--purple)',marginBottom:'12px'}}>{plan.price}</div>
              <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'16px'}}>
                {plan.features.map(f => (
                  <div key={f} style={{fontSize:'12px',color:'var(--muted)',display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{color:'var(--green)',fontWeight:700}}>✓</span> {f}
                  </div>
                ))}
              </div>
              {!isCurrent && (
                <button
                  className="ts-btn ts-btn-primary ts-btn-sm"
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={!!checkoutLoading}>
                  {checkoutLoading === plan.tier ? 'Loading…' : `Switch to ${plan.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const logoRef = useRef();

  const [firmForm, setFirmForm] = useState({
    firm_name: '', phone: '', website: '', brand_color: '#6B5CE7',
  });
  const [firmSaving, setFirmSaving]   = useState(false);
  const [firmSaved,  setFirmSaved]    = useState(false);
  const [firmError,  setFirmError]    = useState('');

  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,   setPwMsg]   = useState('');
  const [pwError, setPwError] = useState('');

  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved,  setNotifSaved]  = useState(false);
  const [notifs, setNotifs] = useState({
    video_complete: true,
    credits_low:    true,
    intake_complete: true,
    message_received: true,
  });

  const [colorSwatch, setColorSwatch] = useState('#6B5CE7');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  // Load profile into form
  useEffect(() => {
    if (!profile) return;
    setFirmForm({
      firm_name:   profile.firm_name   || '',
      phone:       profile.phone       || '',
      website:     profile.website     || '',
      brand_color: profile.brand_color || '#6B5CE7',
    });
    setColorSwatch(profile.brand_color || '#6B5CE7');
    setNotifs({
      video_complete:   profile.notif_video_complete   ?? true,
      credits_low:      profile.notif_credits_low      ?? true,
      intake_complete:  profile.notif_intake_complete  ?? true,
      message_received: profile.notif_message_received ?? true,
    });
    setLogoUrl(profile.logo_url || '');
  }, [profile]);

  const updFirm = k => e => setFirmForm(f => ({...f, [k]: e.target.value}));

  async function saveFirmProfile() {
    setFirmSaving(true); setFirmError(''); setFirmSaved(false);
    const { error } = await supabase.from('profiles').update({
      firm_name:   firmForm.firm_name,
      phone:       firmForm.phone       || null,
      website:     firmForm.website     || null,
      brand_color: firmForm.brand_color || null,
    }).eq('id', user.id);
    if (error) setFirmError(error.message);
    else { setFirmSaved(true); setTimeout(() => setFirmSaved(false), 2500); }
    setFirmSaving(false);
  }

  async function handleLogoUpload(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setFirmError('Logo must be under 2 MB.'); return; }
    setLogoUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `${user.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setFirmError(upErr.message); setLogoUploading(false); return; }
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    const url = data.publicUrl;
    await supabase.from('profiles').update({ logo_url: url }).eq('id', user.id);
    setLogoUrl(url);
    setLogoUploading(false);
  }

  async function changePassword() {
    if (!pwForm.next) { setPwError('Enter a new password.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setPwSaving(true); setPwError(''); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: pwForm.next });
    if (error) setPwError(error.message);
    else { setPwMsg('Password updated successfully.'); setPwForm({ current:'', next:'', confirm:'' }); }
    setPwSaving(false);
  }

  async function saveNotifications() {
    setNotifSaving(true); setNotifSaved(false);
    await supabase.from('profiles').update({
      notif_video_complete:   notifs.video_complete,
      notif_credits_low:      notifs.credits_low,
      notif_intake_complete:  notifs.intake_complete,
      notif_message_received: notifs.message_received,
    }).eq('id', user.id);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
    setNotifSaving(false);
  }

  function Toggle({ value, onChange }) {
    return (
      <div className={`ts-toggle${value ? '' : ' ts-toggle-off'}`} onClick={onChange} style={{cursor:'pointer'}}>
        <div className="ts-toggle-knob" />
      </div>
    );
  }

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Settings</div>
          <div className="ts-page-sub">Manage your account, firm details, and preferences</div>
        </div>
        <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={signOut}>Sign out</button>
      </div>

      <div className="ts-g2">

        {/* Firm profile */}
        <div className="ts-card">
          <div className="ts-card-title">Firm profile</div>
          <div className="ts-frow">
            <label className="ts-fl">Firm name</label>
            <input type="text" value={firmForm.firm_name} onChange={updFirm('firm_name')} placeholder="Your firm name" />
          </div>
          <div className="ts-input-row">
            <div className="ts-frow">
              <label className="ts-fl">Phone <span>optional</span></label>
              <input type="text" value={firmForm.phone} onChange={updFirm('phone')} placeholder="(555) 000-0000" />
            </div>
            <div className="ts-frow">
              <label className="ts-fl">Website <span>optional</span></label>
              <input type="text" value={firmForm.website} onChange={updFirm('website')} placeholder="yourfirm.com" />
            </div>
          </div>
          <div className="ts-frow">
            <label className="ts-fl">Account email</label>
            <input type="email" value={user?.email || ''} disabled style={{background:'var(--bg)',color:'var(--muted)'}} />
          </div>
          {firmError && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'8px 12px',borderRadius:'8px',fontSize:'12px',marginBottom:'10px'}}>{firmError}</div>}
          <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={saveFirmProfile} disabled={firmSaving}>
            {firmSaved ? '✓ Saved' : firmSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {/* Branding */}
        <div className="ts-card">
          <div className="ts-card-title">Branding</div>
          <div className="ts-frow">
            <label className="ts-fl">Firm logo <span>optional · PNG or SVG · max 2MB</span></label>
            <div className="ts-upload-zone" style={{padding:'16px'}} onClick={() => logoRef.current?.click()}>
              <input ref={logoRef} type="file" accept=".png,.svg,.jpg,.jpeg" style={{display:'none'}}
                onChange={e => handleLogoUpload(e.target.files[0])} />
              {logoUrl
                ? <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    <img src={logoUrl} alt="Firm logo" style={{height:'36px',objectFit:'contain'}} />
                    <span style={{fontSize:'12px',color:'var(--purple)',fontWeight:600}}>Change logo</span>
                  </div>
                : <div style={{fontSize:'12px',color:'var(--muted)'}}>
                    {logoUploading ? 'Uploading…' : 'Click to upload logo'}
                  </div>
              }
            </div>
          </div>
          <div className="ts-frow">
            <label className="ts-fl">Brand color</label>
            <div style={{display:'flex',gap:'9px',alignItems:'center'}}>
              <input type="text" value={firmForm.brand_color} onChange={e => {
                updFirm('brand_color')(e);
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setColorSwatch(e.target.value);
              }} style={{flex:1}} placeholder="#6B5CE7" />
              <input type="color" value={colorSwatch} onChange={e => {
                setColorSwatch(e.target.value);
                setFirmForm(f => ({...f, brand_color: e.target.value}));
              }} style={{width:'34px',height:'34px',borderRadius:'9px',border:'1.5px solid var(--border)',cursor:'pointer',padding:'2px'}} />
            </div>
          </div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'4px'}}>Used in client-facing video thumbnails and intake forms.</div>
        </div>

        {/* Password */}
        <div className="ts-card">
          <div className="ts-card-title">Change password</div>
          <div className="ts-frow">
            <label className="ts-fl">New password</label>
            <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({...p, next: e.target.value}))} placeholder="Min 8 characters" />
          </div>
          <div className="ts-frow">
            <label className="ts-fl">Confirm new password</label>
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({...p, confirm: e.target.value}))} placeholder="Repeat new password" />
          </div>
          {pwError && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'8px 12px',borderRadius:'8px',fontSize:'12px',marginBottom:'10px'}}>{pwError}</div>}
          {pwMsg   && <div style={{background:'#D1FAE5',color:'#065F46',padding:'8px 12px',borderRadius:'8px',fontSize:'12px',marginBottom:'10px'}}>{pwMsg}</div>}
          <button className="ts-btn ts-btn-primary ts-btn-sm" onClick={changePassword} disabled={pwSaving}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>

        {/* Notifications */}
        <div className="ts-card">
          <div className="ts-card-title">Email notifications</div>
          {[
            { k:'video_complete',   l:'Video script completed',      s:'When an AI video is ready to review' },
            { k:'credits_low',      l:'Credits running low',         s:'When you have 10 or fewer credits left' },
            { k:'intake_complete',  l:'Intake form completed',       s:'When a client submits their intake form' },
            { k:'message_received', l:'New message from client',     s:'When a client replies to a message' },
          ].map((n, i, arr) => (
            <div key={n.k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<arr.length-1?'1px solid #F0EEF8':'none'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{n.l}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{n.s}</div>
              </div>
              <Toggle value={notifs[n.k]} onChange={() => setNotifs(p => ({...p, [n.k]: !p[n.k]}))} />
            </div>
          ))}
          <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'12px'}} onClick={saveNotifications} disabled={notifSaving}>
            {notifSaved ? '✓ Saved' : notifSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>

      </div>
    </div>
  );
}
