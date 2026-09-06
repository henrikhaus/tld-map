import { expect, test } from 'bun:test';
import { chatPolicyError, duplicateKey } from '../server/chat-policy';
import {
  closestChatColor,
  CHAT_COLORS,
  chatColorSchema,
  ADMIN_CHAT_COLOR,
} from '../lib/chat';
test('ordinary profanity and game discussion remain allowed', () => {
  for (const text of [
    'That fucking wolf!',
    'Shit, I forgot my bedroll.',
    'Kill the wolf before it gets closer.',
    'The spicy food was good.',
    'I saw a raccoon.',
  ])
    expect(chatPolicyError(text)).toBeNull();
});
test('severe slurs are rejected across common spacing, leetspeak and zero-width evasions', () => {
  for (const text of [
    'nigger',
    'n.i.g.g.e.r',
    'n i g g e r',
    'n!gg3r',
    'nig\u200bger',
    'faggot',
  ])
    expect(chatPolicyError(text)).toContain('blocked slur');
});
test('spam guards reject empty, oversized line blocks and repeated characters', () => {
  expect(chatPolicyError('a'.repeat(30))).not.toBeNull();
  expect(chatPolicyError('line\n'.repeat(9))).not.toBeNull();
  expect(
    chatPolicyError('https://a.com https://b.com https://c.com'),
  ).not.toBeNull();
  expect(chatPolicyError('\u0001 test')).not.toBeNull();
  expect(duplicateKey('HELLO!!!')).toBe(duplicateKey('Hello'));
});
test('exactly five username presets are accepted; legacy colors map to a preset and admin gold stays reserved', () => {
  expect(new Set(CHAT_COLORS).size).toBe(5);
  for (const color of CHAT_COLORS) {
    expect(chatColorSchema.safeParse({ color }).success).toBe(true);
    expect(closestChatColor(color)).toBe(color);
  }
  for (const input of [
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#000000',
    '#ffffff',
    ADMIN_CHAT_COLOR,
  ]) {
    expect(chatColorSchema.safeParse({ color: input }).success).toBe(false);
    expect(CHAT_COLORS).toContain(closestChatColor(input));
    expect(closestChatColor(input)).not.toBe(ADMIN_CHAT_COLOR);
  }
});
