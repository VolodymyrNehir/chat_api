import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type MessageRole = 'user' | 'assistant';

@Entity('messages')
@Unique('messages_session_seq_uniq', ['sessionId', 'seq'])
@Index('messages_session_seq_idx', ['sessionId', 'seq'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

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
