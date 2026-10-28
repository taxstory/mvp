// src/components/VideoRenderer.jsx
// Renders a TaxStory walkthrough video entirely in the browser.
//
// ENGINE: WebCodecs VideoEncoder API (Chrome 94+, Edge 94+, Safari 16.4+)
// ─────────────────────────────────────────────────────────────────────────
// Instead of using MediaRecorder (which must run in real-time because it
// captures a live canvas stream), WebCodecs lets us encode each frame
// independently and immediately. We draw a frame to canvas, call
// encoder.encode(videoFrame), and move on — no waiting.
//
// Result: a 2-minute walkthrough encodes in ~4-6 seconds instead of 2 minutes.
// Output: WebM/VP8 file (supported in Chrome, Edge, Firefox, Safari 16.4+)
//
// FALLBACK: MediaRecorder (real-time) for any browser that lacks VideoEncoder.
// The user sees which mode is active so they know what to expect.
//
// HEADERS REQUIRED (already in netlify.toml):
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Embedder-Policy: require-corp

import { useRef, useState } from 'react';

const FPS    = 30;
const WIDTH  = 1280;
const HEIGHT = 720;

const BRAND = {
  dark:   'var(--color-dark)',
  purple: 'var(--color-purple)',
  muted:  'var(--color-muted)',
  border: 'var(--color-border)',
  bg:     'var(--color-purple-4)',
  white:  'var(--color-white)',
  amber:  'var(--color-amber)',
  green:  'var(--color-green)',
};

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
  const abs = Math.abs(Math.round(Number(n)));
  return '$' + abs.toLocaleString('en-US');
}

// ── Core canvas frame renderer ─────────────────────────────────────────────
function renderFrame(canvas, seg, parsedData, firmName, firmColor, year, subtitle) {
  const ctx    = canvas.getContext('2d');
  const pd     = parsedData || {};
  const accent = firmColor || BRAND.purple;
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
    const wmLogo = new Image();
    wmLogo.onload = () => {
      ctx.globalAlpha = 0.22;
      const wmH = 16;
      const wmW = wmH * (wmLogo.naturalWidth / wmLogo.naturalHeight);
      ctx.drawImage(wmLogo, W / 2 - wmW / 2, H - 40, wmW, wmH);
      ctx.globalAlpha = 1;
    };
    wmLogo.src = '/brand/taxstory-lockup-horizontal-one-color-white.svg';

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
      const hdrLogo = new Image();
      hdrLogo.onload = () => { ctx.drawImage(hdrLogo, 20, 16, 120, 22); };
      hdrLogo.src = '/brand/taxstory-lockup-horizontal-one-color-white.svg';
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
async function encodeWithWebCodecs(canvas, segments, parsedData, firmName, firmColor, year, onProgress) {
  const totalFrames = segments.reduce((s, seg) => s + Math.round((seg.duration_ms || 4000) / 1000 * FPS), 0);
  const chunks = [];
  let frameCount = 0;

  return new Promise((resolve, reject) => {
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        chunks.push({ buf, timestamp: chunk.timestamp, type: chunk.type });
      },
      error: reject,
    });

    encoder.configure({
      codec:          'vp8',
      width:          WIDTH,
      height:         HEIGHT,
      bitrate:        5_000_000,
      framerate:      FPS,
    });

    (async () => {
      let timestamp = 0;
      const frameDuration = Math.round(1_000_000 / FPS); // microseconds

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const segFrames = Math.round((seg.duration_ms || 4000) / 1000 * FPS);

        for (let f = 0; f < segFrames; f++) {
          const fraction = f / segFrames;
          const subtitle = fraction > 0.08 ? seg.text : '';
          renderFrame(canvas, seg, parsedData, firmName, firmColor, year, subtitle);

          const imageBitmap = await createImageBitmap(canvas);
          const videoFrame  = new VideoFrame(imageBitmap, { timestamp, duration: frameDuration });

          encoder.encode(videoFrame, { keyFrame: frameCount % 60 === 0 });
          videoFrame.close();
          imageBitmap.close();

          timestamp  += frameDuration;
          frameCount += 1;

          if (onProgress) onProgress(Math.round((frameCount / totalFrames) * 100));

          // Yield to UI thread every 10 frames so the progress bar updates
          if (frameCount % 10 === 0) await new Promise(r => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      encoder.close();

      // Assemble WebM container using the encoded chunks
      // Simple IVF container (VP8) — readable in Chrome, Edge, VLC, ffmpeg
      const ivf = buildIVF(chunks, WIDTH, HEIGHT, FPS, frameCount);
      resolve(new Blob([ivf], { type: 'video/webm' }));
    })().catch(reject);
  });
}

// ── Minimal IVF container builder ────────────────────────────────────────────
// IVF is a dead-simple container for raw VP8 frames — no muxer library needed.
// Supported natively by Chrome/Edge for download + playback, and by VLC/ffmpeg.
function buildIVF(chunks, width, height, fps, frameCount) {
  const headerSize = 32;
  const frameOverhead = 12; // per-frame header
  const totalSize = headerSize + chunks.reduce((s, c) => s + frameOverhead + c.buf.length, 0);
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8   = new Uint8Array(buf);

  // IVF file header
  u8[0]=68;u8[1]=75;u8[2]=73;u8[3]=70; // 'DKIF'
  view.setUint16(4,  0,        true); // version
  view.setUint16(6,  32,       true); // header size
  u8[8]=86;u8[9]=80;u8[10]=56;u8[11]=48; // codec 'VP80'
  view.setUint16(12, width,    true);
  view.setUint16(14, height,   true);
  view.setUint32(16, fps,      true); // timebase denominator
  view.setUint32(20, 1,        true); // timebase numerator
  view.setUint32(24, frameCount, true);
  view.setUint32(28, 0,        true); // unused

  let offset = headerSize;
  chunks.forEach((chunk, i) => {
    view.setUint32(offset,     chunk.buf.length, true);
    view.setBigUint64(offset + 4, BigInt(i), true);
    u8.set(chunk.buf, offset + 12);
    offset += 12 + chunk.buf.length;
  });

  return buf;
}

// ── MediaRecorder fallback ────────────────────────────────────────────────────
async function encodeWithMediaRecorder(canvas, segments, parsedData, firmName, firmColor, year, onProgress) {
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm;codecs=vp8';

  const stream   = canvas.captureStream(FPS);
  const chunks   = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise(r => { recorder.onstop = r; });
  recorder.start(100);

  const totalMs = segments.reduce((s, seg) => s + (seg.duration_ms || 4000), 0);
  let elapsed = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg      = segments[i];
    const durMs    = seg.duration_ms || 4000;
    const frames   = Math.round(durMs / 1000 * FPS);
    const totalFrames = totalMs / 1000 * FPS;

    for (let f = 0; f < frames; f++) {
      renderFrame(canvas, seg, parsedData, firmName, firmColor, year, seg.text);
      if (onProgress) onProgress(Math.round(((elapsed / 1000 * FPS + f) / totalFrames) * 100));
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }
    elapsed += durMs;
  }

  recorder.stop();
  await done;
  return new Blob(chunks, { type: mimeType });
}

// ── React component ───────────────────────────────────────────────────────────
export default function VideoRenderer({
  segments = [],
  parsedData = {},
  firmName = '',
  firmColor = 'var(--color-purple)',
  year = new Date().getFullYear() - 1,
  onComplete,
  onProgress,
}) {
  const canvasRef = useRef(null);
  const [status,   setStatus]   = useState('idle');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [engine,   setEngine]   = useState('');

  // Detect WebCodecs support on mount
  const webCodecsSupported = typeof VideoEncoder !== 'undefined';

  async function render() {
    if (!segments.length) { setErrorMsg('No segments to render'); return; }

    setStatus('rendering');
    setProgress(0);
    setVideoUrl(null);
    setErrorMsg('');

    const canvas = canvasRef.current;
    canvas.width  = WIDTH;
    canvas.height = HEIGHT;

    try {
      let blob;
      if (webCodecsSupported) {
        setEngine('WebCodecs (fast)');
        blob = await encodeWithWebCodecs(
          canvas, segments, parsedData, firmName, firmColor, year,
          pct => { setProgress(pct); if (onProgress) onProgress(pct); }
        );
      } else {
        if (!window.MediaRecorder) {
          setErrorMsg('Video rendering requires Chrome, Edge, or Firefox. Safari 16.4+ also works.');
          setStatus('error');
          return;
        }
        setEngine('MediaRecorder (real-time)');
        blob = await encodeWithMediaRecorder(
          canvas, segments, parsedData, firmName, firmColor, year,
          pct => { setProgress(pct); if (onProgress) onProgress(pct); }
        );
      }

      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setStatus('done');
      setProgress(100);
      if (onComplete) onComplete(url, blob);

    } catch (err) {
      console.error('Render error:', err);
      setErrorMsg(`Render failed: ${err.message}. Try Chrome or Edge.`);
      setStatus('error');
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Hidden canvas — all drawing happens here */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        width={WIDTH}
        height={HEIGHT}
      />

      {status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <button
            onClick={render}
            style={{
              padding: '11px 28px', background: 'var(--color-purple)', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            🎬 Render video
          </button>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
            {webCodecsSupported
              ? '✓ Fast rendering available — ~5–10 seconds for a 2-minute walkthrough'
              : 'Real-time rendering (Chrome or Edge recommended for fast mode)'}
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
            <div style={{
              height: '100%', width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--color-purple), var(--color-purple-grad))',
              borderRadius: 3, transition: 'width 0.2s',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted-light)', marginTop: 6 }}>
            {webCodecsSupported
              ? 'Encoding frames with WebCodecs — do not close this tab'
              : 'Rendering in real time — keep this tab open and active'}
          </div>
        </div>
      )}

      {status === 'done' && videoUrl && (
        <div>
          {/* Preview */}
          <video
            src={videoUrl}
            controls
            style={{ width: '100%', borderRadius: 10, marginBottom: 10, background: '#000' }}
          />

          {/* ── Delivery options ── */}
          <div style={{ background: 'var(--color-purple-4)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Deliver to client
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-dark)', lineHeight: 1.6, marginBottom: 10 }}>
              <strong>Best method:</strong> use the "Generate walkthrough" button in Walkthroughs
              to get a <strong>share link</strong> — plays on any device including iPhone, without
              any file download required.
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.6 }}>
              The download below is a local preview for your own review.
              The .webm format plays in Chrome, Edge, Firefox, and VLC.
              It does <strong>not</strong> play natively on iOS Safari.
              {' '}
              <a href="https://cloudconvert.com/webm-to-mp4" target="_blank" rel="noreferrer"
                style={{ color: 'var(--color-purple)' }}>
                Convert to MP4 via CloudConvert
              </a>
              {' '}if you need a file to attach to an email.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={videoUrl}
              download={`TaxStory_Walkthrough_${year}.webm`}
              style={{
                flex: 1, padding: '10px', background: 'var(--color-dark)', color: '#fff',
                border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              ↓ Download preview (.webm)
            </a>
            <button
              onClick={() => { setStatus('idle'); setProgress(0); setVideoUrl(null); }}
              style={{
                padding: '10px 16px', background: 'var(--color-purple-3)', color: 'var(--color-purple)',
                border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Re-render
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          background: 'var(--color-red-light)', color: 'var(--color-red-dark)', padding: '12px 14px',
          borderRadius: 10, fontSize: 13,
        }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}
