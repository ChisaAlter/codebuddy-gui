import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

const API = 'http://127.0.0.1:7890';

export default function ChatView() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const endRef = useRef(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const send = async () => {
        if (!input.trim() || isStreaming) return;

        const newMessages = [...messages, { role: 'user', content: input, ts: Date.now() }];
        setMessages(newMessages);
        setInput('');
        setIsStreaming(true);

        try {
            const res = await fetch(`${API}/api/v1/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' },
                body: JSON.stringify({ text: input })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let acc = '';
            const assistantMsg = { role: 'assistant', content: '', ts: Date.now() };
            setMessages(m => [...m, assistantMsg]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                acc += decoder.decode(value);
                setMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1] = { ...next[next.length - 1], content: acc };
                    return next;
                });
            }
        } catch (err) {
            setMessages(m => [...m, { role: 'error', content: 'Error: ' + err.message, ts: Date.now() }]);
        } finally {
            setIsStreaming(false);
        }
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)', background: 'var(--color-bg-secondary)' }}>
                <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>New Chat</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center mt-20">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--color-accent-brand-dim)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-accent-brand)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Start a conversation</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Send a message to begin interacting with CodeBuddy</p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role !== 'user' && (
                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--color-accent-brand)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            </div>
                        )}
                        <div className="max-w-[75%] rounded-2xl px-4 py-2.5" style={{
                            background: msg.role === 'user' ? 'var(--color-bg-user)' : msg.role === 'error' ? 'var(--color-accent-red-dim)' : 'var(--color-bg-secondary)',
                            border: `1px solid ${msg.role === 'error' ? 'var(--color-accent-red)' : 'var(--color-border-muted)'}`,
                        }}>
                            {msg.role === 'assistant' ? (
                                <ReactMarkdown className="prose prose-invert prose-sm max-w-none">{msg.content}</ReactMarkdown>
                            ) : msg.role === 'error' ? (
                                <pre className="text-xs whitespace-pre-wrap font-mono" style={{ color: 'var(--color-accent-red)' }}>{msg.content}</pre>
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--color-accent-green)' }}>
                                <span className="text-xs font-medium text-white">U</span>
                            </div>
                        )}
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <div className="px-5 py-3" style={{ borderTop: '1px solid var(--color-border-muted)' }}>
                <div className="flex gap-3 items-end">
                    <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-muted)' }}>
                        <textarea
                            className="w-full resize-none outline-none"
                            style={{ background: 'transparent', color: 'var(--color-text-primary)', fontSize: 13, minHeight: 24, maxHeight: 120 }}
                            placeholder="Message CodeBuddy..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                            rows={1}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <div />
                            <button onClick={send} disabled={isStreaming || !input.trim()}
                                className="rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                                style={{ background: 'var(--color-accent-brand)', color: '#fff', fontSize: 12, fontWeight: 500, opacity: isStreaming || !input.trim() ? 0.5 : 1 }}>
                                {isStreaming ? 'Sending...' : (
                                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> Send</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
