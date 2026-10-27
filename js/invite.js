const MARKER = /(?:#|%23)connect/i;

export function buildInvite(base, { url, token }) {
  return `${base}#connect?${new URLSearchParams({ u: url, t: token })}`;
}

function decodeLegacy(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const { url, token } = JSON.parse(decodeURIComponent(escape(atob(padded))));
  return { url, token };
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function hasInvite(text) {
  return MARKER.test(String(text ?? ''));
}

export function parseInvite(text) {
  const raw = String(text ?? '').trim();
  const at = raw.search(MARKER);
  if (at === -1) throw new Error('ce n’est pas un lien d’invitation');
  let rest = raw.slice(at).replace(MARKER, '');
  if (/^%(3D|3F|26)/i.test(rest)) rest = safeDecode(rest);
  let invite;
  if (rest.startsWith('=')) {
    const code = rest.slice(1).match(/^[A-Za-z0-9_+/-]+/)?.[0] ?? '';
    try {
      invite = decodeLegacy(code);
    } catch {
      throw new Error('lien tronqué ou modifié');
    }
  } else {
    const params = new URLSearchParams(rest.replace(/^[?&]/, '').replace(/\s+/g, ''));
    invite = { url: params.get('u') ?? '', token: params.get('t') ?? '' };
  }
  const url = String(invite.url ?? '').trim();
  const token = String(invite.token ?? '');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error('URL du script absente ou tronquée');
  return { url, token };
}
