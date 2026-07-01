import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../store';

const API = 'http://127.0.0.1:7890';

function TypingIndicator() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--color-accent-primary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <div className="flex items-center gap-1 px-3 py-2 rounded-2xl" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)', animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)', animationDelay: '0.4s' }} />
            </div>
            <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>CodeBuddy is thinking...</span>
        </div>
    );
}

function MessageCard({ msg, isLast }) {
    const [copied, setCopied] = useState(false);
    const isUser = msg.role === 'user';
    const isError = msg.role === 'error';

    const copyCode = (code) => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`flex gap-3 animate-fadeIn ${isUser ? 'justify-end' : ''}`}>
            {!isUser && (
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-1" style={{ background: isError ? 'var(--color-error)' : 'var(--color-accent-primary)' }}>
                    {isError ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    )}
                </div>
            )}
            <div className="max-w-[78%]">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                        {isUser ? 'You' : isError ? 'Error' : 'CodeBuddy'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <div className="rounded-2xl px-4 py-3" style={{
                    background: isUser ? 'var(--color-bg-user)' : isError ? 'var(--color-error-dim)' : 'var(--color-bg-secondary)',
                    border: `1px solid ${isError ? 'var(--color-error)' : 'var(--color-border-muted)'}`,
                }}>
                    {isError ? (
                        <pre className="text-xs whitespace-pre-wrap font-mono" style={{ color: 'var(--color-error)' }}>{msg.content}</pre>
                    ) : (
                        <ReactMarkdown className="prose">{msg.content}</ReactMarkdown>
                    )}
                </div>
                {!isUser && !isError && !isLast && (
                    <div className="flex items-center gap-2 mt-1.5">
                        <button className="text-xs" style={{ color: 'var(--color-text-muted)' }}>👍</button>
                        <button className="text-xs" style={{ color: 'var(--color-text-muted)' }}>👎</button>
                        <button onClick={() => copyCode(msg.content)} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {copied ? '✓ Copied' : '📋 Copy'}
                        </button>
                    </div>
                )}
            </div>
            {isUser && (
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-1" style={{ background: 'var(--color-success)' }}>
                    <span className="text-xs font-medium text-white">U</span>
                </div>
            )}
        </div>
    );
}

export default function ChatView() {
    const { isStreaming, setIsStreaming, activeSessionId, addChatMessage, getCurrentChat, updateLastChatMessage, addToast, settings } = useStore();
    const [input, setInput] = useState('');
    const [attachedFiles, setAttachedFiles] = useState([]);
    const endRef = useRef(null);
    const textareaRef = useRef(null);
    const messages = getCurrentChat();

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async () => {
        if (!input.trim() && attachedFiles.length === 0) return;
        if (isStreaming) return;

        const content = input.trim();
        setInput('');
        setAttachedFiles([]);
        addChatMessage({ role: 'user', content, ts: Date.now() });
        setIsStreaming(true);

        try {
            const res = await fetch(`${API}/api/v1/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' },
                body: JSON.stringify({ text: content, model: settings.model })
            });

            if (!res.ok) throw new Error(`Server returned ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value);

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
                        try {
                            const parsed = JSON.parse(data);
                            const text = parsed.text || parsed.content || parsed.delta?.text || '';
                            if (text) {
                                updateLastChatMessage(msg => ({
                                    ...msg,
                                    content: msg.content + text
                                }));
                            }
                        } catch (e) {
                            // Treat as plain text
                            updateLastChatMessage(msg => ({
                                ...msg,
                                content: msg.content + data
                            }));
                        }
                    } else if (line.trim()) {
                        updateLastChatMessage(msg => ({
                            ...msg,
                            content: msg.content + line
                        }));
                    }
                }
            }

            // Ensure we have at least an empty message
            updateLastChatMessage(msg => {
                if (!msg) return { role: 'assistant', content: 'No response received', ts: Date.now() };
                return msg;
            });

        } catch (err) {
            addChatMessage({ role: 'error', content: `Failed to connect: ${err.message}`, ts: Date.now() });
            addToast({ type: 'error', message: `Request failed: ${err.message}` });
        } finally {
            setIsStreaming(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const autoResize = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {activeSessionId ? `Session ${activeSessionId.slice(0, 8)}` : 'New Chat'}
                    </h2>
                    <span className="tag tag-purple" style={{ fontSize: 10 }}>AI Chat</span>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="text-xs"
                        style={{
                            background: 'var(--color-bg-input)',
                            color: 'var(--color-text-secondary)',
                            padding: '5px 24px 5px 10px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border-muted)',
                            fontSize: 12,
                            cursor: 'pointer'
                        }}
                        value={settings.model}
                        onChange={e => useStore.getState().setSettings({ model: e.target.value })}
                    >
                        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                        <option value="claude-opus-4">Claude Opus 4</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                    </select>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center animate-fadeIn">
                            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-accent-primary-glow)', border: '1px solid var(--color-accent-primary-dim)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--color-accent-primary)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </div>
                            <p className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Start a conversation</p>
                            <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
                                Ask anything — CodeBuddy can read files, run commands, search the web, and more.
                            </p>
                            <div className="flex justify-center gap-2 mt-5">
                                {['💻 Write code', '🐛 Debug issue', '📖 Explain code'].map(suggestion => (
                                    <button key={suggestion} onClick={() => setInput(suggestion.slice(2))}
                                        className="px-3 py-1.5 rounded-lg text-xs"
                                        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)', color: 'var(--color-text-secondary)' }}>
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <MessageCard key={i} msg={msg} isLast={i === messages.length - 1} />
                ))}
                {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator />}
                {isStreaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1].content && <TypingIndicator />}
                <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--color-border-muted)' }}>
                {attachedFiles.length > 0 && (
                    <div className="flex gap-2 pt-3 pb-2">
                        {attachedFiles.map((file, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-text-muted)"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                                <span style={{ color: 'var(--color-text-secondary)' }}>{file.name}</span>
                                <button onClick={() => setAttachedFiles(attachedFiles.filter((_, j) => j !== i))} style={{ color: 'var(--color-text-muted)' }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-3 items-end pt-3">
                    <div className="flex-1 rounded-xl" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-muted)', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
                        {/* When focused, apply ring */}
                        <textarea
                            ref={textareaRef}
                            className="w-full resize-none px-4 pt-3 outline-none"
                            style={{
                                background: 'transparent',
                                color: 'var(--color-text-primary)',
                                fontSize: 13,
                                lineHeight: 1.6,
                                minHeight: 44,
                                maxHeight: 180,
                            }}
                            placeholder="Message CodeBuddy... (Shift+Enter for new line)"
                            value={input}
                            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                            onKeyDown={handleKeyDown}
                            onFocus={e => { e.target.parentElement.style.borderColor = 'var(--color-border-active)'; e.target.parentElement.style.boxShadow = '0 0 0 3px var(--color-border-focus)'; }}
                            onBlur={e => { e.target.parentElement.style.borderColor = 'var(--color-border-muted)'; e.target.parentElement.style.boxShadow = 'none'; }}
                            rows={1}
                        />
                        <div className="flex justify-between items-center px-3 pb-2.5">
                            <div className="flex gap-1">
                                <button className="btn-icon" style={{ width: 28, height: 28, borderRadius: 6 }} title="Attach file">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-text-muted)"><path d="M14.83 13.41L13.42 14.82l1.06 1.06c.78.78.78 2.05 0 2.83s-2.05.78-2.83 0l-3.54-3.54-1.41 1.41 3.54 3.54c1.56 1.56 4.09 1.56 5.66 0s1.56-4.09 0-5.66l-1.06-1.06zM2.81 2.81L1.39 4.22l3.54 3.54c-1.56 1.56-1.56 4.09 0 5.66s4.09 1.56 5.66 0l1.06 1.06 1.41-1.41L9.52 9.52"/></svg>
                                </button>
                                <button className="btn-icon" style={{ width: 28, height: 28, borderRadius: 6 }} title="Search code">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-text-muted)"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                {isStreaming && <span className="text-xs animate-pulse" style={{ color: 'var(--color-accent-primary)' }}>Generating...</span>}
                                <button onClick={send} disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
                                    className="rounded-lg px-3.5 py-1.5 flex items-center gap-1.5"
                                    style={{
                                        background: 'var(--color-accent-primary)',
                                        color: '#fff',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        opacity: (!input.trim() && attachedFiles.length === 0) || isStreaming ? 0.4 : 1,
                                        transition: 'all 0.15s',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                    {isStreaming ? (
                                        <span className="w-3 h-3 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                    )}
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
