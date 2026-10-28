// src/pages/app/HelpPage.jsx
// Real help content. Support address comes from VITE_SUPPORT_EMAIL so it can be
// changed without a code edit; the fallback must be a mailbox that exists.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@tellmytaxstory.com';

const STEPS = [
  ['Import a return', 'Tax Projections → New projection. Choose a completed return PDF — it is read on your device and never uploaded — or enter figures by hand.'],
  ['Check the figures', 'Compare the numbers with the return before you save. Names, SSNs and addresses are not read, and nothing is saved until you click Save.'],
  ['Review the script', 'Generate the narration script and edit any scene. No credit is spent until you confirm the script.'],
  ['Send it', 'Email the walkthrough link to your client or copy it. Clients watch without creating an account, and you are notified when they do.'],
];

export default function HelpPage() {
  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Help &amp; support</div>
          <div className="ts-page-sub">Answers, and a way to reach us</div>
        </div>
      </div>

      <div className="ts-g2m">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="ts-card">
            <div className="ts-card-title">How a walkthrough works</div>
            <ol style={{ margin:0, paddingLeft:20, display:'flex', flexDirection:'column', gap:12 }}>
              {STEPS.map(([title, body]) => (
                <li key={title} style={{ fontSize:13, color:'var(--dark)', lineHeight:1.6 }}>
                  <strong>{title}.</strong>{' '}
                  <span style={{ color:'var(--muted)' }}>{body}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ts-card">
            <div className="ts-card-title">Tips for clean results</div>
            <ul style={{ margin:0, paddingLeft:20, display:'flex', flexDirection:'column', gap:8, fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>
              <li>Use digitally generated PDFs from Drake, ProConnect, Lacerte or CCH. Scanned or photographed pages can&rsquo;t be parsed.</li>
              <li>If very few figures are read, re-export the PDF from your tax software and try again — or enter them manually.</li>
              <li>Always compare extracted figures with the return before generating a walkthrough.</li>
            </ul>
          </div>
        </div>

        <div className="ts-card" style={{ alignSelf:'start' }}>
          <div className="ts-card-title">Contact support</div>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>
            Something not working, or a question we haven&rsquo;t answered? Email us and include the client
            name and tax year if it&rsquo;s about a specific return. Never include SSNs.
          </div>
          <a className="ts-btn ts-btn-primary" href={`mailto:${SUPPORT_EMAIL}?subject=TaxStory%20support`}
             style={{ textDecoration:'none', width:'100%', justifyContent:'center', display:'flex' }}>
            Email {SUPPORT_EMAIL}
          </a>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:12, lineHeight:1.5 }}>
            Prefer to report a bug from inside the app? Use the feedback button at the bottom of the sidebar.
          </div>
        </div>
      </div>
    </div>
  );
}
