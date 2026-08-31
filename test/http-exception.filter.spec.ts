import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import {
  BudgetExceededError,
  SequenceConflictError,
  SessionNotFoundError,
  UnsupportedModelError,
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from '../src/common/errors';

/** Minimal Express-`Response`-shaped fake: only what the filter calls. */
interface FakeResponse {
  statusCode?: number;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  status(code: number): FakeResponse;
  setHeader(name: string, value: string): void;
  json(body: Record<string, unknown>): FakeResponse;
}

function makeResponse(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    json(body: Record<string, unknown>) {
      res.body = body;
      return res;
    },
  };
  return res;
}

const req = { method: 'POST', url: '/sessions/abc/messages' };

/** A fake `ArgumentsHost` exposing only the HTTP switch the filter uses. */
function makeHost(res: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
      getNext: () => undefined,
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => {
      throw new Error('not used');
    },
    switchToWs: () => {
      throw new Error('not used');
    },
    getType: () => 'http',
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  const cases: Array<[string, Error, number, string]> = [
    [
      'SessionNotFoundError',
      new SessionNotFoundError('s1'),
      404,
      'SESSION_NOT_FOUND',
    ],
    [
      'UnsupportedModelError',
      new UnsupportedModelError('gpt-x', ['gpt-5-nano']),
      400,
      'UNSUPPORTED_MODEL',
    ],
    [
      'BudgetExceededError',
      new BudgetExceededError(100, 50),
      422,
      'CONTEXT_BUDGET_EXCEEDED',
    ],
    [
      'SequenceConflictError',
      new SequenceConflictError('s1'),
      409,
      'SEQUENCE_CONFLICT',
    ],
    [
      'UpstreamRateLimitedError',
      new UpstreamRateLimitedError(7),
      429,
      'UPSTREAM_RATE_LIMITED',
    ],
    [
      'UpstreamTimeoutError',
      new UpstreamTimeoutError(),
      504,
      'UPSTREAM_TIMEOUT',
    ],
    ['UpstreamError', new UpstreamError('boom'), 502, 'UPSTREAM_ERROR'],
  ];

  it.each(cases)(
    'maps %s to its documented status and code',
    (_name, exception, status, code) => {
      const res = makeResponse();
      filter.catch(exception, makeHost(res));

      expect(res.statusCode).toBe(status);
      expect(res.body?.code).toBe(code);
      expect(res.body?.message).toBe(exception.message);
      expect(res.body?.statusCode).toBe(status);
    },
  );

  it('sets Retry-After when UpstreamRateLimitedError carries a retryAfterSeconds', () => {
    const res = makeResponse();
    filter.catch(new UpstreamRateLimitedError(12), makeHost(res));
    expect(res.headers['Retry-After']).toBe('12');
  });

  it('does not set Retry-After when retryAfterSeconds is undefined', () => {
    const res = makeResponse();
    filter.catch(new UpstreamRateLimitedError(undefined), makeHost(res));
    expect(res.headers['Retry-After']).toBeUndefined();
  });

  it('maps a NestJS HttpException (e.g. from ValidationPipe) to VALIDATION_FAILED on 400', () => {
    const res = makeResponse();
    filter.catch(
      new BadRequestException(['content must be longer than 1 characters']),
      makeHost(res),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('VALIDATION_FAILED');
    expect(res.body?.message).toEqual([
      'content must be longer than 1 characters',
    ]);
  });

  it('maps an unknown Error to 500 with a fixed message and no stack trace in the body', () => {
    const res = makeResponse();
    const err = new Error('something exploded, key=sk-SECRET-MARKER-12345');
    filter.catch(err, makeHost(res));

    expect(res.statusCode).toBe(500);
    expect(res.body?.code).toBe('INTERNAL_ERROR');
    expect(res.body?.message).toBe('Internal server error');
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('sk-SECRET-MARKER-12345');
    expect(JSON.stringify(res.body)).not.toContain('something exploded');
  });

  it('never leaks QueryFailedError.driverError detail into the response body', () => {
    const res = makeResponse();
    const fakeDriverError = {
      code: '23505',
      detail:
        'Key (session_id)=(...) already exists. host=super-secret-db.internal, user=root',
    };
    const err = new QueryFailedError(
      'INSERT INTO "messages" (...) VALUES (...)',
      undefined,
      fakeDriverError as unknown as Error,
    );

    filter.catch(err, makeHost(res));

    expect(res.statusCode).toBe(500);
    expect(res.body?.code).toBe('INTERNAL_ERROR');
    expect(res.body?.message).toBe('Internal server error');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('super-secret-db.internal');
    expect(serialized).not.toContain('session_id');
    expect(serialized).not.toContain('23505');
  });
});
