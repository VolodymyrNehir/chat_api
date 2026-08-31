import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Session } from './chat/entities/session.entity';
import { Message } from './chat/entities/message.entity';
import { Interaction } from './chat/entities/interaction.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [Session, Message, Interaction],
  migrations: ['src/migrations/*.ts', 'dist/migrations/*.js'],
  synchronize: false,
  // gen_random_uuid() is built into Postgres >= 13 via pgcrypto, unlike
  // uuid_generate_v4() which needs the superuser-only uuid-ossp extension —
  // see docs/superpowers/specs/2026-08-31-chat-api-design.md §4
  uuidExtension: 'pgcrypto',
});
