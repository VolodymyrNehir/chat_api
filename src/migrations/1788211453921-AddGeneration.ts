import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeneration1788211453921 implements MigrationInterface {
  name = 'AddGeneration1788211453921';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "generation" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "generation" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "interactions" ADD "generation" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `CREATE INDEX "messages_session_generation_seq_idx" ON "messages"  ("session_id", "generation", "seq") `,
    );
    await queryRunner.query(
      `CREATE INDEX "interactions_session_generation_idx" ON "interactions"  ("session_id", "generation") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."interactions_session_generation_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."messages_session_generation_seq_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interactions" DROP COLUMN "generation"`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "generation"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "generation"`);
  }
}
