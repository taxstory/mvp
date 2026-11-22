// netlify/functions/generate-video.js
// Returns the composition props the browser renders the walkthrough video from (WebCodecs).

const { makeHandler, getTaxReturn, getFirmProfile } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { signedUrl } = require('./_storage');
const { buildFacts } = require('./_scriptFacts');

exports.config = { timeout: 26 };


exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  await rateLimit(supabase, `generate-video:${user.id}`, 20, 3600, 'Too many video renders this hour. Please wait a few minutes.');

  const [taxReturn, profile] = await Promise.all([
    getTaxReturn(db, taxReturnId, user.id,
      'id, user_id, parsed_data, tax_year, script_json, audio_segments, audio_url, clients(name)'),
    getFirmProfile(db, user.id),
  ]);

  if (!taxReturn.audio_segments?.length) {
    throw Object.assign(new Error('No audio segments found. Run generate-audio first.'), { statusCode: 400 });
  }

  // Segment audio lives in a private bucket: give the renderer short-lived signed URLs (2h).
  const renderSegments = await Promise.all(taxReturn.audio_segments.map(async seg => ({
    ...seg,
    audio_url: await signedUrl(supabase, seg.audio_path || seg.audio_url, 7200, { ownerId: user.id }),
  })));

  // The on-screen figures come from the SAME canonical facts the narration was written from, so the number on a slide always equals the number
  // being spoken. (The renderer used to read parsed_data under its own field names and showed "—" for interest, IRA, pensions, Social Security,
  // business income, withholding and the refund on many returns.)
  const isScenario = Array.isArray(taxReturn.parsed_data?.scenarios);
  const model = buildFacts(isScenario ? {} : (taxReturn.parsed_data || {}), taxReturn.tax_year);
  const facts = isScenario
    ? { ...(taxReturn.parsed_data.walkthrough?.figures || {}), scenario: true }                 // the comparison's figures for the slides
    : Object.fromEntries(Object.entries(model.facts).map(([k, v]) => [k, v.value]));
  const compositionProps = {
    segments:   renderSegments,
    parsedData: taxReturn.parsed_data || {},
    facts,
    year:       taxReturn.tax_year || new Date().getFullYear() - 1,
    firmName:   profile.firm_name  || 'TaxStory',
    firmColor:  profile.brand_color || '#6B5CE7',
  };

  const totalFrames = taxReturn.audio_segments
    .reduce((s, seg) => s + Math.round((seg.duration_ms / 1000) * 30), 0);

  // Rendered in the browser (WebCodecs) from these props.
  return {
    statusCode: 200,
    body: JSON.stringify({
      mode: 'client', compositionProps, totalFrames, fps: 30, width: 1280, height: 720,
    }),
  };
});
