// src/utils/records.js — download an advisor's approval records (JSON) for a client or a return, to keep BEFORE deleting it (deletion leaves only a content-free log).
import { callFunction } from './callFunction';

export async function downloadRecords({ clientId, taxReturnId, label }) {
  const data = await callFunction('export-approvals', clientId ? { clientId } : { taxReturnId });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = String(label || 'records').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'records';
  a.href = URL.createObjectURL(blob); a.download = `taxstory-approvals-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return data.count;
}
