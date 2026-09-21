import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1789830551464 implements MigrationInterface {
  name = 'InitialSchema1789830551464';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ---------------------------------------------------------- katalog pytań
    await queryRunner.query(`
      CREATE TABLE "pack" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "description" text,
        "color" varchar(16) NOT NULL DEFAULT '#64748b',
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "question" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pack_id" uuid NOT NULL REFERENCES "pack"("id") ON DELETE RESTRICT,
        "kind" varchar(8) NOT NULL,
        "text" text NOT NULL,
        "note" text,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_archived" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_question_pack_kind" ON "question" ("pack_id", "kind") WHERE "is_archived" = false`);

    await queryRunner.query(`
      CREATE TABLE "answer" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "question_id" uuid NOT NULL REFERENCES "question"("id") ON DELETE CASCADE,
        "text" varchar(120) NOT NULL,
        "weight" smallint NOT NULL CHECK ("weight" BETWEEN 1 AND 100),
        "position" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_answer_q_pos" ON "answer" ("question_id", "position")`);

    // -------------------------------------------------------------- rozgrywka
    await queryRunner.query(`
      CREATE TABLE "game" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(8) NOT NULL UNIQUE,
        "phase" varchar(16) NOT NULL DEFAULT 'LOBBY',
        "state" jsonb NOT NULL,
        "last_seq" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "final_question_ids" jsonb NOT NULL DEFAULT '[]',
        "spare_question_ids" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Jedna aktywna gra naraz — chroni przed dwukrotnym kliknięciem „Nowa gra"
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_game_single_active" ON "game" ("is_active") WHERE "is_active" = true`);

    await queryRunner.query(`
      CREATE TABLE "team" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
        "name" varchar(40) NOT NULL,
        "slug" varchar(40) NOT NULL,
        "color" varchar(16) NOT NULL,
        "score" int NOT NULL DEFAULT 0,
        "device_token" uuid NOT NULL,
        "is_removed" boolean NOT NULL DEFAULT false,
        "joined_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_team_game_slug" ON "team" ("game_id", "slug") WHERE "is_removed" = false`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_team_token" ON "team" ("device_token")`);
    await queryRunner.query(`CREATE INDEX "idx_team_game" ON "team" ("game_id")`);

    await queryRunner.query(`
      CREATE TABLE "game_event" (
        "id" bigserial PRIMARY KEY,
        "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
        "seq" int NOT NULL,
        "type" varchar(48) NOT NULL,
        "actor" varchar(16) NOT NULL,
        "actor_id" uuid,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "event_at" bigint NOT NULL,
        "phase_before" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_event_game_seq" ON "game_event" ("game_id", "seq")`);

    // ------------------------------------------------------ audyt grzybków
    await queryRunner.query(`
      CREATE TABLE "buzz_race" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
        "race_key" varchar(128) NOT NULL,
        "question_index" smallint NOT NULL,
        "kind" varchar(16) NOT NULL,
        "eligible" jsonb NOT NULL,
        "opened_at" bigint NOT NULL,
        "resolved_at" bigint,
        "winner_team_id" uuid,
        "is_void" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_race_game" ON "buzz_race" ("game_id")`);

    await queryRunner.query(`
      CREATE TABLE "buzz_press" (
        "id" bigserial PRIMARY KEY,
        "race_id" uuid NOT NULL REFERENCES "buzz_race"("id") ON DELETE CASCADE,
        "team_id" uuid NOT NULL,
        "client_ts_ms" bigint NOT NULL,
        "clock_offset_ms" int NOT NULL,
        "server_recv_ms" bigint NOT NULL,
        "adjusted_ms" bigint NOT NULL,
        "rtt_ms" int NOT NULL,
        "rejected_reason" varchar(32)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_press_race" ON "buzz_press" ("race_id", "adjusted_ms")`);

    await queryRunner.query(`
      CREATE TABLE "final_session" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
        "team_id" uuid NOT NULL,
        "question_ids" jsonb NOT NULL,
        "player1_name" varchar(40) NOT NULL,
        "player2_name" varchar(40) NOT NULL,
        "total_score" int NOT NULL DEFAULT 0,
        "won_prize" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_final_game" ON "final_session" ("game_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "final_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "buzz_press"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "buzz_race"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game_event"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "answer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pack"`);
  }
}
