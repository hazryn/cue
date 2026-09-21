import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnswerDto, ImportDto, PackDto, QuestionDto } from './dto/catalog.dto';
import { AnswerEntity } from './entities/answer.entity';
import { PackEntity } from './entities/pack.entity';
import { QuestionEntity } from './entities/question.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(PackEntity) private readonly packs: Repository<PackEntity>,
    @InjectRepository(QuestionEntity) private readonly questions: Repository<QuestionEntity>,
    @InjectRepository(AnswerEntity) private readonly answers: Repository<AnswerEntity>,
  ) {}

  // ------------------------------------------------------------- pakiety

  listPacks(): Promise<PackEntity[]> {
    return this.packs.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async packStats(): Promise<Array<{ packId: string; main: number; final: number }>> {
    const rows = await this.questions
      .createQueryBuilder('q')
      .select('q.pack_id', 'packId')
      .addSelect(`count(*) filter (where q.kind = 'MAIN')`, 'main')
      .addSelect(`count(*) filter (where q.kind = 'FINAL')`, 'final')
      .where('q.is_archived = false')
      .groupBy('q.pack_id')
      .getRawMany<{ packId: string; main: string; final: string }>();
    return rows.map((r) => ({ packId: r.packId, main: Number(r.main), final: Number(r.final) }));
  }

  createPack(dto: PackDto): Promise<PackEntity> {
    return this.packs.save(this.packs.create(dto));
  }

  async updatePack(id: string, dto: PackDto): Promise<PackEntity> {
    const pack = await this.packs.findOne({ where: { id } });
    if (!pack) throw new NotFoundException('Nie ma takiego pakietu');
    return this.packs.save(Object.assign(pack, dto));
  }

  async deletePack(id: string): Promise<void> {
    const used = await this.questions.count({ where: { packId: id } });
    if (used > 0) throw new BadRequestException('Pakiet ma pytania — najpierw je przenieś lub usuń');
    await this.packs.delete(id);
  }

  // -------------------------------------------------------------- pytania

  /**
   * Odpowiedzi zawsze od najwyżej punktowanej. `position` jest nadawana malejąco
   * po wadze przy zapisie, więc sortowanie po niej daje kolejność z planszy —
   * bez tego relacja eager wraca w kolejności z bazy, czyli przypadkowej.
   */
  private static readonly ANSWER_ORDER = { answers: { position: 'ASC' } } as const;

  listQuestions(packId?: string, kind?: 'MAIN' | 'FINAL'): Promise<QuestionEntity[]> {
    const where: Record<string, unknown> = { isArchived: false };
    if (packId) where.packId = packId;
    if (kind) where.kind = kind;
    return this.questions.find({
      where,
      order: { sortOrder: 'ASC', createdAt: 'ASC', ...CatalogService.ANSWER_ORDER },
    });
  }

  async getQuestion(id: string): Promise<QuestionEntity> {
    const question = await this.questions.findOne({
      where: { id },
      order: CatalogService.ANSWER_ORDER,
    });
    if (!question) throw new NotFoundException('Nie ma takiego pytania');
    return question;
  }

  async createQuestion(dto: QuestionDto): Promise<QuestionEntity> {
    this.validateAnswers(dto.kind, dto.answers);
    const question = this.questions.create({
      packId: dto.packId,
      kind: dto.kind,
      text: dto.text.trim(),
      note: dto.note ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isArchived: dto.isArchived ?? false,
      answers: this.buildAnswers(dto.answers),
    });
    return this.questions.save(question);
  }

  async updateQuestion(id: string, dto: QuestionDto): Promise<QuestionEntity> {
    this.validateAnswers(dto.kind, dto.answers);
    const question = await this.getQuestion(id);
    await this.answers.delete({ questionId: id });

    Object.assign(question, {
      packId: dto.packId,
      kind: dto.kind,
      text: dto.text.trim(),
      note: dto.note ?? null,
      sortOrder: dto.sortOrder ?? question.sortOrder,
      isArchived: dto.isArchived ?? question.isArchived,
      answers: this.buildAnswers(dto.answers),
    });
    return this.questions.save(question);
  }

  async deleteQuestion(id: string): Promise<void> {
    await this.questions.delete(id);
  }

  /**
   * Import wklejonego bloku: pierwsza linia to pytanie, kolejne „odpowiedź<TAB>waga".
   * Wpisywanie 600 odpowiedzi ręcznie w formularzu to godziny, których nie ma.
   */
  parseImport(dto: ImportDto): QuestionDto {
    const lines = dto.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('Podaj pytanie i co najmniej jedną odpowiedź');

    const [questionText, ...answerLines] = lines;
    const answers: AnswerDto[] = answerLines.map((line) => {
      const match = line.match(/^(.*?)[\t;|]\s*(\d{1,3})$/) ?? line.match(/^(.*?)\s+(\d{1,3})$/);
      if (!match) throw new BadRequestException(`Nie rozumiem linii: „${line}" — oczekuję „odpowiedź<TAB>waga"`);
      const weight = Number(match[2]);
      if (weight < 1 || weight > 100) throw new BadRequestException(`Waga poza zakresem 1–100: „${line}"`);
      return { text: match[1].trim(), weight };
    });

    return { packId: dto.packId, kind: dto.kind, text: questionText, answers };
  }

  private buildAnswers(answers: AnswerDto[]): AnswerEntity[] {
    return answers
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .map((a, position) => this.answers.create({ text: a.text.trim(), weight: a.weight, position }));
  }

  /** Walidacja domenowa poza DB — w trakcie edycji formularz bywa chwilowo niekompletny. */
  private validateAnswers(kind: 'MAIN' | 'FINAL', answers: AnswerDto[]): void {
    if (kind === 'FINAL' && answers.length !== 10) {
      throw new BadRequestException('Pytanie finałowe musi mieć dokładnie 10 odpowiedzi');
    }
    if (kind === 'MAIN' && (answers.length < 3 || answers.length > 10)) {
      throw new BadRequestException('Pytanie rundy głównej ma od 3 do 10 odpowiedzi');
    }
    const texts = new Set(answers.map((a) => a.text.trim().toLowerCase()));
    if (texts.size !== answers.length) throw new BadRequestException('Odpowiedzi nie mogą się powtarzać');
  }
}
