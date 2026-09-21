import { RacePressView } from '@cue/shared';

export interface PressRecord {
  teamId: string;
  teamName: string;
  clientTs: number;
  offsetMs: number;
  rttMs: number;
  serverRecvMs: number;
  /** clientTs + offsetMs — wspólna oś czasu; przy braku zaufania do zegara = serverRecvMs */
  adjustedMs: number;
  rejectedReason: string | null;
}

export interface RaceOutcome {
  winnerTeamId: string | null;
  tiedTeamIds: string[];
  presses: RacePressView[];
}

export interface ResolveStrategy {
  resolve(presses: PressRecord[], tiebreakThresholdMs: number): RaceOutcome;
}

export function toView(presses: PressRecord[], base: number): RacePressView[] {
  return presses
    .slice()
    .sort((a, b) => a.adjustedMs - b.adjustedMs)
    .map((p) => ({
      teamId: p.teamId,
      teamName: p.teamName,
      adjustedMs: p.adjustedMs,
      serverRecvMs: p.serverRecvMs,
      rttMs: p.rttMs,
      deltaMs: p.adjustedMs - base,
      rejectedReason: p.rejectedReason,
    }));
}
