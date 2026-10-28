// src/pages/app/MessagesPage.jsx
// Simple inbox for CPA — shows inbound messages from clients.
// AppLayout already shows a live unread badge driven by the messages table.
// Marking a message read fires a Supabase update and clears the badge.

import { useState, useEffect, useCallback, useRef } from 'react';
import { safeMailtoAddress } from '../../utils/safeRedirect';
import { useAuth }   from '../../context/AuthContext';
import { supabase }  from '../../lib/supabase';

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null); // open message id

  const [replyBody,    setReplyBody]   = useState('');
  const [isMobile,     setIsMobile]    = useState(typeof window !== 'undefined' && window.innerWidth < 640);
  const [mobileView,   setMobileView]  = useState('list'); // 'list' | 'detail'

  // Responsive: update isMobile on resize
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [replySending, setReplySending] = useState(false);
  const [replySent,    setReplySent]    = useState(false);

  async function sendReply(msg) {
    if (!replyBody.trim() || !user) return;
    setReplySending(true);
    try {
      // Store outbound message in DB
      await supabase.from('messages').insert({
        user_id:   user.id,
        client_id: msg.client_id || null,
        direction: 'outbound',
        body:      replyBody.trim(),
        read:      true,
        sent_at:   new Date().toISOString(),
      });
      // If we have the client's email, send via Resend through a simple function call
      // For now: open mailto as fallback (reliable, no extra function needed)
      const emailTo = safeMailtoAddress(msg.clients?.email) || safeMailtoAddress(msg.sent_to);   // a stored value with ?, &, commas or spaces could add recipients or a body to the mailto: link
      if (emailTo) {
        const opened = window.open(
          `mailto:${emailTo}?subject=Re: Your tax walkthrough&body=${encodeURIComponent(replyBody.trim())}`,
          '_blank'
        );
        // Some corporate environments block window.open for mailto — give user fallback
        if (!opened) {
          const link = document.createElement('a');
          link.href = `mailto:${emailTo}?subject=Re: Your tax walkthrough&body=${encodeURIComponent(replyBody.trim())}`;
          link.click();
        }
      }
      setReplyBody('');
      setReplySent(true);
      setTimeout(() => setReplySent(false), 3000);
      await fetchMessages();
    } catch (e) { console.error('sendReply:', e); }
    setReplySending(false);
  }

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('messages')
      .select('id, direction, body, read, sent_at, sent_to, client_id, clients(name, email)')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(50);
    setMessages(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime — badge in AppLayout already listens; duplicate here keeps this page live too
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('messages-page-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchMessages())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, fetchMessages]);

  async function markRead(id) {
    await supabase.from('messages').update({ read: true, read_at: new Date().toISOString() }).eq('id', id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
  }

  function openMessage(msg) {
    setSelected(msg.id);
    setReplyBody('');
    setReplySent(false);
    if (!msg.read) markRead(msg.id);
    if (isMobile) setMobileView('detail');
  }

  const unread = messages.filter(m => !m.read && m.direction === 'inbound').length;

  return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Messages</div>
          <div className="ts-page-sub">
            {loading ? '…' : `${messages.length} total · ${unread} unread`}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>Loading…</div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign:'center', padding:64 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
          <div style={{ fontSize:14, color:'var(--muted)', marginBottom:8 }}>No messages yet.</div>
          <div style={{ fontSize:12, color:'var(--muted-light)' }}>
            When a client replies to their walkthrough, it will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', gap: isMobile ? 0 : 16, flexDirection:'column' }}>
          {/* Mobile back button */}
          {isMobile && mobileView === 'detail' && (
            <button onClick={() => setMobileView('list')}
              style={{ alignSelf:'flex-start', background:'none', border:'none', color:'var(--purple)',
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                padding:'4px 0', marginBottom:10, display:'flex', alignItems:'center', gap:4 }}>
              ← All messages
            </button>
          )}
        <div style={{ display:'flex', gap:16 }}>

          {/* Message list — hidden on mobile when detail is open */}
          <div style={{ flex:'0 0 340px', display: isMobile && mobileView === 'detail' ? 'none' : 'flex', flexDirection:'column', gap:0,
            background:'#fff', border:'1px solid var(--color-border)', borderRadius:13, overflow:'hidden' }}>
            {messages.map((m, i) => (
              <div
                key={m.id}
                onClick={() => openMessage(m)}
                style={{
                  padding:'13px 16px',
                  borderBottom: i < messages.length-1 ? '1px solid var(--color-gray-bg)' : 'none',
                  cursor:'pointer',
                  background: selected === m.id ? 'var(--color-bg)' : '#fff',
                  borderLeft: selected === m.id ? '3px solid var(--purple)' : '3px solid transparent',
                }}
              >
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                  <div style={{ fontSize:12.5, fontWeight: m.read ? 500 : 700, color:'var(--color-dark)' }}>
                    {m.clients?.name || m.sent_to || 'Unknown sender'}
                    {!m.read && m.direction === 'inbound' && (
                      <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
                        background:'var(--purple)', marginLeft:6, verticalAlign:'middle' }} />
                    )}
                  </div>
                  <div style={{ fontSize:10.5, color:'var(--muted-light)' }}>
                    {new Date(m.sent_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.4,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:280 }}>
                  {m.direction === 'inbound' ? '' : 'You: '}{m.body}
                </div>
              </div>
            ))}
          </div>

          {/* Message detail — hidden on mobile when list is showing */}
          <div style={{ flex:1, display: isMobile && mobileView === 'list' ? 'none' : 'block' }}>
            {selected ? (() => {
              const msg = messages.find(m => m.id === selected);
              if (!msg) return null;
              return (
                <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:13, padding:'24px 28px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--color-dark)' }}>
                        {msg.clients?.name || msg.sent_to || 'Unknown sender'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                        {msg.direction === 'inbound' ? 'Client message' : 'Sent by you'} ·{" "}
                        {new Date(msg.sent_at).toLocaleString('en-US', {
                          month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
                        })}
                      </div>
                    </div>
                    {msg.direction === 'inbound' && (
                      <span style={{ padding:'4px 10px', background:'var(--color-purple-3)',
                        color:'var(--purple)', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        Client reply
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:14, color:'var(--color-dark)', lineHeight:1.8,
                    padding:'16px 18px', background:'var(--color-soft)', borderRadius:10,
                    borderLeft:'3px solid var(--purple)' }}>
                    {msg.body}
                  </div>

                  {/* Reply composer — only for inbound messages */}
                  {msg.direction === 'inbound' && (
                    <div style={{ marginTop:20, paddingTop:18, borderTop:'1px solid var(--color-gray-bg)' }}>
                      <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)',
                        textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                        Reply to {msg.clients?.name || msg.sent_to || 'client'}
                      </div>
                      {replySent ? (
                        <div style={{ padding:'12px 14px', background:'var(--green-bg)', borderRadius:10,
                          fontSize:13, fontWeight:600, color:'var(--green-dark)' }}>
                          ✓ Reply saved — {msg.clients?.email || msg.sent_to ? 'check your email client to send' : 'no client email on file'}
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={replyBody}
                            onChange={e => setReplyBody(e.target.value)}
                            placeholder="Type your reply…"
                            style={{ width:'100%', minHeight:80, padding:'10px 12px',
                              border:'1px solid var(--color-border)', borderRadius:10, fontSize:13,
                              fontFamily:'inherit', lineHeight:1.6, resize:'vertical',
                              color:'var(--color-dark)', boxSizing:'border-box' }}
                          />
                          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
                            <button
                              disabled={replySending || !replyBody.trim()}
                              onClick={() => sendReply(msg)}
                              style={{ padding:'9px 18px', background:'var(--purple)', color:'#fff',
                                border:'none', borderRadius:9, fontSize:13, fontWeight:600,
                                cursor:'pointer', fontFamily:'inherit',
                                opacity: replySending || !replyBody.trim() ? 0.6 : 1 }}>
                              {replySending ? 'Sending…' : 'Send reply'}
                            </button>
                            {!msg.clients?.email && (
                              <span style={{ fontSize:11, color:'var(--muted)' }}>
                                No email on file — reply logged in TaxStory but not emailed
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })() : (
              <div style={{ background:'var(--color-soft)', border:'1px solid var(--color-border)', borderRadius:13,
                padding:'48px 28px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                Select a message to read it
              </div>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
