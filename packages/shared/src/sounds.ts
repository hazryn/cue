/**
 * Klucze dźwięków = nazwy plików w frontend/public/audio/<key>.mp3.
 * Brakujący plik jest cicho ignorowany — gra działa bez ani jednego mp3.
 */
export const SOUNDS = [
  // ramy gry
  'theme_intro',
  // muzyka w lobby, gdy drużyny dołączają — nagranie, nie synteza
  'lobby_music',
  'game_start',
  'question_reveal',
  'transition',
  // wyścig
  'race_open',
  // odliczanie 3-2-1 przed odblokowaniem grzybków przy przejęciu (raz na cyfrę)
  'countdown_tick',
  'buzz',
  'buzz_win',
  'tiebreak',
  // runda główna
  'hit',
  'hit_top',
  'strike_1',
  'strike_2',
  'strike_3',
  'already_revealed',
  'board_clear',
  'steal_open',
  'steal_win',
  'steal_fail',
  'pool_award',
  'pool_lost',
  'reveal_single',
  'timeout',
  // podsumowanie
  'scores',
  'leaderboard',
  'winner',
  // finał
  'final_intro',
  'final_timer_start',
  'final_tick',
  // UWAGA: final_ok brzmi tak samo dla trafienia i błędu — inaczej gracz 2
  // wiedziałby po dźwięku, czy trafił. Dlatego `final_miss` nie istnieje.
  'final_ok',
  'final_pass',
  'final_time_up',
  'duplicate_buzz',
  'final_reveal',
  'final_reveal_zero',
  'final_win',
  // nagranie (nie synteza) grane przy nagrodzie głównej zamiast final_win — ok. 2 min, raz
  'final_fanfare',
  'final_lose',
  // admin (lokalnie, nie na TV)
  'error',
  'undo',
] as const;

export type SoundKey = (typeof SOUNDS)[number];

/** Dźwięki zapętlone — grane do zmiany fazy, nie jednorazowo. */
export const LOOPING_SOUNDS: SoundKey[] = ['theme_intro', 'lobby_music', 'final_tick'];

/**
 * Długie nagrania grane raz, ale jak muzyka w tle: zajmują miejsce pętli, więc
 * kolejna muzyka (np. lobby nowej gry) albo stopLoop je wycisza.
 */
export const BACKGROUND_SOUNDS: SoundKey[] = ['final_fanfare'];
