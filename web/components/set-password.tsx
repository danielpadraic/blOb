'use client';

import { useState } from 'react';

import { authRedirectUrl } from '@/lib/authRedirect';
import { clearPasswordRecoveryPending } from '@/lib/passwordRecovery';
import { getPasswordUpdateMessage } from '@/utils/errors';

import { Bob } from '~/components/bob';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { supabase } from '~/lib/supabase';

export function SetPasswordScreen({
  onDone,
  expired,
}: {
  onDone: () => void;
  expired?: boolean;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      console.log('[blob:password-update]', updateError.message, updateError);
      setError(getPasswordUpdateMessage(updateError));
      return;
    }
    clearPasswordRecoveryPending();
    setNotice('Password updated.');
    onDone();
  }

  if (expired) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-8">
        <Bob title="Set new password" line="This reset link is invalid or expired. Request a new one." compact />
        <Button type="button" className="mt-4" onClick={onDone}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-8">
      <Bob title="Set new password" line="Pick a new password to finish resetting." compact />
      <div className="mt-4 flex flex-col gap-3">
        <Input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error ? <p className="text-sm text-[#9A3B3B]">{error}</p> : null}
        {notice ? <p className="text-sm font-semibold text-teal">{notice}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Save password
        </Button>
      </div>
    </div>
  );
}

export function passwordResetRedirectTo(): string {
  return authRedirectUrl() || `${window.location.origin}/auth/callback`;
}
