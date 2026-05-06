import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';

export default function Dashboard() {
  const { profile } = useAuth();
  const { creditsRemaining } = useSubscription();
  const name = profile?.firm_name?.split(' ')[0] || 'Zach';
  const credits = creditsRemaining ?? 62;

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Good morning, {name} 👋</div>
          <div className="ts-page-sub">{profile?.firm_name || 'Lakeside Advisory Group'} · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-secondary">Download report</button>
          <Link to="/cpa/projections" className="ts-btn ts-btn-primary">+ New projection</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="ts-g5">
        {[
          {label:'Total clients',     val:'31',    delta:'▲ 3 this month',    cls:'ts-delta-up'},
          {label:'Projections run',   val:'22',    delta:'14 CPA · 8 RIA',    cls:'ts-delta-nt'},
          {label:'Videos generated',  val:'38',    delta:'▲ 6 this month',    cls:'ts-delta-up'},
          {label:'Avg eff. rate',     val:'21.4%', delta:'▼ 0.8% vs last yr', cls:'ts-delta-dn'},
          {label:'Total tax saved',   val:'$142k', delta:'▲ RIA clients',     cls:'ts-delta-up'},
        ].map(k => (
          <div className="ts-kpi" key={k.label}>
            <div className="ts-kpi-label">{k.label}</div>
            <div className="ts-kpi-val">{k.val}</div>
            <div className={`ts-kpi-delta ${k.cls}`}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Credit banner */}
      <div className="ts-hero-banner">
        <span style={{fontSize:'22px'}}>🎬</span>
        <div style={{flex:1}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'white',marginBottom:'5px'}}>Video credits — {credits} of 100 remaining</div>
          <div className="ts-progress-track"><div className="ts-progress-fill" style={{width:`${credits}%`}} /></div>
        </div>
        <div style={{fontSize:'12px',color:'rgba(255,255,255,0.7)',fontWeight:500}}>Resets Jan 1, 2027</div>
        <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm">Buy more</Link>
        <div style={{background:'rgba(255,255,255,0.12)',borderRadius:'8px',padding:'6px 12px',fontSize:'11px',fontWeight:700,color:'white'}}>3 unread messages</div>
      </div>

      <div className="ts-g2m">
        <div>
          {/* Tool cards */}
          <div className="ts-g3" style={{marginBottom:'12px'}}>
            {[
              {to:'/cpa/projections', icon:'📊', label:'CPA Projections', sub:'Completed returns', val:'14', unit:'clients'},
              {to:'/ria/projections', icon:'📈', label:'RIA Projections',  sub:'Multi-year planning', val:'8', unit:'clients'},
              {to:'/cpa/video',       icon:'🎬', label:'Video Generator', sub:'Client walkthroughs', val:'38', unit:'videos'},
            ].map(c => (
              <Link key={c.to} to={c.to} className="ts-card" style={{cursor:'pointer',textDecoration:'none',display:'block'}}>
                <div style={{width:'36px',height:'36px',borderRadius:'10px',background:'var(--purple3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',marginBottom:'10px'}}>{c.icon}</div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--dark)'}}>{c.label}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{c.sub}</div>
                <div style={{fontFamily:'Playfair Display, serif',fontSize:'22px',fontWeight:700,color:'var(--dark)',marginTop:'8px'}}>
                  {c.val}<span style={{fontSize:'11px',fontWeight:400,fontFamily:'Inter,sans-serif',color:'var(--muted)',marginLeft:'4px'}}>{c.unit}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Bar chart */}
          <div className="ts-card">
            <div className="ts-card-title">Monthly activity <span className="ts-card-sub">last 6 months</span></div>
            <div style={{display:'flex',gap:'16px',marginBottom:'10px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'var(--muted)',fontWeight:600}}><div style={{width:'9px',height:'9px',borderRadius:'2px',background:'var(--purple)'}} />Projections</div>
              <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'var(--muted)',fontWeight:600}}><div style={{width:'9px',height:'9px',borderRadius:'2px',background:'var(--amber)'}} />Videos</div>
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:'8px',height:'88px'}}>
              {[['Oct',28,14,4],['Nov',20,20,3],['Dec',44,28,7],['Jan',56,38,9],['Feb',50,46,8],['Mar',38,54,6]].map(([mo,p,v,n]) => (
                <div key={mo} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                  <div style={{fontSize:'9px',color:'var(--muted)'}}>{n}</div>
                  <div style={{width:'100%',height:`${p}px`,borderRadius:'4px 4px 0 0',background:'var(--purple)',opacity:.7}} />
                  <div style={{width:'100%',height:`${v}px`,borderRadius:'4px 4px 0 0',background:'var(--amber)',opacity:.8,marginTop:'2px'}} />
                  <div style={{fontSize:'9px',color:'var(--muted)'}}>{mo}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          {/* Quick actions */}
          <div className="ts-card">
            <div className="ts-card-title">Quick actions</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              {[
                {to:'/cpa/projections', icon:'📊', label:'CPA projection',  sub:'New analysis'},
                {to:'/ria/projections', icon:'📈', label:'RIA projection',   sub:'Multi-year scenario'},
                {to:'/cpa/video',       icon:'🎬', label:'Generate video',  sub:'1 credit · Pro'},
                {to:'/intake',          icon:'📋', label:'Send intake form', sub:'New client'},
              ].map(a => (
                <Link key={a.to} to={a.to} style={{background:'var(--purple3)',borderRadius:'10px',padding:'10px 12px',cursor:'pointer',textDecoration:'none',display:'block'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--dark)'}}>{a.icon} {a.label}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>{a.sub}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div className="ts-card" style={{flex:1}}>
            <div className="ts-card-title">Recent activity</div>
            {[
              {color:'var(--purple)', text:'Video script for', name:'Sarah Chen',     time:'2 hours ago'},
              {color:'var(--amber)',  text:'Intake completed —', name:'J. Marsh',     time:'Yesterday'},
              {color:'var(--dark)',   text:'E-sign sent —',       name:'Torres Trust', time:'Mar 17'},
              {color:'var(--green)',  text:'Invoice paid —',       name:'R. Keller · $350', time:'Mar 15'},
            ].map((a,i) => (
              <div className="ts-af" key={i}>
                <div className="ts-af-dot" style={{background:a.color}} />
                <div>
                  <div style={{fontSize:'12px',color:'var(--dark)'}}>{a.text} <strong>{a.name}</strong></div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="ts-g3b">
        {/* Top clients */}
        <div className="ts-card">
          <div className="ts-card-title">Top clients <span className="ts-card-sub">by activity</span></div>
          {[
            {initials:'SC',name:'S. & M. Chen',  sub:'3 projections · 2 videos', badge:'CPA',cls:'ts-p-dark'},
            {initials:'JM',name:'Jennifer Marsh', sub:'2 projections · 1 video',  badge:'RIA',cls:'ts-p-amber'},
            {initials:'RK',name:'Robert Keller',  sub:'2 projections · 1 video',  badge:'CPA',cls:'ts-p-dark'},
            {initials:'TF',name:'Torres Family',  sub:'1 projection · 0 videos',  badge:'CPA',cls:'ts-p-dark'},
          ].map((c,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:i<3?'1px solid #F0EEF8':'none'}}>
              <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                <div className="ts-av-sm">{c.initials}</div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:600,color:'var(--dark)'}}>{c.name}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{c.sub}</div>
                </div>
              </div>
              <span className={`ts-pill ${c.cls}`}>{c.badge}</span>
            </div>
          ))}
        </div>

        {/* Bracket distribution */}
        <div className="ts-card">
          <div className="ts-card-title">Bracket distribution <span className="ts-card-sub">CPA clients</span></div>
          {[['10%','15%',2,0.3],['12%','25%',3,0.45],['22%','55%',7,0.7],['24%','32%',4,0.88],['32%+','16%',2,1]].map(([br,w,n,op],i) => (
            <div key={br} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 0',borderBottom:i<4?'1px solid #F0EEF8':'none'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--dark)',width:'34px'}}>{br}</div>
              <div style={{flex:1,background:'#F0EEF8',borderRadius:'4px',height:'8px'}}>
                <div style={{width:w,height:'8px',borderRadius:'4px',background:i===4?'var(--red)':'var(--purple)',opacity:op}} />
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)',width:'48px',textAlign:'right'}}>{n} clients</div>
            </div>
          ))}
          <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'1px solid var(--border)',fontSize:'11px',color:'var(--muted)'}}>
            Avg bracket: <strong style={{color:'var(--dark)'}}>22%</strong> · Avg eff. rate: <strong style={{color:'var(--dark)'}}>21.4%</strong>
          </div>
        </div>

        {/* Upcoming */}
        <div className="ts-card">
          <div className="ts-card-title">Upcoming &amp; to-do <span className="ts-card-sub">next 30 days</span></div>
          {[
            {mo:'Mar',d:'25',title:'Tax deadline reminder',sub:'4 clients missing projections'},
            {mo:'Apr',d:'15',title:'Tax filing deadline',  sub:'Send videos to 6 CPA clients'},
            {mo:'Apr',d:'22',title:'Roth window closes',   sub:'Jennifer Marsh — Q1 conversion'},
          ].map((e,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 0',borderBottom:i<2?'1px solid #F0EEF8':'none'}}>
              <div style={{width:'38px',height:'38px',background:'var(--purple3)',borderRadius:'10px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <div style={{fontSize:'8px',color:'var(--purple)',fontWeight:800,textTransform:'uppercase'}}>{e.mo}</div>
                <div style={{fontFamily:'Playfair Display,serif',fontSize:'15px',fontWeight:700,color:'var(--purple)',lineHeight:1}}>{e.d}</div>
              </div>
              <div>
                <div style={{fontSize:'12px',fontWeight:600,color:'var(--dark)'}}>{e.title}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{e.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
