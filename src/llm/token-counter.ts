import { Injectable } from '@nestjs/common';
import { countTokens } from 'gpt-tokenizer/model/gpt-4o-mini';
import { ChatMessage } from './llm.provider';

/**
 * Wraps gpt-tokenizer.
 *
 * The installed gpt-tokenizer release needs a concrete model to compute
 * chat-message framing overhead (the root `gpt-tokenizer` export has no
 * model attached, so counting a message array through it throws). Every
 * chat-enabled model gpt-tokenizer supports other than the legacy
 * gpt-3.5 family shares the same framing/separator config, so anchoring
 * the encoder to gpt-4o-mini produces the same result as any other
 * supported model in the pricing table — this is not a per-model choice.
 *
 * countTokens already adds the per-message framing overhead. The result is an
 * estimate used to size the context window; billing always uses the token
 * counts OpenAI reports back.
 */
@Injectable()
export class TokenCounterService {
  count(messages: ChatMessage[]): number {
    return countTokens(messages);
  }
}
