import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Session } from './session.entity';
import { Message } from './message.entity';

@Entity('interactions')
@Index('interactions_session_idx', ['sessionId', 'createdAt'])
@Index('interactions_session_generation_idx', ['sessionId', 'generation'])
export class Interaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  /** the generation this interaction was billed under */
  @Column({ type: 'int', default: 1 })
  generation: number;

  @Column({ type: 'uuid', name: 'user_message_id' })
  userMessageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_message_id' })
  userMessage: Message;

  @Column({ type: 'uuid', name: 'assistant_message_id' })
  assistantMessageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'assistant_message_id' })
  assistantMessage: Message;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ type: 'int', name: 'input_tokens' })
  inputTokens: number;

  @Column({ type: 'int', name: 'cached_input_tokens', default: 0 })
  cachedInputTokens: number;

  @Column({ type: 'int', name: 'output_tokens' })
  outputTokens: number;

  @Column({ type: 'int', name: 'reasoning_tokens', default: 0 })
  reasoningTokens: number;

  // numeric columns are returned as strings by the pg driver — kept that way
  // deliberately so no cost value ever passes through a JS float
  @Column({ type: 'numeric', precision: 18, scale: 10, name: 'input_cost_usd' })
  inputCostUsd: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 10,
    name: 'output_cost_usd',
  })
  outputCostUsd: string;

  @Column({ type: 'numeric', precision: 18, scale: 10, name: 'total_cost_usd' })
  totalCostUsd: string;

  @Column({ type: 'varchar', length: 64, name: 'pricing_source' })
  pricingSource: string;

  // count of history messages actually carried into the model call
  // (head.length + tail.length) — NOT the full input array length, which
  // also counts the system prompt, the gap marker and the new user message
  // (that full count is `context.messagesSent` on the wire, see chat.service.ts)
  @Column({ type: 'int', name: 'history_messages_sent' })
  historyMessagesSent: number;

  @Column({ type: 'int', name: 'history_messages_omitted', default: 0 })
  historyMessagesOmitted: number;

  @Column({ type: 'int', name: 'estimated_input_tokens' })
  estimatedInputTokens: number;

  @Column({ type: 'int', name: 'latency_ms' })
  latencyMs: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
