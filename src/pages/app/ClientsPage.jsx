// src/pages/app/ClientsPage.jsx
// Fully dynamic — pulls real client data with per-client projection + video counts

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const EMPTY_FORM = { name:'', email:'', phone:'', type:'cpa', firm_name:'', notes:'' };

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list');
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('all');

  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));

  useEffect(() => { if (user) fetchClients(); }, [user]);

  async function fetchClients() {
    setLoading(true);

    // Fetch clients with related projection + video counts in parallel
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!clientData) { setLoading(false); return; }

    // Fetch projection counts per client (tax_returns + ria_projections)
    const clientIds = clientData.map(c => c.id);
    if (clientIds.length === 0) { setClients([]); setLoading(false); return; }

    const [
      { data: taxReturns },
      { data: riaProj },
      { data: videos },
      { data: messages },
    ] = await Promise.all([
      supabase.from('tax_returns').select('client_id, created_at').in('client_id', clientIds),
      supabase.from('ria_projections').select('client_id, created_at').in('client_id', clientIds),
      supabase.from('tax_returns').select('client_id, created_at').in('client_id', clientIds).eq('status', 'audio_ready'),
      supabase.from('messages').select('client_id, created_at').in('client_id', clientIds).order('created_at', { ascending: false }),
    ]);

    // Build per-client lookup maps
    const trCount  = {};
    const riaCount = {};
    const vidCount = {};
    const lastMsg  = {};

    for (const r of taxReturns  || []) trCount[r.client_id]  = (trCount[r.client_id]  || 0) + 1;
    for (const r of riaProj     || []) riaCount[r.client_id] = (riaCount[r.client_id] || 0) + 1;
    for (const r of videos      || []) vidCount[r.client_id] = (vidCount[r.client_id] || 0) + 1;
    for (const m of messages    || []) { if (!lastMsg[m.client_id]) lastMsg[m.client_id] = m.created_at; }

    const enriched = clientData.map(c => ({
      ...c,
      projectionCount: (trCount[c.id] || 0) + (riaCount[c.id] || 0),
      videoCount:      vidCount[c.id]  || 0,
      lastActivity:    lastMsg[c.id] || c.created_at,
    }));

    setClients(enriched);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (view === 'new') {
        const { error } = await supabase.from('clients').insert({ ...form, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').update(form).eq('id', selected.id);
        if (error) throw error;
      }
      await fetchClients();
      setView('list'); setForm(EMPTY_FORM);
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this client? All associated data will be unlinked.')) return;
    await supabase.from('clients').delete().eq('id', id);
    await fetchClients();
    if (selected?.id === id) setView('list');
  }

  function openNew()   { setForm(EMPTY_FORM); setError(''); setView('new'); }
  function openEdit(c) { setSelected(c); setForm({ name:c.name, email:c.email||'', phone:c.phone||'', type:c.type, firm_name:c.firm_name||'', notes:c.notes||'' }); setError(''); setView('edit'); }
  function openDetail(c) { setSelected(c); setView('detail'); }

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'all' || c.type === filterType;
    return matchSearch && matchType;
  });

  const cpaCnt = clients.filter(c => c.type === 'cpa').length;
  const riaCnt = clients.filter(c => c.type === 'ria').length;
  const activeCnt = clients.filter(c => new Date(c.lastActivity) > new Date(Date.now() - 30*86400000)).length;

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }

  // ── LIST ──
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Client list</div><div className="ts-page-sub">All clients across CPA and RIA</div></div>
        <button className="ts-btn ts-btn-primary" onClick={openNew}>+ Add client</button>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          { l:'Total clients',    v: loading ? '—' : clients.length },
          { l:'CPA clients',      v: loading ? '—' : cpaCnt },
          { l:'RIA clients',      v: loading ? '—' : riaCnt },
          { l:'Active this month',v: loading ? '—' : activeCnt },
        ].map(k => (
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div></div>
        ))}
      </div>

      <div className="ts-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px',gap:'10px',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:'6px'}}>
            {['all','cpa','ria'].map(t => (
              <button key={t} onClick={()=>setFilterType(t)} className={`ts-btn ts-btn-sm ${filterType===t?'ts-btn-primary':'ts-btn-secondary'}`}>
                {t==='all'?'All':t.toUpperCase()}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search clients…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:'200px',fontSize:'12px',padding:'7px 11px'}} />
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'40px',color:'var(--muted)'}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px'}}>
            <div style={{fontSize:'36px',marginBottom:'12px'}}>👤</div>
            <div style={{fontSize:'14px',color:'var(--muted)',marginBottom:'16px'}}>
              {search ? 'No clients match your search.' : 'No clients yet. Add your first client to get started.'}
            </div>
            {!search && <button className="ts-btn ts-btn-primary" onClick={openNew}>+ Add first client</button>}
          </div>
        ) : (
          <table className="ts-tbl">
            <thead><tr><th>Name</th><th>Type</th><th>Projections</th><th>Videos</th><th>Last activity</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="ts-rn" style={{cursor:'pointer',color:'var(--purple)'}} onClick={()=>openDetail(c)}>{c.name}</div>
                    {c.firm_name && <div className="ts-rm">{c.firm_name}</div>}
                  </td>
                  <td><span className={`ts-pill ${c.type==='ria'?'ts-p-amber':'ts-p-dark'}`}>{c.type.toUpperCase()}</span></td>
                  <td style={{fontWeight:600}}>{c.projectionCount}</td>
                  <td style={{fontWeight:600}}>{c.videoCount}</td>
                  <td style={{fontSize:'12px',color:'var(--muted)'}}>{fmtDate(c.lastActivity)}</td>
                  <td style={{display:'flex',gap:'6px'}}>
                    <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>openDetail(c)}>View →</button>
                    <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={()=>openEdit(c)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── NEW / EDIT ──
  if (view === 'new' || view === 'edit') return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to clients</button>
      <div className="ts-hrow">
        <div><div className="ts-page-title">{view==='new'?'Add client':'Edit client'}</div></div>
      </div>
      <div style={{maxWidth:'640px',display:'flex',flexDirection:'column',gap:'14px'}}>
        <div className="ts-card">
          <div className="ts-card-title">Client details</div>
          <div className="ts-frow"><label className="ts-fl">Client name <span>*</span></label><input type="text" value={form.name} onChange={upd('name')} placeholder="Full name or trust name" /></div>
          <div className="ts-input-row">
            <div className="ts-frow"><label className="ts-fl">Type</label>
              <div className="ts-seg">
                <div className={`ts-seg-btn${form.type==='cpa'?' sel':''}`} onClick={()=>setForm(f=>({...f,type:'cpa'}))}>CPA</div>
                <div className={`ts-seg-btn${form.type==='ria'?' sel':''}`} onClick={()=>setForm(f=>({...f,type:'ria'}))}>RIA</div>
              </div>
            </div>
            <div className="ts-frow"><label className="ts-fl">Firm name <span>optional</span></label><input type="text" value={form.firm_name} onChange={upd('firm_name')} placeholder="Client's firm or employer" /></div>
          </div>
          <div className="ts-input-row">
            <div className="ts-frow"><label className="ts-fl">Email</label><input type="email" value={form.email} onChange={upd('email')} placeholder="client@example.com" /></div>
            <div className="ts-frow"><label className="ts-fl">Phone</label><input type="text" value={form.phone} onChange={upd('phone')} placeholder="(555) 000-0000" /></div>
          </div>
          <div className="ts-frow"><label className="ts-fl">Notes <span>optional</span></label><textarea value={form.notes} onChange={upd('notes')} style={{height:'80px',resize:'none'}} placeholder="Any relevant notes…" /></div>
        </div>
        {error && <div style={{background:'#FEE2E2',border:'1px solid #FECACA',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
        <div style={{display:'flex',gap:'10px'}}>
          <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
          <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?'Saving…':view==='new'?'Add client':'Save changes'}</button>
        </div>
      </div>
    </div>
  );

  // ── DETAIL ──
  const c = selected;
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to clients</button>
      <div className="ts-hrow">
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          <div className="ts-av-lg">{c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
          <div>
            <div className="ts-page-title">{c.name}</div>
            <div className="ts-page-sub">
              <span className={`ts-pill ${c.type==='ria'?'ts-p-amber':'ts-p-dark'}`} style={{marginRight:'8px'}}>{c.type.toUpperCase()}</span>
              {c.firm_name && `${c.firm_name} · `}Added {new Date(c.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(c.id)}>Delete</button>
          <button className="ts-btn ts-btn-secondary" onClick={()=>openEdit(c)}>Edit</button>
        </div>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          { l:'Projections', v: c.projectionCount },
          { l:'Videos',      v: c.videoCount },
          { l:'Last activity', v: fmtDate(c.lastActivity) },
          { l:'Client since',  v: new Date(c.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}) },
        ].map(k => (
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val" style={{fontSize:'20px'}}>{k.v}</div></div>
        ))}
      </div>

      <div className="ts-g2">
        <div className="ts-card">
          <div className="ts-card-title">Contact information</div>
          {[['Email',c.email||'—'],['Phone',c.phone||'—'],['Type',c.type.toUpperCase()],['Firm',c.firm_name||'—']].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #F0EEF8',fontSize:'13px'}}>
              <span style={{color:'var(--muted)'}}>{k}</span>
              <span style={{fontWeight:500,color:'var(--dark)'}}>{v}</span>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Notes</div>
          <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.7}}>{c.notes||'No notes yet.'}</div>
        </div>
      </div>
    </div>
  );
}
