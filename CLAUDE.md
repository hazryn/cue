# CUE — konwencje projektu

Familiada na wieczór ze znajomymi: `/tv` (telewizor), `/admin` (prowadzący),
`/play` (grzybki na telefonach). Zasady gry i szybki start: [README.md](README.md).

## Porty

Dev chodzi na puli **7200+**: backend `7200`, frontend `7201`, Postgres `7202`.
Dodając usługę, bierz kolejny wolny port z tej puli — na maszynie stoją równolegle
inne projekty i domyślne porty kolidują.

## Docker Compose

Sieć compose ma jawną podsieć (`CUE_SUBNET`, domyślnie `10.172.72.0/24`), bo VPN
na maszynie autora przejmuje `172.17.0.0/24` i ruch do kontenerów znikał w tunelu.
Frontend w compose ma pusty `VITE_API_URL` i proxy Vite (`API_PROXY_TARGET`) —
dzięki temu telefony w domowym WiFi łączą się tylko z portem 7201.

## Pliki `.env`

`.env` **jest w repo** i zawiera wartości wystarczające do uruchomienia w dev.
Lokalne i produkcyjne nadpiski idą do `.env.local` (ignorowany). Nie tworzymy
`.env.example`. W NestJS kolejność to `['.env.local', '.env', '../.env.local', '../.env']`
— pierwszy plik z listy wygrywa.

## Silnik gry

`backend/src/game/engine/` to **czysty TypeScript — żadnych importów z NestJS
ani TypeORM**. Reduktor, maszyny stanów, punktacja i projekcje muszą dać się
przetestować bez bazy, w milisekundach. Nowa zasada gry = zmiana w reduktorze
plus test w `engine/__tests__/`, nie `if` w kontrolerze.

Reduktor nie czyta zegara ani nie losuje — czas i identyfikatory przychodzą
w zdarzeniu. Bez tego odtworzenie logu (czyli cofanie akcji prowadzącego) po cichu
rozjechałoby punktację.

## Zmiany stanu

Jedyna droga to `GameService.apply(event)`: transakcja z `SELECT ... FOR UPDATE`
na wierszu gry, walidacja przejścia (`guards.ts`), reduktor, zapis zdarzenia do logu,
snapshot i rozgłoszenie. Nie modyfikuj `game.state` z pominięciem tej ścieżki.

Obecność telefonów (`connected`, RTT) celowo **nie jest** częścią stanu gry — to dane
ulotne w `PresenceService`. Gdyby siedziały w stanie, każde mrugnięcie WiFi
produkowałoby zdarzenie w logu cofania.

## Finał bez zegara

Tura finału **nie ma limitu czasu** — decyzja po testach przy stole: prowadzący na
telefonie nie nadążał jednocześnie z odliczaniem i zaznaczaniem odpowiedzi. Turę
kończy ostatnia odpowiedź albo „Zakończ turę". Zdarzenie wciąż nazywa się
`ADMIN_FINAL_START_TIMER` (kompatybilność logów przy cofaniu); nie dodawaj zegara
z powrotem bez pytania.

## Redakcja danych per rola

Telewizor dostaje własną projekcję (`projections.ts`) i nigdy nie widzi treści
nieodsłoniętych odpowiedzi — w finale zależy od tego sens całej rundy. Nowe pole
w widoku TV zawsze przemyśl pod kątem: „czy wracający do pokoju gracz może to
zobaczyć?". Ukrywanie w szablonie nie wystarcza, bo WebSocket da się podsłuchać.

## Frontend

Vue 3 + Vite + Tailwind, Pinia. Folder komponentu pełni rolę przestrzeni nazw —
`components/tv/Board.vue`, nie `TvBoard.vue`. Potwierdzenia i komunikaty wyłącznie
przez `ui/Confirm.vue` i `ui/Toast.vue`; żadnych `window.confirm`, `alert`, `prompt`.

Ekran `/tv` projektujemy w `vw/vh` i `clamp()` na 1920×1080, `/play` pod kciuk.
Elementy, na których opierają się testy, mają `data-testid`.

## Testy

- `npm test` — silnik gry, bez bazy; tu pilnujemy zasad rozgrywki.
- `npm run e2e` — Playwright na żywej aplikacji (backend 7200, front 7201).
- `node tools/screenshots.mjs` — rozgrywa partię i odświeża zrzuty do README
  (`docs/screenshots/`). Zmieniając wygląd ekranów, odśwież też zrzuty.

Testy Playwright wstrzykują token admina do `localStorage` zamiast logować się
formularzem: endpoint logowania ma limit 5 prób / 5 min i zestaw testów by go wyczerpał.
Token jest cache'owany w `e2e/.auth-token`.

## Migracje

TypeORM z `synchronize: false`. Nazwa pliku i klasy używa **prawdziwego** timestampa
(`date +%s%3N`), nigdy zaokrąglonej liczby.

## Grafika i dźwięk

Assety marki (`frontend/public/brand/`) generowane w Nano Banana przez
`apipass-image`; dźwięki (`frontend/public/audio/`) syntezowane skryptem
`tools/generate_sounds.py`. Oba komplety są w repo — nie wymagają generowania
przed grą. Poprawiając pojedynczy dźwięk, zmieniaj jego funkcję `s_<nazwa>`
i generuj tylko ten plik.

## Wdrożenie

Kubernetes, namespace `cue`. `deploy/k8s/` to baza z przykładowymi wartościami
(`example.com`); prawdziwa domena, registry i adres publiczny żyją w nakładce
`deploy/local/`, wykluczonej z gita. **Repo jest publiczne — żadnych prawdziwych
domen, adresów serwerów ani nazw prywatnej infrastruktury w plikach śledzonych.**
Szczegóły konkretnego wdrożenia: `CLAUDE.local.md` (też poza gitem).

Zmienne `VITE_*` są build-time: produkcyjny build bierze `.env.production`
z pustym `VITE_API_URL`, żeby klient trzymał się originu strony.

## Treść pytań

Pakiety tematyczne w `backend/src/catalog/seed/data/`. Seed jest idempotentny
(dopasowanie po nazwie pakietu i treści pytania), więc dorzucenie pytań i ponowne
`npm run seed -w @cue/backend` nie duplikuje wpisów i nie rusza zmian z panelu admina.
Pytanie główne ma 3–10 odpowiedzi, finałowe dokładnie 10, wagi sumują się do maksymalnie 100.
