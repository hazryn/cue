import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrCode, GameState, RaceResultView, Uuid } from '@cue/shared';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ClockSyncService } from './clock-sync.service';
import { BuzzPressEntity } from './entities/buzz-press.entity';
import { BuzzRaceEntity } from './entities/buzz-race.entity';
import { raceArmsAt } from '../game/engine/state';
import { OffsetCorrectedStrategy } from './strategies/offset-corrected.strategy';
import { PressRecord } from './strategies/resolve-strategy';

export interface BuzzInput {
  teamId: Uuid;
  teamName: string;
  raceId: string;
  clientTs: number;
  offsetMs: number;
  rttMs: number;
}

export interface BuzzRejected {
  ok: false;
  code: ErrCode;
  error: string;
}

interface OpenRace {
  raceId: string;
  rowId: Uuid;
  gameId: Uuid;
  kind: string;
  eligible: Uuid[];
  openedAt: number;
  /** Od kiedy naciśnięcie się liczy; wcześniej falstart (odliczanie przy przejęciu) */
  armsAt: number;
  presses: PressRecord[];
  timer: NodeJS.Timeout | null;
  windowMs: number;
  tiebreakThresholdMs: number;
  lockoutMs: number;
}

export type RaceResolvedHandler = (result: RaceResultView) => void | Promise<void>;

/**
 * Rozstrzyganie wyścigów grzybkowych.
 *
 * Pierwsze poprawne naciśnięcie otwiera okno zbierania (domyślnie 250 ms).
 * Dopiero po jego upływie wyłaniamy zwycięzcę — dzięki temu telefon z gorszym
 * łączem nie przegrywa wyścigu, który wygrał palcem.
 *
 * Świadome ograniczenie: znacznik czasu pochodzi od klienta, więc to obrona
 * przed jitterem, nie przed oszustwem. Ktoś z otwartą konsolą wygra każdy wyścig.
 */
@Injectable()
export class BuzzerService {
  private readonly logger = new Logger(BuzzerService.name);
  private readonly races = new Map<string, OpenRace>();
  private readonly lockouts = new Map<string, number>();
  private handler: RaceResolvedHandler | null = null;

  constructor(
    private readonly clocks: ClockSyncService,
    private readonly strategy: OffsetCorrectedStrategy,
    @InjectRepository(BuzzRaceEntity) private readonly raceRepo: Repository<BuzzRaceEntity>,
    @InjectRepository(BuzzPressEntity) private readonly pressRepo: Repository<BuzzPressEntity>,
  ) {}

  onRaceResolved(handler: RaceResolvedHandler): void {
    this.handler = handler;
  }

  /** Dostraja bufory do stanu gry: otwiera nowy wyścig, zamyka nieaktualne. */
  async syncWithState(gameId: Uuid, state: GameState): Promise<void> {
    const race = state.question?.race ?? null;
    for (const [key, open] of this.races) {
      if (!race || open.raceId !== race.id) {
        if (open.timer) clearTimeout(open.timer);
        this.races.delete(key);
      }
    }
    if (!race || this.races.has(race.id)) return;

    const row = await this.raceRepo.save(
      this.raceRepo.create({
        id: randomUUID(),
        gameId,
        raceKey: race.id,
        questionIndex: state.qIndex,
        kind: race.kind,
        eligible: race.eligible,
        openedAt: String(race.openedAt),
      }),
    );

    this.races.set(race.id, {
      raceId: race.id,
      rowId: row.id,
      gameId,
      kind: race.kind,
      eligible: race.eligible,
      openedAt: race.openedAt,
      armsAt: raceArmsAt(race),
      presses: [],
      timer: null,
      windowMs: state.config.raceWindowMs,
      tiebreakThresholdMs: state.config.tiebreakThresholdMs,
      lockoutMs: state.config.falseStartLockoutMs,
    });
  }

  /** Naciśnięcie grzybka. Zwraca błąd tylko dla przypadków, o których gracz ma wiedzieć. */
  async press(input: BuzzInput, serverRecvMs = Date.now()): Promise<BuzzRejected | { ok: true }> {
    const race = this.races.get(input.raceId);
    if (!race) return { ok: false, code: 'RACE_CLOSED', error: 'Ten wyścig już się zakończył' };
    if (!race.eligible.includes(input.teamId)) {
      await this.savePress(race, input, serverRecvMs, input.clientTs + input.offsetMs, 'NOT_ELIGIBLE');
      return { ok: false, code: 'NOT_ELIGIBLE', error: 'Ta drużyna nie bierze udziału w tym wyścigu' };
    }
    if (race.presses.some((p) => p.teamId === input.teamId && p.rejectedReason === null)) {
      return { ok: false, code: 'ALREADY_PRESSED', error: 'Już nacisnęliście' };
    }

    const lockedUntil = this.lockouts.get(input.teamId) ?? 0;
    if (serverRecvMs < lockedUntil) {
      await this.savePress(race, input, serverRecvMs, input.clientTs + input.offsetMs, 'LOCKED_OUT');
      return { ok: false, code: 'FALSE_START', error: 'Falstart — grzybek chwilowo zablokowany' };
    }

    const { adjustedMs, rejectedReason } = this.normalize(input, race, serverRecvMs);
    await this.savePress(race, input, serverRecvMs, adjustedMs, rejectedReason);

    if (rejectedReason === 'FALSE_START') {
      this.lockouts.set(input.teamId, race.armsAt + race.lockoutMs);
      return { ok: false, code: 'FALSE_START', error: 'Za wcześnie — grzybek zablokowany na moment' };
    }

    race.presses.push({
      teamId: input.teamId,
      teamName: input.teamName,
      clientTs: input.clientTs,
      offsetMs: input.offsetMs,
      rttMs: input.rttMs,
      serverRecvMs,
      adjustedMs,
      rejectedReason,
    });

    // Pierwsze naciśnięcie otwiera okno — reszta ma szansę dobiec.
    if (!race.timer) {
      race.timer = setTimeout(() => void this.closeRace(race), race.windowMs);
    }
    return { ok: true };
  }

  /**
   * Przeliczenie znacznika klienta na oś serwera wraz z obroną przed bzdurami:
   * naciśnięcie sprzed otwarcia wyścigu to falstart, a znacznik „z przyszłości"
   * albo rozjechany o wielokrotność RTT oznacza zegar, któremu nie ufamy.
   */
  private normalize(
    input: BuzzInput,
    race: OpenRace,
    serverRecvMs: number,
  ): { adjustedMs: number; rejectedReason: string | null } {
    let adjusted = input.clientTs + input.offsetMs;

    if (adjusted > serverRecvMs) adjusted = serverRecvMs;
    if (serverRecvMs - adjusted > input.rttMs * 2 + 100) {
      this.logger.warn(`Nieufny zegar drużyny ${input.teamId} — używam czasu odbioru`);
      adjusted = serverRecvMs;
    }
    if (adjusted < race.armsAt) return { adjustedMs: adjusted, rejectedReason: 'FALSE_START' };
    return { adjustedMs: adjusted, rejectedReason: null };
  }

  private async closeRace(race: OpenRace): Promise<void> {
    this.races.delete(race.raceId);
    if (race.timer) clearTimeout(race.timer);

    const outcome = this.strategy.resolve(race.presses, race.tiebreakThresholdMs);
    await this.raceRepo.update(race.rowId, {
      resolvedAt: String(Date.now()),
      winnerTeamId: outcome.winnerTeamId,
    });

    await this.handler?.({
      raceId: race.raceId,
      kind: race.kind,
      winnerTeamId: outcome.winnerTeamId,
      tiedTeamIds: outcome.tiedTeamIds,
      presses: outcome.presses,
    });
  }

  private async savePress(
    race: OpenRace,
    input: BuzzInput,
    serverRecvMs: number,
    adjustedMs: number,
    rejectedReason: string | null,
  ): Promise<void> {
    await this.pressRepo.insert({
      raceId: race.rowId,
      teamId: input.teamId,
      clientTsMs: String(input.clientTs),
      clockOffsetMs: Math.round(input.offsetMs),
      serverRecvMs: String(serverRecvMs),
      adjustedMs: String(Math.round(adjustedMs)),
      rttMs: Math.round(input.rttMs),
      rejectedReason,
    });
  }

  hasPressed(teamId: Uuid, raceId: string | null): boolean {
    if (!raceId) return false;
    const race = this.races.get(raceId);
    return race?.presses.some((p) => p.teamId === teamId && p.rejectedReason === null) ?? false;
  }

  isLockedOut(teamId: Uuid, now = Date.now()): boolean {
    return (this.lockouts.get(teamId) ?? 0) > now;
  }

  clockReady(teamId: Uuid): boolean {
    return this.clocks.isReady(teamId);
  }

  /** Po undo bufory wyścigów tracą sens — stan gry mógł cofnąć się przed wyścig. */
  invalidateAll(): void {
    for (const race of this.races.values()) if (race.timer) clearTimeout(race.timer);
    this.races.clear();
    this.lockouts.clear();
  }

  async pressesForRace(raceRowId: Uuid): Promise<BuzzPressEntity[]> {
    return this.pressRepo.find({ where: { raceId: raceRowId } });
  }
}
