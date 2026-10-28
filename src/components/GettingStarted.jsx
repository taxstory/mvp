// src/components/GettingStarted.jsx
// Shown on the dashboard when a user has no clients/returns yet.
// Three-step checklist that collapses once all steps are done.
// Persists completion state in Supabase profile (getting_started_dismissed).

import { useState, useEffect } from 'react';
import { useNavigate }          from 'react-router-dom';
import { supabase }             from '../lib/supabase';
import { useAuth }              from '../context/AuthContext';

const STEPS = [
  {
    id:    'return_uploaded',
    icon:  '📄',
    title: 'Import your first return',
    desc:  'Choose a client PDF — it is read on your device and never uploaded. Takes a few seconds.',
    cta:   'Import a return',
    route: '/cpa/projections',
  },
  {
    id:    'video_generated',
    icon:  '🎬',
    title: 'Generate a walkthrough',
    desc:  'Turn the parsed return into a personalized 2-minute client walkthrough.',
    cta:   'Go to Walkthroughs',
    route: '/cpa/video',
  },
  {
    id:    'link_sent',
    icon:  '🔗',
    title: 'Send it to a client',
    desc:  'Generate a share link from the walkthrough list and send it — you\'ll be notified when they watch.',
    cta:   'Send to a client →',
    route: '/cpa/video',
  },
];

export default function GettingStarted({ completedSteps = {}, onDismiss }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const doneCount = STEPS.filter(s => completedSteps[s.id]).length;
  const allDone   = doneCount === STEPS.length;

  if (allDone) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--color-dark) 0%, var(--color-purple-2) 100%)',
      borderRadius: 14, padding: '20px 22px', marginBottom: 16,
      fontFamily: 'Inter,system-ui,sans-serif',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:'Playfair Display,serif', fontSize:16, fontWeight:700, color:'#fff', marginBottom:2 }}>
            Get started with TaxStory
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.45)' }}>
            {doneCount} of {STEPS.length} steps complete
          </div>
        </div>
        {/* Progress pill */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              width: completedSteps[s.id] ? 22 : 8, height:8, borderRadius:4,
              background: completedSteps[s.id] ? 'var(--color-purple)' : 'rgba(255,255,255,.2)',
              transition: 'width .3s',
            }} />
          ))}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {STEPS.map((step, i) => {
          const done = !!completedSteps[step.id];
          return (
            <div
              key={step.id}
              style={{
                background: done ? 'rgba(107,92,231,.25)' : 'rgba(255,255,255,.07)',
                borderRadius: 10,
                padding: '14px 14px 12px',
                border: `1px solid ${done ? 'rgba(107,92,231,.4)' : 'rgba(255,255,255,.1)'}`,
                opacity: done ? 0.75 : 1,
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{
                  width:28, height:28, borderRadius:'50%', flexShrink:0,
                  background: done ? 'var(--color-purple)' : 'rgba(255,255,255,.12)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize: done ? 13 : 14,
                }}>
                  {done ? '✓' : step.icon}
                </div>
                <div style={{ fontSize:12, fontWeight:700, color: done ? 'rgba(255,255,255,.6)' : '#fff', lineHeight:1.3 }}>
                  {step.title}
                </div>
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', lineHeight:1.5, marginBottom:10 }}>
                {step.desc}
              </div>
              {!done && (
                <button
                  onClick={() => navigate(step.route)}
                  style={{
                    padding:'5px 12px', background:'var(--color-purple)', color:'#fff',
                    border:'none', borderRadius:7, fontSize:11.5, fontWeight:600,
                    cursor:'pointer', fontFamily:'inherit',
                  }}
                >
                  {step.cta} →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dismiss */}
      <div style={{ marginTop:12, textAlign:'right' }}>
        <button
          onClick={onDismiss}
          style={{
            background:'transparent', border:'none', color:'rgba(255,255,255,.3)',
            fontSize:11, cursor:'pointer', fontFamily:'inherit', padding:'2px 4px',
          }}
        >
          Hide this
        </button>
      </div>
    </div>
  );
}
