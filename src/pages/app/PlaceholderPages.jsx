import { Link } from 'react-router-dom';

// Shared placeholder for screens that are UI-complete but not yet wired to backend
function ComingSoon({ title, sub, icon }) {
  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">{title}</div><div className="ts-page-sub">{sub}</div></div>
      </div>
      <div style={{textAlign:'center',padding:'60px 20px'}}>
        <div style={{fontSize:'48px',marginBottom:'16px'}}>{icon}</div>
        <div style={{fontFamily:'Playfair Display,serif',fontSize:'20px',fontWeight:700,color:'var(--dark)',marginBottom:'8px'}}>Coming soon</div>
        <div style={{fontSize:'14px',color:'var(--muted)'}}>This feature is in development and will be available soon.</div>
      </div>
    </div>
  );
}

export function ClientsPage() {
  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Client list</div><div className="ts-page-sub">All clients across CPA and RIA</div></div>
        <button className="ts-btn ts-btn-primary">+ Add client</button>
      </div>
      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[{l:'Total clients',v:'31'},{l:'CPA clients',v:'23'},{l:'RIA clients',v:'8'},{l:'Active this month',v:'14'}].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div></div>
        ))}
      </div>
      <div className="ts-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)'}}>All clients</div>
          <input type="text" placeholder="Search clients…" style={{width:'200px',fontSize:'12px',padding:'7px 11px'}} />
        </div>
        <table className="ts-tbl">
          <thead><tr><th>Name</th><th>Type</th><th>Projections</th><th>Videos</th><th>Last activity</th><th>Actions</th></tr></thead>
          <tbody>
            {[
              {n:'Sarah & Michael Chen',t:'CPA',p:3,v:2,d:'Mar 18'},
              {n:'Jennifer Marsh',t:'RIA',p:2,v:1,d:'Mar 12'},
              {n:'Robert Keller',t:'CPA',p:2,v:1,d:'Mar 15'},
              {n:'Torres Family Trust',t:'CPA',p:1,v:0,d:'Mar 8'},
              {n:'David & Sue Kim',t:'RIA',p:2,v:0,d:'Feb 28'},
              {n:'Marcus Washington',t:'RIA',p:1,v:0,d:'Feb 20'},
            ].map((c,i)=>(
              <tr key={i}>
                <td><div className="ts-rn">{c.n}</div></td>
                <td><span className={`ts-pill ${c.t==='RIA'?'ts-p-amber':'ts-p-dark'}`}>{c.t}</span></td>
                <td>{c.p}</td><td>{c.v}</td>
                <td style={{color:'var(--muted)',fontSize:'12px'}}>{c.d}</td>
                <td><button className="ts-btn ts-btn-ghost ts-btn-sm">View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DocumentsPage()  { return <ComingSoon title="Documents"      sub="Client document storage and sharing"     icon="🗂" />; }
export function MessagesPage()   { return <ComingSoon title="Messages"       sub="Client communication hub"               icon="💬" />; }
export function IntakePage()     { return <ComingSoon title="Client Intake"  sub="Digital intake forms for new clients"   icon="📋" />; }
export function ESignPage()      { return <ComingSoon title="E-Signatures"   sub="Send and collect signatures digitally"  icon="✍️" />; }
export function ReportsPage()    { return <ComingSoon title="Reports & Exports" sub="Generate firm-wide reports and PDFs" icon="📄" />; }
export function InvoicesPage()   { return <ComingSoon title="Invoicing"      sub="Track and send client invoices"         icon="💰" />; }
export function HelpPage()       { return <ComingSoon title="Help & Support" sub="Guides, docs, and ways to reach us"    icon="?"  />; }
