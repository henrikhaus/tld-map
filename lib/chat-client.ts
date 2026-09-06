'use client';
import { responseJson } from './api-response';
export class ChatError extends Error {
  constructor(
    message: string,
    public retryAfterMs = 0,
    public status = 400,
  ) {
    super(message);
  }
}
export async function chatApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/chat/${path}`, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  const data = await responseJson<{
    error?: string;
    retryAfterMs?: number;
  }>(response, 'Chat is temporarily unavailable. Please try again.').catch(
    (error) => {
      throw new ChatError(error.message, 0, response.status);
    },
  );
  if (!response.ok)
    throw new ChatError(
      data.error ?? 'Chat could not connect.',
      data.retryAfterMs ?? 0,
      response.status,
    );
  return data as T;
}
