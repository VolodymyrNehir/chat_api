import { Injectable } from '@nestjs/common';
import { countTokens } from 'gpt-tokenizer/model/gpt-5-nano';
import { ChatMessage } from './llm.provider';

/**
 * Wraps gpt-tokenizer.
 *
 * The installed gpt-tokenizer release needs a concrete model to compute
 * chat-message framing overhead (the root `gpt-tokenizer` export has no
 * model attached, so counting a message array through it throws). Every
 * chat-enabled model gpt-tokenizer supports other than the legacy
 * gpt-3.5 family shares the same framing/separator config, so anchoring
 * the encoder to a specific model changes nothing about the count — verified
 * empirically that gpt-5-nano, gpt-4o-mini, gpt-5, gpt-5-mini and
 * gpt-4.1-mini all return the same token count for the same chat. gpt-5-nano
 * is used here because it's this app's own `DEFAULT_MODEL`.
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
