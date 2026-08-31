import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'text', name: 'system_prompt' })
  systemPrompt: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  /**
   * Current context generation. Reset moves it forward; it never goes back.
   * Everything written under an earlier generation stays in the database —
   * see the reset rationale in the design document.
   */
  @Column({ type: 'int', default: 1 })
  generation: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
