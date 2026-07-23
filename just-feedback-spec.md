# just-feedback — dokument techniczno-produktowy (spec dla AI-agenta)

> Wersja: 1.2 · Data: 2026-07-22
> Nazwa produktu: **just-feedback** · scope npm: `@codelionapps`.
> Ten dokument jest samowystarczalną specyfikacją: agent kodujący powinien być w stanie zaimplementować MVP wyłącznie na jego podstawie. W razie niedopowiedzeń stosować zasadę: **najprostsze rozwiązanie zgodne z duchem dokumentu**.

---

## 1. Przegląd produktu

just-feedback to self-hosted narzędzie do zbierania feedbacku z aplikacji mobilnych (w przyszłości także web). Składa się z trzech elementów:

1. **Backend** — paczka npm, jeden proces Node.js, przechowuje dane w SQLite, wystawia API dla klientów (SDK) oraz serwuje panel webowy.
2. **Panel webowy** — prosty SPA wbudowany w backend: przegląd feedbacków per projekt, zarządzanie projektami i kluczami API.
3. **SDK React Native** — paczka npm z gotowym modalem (textarea + przycisk), wysyła feedback do backendu przez URL + klucz API.

Priorytety projektowe: **prostota hostowania** (jedna komenda, zero zewnętrznych zależności infrastrukturalnych), **prostota obsługi panelu**, **minimalne SDK kompatybilne z Expo**.

---

## 2. Architektura systemu

```
┌─────────────────────┐        POST /api/v1/feedback        ┌──────────────────────────────┐
│  Aplikacja mobilna   │ ──────── X-Api-Key: jf_... ──────▶ │  Backend (jeden proces Node)  │
│  + just-feedback SDK (RN)  │                                     │                              │
└─────────────────────┘                                     │  ┌────────────────────────┐  │
                                                            │  │ REST API (Fastify)      │  │
┌─────────────────────┐   GET / (statyczne pliki SPA)       │  ├────────────────────────┤  │
│  Przeglądarka        │ ──────────────────────────────────▶ │  │ Panel web (React SPA,   │  │
│  (admin)             │   /api/admin/* (cookie sesji)       │  │ serwowany statycznie)   │  │
└─────────────────────┘                                     │  ├────────────────────────┤  │
                                                            │  │ SQLite (plik .db)       │  │
                                                            │  └────────────────────────┘  │
                                                            └──────────────────────────────┘
```

Kluczowe decyzje architektoniczne:

1. **Monorepo (npm workspaces)** — trzy paczki: `packages/server`, `packages/sdk-react-native`, `packages/panel`. Panel jest budowany do statycznych plików i dołączany do paczki serwera przy publikacji (build panelu kopiowany do `packages/server/dist/panel`).
2. **Jeden proces = całość backendu** — API + panel + baza w jednym procesie. Brak Redisa, brak kolejek, brak osobnego serwera bazy. Deploy = `npx @codelionapps/server start` na dowolnym VPS-ie.
3. **SQLite przez `better-sqlite3`** — plikowa baza, zero konfiguracji, WAL mode. Ścieżka konfigurowalna przez env.
4. **Dwa odrębne obszary API**: `/api/v1/*` (klienci z kluczem API — tylko wysyłanie feedbacku) oraz `/api/admin/*` (panel — sesja cookie po zalogowaniu hasłem admina).
5. **Klucze API przechowywane jako hash SHA-256** — pełny klucz pokazywany tylko raz przy utworzeniu.
6. **SDK bez natywnych zależności** — czysty TypeScript + `fetch` + `Platform` z RN core, dzięki czemu działa w Expo Go i bare RN bez linkowania.

---

## 3. Stack technologiczny

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Backend runtime | Node.js ≥ 20, TypeScript 5 | Paczka npm; LTS |
| Framework HTTP | Fastify 5 | Szybki, wbudowana walidacja schematów, `@fastify/static`, `@fastify/cookie`, `@fastify/rate-limit` |
| Baza danych | SQLite via `better-sqlite3` | Zero-config self-hosting; synchroniczne API upraszcza kod |
| Migracje | Własny, minimalny runner migracji (tabela `_migrations`, pliki `NNN_nazwa.sql` uruchamiane transakcyjnie przy starcie) | Bez ORM — mniej zależności; zapytania pisane ręcznie przez prepared statements |
| Walidacja | `zod` (współdzielone schematy request/response w `packages/server/src/schemas`) | Jedno źródło prawdy dla typów |
| Panel web | React 18 + Vite + TypeScript | Prosty SPA; build do statycznych plików |
| Stylowanie panelu | Czysty CSS (jeden plik `app.css`, CSS variables) | Zero zależności UI; panel jest mały |
| Routing panelu | `react-router-dom` | 3–4 widoki |
| SDK | TypeScript, `react` + `react-native` jako peerDependencies | Kompatybilność z Expo (bez natywnego kodu) |
| Testy | `vitest` (server: endpointy przez `fastify.inject`; panel: logika i komponenty i18n; SDK: logika klienta) | Lekki, szybki |
| CLI serwera | `commander` lub ręczny parsing `process.argv` (wystarczy `start`) | Minimalizm |

Nazwy paczek npm: `@codelionapps/server`, `@codelionapps/react-native`. Panel nie jest publikowany osobno.

---

## 4. Model danych (SQLite)

Wszystkie identyfikatory zasobów publicznych: UUID v4 zapisywane jako TEXT. Wyjątkiem jest wewnętrzny singleton `admin_credentials` z wymuszonym `id = 1`. Daty: ISO 8601 UTC (TEXT). Włączyć `PRAGMA journal_mode = WAL;` i `PRAGMA foreign_keys = ON;` przy starcie.

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,                -- 1..100 znaków
  created_at  TEXT NOT NULL
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                -- np. "iOS produkcja", 1..100 znaków
  key_hash    TEXT NOT NULL UNIQUE,         -- SHA-256 (hex) pełnego klucza
  key_prefix  TEXT NOT NULL,                -- pierwsze 12 znaków klucza, do wyświetlania (np. "jf_a1b2c3d4")
  created_at  TEXT NOT NULL,
  revoked_at  TEXT                          -- NULL = aktywny
);

CREATE TABLE feedbacks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,               -- 1..5000 znaków (po trim)
  status       TEXT NOT NULL DEFAULT 'new', -- 'new' | 'read' | 'archived'
  app_version  TEXT,                        -- metadane, wszystkie opcjonalne
  platform     TEXT,                        -- 'ios' | 'android' | 'web' | inne
  os_version   TEXT,
  device_model TEXT,
  user_ref     TEXT,                        -- opcjonalny email lub ID użytkownika
  api_key_id   TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_feedbacks_project_status ON feedbacks(project_id, status, created_at DESC);

CREATE TABLE admin_credentials (
  id             INTEGER PRIMARY KEY CHECK (id = 1), -- singleton: jedna instancja = jeden admin
  password_hash  TEXT NOT NULL,                       -- wersjonowany zapis scrypt z solą i parametrami
  created_at     TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash  TEXT PRIMARY KEY,             -- SHA-256 tokenu sesji
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL                 -- created_at + 30 dni
);
```

Reguły statusów feedbacku:
- Nowy feedback zawsze wchodzi ze statusem `new`.
- Przejścia: `new → read` (odczytanie), `new|read → archived`, `archived → read` (przywrócenie). Usunięcie = twardy DELETE.
- Wygasłe sesje czyszczone leniwie przy każdej walidacji sesji (`DELETE FROM admin_sessions WHERE expires_at < now`).

Reguły danych administratora:
- Brak rekordu `admin_credentials` oznacza niezainicjalizowaną instancję i uruchamia onboarding pierwszego startu.
- Tabela jest singletonem (`id = 1`); utworzenie drugiego administratora nie jest możliwe.
- Hasło nigdy nie trafia do bazy w postaci jawnej. `password_hash` ma format `scrypt$v=1$N=32768,r=8,p=1$<salt_hex>$<hash_hex>`, tak aby parametry można było w przyszłości podnieść bez zmiany schematu.
- Hashowanie: `crypto.scrypt` z `N=32768`, `r=8`, `p=1`, `maxmem=64 MiB`, losową solą 16 bajtów i wynikiem 32 bajty. Weryfikacja wyniku przez `crypto.timingSafeEqual`.

---

## 5. Backend — specyfikacja API

### 5.1 Konfiguracja (zmienne środowiskowe)

| Zmienna | Wymagana | Domyślna | Opis |
|---|---|---|---|
| `JF_ADMIN_PASSWORD` | ❌ | — | Opcjonalne hasło bootstrapowe pierwszego onboardingu. Gdy baza nie ma jeszcze administratora, zastępuje pole ustawiania hasła. Po ukończeniu onboardingu logowanie zawsze używa hasha z bazy, a env jest ignorowane. Jeśli ustawione podczas pierwszego startu, musi mieć min. 8 znaków. |
| `JF_SESSION_SECRET` | ❌ | generowany i zapisywany do pliku obok bazy (`.session-secret`) | Sekret do podpisywania cookies. |
| `JF_DB_PATH` | ❌ | `./just-feedback.db` | Ścieżka pliku SQLite. |
| `JF_PORT` | ❌ | `4180` | Port HTTP. |
| `JF_HOST` | ❌ | `0.0.0.0` | Adres bindowania. |
| `JF_RATE_LIMIT_PER_MINUTE` | ❌ | `10` | Limit POST /feedback per klucz API. |
| `JF_TRUST_PROXY` | ❌ | `false` | Ustawić `true` za reverse proxy (poprawne IP do rate limitu). |
| `JF_ADMIN_PORT` | ❌ | — | Gdy ustawiony: panel + `/api/admin/*` przenoszą się na osobny port (druga instancja Fastify na tej samej bazie), a port główny serwuje **wyłącznie** `/api/v1/*`. Pozwala wystawić publicznie tylko endpoint kliencki, a admina trzymać za firewallem/VPN. Gdy brak — wszystko na jednym porcie (domyślny, najprostszy tryb). |

Uruchamianie: `npx @codelionapps/server start` (bin `just-feedback` w package.json). CLI wspiera też flagi `--port`, `--db` nadpisujące env. Przy starcie logować: port, ścieżkę bazy, liczbę zastosowanych migracji.

Pierwszy start nie wymaga `JF_ADMIN_PASSWORD`. Jeśli `admin_credentials` jest puste, serwer:
1. Generuje kryptograficznie losowy token setupu (32 bajty, hex), przechowywany wyłącznie w pamięci procesu.
2. Loguje token oraz link `http://localhost:<admin-port-lub-port>/onboarding#setup=<token>`. Dla zdalnego hosta administrator podmienia host w URL lub wkleja sam token w formularzu.
3. Zachowuje token do udanego, atomowego ukończenia onboardingu albo restartu procesu. Nieudana walidacja nie zużywa tokenu; restart generuje nowy.

Jeśli `JF_ADMIN_PASSWORD` istnieje przy niezainicjalizowanej bazie, ale ma mniej niż 8 znaków, walidacja konfiguracji zatrzymuje start z czytelnym błędem. Prawidłowa wartość jest hashowana i zapisywana dopiero w transakcji kończącej onboarding. Po utworzeniu `admin_credentials` env nie może zmienić działającego hasła. Jeśli nadal jest ustawione przy kolejnych startach, serwer uruchamia się normalnie i loguje ostrzeżenie, że zmienna została zignorowana dla już zainicjalizowanej instancji; jej długość nie jest wtedy ponownie walidowana.

W repo dołączyć przykładowy `Dockerfile` i sekcję README o deploy (systemd / Docker / Railway), ale Docker nie jest wymagany do działania.

### 5.2 API klienckie (`/api/v1`) — autoryzacja kluczem

Autoryzacja: nagłówek `X-Api-Key: jf_<40 znaków base62>`. Serwer liczy SHA-256 nagłówka i szuka w `api_keys` (aktywny = `revoked_at IS NULL`). Brak/zły/odwołany klucz → `401 {"error":"invalid_api_key"}`.

#### `POST /api/v1/feedback`

Request body (JSON, limit rozmiaru body: 32 KB):
```jsonc
{
  "content": "string, wymagane, 1..5000 znaków po trim",
  "metadata": {                    // całość opcjonalna, każde pole opcjonalne
    "appVersion": "string ≤ 50",
    "platform": "string ≤ 20",     // SDK wysyła 'ios' | 'android'
    "osVersion": "string ≤ 50",
    "deviceModel": "string ≤ 100",
    "userRef": "string ≤ 200"      // email lub dowolny identyfikator
  }
}
```

Odpowiedzi:
- `201 {"id":"<uuid>"}` — utworzono; projekt wynika z klucza API.
- `400 {"error":"validation_error","details":[...]}` — walidacja zod (puste content, przekroczone limity).
- `401` — jak wyżej. `429 {"error":"rate_limited"}` — patrz 5.4.

Pola metadata przekraczające limit długości → **przycinać** (nie odrzucać całego requestu); tylko `content` waliduje twardo.

CORS dla `/api/v1/*`: `Access-Control-Allow-Origin: *` (przyszli klienci webowi); dozwolone nagłówki `Content-Type, X-Api-Key`, metody `POST, OPTIONS`.

### 5.3 API panelu (`/api/admin`) — autoryzacja sesją

Autoryzacja po onboardingu: cookie `jf_session` (httpOnly, SameSite=Lax, Secure gdy request przez HTTPS), wartość = losowe 32 bajty hex, podpisane `@fastify/cookie`. Serwer trzyma hash tokenu w `admin_sessions`. Brak/zła sesja → `401 {"error":"unauthorized"}`. CORS: brak (same-origin only).

Wyjątkiem są dwa endpointy setupu. `GET /api/admin/setup/status` jest zawsze dostępny bez sesji i ujawnia wyłącznie stan inicjalizacji. `POST /api/admin/setup` działa tylko przed utworzeniem `admin_credentials` i wymaga tokenu z logów w nagłówku `X-Setup-Token`. Token porównywać w stałym czasie; limit obu prób setupu i logowania: 5/min per IP.

#### `GET /api/admin/setup/status`

Odpowiedź `200`:

```json
{
  "setupRequired": true,
  "passwordRequired": true
}
```

- `setupRequired` wynika wyłącznie z braku rekordu `admin_credentials`.
- `passwordRequired` jest `true` tylko przed setupem i przy braku prawidłowego `JF_ADMIN_PASSWORD`; po setupie zwraca `false`.

#### `POST /api/admin/setup`

Nagłówek: `X-Setup-Token: <64 znaki hex z logów>`.

Body:

```jsonc
{
  "password": "min. 8 znaków", // wymagane tylko, gdy passwordRequired=true
  "project": {                  // opcjonalne; null oznacza "Pomiń"
    "name": "Moja aplikacja",  // 1..100 znaków po trim
    "keyLabel": "Domyślny"     // 1..100 znaków po trim
  }
}
```

Jeśli dostępne jest hasło bootstrapowe z env, handler nie przyjmuje hasła z body jako alternatywnego źródła i zawsze hashuje wartość z env. Jeśli env nie ma, `password` jest wymagane. Pole potwierdzenia hasła istnieje tylko w UI i nie jest częścią API. Walidację, generowanie losowych wartości oraz kosztowne wyliczenie scrypt wykonać przed otwarciem transakcji SQLite; bezpośrednio przed zapisem transakcja ponownie sprawdza stan inicjalizacji.

W jednej transakcji SQLite handler:
1. Ponownie sprawdza brak `admin_credentials`, aby rozstrzygnąć równoległe żądania.
2. Zapisuje hash hasła administratora.
3. Opcjonalnie tworzy projekt oraz pierwszy klucz API według istniejących reguł generowania i hashowania kluczy.
4. Tworzy sesję administratora.

Po commit ustawia cookie `jf_session`, unieważnia token setupu w pamięci i zwraca `201`:

```jsonc
{
  "project": { "id": "<uuid>", "name": "Moja aplikacja", "createdAt": "<iso>" }, // albo null
  "apiKey": {
    "id": "<uuid>",
    "label": "Domyślny",
    "keyPrefix": "jf_a1b2c3d4",
    "key": "jf_<pełny klucz>"
  } // albo null
}
```

Pełny klucz jest widoczny tylko w tej odpowiedzi. Utrata odpowiedzi nie cofa setupu; administrator może po zalogowaniu wygenerować kolejny klucz w ustawieniach projektu.

Odpowiedzi błędów:
- `400 {"error":"validation_error","details":[...]}` — brak/za krótkie hasło, niepełny `project` lub błędne limity.
- `403 {"error":"invalid_setup_token"}` — brak lub zły token.
- `409 {"error":"already_initialized"}` — onboarding został już ukończony, również przez równoległe żądanie.
- `429 {"error":"rate_limited"}` — przekroczony limit prób per IP.

Każdy błąd przed commit powoduje rollback credentiala, projektu, klucza i sesji; token setupu pozostaje ważny po błędzie walidacji lub przejściowym błędzie serwera.

| Metoda i ścieżka | Opis |
|---|---|
| `POST /api/admin/login` | Body `{"password": "..."}`. Weryfikacja względem scrypt hash z `admin_credentials`. OK → tworzy sesję, ustawia cookie, `204`. Błędne → `401`. Przed ukończeniem onboardingu → `409 {"error":"setup_required"}`. Rate limit: 5/min per IP. |
| `POST /api/admin/logout` | Usuwa sesję z DB i cookie. `204`. |
| `GET /api/admin/me` | `204` gdy sesja ważna (panel sprawdza stan zalogowania przy starcie). |
| `GET /api/admin/projects` | Lista projektów + liczniki: `[{id, name, createdAt, newCount, totalCount}]`, sortowanie po `createdAt` rosnąco. |
| `POST /api/admin/projects` | Body `{"name": "..."}` → `201 {id, name, createdAt}`. |
| `PATCH /api/admin/projects/:id` | Body `{"name": "..."}` — zmiana nazwy. `200`. |
| `DELETE /api/admin/projects/:id` | Kasuje projekt kaskadowo (klucze + feedbacki). `204`. |
| `GET /api/admin/projects/:id/feedbacks` | Query: `status` = `active` (domyślnie: new+read) \| `archived`; `limit` (domyślnie 50, max 100); `offset`. Zwraca `{items: [...], total}` posortowane `created_at DESC`. Item: `{id, content, status, appVersion, platform, osVersion, deviceModel, userRef, createdAt}`. |
| `PATCH /api/admin/feedbacks/:id` | Body `{"status": "read" \| "archived"}`. `200`. |
| `POST /api/admin/projects/:id/feedbacks/mark-all-read` | Wszystkie `new` → `read` w projekcie. `200 {"updated": n}`. |
| `DELETE /api/admin/feedbacks/:id` | Twarde usunięcie. `204`. |
| `GET /api/admin/projects/:id/keys` | `[{id, label, keyPrefix, createdAt, revokedAt}]`. |
| `POST /api/admin/projects/:id/keys` | Body `{"label": "..."}` → `201 {id, label, keyPrefix, key: "jf_..."}`. **Pełny `key` zwracany tylko tutaj.** |
| `POST /api/admin/keys/:id/revoke` | Ustawia `revoked_at`. `204`. |

Nieistniejące zasoby → `404 {"error":"not_found"}`.

### 5.4 Bezpieczeństwo backendu (podsumowanie)

1. **Klucz API per projekt**, hash w bazie, prefix do identyfikacji, natychmiastowa rewokacja.
2. **Hasło admina**: wersjonowany scrypt hash z osobną losową solą; env służy wyłącznie jako bootstrap pustej instancji i po setupie nie bierze udziału w logowaniu.
3. **Token setupu**: 32 losowe bajty, tylko w pamięci i logach administratora; porównanie w stałym czasie, rotacja po restarcie i trwałe zamknięcie setupu po pierwszym commit.
4. **Rate limiting** (`@fastify/rate-limit`): `POST /api/v1/feedback` — `JF_RATE_LIMIT_PER_MINUTE` per klucz (fallback: per IP przy braku klucza); `POST /api/admin/login` i `POST /api/admin/setup` — 5/min per IP. Store in-memory.
5. **Limity rozmiaru**: body 32 KB, `content` 5000 znaków — chroni bazę przed spamem objętościowym.
6. **Sesja admina**: httpOnly cookie, token losowy, hash w DB, TTL 30 dni, porównania hashów.
7. **Nagłówki**: `X-Content-Type-Options: nosniff`; panel serwowany z `Cache-Control: no-store` dla `index.html`.
8. Poza zakresem MVP (sekcja 10): podpis HMAC requestów SDK, captcha/proof-of-work, multi-user.

### 5.5 Ekspozycja publiczna (model deploymentu)

Endpoint kliencki `/api/v1/feedback` **musi być osiągalny z publicznego internetu**, bo wywołują go aplikacje na urządzeniach użytkowników. Wspierane tryby, od najprostszego:

1. **Standalone publicznie (domyślny, rekomendowany dla MVP)** — cała instancja za reverse proxy z HTTPS (Caddy/nginx). Powierzchnia ataku jest mała: jeden POST chroniony kluczem + rate limitem oraz login chroniony hasłem + rate limitem; dane mają niską wrażliwość. README pokazuje minimalny Caddyfile.
2. **Hardening na poziomie reverse proxy (zalecany krok po MVP)** — publicznie przepuszczać tylko `/api/v1/*`; ścieżki `/` i `/api/admin/*` ograniczyć w proxy do allowlisty IP / VPN / basic auth. Zero zmian w kodzie.
3. **Rozdzielenie portów przez `JF_ADMIN_PORT`** — patrz 5.1: publiczny port tylko z API klienckim, admin na prywatnym porcie za firewallem. Odpowiednik "proxy backendowego", ale bez utrzymywania osobnej usługi.

Świadomie **nie budujemy osobnej aplikacji-proxy** przed backendem: przeczyłoby to celowi "łatwe do hostowania", a tryby 2–3 dają ten sam efekt bez dodatkowego procesu.

### 5.6 Serwowanie panelu

`@fastify/static` serwuje `dist/panel` pod `/`. Fallback SPA: każdy GET niepasujący do `/api/*` i niebędący plikiem → `index.html`.

---

## 6. Panel webowy — specyfikacja UI

Zasada nadrzędna: **panel ma być oczywisty bez instrukcji**. Minimalna liczba widoków, brak dashboardów i wykresów w MVP. Panel w MVP obsługuje dwa kompletne języki UI: **polski (`pl`) i angielski (`en`)**.

### 6.1 Lokalizacja panelu (i18n)

- Wszystkie teksty należące do interfejsu muszą pochodzić ze wspólnego mechanizmu lokalizacji: etykiety, przyciski, nagłówki, puste stany, potwierdzenia, komunikaty walidacji i błędów, toasty, teksty onboardingowe oraz etykiety dostępności (`aria-*`). Nie tłumaczyć treści feedbacków, nazw projektów, etykiet kluczy ani innych danych wpisanych przez użytkownika.
- Tłumaczenia przechowywać w dwóch typowanych słownikach (`pl` i `en`) o identycznym zestawie kluczy. Wystarczy mały własny provider/hook oparty o React Context; zewnętrzna biblioteka i18n nie jest wymagana.
- Przy pierwszej wizycie wybrać `pl`, jeśli pierwszy preferowany język przeglądarki (`navigator.languages[0]` / `navigator.language`) zaczyna się od `pl`; we wszystkich pozostałych przypadkach wybrać `en`.
- Wybrany język zapisywać w `localStorage` pod kluczem `jf_locale`; zapisana poprawna wartość ma pierwszeństwo przed preferencją przeglądarki. Brakujący klucz tłumaczenia ma bezpiecznie wracać do angielskiego.
- Przełącznik języka `PL / EN` ma być dostępny bez logowania na ekranach onboardingu i logowania oraz po zalogowaniu w stałym miejscu layoutu (np. na dole sidebara). Zmiana języka działa natychmiast, bez przeładowania strony i bez utraty wpisanych danych formularza.
- Daty i czasy względne formatować zgodnie z aktywnym locale przez `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` (`pl-PL` albo `en-US`), a atrybut `<html lang>` aktualizować na `pl` lub `en`.
- Kody błędów API, statusy w bazie i format request/response pozostają niezależne od języka; panel mapuje je na przetłumaczone komunikaty. Polskie teksty podane w dalszych sekcjach UI są treścią referencyjną i wymagają równoważnych znaczeniowo wersji angielskich.

### 6.2 Struktura widoków (react-router)

```
/onboarding                → Pierwszy setup administratora, projektu i klucza
/login                     → Logowanie
/                          → redirect na pierwszy projekt lub pusty stan
/projects/:id              → Lista feedbacków projektu (widok główny)
/projects/:id/settings     → Ustawienia projektu (klucze API, nazwa, usuwanie)
```

Layout po zalogowaniu: **lewy sidebar** (lista projektów) + **główna kolumna** (treść widoku). Na szerokości < 768 px sidebar zwijany do menu (przycisk hamburger) — wystarczy proste rozwiązanie CSS.

Przed rozstrzygnięciem routingu panel pobiera `GET /api/admin/setup/status`:
- `setupRequired=true` → każda ścieżka panelu przekierowuje przez `replace` do `/onboarding`, bez renderowania ekranu logowania ani chronionego layoutu.
- `setupRequired=false` → `/onboarding` nie jest już dostępny; zalogowany admin trafia na `/`, a niezalogowany na `/login`.
- Błąd pobierania statusu pokazuje stan błędu z przyciskiem „Spróbuj ponownie”; panel nie może na podstawie błędu zakładać, że setup jest ukończony.

### 6.3 Widok: onboarding

Onboarding jest osobnym, responsywnym widokiem bez sidebara. Formularz ma pojedynczą kolumnę, etykiety nad polami, błędy bezpośrednio pod właściwymi polami oraz widoczny wskaźnik bieżącego kroku. Na początku panel pokazuje skeleton odpowiadający docelowemu formularzowi do czasu odpowiedzi `setup/status`.

Token setupu:
- Link z logów ma postać `/onboarding#setup=<token>`. Panel odczytuje token z fragmentu URL, który nie jest wysyłany w requestach HTTP, i trzyma go tylko w stanie bieżącej strony; nie zapisuje go w `localStorage`.
- Wejście bez tokenu pokazuje instrukcję „Otwórz link konfiguracji widoczny w logach serwera” oraz pole „Token konfiguracji” do ręcznego wklejenia. Poprawne wklejenie normalizuje URL do fragmentu `#setup=<token>` i przechodzi do formularza, dzięki czemu odświeżenie strony nie gubi tokenu.
- Token jest wysyłany wyłącznie jako `X-Setup-Token` w końcowym `POST /api/admin/setup`.

Kroki:
1. **Hasło administratora** — widoczne tylko przy `passwordRequired=true`. Pola „Hasło” i „Powtórz hasło”, minimum 8 znaków; niezgodność jest walidowana lokalnie. Przy bootstrapie env krok jest pomijany, a kolejny ekran pokazuje neutralną informację „Hasło administratora skonfigurowano na serwerze”.
2. **Pierwszy projekt** — pole „Nazwa projektu” oraz „Etykieta klucza API”, domyślnie „Domyślny”. Główna akcja „Utwórz projekt i klucz” wysyła setup. Drugorzędna akcja „Pomiń na razie” wysyła `project: null`; wymaga pojedynczego potwierdzenia tekstem, że projekt będzie można utworzyć później.
3. **Zapisz klucz** — tylko po utworzeniu projektu. Pokazuje pełny klucz, przycisk „Kopiuj”, gotowy snippet SDK z bieżącym originem oraz ostrzeżenie „Zapisz ten klucz — nie będzie można go ponownie wyświetlić”. Akcja „Przejdź do projektu” usuwa fragment z tokenem przez nawigację `replace` i otwiera `/projects/:id`.

Po wariancie „Pomiń” setup również tworzy credential i sesję, po czym nawigacja `replace` prowadzi do `/`, gdzie istniejący pusty stan pozwala utworzyć projekt. Back/przeładowanie przed końcowym submit zachowuje ważność tokenu, ale nie musi utrwalać wpisanych danych formularza.

Stany błędów i interakcji:
- Podczas hashowania i transakcji przyciski oraz pola są zablokowane, główna akcja pokazuje stan „Konfiguruję…”, a drugi submit jest niemożliwy.
- `400` mapuje błędy walidacji do pól bez kasowania danych.
- `403 invalid_setup_token` pokazuje komunikat o nieważnym lub wygasłym tokenie oraz powrót do pola tokenu.
- `409 already_initialized` ponownie pobiera status i prowadzi do `/login` albo `/`, zależnie od sesji.
- Błąd sieci/5xx zachowuje dane i token oraz pokazuje błąd inline z akcją ponowienia.
- Po skopiowaniu klucza przycisk na krótko zmienia etykietę na „Skopiowano”; focus, kolejność tabulacji i komunikaty błędów muszą być dostępne dla czytników ekranu.

### 6.4 Widok: logowanie

Wyśrodkowana karta: logo/nazwa "just-feedback", pole hasła, przycisk "Zaloguj". Błędne hasło → komunikat inline "Nieprawidłowe hasło" pod polem. Po sukcesie redirect na `/`.

### 6.5 Sidebar

- Nagłówek "Projekty" + przycisk `+ Nowy projekt` (otwiera prompt-modal z jednym polem "Nazwa projektu" i przyciskiem "Utwórz").
- Lista projektów: nazwa + badge z liczbą nowych feedbacków (`newCount`, ukryty gdy 0). Aktywny projekt wyróżniony tłem.
- Na dole: przycisk "Wyloguj".
- Pusty stan (0 projektów): główna kolumna pokazuje ilustracyjny tekst "Nie masz jeszcze projektów" + duży przycisk "Utwórz pierwszy projekt".

### 6.6 Widok: lista feedbacków

Nagłówek: nazwa projektu, po prawej link-ikona ⚙ do ustawień oraz przycisk **"Oznacz wszystkie jako przeczytane"** (widoczny tylko, gdy `newCount > 0`; po kliknięciu odświeża listę).

Pod nagłówkiem przełącznik (segmented control): **Aktywne** (domyślnie, status new+read) / **Archiwum**.

Lista — każdy wiersz (karta):
- **Treść**: przycięta do **200 znaków** + "…". Jeśli treść dłuższa, widoczny link "Pokaż więcej" rozwijający pełną treść in-place ("Zwiń" do schowania).
- **Metadane** (tylko niepuste) jako szare chipy pod treścią: `iOS 17.4`, `v2.1.0`, `iPhone 15`, `user@example.com`. Format: platforma+osVersion łączone w jeden chip; appVersion z prefiksem "v".
- **Data**: relatywna ("2 godz. temu", "wczoraj", starsze: `12 mar 2026`), wyrównana do prawej.
- **Stan "nowy"**: kropka-accent po lewej krawędzi karty + pogrubiona treść + delikatne tło akcentowe. Po **kliknięciu w kartę** feedback natychmiast (optymistycznie) staje się `read` i traci wyróżnienie; klik w kartę jednocześnie rozwija/zwija długą treść.
- **Akcje** wiersza (ikony po prawej, widoczne na hover / zawsze na mobile): w widoku Aktywne — "Archiwizuj" i "Usuń"; w Archiwum — "Przywróć" (→ `read`) i "Usuń". "Usuń" wymaga potwierdzenia (mini-confirm: "Usunąć bezpowrotnie? [Usuń] [Anuluj]").

Paginacja: przycisk "Załaduj więcej" na dole (doładowuje kolejne 50). Pusty stan listy: "Brak feedbacków — podłącz SDK, aby zacząć je zbierać" + link do ustawień/kluczy.

### 6.7 Widok: ustawienia projektu

Sekcje od góry:
1. **Nazwa projektu** — pole + "Zapisz".
2. **Klucze API** — tabela: etykieta, prefix (`jf_a1b2c3d4…`), data utworzenia, status (Aktywny / Odwołany), akcja "Odwołaj" (z potwierdzeniem). Przycisk "+ Nowy klucz" → modal z polem "Etykieta" → po utworzeniu modal sukcesu z **pełnym kluczem**, przyciskiem "Kopiuj" i ostrzeżeniem: "Zapisz ten klucz — nie będzie można go ponownie wyświetlić". Obok klucza pokazać gotowy snippet konfiguracji SDK z wstawionym kluczem i URL-em instancji.
3. **Strefa niebezpieczna** — "Usuń projekt" (czerwony), confirm wymaga przepisania nazwy projektu.

### 6.8 Styl wizualny

- CSS variables: `--bg: #fafafa; --surface: #ffffff; --text: #1a1a1a; --muted: #6b7280; --accent: #4f46e5; --danger: #dc2626; --border: #e5e7eb; --radius: 10px`.
- Font systemowy (`-apple-system, Segoe UI, Roboto, sans-serif`). Karty z 1px borderem, bez cieni albo cień ledwo widoczny. Dużo światła, brak dekoracji.
- Wszystkie akcje mutujące: optymistyczny update + toast błędu ("Coś poszło nie tak, spróbuj ponownie") przy niepowodzeniu.

---

## 7. SDK React Native — specyfikacja

Paczka: `@codelionapps/react-native`. `peerDependencies`: `react >= 18`, `react-native >= 0.72`. **Zero dependencies i zero natywnego kodu** — wyłącznie JS/TS (`fetch`, `Modal`, `Platform` z RN core). Dzięki temu działa w Expo Go, Expo dev build i bare RN bez instalacji podów.

### 7.1 Publiczne API

```tsx
import { FeedbackProvider, FeedbackModal, useFeedback, sendFeedback } from '@codelionapps/react-native';

// 1. Provider u korzenia aplikacji — konfiguracja
<FeedbackProvider
  config={{
    url: 'https://feedback.mojafirma.pl',   // baza URL instancji (bez /api/...)
    apiKey: 'jf_...',
    metadata: {                              // wszystko opcjonalne
      appVersion: '2.1.0',                  // dev podaje sam (np. z expo-application) — SDK tego nie wykrywa
      deviceModel: 'iPhone 15',             // jw.
      userRef: 'user@example.com',
    },
  }}
>
  <App />
</FeedbackProvider>

// 2a. Sterowanie deklaratywne
const [visible, setVisible] = useState(false);
<FeedbackModal visible={visible} onClose={() => setVisible(false)} />

// 2b. Sterowanie imperatywne (cukier na tym samym stanie)
const { openFeedback } = useFeedback();
<Button title="Zgłoś uwagę" onPress={openFeedback} />
// useFeedback() zwraca też: closeFeedback(), isOpen

// 3. Low-level (bez UI) — dla własnych interfejsów
await sendFeedback({ url, apiKey, content, metadata }); // rzuca JustFeedbackError przy błędzie
```

SDK **automatycznie dokłada** do metadata: `platform` (`Platform.OS`) i `osVersion` (`String(Platform.Version)`). Pola podane przez developera mają pierwszeństwo. `FeedbackProvider` renderuje jedną instancję `FeedbackModal` podpiętą pod stan z `useFeedback` — jeśli developer używa tylko hooka, nie musi montować modala samodzielnie; jawnie zamontowany `<FeedbackModal>` z propsami nadpisuje ten wbudowany (props `visible` ma priorytet nad stanem kontekstu).

### 7.2 Konfiguracja copy i stylów

Wszystko opcjonalne, z polskimi/angielskimi defaultami po angielsku (produkt międzynarodowy); nadpisywalne per Provider lub per instancja `FeedbackModal` (props modala > config providera):

```ts
copy?: {
  title?: string;          // "Share your feedback"
  placeholder?: string;    // "Tell us what's on your mind…"
  cta?: string;            // "Send"
  cancel?: string;         // "Cancel"
  successMessage?: string; // "Thanks! Your feedback was sent."
  errorMessage?: string;   // "Couldn't send feedback. Please try again."
}
styles?: {
  overlay?: ViewStyle; container?: ViewStyle; title?: TextStyle;
  input?: TextStyle; ctaButton?: ViewStyle; ctaButtonText?: TextStyle;
  cancelText?: TextStyle;
}
```

### 7.3 Zachowanie modala (MVP)

- `Modal` RN: `transparent`, `animationType="slide"`, wycentrowana/dolna karta na półprzezroczystym overlay'u; `KeyboardAvoidingView`, aby klawiatura nie zasłaniała pola.
- Zawartość: tytuł, multiline `TextInput` (min. 5 linii, maxLength 5000, autoFocus), przycisk CTA, tekstowy przycisk "Cancel". Zamknięcie także przez tap w overlay i systemowy back (Android).
- CTA disabled, gdy treść po trim pusta. Podczas wysyłki: spinner w przycisku, pola zablokowane.
- Sukces: treść modala podmienia się na `successMessage` (ikona ✓), auto-zamknięcie po 1,5 s, czyszczenie pola.
- Błąd (sieć / 4xx / 5xx): inline `errorMessage` pod polem, treść zostaje, można ponowić. Timeout żądania: 10 s (`AbortController`).
- Stan tekstu trzymany w modalu; nie utrwalać nic na dysku.

---

## 8. Struktura repozytorium (monorepo, npm workspaces)

```
just-feedback/
├── package.json                  # workspaces: ["packages/*"], skrypty: build, test, dev
├── tsconfig.base.json
├── README.md                     # quickstart: deploy serwera + integracja SDK
├── Dockerfile                    # opcjonalny deploy serwera
└── packages/
    ├── server/                   # @codelionapps/server
    │   ├── package.json          # bin: { "just-feedback": "dist/cli.js" }, files: ["dist"]
    │   └── src/
    │       ├── cli.ts            # parsowanie argv → start()
    │       ├── app.ts            # buildApp(): rejestracja pluginów, tras, statyki
    │       ├── config.ts         # odczyt i walidacja env
    │       ├── db/
    │       │   ├── index.ts      # połączenie better-sqlite3, PRAGMA
    │       │   ├── migrate.ts    # runner migracji
    │       │   └── migrations/001_init.sql
    │       ├── routes/
    │       │   ├── client.ts     # /api/v1/feedback
    │       │   └── admin/        # setup.ts, auth.ts, projects.ts, feedbacks.ts, keys.ts
    │       ├── auth/             # password.ts (scrypt), apiKey.ts (hash+lookup), session.ts
    │       ├── schemas/          # zod
    │       └── test/             # vitest, testy przez app.inject()
    ├── panel/                    # prywatna paczka (React+Vite); build → ../server/dist/panel
    │   └── src/ (main.tsx, api.ts, strings.ts, app.css, views/, components/)
    └── sdk-react-native/         # @codelionapps/react-native
        └── src/ (index.ts, FeedbackProvider.tsx, FeedbackModal.tsx, useFeedback.ts, client.ts, types.ts)
```

Kolejność builda: `panel` → `server` (skrypt kopiuje build panelu) → `sdk`. Publikacja: `@codelionapps/server` i `@codelionapps/react-native`.

Quickstart w README zaczyna się od `npx @codelionapps/server start` bez wymaganych sekretów. Pokazuje odczytanie jednorazowego linku setupu z logów, wariant z opcjonalnym `JF_ADMIN_PASSWORD`, konieczność trwałego przechowywania pliku SQLite oraz informację, że po ukończeniu onboardingu późniejsze wartości `JF_ADMIN_PASSWORD` są ignorowane.

---

## 9. Kryteria akceptacji MVP

1. `npx @codelionapps/server start` bez `JF_ADMIN_PASSWORD` uruchamia instancję pod `http://localhost:4180`, tworzy/migruje bazę i loguje jednorazowy link setupu zamiast odmawiać startu.
2. Link setupu otwiera onboarding; zły token daje `403`, a po restarcie działa wyłącznie nowy token. Endpoint setupu jest niedostępny po pierwszym udanym ukończeniu (`409`).
3. Bez env onboarding wymaga hasła i potwierdzenia. Z `JF_ADMIN_PASSWORD` pomija krok hasła, zapisuje jego scrypt hash podczas ukończenia i nie zapisuje plaintextu. Późniejsza zmiana env nie zmienia hasła logowania.
4. Onboarding pozwala atomowo utworzyć administratora, pierwszy projekt, pierwszy klucz i sesję. Pełny klucz jest widoczny raz wraz ze snippetem SDK, a wygenerowany klucz od razu autoryzuje `POST /api/v1/feedback`.
5. Wariant „Pomiń na razie” atomowo tworzy wyłącznie administratora i sesję, po czym pokazuje istniejący pusty stan projektów. Błąd dowolnej części setupu nie pozostawia częściowych danych.
6. Dwa równoległe poprawne żądania setupu nie tworzą dwóch administratorów ani projektów: pierwsze kończy się `201`, drugie `409`.
7. Po onboardingu administrator jest automatycznie zalogowany. Ponowne wejście na `/onboarding` prowadzi do panelu lub `/login`; chronione endpointy admina bez sesji nadal zwracają `401`.
8. Aplikacja RN (Expo Go) z SDK skonfigurowanym URL-em i kluczem wysyła feedback; pojawia się on w panelu jako "nowy" z chipami metadanych, bez odświeżania strony po ponownym wejściu w projekt.
9. Klik w feedback oznacza go jako przeczytany; "Oznacz wszystkie jako przeczytane" działa; archiwizacja przenosi do zakładki Archiwum; usunięcie po potwierdzeniu znika trwale.
10. Treść > 200 znaków jest przycięta i rozwijalna.
11. Odwołany klucz natychmiast dostaje `401`; 11. request w minucie na jednym kluczu dostaje `429` (przy domyślnym limicie).
12. Cały panel (onboarding, logowanie i widoki po zalogowaniu) jest dostępny po polsku i angielsku. Pierwszy język wynika z preferencji przeglądarki, wybór `PL / EN` jest zapamiętywany, a przełączenie aktualizuje teksty i format dat bez przeładowania ani utraty danych formularza.
13. Testy `vitest` pokrywają: status i ochronę setupu, oba źródła hasła, brak plaintextu w bazie, setup z projektem i bez, rollback i wyścig inicjalizacji, automatyczną sesję, login/logout, natychmiastowe użycie pierwszego klucza, autoryzację klucza, walidację feedbacku oraz pełny cykl statusów. Testy panelu sprawdzają również wybór locale z przeglądarki i `localStorage`, kompletność obu słowników oraz zmianę języka bez przeładowania.

---

## 10. Poza zakresem MVP (roadmapa)

- SDK web (JS) i podpis HMAC requestów jako mocniejsza autoryzacja klientów.
- Wiele kont adminów / role; powiadomienia (email/Slack/webhook) o nowym feedbacku.
- Załączniki (screenshoty), oceny gwiazdkowe, kategorie feedbacku, wyszukiwarka i filtry po metadanych.
- Eksport CSV; wsparcie Postgres; tryb ciemny panelu.

## 11. Kwestie otwarte

1. Docelowa nazwa produktu i scope npm (obecnie robocze `just-feedback` / `@feedbox`) — sprawdzić dostępność przed publikacją.
2. Czy instancja będzie publicznie dostępna w internecie (rekomendowany reverse proxy z HTTPS — Caddy/nginx), czy tylko w sieci prywatnej.
