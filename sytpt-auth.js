(function (root) {
  const storageKey = 'sytpt_sb_auth';
  const hintPrefix = 'sytpt_auth_email_hint_';
  const memory = new Map();
  let storageAvailable = true;

  function reportStorageError(error) {
    storageAvailable = false;
    console.warn('Persistent authentication storage is unavailable. Sign in again after closing this page.', error);
  }

  const storage = {
    getItem(key) {
      if (storageAvailable) {
        try {
          return root.localStorage.getItem(key);
        } catch (error) {
          reportStorageError(error);
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
      if (storageAvailable) {
        try {
          root.localStorage.setItem(key, String(value));
        } catch (error) {
          reportStorageError(error);
        }
      }
    },
    removeItem(key) {
      memory.delete(key);
      if (storageAvailable) {
        try {
          root.localStorage.removeItem(key);
        } catch (error) {
          reportStorageError(error);
        }
      }
    },
  };

  function normalizeLoginId(value) {
    return String(value || '').trim().toLowerCase();
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function buildAliasEmails(value) {
    const normalized = normalizeLoginId(value);
    if (!normalized) return [];
    const asciiLocal = normalized.replace(/[^a-z0-9._-]/g, '');
    const hex = Array.from(new TextEncoder().encode(normalized))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const local = (asciiLocal || (`id${hex}`).slice(0, 48)).replace(/^\.+|\.+$/g, '');
    return local ? [`${local}@syegtp.app`, `${local}@syegtp.local`] : [];
  }

  function getEmailHint(loginId) {
    const key = normalizeLoginId(loginId);
    return key ? normalizeLoginId(storage.getItem(hintPrefix + key)) : '';
  }

  function setEmailHint(loginId, email) {
    const key = normalizeLoginId(loginId);
    const normalizedEmail = normalizeLoginId(email);
    if (key && looksLikeEmail(normalizedEmail)) storage.setItem(hintPrefix + key, normalizedEmail);
  }

  function buildEmailCandidates(input, userOrUsers) {
    const raw = normalizeLoginId(input);
    if (!raw) return [];
    const candidates = [getEmailHint(raw)];
    if (looksLikeEmail(raw)) candidates.push(raw);
    const users = Array.isArray(userOrUsers) ? userOrUsers : userOrUsers ? [userOrUsers] : [];
    users.forEach(user => {
      if (user && user.id) candidates.push(...buildAliasEmails(user.id));
      if (user && user.name) candidates.push(...buildAliasEmails(user.name));
    });
    candidates.push(...buildAliasEmails(raw));
    return [...new Set(candidates.filter(looksLikeEmail))];
  }

  function isInvalidCredentials(error) {
    return !!error && (error.code === 'invalid_credentials'
      || /invalid login credentials/i.test(String(error.message || '')));
  }

  function errorMessage(error, language) {
    const code = String(error && error.code || '');
    const message = String(error && error.message || '');
    const en = language === 'en';
    if (isInvalidCredentials(error)) {
      return en ? 'Invalid login ID/email or password, or no matching Auth account.'
        : '로그인 아이디/이메일 또는 비밀번호가 틀리거나 해당 Auth 계정이 없습니다.';
    }
    if (code === 'email_not_confirmed') {
      return en ? 'Email confirmation is required before signing in.'
        : '이메일 인증이 완료되지 않았습니다. 이메일 인증 후 로그인하세요.';
    }
    if ((error && error.status === 429) || /rate|limit/.test(code)) {
      return en ? 'Too many authentication requests. Please try again later.'
        : '인증 요청이 많아 일시 제한되었습니다. 잠시 후 다시 시도하세요.';
    }
    if (/fetch|network/i.test(message)) {
      return en ? 'Could not connect to the authentication server. Check your connection.'
        : '인증 서버에 연결하지 못했습니다. 네트워크 연결을 확인하세요.';
    }
    return (en ? 'Authentication failed: ' : '인증 실패: ') + (message || code || (en ? 'Unknown error' : '알 수 없는 오류'));
  }

  root.SytptAuth = {
    storage, storageKey, buildAliasEmails, buildEmailCandidates, getEmailHint, setEmailHint,
    isInvalidCredentials, errorMessage,
    get persistenceAvailable() { return storageAvailable; },
  };
})(window);
