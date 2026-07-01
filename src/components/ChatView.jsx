import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function ChatView() {
    const {
        settings, addChatMessage, sendChat, activeSessionId,
        getCurrentChat, fetchActiveSessionMessages,
        isStreaming, setIsStreaming, apiConnected
    } = useStore();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const messagesEndRef = React.useRef(null);

    // Fetch messages when session changes
    useEffect(() => {
        if (activeSessionId) {
            fetchActiveSessionMessages().then(msgs => setMessages(msgs || []));
        }
    }, [activeSessionId]);

    // Poll streaming messages
    useEffect(() => {
        const interval = setInterval(() => {
            const msgs = getCurrentChat();
            setMessages(msgs || []);
        }, 200);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;
        const text = input;
        setInput('');
        await sendChat(text);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const streamingMsg = messages[messages.length - 1]?.streaming;

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {activeSessionId ? `Session ${activeSessionId.slice(0, 12)}` : (apiConnected ? 'New Chat' : 'API Disconnected')}
                    </h2>
                    {!apiConnected && <span className="tag tag-red">offline</span>}
                </div>
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

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center animate-fadeIn">
                            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-accent-primary-glow)', border: '1px solid var(--color-accent-primary-dim)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--color-accent-primary)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </div>
                            <p className="text-base font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                {apiConnected ? 'Start a conversation' : 'Waiting for CodeBuddy API...'}
                            </p>
                            <p className="text-sm max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
                                {apiConnected
                                    ? 'Send a message to begin interacting with CodeBuddy'
                                    : 'Make sure CodeBuddy is running with: codebuddy --serve --port 7890'
                                }
                            </p>
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 animate-fadeIn ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role !== 'user' && (
                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--color-accent-primary)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            </div>
                        )}
                        <div className="max-w-[78%]">
                            <div className="rounded-2xl px-4 py-3" style={{
                                background: msg.role === 'user' ? 'var(--color-bg-user)' : 'var(--color-bg-secondary)',
                                border: `1px solid var(--color-border-muted)`,
                            }}>
                                {msg.content ? (
                                    <div className="prose prose-sm">{msg.content}</div>
                                ) : msg.streaming ? (
                                    <div className="flex items-center gap-1 h-5">
                                        <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)' }} />
                                        <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)', animationDelay: '0.2s' }} />
                                        <span className="w-1.5 h-1.5 rounded-full animate-typing" style={{ background: 'var(--color-text-tertiary)', animationDelay: '0.4s' }} />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--color-success)' }}>
                                <span className="text-xs font-medium text-white">U</span>
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--color-border-muted)' }}>
                <div className="flex gap-3 items-end pt-3">
                    <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-muted)' }}>
                        <textarea
                            className="w-full resize-none outline-none"
                            style={{ background: 'transparent', color: 'var(--color-text-primary)', fontSize: 13, minHeight: 24, maxHeight: 120 }}
                            placeholder={apiConnected ? "Message CodeBuddy..." : "Waiting for CodeBuddy API..."}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={!apiConnected}
                            rows={1}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <div />
                            <button onClick={handleSend} disabled={!input.trim() || !apiConnected || !!streamingMsg}
                                className="rounded-lg px-3.5 py-1.5 flex items-center gap-1.5"
                                style={{
                                    background: 'var(--color-accent-primary)',
                                    color: '#fff',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    opacity: (!input.trim() || !apiConnected || !!streamingMsg) ? 0.4 : 1,
                                    transition: 'all 0.15s'
                                }}>
                                {streamingMsg ? (
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
    );
}
