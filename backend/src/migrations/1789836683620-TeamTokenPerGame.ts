import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token telefonu był unikalny globalnie, więc gracz z tokenem z poprzedniej gry
 * nie mógł dołączyć do nowej — insert leciał na "idx_team_token". Unikalność
 * przenosimy na parę (gra, token), bo telefon trzyma token w localStorage
 * i przynosi go ze sobą po każdym założeniu nowej gry.
 */
export class TeamTokenPerGame1789836683620 implements MigrationInterface {
  name = 'TeamTokenPerGame1789836683620';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_token"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_team_game_token" ON "team" ("game_id", "device_token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_game_token"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_team_token" ON "team" ("device_token")`);
  }
}
