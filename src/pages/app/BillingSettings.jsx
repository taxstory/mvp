import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';

export function BillingPage() {
  const { subscription, tier } = useSubscription();
  return (
    <div className="ts-page">
      <div style={{marginBottom:'24px'}}><div className="ts-page-title">Billing & plans</div><div className="ts-page-sub">CPA Pro · renews April 1, 2027 · $99/mo</div></div>
      <div className="ts-g2" style={{marginTop:'20px'}}>
        <div className="ts-card" style={{border:'2px solid var(--purple)'}}>
          <div style={{fontSize:'10px',background:'var(--purple3)',color:'var(--purple)',padding:'3px 10px',borderRadius:'20px',display:'inline-block',marginBottom:'10px',fontWeight:700}}>Current plan</div>
          <div style={{fontFamily:'Playfair Display,serif',fontSize:'18px',fontWeight:700,color:'var(--dark)',marginBottom:'6px'}}>CPA Pro · $99/mo</div>
          <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.7}}>Unlimited projections · 100 video credits/yr · PDF export · Priority support</div>
        </div>
        <div className="ts-card">
          <div style={{fontFamily:'Playfair Display,serif',fontSize:'18px',fontWeight:700,color:'var(--dark)',marginBottom:'6px'}}>RIA Pro · $149/mo</div>
          <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.7,marginBottom:'14px'}}>RIA projections · 3-scenario modeling · 150 video credits/yr · Roth + TLH tools</div>
          <button className="ts-btn ts-btn-primary">Upgrade to RIA Pro</button>
        </div>
        <div className="ts-card">
          <div style={{fontFamily:'Playfair Display,serif',fontSize:'15px',fontWeight:700,color:'var(--dark)',marginBottom:'8px'}}>Payment method</div>
          <div style={{fontSize:'13px',color:'var(--muted)'}}>Visa ending in 4242 · Expires 12/27 · <span style={{color:'var(--purple)',cursor:'pointer',fontWeight:600}}>Update card</span></div>
        </div>
        <div className="ts-card">
          <div style={{fontFamily:'Playfair Display,serif',fontSize:'15px',fontWeight:700,color:'var(--dark)',marginBottom:'8px'}}>Invoices</div>
          <div style={{fontSize:'13px',color:'var(--muted)'}}>Mar 2026 · Feb 2026 · Jan 2026 · <span style={{color:'var(--purple)',cursor:'pointer',fontWeight:600}}>View all</span></div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { profile } = useAuth();
  const [toggles, setToggles] = useState({tfa:true,timeout:false,video:true,credits:true,invoice:false});
  const toggle = k => setToggles(t=>({...t,[k]:!t[k]}));

  return (
    <div className="ts-page">
      <div style={{marginBottom:'24px'}}><div className="ts-page-title">Settings</div><div className="ts-page-sub">Manage your account, firm details, and preferences</div></div>
      <div className="ts-g2" style={{marginTop:'20px'}}>
        <div className="ts-card">
          <div className="ts-card-title">Firm profile</div>
          <div className="ts-frow"><label className="ts-fl">Firm name</label><input type="text" defaultValue={profile?.firm_name||'Lakeside Advisory Group'} /></div>
          <div className="ts-input-row">
            <div className="ts-frow"><label className="ts-fl">Phone</label><input type="text" defaultValue="(914) 555-0192" /></div>
            <div className="ts-frow"><label className="ts-fl">Website</label><input type="text" defaultValue="lakesideadvisory.com" /></div>
          </div>
          <button className="ts-btn ts-btn-primary ts-btn-sm" style={{marginTop:'4px'}}>Save changes</button>
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Branding</div>
          <div className="ts-frow"><label className="ts-fl">Firm logo</label><div className="ts-upload-zone"><div style={{fontSize:'11px',color:'var(--muted)'}}>Click to upload PNG or SVG · Max 2MB</div></div></div>
          <div className="ts-frow"><label className="ts-fl">Brand color</label>
            <div style={{display:'flex',gap:'9px',alignItems:'center'}}>
              <input type="text" defaultValue="#1A1433" style={{flex:1}} />
              <div style={{width:'34px',height:'34px',borderRadius:'9px',background:'#1A1433',flexShrink:0,border:'1.5px solid var(--border)'}} />
            </div>
          </div>
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Security</div>
          {[{k:'tfa',label:'Two-factor authentication',sub:'Require 2FA on every login'},{k:'timeout',label:'Session timeout',sub:'Auto-logout after 30 minutes'}].map((s,i)=>(
            <div key={s.k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<1?'1px solid #F0EEF8':'none'}}>
              <div><div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{s.label}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{s.sub}</div></div>
              <div className={`ts-toggle${toggles[s.k]?'':' ts-toggle-off'}`} onClick={()=>toggle(s.k)}><div className="ts-toggle-knob" /></div>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Notifications</div>
          {[{k:'video',l:'Video script completed'},{k:'credits',l:'Credits low (10 remaining)'},{k:'invoice',l:'Invoice paid by client'}].map((n,i)=>(
            <div key={n.k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:i<2?'1px solid #F0EEF8':'none'}}>
              <div style={{fontSize:'13px',fontWeight:500,color:'var(--dark)'}}>{n.l}</div>
              <div className={`ts-toggle${toggles[n.k]?'':' ts-toggle-off'}`} onClick={()=>toggle(n.k)}><div className="ts-toggle-knob" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
