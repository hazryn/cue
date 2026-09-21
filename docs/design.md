Katalog jest pusty (tylko pusty `README.md`) — projektuję od zera, bez ograniczeń istniejącego kodu.

---

# CUE — dokument projektowy silnika gry

Stack ustalony. Poniżej: maszyna stanów, schemat DB, protokół WS, rozstrzygnięcie buzzera, autoryzacja, edge case'y, struktura kodu, plan etapów.

---

## 0. Krytyka reguł na wejściu — 6 rzeczy, które nie zadziałają przy stole

Zanim projekt, bo część poniższych wymusza decyzje w silniku:

1. **Finał: ukrywanie punktów nie wystarczy.** Wymóg mówi „punkty pozostają ukryte na TV do momentu odsłonięcia". Ale gracz 2 wraca do pokoju i patrzy na TV — jeśli TV pokazuje *treści* odpowiedzi gracza 1, gracz 2 ma gotowca. **TV w turze gracza 2 musi pokazywać wyłącznie puste sloty** (albo „✔ / ✘" bez tekstu). Odsłonięcie tekstu + punktów dopiero w fazie REVEAL. To jest twarda poprawka, nie opcja.
2. **Przejęcie przy 2 drużynach jest ślepe.** „Pudło → kolejny wyścig między pozostałymi drużynami" — przy 2 drużynach po nieudanym przejęciu nie ma kogo pytać. Ścieżka musi od razu skakać do `POOL_FORFEIT`. Przy 3 drużynach jest dokładnie jedna dodatkowa próba.
3. **„Zgarnia całą narosłą pulę" — czy odpowiedź przejmującego dolicza swoją wagę?** Nierozstrzygnięte. Rekomendacja: **tak, dolicza** (pula + waga trafionej odpowiedzi × mnożnik) — inaczej trafienie odpowiedzi o wadze 40 daje tyle samo co trafienie wagi 2, co jest antyintuicyjne przy stole.
4. **Duplikat w finale: „pytanie leci dalej" jest dwuznaczne.** Albo (a) gracz 2 próbuje ponownie na tym samym pytaniu, albo (b) pytanie przepada i przechodzimy do następnego. Rekomendacja: **(b)** — zgodne z oryginalną Familiadą, prostsze dla admina, zegar nie czeka. Slot dostaje flagę `DUPLICATE`, 0 pkt, w REVEAL brzęczy i pokazuje „duplikat".
5. **Brak mechanik wyrównujących + wyścig na każdym z 10 pytań = jedna drużyna może nie zagrać ani razu.** To jest akceptowalne tylko jeśli świadomie. Przy stole po 4 pytaniu bez podejścia para się wypina z gry. Sugeruję *opcjonalny* przełącznik w adminie (`config.lockoutWinner`): drużyna, która wygrała poprzedni wyścig, ma 150 ms opóźnienia startu w następnym. Domyślnie OFF, ale niech będzie w configu — koszt 5 linii, ratuje wieczór.
6. **25 s na 5 pytań w finale to ~5 s/pytanie łącznie z czytaniem pytania przez admina.** W oryginale to 20/25 s, ale pytania są krótkie i czytane wcześniej. Silnik musi mieć **pauzę zegara** (admin trzyma spację / przycisk PAUSE) — inaczej pierwsze zacięcie techniczne psuje finał bezpowrotnie.

Dodatkowo mniejsze braki, rozstrzygnięte w §6.

---

## 1. Maszyna stanów

### 1.1 Poziomy

Trzy zagnieżdżone poziomy, wszystkie persystowane:

- **Game FSM** — cały wieczór (lobby → runda główna → ranking → finał → koniec)
- **Question FSM** — pojedyncze pytanie rundy głównej (aktywne tylko w `MAIN_ROUND`)
- **Final FSM** — finał (aktywny tylko w `FINAL`)

Stan zapisany jako `game.phase` + `game.state` (JSONB z pełnym kontekstem — patrz §2).

### 1.2 Stany — Game FSM

| Stan | Opis | Co widzi TV |
|---|---|---|
| `LOBBY` | Gracze wpisują nazwy drużyn, admin wybiera pakiety | Lista drużyn + QR/URL do `/play` |
| `MAIN_ROUND` | Trwa runda główna (deleguje do Question FSM) | Plansza pytania |
| `ROUND_SUMMARY` | Między pytaniami — tabela wyników, admin klika „następne" | Ranking |
| `LEADERBOARD` | Po 10 pytaniach, wyróżniony zwycięzca | Podium |
| `FINAL` | Trwa finał (deleguje do Final FSM) | Plansza finału |
| `FINISHED` | Koniec wieczoru | Ekran końcowy / nagroda |
| `ABORTED` | Admin przerwał grę | — |

### 1.3 Stany — Question FSM (wewnątrz `MAIN_ROUND`)

| Stan | Opis |
|---|---|
| `Q_IDLE` | Pytanie załadowane, plansza z pustymi slotami, wyścig zamknięty |
| `Q_RACE_OPEN` | Wyścig otwarty dla wszystkich aktywnych drużyn (start pytania) |
| `Q_RACE_RESOLVING` | Okno zbierania naciśnięć (~250 ms) — nikt już nie może wygrać nowo |
| `Q_CONTROL` | Drużyna-zwycięzca odpowiada ustnie, admin klika trafienie / błąd |
| `Q_STEAL_RACE_OPEN` | Wyścig przejęcia między drużynami jeszcze nieprzejmującymi |
| `Q_STEAL_RACE_RESOLVING` | Okno zbierania |
| `Q_STEAL_ATTEMPT` | Zwycięzca przejęcia ma JEDNĄ próbę |
| `Q_AWARD` | Pula przyznana — animacja, dogrywanie punktów |
| `Q_FORFEIT_REVEAL` | Wszyscy spudłowali, pula przepada, admin odsłania resztę pojedynczo |
| `Q_CLOSED` | Pytanie zamknięte, czeka na `NEXT_QUESTION` |

Uwaga: `Q_RACE_OPEN` może wystąpić także jako **dogrywka** (`raceKind: 'TIEBREAK'`) — patrz §4.4.

### 1.4 Stany — Final FSM (wewnątrz `FINAL`)

| Stan | Opis |
|---|---|
| `F_SETUP` | Admin wybiera 5 pytań finałowych i przypisuje gracza 1 / gracza 2 |
| `F_P1_READY` | Gracz 2 wyprowadzony z pokoju, admin czeka |
| `F_P1_RUNNING` | Zegar 25 s biegnie, admin klika odpowiedzi |
| `F_P1_PAUSED` | Zegar wstrzymany |
| `F_P1_DONE` | Tura 1 zamknięta (czas 0 lub admin zakończył) |
| `F_P2_READY` | Gracz 2 wraca, TV czyści planszę |
| `F_P2_RUNNING` | Zegar 30 s |
| `F_P2_PAUSED` | — |
| `F_P2_DONE` | — |
| `F_REVEAL` | Admin odsłania kolejno 10 slotów (5×P1, 5×P2), suma narasta |
| `F_RESULT` | Suma finalna, ≥200 → nagroda |

---

### 1.5 Tabela przejść — Game FSM

| Stan | Event | Warunek | Stan docelowy | Efekt uboczny |
|---|---|---|---|---|
| `LOBBY` | `TEAM_JOIN` | `teams < 3` | `LOBBY` | insert team, broadcast lobby |
| `LOBBY` | `TEAM_RENAME` | — | `LOBBY` | update |
| `LOBBY` | `TEAM_KICK` (admin) | — | `LOBBY` | soft-delete |
| `LOBBY` | `ADMIN_SET_PACKS` | — | `LOBBY` | zapis `game.questionOrder[]` |
| `LOBBY` | `ADMIN_START_GAME` | `2 ≤ teams ≤ 3` ∧ `questionOrder.length == 10` | `MAIN_ROUND` / `Q_IDLE` | load Q1, dźwięk `game_start` |
| `MAIN_ROUND` | (Question FSM `Q_CLOSED`) + `ADMIN_NEXT` | `qIndex < 9` | `ROUND_SUMMARY` | zapis wyniku pytania |
| `ROUND_SUMMARY` | `ADMIN_NEXT` | — | `MAIN_ROUND` / `Q_IDLE` | `qIndex++`, load pytania |
| `MAIN_ROUND` | `ADMIN_NEXT` | `qIndex == 9` | `LEADERBOARD` | dźwięk `leaderboard` |
| `LEADERBOARD` | `ADMIN_START_FINAL` | — | `FINAL` / `F_SETUP` | wybór drużyny-zwycięzcy |
| `LEADERBOARD` | `ADMIN_FINISH` | — | `FINISHED` | — |
| `FINAL` | (Final FSM `F_RESULT`) + `ADMIN_FINISH` | — | `FINISHED` | — |
| dowolny | `ADMIN_ABORT` | — | `ABORTED` | — |
| dowolny | `ADMIN_UNDO` | `events > 0` | (rekonstrukcja) | replay, patrz §2.4 |

### 1.6 Tabela przejść — Question FSM

`activeTeams` = drużyny w grze. `triedTeams` = zbiór drużyn, które już miały kontrolę lub próbę przejęcia.

| Stan | Event | Warunek | Stan docelowy | Efekt |
|---|---|---|---|---|
| `Q_IDLE` | `ADMIN_REVEAL_QUESTION` | — | `Q_IDLE` | TV pokazuje treść pytania, dźwięk `question_reveal` |
| `Q_IDLE` | `ADMIN_OPEN_RACE` | — | `Q_RACE_OPEN` | `raceId=uuid`, `raceOpenedAt`, dźwięk `race_open`, telefony wibrują |
| `Q_RACE_OPEN` | `BUZZ` | ważny (§4) | `Q_RACE_RESOLVING` | start okna 250 ms |
| `Q_RACE_OPEN` | `ADMIN_CANCEL_RACE` | — | `Q_IDLE` | unieważnia `raceId` |
| `Q_RACE_OPEN` | `TIMEOUT` (60 s, nikt nie kliknął) | — | `Q_IDLE` | dźwięk `timeout` |
| `Q_RACE_RESOLVING` | `BUZZ` | w oknie | `Q_RACE_RESOLVING` | dopisz do bufora |
| `Q_RACE_RESOLVING` | `RACE_WINDOW_ELAPSED` | 1 zwycięzca | `Q_CONTROL` | `controllingTeam`, `strikes=0`, dźwięk `buzz_win` |
| `Q_RACE_RESOLVING` | `RACE_WINDOW_ELAPSED` | remis <10 ms | `Q_RACE_OPEN` (`TIEBREAK`) | dźwięk `tiebreak` |
| `Q_CONTROL` | `ADMIN_HIT(answerId)` | slot nieodsłonięty | `Q_CONTROL` / `Q_AWARD` | reveal, `pool += weight*mult`, dźwięk `hit`; jeśli wszystkie odsłonięte → `Q_AWARD` |
| `Q_CONTROL` | `ADMIN_MISS` | `strikes < 2` | `Q_CONTROL` | `strikes++`, dźwięk `strike_1/2` |
| `Q_CONTROL` | `ADMIN_MISS` | `strikes == 2` | `Q_STEAL_RACE_OPEN` | `strikes=3`, `triedTeams += controlling`, dźwięk `strike_3` |
| `Q_CONTROL` | `ADMIN_PASS_TO_STEAL` | — | `Q_STEAL_RACE_OPEN` | ręczne wymuszenie (awaria) |
| `Q_STEAL_RACE_OPEN` | — | `activeTeams - triedTeams` pusty | `Q_FORFEIT_REVEAL` | auto-przejście, dźwięk `pool_lost` |
| `Q_STEAL_RACE_OPEN` | — | dokładnie 1 kandydat | `Q_STEAL_ATTEMPT` | auto, bez wyścigu (przypadek 2 drużyn) |
| `Q_STEAL_RACE_OPEN` | `BUZZ` | kandydat, ważny | `Q_STEAL_RACE_RESOLVING` | okno 250 ms |
| `Q_STEAL_RACE_RESOLVING` | `RACE_WINDOW_ELAPSED` | — | `Q_STEAL_ATTEMPT` | `stealingTeam` |
| `Q_STEAL_ATTEMPT` | `ADMIN_HIT(answerId)` | slot nieodsłonięty | `Q_AWARD` | reveal, `pool += weight*mult`, award do `stealingTeam`, dźwięk `steal_win` |
| `Q_STEAL_ATTEMPT` | `ADMIN_MISS` | — | `Q_STEAL_RACE_OPEN` | `triedTeams += stealing`, dźwięk `steal_fail` |
| `Q_AWARD` | `ADMIN_CONTINUE` | są nieodsłonięte sloty | `Q_FORFEIT_REVEAL` | (tryb „pokazowy", 0 pkt) |
| `Q_AWARD` | `ADMIN_CONTINUE` | wszystko odsłonięte | `Q_CLOSED` | — |
| `Q_FORFEIT_REVEAL` | `ADMIN_REVEAL_ONE(answerId)` | — | `Q_FORFEIT_REVEAL` / `Q_CLOSED` | reveal 1 slot, 0 pkt, dźwięk `reveal_single`; ostatni → `Q_CLOSED` |
| `Q_CLOSED` | `ADMIN_NEXT` | — | (Game FSM) | — |
| dowolny Q_* | `ADMIN_UNDO` | — | poprzedni | replay |

**Ważne domknięcie:** trafienie ostatniego wolnego slotu przez drużynę kontrolującą przy `strikes < 3` → `Q_AWARD` z pulą dla `controllingTeam`, **bez** fazy przejęcia. To jest przypadek, którego opis reguł nie pokrywał.

### 1.7 Tabela przejść — Final FSM

| Stan | Event | Warunek | Stan docelowy | Efekt |
|---|---|---|---|---|
| `F_SETUP` | `ADMIN_SET_FINAL_QUESTIONS` | 5 pytań | `F_SETUP` | zapis |
| `F_SETUP` | `ADMIN_SET_PLAYERS` | 2 imiona | `F_SETUP` | zapis |
| `F_SETUP` | `ADMIN_BEGIN_TURN(1)` | gotowe | `F_P1_READY` | TV: „Gracz 2 opuszcza pokój" |
| `F_P1_READY` | `ADMIN_START_TIMER` | — | `F_P1_RUNNING` | `deadlineAt = now + 25s`, dźwięk `final_timer_start` |
| `F_P1_RUNNING` | `ADMIN_HIT(qIdx, answerId)` | — | `F_P1_RUNNING` | slot=HIT (ukryty), dźwięk `final_ok`, `qIdx++` |
| `F_P1_RUNNING` | `ADMIN_MISS(qIdx)` | — | `F_P1_RUNNING` | slot=MISS, dźwięk `final_miss`, `qIdx++` |
| `F_P1_RUNNING` | `ADMIN_PASS(qIdx)` | — | `F_P1_RUNNING` | slot=PASS, dźwięk `final_pass`, `qIdx++` |
| `F_P1_RUNNING` | `ADMIN_PAUSE` | — | `F_P1_PAUSED` | zapisz `remainingMs` |
| `F_P1_PAUSED` | `ADMIN_RESUME` | — | `F_P1_RUNNING` | nowy `deadlineAt` |
| `F_P1_RUNNING` | `TIMER_EXPIRED` ∨ `qIdx == 5` | — | `F_P1_DONE` | dźwięk `final_time_up`; niewykorzystane pytania = `UNANSWERED` |
| `F_P1_DONE` | `ADMIN_RETURN_TO_PASSED` | są PASS-y | `F_P1_RUNNING` | wraca do pominiętych (jeśli czas został) |
| `F_P1_DONE` | `ADMIN_BEGIN_TURN(2)` | — | `F_P2_READY` | TV czyści planszę całkowicie |
| `F_P2_*` | analogicznie, 30 s | — | — | + detekcja duplikatu |
| `F_P2_RUNNING` | `ADMIN_HIT` | `answerId == p1.answers[qIdx]` | `F_P2_RUNNING` | slot=`DUPLICATE`, 0 pkt, dźwięk `duplicate_buzz`, `qIdx++` |
| `F_P2_DONE` | `ADMIN_BEGIN_REVEAL` | — | `F_REVEAL` | — |
| `F_REVEAL` | `ADMIN_REVEAL_NEXT` | — | `F_REVEAL` / `F_RESULT` | odsłania slot + punkty, `sum += pts`, dźwięk `final_reveal` |
| `F_RESULT` | — | `sum >= 200` | `F_RESULT` | dźwięk `final_win`, konfetti |
| `F_RESULT` | — | `sum < 200` | `F_RESULT` | dźwięk `final_lose` |

**Kolejność ujawniania w `F_REVEAL`:** rekomendacja — najpierw wszystkie 5 P1 (pytanie po pytaniu), potem 5 P2. Alternatywa (parami per pytanie) jest gorsza dramaturgicznie, bo duplikat wybrzmiewa od razu.

---

## 2. Schemat bazy

### 2.1 Rekomendacja: **stan agregatu w jednej tabeli + append-only event log** (hybryda)

**Rekomenduję hybrydę, nie czysty event sourcing i nie czysty state.** Źródłem prawdy do odczytu jest kolumna `game.state JSONB` — pełny, zdenormalizowany snapshot stanu, nadpisywany atomowo w tej samej transakcji co zapis eventu; to daje odtworzenie po restarcie jednym `SELECT` bez replayu i bez ryzyka, że projekcja się rozjedzie. Równolegle każdy event admina/gracza ląduje w `game_event` jako append-only log z rosnącym `seq` — i to on daje **undo** (usuwamy ostatni event i przeliczamy stan od `seq=0` przez czysty reduktor) oraz audyt „kto co kliknął o której". Czysty event sourcing byłby elegancki, ale przy 900-liniowym budżecie na piątek zmusza do pisania idealnie czystego reduktora od pierwszego dnia i debugowania go pod presją; czysty snapshot bez logu zabija undo, które przy grze prowadzonej ręcznie przez admina jest funkcją krytyczną, a nie luksusem. Koszt hybrydy to jeden invariant do pilnowania — „reduktor(events) == state" — i można go weryfikować asercją w devie po każdym zapisie.

Reduktor musi być **czystą funkcją bez I/O**: `reduce(state, event, questionData) → state`. Dane pytań (treści, wagi) czytamy raz przy `ADMIN_START_GAME` i **zamrażamy kopię do `game.state.questions`** — inaczej edycja pytania w CRUD-zie w trakcie gry rozjedzie replay.

### 2.2 Tabele

```sql
-- ========== KATALOG PYTAŃ (CRUD, niezależny od rozgrywki) ==========

CREATE TYPE question_kind AS ENUM ('MAIN', 'FINAL');

CREATE TABLE pack (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         varchar(120) NOT NULL,          -- 'klasyka rodzinna', '18+', ...
  description  text,
  color        varchar(16),                    -- do UI admina
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE question (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id      uuid NOT NULL REFERENCES pack(id) ON DELETE RESTRICT,
  kind         question_kind NOT NULL,
  text         text NOT NULL,
  note         text,                           -- notatka dla admina (np. akceptowalne synonimy)
  sort_order   int NOT NULL DEFAULT 0,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_pack_kind ON question(pack_id, kind) WHERE is_archived = false;

CREATE TABLE answer (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  text         varchar(120) NOT NULL,
  weight       smallint NOT NULL CHECK (weight BETWEEN 1 AND 100),
  position     smallint NOT NULL,              -- 0..9, kolejność na planszy
  aliases      text[] DEFAULT '{}',            -- podpowiedzi dla admina
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_answer_q_pos ON answer(question_id, position);
CREATE INDEX idx_answer_question ON answer(question_id);
```

Walidacja aplikacyjna (nie w DB, bo utrudnia edycję w trakcie): `MAIN` → 3–10 odpowiedzi; `FINAL` → dokładnie 10; suma wag ≤ 100 (ostrzeżenie, nie błąd — familiadowe ankiety rzadko sumują się do 100).

```sql
-- ========== ROZGRYWKA ==========

CREATE TYPE game_phase AS ENUM (
  'LOBBY','MAIN_ROUND','ROUND_SUMMARY','LEADERBOARD','FINAL','FINISHED','ABORTED'
);

CREATE TABLE game (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          varchar(8) NOT NULL UNIQUE,      -- np. 'CUE-7F3' , do URL /play?g=
  phase         game_phase NOT NULL DEFAULT 'LOBBY',
  state         jsonb NOT NULL,                  -- pełny snapshot (patrz 2.3)
  last_seq      int NOT NULL DEFAULT 0,          -- = max(game_event.seq)
  config        jsonb NOT NULL DEFAULT '{}',     -- raceWindowMs, mult, lockoutWinner, timers
  is_active     boolean NOT NULL DEFAULT true,   -- tylko jedna aktywna gra naraz
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_game_single_active ON game(is_active) WHERE is_active = true;
```

Ten partial unique index gwarantuje, że nigdy nie ma dwóch aktywnych gier — chroni przed „admin kliknął Nowa gra dwa razy".

```sql
CREATE TABLE team (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  name         varchar(40) NOT NULL,
  slug         varchar(40) NOT NULL,            -- lower+trim, do wykrywania kolizji
  color        varchar(16) NOT NULL,            -- przypisany automatycznie
  score        int NOT NULL DEFAULT 0,          -- zdenormalizowane, źródło = state
  device_token uuid NOT NULL,                   -- identyfikuje TELEFON drużyny
  is_removed   boolean NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_team_game_slug ON team(game_id, slug) WHERE is_removed = false;
CREATE UNIQUE INDEX idx_team_token ON team(device_token);
CREATE INDEX idx_team_game ON team(game_id);
```

```sql
CREATE TABLE game_event (
  id           bigserial PRIMARY KEY,
  game_id      uuid NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  seq          int NOT NULL,                    -- 1..N, ciągły
  type         varchar(48) NOT NULL,            -- 'ADMIN_HIT', 'BUZZ', ...
  actor        varchar(16) NOT NULL,            -- 'admin' | 'player' | 'system'
  actor_id     uuid,                            -- team.id dla player
  payload      jsonb NOT NULL DEFAULT '{}',
  phase_before game_phase NOT NULL,
  state_before jsonb,                           -- opcjonalnie, tylko dev/debug
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_event_game_seq ON game_event(game_id, seq);
CREATE INDEX idx_event_game_created ON game_event(game_id, created_at DESC);
```

Undo = `DELETE FROM game_event WHERE game_id=$1 AND seq=$2` (ostatni) + replay. `state_before` trzymam tylko w devie — w produkcji pusty, bo dubluje objętość.

```sql
-- ========== ZAPIS WYŚCIGÓW (audyt + debug buzzera) ==========

CREATE TABLE buzz_race (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  question_index smallint NOT NULL,
  kind           varchar(16) NOT NULL,          -- 'MAIN' | 'STEAL' | 'TIEBREAK'
  eligible       uuid[] NOT NULL,               -- team ids
  opened_at      timestamptz NOT NULL,
  resolved_at    timestamptz,
  winner_team_id uuid REFERENCES team(id),
  is_void        boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_race_game ON buzz_race(game_id, opened_at DESC);

CREATE TABLE buzz_press (
  id              bigserial PRIMARY KEY,
  race_id         uuid NOT NULL REFERENCES buzz_race(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES team(id),
  client_ts_ms    bigint NOT NULL,      -- performance.now()-owy znacznik klienta
  clock_offset_ms int NOT NULL,         -- estymowany offset klienta vs serwer
  server_recv_ms  bigint NOT NULL,      -- moment odbioru na serwerze
  adjusted_ms     bigint NOT NULL,      -- client_ts + offset → wspólna oś czasu
  rtt_ms          int NOT NULL,
  rejected_reason varchar(32)           -- 'FALSE_START','NOT_ELIGIBLE','RACE_CLOSED',NULL
);
CREATE INDEX idx_press_race ON buzz_press(race_id, adjusted_ms);
```

`buzz_press` nie jest potrzebny do odtworzenia stanu (wynik wyścigu jest w event logu), ale jest bezcenny, gdy o 22:30 ktoś krzyknie „ja byłem pierwszy" — pokazujesz na adminie dokładne ms.

```sql
-- ========== FINAŁ (zdenormalizowany widok; źródło = state) ==========

CREATE TABLE final_session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       uuid NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES team(id),
  question_ids  uuid[] NOT NULL,            -- 5 pytań, zamrożone
  player1_name  varchar(40) NOT NULL,
  player2_name  varchar(40) NOT NULL,
  total_score   int NOT NULL DEFAULT 0,
  won_prize     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_final_game ON final_session(game_id);
```

Rezultaty poszczególnych slotów finału żyją w `game.state.final.slots[]` — osobna tabela `final_answer` to nadmiar przy 10 slotach.

### 2.3 Kształt `game.state` (JSONB)

```ts
interface GameState {
  version: 1;
  phase: GamePhase;
  config: { raceWindowMs: number; mainTimeoutMs: number; multFromQuestion: number;
            mult: number; p1TimeMs: number; p2TimeMs: number; lockoutWinner: boolean };
  teams: Array<{ id: string; name: string; color: string; score: number;
                 connected: boolean; removed: boolean }>;
  questionOrder: string[];                  // 10 uuid
  questions: Record<string, FrozenQuestion>; // zamrożone kopie treści + wag
  qIndex: number;                            // 0..9
  question: QuestionState | null;
  final: FinalState | null;
  history: Array<{ qIndex: number; winnerTeamId: string|null; pool: number }>;
}

interface QuestionState {
  state: QuestionFsmState;
  questionId: string;
  multiplier: 1 | 2;
  slots: Array<{ answerId: string; revealed: boolean; revealedBy: string|null;
                 awarded: boolean }>;
  pool: number;                        // już przemnożona
  controllingTeamId: string | null;
  stealingTeamId: string | null;
  strikes: number;                     // 0..3, tylko drużyny kontrolującej
  triedTeamIds: string[];
  race: { id: string; kind: 'MAIN'|'STEAL'|'TIEBREAK'; eligible: string[];
          openedAt: number; closesAt: number|null } | null;
  awardedTo: string | null;
  forfeited: boolean;
}

interface FinalState {
  state: FinalFsmState;
  teamId: string;
  questionIds: string[];               // 5
  p1Name: string; p2Name: string;
  turn: 1 | 2 | null;
  qCursor: number;                     // 0..4 w bieżącej turze
  timer: { totalMs: number; remainingMs: number; deadlineAt: number|null;
           running: boolean };
  slots: Array<{                       // 10 = 5×P1 + 5×P2
    player: 1|2; qIdx: number;
    result: 'HIT'|'MISS'|'PASS'|'DUPLICATE'|'UNANSWERED';
    answerId: string | null; points: number;
    revealed: boolean;                 // odsłonięte w F_REVEAL
  }>;
  revealCursor: number;                // 0..9
  total: number;
}
```

### 2.4 Persystencja i undo — kontrakt

Każda akcja przechodzi przez `GameService.apply(event)`:

```
BEGIN
  SELECT ... FROM game WHERE id=$1 FOR UPDATE      -- serializacja akcji, kluczowe
  guard(state, event)                               -- walidacja przejścia FSM
  next = reduce(state, event)
  INSERT INTO game_event (seq = last_seq+1, ...)
  UPDATE game SET state=next, phase=next.phase, last_seq=last_seq+1, updated_at=now()
  UPDATE team SET score=... (denormalizacja)
COMMIT
→ broadcast do roomów
```

`FOR UPDATE` na wierszu `game` to jedyna potrzebna serializacja — przy jednej grze i ~10 klientach zero problemu z wydajnością, a eliminuje wyścigi typu „admin kliknął HIT i MISS w tym samym ms".

**Undo:** `DELETE` ostatniego eventu → `state = events.reduce(reducer, initialState(game))` → `UPDATE game`. Nie da się cofnąć eventów typu `BUZZ` w środku otwartego wyścigu (bo nie ma sensu); undo zawsze cofa **ostatnią akcję admina** i wszystkie następujące po niej eventy systemowe. Głębokość undo: nieograniczona technicznie, ale UI wystawia tylko „cofnij ostatnią" + listę 10 ostatnich akcji do wglądu.

---

## 3. Protokół WebSocket

### 3.1 Podział na namespace'y i roomy

Jeden serwer socket.io, **trzy namespace'y** (nie roomy) — bo różnią się autoryzacją:

| Namespace | Kto | Auth w handshake |
|---|---|---|
| `/tv` | ekran telewizora | brak (read-only) lub `tvToken` z ENV jeśli chcemy |
| `/admin` | telefon + komputer admina | `auth.token` = admin JWT/HMAC |
| `/play` | telefony drużyn | `auth.deviceToken` = uuid drużyny |

Roomy wewnątrz namespace'u: `game:{gameId}`. Dodatkowo w `/play` room `team:{teamId}` do wiadomości prywatnych (np. „twój buzz odrzucony — falstart").

Admin łączy się z `/admin` z **dwóch urządzeń** (komputer do CRUD-u i telefon do prowadzenia) — oba dostają identyczne eventy, oba mogą wysyłać akcje. To jest wymóg z opisu („admin na swoim telefonie klika") i działa out of the box, bo stan jest serwerowy.

### 3.2 Wspólne typy

```ts
type Uuid = string;
type Ms = number;

interface Envelope<T> { seq: number; ts: number; data: T; }
interface Ack { ok: true; seq: number } | { ok: false; error: string; code: ErrCode }
type ErrCode = 'BAD_STATE'|'UNAUTHORIZED'|'NOT_FOUND'|'VALIDATION'|'RACE_CLOSED'
             | 'FALSE_START'|'NOT_ELIGIBLE'|'ALREADY_REVEALED'|'GAME_FULL'|'NAME_TAKEN';
```

Każdy event client→server ma **ack callback** — klient wie, czy akcja przeszła. Każdy broadcast server→client niesie `seq` = `game.last_seq`, dzięki czemu klient wykrywa lukę i prosi o pełny snapshot.

### 3.3 client → server

**`/play`**

```ts
// dołączenie / reconnect
interface PlayJoinReq   { gameCode: string; deviceToken?: Uuid; teamName?: string }
interface PlayJoinRes   { teamId: Uuid; deviceToken: Uuid; snapshot: PlayerSnapshot }

interface RenameTeamReq { name: string }

// naciśnięcie grzybka
interface BuzzReq {
  raceId: Uuid;
  clientTs: Ms;        // performance.timeOrigin + performance.now(), zaokrąglone
  offsetMs: number;    // estymata z sync, patrz §4
  rttMs: number;
}

// synchronizacja zegara (wołane cyklicznie, 5× przy wejściu + co 10 s)
interface ClockSyncReq { t0: Ms }               // czas klienta przy wysyłce
interface ClockSyncRes { t0: Ms; t1: Ms }       // t1 = czas serwera przy odbiorze

// heartbeat obecności (poza socket.io ping) — do wskaźnika na adminie
interface PresencePingReq { battery?: number }
```

**`/admin`** — wszystkie z guardem (§5). `clientOpId: Uuid` w każdym payloadzie do idempotencji (podwójny tap na telefonie).

```ts
// katalog (REST-em też, ale WS dla live)
interface AdminSetPacksReq        { mainQuestionIds: Uuid[]; clientOpId: Uuid }   // 10
interface AdminStartGameReq       { clientOpId: Uuid }
interface AdminKickTeamReq        { teamId: Uuid; clientOpId: Uuid }
interface AdminRenameTeamReq      { teamId: Uuid; name: string; clientOpId: Uuid }

// runda główna
interface AdminRevealQuestionReq  { clientOpId: Uuid }
interface AdminOpenRaceReq        { kind: 'MAIN'|'STEAL'|'TIEBREAK'; clientOpId: Uuid }
interface AdminCancelRaceReq      { clientOpId: Uuid }
interface AdminHitReq             { answerId: Uuid; clientOpId: Uuid }
interface AdminMissReq            { clientOpId: Uuid }
interface AdminRevealOneReq       { answerId: Uuid; clientOpId: Uuid }
interface AdminForceControlReq    { teamId: Uuid; clientOpId: Uuid } // ratunkowe
interface AdminAdjustScoreReq     { teamId: Uuid; delta: number; reason: string;
                                    clientOpId: Uuid }              // ratunkowe
interface AdminContinueReq        { clientOpId: Uuid }
interface AdminNextQuestionReq    { clientOpId: Uuid }
interface AdminUndoReq            { expectedSeq: number; clientOpId: Uuid }

// finał
interface AdminSetupFinalReq      { teamId: Uuid; questionIds: Uuid[];
                                    p1Name: string; p2Name: string; clientOpId: Uuid }
interface AdminBeginTurnReq       { player: 1|2; clientOpId: Uuid }
interface AdminTimerReq           { action: 'START'|'PAUSE'|'RESUME'|'STOP';
                                    clientOpId: Uuid }
interface AdminFinalAnswerReq     { qIdx: number;
                                    result: 'HIT'|'MISS'|'PASS';
                                    answerId?: Uuid; clientOpId: Uuid }
interface AdminFinalRevealNextReq { clientOpId: Uuid }
interface AdminFinishReq          { clientOpId: Uuid }
interface AdminAbortReq           { clientOpId: Uuid }
```

**`/tv`**

```ts
interface TvHelloReq { gameCode: string }
interface TvAudioReadyReq {}    // po pierwszym kliknięciu użytkownika (autoplay policy!)
```

### 3.4 server → client

Zasada: **jeden event = jedna zmiana + pełny fragment stanu, którego dotyczy.** Nie wysyłam diffów — przy 10 klientach to zbędna komplikacja, a pełne fragmenty są odporne na zgubiony pakiet.

**wszystkie namespace'y**

```ts
'state:snapshot'   : Envelope<TvSnapshot | AdminSnapshot | PlayerSnapshot>
'state:patch'      : Envelope<{ phase: GamePhase; question?: QuestionPublic;
                                final?: FinalPublic; teams: TeamPublic[] }>
'error'            : { code: ErrCode; message: string }
```

**`/tv`** — eventy sterujące animacją i dźwiękiem; TV jest głupim rendererem.

```ts
'tv:lobby'          : Envelope<{ teams: TeamPublic[]; joinUrl: string; qrSvg: string }>
'tv:question:show'  : Envelope<{ index: number; total: 10; text: string;
                                 slotCount: number; multiplier: 1|2 }>
'tv:race:open'      : Envelope<{ raceId: Uuid; kind: RaceKind; eligible: Uuid[] }>
'tv:race:winner'    : Envelope<{ raceId: Uuid; teamId: Uuid; marginMs: number }>
'tv:answer:reveal'  : Envelope<{ position: number; text: string; weight: number;
                                 pool: number; byTeamId: Uuid|null; scoring: boolean }>
'tv:strike'         : Envelope<{ teamId: Uuid; count: 1|2|3 }>
'tv:pool:award'     : Envelope<{ teamId: Uuid; amount: number; newScore: number;
                                 viaSteal: boolean }>
'tv:pool:forfeit'   : Envelope<{ amount: number }>
'tv:scores'         : Envelope<{ teams: TeamPublic[] }>
'tv:leaderboard'    : Envelope<{ ranking: TeamPublic[]; winnerTeamId: Uuid }>

'tv:final:intro'    : Envelope<{ teamName: string; p1: string; p2: string }>
'tv:final:turn'     : Envelope<{ player: 1|2; totalMs: number }>
'tv:final:timer'    : Envelope<{ remainingMs: number; running: boolean;
                                 serverTs: number }>          // co 250 ms
'tv:final:slot'     : Envelope<{ player: 1|2; qIdx: number;
                                 status: 'FILLED'|'EMPTY' }>  // BEZ tekstu i punktów!
'tv:final:duplicate': Envelope<{ qIdx: number }>
'tv:final:reveal'   : Envelope<{ player: 1|2; qIdx: number; questionText: string;
                                 answerText: string|null; points: number;
                                 result: SlotResult; runningTotal: number }>
'tv:final:result'   : Envelope<{ total: number; won: boolean }>

'tv:sound'          : { key: SoundKey; volume?: number }   // patrz §8
'tv:reset'          : {}                                    // undo → przerysuj wszystko
```

**`/admin`**

```ts
'admin:snapshot'    : Envelope<AdminSnapshot>
'admin:teams'       : Envelope<{ teams: (TeamPublic & { connected: boolean;
                                  rttMs: number|null })[] }>
'admin:race:presses': Envelope<{ raceId: Uuid;
                                 presses: Array<{ teamId: Uuid; adjustedMs: number;
                                   deltaMs: number; rttMs: number;
                                   rejected: string|null }> }>
'admin:undo:stack'  : Envelope<{ entries: Array<{ seq: number; type: string;
                                  label: string; at: number }> }>
'admin:final:dupe'  : Envelope<{ qIdx: number; answerText: string }>
```

`AdminSnapshot` zawiera **wszystko**: pełne treści odpowiedzi z wagami (także nieodsłonięte), listę duplikatów w finale, stan zegara, stos undo. To jedyny klient z pełną wiedzą.

**`/play`**

```ts
'play:accepted'     : { teamId: Uuid; deviceToken: Uuid; name: string; color: string }
'play:buzzer'       : Envelope<{ armed: boolean; raceId: Uuid|null;
                                 reason: 'RACE_OPEN'|'NOT_ELIGIBLE'|'CLOSED'|'LOCKED' }>
'play:buzz:result'  : { raceId: Uuid; won: boolean; rank: number|null;
                        deltaMs: number|null; rejected?: ErrCode }
'play:status'       : Envelope<{ phase: GamePhase; yourScore: number;
                                 youControl: boolean; strikes: number;
                                 questionIndex: number }>
'play:vibrate'      : { pattern: number[] }
```

Telefon gracza jest celowo minimalny: nazwa drużyny, wynik, wielki przycisk, stan („czekaj / NACIŚNIJ / wygrałeś / odpowiadacie"). **Nie pokazuje treści pytania** — pytanie czyta admin na głos, a telefon w ręku podczas odpowiadania to pokusa do googlowania.

### 3.5 Snapshot po reconnect

Klient przy każdym `connect` (także po reconnectcie socket.io) wysyła `join` z `deviceToken`/`gameCode`. Serwer odpowiada **pełnym snapshotem**, nigdy diffem:

```ts
interface TvSnapshot {
  seq: number;
  phase: GamePhase;
  teams: TeamPublic[];                     // id, name, color, score, connected
  question: {
    index: number; total: number; text: string | null;  // null gdy jeszcze nieodsłonięte
    multiplier: 1|2;
    slots: Array<{ position: number; revealed: boolean;
                   text: string|null; weight: number|null }>;  // null gdy zakryte
    pool: number;
    controllingTeamId: Uuid|null; stealingTeamId: Uuid|null;
    strikes: number;
    race: { id: Uuid; kind: RaceKind; eligible: Uuid[] } | null;
    fsm: QuestionFsmState;
  } | null;
  final: {
    fsm: FinalFsmState; turn: 1|2|null;
    timer: { remainingMs: number; running: boolean; serverTs: number };
    slots: Array<{ player:1|2; qIdx:number; filled: boolean;
                   // poniższe TYLKO gdy revealed === true:
                   text?: string; points?: number; result?: SlotResult }>;
    total: number; revealCursor: number;
  } | null;
  ranking: TeamPublic[] | null;
}
```

Reguły snapshotu:

- **Redakcja per rola.** Ten sam `GameState` przechodzi przez `project(state, role)`. `/tv` i `/play` nigdy nie dostają tekstu nieodsłoniętej odpowiedzi ani punktów finału przed `revealed=true`. Jedyna ochrona przed „ktoś otworzył DevTools na TV" i, ważniejsze, przed podglądem przez gracza 2.
- **Zegar finału po reconnectcie.** Nie wysyłam `remainingMs` samodzielnie — wysyłam `{ remainingMs, running, serverTs }`, a TV liczy `remaining - (Date.now() - serverTs - offset)`. Autorytet zegara jest wyłącznie serwerowy; `deadlineAt` żyje w `game.state`, więc restart backendu w środku tury finału nie gubi czasu (odtwarzamy `remainingMs = deadlineAt - now`). To działa, bo timer to timestamp, nie `setInterval`.
- **Animacje po reconnectcie są pominięte.** Snapshot renderuje stan końcowy natychmiast (odsłonięte sloty bez animacji). Animacje odpalają tylko eventy przyrostowe. Bez tego TV po F5 odgrywa 10 minut animacji.
- **Brak dźwięków przy snapshot.** `tv:sound` nigdy nie leci w snapshotcie.
- **Wykrywanie luki:** klient trzyma `lastSeq`; jeśli przychodzi `Envelope.seq > lastSeq + 1`, woła `state:resync` i dostaje pełny snapshot.

---

## 4. Rozstrzygnięcie wyścigu buzzera

### 4.1 Problem

Trzy telefony na tym samym WiFi. Różnice, które mogą zdecydować o zwycięzcy:
- opóźnienie touch→JS event: 10–50 ms (różne telefony, różne przeglądarki, iOS vs Android)
- czas do wysłania pakietu (event loop, JS main thread zajęty animacją): 0–30 ms
- WiFi RTT: 5–60 ms, z jitterem ±40 ms przy obciążonym AP
- kolejkowanie w socket.io / Node event loop: 0–5 ms

Sumaryczny rozrzut 20–120 ms. Ludzka różnica refleksu przy „kto szybciej" to często 30–80 ms. **Czysta kolejność dotarcia do serwera jest więc w praktyce losowa w ~połowie przypadków.**

### 4.2 Rozwiązanie: znacznik klienta + estymacja offsetu + okno zbierania

**Krok 1 — synchronizacja zegara (NTP-lite).**
Telefon po połączeniu wykonuje 7 rund `clock:sync`:
```
klient: t0 = now()          → serwer
serwer: t1 = now()          → klient (echo t0 + t1)
klient: t2 = now()
rtt = t2 - t0
offset = t1 - (t0 + rtt/2)
```
Odrzucamy 3 próbki o najwyższym RTT, bierzemy **medianę offsetu z pozostałych 4** (mediana, nie średnia — odporna na jeden zły pakiet). Sync powtarzany co 20 s i **zawsze tuż przed otwarciem wyścigu** (serwer wysyła `clock:sync:request` razem z `play:buzzer{armed:false}` na 2 s przed startem). Trzymamy też `offsetStdDev` — jeśli > 15 ms, admin widzi ostrzeżenie „telefon X ma niestabilne połączenie".

**Krok 2 — pomiar naciśnięcia po stronie klienta.**
Handler na `pointerdown` (nie `click` — `click` czeka na `pointerup` i dodaje 50–300 ms):
```ts
el.addEventListener('pointerdown', e => {
  const clientTs = Math.round(performance.timeOrigin + e.timeStamp);
  socket.emit('buzz', { raceId, clientTs, offsetMs, rttMs });
}, { passive: true });
```
`e.timeStamp` zdarzenia pointer jest ustawiany przez przeglądarkę **w momencie zdarzenia wejściowego**, nie w momencie wykonania handlera — to eliminuje opóźnienie zajętego main threada. To jest kluczowy trik.

**Krok 3 — okno zbierania na serwerze.**
Pierwszy poprawny `buzz` w otwartym wyścigu uruchamia okno `raceWindowMs = 250`. Wszystkie `buzz` dla tego `raceId`, które dotrą w oknie, trafiają do bufora. Po upływie okna:
```
adjusted = clientTs + offsetMs        // przeliczenie na oś serwera
zwycięzca = argmin(adjusted)
```
Presses spoza okna → odrzucone (`RACE_CLOSED`), ale i tak zapisane do `buzz_press` dla audytu.

**Krok 4 — obrona przed falstartem i oszustwem.**
- `adjusted < race.openedAt` → `FALSE_START`, press odrzucony, drużyna dostaje **lockout 500 ms** liczony od `openedAt` (czyli spamowanie przyciskiem przed startem nie wygrywa).
- `adjusted > serverRecvMs` (niemożliwe fizycznie) → clamp do `serverRecvMs`, log podejrzenia.
- `serverRecvMs - adjusted > rttMs*2 + 100` → press odrzucony jako „zmanipulowany / rozjechany zegar", fallback do `serverRecvMs`.
- Przycisk na froncie jest `disabled` + wyszarzony dopóki nie przyjdzie `play:buzzer{armed:true}`; po naciśnięciu natychmiast się blokuje (jedno naciśnięcie na wyścig).

**Krok 5 — remis.**
Jeśli `|adjusted_1 - adjusted_2| < 10 ms` → to jest poniżej naszej dokładności. Uczciwie: **dogrywka** — nowy wyścig `kind:'TIEBREAK'` tylko między remisującymi, po 2 s odliczania i dźwięku. Admin ma też przycisk „przyznaj ręcznie drużynie X", gdyby dogrywka też zremisowała.

### 4.3 Wady tego rozwiązania — wprost

1. **Ufamy klientowi.** Ktokolwiek otworzy konsolę i wyśle `buzz` z `clientTs` z przeszłości, wygrywa każdy wyścig. Heurystyki z kroku 4 to zapory papierowe. Na imprezie dla 3 par to nieistotne, ale nazwijmy rzecz po imieniu: **to nie jest system odporny na oszustwo, tylko na jitter.**
2. **+250 ms do rozstrzygnięcia.** Między naciśnięciem a „BZZZ! wygrywa Zielonych" na TV mija ćwierć sekundy. Wyczuwalne. Można zejść do 150 ms kosztem ryzyka, że wolniejszy telefon nie zdąży. Rekomenduję 250 ms na start, konfigurowalne z panelu admina.
3. **Offset dryfuje.** Zegary telefonów chodzą z różną prędkością (rzędu ppm), ale `performance.now()` na zablokowanym/uśpionym telefonie może się zatrzymać lub przeskoczyć. Mitygacja: re-sync przed każdym wyścigiem + wykrywanie skoku (`|offset_new - offset_old| > 50 ms` → invalidate i wymuś nowy sync, telefon dostaje `armed:false` z reason `SYNCING`).
4. **Nie mierzymy opóźnienia sprzętowego ekranu.** iPhone raportuje `timeStamp` bliżej fizycznego dotknięcia niż tani Android z 120 ms touch latency. Tego się nie da skorygować bez kalibracji. **Rekomendacja organizacyjna: 3 identyczne/podobne telefony**, albo świadoma akceptacja.
5. **Okno 250 ms nie chroni przed telefonem, którego pakiet utknął na 400 ms.** Ten gracz przegrywa mimo wcześniejszego naciśnięcia. Mitygacja: admin widzi na swoim ekranie listę `admin:race:presses` z odrzuconymi i może kliknąć „przyznaj ręcznie".
6. **Złożoność vs. alternatywa.** Prosta wersja (kolejność dotarcia) to 20 linii. Ta to ~200 linii + sync + UI diagnostyczne. Jeśli piątek goni — **zaimplementuj najpierw kolejność dotarcia serwerowego (Etap 3), a korekcję offsetu dołóż w Etapie 6.** Interfejs `resolveRace(presses) → winner` pozwala podmienić strategię bez ruszania FSM.

### 4.4 Uprawnienia do wyścigu

`eligible` liczone przez FSM:
- `MAIN`: wszystkie nieusunięte drużyny (także rozłączone — patrz §6.9)
- `STEAL`: `activeTeams \ triedTeams`
- `TIEBREAK`: tylko remisujący z poprzedniego wyścigu

Buzz od drużyny spoza `eligible` → `NOT_ELIGIBLE`, zapis do `buzz_press`, brak efektu.

---

## 5. Autoryzacja admina

### 5.1 Model

Brak logowania użytkowników. Jeden sekret w ENV.

```
ADMIN_PASSWORD=...          # hasło wpisywane w /admin
ADMIN_TOKEN_SECRET=...      # sekret HMAC, min 32 bajty, generowany przy deployu
TV_TOKEN=...                # opcjonalny, prosty bearer dla /tv
```

**Flow:**
1. `POST /api/auth/admin { password }` — porównanie **timing-safe** (`crypto.timingSafeEqual` na hashach SHA-256 obu stron; gołe `===` na stringu to wyciek czasowy, tu nieistotny, ale kosztuje 2 linie).
2. Zwrot: `{ token }` gdzie token = JWT HS256, payload `{ role: 'admin', jti, iat, exp: iat + 24h }`, podpisany `ADMIN_TOKEN_SECRET`. JWT, nie losowy string w bazie — bo przeżywa restart backendu bez tabeli sesji.
3. Front zapisuje w `localStorage['cue.admin.token']`.
4. Rate limit na endpoint: 5 prób / 5 min / IP (`@nestjs/throttler`). Bez tego hasło „familiada2026" pada w 10 minut brute-forcem.

### 5.2 Zabezpieczenie WS

**Warstwa 1 — handshake.** `WsAdminGuard` na namespace `/admin`:
```ts
// socket.handshake.auth.token
const p = jwtService.verify(token, { secret: ADMIN_TOKEN_SECRET });
if (p.role !== 'admin') throw new WsException('UNAUTHORIZED');
socket.data.role = 'admin';
```
Weryfikacja w `@WebSocketGateway` przez `allowRequest` / middleware `io.of('/admin').use(...)` — odrzucenie **przed** `connection`, więc nieautoryzowany socket nigdy nie wchodzi do roomu.

**Warstwa 2 — per-event guard.** `@UseGuards(WsAdminGuard)` na całej klasie `AdminGateway` + sprawdzenie `socket.data.role === 'admin'` w interceptorze. Redundancja celowa: gdyby ktoś kiedyś dodał handler w złym namespace, guard go złapie.

**Warstwa 3 — brak wrażliwych eventów poza `/admin`.** Najważniejsze. `project(state, role)` (§3.5) gwarantuje, że nawet gdyby ktoś podłączył się do `/tv`, nie dostanie tekstów nieodsłoniętych odpowiedzi. **Bezpieczeństwo przez redakcję danych, nie przez ukrywanie eventów** — bo eventy i tak da się podsłuchać.

**Warstwa 4 — gracze.** `deviceToken` (uuid v4) wydawany przy `PlayJoinReq`, zapisany w `localStorage['cue.play.token']`. Reconnect = `deviceToken` → ta sama drużyna. Guard na `/play` sprawdza istnienie `team` z tym tokenem w aktywnej grze. Token to capability — kto go ma, jest tą drużyną. Przy 3 parach w salonie wystarczy; nie ma sensu dokładać nic więcej.

**Warstwa 5 — HTTPS.** Traefik/Caddy w compose, Let's Encrypt dla `druzynada.example.com`. Bez TLS `deviceToken` i admin JWT lecą plaintextem po WiFi — i ktoś z telefonem *będzie* miał pokusę.

### 5.3 REST (CRUD pytań)

`AdminGuard` (HTTP) na `@Controller('api/admin/*')` — ten sam JWT w nagłówku `Authorization: Bearer`. Publiczne bez auth: `POST /api/auth/admin`, `GET /api/game/current` (kod gry dla TV/graczy), health.

---

## 6. Edge case'y i dziury w regułach

Numeracja = kolejność ważności (1–8 to rzeczy, które *na pewno* wydarzą się w piątek).

**6.1 Admin kliknął złą odpowiedź / niechcący MISS.**
Najczęstszy błąd wieczoru. Rozstrzygnięcie: **globalne UNDO** (§2.4), przycisk zawsze widoczny na telefonie admina, wymaga `expectedSeq` (ochrona przed cofnięciem cudzej nowszej akcji). Dodatkowo `AdminAdjustScoreReq` — ręczna korekta punktów z powodem, zapisywana jako event. TV przy undo dostaje `tv:reset` i przerysowuje bez animacji.

**6.2 Drużyna podaje odpowiedź, która już jest odsłonięta.**
Reguły milczą. Rozstrzygnięcie: **to nie jest X.** Admin klika już odsłonięty slot → serwer zwraca `ALREADY_REVEALED`, na telefonie admina slot pulsuje na czerwono, na TV dźwięk `already_revealed` (krótki buzz) i migniecie slotu. Kontrola zostaje przy drużynie, strikes bez zmian. (Dlaczego nie X: w oryginale prowadzący po prostu mówi „to już mamy". Karanie za to psuje zabawę.) **Ale**: jeśli drużyna robi to trzeci raz pod rząd, admin ma przycisk MISS i tak — decyzja ludzka.

**6.3 Drużyna kontrolująca odsłania wszystkie odpowiedzi przed 3 X.**
Reguły milczą. Rozstrzygnięcie: **natychmiastowe `Q_AWARD` dla drużyny kontrolującej**, bez fazy przejęcia, pełna pula, dźwięk `board_clear` (osobny, głośniejszy). To jest szczyt emocji rundy — zasługuje na własny jingiel.

**6.4 Czy X-y liczą się przy przejęciu?**
Rozstrzygnięcie: **nie.** Przejmujący ma dokładnie jedną próbę — licznik X jest nieistotny. Ale: X-y drużyny, która straciła kontrolę, **zostają widoczne na TV** do końca pytania (informacja dla widza). Zerowanie X przy nowym pytaniu. Przejmujący, który spudłuje, **nie dostaje X** (bo nie ma czego liczyć) — dostaje wizualny znacznik „próbował" (szara ikona).

**6.5 Wszyscy spudłowali — co dalej z odsłanianiem.**
Reguła jest jasna (pojedynczo, osobnym przyciskiem), ale nie mówi: czy pokazujemy wagi? Rozstrzygnięcie: **tak, waga się pokazuje, ale licznik puli pokazuje `0` i miga na czerwono** — dramatyczne „tyle mogliście mieć". `Q_FORFEIT_REVEAL` nie da się opuścić póki nie odsłonisz wszystkich (przycisk „Dalej" nieaktywny) — albo admin klika „pomiń resztę" (wtedy sloty odsłaniają się hurtem, jako furtka czasowa). Tę furtkę trzeba mieć, bo przy 10 odpowiedziach × wolne tempo to 40 s martwego czasu.

**6.6 Kolizja nazw drużyn.**
Rozstrzygnięcie: unique index na `(game_id, slug)` gdzie `slug = lower(trim(normalizeDiacritics(name)))`. Drugi telefon dostaje `NAME_TAKEN` i musi wpisać inną. Dodatkowo: nazwa 2–24 znaki, filtr na puste/whitespace, hard limit 24 znaki (TV ma ograniczoną szerokość — przy dłuższej i tak trzeba by skalować font). **Admin może nadpisać nazwę dowolnej drużyny** (`AdminRenameTeamReq`) — bo ktoś wpisze coś, czego nie chcesz na 55" przy teściowej.

**6.7 Admin wystartował grę zanim wszyscy dołączyli.**
Rozstrzygnięcie: **twardy guard** — `ADMIN_START_GAME` odrzucony gdy `teams < 2`, a przy `teams == 2` przycisk pokazuje ostrzeżenie „gracie w 2 drużyny, na pewno?" z potwierdzeniem. Ale co gdy trzecia para dołączy *po* starcie? **Pozwalamy dołączyć do końca pytania 1** (`LOBBY`-like grace): `TEAM_JOIN` w `MAIN_ROUND` przy `qIndex == 0` jest akceptowany, drużyna startuje z 0 pkt. Po `qIndex >= 1` → `GAME_FULL`, a telefon dostaje tryb „obserwator" (widzi wyniki, przycisk nieaktywny). Alternatywa (undo do lobby) też działa, ale kosztuje replay.

**6.8 Telefon drużyny rozłącza się w trakcie wyścigu.**
Rozstrzygnięcie: **wyścig nie czeka.** Rozłączona drużyna pozostaje w `eligible` (bo może wrócić w 2 s). Ale:
- Admin widzi na swoim ekranie kropki obecności (`admin:teams` z `connected` + `rttMs`) — **przed otwarciem wyścigu ma sygnał**, a `ADMIN_OPEN_RACE` przy niepełnej obecności pokazuje ostrzeżenie (nie blokadę).
- Jeśli rozłączona drużyna jest jedynym `eligible` w `STEAL` → FSM czeka w `Q_STEAL_RACE_OPEN` bez timeoutu; admin ma `AdminForceControlReq` żeby przyznać ręcznie albo `ADMIN_MISS` żeby przejść dalej.
- Jeśli wyścig `MAIN` się rozstrzygnął, a zwycięzca zaraz padł — kontrola zostaje przy nim; drużyna odpowiada **ustnie**, więc telefon nie jest do niczego potrzebny. To ważne: **po wyścigu telefon jest zbędny**, więc rozłączenie w trakcie odpowiadania jest bezszkodowe.

**6.9 Padnięcie przeglądarki TV / restart backendu w środku wyścigu.**
Rozstrzygnięcie: otwarty wyścig **nie przeżywa restartu backendu** — `raceWindowMs` to timer w pamięci. Przy starcie serwera: jeśli `state.question.race != null` i `race.kind` jest otwarty, serwer **unieważnia wyścig** (`is_void = true`), wraca do `Q_IDLE`/`Q_STEAL_RACE_OPEN` i broadcastuje. Admin klika START ponownie. Nie próbujemy ratować 250-ms okna przez restart — to nieuzasadniona złożoność. **Wszystko inne przeżywa restart**, łącznie z zegarem finału (timestamp w DB).

**6.10 Zegar finału a rozłączenie/odświeżenie TV.**
`deadlineAt` w DB → TV po F5 liczy pozostały czas z `serverTs`. Ale jeśli **backend** padnie na 40 s w środku tury 25-sekundowej, czas upłynie „w tle". Rozstrzygnięcie: przy starcie serwera, jeśli `final.timer.running == true` i `deadlineAt < now`, **nie kończymy tury automatycznie** — przechodzimy w `F_P*_PAUSED` z `remainingMs` zapamiętanym sprzed restartu i zostawiamy decyzję adminowi (wznów / zakończ). Automatyczne „czas minął bo serwer się restartował" byłoby niesprawiedliwe.

**6.11 Duplikat w finale — wykrywanie.**
Duplikat = **ten sam `answerId`**, nie ten sam tekst. Admin klika konkretny slot z listy 10, więc porównanie jest trywialne i deterministyczne. Ale: co gdy gracz 2 powie *synonim* odpowiedzi gracza 1, który jest osobnym slotem? Wtedy formalnie nie jest to duplikat — i słusznie, to inna odpowiedź ankietowanych. Ryzyko: admin ma dwa bardzo podobne sloty i klika nie ten. Mitygacja: **slot odpowiadający odpowiedzi gracza 1 jest w UI admina wyraźnie oznaczony ikoną „1" i kolorem** przez całą turę gracza 2 — admin widzi duplikat *zanim* kliknie.

**6.12 Gracz 1 dał PASS, gracz 2 trafia tę samą odpowiedź.**
Nie jest to duplikat (P1 nic nie zajął). Punkty liczą się normalnie. Analogicznie MISS P1.

**6.13 Gracz 1 skończył 5 pytań przed czasem.**
Rozstrzygnięcie: zostaje czas → admin może wrócić do pytań z PASS (`ADMIN_RETURN_TO_PASSED`). Jeśli nie ma PASS-ów, tura kończy się automatycznie (`F_P1_DONE`) i **niewykorzystany czas przepada** (nie przechodzi na gracza 2 — inaczej pierwszy gracz byłby karany za dokładność).

**6.14 Mnożnik ×2 — co dokładnie mnożymy.**
Rozstrzygnięcie: `pool = Σ(weight odsłoniętych przez grających) × multiplier`, mnożnik stosowany **przy każdym doliczeniu**, nie na końcu (żeby TV pokazywało rosnącą pulę już przemnożoną — inaczej widz się gubi). `multiplier = qIndex >= 5 ? 2 : 1` (pytania 6–10, indeksowane od 0). Mnożnik jest **zamrożony w `QuestionState.multiplier`** przy starcie pytania, żeby zmiana configu w trakcie nie rozjechała replayu.

**6.15 Admin pomylił się przy wyborze pytania / pytanie jest do bani.**
Rozstrzygnięcie: `ADMIN_SKIP_QUESTION` dostępny w `Q_IDLE` i `Q_RACE_OPEN` (przed pierwszym trafieniem) — podmienia pytanie na następne wolne z tego samego pakietu, nie zwiększa `qIndex`. Po pierwszym `ADMIN_HIT` już nie — wtedy tylko UNDO. Potrzebne, bo przy 18+ pakiecie na pewno trafi się pytanie, którego nie chcesz zadać przy konkretnym składzie.

**6.16 Dwa telefony jednej drużyny.**
Reguła mówi „JEDEN telefon na drużynę", ale nikt nie pilnuje. Rozstrzygnięcie: `deviceToken` jest unikalny na drużynę; drugi telefon wchodzący z tym samym tokenem (np. skopiowany link) → **stary socket dostaje `play:evicted` i jest rozłączany**, nowy przejmuje. Zawsze dokładnie jeden aktywny socket per drużyna. Bez tego dwa telefony = dwa naciśnięcia = przewaga.

**6.17 Remis w rankingu końcowym.**
Reguły milczą. Rozstrzygnięcie: tie-break po (1) liczbie wygranych pytań, (2) liczbie wygranych wyścigów, (3) sumie trafionych wag. Jeśli nadal remis — TV pokazuje dwie drużyny jako współzwycięzców, a admin ręcznie wskazuje, która gra finał (przycisk). Automatyczne losowanie byłoby gorsze: przy stole chcesz mieć argument.

**6.18 Pula przy przejęciu — czy trafienie przejmującego dolicza swoją wagę.**
Rozstrzygnięte w §0.3: **tak**. Implementacyjnie: `ADMIN_HIT` w `Q_STEAL_ATTEMPT` najpierw robi `pool += weight × mult`, potem `award(stealingTeam, pool)`.

**6.19 Co gdy pytanie ma 3 odpowiedzi, a drużyna dostaje 3 X po odsłonięciu 2.**
Działa normalnie (przejęcie o pulę z 2 odpowiedzi, jedna wolna do trafienia). Ale: co gdy 3 X przy **zerze** odsłoniętych? Pula = 0. Rozstrzygnięcie: **przejęcie i tak się odbywa** — przejmujący, który trafi, dostaje `waga × mult` (patrz 6.18), co jest niezerowe. Bez tej reguły przejęcie o pulę 0 byłoby bez sensu.

**6.20 Pytanie bez żadnego wyścigu (nikt nie nacisnął).**
`TIMEOUT` po 60 s → wracamy do `Q_IDLE`, admin może otworzyć wyścig ponownie albo pominąć pytanie. Praktycznie nie wystąpi, ale FSM nie może się zawiesić.

**6.21 Gracz 2 nie wyszedł z pokoju.**
Czysto organizacyjne, ale UI może pomóc: `F_P1_READY` pokazuje na TV pełnoekranowy komunikat „GRACZ 2: {imię} — OPUŚĆ POKÓJ" i admin musi kliknąć potwierdzenie „wyszedł" żeby wystartować zegar. Jedna dodatkowa bramka, która ratuje cały finał.

**6.22 Sytuacja, której nie da się rozwiązać technicznie.**
Ktoś w drużynie przejmującej usłyszy odpowiedź drużyny kontrolującej i „przejmie" ją jako swoją. To jest problem prowadzącego, nie silnika — ale admin powinien mieć na ekranie **listę odpowiedzi już wypowiedzianych i odrzuconych jako błędne** (log MISS-ów z ręcznie wpisanym tekstem? nie — za wolno). Rozstrzygnięcie: pomijamy, to rola prowadzącego.

---

## 7. Struktura kodu

### 7.1 Backend — moduły NestJS

```
backend/src/
  main.ts
  app.module.ts
  config/
    configuration.ts              # ENV → typed config
    validation.schema.ts          # Joi/zod walidacja ENV przy starcie

  common/
    guards/admin-http.guard.ts
    guards/ws-admin.guard.ts
    guards/ws-player.guard.ts
    filters/ws-exception.filter.ts
    interceptors/idempotency.interceptor.ts   # clientOpId
    decorators/current-team.decorator.ts

  auth/
    auth.module.ts
    auth.controller.ts            # POST /api/auth/admin
    auth.service.ts               # timingSafeEqual, JWT sign/verify

  catalog/                        # CRUD pytań — całkowicie niezależny od gry
    catalog.module.ts
    pack.controller.ts   pack.service.ts
    question.controller.ts  question.service.ts
    answer.controller.ts    answer.service.ts
    entities/{pack,question,answer}.entity.ts
    dto/

  game/                           # SERCE
    game.module.ts
    game.controller.ts            # GET /api/game/current, POST /api/game (nowa gra)
    game.service.ts               # apply(), transakcja + FOR UPDATE, broadcast
    game.repository.ts
    entities/{game,team,game-event}.entity.ts
    engine/                       # CZYSTE FUNKCJE, ZERO I/O — testowalne jednostkowo
      state.ts                    # typy GameState + initialState()
      reducer.ts                  # reduce(state, event) → state
      guards.ts                   # canApply(state, event) → Result
      question.fsm.ts
      final.fsm.ts
      scoring.ts                  # pool, multiplier, ranking, tie-break
      projections.ts              # project(state, 'tv'|'admin'|'player')
      sounds.ts                   # mapowanie event → SoundKey
    engine/__tests__/             # tu leży 80% wartości testów

  buzzer/
    buzzer.module.ts
    buzzer.service.ts             # okno zbierania, bufor presses, resolveRace()
    clock-sync.service.ts
    strategies/
      arrival-order.strategy.ts   # Etap 3
      offset-corrected.strategy.ts# Etap 6
    entities/{buzz-race,buzz-press}.entity.ts

  realtime/
    realtime.module.ts
    tv.gateway.ts                 # namespace /tv
    admin.gateway.ts              # namespace /admin
    player.gateway.ts             # namespace /play
    broadcast.service.ts          # jedno miejsce wysyłania do 3 namespace'ów
    presence.service.ts           # connected/rtt per team

  final/
    final.module.ts
    final.service.ts              # zegar (timestamp-based), duplikaty
    entities/final-session.entity.ts

  health/health.controller.ts

  migrations/                     # TypeORM migrations (synchronize: false w prod!)
```

Kluczowa decyzja: **`game/engine/` nie importuje niczego z NestJS ani TypeORM.** To czyste TS. Dzięki temu cała logika gry jest testowalna w milisekundach i nie trzeba stawiać bazy, żeby sprawdzić „czy trzeci X otwiera przejęcie przy 2 drużynach". Przy deadlinie w piątek to jedyna rzecz, która pozwoli spać.

### 7.2 Frontend — Vue 3 + Vite

Konwencja: **folder = namespace, nazwa pliku nie powtarza folderu.**

```
frontend/src/
  main.ts
  App.vue
  router/index.ts                 # /tv, /admin, /play, / (redirect)

  api/
    http.ts                       # fetch wrapper + Bearer
    socket.ts                     # factory socket.io per namespace
    types.ts                      # WSPÓLNE typy z backendem (kopiowane lub z packages/shared)

  stores/                         # Pinia
    game.ts                       # snapshot + seq + applyPatch
    teams.ts
    admin.ts                      # token, undo stack, catalog cache
    player.ts                     # deviceToken, buzzer armed, clock offset
    catalog.ts                    # packs/questions/answers (CRUD)
    audio.ts                      # preload, play(key), unlock
    connection.ts                 # status, reconnect, resync

  composables/
    useSocket.ts
    useClockSync.ts
    useCountdown.ts               # zegar finału z serverTs
    useWakeLock.ts                # TV i telefony nie mogą gasnąć!
    useFullscreen.ts
    useKeyboardShortcuts.ts       # admin na laptopie: 1-9=slot, X=miss, U=undo

  views/
    Tv.vue
    Admin.vue
    Play.vue

  components/
    tv/
      Lobby.vue                   # lista drużyn + QR
      Board.vue                   # plansza pytania
      Slot.vue                    # pojedyncza kratka z animacją flip
      Pool.vue                    # licznik puli
      Strikes.vue                 # wielkie X
      Scores.vue                  # pasek wyników drużyn
      RaceOverlay.vue             # "KTO PIERWSZY" + zwycięzca
      Leaderboard.vue
      Podium.vue
      Transition.vue              # przejścia między fazami
      final/
        Intro.vue
        Board.vue                 # 5 pustych slotów, bez tekstu
        Timer.vue
        Reveal.vue
        Result.vue
    admin/
      Login.vue
      Bar.vue                     # górny pasek: faza, seq, undo, połączenia
      Presence.vue                # kropki drużyn + rtt
      Lobby.vue                   # zarządzanie drużynami, wybór pakietów
      Control.vue                 # główny panel rundy: lista odpowiedzi + MISS
      AnswerButton.vue
      RaceLog.vue                 # presses z ms (rozstrzyganie sporów)
      UndoStack.vue
      ScoreEditor.vue
      final/
        Setup.vue
        Turn.vue                  # 10 odpowiedzi + błąd/pas + oznaczenie duplikatu
        Timer.vue
        Reveal.vue
      catalog/
        Packs.vue
        QuestionList.vue
        QuestionForm.vue
        AnswerRows.vue
        Import.vue                # wklej CSV/TSV → pytanie+odpowiedzi (ratuje czas!)
    play/
      Join.vue                    # wpisz nazwę drużyny
      Buzzer.vue                  # WIELKI przycisk
      Status.vue                  # faza, wynik, "odpowiadacie!"
      Result.vue                  # wygrałeś/przegrałeś wyścig
    ui/
      Button.vue  Modal.vue  Toast.vue  Spinner.vue  Confirm.vue

  assets/
    styles/main.css               # Tailwind + @font-face
  public/
    audio/                        # patrz §8
    fonts/
```

Uwagi frontowe:
- **`useWakeLock`** jest nieoczywisty i krytyczny: telefon z wygaszonym ekranem nie odbierze wyścigu. Screen Wake Lock API na `/play` i `/tv`.
- **Odblokowanie audio**: przeglądarka nie zagra nic przed pierwszą interakcją. `/tv` startuje ekranem „Kliknij aby rozpocząć" → `audio.unlock()` → dopiero potem `tv:hello`.
- **Rozmiary**: `/tv` projektuj na 1920×1080, jednostki `vw/vh` i `clamp()`, nie px. `/play` — przycisk zajmuje 70% viewportu, `touch-action: manipulation`, `user-select: none`, `-webkit-tap-highlight-color: transparent`.
- **Typy współdzielone**: `packages/shared/` (workspace npm) z typami eventów WS importowane po obu stronach. Przy 2-dniowym projekcie taniej niż utrzymywanie dwóch kopii, które się rozjadą.

### 7.3 Deploy

```
docker-compose.yml
  api      → node:22-alpine, build backend, serwuje też statyki z /app/public (SPA fallback)
  caddy    → TLS dla druzynada.example.com, reverse proxy, websocket upgrade
  (postgres: ISTNIEJĄCY na serwer — tylko nowa baza `cue` + user, przez external network)
```

Jeden kontener Node serwujący API + WS + statyki jest prostszy niż osobny nginx i eliminuje klasę problemów z CORS/WS upgrade. `ServeStaticModule` z `exclude: ['/api/*', '/socket.io/*']` i fallbackiem na `index.html`.

---

## 8. Pliki audio — dokładna lista

Wszystkie w `frontend/public/audio/`, format `.mp3` (44.1 kHz, mono wystarczy, ~128 kbps). Preload przy starcie `/tv`. Nazwy = klucze `SoundKey`.

**Ramy gry**
| Plik | Kiedy | Długość |
|---|---|---|
| `theme_intro.mp3` | wejście na `/tv`, ekran lobby (loop) | 30–60 s loop |
| `game_start.mp3` | `ADMIN_START_GAME` | 3–5 s |
| `question_reveal.mp3` | odsłonięcie treści pytania | 1–2 s |
| `transition.mp3` | przejście między pytaniami | 1–2 s |

**Wyścig**
| Plik | Kiedy | Długość |
|---|---|---|
| `race_open.mp3` | otwarcie wyścigu („gotowi?") | 0.5–1 s |
| `buzz.mp3` | naciśnięcie grzybka (surowy brzęk) | 0.3–0.5 s |
| `buzz_win.mp3` | ogłoszenie zwycięzcy wyścigu | 1–2 s |
| `tiebreak.mp3` | remis → dogrywka | 1–2 s |

**Runda główna**
| Plik | Kiedy | Długość |
|---|---|---|
| `hit.mp3` | trafiona odpowiedź (klasyczny „ding") | 1–1.5 s |
| `hit_top.mp3` | trafiona odpowiedź #1 (najwyższa waga) — opcjonalny wariant | 1.5–2 s |
| `strike_1.mp3` | pierwszy X | 1 s |
| `strike_2.mp3` | drugi X | 1 s |
| `strike_3.mp3` | trzeci X (dłuższy, dramatyczny) | 2–3 s |
| `already_revealed.mp3` | admin kliknął odsłonięty slot (§6.2) | 0.5 s |
| `board_clear.mp3` | wszystkie odpowiedzi odsłonięte przez jedną drużynę (§6.3) | 2–4 s |
| `steal_open.mp3` | otwarcie przejęcia | 1–2 s |
| `steal_win.mp3` | udane przejęcie | 2–3 s |
| `steal_fail.mp3` | nieudane przejęcie | 1–2 s |
| `pool_award.mp3` | naliczanie punktów (może być loop tickerowy) | 1–3 s |
| `pool_lost.mp3` | pula przepada — wszyscy spudłowali | 2–3 s |
| `reveal_single.mp3` | pojedyncze odsłonięcie w `Q_FORFEIT_REVEAL` | 0.5–1 s |
| `timeout.mp3` | nikt nie nacisnął w 60 s | 1 s |

**Podsumowanie**
| Plik | Kiedy | Długość |
|---|---|---|
| `scores.mp3` | pokazanie tabeli między pytaniami | 1–2 s |
| `leaderboard.mp3` | ranking po 10 pytaniach | 3–5 s |
| `winner.mp3` | wyróżnienie zwycięzcy rundy głównej | 3–5 s |

**Finał**
| Plik | Kiedy | Długość |
|---|---|---|
| `final_intro.mp3` | wejście w finał | 3–6 s |
| `final_timer_start.mp3` | start zegara tury | 0.5 s |
| `final_tick.mp3` | tykanie (loop, ostatnie 10 s) | 1 s loop |
| `final_ok.mp3` | admin zarejestrował odpowiedź (neutralny, BEZ informacji o trafieniu!) | 0.3 s |
| `final_pass.mp3` | pas | 0.5 s |
| `final_time_up.mp3` | koniec czasu | 1–2 s |
| `duplicate_buzz.mp3` | duplikat odpowiedzi gracza 2 | 1–1.5 s |
| `final_reveal.mp3` | odsłonięcie jednego slotu w `F_REVEAL` | 0.5–1 s |
| `final_reveal_zero.mp3` | odsłonięcie slotu z 0 pkt (MISS/PASS/DUPLICATE) | 0.5–1 s |
| `final_win.mp3` | suma ≥ 200 | 5–10 s |
| `final_lose.mp3` | suma < 200 | 3–5 s |

**Uwagi**
| Plik | Kiedy |
|---|---|
| `error.mp3` | błąd akcji admina (tylko lokalnie na jego urządzeniu) |
| `undo.mp3` | cofnięcie akcji (krótki „rewind") |

**Krytyczne:** `final_ok.mp3` **musi brzmieć identycznie dla trafienia i błędu** — inaczej gracz 2 słysząc „ding" wie, że trafił, a słysząc „buu" wie, że jego partner też podał tę odpowiedź. To jest wyciek informacji przez audio i łatwo go przeoczyć. Stąd osobne `final_ok` (neutralne potwierdzenie rejestracji) zamiast `hit`/`miss`. Dźwięk `final_miss` **nie istnieje celowo**.

Razem: **32 pliki** (+2 opcjonalne warianty). Fallback: `audio.play(key)` cicho ignoruje brakujący plik i loguje ostrzeżenie — gra działa bez ani jednego mp3.

---

## 9. Kolejność implementacji (do piątku)

Każdy etap kończy się czymś uruchamialnym i testowalnym.

### Etap 0 — Szkielet (2–3 h)
- `docker-compose.yml`, Caddy, baza `cue` na serwerze, `.env`
- NestJS bootstrap + TypeORM połączenie + healthcheck
- Vite + Vue + Tailwind + router z 3 pustymi widokami
- **Test:** `druzynada.example.com/tv` pokazuje „hello", `/api/health` zwraca 200.

### Etap 1 — Katalog pytań (3–4 h)
- Encje `pack`/`question`/`answer` + migracje
- REST CRUD + `auth` (hasło → JWT → localStorage)
- `/admin` bez gry: logowanie + zarządzanie pakietami/pytaniami/odpowiedziami
- **Import wklejanego tekstu** (`Odpowiedź<TAB>waga` per linia) — oszczędza godziny wpisywania
- **Test:** wpisujesz 30 pytań głównych i 10 finałowych, są w bazie. **Rób to wieczorem w tle, to najdłuższa ręczna praca wieczoru.**

### Etap 2 — Lobby + persystencja + snapshot (3–4 h)
- `game` + `team` + `game_event`, `GameService.apply()` z transakcją
- `engine/state.ts`, minimalny `reducer` (tylko lobby)
- 3 namespace'y WS, `BroadcastService`, snapshot po connect
- `/play` — wpisanie nazwy, `deviceToken` w localStorage, reconnect
- `/tv` — lista drużyn + QR
- **Test:** trzy telefony dołączają, TV pokazuje nazwy. Restart backendu → po 3 s wszystko wraca. Odśwież TV → wraca.

### Etap 3 — Runda główna, buzzer v1 (5–6 h) ← największy etap
- `question.fsm.ts` + reducer + guards (pełna tabela §1.6)
- `buzzer.service.ts` ze strategią **`arrival-order`** (prosta, kolejność dotarcia)
- `/admin` `Control.vue` — lista odpowiedzi, MISS, przejęcie, forfeit reveal, NEXT
- `/tv` `Board.vue` + `Slot.vue` + `Pool.vue` + `Strikes.vue` (bez wypieszczonych animacji)
- `/play` `Buzzer.vue`
- Testy jednostkowe reduktora: 3X→przejęcie, 2 vs 3 drużyny, board clear, forfeit
- **Test:** rozegraj 2 pytania w 3 drużyny, punkty się zgadzają. To jest moment „gra działa".

### Etap 4 — UNDO + ratunkowe (2 h)
- Replay z event logu, `ADMIN_UNDO`, `UndoStack.vue`
- `AdminAdjustScoreReq`, `AdminForceControlReq`, `ADMIN_SKIP_QUESTION`
- **Test:** kliknij złą odpowiedź, cofnij, stan wraca 1:1, TV się przerysowuje.
- **Nie pomijaj tego etapu.** Bez undo pierwsza pomyłka admina zabija wieczór.

### Etap 5 — Finał (4–5 h)
- `final.fsm.ts`, zegar na timestampach, pauza, duplikaty
- `/admin` `final/Turn.vue` z oznaczeniem odpowiedzi gracza 1
- `/tv` `final/Board.vue` (puste sloty!), `Timer.vue`, `Reveal.vue`
- **Test:** przejdź pełny finał, sprawdź że w turze gracza 2 TV **nie zdradza nic**. Zrób to naprawdę — wyjdź z pokoju i wróć.

### Etap 6 — Buzzer v2 + polish (3–4 h)
- `clock-sync.service.ts`, `offset-corrected.strategy.ts`, dogrywka
- `RaceLog.vue` na adminie
- Animacje TV (flip slotów, licznik puli, konfetti), WakeLock, fullscreen
- Hooki audio + odblokowanie audio
- **Test:** trzy telefony, 20 wyścigów, sprawdź `admin:race:presses` czy ms są sensowne.

### Etap 7 — Generalna próba (1–2 h)
- Pełny przebieg 10 pytań + finał, na docelowym sprzęcie, w docelowym pokoju, na docelowym WiFi
- Wyłącz backend w środku pytania. Odśwież TV. Zabij telefon.
- Sprawdź głośność na realnym telewizorze
- **Wgraj pliki mp3**

**Ścieżka krytyczna:** Etapy 0→2→3 muszą być gotowe najpóźniej w czwartek rano. Jeśli czas goni, w tej kolejności tnij: Etap 6 (zostaje `arrival-order`), animacje z Etapu 6, `hit_top.mp3` i inne opcjonalne dźwięki, `Import.vue`. **Nigdy nie tnij Etapu 4 (undo) ani Etapu 7 (próba).**

Ryzyko #1 to nie kod, tylko **treść pytań** — 10 pytań głównych × 3–10 odpowiedzi z wagami plus 5 finałowych × 10 odpowiedzi to ~130 rekordów wymyślonych ręcznie. Zacznij je zbierać równolegle od Etapu 1, nie w czwartek w nocy.

---

### Pliki krytyczne dla implementacji

Katalog jest pusty — to pliki do utworzenia, w kolejności ważności:

- `/home/pszejna/projects/other/cue/backend/src/game/engine/reducer.ts` — czysty reduktor, serce gry, jedyne miejsce zmiany stanu
- `/home/pszejna/projects/other/cue/backend/src/game/engine/question.fsm.ts` — tabela przejść rundy głównej (§1.6)
- `/home/pszejna/projects/other/cue/backend/src/game/game.service.ts` — transakcja `FOR UPDATE` + event log + snapshot + broadcast, kontrakt persystencji z §2.4
- `/home/pszejna/projects/other/cue/backend/src/game/engine/projections.ts` — redakcja stanu per rola; od niej zależy szczelność finału
- `/home/pszejna/projects/other/cue/backend/src/buzzer/buzzer.service.ts` — okno zbierania i `resolveRace()` za wymienialnym interfejsem strategii