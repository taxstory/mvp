// src/pages/app/ClientsPage.jsx
// Fully dynamic — pulls real client data with per-client projection + video counts

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const EMPTY_FORM = { name:'', email:'', phone:'', type:'cpa', firm_name:'', notes:'' };

import { useConfirm } from '../../components/ui/ConfirmProvider';
import { SignedLink } from '../../components/SignedMedia';
import { callFunction } from '../../utils/callFunction';
import { downloadRecords } from '../../utils/records';
import { usePrivacyMode } from '../../hooks/usePrivacyMode';
import { useToast } from '../../components/ui/Toast';

export default function ClientsPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const { labelsOnly } = usePrivacyMode();
  const { user } = useAuth();
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list');
  const [activeClient, setActiveClient] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage]           = useState(1);
  const [selected, setSelectedIds] = useState(new Set()); // client IDs for bulk actions
  const PAGE_SIZE = 10;

  const toggleSelect  = useCallback(id => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }), []);

  const toggleAll = useCallback(ids => {
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
  }, []);

  // PERMANENT deletion. Done by a server function that removes the audio and PDF-summary files first and the rows second
  // (netlify/functions/delete-data.js); deleting rows directly from the browser would leave financial documents behind.
  const DELETE_WARNING = 'This permanently deletes the client and ALL of their projections, walkthroughs, audio files, PDF summaries, share links and messages. It cannot be undone.'+
    ' Your approval records are reduced to a log with no figures, names or notes (kind, version and time only) — use “Download records” first if you need a copy.';
  async function deleteClients(ids) {
    const failed = [];
    for (const id of ids) { try { await callFunction('delete-data', { kind: 'client', id }); } catch (e) { failed.push(e.message); } }
    if (failed.length) toast(`${failed.length} of ${ids.length} could not be deleted: ${failed[0]}`, { variant: 'danger' });
    return failed.length === 0;
  }
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Permanently delete ${selected.size} client${selected.size>1?'s':''}?`, message: DELETE_WARNING, confirmLabel: 'Delete permanently' }))) return;
    await deleteClients([...selected]);
    setSelectedIds(new Set());
    await fetchClients();
  }

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
    if (!form.name.trim()) { setError('A client label is required.'); return; }
    setSaving(true); setError('');
    try {
      if (view === 'new') {
        const { error } = await supabase.from('clients').insert({ ...form, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').update(form).eq('id', activeClient.id);
        if (error) throw error;
      }
      await fetchClients();
      setView('list'); setForm(EMPTY_FORM);
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  const [portalUrl, setPortalUrl]   = useState('');
  const [portalCopied, setPortalCopied] = useState(false);

  async function generatePortalLink(clientId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res  = await fetch('/.netlify/functions/client-portal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body:    JSON.stringify({ clientId }),
    });
    const json = await res.json();
    if (json.ok) {
      setPortalUrl(json.portalUrl);
      await fetchClients();   // picks up the new expiry date and the reset access history set by the database
    }
  }

  function copyPortalUrl() {
    navigator.clipboard.writeText(portalUrl);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2500);
  }

  async function exportRecords(c) {
    try { const n = await downloadRecords({ clientId: c.id, label: c.name }); toast(n ? `Downloaded ${n} approval record${n > 1 ? 's' : ''}.` : 'This client has no approval records; an empty file was downloaded.'); }
    catch (e) { toast(e.message, { variant: 'danger' }); }
  }
  async function handleDelete(id) {
    if (!(await confirm({ title: 'Permanently delete this client?', message: DELETE_WARNING, confirmLabel: 'Delete permanently' }))) return;
    await deleteClients([id]);
    await fetchClients();
    if (activeClient?.id === id) setView('list');
  }

  function openNew()   { setForm(EMPTY_FORM); setError(''); setView('new'); }
  function openEdit(c) { setActiveClient(c); setForm({ name:c.name, email:c.email||'', phone:c.phone||'', type:c.type, firm_name:c.firm_name||'', notes:c.notes||'' }); setError(''); setView('edit'); }
  function openDetail(c) { setActiveClient(c); setView('detail'); }

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (!labelsOnly && c.email?.toLowerCase().includes(search.toLowerCase()));
    const matchType   = filterType === 'all' || c.type === filterType;
    return matchSearch && matchType;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  // Reset to page 1 whenever the filtered set changes (new search/filter)
  useEffect(() => { setPage(1); }, [search, filterType]);

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
          <>
          {/* Bulk action bar — visible when any rows checked */}
          {selected.size > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'var(--color-blue-bg)',borderRadius:9,marginBottom:10,border:'1px solid var(--color-blue-tab)'}}>
              <span style={{fontSize:12.5,fontWeight:600,color:'var(--color-blue)'}}>{selected.size} client{selected.size>1?'s':''} selected</span>
              <button className="ts-btn ts-btn-sm" onClick={()=>setSelectedIds(new Set())}
                style={{background:'transparent',color:'var(--color-muted)',border:'1px solid var(--color-border)',padding:'3px 10px'}}>
                Clear
              </button>
              <button className="ts-btn ts-btn-sm ts-btn-danger" onClick={handleBulkDelete}
                style={{marginLeft:'auto'}}>
                🗑 Delete selected
              </button>
            </div>
          )}

          <table className="ts-tbl">
            <thead><tr>
              <th style={{width:32}}>
                <input type="checkbox"
                  checked={selected.size === paginated.length && paginated.length > 0}
                  onChange={() => toggleAll(paginated.map(c=>c.id))}
                  style={{accentColor:'var(--purple)'}} />
              </th>
              <th>Name</th><th>Type</th><th>Projections</th><th>Videos</th><th>Last activity</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(c => (
                <tr key={c.id} style={{background:selected.has(c.id)?'var(--color-blue-pale)':'transparent'}}>
                  <td style={{width:32}}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelect(c.id)} style={{accentColor:'var(--purple)'}} />
                  </td>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'16px',paddingTop:'14px',borderTop:'1px solid var(--color-purple-faint)'}}>
              <div style={{fontSize:'12px',color:'var(--muted)'}}>
                Showing {(pageClamped-1)*PAGE_SIZE+1}–{Math.min(pageClamped*PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <button className="ts-btn ts-btn-secondary ts-btn-sm" disabled={pageClamped===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Prev</button>
                <span style={{fontSize:'12px',color:'var(--muted)',padding:'0 6px'}}>Page {pageClamped} of {totalPages}</span>
                <button className="ts-btn ts-btn-secondary ts-btn-sm" disabled={pageClamped===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next →</button>
              </div>
            </div>
          )}
          </>
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
          <div className="ts-frow"><label className="ts-fl">Client label <span>* a nickname or initials — not a legal name</span></label><input type="text" value={form.name} onChange={upd('name')} placeholder="e.g. S. Chen, or Client A" /></div>
          <div className="ts-input-row">
            <div className="ts-frow"><label className="ts-fl">Type</label>
              <div className="ts-seg">
                <div className={`ts-seg-btn${form.type==='cpa'?' sel':''}`} onClick={()=>setForm(f=>({...f,type:'cpa'}))}>CPA</div>
                <div className={`ts-seg-btn${form.type==='ria'?' sel':''}`} onClick={()=>setForm(f=>({...f,type:'ria'}))}>RIA</div>
              </div>
            </div>
            <div className="ts-frow"><label className="ts-fl">Firm name <span>optional</span></label><input type="text" value={form.firm_name} onChange={upd('firm_name')} placeholder="Client's firm or employer" /></div>
          </div>
          {labelsOnly ? (
            <div style={{fontSize:12,color:'var(--muted)',background:'var(--purple4)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',marginBottom:14,lineHeight:1.6}}>
              🔒 <strong>Labels-only mode is on.</strong> TaxStory does not store client emails or phone numbers. When you send a walkthrough you can type the
              recipient's address — it is used once and not saved — or copy the link. You can change this in Settings.
            </div>
          ) : (
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Email</label><input type="email" value={form.email} onChange={upd('email')} placeholder="client@example.com" /></div>
              <div className="ts-frow"><label className="ts-fl">Phone</label><input type="text" value={form.phone} onChange={upd('phone')} placeholder="(555) 000-0000" /></div>
            </div>
          )}
          <div className="ts-frow"><label className="ts-fl">Notes <span>optional</span></label><textarea value={form.notes} onChange={upd('notes')} style={{height:'80px',resize:'none'}} placeholder="Any relevant notes…" /></div>
        </div>
        {error && <div style={{background:'var(--color-red-light)',border:'1px solid var(--color-red-border)',color:'var(--color-red-dark)',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
        <div style={{display:'flex',gap:'10px'}}>
          <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
          <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?'Saving…':view==='new'?'Add client':'Save changes'}</button>
        </div>
      </div>
    </div>
  );

  // ── DETAIL ──
  const c = activeClient;
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
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button className="ts-btn ts-btn-secondary ts-btn-sm"
            onClick={() => { generatePortalLink(c.id); }}>
            🔗 {c.portal_token ? 'Refresh portal link' : 'Generate portal link'}
          </button>
          <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={()=>exportRecords(c)}>Download records</button>
          <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(c.id)}>Delete</button>
          <button className="ts-btn ts-btn-secondary" onClick={()=>openEdit(c)}>Edit</button>
        </div>
        {/* Portal link display */}
        {(portalUrl || c.portal_token) && (() => {
          const url = portalUrl || `${window.location.origin}/portal/${c.portal_token}`;
          return (
            <div style={{marginTop:10,background:'var(--color-bg)',border:'1px solid var(--color-blue-mid-bg)',borderRadius:10,padding:'10px 14px'}}>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:11,color:'var(--color-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</span>
                <button onClick={copyPortalUrl} className="ts-btn ts-btn-secondary ts-btn-sm" style={{flexShrink:0}}>
                  {portalCopied ? '✓ Copied' : 'Copy link'}
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="ts-btn ts-btn-ghost ts-btn-sm" style={{flexShrink:0}}>Preview →</a>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:11,color:'var(--muted-light)'}}>
                <span>
                  {(() => {
                    const exp = c.portal_token_expires_at ? new Date(c.portal_token_expires_at) : null;
                    const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    const opened = c.portal_access_count > 0 && c.portal_last_accessed_at ? `Opened ${c.portal_access_count}× · last ${fmt(new Date(c.portal_last_accessed_at))}` : 'Not opened yet';
                    return `${exp ? (exp < new Date() ? '⚠ Expired ' : 'Expires ') + fmt(exp) : 'No expiry set'} · ${opened}. "Refresh" starts a new window; "Revoke" removes access.`;
                  })()}
                </span>
                <button
                  onClick={async () => {
                    if (!(await confirm({ title: `Revoke portal access for ${c.name}?`, message: 'Their link will stop working immediately.', confirmLabel: 'Revoke access' }))) return;
                    await supabase.from('clients').update({ portal_token: null }).eq('id', c.id);
                    setPortalUrl('');
                    setClients(prev => prev.map(cl => cl.id === c.id ? {...cl, portal_token: null} : cl));
                  }}
                  style={{color:'var(--color-red-dark)',background:'transparent',border:'none',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit',padding:0,flexShrink:0,marginLeft:12}}>
                  Revoke access
                </button>
              </div>
            </div>
          );
        })()}
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
          <div className="ts-card-title">{labelsOnly ? 'Details' : 'Contact information'}</div>
          {[...(labelsOnly ? [] : [['Email',c.email||'—'],['Phone',c.phone||'—']]),['Type',c.type.toUpperCase()],['Firm',c.firm_name||'—']].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--color-purple-faint)',fontSize:'13px'}}>
              <span style={{color:'var(--muted)'}}>{k}</span>
              <span style={{fontWeight:500,color:'var(--dark)'}}>{v}</span>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Notes</div>
          <textarea
            defaultValue={c.notes||''}
            onBlur={async e => {
              await supabase.from('clients').update({notes: e.target.value}).eq('id', c.id);
              setClients(prev => prev.map(cl => cl.id === c.id ? {...cl, notes: e.target.value} : cl));
              // Brief visual feedback so CPA knows the save happened
              const el = e.target;
              const orig = el.style.borderBottom;
              el.style.borderBottom = '2px solid var(--color-green)';
              el.placeholder = '✓ Saved';
              setTimeout(() => { el.style.borderBottom = orig; el.placeholder = 'Add notes — auto-saves on blur'; }, 1500);
            }}
            style={{width:'100%',border:'none',background:'transparent',fontSize:13,color:'var(--muted)',
              lineHeight:1.7,resize:'none',fontFamily:'inherit',outline:'none',height:90,padding:0,
              borderBottom:'1px solid transparent',transition:'border-color .2s'}}
            placeholder="Add notes — auto-saves on blur"
          />
        </div>
      </div>

      {/* ── All returns for this client ── */}
      <ClientReturns clientId={c.id} clientName={c.name} />
    </div>
  );
}

// ── ClientReturns sub-component ────────────────────────────────────────────────
// Shows every tax return + walkthrough linked to a specific client.
// Mounted inside the client detail view — lets CPAs see the full history
// without navigating to Tax Projections and searching.
function ClientReturns({ clientId, clientName }) {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('tax_returns')
      .select('id, file_name, tax_year, status, created_at, audio_url, pdf_summary_url, parsed_data')
      .eq('client_id', clientId)
      .order('tax_year', { ascending: false })
      .then(({ data }) => { setReturns(data || []); setLoading(false); });
  }, [clientId]);

  function statusPill(status) {
    const map = {
      parsed:      ['📊 Parsed',     'ts-p-dark'],
      script_ready:['📝 Script',     'ts-p-dark'],
      audio_ready: ['🎬 Walkthrough ready','ts-p-green'],
      parsing:     ['⏳ Parsing…',   'ts-p-gray'],
      error:       ['⚠️ Error',      'ts-p-red'],
    };
    const [label, cls] = map[status] || ['Unknown', 'ts-p-gray'];
    return <span className={`ts-pill ${cls}`}>{label}</span>;
  }

  const fmt = n => n == null ? '—' : `$${Math.abs(Math.round(Number(n))).toLocaleString()}`;

  return (
    <div className="ts-card" style={{marginTop:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div className="ts-card-title" style={{margin:0}}>
          Returns & walkthroughs
          <span className="ts-card-sub">{loading ? '…' : `${returns.length} total`}</span>
        </div>
        <a href={`/cpa/projections?clientId=${clientId}`} className="ts-btn ts-btn-secondary ts-btn-sm">+ Import return</a>
      </div>

      {loading ? (
        <div style={{color:'var(--muted)',fontSize:13,padding:'12px 0'}}>Loading…</div>
      ) : returns.length === 0 ? (
        <div style={{textAlign:'center',padding:'24px 0',color:'var(--muted)',fontSize:13}}>
          <div style={{fontSize:28,marginBottom:8}}>📄</div>
          No returns yet for {clientName}. Import one from Tax Projections.
        </div>
      ) : (
        <table className="ts-tbl">
          <thead>
            <tr><th>Year</th><th>Federal tax</th><th>Eff. rate</th><th>Status</th><th>Created</th><th>Links</th></tr>
          </thead>
          <tbody>
            {returns.map(r => {
              const pd = r.parsed_data || {};
              const tax   = pd.federal_tax  || pd.totalTax || null;
              const rate  = pd.effective_rate ?? (pd.effectiveRate != null ? +pd.effectiveRate : null);
              return (
                <tr key={r.id}>
                  <td><div style={{fontWeight:600}}>{r.tax_year || '—'}</div><div style={{fontSize:11,color:'var(--muted)'}}>{r.file_name?.replace(/\.pdf$/i,'').slice(0,28)}</div></td>
                  <td style={{fontWeight:600,color:'var(--dark)'}}>{tax ? fmt(tax) : '—'}</td>
                  <td>{rate != null ? <span className="ts-pill ts-p-green">{Number(rate).toFixed(1)}%</span> : '—'}</td>
                  <td>{statusPill(r.status)}</td>
                  <td style={{fontSize:12,color:'var(--muted)'}}>{new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}</td>
                  <td>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      <a href={`/cpa/projections?id=${r.id}`} className="ts-btn ts-btn-ghost ts-btn-sm">View →</a>
                      {r.status === 'audio_ready' && (
                        <a href={`/cpa/video?returnId=${r.id}`} className="ts-btn ts-btn-secondary ts-btn-sm">🎬 Video</a>
                      )}
                      {r.pdf_summary_url && (
                        <SignedLink value={r.pdf_summary_url} className="ts-btn ts-btn-secondary ts-btn-sm">📄 PDF</SignedLink>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
