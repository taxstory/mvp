// netlify/functions/generate-script.js
// Builds the narration script for a client walkthrough. The script is a DETERMINISTIC BACKBONE (_scriptTemplates): one fixed sentence per figure on the
// return, in a fixed order, with the outcome (refund / balance due / even) derived from the data. A language model is an OPTIONAL polisher: it sees NO
// figures (only the sentence templates) and each of its rewrites is accepted per sentence only if it keeps exactly the same placeholders, still names its
// own concept, and passes every check (no digits, no advice/prediction/guarantee, wording consistent with the outcome, no figure beside the wrong label).
// Anything else stays the template, so the result is always correct even if the model misbehaves, is over budget, or is unavailable.
// Planning is a fixed, neutral sentence. Spend is metered against daily budgets. The prompt contains no names, identifiers or figures.
const { makeHandler, getTaxReturn, audit } = require('./_handler');
const { rateLimit, globalDailyCap } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { buildFacts } = require('./_scriptFacts');
const { buildBackbone, composeScript } = require('./_scriptTemplates');
const { reserveBudget, settleCall, releaseReservation, estimateAnthropicCost } = require('./_spend');
const { randomUUID } = require('crypto');
const { logError } = require('./_logError');

exports.config = { timeout: 26 };

function buildPrompt(backbone) {
  const lines = backbone.filter(b => !b.fixed).map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  return `You polish narration for a CPA's client walkthrough video of a tax return. Each numbered line below is a fixed sentence whose meaning is already decided. Rewrite each line so it sounds warm and conversational: second person, one or two short sentences.

HARD RULES
1. Keep every {{placeholder}} EXACTLY as written — the same ones, the same number of times. Never add, remove, or move a placeholder to a different idea.
2. Never write a digit. Do not state any amount, rate, year or count yourself.
3. Do not change what the line says: same concept, same direction (refund versus balance due), no extra claims, nothing the line does not mention.
4. No advice, recommendations, predictions or guarantees.

Return ONLY a JSON array of strings with exactly ${backbone.filter(b => !b.fixed).length} entries, in the same order. No markdown.

LINES
${lines}`;
}

async function askModel(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);                  // the vendor's body is never included
  const json = await res.json();
  return { text: json.content?.[0]?.text?.trim(), usage: json.usage || {} };
}
const parseStrings = raw => { try { const v = JSON.parse(String(raw).replace(/```json?\n?/g, '').replace(/```/g, '').trim()); return Array.isArray(v) ? v : null; } catch { return null; } };

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  await rateLimit(supabase, `generate-script:${user.id}`, 60, 3600, 'Too many scripts requested this hour. Please wait a few minutes.');
  await globalDailyCap(supabase, 'script', 'GLOBAL_DAILY_SCRIPTS', 2000);

  const taxReturn = await getTaxReturn(db, taxReturnId, user.id, 'id, user_id, parsed_data, tax_year');   // never client names
  if (!taxReturn.parsed_data) throw Object.assign(new Error('Return has not been parsed yet'), { statusCode: 400 });
  const model = buildFacts(taxReturn.parsed_data, taxReturn.tax_year);
  if (Object.keys(model.facts).length < 3) throw Object.assign(new Error('There are not enough figures on this return to write a walkthrough.'), { statusCode: 400 });

  const backbone = buildBackbone(model);

  // Optional polish. Any problem here (budget, vendor outage, malformed reply) simply leaves the deterministic script in place.
  let rewrites = null, aiUsed = false;
  if (process.env.SCRIPT_POLISH === 'on') try {      // AI wording polish is OFF BY DEFAULT (an independent review recommended it for the first commercial release). Set SCRIPT_POLISH=on to enable it.
    const prompt = buildPrompt(backbone);
    const inTok = Math.ceil(prompt.length / 3.5), est = estimateAnthropicCost(inTok, 1500);              // 1500 = max_tokens: the most this call can bill
    const callKey = `script:${randomUUID()}`;
    // RESERVE (atomic check-and-hold) before the paid call; SETTLE to the actual token usage after it; RELEASE if the call failed without billing.
    if ((await reserveBudget(supabase, { userId: user.id, vendor: 'anthropic', estCostUsd: est, units: inTok + 1500, callKey })).allowed) {
      let result;
      try { result = await askModel(prompt); } catch (e) { await releaseReservation(supabase, callKey); throw e; }
      const { text, usage } = result; aiUsed = true;
      await settleCall(supabase, { callKey, userId: user.id, vendor: 'anthropic', actualCostUsd: estimateAnthropicCost(usage.input_tokens ?? inTok, usage.output_tokens ?? 1500), units: (usage.input_tokens ?? inTok) + (usage.output_tokens ?? 1500) });
      const list = parseStrings(text);
      const editable = backbone.map((b, i) => (b.fixed ? i : -1)).filter(i => i >= 0);
      if (list && list.length === backbone.filter(b => !b.fixed).length) { rewrites = []; let j = 0; for (let i = 0; i < backbone.length; i++) rewrites[i] = editable.includes(i) ? undefined : list[j++]; }
    }
  } catch (e) { logError('generate-script-polish', e, { userId: user.id }); rewrites = null; }

  const { segments, rewritten, rejected } = composeScript(backbone, rewrites, model);
  const scriptText = segments.map(s => s.text).join(' ');

  const { error } = await db.from('tax_returns').update({ script: scriptText, script_json: segments, status: 'script_ready' }).eq('id', taxReturnId).eq('user_id', user.id);
  if (error) throw new Error(`Could not save the script: ${error.message}`);
  await audit(supabase, user.id, 'script_generated', `${segments.length} verified sentences for ${taxReturnId} (${rewritten} polished, ${rejected} kept as written)${model.warnings.length ? `; ${model.warnings.length} data warning(s)` : ''}.`);

  return { statusCode: 200, body: JSON.stringify({ success: true, verified: true, ai_used: aiUsed, polished: rewritten, warnings: model.warnings.map(w => w.message), script: scriptText, segments }) };
});

exports._test = { buildPrompt };
