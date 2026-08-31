import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { Request, Response } from 'express';
import {
  BudgetExceededError,
  SequenceConflictError,
  SessionNotFoundError,
  UnsupportedModelError,
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from './errors';

interface Mapped {
  status: number;
  code: string;
  message: string | string[];
  retryAfter?: number;
}

interface HttpExceptionBody {
  message?: string | string[];
}

function isHttpExceptionBody(x: unknown): x is HttpExceptionBody {
  return typeof x === 'object' && x !== null && 'message' in x;
}

/**
 * Maps every domain error and framework exception onto a stable HTTP status
 * and machine-readable code. Never echoes the request body, headers or a
 * stack trace back to the client — only the mapped message and code are
 * logged and returned.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const mapped = this.map(exception);

    // log the message and the code — never the request body or headers,
    // which may carry the api key or user content
    this.logger.error(
      `${req.method} ${req.url} -> ${mapped.status} ${mapped.code}: ${String(mapped.message)}`,
    );

    if (mapped.retryAfter !== undefined) {
      res.setHeader('Retry-After', String(mapped.retryAfter));
    }

    res.status(mapped.status).json({
      statusCode: mapped.status,
      error: STATUS_CODES[mapped.status] ?? 'Error',
      code: mapped.code,
      message: mapped.message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }

  private map(e: unknown): Mapped {
    if (e instanceof SessionNotFoundError) {
      return { status: 404, code: 'SESSION_NOT_FOUND', message: e.message };
    }
    if (e instanceof UnsupportedModelError) {
      return { status: 400, code: 'UNSUPPORTED_MODEL', message: e.message };
    }
    if (e instanceof BudgetExceededError) {
      return {
        status: 422,
        code: 'CONTEXT_BUDGET_EXCEEDED',
        message: e.message,
      };
    }
    if (e instanceof SequenceConflictError) {
      return { status: 409, code: 'SEQUENCE_CONFLICT', message: e.message };
    }
    if (e instanceof UpstreamRateLimitedError) {
      return {
        status: 429,
        code: 'UPSTREAM_RATE_LIMITED',
        message: e.message,
        retryAfter: e.retryAfterSeconds,
      };
    }
    if (e instanceof UpstreamTimeoutError) {
      return { status: 504, code: 'UPSTREAM_TIMEOUT', message: e.message };
    }
    if (e instanceof UpstreamError) {
      return { status: 502, code: 'UPSTREAM_ERROR', message: e.message };
    }

    if (e instanceof HttpException) {
      const body = e.getResponse();
      const message = isHttpExceptionBody(body)
        ? (body.message ?? e.message)
        : e.message;
      const status = e.getStatus();
      return {
        status,
        code: status === 400 ? 'VALIDATION_FAILED' : 'HTTP_ERROR',
        message,
      };
    }

    this.logger.error(
      'Unhandled exception',
      e instanceof Error ? e.stack : String(e),
    );
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}
