import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token urządzenia wyrzuconej drużyny blokował ponowne dołączenie tym samym
 * telefonem: unikalność obejmowała też usunięte wiersze. Liczy się teraz tylko
 * wśród aktywnych drużyn — tak samo jak unikalność nazwy.
 */
export class TeamTokenActiveOnly1789990681354 implements MigrationInterface {
  name = 'TeamTokenActiveOnly1789990681354';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_game_token"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_team_game_token" ON "team" ("game_id", "device_token") WHERE "is_removed" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_game_token"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_team_game_token" ON "team" ("game_id", "device_token")`);
  }
}
