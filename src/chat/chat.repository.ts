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
   * The active history of a session.
   *
   * This is the single query step 4 will change when session reset lands:
   * reset narrows "active" to the current generation instead of everything.
   */
  async findActiveHistory(sessionId: string): Promise<Message[]> {
    return this.messages.find({ where: { sessionId }, order: { seq: 'ASC' } });
  }

  async findTotals(sessionId: string): Promise<SessionTotals> {
    const row = await this.dataSource.query<RawTotalsRow[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM messages WHERE session_id = $1)      AS message_count,
         (SELECT COUNT(*)::int FROM interactions WHERE session_id = $1)  AS interaction_count,
         COALESCE(SUM(input_tokens), 0)::int                             AS input_tokens,
         COALESCE(SUM(cached_input_tokens), 0)::int                      AS cached_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int                            AS output_tokens,
         COALESCE(SUM(reasoning_tokens), 0)::int                         AS reasoning_tokens,
         COALESCE(SUM(total_cost_usd), 0)::numeric(18,10)::text          AS total_cost_usd
       FROM interactions WHERE session_id = $1`,
      [sessionId],
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
          seq: baseSeq,
          role: 'user' as const,
          content: input.userContent,
          tokenCount: input.userTokenCount,
        });

        const assistantMessage = await manager.save(Message, {
          sessionId: input.sessionId,
          seq: baseSeq + 1,
          role: 'assistant' as const,
          content: input.assistantContent,
          tokenCount: input.assistantTokenCount,
        });

        const interaction = await manager.save(Interaction, {
          ...input.interaction,
          sessionId: input.sessionId,
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
}
