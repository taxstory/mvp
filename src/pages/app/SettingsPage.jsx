// src/pages/app/SettingsPage.jsx
// Firm settings — name, logo, brand color, contact info, notification preferences.
// Data populates all client-facing outputs: video headers, email templates, PDF footers.
// Updates profile table via Supabase; logo uploads to firm-assets storage bucket.

import { useState, useEffect, useRef } from 'react';
import { useAuth }    from '../../context/AuthContext';
import PrivacyModeCard from '../../components/PrivacyModeCard';
import { normalizeWebsite, logoUploadInfo } from '../../utils/inputs';
import { supabase }   from '../../lib/supabase';

const BRAND_COLORS = [
  'var(--purple)','var(--color-blue-mid)','var(--color-green-mid)','var(--color-red-mid)',
  'var(--color-amber)','var(--color-violet)','var(--color-teal)','var(--dark)',
];

export default function SettingsPage() {
  const { user } = useAuth();

  // Form state — mirrors profile table columns
  const [firmName,    setFirmName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [website,     setWebsite]     = useState('');
  const [brandColor,  setBrandColor]  = useState('var(--purple)');
  const [logoUrl,     setLogoUrl]     = useState('');
  const [logoPreview, setLogoPreview] = useState('');

  // Notification preferences
  const [notifVideoComplete,  setNotifVideoComplete]  = useState(true);
  const [notifCreditsLow,     setNotifCreditsLow]     = useState(true);
  const [notifMessageReceived,setNotifMessageReceived]= useState(true);

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const [error,   setError]     = useState('');

  const logoRef = useRef();

  // Load current profile
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles')
      .select('firm_name,phone,website,brand_color,logo_url,notif_video_complete,notif_credits_low,notif_message_received')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setFirmName(data.firm_name    || '');
          setPhone(data.phone           || '');
          setWebsite(data.website       || '');
          setBrandColor(data.brand_color|| 'var(--purple)');
          setLogoUrl(data.logo_url      || '');
          setLogoPreview(data.logo_url  || '');
          setNotifVideoComplete(data.notif_video_complete  ?? true);
          setNotifCreditsLow(data.notif_credits_low        ?? true);
          setNotifMessageReceived(data.notif_message_received ?? true);
        }
        setLoading(false);
      });
  }, [user]);

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const info = logoUploadInfo(file);
    if (info.error) { setError(info.error); return; }
    setLogoPreview(URL.createObjectURL(file));

    const path = `${user.id}/logo.${info.ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('firm-assets').upload(path, file, { upsert: true, contentType: info.contentType });
    if (uploadErr) { setError('Logo upload failed: ' + uploadErr.message); return; }

    const { data: { publicUrl } } = supabase.storage.from('firm-assets').getPublicUrl(path);
    setLogoUrl(publicUrl);
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    const web = normalizeWebsite(website);
    if (web.error) { setSaving(false); setError(web.error); return; }
    setWebsite(web.value || '');
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: user.id,
      firm_name:              firmName.trim(),
      phone:                  phone.trim(),
      website:                web.value,
      brand_color:            brandColor,
      logo_url:               logoUrl,
      notif_video_complete:   notifVideoComplete,
      notif_credits_low:      notifCreditsLow,
      notif_message_received: notifMessageReceived,
    });
    setSaving(false);
    if (upsertErr) { setError(upsertErr.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // ── Shared style tokens ────────────────────────────────────────
  const s = {
    card:    { background:'#fff', border:'1px solid var(--color-border)', borderRadius:13, padding:'20px 22px', marginBottom:14 },
    label:   { display:'block', fontSize:12, fontWeight:600, color:'var(--dark)', marginBottom:5 },
    sub:     { fontWeight:400, color:'var(--muted)', marginLeft:6 },
    input:   { width:'100%', padding:'9px 12px', border:'1px solid var(--color-border)', borderRadius:9, fontSize:13, fontFamily:'inherit', color:'var(--dark)', outline:'none' },
    ct:      { fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 },
    toggle:  (on) => ({
      display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
      borderRadius:9, border:'1px solid', cursor:'pointer',
      borderColor: on ? 'var(--purple)' : 'var(--border)',
      background:  on ? 'var(--purple3)' : '#fff',
    }),
  };

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ padding:'28px 32px', maxWidth:680, fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* Page header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:'var(--dark)', marginBottom:3 }}>Settings</div>
        <div style={{ fontSize:13, color:'var(--muted)' }}>
          Your firm profile powers every client-facing output — videos, emails, and PDF summaries.
        </div>
      </div>

      {error  && <div style={{ background:'var(--color-red-light)', color:'var(--color-red-dark)', padding:'10px 14px', borderRadius:10, fontSize:13, marginBottom:14 }}>{error}</div>}
      {saved  && <div style={{ background:'var(--color-green-light)', color:'var(--color-green-dark)', padding:'10px 14px', borderRadius:10, fontSize:13, marginBottom:14 }}>✓ Settings saved</div>}

      <PrivacyModeCard />

      {/* Firm identity */}
      <div style={s.card}>
        <div style={s.ct}>Firm identity</div>

        <div style={{ marginBottom:14 }}>
          <label style={s.label}>Firm name</label>
          <input style={s.input} value={firmName} onChange={e => setFirmName(e.target.value)}
            placeholder="e.g. Lakeside Advisory Group" />
          <div style={{ fontSize:11, color:'var(--color-muted-light)', marginTop:4 }}>
            Appears in video headers, client emails, and PDF footers
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <label style={s.label}>Phone <span style={{ fontWeight:400, color:'var(--color-muted-light)' }}>optional</span></label>
            <input style={s.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label style={s.label}>Website <span style={{ fontWeight:400, color:'var(--color-muted-light)' }}>optional</span></label>
            <input style={s.input} value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourfirm.com" />
          </div>
        </div>
      </div>

      {/* Branding */}
      <div style={s.card}>
        <div style={s.ct}>Branding</div>

        {/* Logo */}
        <div style={{ marginBottom:18 }}>
          <label style={s.label}>Firm logo <span style={{ fontWeight:400, color:'var(--color-muted-light)' }}>PNG, SVG — max 2 MB</span></label>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div
              onClick={() => logoRef.current?.click()}
              style={{ width:72, height:72, borderRadius:12, border:'2px dashed var(--color-border)', background:'var(--color-soft-white)',
                display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', flexShrink:0 }}
            >
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                : <span style={{ fontSize:26 }}>🏢</span>
              }
            </div>
            <div>
              <button
                onClick={() => logoRef.current?.click()}
                style={{ padding:'7px 14px', background:'var(--purple3)', color:'var(--purple)', border:'none', borderRadius:9, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
              >
                {logoPreview ? 'Change logo' : 'Upload logo'}
              </button>
              {logoPreview && (
                <button
                  onClick={async () => {
                    // Delete from Supabase storage so it doesn't accumulate orphaned files
                    const ext = logoUrl?.split('.').pop()?.split('?')[0];
                    if (ext) {
                      await supabase.storage.from('firm-assets').remove([`${user.id}/logo.${ext}`]).catch(() => {});
                    }
                    setLogoPreview(''); setLogoUrl('');
                  }}
                  style={{ marginLeft:8, padding:'7px 14px', background:'var(--color-red-light)', color:'var(--color-red-dark)', border:'none', borderRadius:9, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
                >
                  Remove
                </button>
              )}
              <div style={{ fontSize:11, color:'var(--color-muted-light)', marginTop:6 }}>Appears in walkthrough headers and client emails</div>
            </div>
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange} />
        </div>

        {/* Brand color */}
        <div>
          <label style={s.label}>Brand color</label>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
            {BRAND_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setBrandColor(c)}
                style={{ width:34, height:34, borderRadius:8, background:c, cursor:'pointer',
                  outline: brandColor === c ? `3px solid ${c}` : '3px solid transparent',
                  outlineOffset:2, transition:'outline .1s' }}
              />
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
              <div style={{ width:34, height:34, borderRadius:8, background:brandColor, border:'1px solid var(--color-border)' }} />
              <input type="color" aria-label="Brand colour" value={brandColor} onChange={e => setBrandColor(e.target.value)}
                style={{ width:34, height:34, padding:0, border:'none', background:'transparent', cursor:'pointer' }} />
            </div>
          </div>

          {/* Live preview — email header strip */}
          <div style={{ borderRadius:11, overflow:'hidden', border:'1px solid var(--color-border)', marginTop:4 }}>
            <div style={{ background:brandColor, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ height:32, maxWidth:80, objectFit:'contain', borderRadius:6, flexShrink:0 }} />
                : <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🏢</div>
              }
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:'Georgia,serif' }}>{firmName || 'Your Firm'}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginTop:2 }}>2025 Tax Return Walkthrough · Preview</div>
              </div>
            </div>
            <div style={{ background:'var(--color-soft)', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>This is how your firm appears in client emails and PDF summaries.</div>
              <div style={{ fontSize:11, color:brandColor, fontWeight:600 }}>← Live preview</div>
            </div>
          </div>

          {/* Keep existing small swatch preview below for quick reference */}
          <div style={{ background:'var(--dark)', borderRadius:11, padding:'13px 16px', display:'flex', alignItems:'center', gap:11, marginTop:8 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:brandColor,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0, overflow:'hidden' }}>
              {logoPreview
                ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:6 }} alt="" />
                : '🏢'}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{firmName || 'Your Firm'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Preview — how clients see your brand</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification preferences */}
      <div style={s.card}>
        <div style={s.ct}>Email notifications</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

          {[
            [notifVideoComplete,  setNotifVideoComplete,  '🎬 Client watched their walkthrough',    'Receive an email the moment a client completes viewing'],
            [notifCreditsLow,     setNotifCreditsLow,     '⚠️ Walkthrough credits running low',           'Alert when fewer than 10% of credits remain'],
            [notifMessageReceived,setNotifMessageReceived,'💬 Client sent a message',               'Notify when a client replies through the portal'],
          ].map(([on, setOn, title, desc]) => (
            <div key={title} style={s.toggle(on)} onClick={() => setOn(!on)}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{title}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{desc}</div>
              </div>
              <div style={{
                width:38, height:22, borderRadius:11,
                background: on ? 'var(--purple)' : 'var(--border)',
                position:'relative', transition:'background .2s', flexShrink:0,
              }}>
                <div style={{
                  width:18, height:18, borderRadius:'50%', background:'#fff',
                  position:'absolute', top:2,
                  left: on ? 18 : 2,
                  transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving}
        style={{ width:'100%', padding:'13px', background:'var(--purple)', color:'#fff', border:'none',
          borderRadius:11, fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer',
          fontFamily:'inherit', opacity:saving?0.7:1 }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
      </button>

      {/* Account info */}
      <div style={{ ...s.card, marginTop:14 }}>
        <div style={s.ct}>Account</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginBottom:6 }}>
          Email: <strong style={{ color:'var(--dark)' }}>{user?.email}</strong>
        </div>
        <div style={{ fontSize:12, color:'var(--color-muted-light)' }}>
          To change your email or password, contact{' '}
          <a href="mailto:support@tellmytaxstory.com" style={{ color:'var(--purple)' }}>support@tellmytaxstory.com</a>
        </div>
      </div>

    </div>
  );
}
