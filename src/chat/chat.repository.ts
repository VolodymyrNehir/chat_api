import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Message } from './entities/message.entity';
import { Interaction } from './entities/interaction.entity';
import { SessionNotFoundError, SequenceConflictError } from '../common/errors';

export interface SessionTotals {
  messageCount: number;
  interactionCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalCostUsd: string;
}

export interface RecordExchangeInput {
  sessionId: string;
  generation: number;
  userContent: string;
  userTokenCount: number;
  assistantContent: string;
  assistantTokenCount: number;
  interaction: Omit<
    Interaction,
    | 'id'
    | 'sessionId'
    | 'session'
    | 'generation'
    | 'userMessageId'
    | 'userMessage'
    | 'assistantMessageId'
    | 'assistantMessage'
    | 'createdAt'
  >;
}

interface RawTotalsRow {
  message_count: number;
  interaction_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_cost_usd: string;
}

interface RawNextSeqRow {
  next: string;
}

interface RawGenerationRow {
  generation: number;
}

interface RawCountRow {
  count: number;
}

/** shape of the pg driver error TypeORM wraps in QueryFailedError.driverError */
interface PgDriverError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class ChatRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
  ) {}

  async createSession(input: {
    title?: string;
    systemPrompt: string;
    model: string;
  }) {
    return this.sessions.save(
      this.sessions.create({
        title: input.title ?? null,
        systemPrompt: input.systemPrompt,
        model: input.model,
      }),
    );
  }

  async findSession(id: string): Promise<Session> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new SessionNotFoundError(id);
    return session;
  }

  /**
   * The active history of a session: the messages of its current generation.
   *
   * Reset does not delete anything — it moves the generation forward, and
   * this filter is what makes the earlier ones stop being history.
   */
  async findActiveHistory(
    sessionId: string,
    generation: number,
  ): Promise<Message[]> {
    return this.messages.find({
      where: { sessionId, generation },
      order: { seq: 'ASC' },
    });
  }

  /**
   * @param generation when given, restricts every count and sum to that
   *   generation; when omitted, aggregates the whole lifetime of the session.
   *   The filter has to reach BOTH subqueries and the outer FROM — a totals
   *   block reporting zero cost next to fourteen messages would be worse than
   *   no block at all.
   */
  private async queryTotals(
    sessionId: string,
    generation?: number,
  ): Promise<SessionTotals> {
    // qualified per table: an unqualified `generation` would resolve fine
    // today, but if either column were ever dropped, an unqualified reference
    // would silently bind to the outer `interactions` scope instead of
    // failing to parse
    const filter = (table: 'messages' | 'interactions') =>
      generation === undefined ? '' : ` AND ${table}.generation = $2`;
    const params: (string | number)[] =
      generation === undefined ? [sessionId] : [sessionId, generation];

    const row = await this.dataSource.query<RawTotalsRow[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM messages
            WHERE session_id = $1${filter('messages')})                 AS message_count,
         (SELECT COUNT(*)::int FROM interactions
            WHERE session_id = $1${filter('interactions')})             AS interaction_count,
         COALESCE(SUM(input_tokens), 0)::int                           AS input_tokens,
         COALESCE(SUM(cached_input_tokens), 0)::int                    AS cached_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int                          AS output_tokens,
         COALESCE(SUM(reasoning_tokens), 0)::int                       AS reasoning_tokens,
         COALESCE(SUM(total_cost_usd), 0)::numeric(18,10)::text        AS total_cost_usd
       FROM interactions WHERE session_id = $1${filter('interactions')}`,
      params,
    );
    const r = row[0];
    return {
      messageCount: r.message_count,
      interactionCount: r.interaction_count,
      inputTokens: r.input_tokens,
      cachedInputTokens: r.cached_input_tokens,
      outputTokens: r.output_tokens,
      reasoningTokens: r.reasoning_tokens,
      totalCostUsd: r.total_cost_usd,
    };
  }

  /** totals for the session's current generation only */
  async findActiveTotals(
    sessionId: string,
    generation: number,
  ): Promise<SessionTotals> {
    return this.queryTotals(sessionId, generation);
  }

  /** totals across every generation the session has ever had */
  async findLifetimeTotals(sessionId: string): Promise<SessionTotals> {
    return this.queryTotals(sessionId);
  }

  /**
   * Writes both messages and the interaction in one transaction, after the
   * model call has already succeeded. A failed call therefore leaves no
   * orphaned user message behind.
   */
  async recordExchange(input: RecordExchangeInput) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [{ next }] = await manager.query<RawNextSeqRow[]>(
          `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM messages WHERE session_id = $1`,
          [input.sessionId],
        );
        const baseSeq = Number(next);

        const userMessage = await manager.save(Message, {
          sessionId: input.sessionId,
          generation: input.generation,
          seq: baseSeq,
          role: 'user' as const,
          content: input.userContent,
          tokenCount: input.userTokenCount,
        });

        const assistantMessage = await manager.save(Message, {
          sessionId: input.sessionId,
          generation: input.generation,
          seq: baseSeq + 1,
          role: 'assistant' as const,
          content: input.assistantContent,
          tokenCount: input.assistantTokenCount,
        });

        const interaction = await manager.save(Interaction, {
          ...input.interaction,
          sessionId: input.sessionId,
          generation: input.generation,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        });

        // @UpdateDateColumn on Session already sets updated_at to
        // CURRENT_TIMESTAMP on every update() call, even with no other
        // columns in the set — no need to pass it explicitly
        await manager.update(Session, input.sessionId, {});

        return { userMessage, assistantMessage, interaction };
      });
    } catch (e) {
      // unique_violation on (session_id, seq): another request wrote first.
      // Match on the specific constraint name, not just the error code, so a
      // future unique constraint touched by this transaction isn't silently
      // mislabeled as a sequence conflict.
      const driverError =
        e instanceof QueryFailedError
          ? (e.driverError as PgDriverError | undefined)
          : undefined;
      if (
        driverError?.code === '23505' &&
        driverError.constraint === 'messages_session_seq_uniq'
      ) {
        throw new SequenceConflictError(input.sessionId);
      }
      throw e;
    }
  }

  /**
   * Starts a fresh context for a session without changing its id.
   *
   * Nothing is deleted: the generation counter moves forward and every message
   * and interaction written under an earlier generation stays in the database.
   * The active cost therefore starts at zero while the record of money
   * actually spent stays intact.
   *
   * Resetting an already-empty generation is a no-op. Otherwise repeated
   * clicks would inflate the counter with empty generations and `generation`
   * would report button presses rather than real resets.
   *
   * The `FOR UPDATE` lock on the session row serialises concurrent resets
   * against each other and orders this transaction's commit relative to the
   * trailing `sessions` update inside `recordExchange`. It does **not** make
   * the emptiness check below see an exchange that is still in flight: that
   * check reads committed rows only, and the model call it is racing against
   * happens outside any transaction by design (see `sendMessage`). A message
   * that has not yet committed will not be counted, reset will no-op, and the
   * message will land in the generation reset just "cleared" — a known
   * limitation, documented in the README, not a bug this lock closes.
   */
  async resetSession(sessionId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<RawGenerationRow[]>(
        `SELECT generation FROM sessions WHERE id = $1 FOR UPDATE`,
        [sessionId],
      );
      if (rows.length === 0) throw new SessionNotFoundError(sessionId);
      const current = rows[0].generation;

      const [counted] = await manager.query<RawCountRow[]>(
        `SELECT COUNT(*)::int AS count FROM messages
          WHERE session_id = $1 AND generation = $2`,
        [sessionId, current],
      );
      if (counted.count === 0) return;

      await manager.query(
        `UPDATE sessions SET generation = $2, updated_at = now() WHERE id = $1`,
        [sessionId, current + 1],
      );
    });
  }
}
