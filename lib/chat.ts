import { z } from 'zod';
export const CHAT_COLORS = [
  '#cc8f83',
  '#83a9cc',
  '#8fb58c',
  '#b49ac9',
  '#7fb5b0',
] as const;
export const CHAT_MESSAGE_INTERVAL = 1000;
export const CHAT_RETENTION_MS = 48 * 60 * 60 * 1000;
export const ADMIN_CHAT_COLOR = '#ffbf38';
export const REACTIONS = ['👍', '❤️', '😂', '🔥', '❄️', '👀'] as const;
export const chatMessageSchema = z
  .object({ nonce: z.uuid(), text: z.string().trim().min(1).max(800) })
  .strict();
export const chatColorSchema = z
  .object({ color: z.enum(CHAT_COLORS) })
  .strict();
export const reactionSchema = z
  .object({ emoji: z.enum(REACTIONS), active: z.boolean() })
  .strict();
export const chatModerationSchema = z
  .object({
    personId: z.uuid(),
    action: z.enum(['timeout', 'ban', 'lift']),
    minutes: z.number().int().min(1).max(10080).optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict()
  .refine(
    (v) => v.action !== 'timeout' || v.minutes !== undefined,
    'Choose a timeout duration',
  );
export type ChatPerson = {
  id: string;
  name: string;
  color: string;
  admin: boolean;
  anonymous: boolean;
};
export type ChatMe = ChatPerson & {
  restriction: {
    kind: 'timeout' | 'ban';
    until: number | null;
    reason: string;
  } | null;
};
export type ChatMessage = {
  id: number;
  text: string;
  createdAt: number;
  deleted: boolean;
  author: ChatPerson;
  reactions: {
    emoji: (typeof REACTIONS)[number];
    count: number;
    mine: boolean;
  }[];
};
export type ChatFeed = {
  revision: number;
  me: ChatMe;
  messages?: ChatMessage[];
  hasOlder?: boolean;
};
export type ChatModerationData = {
  stats: {
    messages: number;
    today: number;
    restrictions: number;
    flags: number;
  };
  restrictions: {
    personId: string;
    name: string;
    kind: 'ban' | 'timeout';
    until: number | null;
    reason: string;
  }[];
  flags: {
    messageId: number;
    text: string;
    name: string;
    personId: string;
    count: number;
    reason: string;
  }[];
  log: {
    id: number;
    name: string;
    action: string;
    reason: string;
    createdAt: number;
  }[];
};
/** Map saved legacy colors onto the five supported username colors. */
export function closestChatColor(hex: string): (typeof CHAT_COLORS)[number] {
  const channels = (value: string) =>
    [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const rgb = channels(hex);
  const distance = (color: string) =>
    channels(color).reduce((sum, value, i) => sum + (value - rgb[i]) ** 2, 0);
  return CHAT_COLORS.reduce((nearest, color) =>
    distance(color) < distance(nearest) ? color : nearest,
  );
}
