'use client';
import { useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { api, type User } from '@/lib/storage';
import { DialogTitle, DialogDescription } from './ui/dialog';

export function RecoveryCode({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="recovery-card">
      <p>
        Save this code in your password manager or somewhere private. It is
        shown once and lets you reset your password without email. Any previous
        recovery code no longer works.
      </p>
      <textarea
        aria-label="Your recovery code"
        className="recovery-code"
        readOnly
        value={code}
        rows={3}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={14} />
        {copied ? 'Copied' : 'Copy code'}
      </button>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />{' '}
        I have saved my recovery code.
      </label>
      <button
        className="primary-button full-width"
        disabled={!saved}
        onClick={onDone}
      >
        Continue
      </button>
    </div>
  );
}
export function RecoverAccount({
  onBack,
  onRecovered,
}: {
  onBack: () => void;
  onRecovered: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <DialogTitle>
        {replacement ? 'Save your replacement code' : 'Recover your account'}
      </DialogTitle>
      <DialogDescription>
        {replacement
          ? 'Your password was reset and existing sessions were signed out.'
          : 'Use your username and saved recovery code to choose a new password.'}
      </DialogDescription>
      {replacement ? (
        <RecoveryCode
          code={replacement}
          onDone={() => {
            if (busy) return;
            setBusy(true);
            void onRecovered(username, password)
              .catch((error) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Sign in failed. Your new password is saved.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const result = await api<{ recoveryCode: string }>(
                '/api/account/recover',
                {
                  method: 'POST',
                  body: JSON.stringify({
                    username,
                    code,
                    newPassword: password,
                  }),
                },
              );
              setReplacement(result.recoveryCode);
              setCode('');
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Could not recover account.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={30}
              required
            />
          </label>
          <label>
            Recovery code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={100}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button className="primary-button full-width" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!busy && (
        <button className="text-button" onClick={onBack}>
          Back to sign in
        </button>
      )}
    </>
  );
}
export function AccountSecurity({
  user,
  onDeleted,
}: {
  user: User;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<'recovery' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const username = user.username ?? user.name;
  if (code)
    return (
      <RecoveryCode
        code={code}
        onDone={() => {
          setCode('');
          setMode(null);
        }}
      />
    );
  return (
    <div className="account-security">
      {!mode ? (
        <>
          <button className="text-button" onClick={() => setMode('recovery')}>
            <KeyRound size={14} /> Create / replace recovery code
          </button>
          <button
            className="text-button danger-text"
            onClick={() => setMode('delete')}
          >
            <Trash2 size={14} /> Delete account
          </button>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              if (mode === 'recovery') {
                const result = await api<{ recoveryCode: string }>(
                  '/api/account/recovery',
                  { method: 'POST', body: JSON.stringify({ password }) },
                );
                setCode(result.recoveryCode);
                setPassword('');
              } else {
                await api('/api/account', {
                  method: 'DELETE',
                  body: JSON.stringify({ password, confirmation }),
                });
                onDeleted();
              }
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Could not complete request.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {mode === 'delete'
              ? 'Delete your account permanently?'
              : 'Create a new recovery code'}
          </h3>
          <p>
            {mode === 'delete'
              ? 'This deletes your account, private runs, notes, drawings, account reports and chat messages. It cannot be undone. Guest runs in this browser remain separate.'
              : 'Your current password is required. Creating a new code invalidates the old one.'}
          </p>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          {mode === 'delete' && (
            <label>
              Type {username} to confirm
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                maxLength={30}
                required
              />
            </label>
          )}
          <div className="dialog-actions">
            <button
              className={mode === 'delete' ? 'danger-button' : 'primary-button'}
              disabled={
                busy || (mode === 'delete' && confirmation !== username)
              }
            >
              {busy
                ? 'Working…'
                : mode === 'delete'
                  ? 'Delete my account'
                  : 'Create recovery code'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setPassword('');
                setConfirmation('');
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
