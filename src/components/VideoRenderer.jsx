// src/components/VideoRenderer.jsx
// Renders a TaxStory walkthrough video entirely in the browser.
//
// FAST PATH (WebCodecs, via Mediabunny): every frame is drawn to a canvas and encoded as fast as the machine allows, and the voiceover is decoded
// and encoded into the SAME file. Output is MP4 (H.264 video + AAC audio) where the browser can encode it — it plays everywhere, iPhone included —
// otherwise WebM (VP9/VP8 + Opus).
// FALLBACK (MediaRecorder): real time, canvas + the voiceover played through Web Audio, for browsers without WebCodecs.
//
// Earlier version: frames were wrapped in a raw IVF container labelled video/webm (browsers cannot play IVF), there was no audio track at all,
// and the brand colours were CSS variables (a canvas cannot use them; the first gradient threw). The rendered file now has sound, plays in any
// browser, and is handed to onComplete for upload so the client receives it.

import { useRef, useState } from 'react';
import { Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio } from 'mediabunny';

const FPS    = 30;
const WIDTH  = 1280;
const HEIGHT = 720;

// Canvas cannot read CSS variables: a 'var(--…)' fillStyle is silently ignored and a 'var(--…)' gradient stop THROWS, which aborted every render on the
// intro frame. These are the literal values of the tokens in styles/tokens.css.
const BRAND = {
  dark:   '#1A1230',
  purple: '#6B5CE7',
  muted:  '#6B698A',
  border: '#E2DFF8',
  bg:     '#F4F2FF',
  white:  '#FFFFFF',
  amber:  '#D97706',
  green:  '#1BAF7A',
};
/** A firm's brand colour is user-entered: accept only #RGB / #RRGGBB, otherwise use TaxStory violet. */
export function safeColor(c) { return typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : BRAND.purple; }

const FIELD_LABELS = {
  intro:             'Welcome',
  wages:             'Wages (Line 1z)',
  interest:          'Taxable Interest (Line 2b)',
  dividends:         'Dividends (Line 3b)',
  ira_distributions: 'IRA Distributions (Line 4b)',
  pensions:          'Pensions & Annuities (Line 5b)',
  social_security:   'Social Security (Line 6b)',
  capital_gains:     'Capital Gains (Line 7a)',
  schedule_c:        'Business Income (Sch C)',
  other_income:      'Other Income (Line 8)',
  total_income:      'Total Income (Line 9)',
  agi:               'Adjusted Gross Income (Line 11)',
  standard_deduction:'Standard Deduction (Line 12)',
  qbi_deduction:     'QBI Deduction (Line 13)',
  taxable_income:    'Taxable Income (Line 15)',
  total_tax:         'Total Tax (Line 24)',
  withholding:       'Federal Tax Withheld (Line 25)',
  refund:            'Refund (Line 35a)',
  amount_owed:       'Amount You Owe (Line 37)',
  effective_rate:    'Effective Tax Rate',
  bracket:           'Tax Bracket',
  planning_tip:      'Planning Opportunity',
  outro:             'Summary',
};

function fmt(n) {
  if (n == null || n === '') return '—';
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return '—';
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');   // keeps the sign, as the narration does (a capital LOSS was shown as a gain)
}

// ── Core canvas frame renderer ─────────────────────────────────────────────
// The TaxStory lockup, loaded ONCE before encoding starts (see loadLogo) and drawn synchronously on every frame that shows it.
let LOGO = null;
function loadLogo() {
  if (LOGO || typeof Image === 'undefined') return Promise.resolve(LOGO);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { LOGO = img; resolve(img); };
    img.onerror = () => resolve(null);            // no logo is better than no video
    img.src = '/brand/taxstory-lockup-horizontal-one-color-white.svg';
  });
}

function renderFrame(canvas, seg, parsedData, firmName, firmColor, year, subtitle) {
  const ctx    = canvas.getContext('2d');
  const pd     = parsedData || {};
  const accent = safeColor(firmColor);
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (seg.field_ref === 'intro' || seg.field_ref === 'outro') {
    // ── Cover frame ─────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, BRAND.dark);
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Decorative circle
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.arc(W * 0.75, H * 0.3, 280, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = BRAND.white;
    ctx.font = `bold 48px Georgia, serif`;
    ctx.fillText(
      seg.field_ref === 'outro' ? 'Thank You' : `${year} Tax Return`,
      W / 2, H / 2 - 30
    );
    ctx.font = `24px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(
      seg.field_ref === 'outro' ? 'Questions? Reach out anytime.' : 'Your personalized walkthrough',
      W / 2, H / 2 + 24
    );
    if (firmName) {
      ctx.font = `bold 18px Inter, Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(firmName, W / 2, H / 2 + 100);
    }
    // Watermark: TaxStory logo (white, low opacity)
    // Drawn synchronously from the preloaded image. (A new Image() per frame with an onload callback painted the logo onto whichever frame happened
    // to be on the canvas when it loaded — usually not this one — and started thousands of image loads per render.)
    if (LOGO) {
      ctx.globalAlpha = 0.22;
      const wmH = 16, wmW = wmH * (LOGO.naturalWidth / LOGO.naturalHeight || 4.5);
      ctx.drawImage(LOGO, W / 2 - wmW / 2, H - 40, wmW, wmH);
      ctx.globalAlpha = 1;
    }

  } else {
    // ── Content frame ────────────────────────────────────────────────
    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, W, H);

    // Header bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, 60);
    // Header: firm name or TaxStory logo
    if (firmName) {
      ctx.fillStyle = BRAND.white;
      ctx.font = `bold 22px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.fillText(firmName, 28, 38);
    } else {
      if (LOGO) ctx.drawImage(LOGO, 20, 16, 22 * (LOGO.naturalWidth / LOGO.naturalHeight || 4.5), 22);
    }
    ctx.font = '12px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`Form 1040 · Tax Year ${year} · Confidential Client Summary`, 28, 54);

    // Right sidebar — key figures
    const SW = 228;
    const SX = W - SW - 18;
    const SY = 78;
    ctx.fillStyle = BRAND.dark;
    ctx.beginPath();
    ctx.roundRect(SX, SY, SW, 310, 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('KEY FIGURES', SX + 14, SY + 22);

    const kpis = [
      ['Total income',   fmt(pd.total_income  || pd.totalIncome)],
      ['Federal tax',    fmt(pd.federal_tax   || pd.totalTax)],
      ['Effective rate', pd.effective_rate != null ? `${Number(pd.effective_rate).toFixed(1)}%` : '—'],
      [pd.refund_or_owed >= 0 ? 'Refund' : 'Amount owed',
       pd.refund_or_owed != null ? fmt(Math.abs(pd.refund_or_owed)) : '—'],
    ];
    kpis.forEach(([label, value], i) => {
      const ky = SY + 42 + i * 62;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px Inter, Arial, sans-serif';
      ctx.fillText(label, SX + 14, ky);
      ctx.fillStyle = BRAND.white;
      ctx.font = `bold 22px Georgia, serif`;
      ctx.fillText(value, SX + 14, ky + 22);

      // Separator
      if (i < kpis.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SX + 14, ky + 36);
        ctx.lineTo(SX + SW - 14, ky + 36);
        ctx.stroke();
      }
    });

    // Active field highlight box (amber accent)
    const fieldLabel = FIELD_LABELS[seg.field_ref] || seg.field_ref?.replace(/_/g, ' ') || '';
    const HBY = SY + 320;
    ctx.strokeStyle = BRAND.amber;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(245,158,11,0.08)';
    ctx.beginPath();
    ctx.roundRect(SX, HBY, SW, 56, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BRAND.amber;
    ctx.font = `bold 10px Inter, Arial, sans-serif`;
    ctx.fillText('NOW DISCUSSING', SX + 14, HBY + 18);
    ctx.fillStyle = BRAND.dark;
    ctx.font = `bold 13px Inter, Arial, sans-serif`;
    ctx.fillText(fieldLabel, SX + 14, HBY + 38);

    // Main content area — large field value
    const CX = 28;
    const CW = SX - CX - 20;

    ctx.fillStyle = BRAND.dark;
    ctx.font = `bold 13px Inter, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(fieldLabel.toUpperCase(), CX, 96);

    ctx.fillStyle = accent;
    ctx.font = `bold 58px Georgia, serif`;
    // Determine value to display for this field
    const fieldValues = {
      wages:             fmt(pd.wages),
      interest:          fmt(pd.taxable_interest || pd.interestIncome),
      dividends:         fmt(pd.ordinary_dividends || pd.ordinaryDividends),
      capital_gains:     fmt(pd.capital_gains),
      total_income:      fmt(pd.total_income || pd.totalIncome),
      agi:               fmt(pd.agi || pd.adjustedGrossIncome),
      standard_deduction:fmt(pd.standard_deduction || pd.standardDeduction),
      taxable_income:    fmt(pd.taxable_income || pd.taxableIncome),
      total_tax:         fmt(pd.federal_tax || pd.totalTax),
      withholding:       fmt(pd.federal_withholding || pd.withholding),
      refund:            fmt(pd.refund),
      amount_owed:       fmt(pd.amount_owed || pd.amountOwed),
      ira_distributions: fmt(pd.ira_distributions),
      pensions:          fmt(pd.pensions),
      social_security:   fmt(pd.social_security),
      schedule_c:        fmt(pd.business_income),
      other_income:      fmt(pd.other_income),
      qbi_deduction:     fmt(pd.qbi_deduction),
      effective_rate:    pd.effective_rate != null ? `${Number(pd.effective_rate).toFixed(1)}%` : '—',
    };
    const mainValue = fieldValues[seg.field_ref] || '';
    if (mainValue && mainValue !== '—') {
      ctx.fillText(mainValue, CX, 172);
    }

    // Progress bar (which segment we're on)
    // (rendered externally via subtitle)

    // Subtitle text (narration transcript)
    if (subtitle) {
      const words = subtitle.split(' ');
      const lines = [];
      let line = '';
      const maxW = CW;

      ctx.font = '18px Inter, Arial, sans-serif';
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);

      const lineH  = 28;
      const textY  = H - 90 - (lines.length - 1) * lineH;

      // Subtitle pill background
      const pillH = lines.length * lineH + 20;
      ctx.fillStyle = 'rgba(26,18,48,0.85)';
      ctx.beginPath();
      ctx.roundRect(CX - 6, textY - 22, CW + 12, pillH, 8);
      ctx.fill();

      ctx.fillStyle = BRAND.white;
      ctx.font = '18px Inter, Arial, sans-serif';
      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillText(l, CX, textY + i * lineH);
      });
    }
  }
}

// ── WebCodecs encoder ────────────────────────────────────────────────────────

const VIDEO_BITRATE = 1_200_000;   // slides are mostly static: ~10 MB per minute with audio, well under storage upload limits
const AUDIO_BITRATE = 96_000;

/** Decode the voiceover once. Returns an AudioBuffer (or null if there is no audio URL). */
async function decodeVoiceover(audioUrl) {
  if (!audioUrl) return null;
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error('Could not load the voiceover audio');
  const bytes = await res.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try { return await ctx.decodeAudioData(bytes); } finally { ctx.close?.(); }
}

/** Scene timeline in seconds. When the decoded voiceover is a little longer/shorter than the summed scene durations, the scenes are scaled to it,
 *  so slide changes stay in step with the narration and the video ends with the audio. */
function timeline(segments, audioSeconds) {
  const durs  = segments.map(s => Math.max(0.5, (s.duration_ms || 4000) / 1000));
  const total = durs.reduce((a, b) => a + b, 0);
  const k     = audioSeconds && Math.abs(audioSeconds - total) > 0.05 ? audioSeconds / total : 1;
  let t = 0;
  return durs.map((d, i) => { const start = t; t += d * k; return { seg: segments[i], start, end: t }; });
}

/** MP4 (H.264 + AAC) if this browser can encode both; else WebM (VP9 or VP8 + Opus). Null if WebCodecs cannot produce a file with sound. */
async function pickFormat(audio) {
  const a = audio ? { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: AUDIO_BITRATE } : null;
  const v = { width: WIDTH, height: HEIGHT, bitrate: VIDEO_BITRATE, frameRate: FPS };
  if (await canEncodeVideo('avc', v) && (!a || await canEncodeAudio('aac', a)))
    return { make: () => new Mp4OutputFormat({ fastStart: 'in-memory' }), video: 'avc', audio: 'aac', mime: 'video/mp4', ext: 'mp4' };
  for (const vc of ['vp9', 'vp8'])
    if (await canEncodeVideo(vc, v) && (!a || await canEncodeAudio('opus', a)))
      return { make: () => new WebMOutputFormat(), video: vc, audio: 'opus', mime: 'video/webm', ext: 'webm' };
  return null;
}

async function encodeWithWebCodecs(canvas, segments, audio, fmt, draw, onProgress) {
  const scenes = timeline(segments, audio?.duration);
  const totalSec = scenes[scenes.length - 1].end;
  const output = new Output({ format: fmt.make(), target: new BufferTarget() });
  const video  = new CanvasSource(canvas, { codec: fmt.video, bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: FPS });
  let voice = null;
  if (audio) { voice = new AudioBufferSource({ codec: fmt.audio, bitrate: AUDIO_BITRATE }); output.addAudioTrack(voice); }
  await output.start();
  try {
    if (voice) await voice.add(audio);                       // the whole voiceover in one go; Mediabunny chunks and interleaves it
    const frameDur = 1 / FPS, totalFrames = Math.ceil(totalSec * FPS);
    let si = 0;
    for (let f = 0; f < totalFrames; f++) {
      const t = f * frameDur;
      while (si < scenes.length - 1 && t >= scenes[si].end) si++;
      const sc = scenes[si];
      const subtitle = (t - sc.start) / Math.max(0.001, sc.end - sc.start) > 0.08 ? sc.seg.text : '';
      draw(sc.seg, subtitle);
      await video.add(t, frameDur);                          // awaits encoder backpressure
      if (f % 15 === 0) onProgress(Math.min(99, Math.round((f / totalFrames) * 100)));
    }
    await output.finalize();
  } catch (e) { await output.cancel().catch(() => {}); throw e; }
  return new Blob([output.target.buffer], { type: fmt.mime });
}

async function encodeWithMediaRecorder(canvas, segments, audio, draw, onProgress) {
  const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record video');
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const stream = canvas.captureStream(FPS);
  let src = null;
  if (audio) {
    const dest = ctx.createMediaStreamDestination();
    src = ctx.createBufferSource(); src.buffer = audio; src.connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  }
  const scenes = timeline(segments, audio?.duration);
  const totalSec = scenes[scenes.length - 1].end;
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE, audioBitsPerSecond: AUDIO_BITRATE });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise(r => { recorder.onstop = r; });
  draw(scenes[0].seg, '');
  await ctx.resume();
  recorder.start(250);
  const t0 = ctx.currentTime;
  if (src) src.start();
  // Frames follow the AUDIO clock, so the slides cannot drift from the narration (timer-based loops did).
  await new Promise(resolve => {
    const tick = () => {
      const t = ctx.currentTime - t0;
      if (t >= totalSec) return resolve();
      const sc = scenes.find(s => t < s.end) || scenes[scenes.length - 1];
      draw(sc.seg, (t - sc.start) / Math.max(0.001, sc.end - sc.start) > 0.08 ? sc.seg.text : '');
      onProgress(Math.min(99, Math.round((t / totalSec) * 100)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop(); await stopped; ctx.close?.();
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime: mime.split(';')[0], ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/** Map the server's canonical facts (generate-video → compositionProps.facts, the same figures the narration uses) onto the names renderFrame reads. */
function factsToFrameData(f, fallback) {
  if (!f || typeof f !== 'object' || !Object.keys(f).length) return fallback || {};
  const net = f.refund != null ? f.refund : f.amount_owed != null ? -f.amount_owed : undefined;
  return {
    wages: f.wages, taxable_interest: f.interest, ordinary_dividends: f.dividends, ira_distributions: f.ira_distributions, pensions: f.pensions,
    social_security: f.social_security, capital_gains: f.capital_gains, business_income: f.business_income, other_income: f.other_income,
    total_income: f.total_income, agi: f.agi, standard_deduction: f.standard_deduction, qbi_deduction: f.qbi_deduction, taxable_income: f.taxable_income,
    federal_tax: f.total_tax, federal_withholding: f.withholding, refund: f.refund, amount_owed: f.amount_owed,
    effective_rate: f.effective_rate, refund_or_owed: net,
  };
}

// ── React component ───────────────────────────────────────────────────────────
export default function VideoRenderer({
  segments = [],
  parsedData = {},
  firmName = '',
  firmColor = BRAND.purple,
  year = new Date().getFullYear() - 1,
  audioUrl = '',          // signed URL of the combined voiceover — it becomes the video's soundtrack
  onComplete,             // (objectUrl, blob, { mime, ext }) — the page uploads the file so the client receives it
  facts = null,           // canonical figures from generate-video (preferred over parsedData)
  onProgress,
}) {
  const canvasRef = useRef(null);
  const [status,   setStatus]   = useState('idle');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [fileExt,  setFileExt]  = useState('mp4');
  const [errorMsg, setErrorMsg] = useState('');
  const [engine,   setEngine]   = useState('');

  const webCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

  async function render() {
    if (!segments.length) { setErrorMsg('No segments to render'); setStatus('error'); return; }
    setStatus('rendering'); setProgress(0); setVideoUrl(null); setErrorMsg('');
    const canvas = canvasRef.current;
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const frameData = factsToFrameData(facts, parsedData);
    const draw = (seg, subtitle) => renderFrame(canvas, seg, frameData, firmName, firmColor, year, subtitle);
    const report = pct => { setProgress(pct); if (onProgress) onProgress(pct); };
    try {
      setEngine('Loading voiceover…');
      const [audio] = await Promise.all([decodeVoiceover(audioUrl), loadLogo()]);
      let result = null;
      const fmt = webCodecsSupported ? await pickFormat(audio) : null;
      if (fmt) {
        setEngine(`Fast encoding (${fmt.ext.toUpperCase()})`);
        const blob = await encodeWithWebCodecs(canvas, segments, audio, fmt, draw, report);
        result = { blob, mime: fmt.mime, ext: fmt.ext };
      } else {
        if (!window.MediaRecorder) throw new Error('Video rendering needs a current version of Chrome, Edge, Firefox or Safari');
        setEngine('Real-time recording');
        result = await encodeWithMediaRecorder(canvas, segments, audio, draw, report);
      }
      const url = URL.createObjectURL(result.blob);
      setVideoUrl(url); setFileExt(result.ext); setStatus('done'); report(100);
      if (onComplete) onComplete(url, result.blob, { mime: result.mime, ext: result.ext });
    } catch (err) {
      console.error('Render error:', err);
      setErrorMsg(`Render failed: ${err.message}. Try the latest Chrome or Edge.`);
      setStatus('error');
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Hidden canvas — all drawing happens here */}
      <canvas ref={canvasRef} style={{ display: 'none' }} width={WIDTH} height={HEIGHT} />

      {status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <button onClick={render}
            style={{ padding: '11px 28px', background: BRAND.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            🎬 Render video
          </button>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
            {webCodecsSupported
              ? '✓ Fast rendering — usually under a minute for a 2-minute walkthrough'
              : 'Real-time rendering: takes as long as the walkthrough (Chrome or Edge are faster)'}
          </div>
        </div>
      )}

      {status === 'rendering' && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--color-muted)' }}>Rendering… {engine}</span>
            <span style={{ fontWeight: 600, color: 'var(--color-purple)' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--color-purple), var(--color-purple-grad))', borderRadius: 3, transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted-light)', marginTop: 6 }}>Keep this tab open until it finishes.</div>
        </div>
      )}

      {status === 'done' && videoUrl && (
        <div>
          <video src={videoUrl} controls style={{ width: '100%', borderRadius: 10, marginBottom: 10, background: '#000' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={videoUrl} download={`TaxStory_Walkthrough_${year}.${fileExt}`}
              style={{ flex: 1, padding: '10px', background: 'var(--color-dark)', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600, textAlign: 'center', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              ↓ Download (.{fileExt})
            </a>
            <button onClick={() => { setStatus('idle'); setProgress(0); setVideoUrl(null); }}
              style={{ padding: '10px 16px', background: 'var(--color-purple-3)', color: 'var(--color-purple)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Re-render
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'var(--color-red-light)', color: 'var(--color-red-dark)', padding: '12px 14px', borderRadius: 10, fontSize: 13 }}>{errorMsg}</div>
      )}
    </div>
  );
}
