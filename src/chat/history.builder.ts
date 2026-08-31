import { ChatMessage } from '../llm/llm.provider';
import { BudgetExceededError } from '../common/errors';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  /** token count computed once at insert time and stored in the database */
  tokenCount: number;
}

export type TokenCounter = (messages: ChatMessage[]) => number;

export interface BuildContextInput {
  systemPrompt: string;
  /** active history, chronological */
  history: HistoryMessage[];
  newUserContent: string;
  budgetTokens: number;
  pinnedHeadMessages: number;
  headMaxShare: number;
  gapMarker: boolean;
}

export interface BuiltContext {
  input: ChatMessage[];
  meta: {
    messagesSent: number;
    messagesOmitted: number;
    estimatedInputTokens: number;
  };
}

const markerText = (omitted: number) =>
  `[... ${omitted} earlier messages omitted to fit the context budget ...]`;

const toChat = (m: HistoryMessage): ChatMessage => ({
  role: m.role,
  content: m.content,
});

/**
 * Builds the message array sent to the model.
 *
 * Strategy: a simplified middle-out. The system prompt and the new user message
 * are always present. A pinned head preserves how the conversation was framed,
 * the tail is filled from the newest message backwards, and whatever does not
 * fit in between is dropped — models attend least to the middle of a long
 * context (Liu et al., 2023).
 *
 * Pure: no database, no network, no clock. The token counter is injected.
 */
export function buildContext(
  a: BuildContextInput,
  countTokens: TokenCounter,
): BuiltContext {
  const system: ChatMessage = { role: 'system', content: a.systemPrompt };
  const newUser: ChatMessage = { role: 'user', content: a.newUserContent };

  const fixedCost = countTokens([system, newUser]);
  if (fixedCost > a.budgetTokens) {
    throw new BudgetExceededError(fixedCost, a.budgetTokens);
  }
  let remaining = a.budgetTokens - fixedCost;

  // --- head: the first messages, capped at a share of the remaining budget
  const headCap = Math.floor(remaining * a.headMaxShare);
  const head: HistoryMessage[] = [];
  let headCost = 0;
  for (const m of a.history.slice(0, a.pinnedHeadMessages)) {
    if (headCost + m.tokenCount > headCap) break;
    head.push(m);
    headCost += m.tokenCount;
  }
  remaining -= headCost;

  // --- tail: newest first, stop at the first message that does not fit.
  // Stopping rather than skipping keeps the conversation contiguous.
  const fillTail = (budget: number) => {
    const picked: HistoryMessage[] = [];
    let cost = 0;
    for (let i = a.history.length - 1; i >= head.length; i--) {
      const m = a.history[i];
      if (cost + m.tokenCount > budget) break;
      picked.push(m);
      cost += m.tokenCount;
    }
    return { tail: picked.reverse(), cost };
  };

  let { tail, cost: tailCost } = fillTail(remaining);
  let omitted = a.history.length - head.length - tail.length;

  // --- gap marker: refill the tail with room reserved for the marker,
  // so the marker never pushes the request over budget
  let marker: ChatMessage | null = null;
  let markerCost = 0;
  if (omitted > 0 && a.gapMarker) {
    markerCost = countTokens([
      { role: 'system', content: markerText(omitted) },
    ]);
    const refilled = fillTail(Math.max(0, remaining - markerCost));
    tail = refilled.tail;
    tailCost = refilled.cost;
    omitted = a.history.length - head.length - tail.length;
    marker =
      omitted > 0 ? { role: 'system', content: markerText(omitted) } : null;
    if (!marker) markerCost = 0;
  }

  const input: ChatMessage[] = [
    system,
    ...head.map(toChat),
    ...(marker ? [marker] : []),
    ...tail.map(toChat),
    newUser,
  ];

  return {
    input,
    meta: {
      messagesSent: input.length,
      messagesOmitted: omitted,
      estimatedInputTokens: fixedCost + headCost + tailCost + markerCost,
    },
  };
}
