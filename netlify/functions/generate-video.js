// netlify/functions/generate-video.js
// Returns composition props for client-side WebCodecs rendering (default),
// or triggers a Remotion Lambda render if AWS env vars are configured.

const { makeHandler, getTaxReturn, getFirmProfile } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { signedUrl } = require('./_storage');
const { buildFacts } = require('./_scriptFacts');

exports.config = { timeout: 26 };

const LAMBDA_CONFIGURED = !!(
  process.env.REMOTION_AWS_ACCESS_KEY_ID &&
  process.env.REMOTION_AWS_SECRET_ACCESS_KEY &&
  process.env.REMOTION_SERVE_URL &&
  process.env.REMOTION_FUNCTION_NAME
);

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  // Remotion Lambda renders cost real money: bound them per user.
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
  const model = buildFacts(taxReturn.parsed_data || {}, taxReturn.tax_year);
  const facts = Object.fromEntries(Object.entries(model.facts).map(([k, v]) => [k, v.value]));
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

  // ── Remotion Lambda (if configured) ──────────────────────────────
  if (LAMBDA_CONFIGURED) {
    try {
      let renderMediaOnLambda;
      try { ({ renderMediaOnLambda } = require('@remotion/lambda/client')); }       // optional dependency: install it only where server-side rendering is configured
      catch { throw Object.assign(new Error('Server-side video rendering is not installed on this deployment.'), { statusCode: 503 }); }
      const { renderId, bucketName } = await renderMediaOnLambda({
        region:          process.env.REMOTION_AWS_REGION,
        functionName:    process.env.REMOTION_FUNCTION_NAME,
        serveUrl:        process.env.REMOTION_SERVE_URL,
        composition:     'TaxStoryWalkthrough',
        inputProps:      compositionProps,
        codec:           'h264',
        imageFormat:     'jpeg',
        maxRetries:      3,
        framesPerLambda: 60,
        outName:         `${taxReturnId}.mp4`,
      });

      await supabase.from('tax_returns').update({
        video_render_id: renderId,
        video_bucket:    bucketName,
        video_status:    'rendering',
      }).eq('id', taxReturnId);

      return {
        statusCode: 200,
        body: JSON.stringify({ mode: 'lambda', renderId, bucketName }),
      };
    } catch (lambdaErr) {
      console.error('Lambda render failed, falling back to client-side:', lambdaErr.message);
    }
  }

  // ── Client-side WebCodecs render (default) ────────────────────────
  return {
    statusCode: 200,
    body: JSON.stringify({
      mode: 'client', compositionProps, totalFrames, fps: 30, width: 1280, height: 720,
    }),
  };
});
