import { Actor, GamePhase } from '@cue/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only log akcji. Undo = usunięcie ostatniego wpisu i replay od seq=1,
 * dlatego payload musi wystarczać reduktorowi bez sięgania po cokolwiek z zewnątrz.
 */
@Entity('game_event')
@Index(['gameId', 'seq'], { unique: true })
export class GameEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'game_id', type: 'uuid' })
  gameId!: string;

  @Column({ type: 'int' })
  seq!: number;

  @Column({ type: 'varchar', length: 48 })
  type!: string;

  @Column({ type: 'varchar', length: 16 })
  actor!: Actor;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: Record<string, unknown>;

  /** Czas zdarzenia użyty przez reduktor — replay musi dostać dokładnie ten sam */
  @Column({ name: 'event_at', type: 'bigint' })
  eventAt!: string;

  @Column({ name: 'phase_before', type: 'varchar', length: 16 })
  phaseBefore!: GamePhase;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
