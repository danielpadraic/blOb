import { isRecoveryRedirect, parseAuthRedirectParams } from '@/lib/authRedirectParams';

const STORAGE_KEY = 'blob.password-recovery';

let pending = false;

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage;
  } catch {
    return null;
  }
}

export function markPasswordRecoveryPending() {
  pending = true;
  storage()?.setItem(STORAGE_KEY, '1');
}

export function isPasswordRecoveryPending(): boolean {
  if (pending) {
    return true;
  }
  return storage()?.getItem(STORAGE_KEY) === '1';
}

export function clearPasswordRecoveryPending() {
  pending = false;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Native and locked-down web storage can throw.
  }
}

export function capturePasswordRecoveryFromUrl(url?: string | null) {
  if (isRecoveryRedirect(parseAuthRedirectParams(url))) {
    markPasswordRecoveryPending();
  }
}
