// A narrow, editable slur filter. Ordinary profanity and game violence are allowed.
const severe = [
  'nigger',
  'nigga',
  'faggot',
  'kike',
  'chink',
  'spic',
  'tranny',
  'coon',
];
export function normalizeChat(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}|\p{Cf}/gu, '')
    .toLowerCase()
    .replace(
      /[013457@$!]/g,
      (c) =>
        ({
          '0': 'o',
          '1': 'i',
          '3': 'e',
          '4': 'a',
          '5': 's',
          '7': 't',
          '@': 'a',
          $: 's',
          '!': 'i',
        })[c]!,
    );
}
export function chatPolicyError(text: string) {
  const normalized = normalizeChat(text);
  for (const word of severe) {
    const pattern = word
      .split('')
      .map((c) => `${c}+`)
      .join(String.raw`[\s._*\-]*`);
    if (
      new RegExp(`(?:^|[^a-z])${pattern}(?:s|er|ers)?(?:$|[^a-z])`, 'i').test(
        normalized,
      )
    )
      return 'That message contains a blocked slur. Please reword it.';
  }
  if ((text.match(/\n/g)?.length ?? 0) > 7)
    return 'Keep messages to eight lines or fewer.';
  if ((text.match(/https?:\/\/|www\./gi)?.length ?? 0) > 2)
    return 'Keep messages to two links or fewer.';
  if (
    /(.)\1{19,}/u.test(normalized) ||
    !/[\p{L}\p{N}\p{S}\p{P}]/u.test(normalized)
  )
    return 'Please avoid repeated characters or empty messages.';
  if (
    text.split('').some((c) => {
      const code = c.charCodeAt(0);
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        code === 127 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
  )
    return 'That message contains unsupported control characters.';
  return null;
}
export const duplicateKey = (text: string) =>
  normalizeChat(text.replace(/[^\p{L}\p{N}\p{S}]/gu, ''));
