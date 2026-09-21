# Dźwięki

Komplet 38 plików jest w repo i został wygenerowany syntezą:

```bash
python3 tools/generate_sounds.py            # wszystkie od nowa
python3 tools/generate_sounds.py strike_3   # tylko wybrane
```

Definicje siedzą w [tools/generate_sounds.py](../../../tools/generate_sounds.py),
a syntezator (oscylatory, obwiednie, pogłos) w `tools/sound_lib.py`. Jeśli któryś
dźwięk brzmi nie tak, popraw jego funkcję `s_<nazwa>` i wygeneruj sam ten plik —
reszta zostaje nietknięta. Własne nagranie po prostu nadpisuje plik o tej nazwie.

Format: mp3 128 kbps, mono. **Brakujący plik jest cicho ignorowany** — gra działa
bez ani jednego dźwięku.

Dźwięki odtwarza wyłącznie ekran `/tv` (plus dwa lokalne na urządzeniu admina).
Przeglądarka nie zagra niczego przed pierwszą interakcją, dlatego telewizor
zaczyna od ekranu „Kliknij, aby rozpocząć".

## Ramy gry

| Plik | Kiedy | Sugerowana długość |
|---|---|---|
| `lobby_music.mp3` | lobby, gra w pętli tylko do startu gry; **nagranie**, nie synteza | ok. 60 s |
| `theme_intro.mp3` | zsyntetyzowana muzyka lobby — zapasowa, obecnie nieużywana | 17 s |
| `game_start.mp3` | start gry | 3–5 s |
| `question_reveal.mp3` | odsłonięcie treści pytania | 1–2 s |
| `transition.mp3` | przejście do kolejnego pytania | 1–2 s |

## Wyścig grzybkowy

| Plik | Kiedy | Długość |
|---|---|---|
| `race_open.mp3` | grzybki odblokowane | 0,5–1 s |
| `buzz.mp3` | naciśnięcie grzybka | 0,3–0,5 s |
| `buzz_win.mp3` | ogłoszenie zwycięzcy wyścigu | 1–2 s |
| `tiebreak.mp3` | remis → dogrywka | 1–2 s |

## Runda główna

| Plik | Kiedy | Długość |
|---|---|---|
| `hit.mp3` | trafiona odpowiedź | 1–1,5 s |
| `hit_top.mp3` | trafiona odpowiedź numer 1 | 1,5–2 s |
| `strike_1.mp3` | pierwszy X | 1 s |
| `strike_2.mp3` | drugi X | 1 s |
| `strike_3.mp3` | trzeci X — dłuższy, dramatyczny | 2–3 s |
| `already_revealed.mp3` | odpowiedź już odsłonięta („to już mamy") | 0,5 s |
| `board_clear.mp3` | jedna drużyna domknęła całą planszę | 2–4 s |
| `steal_open.mp3` | otwarcie przejęcia | 1–2 s |
| `steal_win.mp3` | udane przejęcie | 2–3 s |
| `steal_fail.mp3` | nieudane przejęcie | 1–2 s |
| `pool_award.mp3` | naliczanie punktów | 1–3 s |
| `pool_lost.mp3` | pula przepada | 2–3 s |
| `reveal_single.mp3` | pojedyncze odsłonięcie po przepadnięciu puli | 0,5–1 s |
| `timeout.mp3` | nikt nie nacisnął grzybka | 1 s |

## Podsumowania

| Plik | Kiedy | Długość |
|---|---|---|
| `scores.mp3` | tabela wyników między pytaniami | 1–2 s |
| `leaderboard.mp3` | ranking po dziesiątym pytaniu | 3–5 s |
| `winner.mp3` | wyróżnienie zwycięzcy rundy głównej | 3–5 s |

## Finał

| Plik | Kiedy | Długość |
|---|---|---|
| `final_intro.mp3` | wejście w finał / zapowiedź tury | 3–6 s |
| `final_timer_start.mp3` | start zegara | 0,5 s |
| `final_tick.mp3` | tykanie, pętla przez ostatnie 10 s | 1 s |
| `final_ok.mp3` | **neutralne** potwierdzenie odpowiedzi | 0,3 s |
| `final_pass.mp3` | pas | 0,5 s |
| `final_time_up.mp3` | koniec czasu | 1–2 s |
| `duplicate_buzz.mp3` | gracz 2 powtórzył odpowiedź partnera | 1–1,5 s |
| `final_reveal.mp3` | odsłonięcie slotu z punktami | 0,5–1 s |
| `final_reveal_zero.mp3` | odsłonięcie slotu bez punktów | 0,5–1 s |
| `final_win.mp3` | suma finału osiąga próg (domyślnie 100) | 5–10 s |
| `final_lose.mp3` | suma finału poniżej progu | 3–5 s |

> **Uwaga na `final_ok.mp3`.** Ten dźwięk brzmi tak samo przy trafieniu i przy
> błędzie — celowo. Gdyby trafienie miało radosny „ding", gracz 2 wiedziałby po
> dźwięku, że trafił, a przy duplikacie — że partner podał to samo. Z tego powodu
> plik `final_miss.mp3` w ogóle nie istnieje.

## Urządzenie admina (nie na TV)

| Plik | Kiedy |
|---|---|
| `error.mp3` | odrzucona akcja |
| `undo.mp3` | cofnięcie akcji |
