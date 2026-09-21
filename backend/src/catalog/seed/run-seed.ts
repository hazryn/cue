/**
 * Wypełnia katalog pytaniami startowymi. Uruchamiane ręcznie: `npm run seed`.
 *
 * Idempotentne po nazwie pakietu i treści pytania — ponowne odpalenie nie
 * duplikuje wpisów, więc można dorzucać nowe pytania do pliku i seedować znowu.
 * Ręczne zmiany w panelu admina zostają nietknięte.
 */
import 'reflect-metadata';
import dataSource from '../../data-source';
import { AnswerEntity } from '../entities/answer.entity';
import { PackEntity } from '../entities/pack.entity';
import { QuestionEntity } from '../entities/question.entity';
import { SEED_PACKS } from './data';
import { SeedQuestion } from './types';

async function seed(): Promise<void> {
  await dataSource.initialize();
  const packs = dataSource.getRepository(PackEntity);
  const questions = dataSource.getRepository(QuestionEntity);
  const answers = dataSource.getRepository(AnswerEntity);

  let createdPacks = 0;
  let createdQuestions = 0;
  let skipped = 0;

  for (const [packIndex, seedPack] of SEED_PACKS.entries()) {
    let pack = await packs.findOne({ where: { name: seedPack.name } });
    if (!pack) {
      pack = await packs.save(
        packs.create({
          name: seedPack.name,
          description: seedPack.description,
          color: seedPack.color,
          sortOrder: packIndex,
        }),
      );
      createdPacks += 1;
    }

    const save = async (item: SeedQuestion, kind: 'MAIN' | 'FINAL', order: number): Promise<void> => {
      const exists = await questions.findOne({ where: { packId: pack!.id, text: item.text } });
      if (exists) {
        skipped += 1;
        return;
      }
      validate(kind, item);
      await questions.save(
        questions.create({
          packId: pack!.id,
          kind,
          text: item.text,
          note: item.note ?? null,
          sortOrder: order,
          answers: item.answers
            .slice()
            .sort((a, b) => b[1] - a[1])
            .map(([text, weight], position) => answers.create({ text, weight, position })),
        }),
      );
      createdQuestions += 1;
    };

    for (const [i, q] of seedPack.main.entries()) await save(q, 'MAIN', i);
    for (const [i, q] of seedPack.final.entries()) await save(q, 'FINAL', i);
  }

  const totals = await questions
    .createQueryBuilder('q')
    .select('q.kind', 'kind')
    .addSelect('count(*)', 'count')
    .groupBy('q.kind')
    .getRawMany<{ kind: string; count: string }>();

  console.log(`Pakiety: +${createdPacks}, pytania: +${createdQuestions}, pominięte (już były): ${skipped}`);
  for (const row of totals) console.log(`  ${row.kind}: ${row.count}`);
  await dataSource.destroy();
}

function validate(kind: 'MAIN' | 'FINAL', question: SeedQuestion): void {
  const count = question.answers.length;
  if (kind === 'FINAL' && count !== 10) {
    throw new Error(`„${question.text}" — pytanie finałowe musi mieć 10 odpowiedzi, ma ${count}`);
  }
  if (kind === 'MAIN' && (count < 3 || count > 10)) {
    throw new Error(`„${question.text}" — pytanie główne ma mieć 3–10 odpowiedzi, ma ${count}`);
  }
  const sum = question.answers.reduce((acc, [, weight]) => acc + weight, 0);
  if (sum > 100) throw new Error(`„${question.text}" — wagi sumują się do ${sum}, czyli powyżej stu ankietowanych`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
