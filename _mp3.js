// netlify/functions/_mp3.js — exact MP3 duration and proper concatenation (replaces "bytes ÷ 3000", which assumes a constant ~24 kbps and drifts for any other bitrate,
// and a bare Buffer.concat, which leaves each part's ID3 tag and Xing/Info frame in the middle of the stream so players read the wrong duration and seek wrongly).
//
// Duration is measured from the encoded frames: every MPEG audio frame holds a fixed number of samples (1152 for MPEG-1 Layer III, 576 for MPEG-2/2.5), so
// duration = frames × samples-per-frame ÷ sample-rate, whatever the bitrate (CBR or VBR). Only Layer III (MP3) is supported — it is what the TTS provider returns.
// Not handled: gapless-playback trimming (a few tens of milliseconds of encoder delay per part); parts are joined frame-for-frame.
const BITRATES = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0] };   // kbps, Layer III
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };                                                              // keyed by the 2 version bits

function readHeader(b, p) {
  if (p + 4 > b.length || b[p] !== 0xFF || (b[p + 1] & 0xE0) !== 0xE0) return null;
  const vbits = (b[p + 1] >> 3) & 3, layer = (b[p + 1] >> 1) & 3;
  if (vbits === 1 || layer !== 1) return null;                          // reserved version, or not Layer III
  const bIdx = b[p + 2] >> 4, sIdx = (b[p + 2] >> 2) & 3, pad = (b[p + 2] >> 1) & 1;
  if (bIdx === 0 || bIdx === 15 || sIdx === 3) return null;             // free-format / bad bitrate, reserved sample rate
  const mpeg1 = vbits === 3, bitrate = BITRATES[mpeg1 ? 1 : 2][bIdx] * 1000, sampleRate = SAMPLE_RATES[vbits][sIdx];
  const samples = mpeg1 ? 1152 : 576, length = Math.floor((mpeg1 ? 144 : 72) * bitrate / sampleRate) + pad;
  const mono = ((b[p + 3] >> 6) & 3) === 3, hasCrc = (b[p + 1] & 1) === 0;
  return { length, samples, sampleRate, bitrate, vbits, mono, mpeg1, hasCrc };
}
function isInfoFrame(b, p, h) {                                          // Xing / Info / VBRI describe the stream; they carry no audio
  const side = h.mpeg1 ? (h.mono ? 17 : 32) : (h.mono ? 9 : 17), at = p + 4 + (h.hasCrc ? 2 : 0) + side, tag = b.toString('latin1', at, at + 4);
  return tag === 'Xing' || tag === 'Info' || b.toString('latin1', p + 36, p + 40) === 'VBRI';
}

/** @returns {{ frames: {offset,length}[], durationMs: number, sampleRate: number, version: number, mono: boolean, hadInfoFrame: boolean, junkBytes: number }} — throws if no valid MP3 audio is found. */
function parseMp3(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let pos = 0, end = b.length;
  if (b.length >= 10 && b.toString('latin1', 0, 3) === 'ID3') pos = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)) + ((b[5] & 0x10) ? 10 : 0);
  if (end - pos >= 128 && b.toString('latin1', end - 128, end - 125) === 'TAG') end -= 128;
  const frames = []; let samples = 0, junk = 0, first = null, hadInfoFrame = false, prevEnd = -1;   // prevEnd: where the last VERIFIED frame ended
  while (pos < end) {
    const h = readHeader(b, pos);
    // A candidate frame is real if it fits AND (it is followed by another frame header, or the stream ends there, OR it begins exactly where the previous verified frame ended).
    // The last clause keeps a genuine frame that is followed by junk, while a stray sync byte inside junk — neither chained nor contiguous — is still rejected.
    const fits = h && pos + h.length <= end, chained = fits && (pos + h.length === end || readHeader(b, pos + h.length) !== null || pos === prevEnd);
    if (!h || !fits || !chained) { junk++; pos++; continue; }                 // not a frame: skip one byte and look for the next sync (a truncated last frame ends up here too)
    if (!first) { first = h; if (isInfoFrame(b, pos, h)) { hadInfoFrame = true; pos += h.length; prevEnd = pos; continue; } }
    if (h.sampleRate !== first.sampleRate || h.vbits !== first.vbits) { junk += h.length; pos += h.length; continue; }   // a stray frame of another format is not part of this stream
    frames.push({ offset: pos, length: h.length }); samples += h.samples; pos += h.length; prevEnd = pos;
  }
  if (!frames.length || !first) throw Object.assign(new Error('Not a valid MP3 (no audio frames found)'), { userMessage: 'The voice service returned audio that could not be read. Please try again.' });
  return { frames, durationMs: samples / first.sampleRate * 1000, sampleRate: first.sampleRate, version: first.vbits, mono: first.mono, hadInfoFrame, junkBytes: junk };
}
const mp3DurationMs = buf => Math.round(parseMp3(buf).durationMs);

/**
 * Join MP3 parts into one stream: frame-for-frame, with every part's ID3 tags, Xing/Info frame and junk removed (they describe only their own part and
 * would give players a wrong duration and broken seeking). All parts must share sample rate and MPEG version (they do: one TTS model and voice).
 * @returns {{ buffer: Buffer, durationMs: number, partsMs: number[] }}   durationMs is exact (frames), partsMs are per-part exact durations.
 */
function concatMp3(buffers) {
  const pieces = [], partsMs = []; let ref = null, total = 0;
  for (const buf of buffers) {
    const p = parseMp3(buf);
    if (ref && (p.sampleRate !== ref.sampleRate || p.version !== ref.version)) throw Object.assign(new Error('MP3 parts differ in sample rate or MPEG version'), { userMessage: 'The voice service returned audio in an unexpected format. Please try again.' });
    ref = ref || p; const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    for (const f of p.frames) pieces.push(b.subarray(f.offset, f.offset + f.length));
    partsMs.push(p.durationMs); total += p.durationMs;
  }
  return { buffer: Buffer.concat(pieces), durationMs: total, partsMs };
}

module.exports = { parseMp3, mp3DurationMs, concatMp3 };
