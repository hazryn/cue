/** Waga = ilu „ze stu ankietowanych" podało tę odpowiedź. Suma bliska 100. */
export type SeedAnswer = [text: string, weight: number];

export interface SeedQuestion {
  text: string;
  note?: string;
  answers: SeedAnswer[];
}

export interface SeedPack {
  name: string;
  description: string;
  color: string;
  main: SeedQuestion[];
  /** Pytania finałowe mają dokładnie po 10 odpowiedzi */
  final: SeedQuestion[];
}
