import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvite, hasInvite, parseInvite } from '../js/invite.js';

const settings = { url: 'https://script.google.com/macros/s/AKfycbz_abc-123/exec', token: 'mot de passe+é&=' };

test('round trip', () => {
  const link = buildInvite('https://julien.github.io/eki/', settings);
  assert.ok(hasInvite(link));
  assert.deepEqual(parseInvite(link), settings);
});

test('tolerates links mangled by scanners and messaging apps', () => {
  const link = buildInvite('https://julien.github.io/eki/', settings);
  const [base, hash] = link.split('#');
  assert.deepEqual(parseInvite(`${base}%23${encodeURIComponent(hash)}`), settings);
  assert.deepEqual(parseInvite(`Rejoins-moi : ${link}  `), settings);
  assert.deepEqual(parseInvite(link.slice(0, 60) + '\n' + link.slice(60)), settings);
});

test('still reads the previous base64 links, with or without padding', () => {
  const json = JSON.stringify(settings);
  const code = Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(parseInvite(`https://x.github.io/eki/#connect=${code}`), settings);
  assert.deepEqual(parseInvite(`https://x.github.io/eki/%23connect%3D${code}`), settings);
});

test('explains what is wrong', () => {
  assert.throws(() => parseInvite('https://x.github.io/eki/'), /pas un lien/);
  assert.throws(() => parseInvite('https://x.github.io/eki/#connect=eyJ1cmwiOiJodHRwczovL3Nj'), /tronqué/);
  assert.throws(() => parseInvite('https://x.github.io/eki/#connect?u=https%3A%2F%2Fscript.goo'), /URL du script/);
});
