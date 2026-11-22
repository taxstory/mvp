// src/pages/onboarding/OnboardingWizard.jsx
// 3-step onboarding wizard shown to new users on first login.
// Gated by profile.onboarding_completed === false.
// On completion: updates profile, creates onboarding_state record, redirects to dashboard.

import { useState, useRef } from 'react';
import { logoUploadInfo } from '../../utils/inputs';
import { useNavigate } from 'react-router-dom';
import { readReturnPdf } from '../../utils/pdfExtract';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Icon, IconLabel } from '../../components/Icon';

const STEPS = [
  { id: 1, label: 'Your practice',  icon: 'building' },
  { id: 2, label: 'First client',   icon: 'file' },
  { id: 3, label: 'Your branding',  icon: 'palette' },
];

const COLORS = ['#6B5CE7','#2563EB','#059669','#DC2626','#D97706','#7C3AED','#0891B2','#1A1230'];   // hex: stored and used in emails and video, where CSS variables do not work

export default function OnboardingWizard() {
  const { user, refreshProfile } = useAuth();
  const navigate  = useNavigate();

  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Step 1
  const [firmName,      setFirmName]      = useState('');
  const [practiceType,  setPracticeType]  = useState('');
  const [primaryUse,    setPrimaryUse]    = useState('');

  // Step 2
  const [useDemo,       setUseDemo]       = useState(true);
  const [file,          setFile]          = useState(null);
  const [parsing,       setParsing]       = useState(false);
  const [parseResult,   setParseResult]   = useState(null);
  const fileRef = useRef();

  // Step 3
  const [brandColor,    setBrandColor]    = useState('#6B5CE7');
  const [logoFile,      setLogoFile]      = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const logoRef = useRef();

  const progress = ((step - 1) / STEPS.length) * 100;

  // ── Step 1 handlers ────────────────────────────────────────
  async function nextStep1() {
    if (!firmName.trim()) { setError('Please enter your firm name.'); return; }
    if (!practiceType) { setError('Please select your practice type.'); return; }
    if (!primaryUse) { setError('Please select your primary use.'); return; }
    setError(''); setSaving(true);
    try {
      const { error: profileError } = await supabase.from('profiles').update({
        firm_name: firmName.trim(), practice_type: practiceType, primary_use: primaryUse,
      }).eq('id', user.id).select('id').single();
      if (profileError) throw profileError;
      const { error: stateError } = await supabase.from('onboarding_state').upsert({
        user_id: user.id, step: 2, firm_name: firmName.trim(), practice_type: practiceType, primary_use: primaryUse,
      }, { onConflict: 'user_id' });
      if (stateError) throw stateError;
      setStep(2);
    } catch (e) { setError(`Unable to save practice details: ${e.message || 'Please try again.'}`); }
    finally { setSaving(false); }
  }

  // ── Step 2 handlers ────────────────────────────────────────
  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUseDemo(false);
  }

  async function handleParse() {
    if (useDemo) {
      // Simulate a demo parse with pre-built result
      setParsing(true);
      await new Promise(r => setTimeout(r, 1800));
      setParseResult({
        demo: true,
        wages: 142000,
        adjustedGrossIncome: 136850,
        taxableIncome: 106850,
        totalTax: 19482,
        effectiveRate: 14.3,
        refundOrOwed: 2814,
        isRefund: true,
        filingStatus: 'Married filing jointly',
        taxYear: 2024,
      });
      setParsing(false);
    } else if (file) {
      // Read the PDF ON THIS DEVICE. It is not uploaded and nothing is saved during onboarding.
      // (The previous version posted { pdf, fileName } to an endpoint that expected a different request, so this path never worked.)
      setParsing(true); setError('');
      try {
        const r = await readReturnPdf(file);
        const f = r.figures;
        if (r.quality === 'insufficient') throw new Error('Very little could be read from this PDF. Try the demo return, or use a PDF exported from your tax software.');
        setParseResult({
          wages: f.wages, adjustedGrossIncome: f.agi, taxableIncome: f.taxableIncome, totalTax: f.totalTax, effectiveRate: f.effectiveRate,
          refundOrOwed: f.refund ?? f.amountOwed, isRefund: f.refund !== undefined, filingStatus: r.filingStatus, taxYear: r.taxYear,
        });
      } catch (e) { setError(e.message); }
      finally { setParsing(false); }
    }
  }

  async function nextStep2() {
    setError('');
    if (!parseResult) { setError('Parse a return first, or click "Use demo return".'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('onboarding_state').upsert({
        user_id: user.id, step: 3, used_demo_return: useDemo,
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setStep(3);
    } catch (e) { setError(`Unable to save onboarding progress: ${e.message || 'Please try again.'}`); }
    finally { setSaving(false); }
  }

  // ── Step 3 handlers ────────────────────────────────────────
  function handleLogoChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  async function finish() {
    setSaving(true); setError('');
    try {
      let logoUrl = null;
      if (logoFile) {
        const info = logoUploadInfo(logoFile);
        if (info.error) throw new Error(info.error);
        const path = `${user.id}/logo.${info.ext || 'png'}`;
        const { error: uploadErr } = await supabase.storage
          .from('firm-assets').upload(path, logoFile, { upsert: true, contentType: info.contentType });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('firm-assets').getPublicUrl(path);
        logoUrl = publicUrl;
      }
      // Do not erase an existing logo if the user did not upload a replacement.
      const changes = { brand_color: brandColor, onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString() };
      if (logoUrl) changes.logo_url = logoUrl;
      const { data: saved, error: profileError } = await supabase.from('profiles')
        .update(changes).eq('id', user.id).select('id,onboarding_completed').single();
      if (profileError) throw profileError;
      if (!saved?.onboarding_completed) throw new Error('The profile did not confirm onboarding completion.');
      const { error: stateError } = await supabase.from('onboarding_state').upsert({
        user_id: user.id, step: 3, completed: true, brand_color: brandColor, logo_url: logoUrl,
      }, { onConflict: 'user_id' });
      if (stateError) throw stateError;
      const refreshed = await refreshProfile();
      if (!refreshed?.onboarding_completed) throw new Error('The updated account status could not be verified.');
      navigate('/dashboard', { replace: true });
    } catch (e) { setError(`Unable to finish onboarding: ${e.message || 'Please try again.'}`); }
    finally { setSaving(false); }
  }

  // ── Layout helpers ─────────────────────────────────────────
  const s = {
    wrap:    { minHeight:'100vh', background:'var(--color-bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px', fontFamily:'Inter,system-ui,sans-serif' },
    card:    { width:'100%', maxWidth:560, background:'#fff', borderRadius:20, border:'1px solid var(--color-border)', boxShadow:'0 8px 40px rgba(107,92,231,.08)', overflow:'hidden' },
    header:  { background:'var(--color-dark)', padding:'28px 32px 24px' },
    body:    { padding:'32px' },
    pill:    (active) => ({ padding:'10px 18px', borderRadius:10, border:`2px solid ${active?'var(--color-purple)':'var(--color-border)'}`, background:active?'var(--color-purple-3)':'#fff', cursor:'pointer', fontSize:13, fontWeight:600, color:active?'var(--color-purple)':'var(--color-muted)', transition:'all .12s', fontFamily:'inherit' }),
  };

  return (
    <div className="ts-onboarding" style={s.wrap}>
      {/* Logo */}
      <img
        src="/brand/taxstory-lockup-horizontal-primary-on-light.svg"
        alt="TaxStory"
        style={{ height: 32, width: 'auto', marginBottom: 24 }}
      />

      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          {/* Progress bar */}
          <div style={{ height:3, background:'rgba(255,255,255,.15)', borderRadius:2, marginBottom:20, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'var(--color-purple)', borderRadius:2, transition:'width .4s' }} />
          </div>
          {/* Step indicators */}
          <div style={{ display:'flex', gap:0 }}>
            {STEPS.map((s, i) => (
              <div key={s.id} style={{ flex:1, textAlign:'center' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:step>s.id?'var(--color-purple)':step===s.id?'#fff':'rgba(255,255,255,.15)', color:step===s.id?'var(--color-dark)':'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, margin:'0 auto 6px' }}>
                  {step > s.id ? '✓' : s.id}
                </div>
                <div style={{ fontSize:11, color:step===s.id?'#fff':'rgba(255,255,255,.4)', fontWeight:step===s.id?600:400 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={s.body}>
          {error && <div className="ts-alert ts-alert-danger" role="alert" style={{ marginBottom:16 }}>{error}</div>}

          {/* ── STEP 1: Identity ──────────────────────────── */}
          {step === 1 && (
            <>
              <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:6 }}>Welcome to TaxStory </div>
              <div style={{ fontSize:14, color:'var(--color-muted)', marginBottom:28, lineHeight:1.6 }}>Let's get your practice set up. This takes about 3 minutes.</div>

              <div style={{ marginBottom:16 }}>
                <label className="ts-fl">Firm or practice name</label>
                <input placeholder="e.g. Chen & Associates" value={firmName} onChange={e => setFirmName(e.target.value)} autoFocus />
              </div>

              <div style={{ marginBottom:20 }}>
                <label className="ts-fl">Practice type</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                  {[['solo','Solo practitioner'],['small_firm','Small firm (2–10)'],['large_firm','Larger firm (10+)']].map(([v,l]) => (
                    <button key={v} style={s.pill(practiceType===v)} onClick={() => setPracticeType(v)}>{l}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:28 }}>
                <label className="ts-fl">Primary use</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                  {[['tax','Tax projections'],['investment','Investment planning'],['both','Both']].map(([v,l]) => (
                    <button key={v} style={s.pill(primaryUse===v)} onClick={() => setPrimaryUse(v)}>{l}</button>
                  ))}
                </div>
              </div>

              <button className="ts-btn ts-btn-primary ts-btn-block" onClick={nextStep1} disabled={saving} aria-busy={saving}>
                {saving ? 'Saving…' : 'Continue →'}
              </button>
            </>
          )}

          {/* ── STEP 2: First client ─────────────────────── */}
          {step === 2 && (
            <>
              <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:6 }}>See it with a real return</div>
              <div style={{ fontSize:14, color:'var(--color-muted)', marginBottom:24, lineHeight:1.6 }}>Choose a PDF to read on your device (it is never uploaded) — or use our demo return to see TaxStory in action without any client data.</div>

              {/* Upload zone */}
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border:`2px dashed ${file?'var(--color-purple)':'var(--color-border)'}`, borderRadius:12, padding:'24px 20px', textAlign:'center', cursor:'pointer', background:file?'var(--color-purple-3)':'var(--color-soft-white)', marginBottom:12, transition:'all .15s' }}
              >
                <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 8 }}><Icon name="upload" size={24} /></div>
                <div style={{ fontSize:14, fontWeight:600, color:file?'var(--color-purple)':'var(--color-dark)' }}>{file ? file.name : 'Drop a PDF or click to browse'}</div>
                <div style={{ fontSize:12, color:'var(--color-muted)', marginTop:4 }}>Form 1040 · Max 25 MB · read on your device, never uploaded</div>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={handleFileChange} />
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ flex:1, height:1, background:'var(--color-border)' }} />
                <div style={{ fontSize:12, color:'var(--color-muted)' }}>or</div>
                <div style={{ flex:1, height:1, background:'var(--color-border)' }} />
              </div>

              <button
                style={{ ...s.pill(useDemo), width:'100%', marginBottom:20, textAlign:'center' }}
                onClick={() => { setUseDemo(true); setFile(null); setParseResult(null); }}
              >
                <Icon name="clipboard" /> Use demo return — no PDF needed
              </button>

              {/* Parse button */}
              {!parseResult && (
                <button
                  className="ts-btn ts-btn-primary ts-btn-block" style={{ marginBottom:12 }}
                  onClick={handleParse}
                  disabled={parsing || (!file && !useDemo)} aria-busy={parsing}
                >
                  {parsing ? 'Parsing return…' : useDemo ? 'Load demo return →' : 'Parse PDF →'}
                </button>
              )}

              {/* Parse result preview */}
              {parseResult && (
                <div style={{ background:'var(--color-purple-4)', border:'1px solid var(--color-blue-mid-bg)', borderRadius:12, padding:16, marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--color-purple)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                    {parseResult.demo ? 'Demo return' : 'Return parsed'} · {parseResult.taxYear} · {parseResult.filingStatus}
                  </div>
                  {[
                    ['Wages / gross income', `$${parseResult.wages?.toLocaleString()}`],
                    ['Adjusted gross income', `$${parseResult.adjustedGrossIncome?.toLocaleString()}`],
                    ['Taxable income', `$${parseResult.taxableIncome?.toLocaleString()}`],
                    ['Total federal tax', `$${parseResult.totalTax?.toLocaleString()}`],
                    ['Effective rate', `${parseResult.effectiveRate}%`],
                    [parseResult.isRefund ? 'Refund' : 'Amount owed', `$${Math.abs(parseResult.refundOrOwed)?.toLocaleString()}`],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(107,92,231,.1)', fontSize:13 }}>
                      <span style={{ color:'var(--color-muted)' }}>{k}</span>
                      <span style={{ fontWeight:600, color:'var(--color-dark)' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop:10, fontSize:12, color:'var(--color-purple)', fontWeight:600 }}>
                    ✓ Ready to generate a client walkthrough video
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:8 }}>
                <button className="ts-btn ts-btn-ghost ts-btn-block" style={{ flex:1 }} onClick={() => setStep(1)}>← Back</button>
                <button className="ts-btn ts-btn-primary ts-btn-block" style={{ flex:2 }} onClick={nextStep2} disabled={saving || !parseResult} aria-busy={saving}>
                  {saving ? 'Saving…' : 'Continue →'}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: Branding ─────────────────────────── */}
          {step === 3 && (
            <>
              <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:6 }}>Make it yours</div>
              <div style={{ fontSize:14, color:'var(--color-muted)', marginBottom:24, lineHeight:1.6 }}>Your brand appears in every client-facing video and email. Takes 60 seconds.</div>

              {/* Logo upload */}
              <div style={{ marginBottom:20 }}>
                <label className="ts-fl">Firm logo <span style={{ fontWeight:400, color:'var(--color-muted-light)' }}>optional · PNG or SVG recommended</span></label>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div
                    onClick={() => logoRef.current?.click()}
                    style={{ width:72, height:72, borderRadius:12, border:'2px dashed var(--color-border)', background:'var(--color-soft-white)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', flexShrink:0 }}
                  >
                    {logoPreview
                      ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                      : <span style={{ fontSize:24 }}><Icon name="building" /> </span>
                    }
                  </div>
                  <div>
                    <button style={{ ...s.pill(false), fontSize:12 }} onClick={() => logoRef.current?.click()}>
                      {logoPreview ? 'Change logo' : 'Upload logo'}
                    </button>
                    <div style={{ fontSize:11, color:'var(--color-muted-light)', marginTop:6 }}>Max 2 MB · appears on videos & emails</div>
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange} />
                </div>
              </div>

              {/* Brand color */}
              <div style={{ marginBottom:28 }}>
                <label className="ts-fl">Brand color</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                  {COLORS.map(c => (
                    <div
                      key={c}
                      onClick={() => setBrandColor(c)}
                      style={{ width:36, height:36, borderRadius:8, background:c, cursor:'pointer', outline:brandColor===c?`3px solid ${c}`:'3px solid transparent', outlineOffset:2, transition:'outline .1s' }}
                    />
                  ))}
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:brandColor, border:'1px solid var(--color-border)' }} />
                    <input type="color" aria-label="Brand colour" value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ width:36, height:36, padding:0, border:'none', background:'transparent', cursor:'pointer' }} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div style={{ background:'var(--color-dark)', borderRadius:12, padding:16, marginBottom:24, display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:8, background:brandColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                  {logoPreview ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:6 }} alt="" /> : ''}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{firmName || 'Your Firm'}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.45)' }}>This is how clients see your brand in every walkthrough</div>
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="ts-btn ts-btn-ghost ts-btn-block" style={{ flex:1 }} onClick={() => setStep(2)}>← Back</button>
                <button className="ts-btn ts-btn-primary ts-btn-block" style={{ flex:2 }} onClick={finish} disabled={saving} aria-busy={saving}>
                  {saving ? 'Setting up your account…' : 'Launch TaxStory'}
                </button>
              </div>

              <button
                style={{ width:'100%', background:'transparent', border:'none', color:'var(--color-muted-light)', fontSize:12, cursor:'pointer', marginTop:12, fontFamily:'inherit', padding:8 }}
                onClick={() => { setBrandColor('var(--color-purple)'); finish(); }}
              >
                Skip branding for now →
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize:11, color:'var(--color-muted-light)', marginTop:20, textAlign:'center' }}>
        Your return PDFs never leave your device · <a href="https://tellmytaxstory.com" style={{ color:'var(--color-purple)', textDecoration:'none' }}>TaxStory</a>
      </div>
    </div>
  );
}
