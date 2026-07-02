import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, ChevronDown } from 'lucide-react';
import TypingDots from './ui/TypingDots';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  'How do I get the most from AI analysis?',
  'What is VAVE and how does tracking work?',
  'How are cost savings calculated?',
  'What does "Verified" confidence mean?',
  'How to export ideas to PowerPoint?',
];

export default function AiChatbot() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm BrainSpark Assistant. I can help you get the most from this platform — from running analyses, understanding cost savings, managing the VAVE pipeline, or navigating any feature. What would you like to know?",
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    setError('');

    const apiKey = localStorage.getItem('brainspark_api_key') || '';

    try {
      const res = await fetch('/api/assistant-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(apiKey ? { 'x-anthropic-key': apiKey } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'No response.' }]);
    } catch (e: any) {
      setError(e.message || 'Failed to get response. Check your API key in settings.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 shadow-lg shadow-amber-500/30 flex items-center justify-center text-navy-950 hover:scale-105 transition-transform"
        whileTap={{ scale: 0.95 }}
        title="BrainSpark Assistant"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <ChevronDown size={24} />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-24 right-6 z-50 w-[360px] max-h-[520px] flex flex-col rounded-2xl bg-navy-900 border border-white/10 shadow-2xl overflow-hidden"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-navy-800 to-navy-900 border-b border-white/8 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-navy-950" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-semibold leading-none">BrainSpark Assistant</div>
                <div className="text-slate-500 text-xs mt-0.5">VAVE · Cost Engineering · AI</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gold-500/80 to-amber-600/80 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={12} className="text-navy-950" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-gold-500/15 text-gold-100 border border-gold-500/20'
                        : 'bg-white/5 text-slate-200 border border-white/8'
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <div className="flex gap-2 items-center">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gold-500/80 to-amber-600/80 flex items-center justify-center flex-shrink-0">
                    <Bot size={12} className="text-navy-950" />
                  </div>
                  <div className="bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                    <TypingDots className="text-slate-400" />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick questions (shown only when just greeting is visible) */}
            <AnimatePresence>
              {messages.length === 1 && !loading && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="px-4 pb-2 flex flex-col gap-1.5 flex-shrink-0"
                >
                  <p className="text-slate-600 text-xs mb-0.5">Quick questions</p>
                  {QUICK_QUESTIONS.map((q, i) => (
                    <motion.button
                      key={q}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.22 }}
                      whileHover={{ x: 4, transition: { duration: 0.12 } }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => sendMessage(q)}
                      className="text-left text-xs text-slate-400 hover:text-slate-200 border border-white/8 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors bg-white/3 hover:bg-white/6"
                    >
                      {q}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-white/8 px-3 py-2.5 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about BrainSpark…"
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/30 resize-none text-sm leading-relaxed max-h-24 overflow-y-auto"
                style={{ fieldSizing: 'content' } as any}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition-colors"
              >
                <Send size={15} className="text-navy-950" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
