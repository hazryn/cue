import { GamePhase, GameState } from '@cue/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('game')
export class GameEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 8, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 16 })
  phase!: GamePhase;

  /** Pełny snapshot stanu — jedno SELECT i serwer wie wszystko po restarcie */
  @Column({ type: 'jsonb' })
  state!: GameState;

  @Column({ name: 'last_seq', type: 'int', default: 0 })
  lastSeq!: number;

  /**
   * Tylko jedna gra może być aktywna. Partial unique index (w migracji)
   * chroni przed „admin kliknął Nowa gra dwa razy".
   */
  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** Identyfikatory pytań finałowych wybranych przy konfiguracji gry */
  @Column({ name: 'final_question_ids', type: 'jsonb', default: () => "'[]'" })
  finalQuestionIds!: string[];

  /** Pytania z wybranych pakietów, które nie weszły do rozdania — zapas na podmianę */
  @Column({ name: 'spare_question_ids', type: 'jsonb', default: () => "'[]'" })
  spareQuestionIds!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
