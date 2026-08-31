import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Session } from './session.entity';

export type MessageRole = 'user' | 'assistant';

@Entity('messages')
@Unique('messages_session_seq_uniq', ['sessionId', 'seq'])
@Index('messages_session_seq_idx', ['sessionId', 'seq'])
@Index('messages_session_generation_seq_idx', [
  'sessionId',
  'generation',
  'seq',
])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  /** the generation this message belongs to; only the current one is active */
  @Column({ type: 'int', default: 1 })
  generation: number;

  @Column({ type: 'int' })
  seq: number;

  @Column({ type: 'varchar', length: 16 })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', name: 'token_count' })
  tokenCount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
