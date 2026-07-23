import { type FeedbackMetadata, JustFeedbackError } from './types';

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Send one feedback item to a just-feedback instance.
 * Pure (no react-native imports) so it is trivially unit-testable.
 * Throws {@link JustFeedbackError} on any non-2xx response or network/timeout failure.
 */
export async function sendFeedback(params: {
  url: string;
  apiKey: string;
  content: string;
  metadata?: FeedbackMetadata;
  timeoutMs?: number;
}): Promise<{ id: string }> {
  const base = params.url.replace(/\/+$/, '');
  const endpoint = `${base}/api/v1/feedback`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': params.apiKey,
      },
      body: JSON.stringify({ content: params.content, metadata: params.metadata }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new JustFeedbackError(
      err instanceof Error ? err.message : 'Network request failed',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON body — keep the status-based message
    }
    throw new JustFeedbackError(message, res.status);
  }

  return (await res.json()) as { id: string };
}
