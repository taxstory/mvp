// src/remotion/compositions/TaxStoryComposition.jsx
// Main Remotion composition — orchestrates segments, audio sync, and highlights.
// Each segment = one Scene: Form1040Layout with activeField + audio + subtitles.

import React from 'react';
import {
  AbsoluteFill, Audio, Sequence, useCurrentFrame,
  useVideoConfig, interpolate, spring,
} from 'remotion';
import Form1040Layout from './Form1040Layout';

const FPS = 30;

// Converts segment duration_ms to frame count
function msToFrames(ms) { return Math.round((ms / 1000) * FPS); }

// Animated subtitle with word-by-word opacity
function Subtitle({ text }) {
  const frame = useCurrentFrame();
  const words  = text.split(' ');
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{
        background: 'rgba(26,18,48,0.92)',
        padding: '14px 32px',
        minHeight: '52px',
        display: 'flex', alignItems: 'center',
      }}>
        <p style={{
          margin: 0, fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '18px', fontWeight: 500, color: 'white',
          lineHeight: 1.5, maxWidth: '900px',
        }}>
          {words.map((word, i) => {
            const opacity = interpolate(frame, [i * 2, i * 2 + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return <span key={i} style={{ opacity, display: 'inline' }}>{word} </span>;
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
}

// Highlight pulse animation on the active field indicator
function HighlightPulse() {
  const frame = useCurrentFrame();
  const scale = spring({ frame, fps: FPS, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(frame, [0, 10, 20, 30], [0, 1, 1, 0.7], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div style={{
        position: 'absolute', top: '14px', right: '28px',
        background: '#F59E0B', color: 'white',
        padding: '4px 12px', borderRadius: '20px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase',
        transform: `scale(${scale})`,
        transformOrigin: 'top right',
      }}>
        ● Highlighted
      </div>
    </AbsoluteFill>
  );
}

// Scene transition — subtle slide-in
function SceneTransition({ children, direction = 'right' }) {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 8], [direction === 'right' ? 20 : -20, 0], {
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ transform: `translateX(${x}px)`, opacity, width: '100%', height: '100%', position: 'absolute' }}>
      {children}
    </div>
  );
}

// Cover / intro / outro frame
function CoverFrame({ firmName, firmColor, year, isOutro }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(frame, [0, 15], [20, 0], { extrapolateRight: 'clamp' });
  const accentColor = firmColor || '#6B5CE7';

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, #1A1230 0%, ${accentColor} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ opacity, transform: `translateY(${y}px)`, textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '36px', fontWeight: 700, color: 'white', marginBottom: '10px' }}>
          {isOutro ? 'Thank You' : `Tax Year ${year} Review`}
        </div>
        <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', marginBottom: '30px' }}>
          {isOutro ? 'Questions? Reach out anytime.' : 'Your personalized walkthrough'}
        </div>
        {firmName && (
          <div style={{
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(10px)',
            padding: '10px 24px', borderRadius: '24px',
            fontSize: '15px', fontWeight: 600, color: 'white',
          }}>
            {firmName}
          </div>
        )}
        {!isOutro && (
          <div style={{ marginTop: '40px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            Powered by TaxStory
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export default function TaxStoryComposition({
  segments    = [],
  parsedData  = {},
  year        = 2025,
  firmName    = 'TaxStory',
  firmColor   = '#6B5CE7',
}) {
  // Build the frame timeline from segment durations
  const timeline = segments.map((seg, i) => ({
    ...seg,
    frames:      msToFrames(seg.duration_ms || 4000),
    startFrame:  segments.slice(0, i).reduce((s, p) => s + msToFrames(p.duration_ms || 4000), 0),
  }));

  return (
    <AbsoluteFill>
      {timeline.map((seg, i) => (
        <Sequence
          key={i}
          from={seg.startFrame}
          durationInFrames={seg.frames}
          name={`${seg.field_ref} — ${seg.section}`}
        >
          <SceneTransition direction={i % 2 === 0 ? 'right' : 'left'}>
            {/* Audio for this segment */}
            {seg.audio_url && (
              <Audio src={seg.audio_url} />
            )}

            {/* Visual layer */}
            {(seg.field_ref === 'intro' || seg.field_ref === 'outro') ? (
              <CoverFrame
                firmName={firmName}
                firmColor={firmColor}
                year={year}
                isOutro={seg.field_ref === 'outro'}
              />
            ) : (
              <Form1040Layout
                parsedData={parsedData}
                activeField={seg.field_ref}
                year={year}
                firmName={firmName}
                firmColor={firmColor}
              />
            )}

            {/* Highlight pulse badge */}
            {seg.field_ref !== 'intro' && seg.field_ref !== 'outro' && (
              <HighlightPulse />
            )}

            {/* Subtitles */}
            <Subtitle text={seg.text} />
          </SceneTransition>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

// Remotion composition registration helper
// Import this in your root.jsx
export function registerComposition() {
  const { Composition } = require('remotion');
  const totalFrames = /* injected at render time */ 900; // 30s default
  return (
    <Composition
      id="TaxStoryWalkthrough"
      component={TaxStoryComposition}
      durationInFrames={totalFrames}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{
        segments:   [],
        parsedData: {},
        year:       2025,
        firmName:   'TaxStory',
        firmColor:  '#6B5CE7',
      }}
    />
  );
}
