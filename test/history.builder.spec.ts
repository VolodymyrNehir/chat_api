import { buildContext, HistoryMessage } from '../src/chat/history.builder';
import { BudgetExceededError } from '../src/common/errors';

/** one token per character — keeps assertions exact and tokenizer-independent */
const count = (msgs: { content: string }[]) =>
  msgs.reduce((n, m) => n + m.content.length, 0);

const msg = (role: 'user' | 'assistant', content: string): HistoryMessage => ({
  role,
  content,
  tokenCount: content.length,
});

const base = {
  systemPrompt: 'SYS', // 3
  newUserContent: 'NEW', // 3
  budgetTokens: 100,
  pinnedHeadMessages: 2,
  headMaxShare: 0.25,
  gapMarker: false,
};

describe('buildContext', () => {
  it('includes the whole history when it fits', () => {
    const history = [msg('user', 'aa'), msg('assistant', 'bb')];
    const r = buildContext({ ...base, history }, count);

    expect(r.input.map((m) => m.content)).toEqual(['SYS', 'aa', 'bb', 'NEW']);
    expect(r.meta.messagesOmitted).toBe(0);
    expect(r.meta.messagesSent).toBe(4);
  });

  it('puts the system prompt first and the new message last', () => {
    const history = [msg('user', 'aa')];
    const r = buildContext({ ...base, history }, count);

    expect(r.input[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(r.input[r.input.length - 1]).toEqual({
      role: 'user',
      content: 'NEW',
    });
  });

  it('keeps the pinned head and the newest tail, dropping the middle', () => {
    // budget 100, fixed 6 -> remaining 94, head cap floor(94*0.25) = 23
    const history = [
      msg('user', 'H1'.repeat(5)), // 10  head
      msg('assistant', 'H2'.repeat(5)), // 10  head  (total 20 <= 23)
      msg('user', 'M1'.repeat(20)), // 40  middle
      msg('assistant', 'M2'.repeat(20)), // 40  middle
      msg('user', 'T1'.repeat(10)), // 20  tail
      msg('assistant', 'T2'.repeat(10)), // 20  tail  (74 remaining, 40 used)
    ];
    const r = buildContext({ ...base, history }, count);
    const contents = r.input.map((m) => m.content);

    expect(contents[0]).toBe('SYS');
    expect(contents[1]).toBe('H1'.repeat(5));
    expect(contents[2]).toBe('H2'.repeat(5));
    expect(contents).not.toContain('M1'.repeat(20));
    expect(contents).toContain('T1'.repeat(10));
    expect(contents).toContain('T2'.repeat(10));
    expect(r.meta.messagesOmitted).toBe(2);
  });

  it('returns the tail in chronological order', () => {
    const history = [
      msg('user', 'x'.repeat(60)),
      msg('user', 'one'),
      msg('assistant', 'two'),
    ];
    const r = buildContext({ ...base, history, pinnedHeadMessages: 0 }, count);
    const contents = r.input.map((m) => m.content);

    expect(contents.indexOf('one')).toBeLessThan(contents.indexOf('two'));
  });

  it('lets recency win when the head cannot be pinned within its share', () => {
    // budget 60, fixed 6 -> remaining 54, head cap floor(54*0.25) = 13.
    // The 40-token opener cannot be pinned, and once the tail has taken the
    // newer messages there is no room left for it either.
    const history = [
      msg('user', 'H'.repeat(40)), // 40  too big to pin
      msg('assistant', 'M'.repeat(30)), // 30
      msg('user', 'T'.repeat(10)), // 10
    ];
    const r = buildContext({ ...base, history, budgetTokens: 60 }, count);
    const contents = r.input.map((m) => m.content);

    expect(contents).not.toContain('H'.repeat(40));
    expect(contents).toContain('M'.repeat(30));
    expect(contents).toContain('T'.repeat(10));
    expect(r.meta.messagesOmitted).toBe(1);
  });

  it('throws when the new message alone exceeds the budget', () => {
    expect(() =>
      buildContext(
        { ...base, history: [], newUserContent: 'x'.repeat(200) },
        count,
      ),
    ).toThrow(BudgetExceededError);
  });

  it('inserts a gap marker only when something was omitted', () => {
    const short = buildContext(
      { ...base, history: [msg('user', 'aa')], gapMarker: true },
      count,
    );
    expect(short.input.some((m) => m.content.includes('omitted'))).toBe(false);

    const long = buildContext(
      {
        ...base,
        gapMarker: true,
        pinnedHeadMessages: 1,
        history: [
          msg('user', 'head'),
          msg('assistant', 'y'.repeat(60)),
          msg('user', 'z'.repeat(60)),
          msg('assistant', 'last'),
        ],
      },
      count,
    );
    const marker = long.input.find((m) => m.content.includes('omitted'));
    expect(marker).toBeDefined();
    expect(marker!.role).toBe('system');
    expect(long.meta.messagesOmitted).toBeGreaterThan(0);
  });

  it('counts messagesSent as the length of the produced input array', () => {
    const history = [msg('user', 'aa'), msg('assistant', 'bb')];
    const r = buildContext({ ...base, history }, count);
    expect(r.meta.messagesSent).toBe(r.input.length);
  });

  it('reports an estimate that covers everything it sent', () => {
    const history = [msg('user', 'aaaa'), msg('assistant', 'bbbb')];
    const r = buildContext({ ...base, history }, count);
    expect(r.meta.estimatedInputTokens).toBe(count(r.input));
  });

  it('drops a gap marker that does not fit within the budget', () => {
    // markerText(N) is around 60 characters, so a low budget forces the marker to be dropped.
    // Create 20-message history where marker would be ~70 tokens.
    // Budget 15: fixed 6, remaining 9. Head cap floor(9*0.25)=2. After head uses maybe 2,
    // tail gets 7 tokens, which fills some tail messages. Marker reserve (for
    // markerText(20) ~70 tokens) far exceeds remaining, so marker is dropped.
    const history = Array.from({ length: 20 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', 'x'),
    );
    const r = buildContext(
      {
        ...base,
        history,
        budgetTokens: 15,
        gapMarker: true,
        pinnedHeadMessages: 2,
      },
      count,
    );

    // marker should not be present
    expect(r.input.some((m) => m.content.includes('omitted'))).toBe(false);
    // but omission is still reported in metadata
    expect(r.meta.messagesOmitted).toBeGreaterThan(0);
    // and the output must fit within budget
    expect(count(r.input)).toBeLessThanOrEqual(15);
  });

  it('ensures output never exceeds budget across a range of histories and budgets', () => {
    // Create a history of 20 single-token messages
    const history = Array.from({ length: 20 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', String(i)),
    );

    // Test across budgets that straddle the marker size
    const budgets = [10, 13, 20, 40, 80, 200];
    for (const budgetTokens of budgets) {
      const r = buildContext(
        {
          ...base,
          history,
          budgetTokens,
          gapMarker: true,
          pinnedHeadMessages: 2,
        },
        count,
      );

      // Core invariant: output must never exceed the budget
      const actualCost = count(r.input);
      expect(actualCost).toBeLessThanOrEqual(budgetTokens);

      // Estimate must be exact
      expect(r.meta.estimatedInputTokens).toBe(actualCost);
    }
  });
});
