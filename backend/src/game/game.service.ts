import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Ack,
  ErrCode,
  EVENT_LABELS,
  FrozenQuestion,
  GameEvent,
  GameEventType,
  GamePhase,
  GameState,
  SoundKey,
  UndoEntry,
  Uuid,
} from '@cue/shared';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { QuestionEntity } from '../catalog/entities/question.entity';
import { BuzzerService } from '../buzzer/buzzer.service';
import { BroadcastService, PublishInput } from '../realtime/broadcast.service';
import { GameEventEntity } from './entities/game-event.entity';
import { GameEntity } from './entities/game.entity';
import { TeamEntity } from './entities/team.entity';
import { canApply } from './engine/guards';
import { reduce, replay } from './engine/reducer';
import { initialState, nextColor, slugifyTeamName } from './engine/state';

export class GameActionError extends Error {
  constructor(
    readonly code: ErrCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ApplyResult {
  seq: number;
  state: GameState;
  sounds: SoundKey[];
}

const UNDO_STACK_SIZE = 10;

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  private raceTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly buzzer: BuzzerService,
    private readonly broadcast: BroadcastService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Buzzer nie zna GameService — oddaje wynik wyścigu tędy, żeby uniknąć
    // zależności cyklicznej (Game → Buzzer → Game).
    this.buzzer.onRaceResolved(async (result) => {
      try {
        await this.apply({
          type: 'RACE_RESOLVED',
          at: Date.now(),
          actor: 'system',
          payload: {
            raceId: result.raceId,
            winnerTeamId: result.winnerTeamId,
            tiedTeamIds: result.tiedTeamIds,
          },
        });
        this.broadcast.raceResult(result);
      } catch (error) {
        this.logger.error(`Nie udało się zapisać wyniku wyścigu: ${String(error)}`);
      }
    });
    void this.recoverAfterRestart();
  }

  // ------------------------------------------------------------- odczyt

  async currentGame(manager?: EntityManager): Promise<GameEntity | null> {
    const repo = (manager ?? this.dataSource.manager).getRepository(GameEntity);
    return repo.findOne({ where: { isActive: true } });
  }

  async requireGame(manager?: EntityManager): Promise<GameEntity> {
    const game = await this.currentGame(manager);
    if (!game) throw new NotFoundException('Nie ma aktywnej gry');
    return game;
  }

  async undoStack(gameId: Uuid, manager?: EntityManager): Promise<UndoEntry[]> {
    const repo = (manager ?? this.dataSource.manager).getRepository(GameEventEntity);
    const rows = await repo.find({ where: { gameId }, order: { seq: 'DESC' }, take: UNDO_STACK_SIZE });
    return rows.map((row) => ({
      seq: row.seq,
      type: row.type,
      actor: row.actor,
      label: EVENT_LABELS[row.type as GameEventType] ?? row.type,
      at: Number(row.eventAt),
    }));
  }

  // -------------------------------------------------------- tworzenie gry

  /** Nowa gra: dezaktywuje poprzednią i zamraża kopie wszystkich wybranych pytań. */
  async createGame(packIds: Uuid[] | null): Promise<GameEntity> {
    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(GameEntity).update({ isActive: true }, { isActive: false });

      const questions = await this.loadQuestions(manager, packIds);
      const state = initialState();
      for (const q of questions) state.questions[q.id] = q;

      const mainIds = questions.filter((q) => q.kind === 'MAIN').map((q) => q.id);
      const finalIds = questions.filter((q) => q.kind === 'FINAL').map((q) => q.id);

      const game = manager.getRepository(GameEntity).create({
        code: this.generateCode(),
        phase: GamePhase.LOBBY,
        state,
        lastSeq: 0,
        isActive: true,
        finalQuestionIds: finalIds,
        spareQuestionIds: mainIds,
      });
      return manager.getRepository(GameEntity).save(game);
    });
  }

  private async loadQuestions(manager: EntityManager, packIds: Uuid[] | null): Promise<FrozenQuestion[]> {
    const qb = manager
      .getRepository(QuestionEntity)
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.answers', 'a')
      .where('q.is_archived = false');
    if (packIds?.length) qb.andWhere('q.pack_id IN (:...packIds)', { packIds });

    const rows = await qb.orderBy('q.sort_order', 'ASC').addOrderBy('a.position', 'ASC').getMany();
    return rows.map(freezeQuestion);
  }

  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  }

  // ----------------------------------------------------------- akcje gry

  /**
   * Jedyna droga do zmiany stanu.
   *
   * SELECT ... FOR UPDATE serializuje akcje na wierszu gry — przy jednej grze
   * i dziesięciu klientach kosztuje nic, a wyklucza wyścig „admin kliknął HIT
   * i MISS w tej samej milisekundzie".
   */
  async apply(event: GameEvent, expectedSeq?: number): Promise<ApplyResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const game = await manager
        .getRepository(GameEntity)
        .createQueryBuilder('g')
        .setLock('pessimistic_write')
        .where('g.is_active = true')
        .getOne();
      if (!game) throw new GameActionError('NO_GAME', 'Nie ma aktywnej gry');

      if (expectedSeq !== undefined && expectedSeq !== game.lastSeq) {
        throw new GameActionError('CONFLICT', 'Stan gry zmienił się w międzyczasie — odśwież widok');
      }

      const verdict = canApply(game.state, event);
      if (!verdict.ok) throw new GameActionError(verdict.code, verdict.error);

      const { state, sounds } = reduce(game.state, event);
      const seq = game.lastSeq + 1;

      const eventRepo = manager.getRepository(GameEventEntity);
      await eventRepo.save(
        eventRepo.create({
          gameId: game.id,
          seq,
          type: event.type,
          actor: event.actor,
          actorId: event.actorId ?? null,
          payload: event.payload as Record<string, unknown>,
          eventAt: String(event.at),
          phaseBefore: game.state.phase,
        }),
      );

      await manager.getRepository(GameEntity).update(game.id, {
        state,
        phase: state.phase,
        lastSeq: seq,
      });
      await this.syncTeamScores(manager, game.id, state);

      return { gameId: game.id, seq, state, sounds };
    });

    await this.afterChange(result.gameId, result.state, result.seq, result.sounds);
    return { seq: result.seq, state: result.state, sounds: result.sounds };
  }

  /**
   * Cofnięcie ostatniej akcji: usuwamy wpis i przeliczamy stan od zera.
   * Bez undo pierwsza pomyłka admina psuje wieczór, więc to nie jest luksus.
   */
  async undo(expectedSeq: number): Promise<ApplyResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const game = await manager
        .getRepository(GameEntity)
        .createQueryBuilder('g')
        .setLock('pessimistic_write')
        .where('g.is_active = true')
        .getOne();
      if (!game) throw new GameActionError('NO_GAME', 'Nie ma aktywnej gry');
      if (game.lastSeq === 0) throw new GameActionError('BAD_STATE', 'Nie ma czego cofać');
      if (expectedSeq !== game.lastSeq) {
        throw new GameActionError('CONFLICT', 'Ktoś zdążył wykonać nowszą akcję — odśwież widok');
      }

      const repo = manager.getRepository(GameEventEntity);
      await repo.delete({ gameId: game.id, seq: game.lastSeq });

      const rows = await repo.find({ where: { gameId: game.id }, order: { seq: 'ASC' } });
      const events = rows.map(toGameEvent);
      const seed = this.seedState(game);
      const state = replay(seed, events);
      const seq = rows.length ? rows[rows.length - 1].seq : 0;

      await manager.getRepository(GameEntity).update(game.id, { state, phase: state.phase, lastSeq: seq });
      await this.syncTeamScores(manager, game.id, state);
      return { gameId: game.id, seq, state };
    });

    this.buzzer.invalidateAll();
    await this.afterChange(result.gameId, result.state, result.seq, ['undo']);
    return { seq: result.seq, state: result.state, sounds: ['undo'] };
  }

  /** Stan początkowy do replayu: konfiguracja i zamrożone pytania, bez rozgrywki. */
  private seedState(game: GameEntity): GameState {
    const seed = initialState(game.state.config);
    seed.questions = game.state.questions;
    return seed;
  }

  private async syncTeamScores(manager: EntityManager, gameId: Uuid, state: GameState): Promise<void> {
    for (const team of state.teams) {
      await manager
        .getRepository(TeamEntity)
        .update({ id: team.id, gameId }, { score: team.score, isRemoved: team.removed, name: team.name });
    }
  }

  private async afterChange(gameId: Uuid, state: GameState, seq: number, sounds: SoundKey[]): Promise<void> {
    this.broadcast.publish(await this.publishInput({ gameId, state, seq, sounds }));
    this.scheduleTimers(state);
  }

  /**
   * Wyścig, w którym nikt nie nacisnął grzybka, zamykamy sami — inaczej stan
   * gry stałby w miejscu i prowadzący musiałby ratować to ręcznie.
   *
   * Timer żyje w pamięci procesu i jest odtwarzany po każdej zmianie stanu,
   * więc restart serwera go odbudowuje (patrz recoverAfterRestart).
   */
  private scheduleTimers(state: GameState): void {
    if (this.raceTimer) clearTimeout(this.raceTimer);
    this.raceTimer = null;
    const race = state.question?.race;
    if (race) {
      const raceId = race.id;
      this.raceTimer = setTimeout(
        () =>
          void this.applyQuietly({
            type: 'RACE_TIMEOUT',
            at: Date.now(),
            actor: 'system',
            payload: { raceId },
          }),
        Math.max(0, race.openedAt + state.config.raceTimeoutMs - Date.now()),
      );
      this.raceTimer.unref();
    }
  }

  /** Zdarzenie systemowe: stan mógł się w międzyczasie zmienić i to nie jest błąd. */
  private async applyQuietly(event: GameEvent): Promise<void> {
    try {
      await this.apply(event);
    } catch (error) {
      if (!(error instanceof GameActionError)) {
        this.logger.error(`Zdarzenie systemowe ${event.type} nie przeszło: ${String(error)}`);
      }
    }
  }

  /**
   * Materiał do projekcji — także dla klienta, który dopiero się podłączył
   * (po restarcie serwera nie ma żadnego wcześniejszego broadcastu do powtórzenia).
   */
  async publishInput(override?: {
    gameId: Uuid;
    state: GameState;
    seq: number;
    sounds: SoundKey[];
  }): Promise<PublishInput> {
    let base = override;
    if (!base) {
      const game = await this.requireGame();
      base = { gameId: game.id, state: game.state, seq: game.lastSeq, sounds: [] };
    }
    const game = await this.dataSource.getRepository(GameEntity).findOne({ where: { id: base.gameId } });
    return {
      ...base,
      undoStack: await this.undoStack(base.gameId),
      joinUrl: `${this.config.get<string>('publicUrl')}/play`,
      spareQuestions: game ? this.spareCount(game) : 0,
    };
  }

  /**
   * Podmiana pytania przed pierwszym trafieniem. Zamrożone kopie wszystkich pytań
   * z wybranych pakietów siedzą już w stanie gry, więc zapasowe znajdujemy bez
   * dotykania katalogu — i bez ryzyka, że ktoś je właśnie edytuje w panelu.
   */
  async prepareSkipPayload(): Promise<{ replacementQuestionId: Uuid; question: FrozenQuestion }> {
    const game = await this.requireGame();
    const used = new Set(game.state.questionOrder);
    const candidateId = game.spareQuestionIds.find(
      (id) => !used.has(id) && game.state.questions[id]?.kind === 'MAIN',
    );
    if (!candidateId) throw new GameActionError('NOT_FOUND', 'Skończyły się zapasowe pytania w wybranych pakietach');
    return { replacementQuestionId: candidateId, question: game.state.questions[candidateId] };
  }

  /**
   * Treści pytań finałowych pobrane wprost z katalogu. Prowadzący wybiera je
   * z całej biblioteki, także spoza pakietów rundy głównej, więc nie można
   * polegać na kopiach zamrożonych przy zakładaniu gry.
   */
  async freezeQuestions(questionIds: Uuid[]): Promise<FrozenQuestion[]> {
    if (questionIds.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(QuestionEntity)
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.answers', 'a')
      .where('q.id IN (:...ids)', { ids: questionIds })
      .orderBy('a.position', 'ASC')
      .getMany();
    return rows.map(freezeQuestion);
  }

  /** Ile pytań z wybranych pakietów zostało jeszcze nietkniętych. */
  private spareCount(game: GameEntity): number {
    const used = new Set(game.state.questionOrder);
    return game.spareQuestionIds.filter((id) => !used.has(id) && game.state.questions[id]?.kind === 'MAIN').length;
  }

  // ------------------------------------------------------ dołączanie gracza

  /**
   * Dołączenie drużyny albo powrót po reconnekcie. deviceToken to capability:
   * kto go ma, ten jest tą drużyną — przy trzech parach w salonie to wystarczy.
   */
  async joinTeam(
    deviceToken: string | undefined,
    teamName: string | undefined,
  ): Promise<{ teamId: Uuid; deviceToken: string; state: GameState; seq: number }> {
    const game = await this.requireGame();

    if (deviceToken) {
      const existing = await this.dataSource
        .getRepository(TeamEntity)
        .findOne({ where: { deviceToken, gameId: game.id, isRemoved: false } });
      if (existing) {
        return { teamId: existing.id, deviceToken, state: game.state, seq: game.lastSeq };
      }
    }

    const name = (teamName ?? '').trim();
    if (!name) throw new GameActionError('VALIDATION', 'Podaj nazwę drużyny');

    const teamId = randomUUID();
    const token = deviceToken ?? randomUUID();
    const color = nextColor(game.state);
    const teams = this.dataSource.getRepository(TeamEntity);

    // Najpierw wiersz w bazie: to ona rozstrzyga kolizje nazw i tokenów.
    try {
      await teams.insert({
        id: teamId,
        gameId: game.id,
        name,
        slug: slugifyTeamName(name),
        color,
        score: 0,
        deviceToken: token,
        isRemoved: false,
      });
    } catch (error) {
      throw toJoinError(error);
    }

    try {
      const result = await this.apply({
        type: 'TEAM_JOIN',
        at: Date.now(),
        actor: 'player',
        actorId: teamId,
        payload: { teamId, name, color },
      });
      return { teamId, deviceToken: token, state: result.state, seq: result.seq };
    } catch (error) {
      // Stan gry nie przyjął drużyny — nie zostawiamy po niej osieroconego wiersza,
      // bo przy kolejnej próbie blokowałby nazwę i token.
      await teams.delete({ id: teamId });
      throw error;
    }
  }

  async teamByToken(deviceToken: string): Promise<TeamEntity | null> {
    const game = await this.currentGame();
    if (!game) return null;
    return this.dataSource
      .getRepository(TeamEntity)
      .findOne({ where: { deviceToken, gameId: game.id, isRemoved: false } });
  }

  // ------------------------------------------------------- po restarcie

  /**
   * Otwarty wyścig nie przeżywa restartu — okno zbierania to timer w pamięci.
   * Nie próbujemy ratować 250 ms przez restart procesu; admin klika START raz jeszcze.
   */
  private async recoverAfterRestart(): Promise<void> {
    const game = await this.currentGame();
    if (!game) return;

    const state = game.state;
    let changed = false;

    if (state.question?.race) {
      state.question.race = null;
      state.question.fsm = state.question.triedTeamIds.length > 0 ? 'Q_STEAL_RACE_OPEN' : 'Q_IDLE';
      changed = true;
      this.logger.warn('Otwarty wyścig unieważniony po restarcie — admin uruchamia go ponownie');
    }

    if (changed) {
      await this.dataSource.getRepository(GameEntity).update(game.id, { state, phase: state.phase });
    }
    this.scheduleTimers(state);
  }

  ack(error: unknown): Ack {
    if (error instanceof GameActionError) return { ok: false, code: error.code, error: error.message };
    if (error instanceof BadRequestException) return { ok: false, code: 'VALIDATION', error: error.message };
    return { ok: false, code: 'INTERNAL', error: 'Błąd serwera' };
  }
}

/**
 * Naruszenie unikalności zamieniamy na komunikat, który coś mówi graczowi
 * stojącemu z telefonem — zamiast nazwy indeksu z Postgresa.
 */
function toJoinError(error: unknown): GameActionError {
  const detail = error as { code?: string; constraint?: string; message?: string };
  if (detail?.code !== '23505') {
    return error instanceof GameActionError
      ? error
      : new GameActionError('INTERNAL', 'Nie udało się dołączyć do gry');
  }
  const constraint = detail.constraint ?? detail.message ?? '';
  if (constraint.includes('token')) {
    return new GameActionError('CONFLICT', 'To urządzenie jest już przypisane do drużyny w tej grze');
  }
  return new GameActionError('NAME_TAKEN', 'Taka drużyna już gra');
}

export function freezeQuestion(row: QuestionEntity): FrozenQuestion {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    note: row.note,
    answers: (row.answers ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ id: a.id, text: a.text, weight: a.weight, position: a.position })),
  };
}

export function toGameEvent(row: GameEventEntity): GameEvent {
  return {
    type: row.type,
    at: Number(row.eventAt),
    actor: row.actor,
    actorId: row.actorId ?? undefined,
    payload: row.payload,
  } as GameEvent;
}
