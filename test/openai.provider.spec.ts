import OpenAI from 'openai';
import { OpenAiProvider } from '../src/llm/openai.provider';
import { PricingService } from '../src/chat/pricing.service';
import {
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from '../src/common/errors';

/**
 * A fake OpenAI client exposing only the `responses.create` surface this
 * adapter calls. Typed as its own shape (rather than `any`) so the mock's
 * `.mock.calls` inspection stays available to the tests below, while the
 * bridge into the constructor's `OpenAI` parameter goes through an explicit
 * `unknown` cast at the one point that needs it — no implicit `any` leaks
 * out of this file.
 */
interface MockClient {
  responses: { create: jest.Mock };
}

const makeClient = (impl: () => unknown): MockClient => ({
  responses: { create: jest.fn(impl) },
});

const provider = (client: MockClient) =>
  new OpenAiProvider(client as unknown as OpenAI, new PricingService(), 'low');

describe('OpenAiProvider', () => {
  it('normalises the Responses API usage shape', async () => {
    const client = makeClient(() => ({
      output_text: 'hello',
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens_details: { reasoning_tokens: 15 },
      },
    }));

    const r = await provider(client).complete({
      model: 'gpt-5-nano',
      input: [{ role: 'user', content: 'hi' }],
    });

    expect(r.text).toBe('hello');
    expect(r.usage).toEqual({
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 40,
      reasoningTokens: 15,
    });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('defaults missing usage detail fields to zero', async () => {
    const client = makeClient(() => ({
      output_text: 'x',
      usage: { input_tokens: 10, output_tokens: 5 },
    }));

    const r = await provider(client).complete({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: 'hi' }],
    });

    expect(r.usage.cachedInputTokens).toBe(0);
    expect(r.usage.reasoningTokens).toBe(0);
  });

  it('sends store:false so no conversation state is kept by OpenAI', async () => {
    const client = makeClient(() => ({
      output_text: 'x',
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    await provider(client).complete({
      model: 'gpt-5-nano',
      input: [{ role: 'user', content: 'hi' }],
    });

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({ store: false }),
    );
  });

  it('sends a reasoning effort only for models that support it', async () => {
    const client = makeClient(() => ({
      output_text: 'x',
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const p = provider(client);

    await p.complete({
      model: 'gpt-5-nano',
      input: [{ role: 'user', content: 'hi' }],
    });
    expect(client.responses.create.mock.calls[0][0].reasoning).toEqual({
      effort: 'low',
    });

    await p.complete({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: 'hi' }],
    });
    // toBeUndefined() would also pass for `reasoning: undefined`, which the
    // spec forbids — the key must be entirely absent from the request.
    expect('reasoning' in client.responses.create.mock.calls[1][0]).toBe(false);
  });

  it('maps a 429 to UpstreamRateLimitedError, preserving retry-after', async () => {
    const client = makeClient(() => {
      // The real SDK sets `headers` to a Fetch `Headers` instance, which
      // only supports `.get(name)`, not bracket/index access.
      throw Object.assign(new Error('rate limited'), {
        status: 429,
        headers: new Headers({ 'retry-after': '7' }),
      });
    });

    let thrown: unknown;
    try {
      await provider(client).complete({
        model: 'gpt-5-nano',
        input: [{ role: 'user', content: 'hi' }],
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(UpstreamRateLimitedError);
    expect((thrown as UpstreamRateLimitedError).retryAfterSeconds).toBe(7);
  });

  it('maps an SDK connection-timeout error to UpstreamTimeoutError', async () => {
    const client = makeClient(() => {
      throw new OpenAI.APIConnectionTimeoutError();
    });

    await expect(
      provider(client).complete({
        model: 'gpt-5-nano',
        input: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it('maps any other provider failure to UpstreamError', async () => {
    const client = makeClient(() => {
      throw Object.assign(new Error('boom'), { status: 500 });
    });

    await expect(
      provider(client).complete({
        model: 'gpt-5-nano',
        input: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
