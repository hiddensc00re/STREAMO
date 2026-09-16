/**
 * Safely parses a Fetch API Response body as JSON.
 * Returns null if the response body is empty, whitespace-only, or invalid JSON,
 * preventing 'Unexpected end of JSON input' and 'Failed to execute json on Response' errors.
 */
export async function safeParseJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text || !text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Safely parses an incoming Request body as JSON in server route handlers.
 * Returns null if the body is empty, whitespace-only, or invalid JSON,
 * preventing 'Unexpected end of JSON input' exceptions on the server.
 */
export async function safeParseRequestBody<T = unknown>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
