import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Zdenormalizowany wynik finału do podglądu; źródłem prawdy jest game.state.final */
@Entity('final_session')
export class FinalSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'game_id', type: 'uuid' })
  gameId!: string;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @Column({ name: 'question_ids', type: 'jsonb' })
  questionIds!: string[];

  @Column({ name: 'player1_name', type: 'varchar', length: 40 })
  player1Name!: string;

  @Column({ name: 'player2_name', type: 'varchar', length: 40 })
  player2Name!: string;

  @Column({ name: 'total_score', type: 'int', default: 0 })
  totalScore!: number;

  @Column({ name: 'won_prize', type: 'boolean', default: false })
  wonPrize!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
