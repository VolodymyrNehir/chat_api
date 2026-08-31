import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788196112250 implements MigrationInterface {
  name = 'InitialSchema1788196112250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(200), "system_prompt" text NOT NULL, "model" character varying(64) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid NOT NULL, "seq" integer NOT NULL, "role" character varying(16) NOT NULL, "content" text NOT NULL, "token_count" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "messages_session_seq_uniq" UNIQUE ("session_id", "seq"), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "messages_session_seq_idx" ON "messages"  ("session_id", "seq") `,
    );
    await queryRunner.query(
      `CREATE TABLE "interactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid NOT NULL, "user_message_id" uuid NOT NULL, "assistant_message_id" uuid NOT NULL, "model" character varying(64) NOT NULL, "input_tokens" integer NOT NULL, "cached_input_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL, "reasoning_tokens" integer NOT NULL DEFAULT '0', "input_cost_usd" numeric(18,10) NOT NULL, "output_cost_usd" numeric(18,10) NOT NULL, "total_cost_usd" numeric(18,10) NOT NULL, "pricing_source" character varying(64) NOT NULL, "history_messages_sent" integer NOT NULL, "history_messages_omitted" integer NOT NULL DEFAULT '0', "estimated_input_tokens" integer NOT NULL, "latency_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_911b7416a6671b4148b18c18ecb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "interactions_session_idx" ON "interactions"  ("session_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."interactions_session_idx"`);
    await queryRunner.query(`DROP TABLE "interactions"`);
    await queryRunner.query(`DROP INDEX "public"."messages_session_seq_idx"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
