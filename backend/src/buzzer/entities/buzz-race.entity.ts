import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('buzz_race')
@Index(['gameId'])
export class BuzzRaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'game_id', type: 'uuid' })
  gameId!: string;

  /** Identyfikator wyścigu ze stanu gry (nie uuid — bywa złożony, np. q:steal:ts) */
  @Column({ name: 'race_key', type: 'varchar', length: 128 })
  raceKey!: string;

  @Column({ name: 'question_index', type: 'smallint' })
  questionIndex!: number;

  @Column({ type: 'varchar', length: 16 })
  kind!: string;

  @Column({ type: 'jsonb' })
  eligible!: string[];

  @Column({ name: 'opened_at', type: 'bigint' })
  openedAt!: string;

  @Column({ name: 'resolved_at', type: 'bigint', nullable: true })
  resolvedAt!: string | null;

  @Column({ name: 'winner_team_id', type: 'uuid', nullable: true })
  winnerTeamId!: string | null;

  @Column({ name: 'is_void', type: 'boolean', default: false })
  isVoid!: boolean;
}
