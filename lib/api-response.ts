// Proxies can return an empty or HTML error response. Do not expose JSON parser
// errors to users or mistake a malformed success response for valid app data.
export async function responseJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallback} (HTTP ${response.status})`);
  }
}
