import { Injectable } from '@nestjs/common';
import { PresenceEntry, Uuid } from '@cue/shared';
import { ClockSyncService } from '../buzzer/clock-sync.service';

/**
 * Obecność telefonów — dane ulotne, świadomie poza stanem gry i poza logiem undo.
 * Admin widzi z nich kropki przy drużynach i wie, czy warto otwierać wyścig.
 */
@Injectable()
export class PresenceService {
  private readonly online = new Map<Uuid, { socketId: string; lastSeenAt: number }>();

  constructor(private readonly clocks: ClockSyncService) {}

  connect(teamId: Uuid, socketId: string): void {
    this.online.set(teamId, { socketId, lastSeenAt: Date.now() });
  }

  disconnect(teamId: Uuid, socketId: string): void {
    const entry = this.online.get(teamId);
    // Rozłączenie starego socketu po eksmisji nie może zgasić nowego połączenia.
    if (entry && entry.socketId === socketId) this.online.delete(teamId);
  }

  touch(teamId: Uuid): void {
    const entry = this.online.get(teamId);
    if (entry) entry.lastSeenAt = Date.now();
  }

  socketOf(teamId: Uuid): string | undefined {
    return this.online.get(teamId)?.socketId;
  }

  isConnected(teamId: Uuid): boolean {
    return this.online.has(teamId);
  }

  snapshot(teamIds: Uuid[]): Map<Uuid, PresenceEntry> {
    const map = new Map<Uuid, PresenceEntry>();
    for (const teamId of teamIds) {
      const entry = this.online.get(teamId);
      const clock = this.clocks.get(teamId);
      map.set(teamId, {
        teamId,
        connected: Boolean(entry),
        rttMs: clock?.rttMs ?? null,
        clockOffsetMs: clock?.offsetMs ?? null,
        clockStdDevMs: clock?.stdDevMs ?? null,
        lastSeenAt: entry?.lastSeenAt ?? null,
      });
    }
    return map;
  }
}
