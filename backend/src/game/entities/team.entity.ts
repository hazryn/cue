import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('team')
@Index(['gameId'])
// Token identyfikuje telefon w obrębie JEDNEJ gry. Globalna unikalność blokowałaby
// powrót tego samego telefonu do kolejnej rozgrywki — a telefon trzyma token
// w localStorage i przynosi go ze sobą po każdym „Nowa gra". Wyrzucona drużyna
// nie blokuje tokenu — ten sam telefon może dołączyć ponownie.
@Index(['gameId', 'deviceToken'], { unique: true, where: 'is_removed = false' })
export class TeamEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'game_id', type: 'uuid' })
  gameId!: string;

  @Column({ type: 'varchar', length: 40 })
  name!: string;

  /** Nazwa znormalizowana — unique index wykrywa kolizje mimo ogonków i wielkości liter */
  @Column({ type: 'varchar', length: 40 })
  slug!: string;

  @Column({ type: 'varchar', length: 16 })
  color!: string;

  /** Zdenormalizowane z game.state — do podglądu w bazie, nie do odczytu przez grę */
  @Column({ type: 'int', default: 0 })
  score!: number;

  /** Capability drużyny: kto ma token, ten jest tą drużyną */
  @Column({ name: 'device_token', type: 'uuid' })
  deviceToken!: string;

  @Column({ name: 'is_removed', type: 'boolean', default: false })
  isRemoved!: boolean;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;
}
