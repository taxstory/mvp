// The same client's return for the previous tax year, if it is in TaxStory. Read through the CALLER-scoped client (row-level security),
// so only the advisor's own data can ever be found. Returns that return's saved figures, or null.
async function priorYearFigures(db, ret) {
  if (!ret?.client_id || !ret?.tax_year) return null;
  const { data } = await db.from('tax_returns').select('parsed_data')
    .eq('client_id', ret.client_id).eq('tax_year', ret.tax_year - 1).neq('status', 'scenario_set').neq('id', ret.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.parsed_data || null;
}
module.exports = { priorYearFigures };
