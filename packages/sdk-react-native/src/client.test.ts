import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFeedback } from './client';
import { JustFeedbackError } from './types';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sendFeedback', () => {
  it('builds the correct URL and strips a trailing slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendFeedback({ url: 'https://fb.example.com///', apiKey: 'jf_x', content: 'hi' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://fb.example.com/api/v1/feedback');
  });

  it('sends X-Api-Key, JSON content-type, and the right body incl. metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendFeedback({
      url: 'https://fb.example.com',
      apiKey: 'jf_secret',
      content: 'great app',
      metadata: { platform: 'ios', osVersion: '17.4', appVersion: '2.1.0' },
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['X-Api-Key']).toBe('jf_secret');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      content: 'great app',
      metadata: { platform: 'ios', osVersion: '17.4', appVersion: '2.1.0' },
    });
  });

  it('returns { id } on 201', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { id: 'uuid-123' })));
    const result = await sendFeedback({ url: 'https://fb.example.com', apiKey: 'jf_x', content: 'hi' });
    expect(result).toEqual({ id: 'uuid-123' });
  });

  it.each([
    [400, 'validation_error'],
    [401, 'invalid_api_key'],
    [429, 'rate_limited'],
    [500, 'internal_error'],
  ])('throws JustFeedbackError with .status on %i using body error as message', async (status, error) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(status, { error })));

    const err = await sendFeedback({ url: 'https://fb.example.com', apiKey: 'jf_x', content: 'hi' })
      .then(() => null)
      .catch((e) => e);

    expect(err).toBeInstanceOf(JustFeedbackError);
    expect(err.status).toBe(status);
    expect(err.message).toBe(error);
  });

  it('falls back to a status message when the error body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    const err = await sendFeedback({ url: 'https://fb.example.com', apiKey: 'jf_x', content: 'hi' }).catch((e) => e);
    expect(err).toBeInstanceOf(JustFeedbackError);
    expect(err.status).toBe(500);
    expect(err.message).toContain('500');
  });

  it('throws JustFeedbackError (no status) on a rejected fetch (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network request failed')));
    const err = await sendFeedback({ url: 'https://fb.example.com', apiKey: 'jf_x', content: 'hi' }).catch((e) => e);
    expect(err).toBeInstanceOf(JustFeedbackError);
    expect(err.status).toBeUndefined();
  });

  it('throws JustFeedbackError on timeout/abort', async () => {
    vi.useFakeTimers();
    // fetch never resolves on its own; it rejects only when the abort signal fires.
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = sendFeedback({
      url: 'https://fb.example.com',
      apiKey: 'jf_x',
      content: 'hi',
      timeoutMs: 50,
    });
    const settled = promise.catch((e) => e);
    await vi.advanceTimersByTimeAsync(50);

    const err = await settled;
    expect(err).toBeInstanceOf(JustFeedbackError);
    expect(err.status).toBeUndefined();
  });
});
