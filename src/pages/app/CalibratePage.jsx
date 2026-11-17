// src/pages/app/CalibratePage.jsx — reader calibration (internal; not in the nav, reach it at /calibrate).
//
// Drop client-copy PDFs from your own tax software. Everything runs in THIS browser: nothing is uploaded or saved. For each file you see
// every figure the reader found, the caption row it came from, and the reconciliation checks. Mark each figure right or wrong (and type the
// correct amount), add any figure it missed, then download a fixture. The fixture holds only the caption rows the reader matched — with
// SSNs, EINs, emails and phone numbers stripped — plus the confirmed amounts. Fixtures go in tests/parser/fixtures/ and become regression tests.
import { useState } from 'react';
import { loadPdfjs, extractRows, MAX_BYTES } from '../../utils/pdfExtract';
import { parseForm1040, FIELD_LABELS } from '../../utils/form1040Parser';

const ALL_KEYS = Object.keys(FIELD_LABELS);

async function readOne(file) {
  if (file.type !== 'application/pdf') throw new Error('Not a PDF');
  if (file.size > MAX_BYTES) throw new Error('Larger than 25 MB');
  const rows = await extractRows(await file.arrayBuffer(), await loadPdfjs());
  if (!rows.length) throw new Error('No selectable text (scan or image)');
  const r = parseForm1040(rows, { evidence: true });
  const review = Object.fromEntries(Object.keys(r.figures).filter(k => k in FIELD_LABELS).map(k => [k, { ok: true, fix: '' }]));
  return { name: file.name, rowCount: rows.length, ...r, review, added: [] };
}

export default function CalibratePage() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(list) {
    setBusy(true);
    const out = [];
    for (const f of list) {
      try { out.push(await readOne(f)); } catch (e) { out.push({ name: f.name, error: e.message }); }
    }
    setItems(prev => [...prev, ...out]); setBusy(false);
  }
  const update = (i, fn) => setItems(prev => prev.map((it, j) => (j === i ? fn(structuredClone(it)) : it)));

  function fixture(it, idx) {
    const expected = {};
    for (const [k, v] of Object.entries(it.review)) {
      const fix = v.fix === '' ? null : Number(String(v.fix).replace(/[$,\s]/g, ''));
      expected[k] = v.ok ? it.figures[k] : (Number.isFinite(fix) ? fix : null);
    }
    for (const a of it.added) if (a.key && Number.isFinite(+a.value)) expected[a.key] = +a.value;
    const rows = [...new Set(Object.values(it.evidence || {}))];       // only the caption rows used — no other page text
    const body = {
      vendor: it.vendor?.code || null, vendorName: it.vendor?.name || 'Unknown', taxYear: it.taxYear || null,
      reviewed: true, createdAt: new Date().toISOString().slice(0, 10),
      note: 'Calibration fixture. Rows are the caption rows the reader matched, identifiers removed. Fields the reader missed are in "expected" but have no row — add the row text by hand if the return printed one.',
      rows, expected,
      missed: it.added.filter(a => a.key).map(a => a.key),   // reported as TODO by the test until their caption rows are added and the reader learns them
    };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fixture-${(it.vendor?.code || 'unknown').toLowerCase()}-${it.taxYear || 'year'}-${idx + 1}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  const cell = { padding: '6px 8px', borderBottom: '1px solid var(--color-border)', fontSize: 12.5, verticalAlign: 'top' };
  return (
    <div className="ts-page">
      <div className="ts-page-title">Reader calibration</div>
      <div className="ts-page-sub">Internal tool. PDFs are read in this browser only — nothing is uploaded or stored.</div>

      <div className="ts-card" style={{ marginTop: 14 }}>
        <input type="file" accept="application/pdf" multiple disabled={busy} onChange={e => { onFiles([...e.target.files]); e.target.value = ''; }} />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Use the client copy printed from your tax software (with schedules). {busy && 'Reading…'}
        </div>
      </div>

      {items.map((it, i) => (
        <div key={i} className="ts-card" style={{ marginTop: 14 }}>
          <div className="ts-card-title">{it.name}
            <span className="ts-card-sub">{it.error ? `⚠ ${it.error}` : `${it.vendor?.name || 'Unknown software'} · ${it.taxYear || 'year ?'} · ${it.filingStatus || 'status ?'} · quality: ${it.quality}`}</span>
          </div>
          {!it.error && (
            <>
              <div style={{ fontSize: 12, margin: '6px 0 10px' }}>
                {it.checks.map(c => (
                  <div key={c.id} style={{ color: c.status === 'warn' ? 'var(--color-red-dark)' : c.status === 'pass' ? 'var(--green-dark)' : 'var(--muted)' }}>
                    {c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '–'} {c.label}{c.status === 'warn' ? ` — ${c.detail}` : ''}
                  </div>
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr>{['Field', 'Read', 'Caption row it came from', 'Correct?', 'Correct amount'].map(h => <th key={h} style={{ ...cell, textAlign: 'left', color: 'var(--muted)' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {Object.keys(it.review).map(k => (
                      <tr key={k}>
                        <td style={cell}>{FIELD_LABELS[k]}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{it.figures[k]?.toLocaleString('en-US')}</td>
                        <td style={{ ...cell, fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{it.evidence?.[k]}</td>
                        <td style={cell}><input type="checkbox" checked={it.review[k].ok} onChange={e => update(i, x => { x.review[k].ok = e.target.checked; return x; })} /></td>
                        <td style={cell}>{!it.review[k].ok && (
                          <input value={it.review[k].fix} placeholder="amount on the return" onChange={e => update(i, x => { x.review[k].fix = e.target.value; return x; })}
                            style={{ width: 120, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6 }} />)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <strong>Missed by the reader</strong> (on the return, but not found):
                {it.added.map((a, j) => (
                  <div key={j} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <select value={a.key} onChange={e => update(i, x => { x.added[j].key = e.target.value; return x; })}>
                      <option value="">Field…</option>
                      {ALL_KEYS.filter(k => !(k in it.review)).map(k => <option key={k} value={k}>{FIELD_LABELS[k]}</option>)}
                    </select>
                    <input value={a.value} placeholder="amount" onChange={e => update(i, x => { x.added[j].value = e.target.value.replace(/[$,\s]/g, ''); return x; })}
                      style={{ width: 120, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  </div>
                ))}
                <button onClick={() => update(i, x => { x.added.push({ key: '', value: '' }); return x; })}
                  style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>+ Add a missed field</button>
              </div>
              <button className="ts-btn ts-btn-primary" style={{ marginTop: 12 }} onClick={() => fixture(it, i)}>Download fixture</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
