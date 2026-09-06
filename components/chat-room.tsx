'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crown,
  SmilePlus,
  Flag,
  Shield,
  Trash2,
  Send,
  X,
  ChevronDown,
} from 'lucide-react';
import {
  CHAT_COLORS,
  CHAT_MESSAGE_INTERVAL,
  CHAT_RETENTION_MS,
  REACTIONS,
  type ChatFeed,
  type ChatMe,
  type ChatMessage,
} from '@/lib/chat';
import { chatApi, ChatError } from '@/lib/chat-client';
import ChatModeration, { ModeratePerson } from './chat-moderation';
function Message({
  message,
  me,
  onUpdate,
  onModerate,
  onError,
}: {
  message: ChatMessage;
  me: ChatMe;
  onUpdate: (message: ChatMessage) => void;
  onModerate: () => void;
  onError: (text: string) => void;
}) {
  const [reactions, setReactions] = useState(false),
    [report, setReport] = useState(false),
    [reason, setReason] = useState('spam'),
    [busy, setBusy] = useState(false),
    [reported, setReported] = useState(false);
  async function react(emoji: (typeof REACTIONS)[number]) {
    setBusy(true);
    try {
      const result = await chatApi<{ message: ChatMessage }>(
        `messages/${message.id}/reactions`,
        {
          method: 'PUT',
          body: JSON.stringify({
            emoji,
            active: !message.reactions.find((r) => r.emoji === emoji)?.mine,
          }),
        },
      );
      onUpdate(result.message);
      setReactions(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not react');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`chat-message ${message.deleted ? 'chat-deleted' : ''}`}
    >
      <div className="chat-message-line">
        <strong
          style={{ color: message.author.color }}
          title={message.author.anonymous ? 'Guest' : undefined}
        >
          {message.author.admin && (
            <Crown size={14} fill="currentColor" aria-label="Administrator" />
          )}
          {message.author.name}
        </strong>
        {': '}
        <span className="chat-message-body">
          {message.deleted ? 'Message removed by admin.' : message.text}
        </span>
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          title={new Date(message.createdAt).toLocaleString()}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}
        </time>
      </div>
      {!message.deleted && (
        <div className="chat-message-actions">
          {message.reactions.map((r) => (
            <button
              className="chat-reaction"
              key={r.emoji}
              aria-label={`${r.emoji}: ${r.count} reactions`}
              aria-pressed={r.mine}
              disabled={busy || !!me.restriction}
              onClick={() => void react(r.emoji)}
            >
              {r.emoji} <span>{r.count}</span>
            </button>
          ))}
          <button
            className="chat-action"
            aria-label="React to message"
            aria-expanded={reactions}
            disabled={!!me.restriction}
            onClick={() => setReactions((v) => !v)}
          >
            <SmilePlus size={14} />
          </button>
          {me.id !== message.author.id && (
            <button
              className="chat-action"
              aria-label="Report message"
              disabled={reported || !!me.restriction}
              onClick={() => setReport((v) => !v)}
            >
              <Flag size={13} />
              {reported && <span>Reported</span>}
            </button>
          )}
          {me.admin && (
            <>
              <button
                className="chat-action"
                aria-label={`Moderate ${message.author.name}`}
                onClick={onModerate}
                disabled={message.author.admin}
              >
                <Shield size={14} />
              </button>
              <button
                className="chat-action"
                aria-label="Remove message"
                onClick={async () => {
                  try {
                    await chatApi(`messages/${message.id}`, {
                      method: 'DELETE',
                    });
                    onUpdate({
                      ...message,
                      deleted: true,
                      text: '',
                      reactions: [],
                    });
                  } catch (e) {
                    onError(
                      e instanceof Error
                        ? e.message
                        : 'Could not remove message',
                    );
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          {reactions && (
            <div className="chat-emoji-picker">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  disabled={busy || !!me.restriction}
                  onClick={() => void react(emoji)}
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {report && (
        <form
          className="chat-report-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await chatApi(`messages/${message.id}/report`, {
                method: 'POST',
                body: JSON.stringify({ reason }),
              });
              setReported(true);
              setReport(false);
            } catch (e) {
              onError(
                e instanceof Error ? e.message : 'Could not report message',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <select
            aria-label="Report reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {['spam', 'hate speech', 'harassment', 'other'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button disabled={busy}>Send report</button>
          <button type="button" onClick={() => setReport(false)}>
            Cancel
          </button>
        </form>
      )}
    </article>
  );
}
export default function ChatRoom({ onSignIn }: { onSignIn: () => void }) {
  const [me, setMe] = useState<ChatMe | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [sending, setSending] = useState(false),
    [cooldown, setCooldown] = useState(false),
    [older, setOlder] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [colorOpen, setColorOpen] = useState(false),
    [moderation, setModeration] = useState(false),
    [target, setTarget] = useState<{ id: string; name: string } | null>(null),
    [newBelow, setNewBelow] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    text = useRef<HTMLTextAreaElement>(null),
    atBottom = useRef(true),
    revision = useRef(-1),
    localChanges = useRef(0),
    current = useRef<ChatMessage[]>([]),
    nonce = useRef({ text: '', id: crypto.randomUUID() }),
    nextSend = useRef(0),
    pollNow = useRef<() => void>(() => {});
  const apply = useCallback((incoming: ChatMessage[]) => {
    const next = incoming.filter(
      (message) => message.createdAt > Date.now() - CHAT_RETENTION_MS,
    );
    current.current = next;
    setMessages(next);
    if (atBottom.current)
      requestAnimationFrame(() => {
        scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
      });
    else setNewBelow(true);
  }, []);
  useEffect(() => {
    let alive = true,
      initialized = false,
      busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function poll() {
      if (!alive || busy || document.hidden) return;
      busy = true;
      const version = localChanges.current;
      try {
        const result = await chatApi<ChatFeed>(
          `messages?since=${revision.current}&oldest=${current.current[0]?.id ?? 0}`,
          { signal: controller.signal },
        );
        if (!alive) return;
        setConnected(true);
        if (version === localChanges.current) {
          setMe(result.me);
          if (result.messages) {
            apply(result.messages.slice(-200));
            setOlder(!!result.hasOlder);
          }
          revision.current = result.revision;
        }
      } catch (e) {
        if (alive) {
          setConnected(false);
          if (e instanceof ChatError && e.status === 401) initialized = false;
        }
      } finally {
        busy = false;
        if (alive)
          timer = setTimeout(
            () => void (initialized ? poll() : connect()),
            2000,
          );
      }
    }
    async function connect() {
      if (!alive || busy || document.hidden) return;
      busy = true;
      try {
        const result = await chatApi<{ me: ChatMe }>('session', {
          method: 'POST',
          body: '{}',
          signal: controller.signal,
        });
        if (alive) {
          setMe(result.me);
          setError('');
          initialized = true;
          revision.current = -1;
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : 'Chat could not connect.');
      } finally {
        busy = false;
        if (alive) {
          if (initialized) void poll();
          else timer = setTimeout(() => void connect(), 5000);
        }
      }
    }
    const refresh = () => {
      if (timer) clearTimeout(timer);
      void (initialized ? poll() : connect());
    };
    pollNow.current = refresh;
    document.addEventListener('visibilitychange', refresh);
    void connect();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [apply]);
  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => {
      if (Date.now() >= nextSend.current) setCooldown(false);
    }, 100);
    return () => clearInterval(id);
  }, [cooldown]);
  const canCompose = !!me && !me.restriction && !moderation;
  useEffect(() => {
    if (canCompose) text.current?.focus();
  }, [canCompose]);
  useEffect(() => {
    // Expire loaded messages even when the network is unavailable.
    const timer = setInterval(() => {
      const next = current.current.filter(
        (message) => message.createdAt > Date.now() - CHAT_RETENTION_MS,
      );
      if (next.length !== current.current.length) {
        current.current = next;
        setMessages(next);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const update = (message: ChatMessage) => {
    localChanges.current++;
    const next = current.current.some((m) => m.id === message.id)
      ? current.current.map((m) => (m.id === message.id ? message : m))
      : [...current.current, message].sort((a, b) => a.id - b.id).slice(-200);
    apply(next);
  };
  async function send() {
    if (
      !body.trim() ||
      sending ||
      Date.now() < nextSend.current ||
      me?.restriction
    )
      return;
    const draft = body.trim();
    if (nonce.current.text !== draft)
      nonce.current = { text: draft, id: crypto.randomUUID() };
    text.current?.focus();
    setSending(true);
    setError('');
    try {
      const result = await chatApi<{ message: ChatMessage }>('messages', {
        method: 'POST',
        body: JSON.stringify({ nonce: nonce.current.id, text: draft }),
      });
      atBottom.current = true;
      update(result.message);
      setBody('');
      nonce.current = { text: '', id: crypto.randomUUID() };
      nextSend.current = Date.now() + CHAT_MESSAGE_INTERVAL;
      setCooldown(true);
      pollNow.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message could not be sent.');
      if (e instanceof ChatError && e.retryAfterMs) {
        nextSend.current = Date.now() + e.retryAfterMs;
        setCooldown(true);
      }
      pollNow.current();
    } finally {
      setSending(false);
    }
  }
  async function color(value: string) {
    try {
      const result = await chatApi<{ me: ChatMe }>('profile', {
        method: 'PUT',
        body: JSON.stringify({ color: value }),
      });
      localChanges.current++;
      setMe(result.me);
      setColorOpen(false);
      pollNow.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change color');
    }
  }
  return (
    <main className="chat-room">
      <header className="chat-heading">
        <div>
          <h1>Campfire chat</h1>
          <span className={connected ? 'chat-live' : 'chat-disconnected'}>
            {connected ? 'Live chat' : me ? 'Reconnecting…' : 'Connecting…'}
          </span>
          <span className="chat-retention">
            Messages are automatically deleted after 48 hours
          </span>
        </div>
        {me?.admin && (
          <button onClick={() => setModeration((v) => !v)}>
            <Shield size={15} />
            {moderation ? 'Back to chat' : 'Moderation'}
          </button>
        )}
      </header>
      {moderation && me?.admin ? (
        <div className="chat-mod-scroll">
          <ChatModeration />
        </div>
      ) : (
        <>
          <div
            ref={scroll}
            className="chat-messages"
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={() => {
              const el = scroll.current!;
              atBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 70;
              if (atBottom.current) setNewBelow(false);
            }}
          >
            {older && messages.length < 200 && (
              <button
                className="chat-load-older"
                disabled={loadingOlder}
                onClick={async () => {
                  setLoadingOlder(true);
                  const height = scroll.current?.scrollHeight ?? 0;
                  try {
                    const result = await chatApi<ChatFeed>(
                      `messages?before=${current.current[0]?.id}`,
                    );
                    const merged = [
                      ...(result.messages ?? []),
                      ...current.current,
                    ]
                      .filter(
                        (m, i, list) =>
                          list.findIndex((v) => v.id === m.id) === i,
                      )
                      .slice(-200);
                    localChanges.current++;
                    revision.current = -1;
                    current.current = merged;
                    setMessages(merged);
                    setOlder(!!result.hasOlder);
                    requestAnimationFrame(() => {
                      if (scroll.current)
                        scroll.current.scrollTop +=
                          scroll.current.scrollHeight - height;
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Could not load history',
                    );
                  } finally {
                    setLoadingOlder(false);
                  }
                }}
              >
                {loadingOlder ? 'Loading…' : 'Earlier messages'}
              </button>
            )}
            {!messages.length && connected && (
              <p className="chat-welcome">
                A quiet fire. Leave the first message.
              </p>
            )}
            {me &&
              messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  me={me}
                  onUpdate={update}
                  onError={setError}
                  onModerate={() =>
                    setTarget({
                      id: message.author.id,
                      name: message.author.name,
                    })
                  }
                />
              ))}
          </div>
          {newBelow && (
            <button
              className="chat-new-messages"
              onClick={() => {
                atBottom.current = true;
                setNewBelow(false);
                scroll.current?.scrollTo({
                  top: scroll.current.scrollHeight,
                  behavior: 'smooth',
                });
              }}
            >
              Latest messages <ChevronDown size={14} />
            </button>
          )}
          {target && me?.admin && (
            <div className="chat-moderate-inline">
              <ModeratePerson
                personId={target.id}
                name={target.name}
                onDone={() => {
                  setTarget(null);
                  pollNow.current();
                }}
              />
            </div>
          )}
          <div className="chat-compose">
            {me && (
              <div className="chat-identity">
                <span>Chatting as</span>
                <strong style={{ color: me.color }}>
                  {me.admin && <Crown size={14} fill="currentColor" />}
                  {me.name}
                </strong>
                {!me.admin && (
                  <button
                    className="chat-username-color"
                    onClick={() => {
                      setColorOpen((v) => !v);
                    }}
                    disabled={!!me.restriction}
                  >
                    Username color
                  </button>
                )}
                {me.anonymous && (
                  <button className="chat-sign-in" onClick={onSignIn}>
                    Sign in
                  </button>
                )}
              </div>
            )}
            {colorOpen && (
              <div className="chat-color-picker">
                {CHAT_COLORS.map((c) => (
                  <button
                    key={c}
                    style={{ background: c }}
                    onClick={() => void color(c)}
                    aria-label={`Use username color ${c}`}
                    aria-pressed={me?.color === c}
                  />
                ))}
              </div>
            )}
            {me?.restriction ? (
              <output className="chat-blocked">
                {me.restriction.kind === 'ban'
                  ? 'You are banned from posting and reacting in chat.'
                  : `You can chat again at ${new Date(me.restriction.until!).toLocaleString()}.`}{' '}
                {me.restriction.reason}
              </output>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={text}
                  aria-label="Chat message"
                  placeholder="Message the campfire…"
                  maxLength={800}
                  rows={2}
                  value={body}
                  disabled={!me}
                  readOnly={sending}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  className="chat-send"
                  disabled={!me || !body.trim() || sending || cooldown}
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
              </form>
            )}
            <div className="chat-compose-hint">
              <span>
                Enter to send · Shift+Enter for a new line · 1s minimum between
                messages
              </span>
              <span>{body.length}/800</span>
            </div>
            {error && (
              <div className="chat-error" role="alert">
                <span>{error}</span>
                <button
                  aria-label="Dismiss chat error"
                  onClick={() => setError('')}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
