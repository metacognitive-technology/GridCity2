import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, MapPin, X } from 'lucide-react';
import type { BotAction, BotAsk, BotPoint } from '../botActions';
import { injectOrigin, parseBotAsk } from '../botActions';
import socket from '../socket';

export type BotChatRole = 'user' | 'assistant';

export interface BotChatMessage {
  role: BotChatRole;
  content: string;
}

export type BotPickMode = 'pick_location' | 'pick_building' | null;

export type BotPickResult = {
  type: 'pick_location' | 'pick_building';
  x: number;
  y: number;
  key: string;
  buildingType?: string;
};

export type BotContext = {
  aim: BotPoint;
  selection: null | { minX: number; minY: number; maxX: number; maxY: number };
};

interface BotPanelProps {
  open: boolean;
  onClose: () => void;
  getContext: () => BotContext;
  executeActions: (
    actions: BotAction[],
    onProgress?: (msg: string) => void,
  ) => Promise<{ summary: string }>;
  pickMode: BotPickMode;
  onEnterPickMode: (mode: 'pick_location' | 'pick_building', ask: BotAsk) => void;
  onCancelPick: () => void;
  /** App calls this when user clicks the grid in pick mode */
  pickResultRef: React.MutableRefObject<((result: BotPickResult) => void) | null>;
}

const stopGridPropagation = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const stopGridWheel = (e: React.WheelEvent) => {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
};

const blockGridPointerEvents = {
  onMouseDown: stopGridPropagation,
  onMouseUp: stopGridPropagation,
  onMouseMove: stopGridPropagation,
  onPointerDown: stopGridPropagation,
  onPointerUp: stopGridPropagation,
  onClick: stopGridPropagation,
  onDoubleClick: stopGridPropagation,
  onWheel: stopGridWheel,
  onContextMenu: stopGridPropagation,
};

export function BotPanel({
  open,
  onClose,
  getContext,
  executeActions,
  pickMode,
  onEnterPickMode,
  onCancelPick,
  pickResultRef,
}: BotPanelProps) {
  const [messages, setMessages] = useState<BotChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAsk, setActiveAsk] = useState<BotAsk | null>(null);
  const [askGridBot, setAskGridBot] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateWaitHint, setEscalateWaitHint] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<BotChatMessage[]>([]);
  const escalateCleanupRef = useRef<(() => void) | null>(null);

  const focusPrompt = () => {
    queueMicrotask(() => inputRef.current?.focus());
  };

  useEffect(() => {
    historyRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      escalateCleanupRef.current?.();
      escalateCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages, loading, error, executing, activeAsk, pickMode]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const appendAssistant = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  };

  const runActions = async (actions: BotAction[]) => {
    if (!actions.length) return;
    setExecuting(true);
    try {
      const { summary } = await executeActions(actions, msg => {
        appendAssistant(msg);
      });
      if (summary) appendAssistant(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply actions');
    } finally {
      setExecuting(false);
      focusPrompt();
    }
  };

  const handleAsk = (ask: BotAsk) => {
    setActiveAsk(ask);
    if (ask.type === 'pick_location' || ask.type === 'pick_building') {
      onEnterPickMode(ask.type, ask);
    }
  };

  const clearAsk = () => {
    setActiveAsk(null);
    onCancelPick();
  };

  const handlePickResult = async (result: BotPickResult) => {
    const ask = activeAsk;
    clearAsk();
    const label =
      result.type === 'pick_building'
        ? `Selected ${result.buildingType || 'building'} at (${result.x}, ${result.y})`
        : `📍 Location (${result.x}, ${result.y})`;
    setMessages(prev => [...prev, { role: 'user', content: label }]);

    if (ask?.pendingActions?.length) {
      const withOrigin = injectOrigin(ask.pendingActions, { x: result.x, y: result.y });
      await runActions(withOrigin);
      return;
    }

    // Re-call chat with pick so the model can continue
    await sendMessage(`I picked (${result.x}, ${result.y})`, { pick: result }, false);
  };

  useEffect(() => {
    pickResultRef.current = (result: BotPickResult) => {
      void handlePickResult(result);
    };
    return () => {
      pickResultRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsk, pickMode]);

  const sendMessage = async (
    message: string,
    extra?: { pick?: BotPickResult },
    pushUserBubble = true,
  ) => {
    if (!message.trim() || loading || executing || escalating) return;
    const history = historyRef.current.slice(-20);
    if (pushUserBubble) {
      setDraft('');
      setMessages(prev => [...prev, { role: 'user', content: message }]);
    }
    setError(null);
    setLoading(true);
    try {
      const context = getContext();
      const escalate =
        askGridBot || /ask gridbot|hand off to gridbot|escalate/i.test(message);
      const res = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          context,
          pick: extra?.pick,
          escalate,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        reply?: unknown;
        actions?: unknown;
        ask?: unknown;
        error?: unknown;
        escalate?: { status?: string; id?: string };
      } | null;
      if (!res.ok) {
        const errText =
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : `Request failed (${res.status})`;
        setError(errText);
        return;
      }
      if (data?.escalate?.status === 'pending' && data.escalate.id) {
        const escalateId = data.escalate.id;
        const replyNow = typeof data.reply === 'string' ? data.reply.trim() : 'Asking GridBot…';
        const POLL_MS = 1000;
        const SOFT_WAIT_POLLS = 60; // ~60s soft — keep listening
        const HARD_WAIT_POLLS = 180; // ~3 min — show timeout hint, keep listening
        const HARD_CEILING_POLLS = 900; // ~15 min absolute ceiling
        setMessages(prev => [...prev, { role: 'assistant', content: replyNow || 'Asking GridBot…' }]);
        setEscalateWaitHint(null);
        setEscalating(true);
        setLoading(false);
        await new Promise<void>((resolve) => {
          let settled = false;
          let softNotified = false;
          let hardNotified = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearInterval(timer);
            socket.off('bot-escalation-reply', onSocket);
            escalateCleanupRef.current = null;
            setEscalating(false);
            setEscalateWaitHint(null);
            focusPrompt();
            resolve();
          };
          const apply = async (payload: any) => {
            if (!payload || payload.id !== escalateId || settled) return;
            if (payload.status === 'pending') return;
            finish();
            if (payload.status === 'error') {
              setError(typeof payload.error === 'string' ? payload.error : 'GridBot escalation failed');
              return;
            }
            setError(null);
            const replyText = typeof payload.reply === 'string' ? payload.reply.trim() : '';
            if (replyText) {
              setMessages(prev => [...prev, { role: 'assistant', content: replyText }]);
            }
            const ask = parseBotAsk(payload.ask);
            const actions = Array.isArray(payload.actions) ? (payload.actions as BotAction[]) : [];
            if (ask) {
              const merged: BotAsk =
                ask.pendingActions && ask.pendingActions.length
                  ? ask
                  : actions.length
                    ? ({ ...ask, pendingActions: actions } as BotAsk)
                    : ask;
              handleAsk(merged);
              return;
            }
            if (actions.length) await runActions(actions);
          };
          const onSocket = (payload: any) => {
            void apply(payload);
          };
          socket.on('bot-escalation-reply', onSocket);
          escalateCleanupRef.current = finish;
          let polls = 0;
          const timer = window.setInterval(() => {
            polls += 1;
            if (polls === SOFT_WAIT_POLLS && !softNotified) {
              softNotified = true;
              setEscalateWaitHint('Still waiting on GridBot…');
              setError(null);
            }
            if (polls === HARD_WAIT_POLLS && !hardNotified) {
              hardNotified = true;
              setEscalateWaitHint('GridBot escalation timed out — still listening…');
              setError(null);
            }
            if (polls > HARD_CEILING_POLLS) {
              finish();
              setError('GridBot escalation timed out');
              return;
            }
            void fetch(`/api/bot/escalate/${escalateId}`)
              .then(r => r.json())
              .then(body => apply(body))
              .catch(() => undefined);
          }, POLL_MS);
        });
        return;
      }

      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      } else if (!data?.actions && !data?.ask) {
        setError('Empty reply');
        return;
      }

      const ask = parseBotAsk(data?.ask);
      const actions = Array.isArray(data?.actions)
        ? (data!.actions as BotAction[])
        : [];

      if (ask) {
        // Attach pending actions from top-level if ask lacks them
        const merged: BotAsk =
          ask.pendingActions && ask.pendingActions.length
            ? ask
            : actions.length
              ? ({ ...ask, pendingActions: actions } as BotAsk)
              : ask;
        handleAsk(merged);
        return;
      }

      if (actions.length) {
        await runActions(actions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
      if (!escalating) focusPrompt();
    }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message) return;
    await sendMessage(message);
  };

  const onChoice = async (option: string) => {
    clearAsk();
    await sendMessage(option);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[110] flex flex-col min-h-0 overflow-hidden"
          data-grid-control
          data-testid="bot-panel"
          {...blockGridPointerEvents}
        >
          <div className="p-4 border-b flex items-center justify-between bg-sky-50">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-600" />
              <span className="font-bold">GrokBot</span>
            </div>
            <button type="button" onClick={onClose} title="Close" aria-label="Close GrokBot">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-auto overscroll-contain p-4 flex flex-col gap-2 min-h-0">
            {messages.length === 0 && !loading && (
              <p className="text-xs text-slate-400">
                Ask about roads and traffic, or try “build a neighborhood of 10 houses and a school”.
                I can ask you to click the map when I need a location.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={`${i}-${msg.role}`}
                data-testid="bot-chat-message"
                data-role={msg.role}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white self-end'
                    : 'bg-slate-100 text-slate-800 self-start'
                }`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div
                data-testid="bot-chat-loading"
                className="max-w-[85%] self-start rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-500"
              >
                Thinking…
              </div>
            )}
            {escalating && (
              <div
                data-testid="bot-chat-escalating"
                className="max-w-[85%] self-start rounded-2xl px-3 py-2 text-sm bg-violet-50 text-violet-800 border border-violet-100"
              >
                {escalateWaitHint || 'Asking GridBot…'}
              </div>
            )}
            {executing && (
              <div
                data-testid="bot-chat-executing"
                className="max-w-[85%] self-start rounded-2xl px-3 py-2 text-sm bg-amber-50 text-amber-800 border border-amber-100"
              >
                Placing on the grid…
              </div>
            )}
            {(pickMode || (activeAsk && activeAsk.type !== 'choice')) && (
              <div
                data-testid="bot-pick-banner"
                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      {activeAsk?.prompt ||
                        (pickMode === 'pick_building'
                          ? 'Click a building on the map'
                          : 'Click a location on the map')}
                    </div>
                    <div className="text-violet-700/80 mt-0.5">
                      Crosshair is active — next map click answers this question.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="bot-pick-cancel"
                  onClick={() => {
                    clearAsk();
                    appendAssistant('Cancelled map pick.');
                  }}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border border-violet-200 bg-white text-violet-800 hover:bg-violet-100"
                >
                  Cancel / skip
                </button>
              </div>
            )}
            {activeAsk?.type === 'choice' && (
              <div
                data-testid="bot-choice-banner"
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 space-y-2"
              >
                <div className="font-semibold">{activeAsk.prompt}</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeAsk.options.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      data-testid="bot-choice-option"
                      disabled={loading || executing}
                      onClick={() => void onChoice(opt)}
                      className="px-2 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-semibold disabled:opacity-40 hover:bg-sky-700"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => clearAsk()}
                  className="text-[11px] text-sky-700 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            {error && (
              <p data-testid="bot-chat-error" className="text-xs text-red-600">
                {error}
              </p>
            )}
          </div>
          <label className="px-3 pt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              data-testid="bot-ask-gridbot"
              checked={askGridBot}
              onChange={e => setAskGridBot(e.target.checked)}
              disabled={loading || executing || escalating}
            />
            Ask GridBot
          </label>
          <form
            className="p-3 border-t border-slate-200 flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              data-testid="bot-chat-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  if (pickMode || activeAsk) {
                    clearAsk();
                    return;
                  }
                  onClose();
                }
              }}
              placeholder="Ask or build with GrokBot…"
              disabled={loading || executing || escalating}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-60"
            />
            <button
              type="submit"
              data-testid="bot-chat-send"
              disabled={loading || executing || escalating || !draft.trim()}
              className="px-3 bg-sky-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
