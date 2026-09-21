import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AnswerEntity } from './answer.entity';
import { PackEntity } from './pack.entity';

export type QuestionKind = 'MAIN' | 'FINAL';

@Entity('question')
@Index(['packId', 'kind'])
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'pack_id', type: 'uuid' })
  packId!: string;

  @ManyToOne(() => PackEntity, (p) => p.questions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pack_id' })
  pack!: PackEntity;

  @Column({ type: 'varchar', length: 8 })
  kind!: QuestionKind;

  @Column({ type: 'text' })
  text!: string;

  /** Notatka dla prowadzącego, np. akceptowalne synonimy */
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived!: boolean;

  @OneToMany(() => AnswerEntity, (a) => a.question, { cascade: true, eager: true })
  answers!: AnswerEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
