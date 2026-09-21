import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Nie jest potrzebny do odtworzenia stanu — wynik wyścigu siedzi w logu zdarzeń.
 * Jest bezcenny o 22:30, gdy ktoś krzyknie „ja byłem pierwszy": admin pokazuje ms.
 */
@Entity('buzz_press')
@Index(['raceId'])
export class BuzzPressEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'race_id', type: 'uuid' })
  raceId!: string;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @Column({ name: 'client_ts_ms', type: 'bigint' })
  clientTsMs!: string;

  @Column({ name: 'clock_offset_ms', type: 'int' })
  clockOffsetMs!: number;

  @Column({ name: 'server_recv_ms', type: 'bigint' })
  serverRecvMs!: string;

  /** clientTs + offset — wspólna oś czasu wszystkich telefonów */
  @Column({ name: 'adjusted_ms', type: 'bigint' })
  adjustedMs!: string;

  @Column({ name: 'rtt_ms', type: 'int' })
  rttMs!: number;

  @Column({ name: 'rejected_reason', type: 'varchar', length: 32, nullable: true })
  rejectedReason!: string | null;
}
