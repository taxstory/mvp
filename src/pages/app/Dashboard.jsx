import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 172800) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { creditsRemaining, creditsTotal, projectionsRemaining } = useSubscription();
  const [stats, setStats]       = useState(null);
  const [activity, setActivity] = useState([]);
  const [clients, setClients]   = useState([]);
  const [unread, setUnread]     = useState(0);
  const [loading, setLoading]   = useState(true);

  const name = profile?.firm_name?.split(' ')[0] || 'there';
  const credits = creditsRemaining ?? 0;
  const creditTotal = creditsTotal ?? 100;
  const creditPct = creditTotal > 0 ? Math.round((credits / creditTotal) * 100) : 0;

  useEffect(() => {
    if (!profile?.id) return;
    fetchAll();
  }, [profile]);

  async function fetchAll() {
    setLoading(true);
    const uid = profile.id;

    const [
      { count: clientCount },
      { count: taxReturnCount },
      { count: riaCount },
      { count: videoCount },
      { count: unreadCount },
      { data: recentClients },
      { data: recentActivity },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('tax_returns').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('ria_projections').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('tax_returns').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'audio_ready'),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('direction', 'inbound').eq('read', false),
      supabase.from('clients').select('id,name,type,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('audit_log').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(8),
    ]);

    setStats({
      clients:    clientCount  || 0,
      projections:(taxReturnCount || 0) + (riaCount || 0),
      cpaCount:   taxReturnCount || 0,
      riaCount:   riaCount || 0,
      videos:     videoCount || 0,
    });
    setClients(recentClients || []);
    setActivity(recentActivity || []);
    setUnread(unreadCount || 0);
    setLoading(false);
  }

  const activityColor = (type) => {
    if (type?.includes('video'))  return 'var(--purple)';
    if (type?.includes('intake')) return 'var(--amber)';
    if (type?.includes('message'))return 'var(--teal)';
    return 'var(--dark)';
  };

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">{greeting()}, {name} 👋</div>
          <div className="ts-page-sub">
            {profile?.firm_name || 'Your firm'} · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <Link to="/cpa/projections" className="ts-btn ts-btn-primary">+ New projection</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {loading ? (
          Array(4).fill(0).map((_,i) => (
            <div className="ts-kpi" key={i} style={{opacity:.4}}>
              <div className="ts-kpi-label">Loading…</div>
              <div className="ts-kpi-val">—</div>
            </div>
          ))
        ) : [
          { label:'Total clients',    val: stats.clients,    sub: `${stats.clients === 1 ? '1 client' : `${stats.clients} clients`} on file` },
          { label:'Projections run',  val: stats.projections,sub: `${stats.cpaCount} CPA · ${stats.riaCount} RIA` },
          { label:'Videos generated', val: stats.videos,     sub: 'Audio walkthroughs' },
          { label:'Video credits',    val: credits,          sub: `of ${creditTotal} remaining this year` },
        ].map(k => (
          <div className="ts-kpi" key={k.label}>
            <div className="ts-kpi-label">{k.label}</div>
            <div className="ts-kpi-val">{k.val}</div>
            <div className="ts-kpi-delta ts-delta-nt">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Credit banner */}
      <div className="ts-hero-banner">
        <span style={{fontSize:'22px'}}>🎬</span>
        <div style={{flex:1}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'white',marginBottom:'5px'}}>
            Video credits — {credits} of {creditTotal} remaining
          </div>
          <div className="ts-progress-track">
            <div className="ts-progress-fill" style={{width:`${creditPct}%`}} />
          </div>
        </div>
        {unread > 0 && (
          <Link to="/messages" style={{background:'rgba(255,255,255,0.12)',borderRadius:'8px',padding:'6px 12px',fontSize:'11px',fontWeight:700,color:'white',textDecoration:'none'}}>
            💬 {unread} unread
          </Link>
        )}
        <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm">Manage plan</Link>
      </div>

      <div className="ts-g2m">
        <div>
          {/* Tool cards — live counts */}
          <div className="ts-g3" style={{marginBottom:'12px'}}>
            {[
              { to:'/cpa/projections', icon:'📊', label:'CPA Projections', sub:'Completed returns', val: loading ? '—' : stats.cpaCount, unit:'returns' },
              { to:'/ria/projections', icon:'📈', label:'RIA Projections',  sub:'Multi-year planning', val: loading ? '—' : stats.riaCount, unit:'clients' },
              { to:'/cpa/video',       icon:'🎬', label:'Video Generator', sub:'Client walkthroughs', val: loading ? '—' : stats.videos, unit:'videos' },
            ].map(c => (
              <Link key={c.to} to={c.to} className="ts-card" style={{cursor:'pointer',textDecoration:'none',display:'block'}}>
                <div style={{width:'36px',height:'36px',borderRadius:'10px',background:'var(--purple3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',marginBottom:'10px'}}>{c.icon}</div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--dark)'}}>{c.label}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{c.sub}</div>
                <div style={{fontFamily:'Playfair Display,serif',fontSize:'22px',fontWeight:700,color:'var(--dark)',marginTop:'8px'}}>
                  {c.val}<span style={{fontSize:'11px',fontWeight:400,fontFamily:'Inter,sans-serif',color:'var(--muted)',marginLeft:'4px'}}>{c.unit}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent clients */}
          <div className="ts-card">
            <div className="ts-card-title">Recent clients <span className="ts-card-sub"><Link to="/clients" style={{color:'var(--purple)',textDecoration:'none',fontWeight:600}}>View all →</Link></span></div>
            {loading ? (
              <div style={{padding:'20px 0',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading…</div>
            ) : clients.length === 0 ? (
              <div style={{padding:'20px 0',textAlign:'center'}}>
                <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'10px'}}>No clients yet.</div>
                <Link to="/clients" className="ts-btn ts-btn-ghost ts-btn-sm">+ Add first client</Link>
              </div>
            ) : clients.map((c, i) => (
              <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:i<clients.length-1?'1px solid #F0EEF8':'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                  <div className="ts-av-sm">{c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style={{fontSize:'12px',fontWeight:600,color:'var(--dark)'}}>{c.name}</div>
                    <div style={{fontSize:'10px',color:'var(--muted)'}}>{timeAgo(c.created_at)}</div>
                  </div>
                </div>
                <span className={`ts-pill ${c.type==='ria'?'ts-p-amber':'ts-p-dark'}`}>{c.type?.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          {/* Quick actions */}
          <div className="ts-card">
            <div className="ts-card-title">Quick actions</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              {[
                {to:'/cpa/projections', icon:'📊', label:'CPA projection',   sub:'New analysis'},
                {to:'/ria/projections', icon:'📈', label:'RIA projection',    sub:'Multi-year scenario'},
                {to:'/cpa/video',       icon:'🎬', label:'Generate video',   sub:`${credits} credits left`},
                {to:'/intake',          icon:'📋', label:'Send intake form', sub:'New client'},
              ].map(a => (
                <Link key={a.to} to={a.to} style={{background:'var(--purple3)',borderRadius:'10px',padding:'10px 12px',cursor:'pointer',textDecoration:'none',display:'block'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--dark)'}}>{a.icon} {a.label}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>{a.sub}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent activity from audit_log */}
          <div className="ts-card" style={{flex:1}}>
            <div className="ts-card-title">Recent activity</div>
            {loading ? (
              <div style={{padding:'20px 0',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading…</div>
            ) : activity.length === 0 ? (
              <div style={{padding:'20px 0',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No activity yet. Start by running a projection.</div>
            ) : activity.map((a, i) => (
              <div className="ts-af" key={a.id||i}>
                <div className="ts-af-dot" style={{background:activityColor(a.action)}} />
                <div>
                  <div style={{fontSize:'12px',color:'var(--dark)'}}>{a.description || a.action || 'Activity'}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: empty state or projections prompt */}
      {!loading && stats.projections === 0 && (
        <div className="ts-card" style={{textAlign:'center',padding:'40px 20px',marginTop:'16px'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>🚀</div>
          <div style={{fontFamily:'Playfair Display,serif',fontSize:'18px',fontWeight:700,color:'var(--dark)',marginBottom:'8px'}}>Ready to run your first projection?</div>
          <div style={{fontSize:'13px',color:'var(--muted)',maxWidth:'360px',margin:'0 auto 20px'}}>Upload a completed tax return PDF and TaxStory will parse it and generate a personalized client video in 90 seconds.</div>
          <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
            <Link to="/cpa/projections" className="ts-btn ts-btn-primary">📊 CPA Projection</Link>
            <Link to="/ria/projections" className="ts-btn ts-btn-ghost">📈 RIA Projection</Link>
          </div>
        </div>
      )}
    </div>
  );
}
