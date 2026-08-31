import { TokenUsage } from '../chat/pricing.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface LlmRequest {
  model: string;
  input: ChatMessage[];
}

/**
 * The seam in front of the model provider. Abstract class rather than an
 * interface so it can be used directly as a Nest injection token.
 */
export abstract class LlmProvider {
  abstract complete(req: LlmRequest): Promise<LlmCompletion>;
}
