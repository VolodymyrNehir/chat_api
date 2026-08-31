export class UnsupportedModelError extends Error {
  constructor(
    readonly model: string,
    readonly supported: string[],
  ) {
    super(
      `Unsupported model "${model}". Supported models: ${supported.join(', ')}`,
    );
    this.name = 'UnsupportedModelError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    readonly required: number,
    readonly budget: number,
  ) {
    super(
      `Message does not fit the context budget (needs ${required} tokens, budget ${budget})`,
    );
    this.name = 'BudgetExceededError';
  }
}

export class SequenceConflictError extends Error {
  constructor(readonly sessionId: string) {
    super(`Concurrent write to session ${sessionId}, please retry`);
    this.name = 'SequenceConflictError';
  }
}

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export class UpstreamTimeoutError extends UpstreamError {
  constructor(message = 'The model provider timed out') {
    super(message);
    this.name = 'UpstreamTimeoutError';
  }
}

export class UpstreamRateLimitedError extends UpstreamError {
  constructor(readonly retryAfterSeconds?: number) {
    super('The model provider rate limited the request');
    this.name = 'UpstreamRateLimitedError';
  }
}
