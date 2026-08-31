# Chat API з обліком токенів і вартості

## 1. Що це

REST API для чат-сесій поверх OpenAI: кожна відповідь моделі будується на
релевантній історії сесії під токен-бюджетом, а кожна взаємодія обліковується
в токенах і в доларах.

## 2. Стек

- **Node.js 22+**, **TypeScript**
- **NestJS** — працює на платформі Express (`@nestjs/platform-express`), тобто
  вимога ТЗ щодо Node.js/Express.js виконана
- **PostgreSQL 16** (у Docker) + **TypeORM** (`@nestjs/typeorm`) — точний тип
  `numeric` для грошей, транзакції, foreign keys
- **OpenAI Responses API** (`store: false`, стан сесії лишається в нашій БД)
- **`gpt-tokenizer`** (кодування `o200k_base`) для підрахунку токенів у вікні
  контексту
- **`class-validator`** для валідації запитів, **Joi** (через `@nestjs/config`)
  для валідації змінних оточення при старті
- **Swagger UI** на `/docs`, мінімальний chat UI без збірки на `/`
- **Docker Compose** (`api` + `db`) і **Makefile** як єдина точка входу

## 3. Запуск

```bash
cp .env.example .env
```

Відкрити `.env` і вписати два значення:

- `OPENAI_API_KEY` — робочий ключ OpenAI
- `POSTGRES_PASSWORD` — будь-який пароль на свій розсуд

Далі:

```bash
make up
```

Це збирає образ, піднімає `db` і `api` та прогонить міграції — одна команда,
без локального Node чи Postgres.

Застосунок слухає порт `3000` **всередині контейнера** завжди (значення
`PORT` з `.env`). Якщо на хості порт `3000` зайнятий іншим процесом, задайте
інший порт хоста змінною `HOST_PORT`, не чіпаючи `PORT`:

```bash
HOST_PORT=3100 make up
```

Після старту:

- API: `http://localhost:3000` (або `http://localhost:$HOST_PORT`, якщо
  задавали `HOST_PORT`)
- Swagger: `http://localhost:3000/docs`
- Мінімальний chat UI: `http://localhost:3000/`

Інші корисні цілі: `make down` (зупинити, том лишається), `make reset`
(зупинити й видалити том — чиста база), `make logs`, `make test`. Повний
список — `make` без аргументів.

## 4. Ендпоінти

Усі відповіді — JSON, camelCase. Грошові поля — рядки з 10 знаками після коми
(точна арифметика, без втрати точності при серіалізації).

### `POST /sessions`

| Request | Response `201 Created` |
|---|---|
| `title`, `systemPrompt`, `model` — усі необов'язкові | `id`, `title`, `model`, `systemPrompt`, `createdAt`, `messageCount`, `totalCostUsd` |

```jsonc
// request
{
  "title": "Демо сесія",
  "systemPrompt": "You are a helpful assistant.",
  "model": "gpt-5-nano"
}

// 201 Created
{
  "id": "3f1c...",
  "title": "Демо сесія",
  "model": "gpt-5-nano",
  "systemPrompt": "You are a helpful assistant.",
  "createdAt": "2026-08-31T12:00:00.000Z",
  "messageCount": 0,
  "totalCostUsd": "0.0000000000"
}
```

`model` валідується проти таблиці тарифів (розділ 6 нижче). Непідтримувана
модель -> `400 UNSUPPORTED_MODEL` зі списком підтримуваних.

### `POST /sessions/{id}/messages`

| Request | Response `200 OK` |
|---|---|
| `content` — непорожній рядок, до `MAX_MESSAGE_CHARS` | `message`, `usage`, `cost`, `context`, `session` |

```jsonc
// request
{ "content": "Привіт! Що ти вмієш?" }

// 200 OK
{
  "sessionId": "3f1c...",
  "message": {
    "id": "9ab2...",
    "role": "assistant",
    "content": "...",
    "createdAt": "2026-08-31T12:00:05.120Z"
  },
  "usage": {
    "model": "gpt-5-nano",
    "inputTokens": 412,
    "cachedInputTokens": 0,
    "outputTokens": 178,
    "reasoningTokens": 64
  },
  "cost": {
    "inputCostUsd": "0.0000206000",
    "outputCostUsd": "0.0000712000",
    "totalCostUsd": "0.0000918000",
    "currency": "USD"
  },
  "context": {
    "messagesSent": 11,
    "messagesOmitted": 4,
    "estimatedInputTokens": 405,
    "tokenBudget": 8000
  },
  "session": {
    "totalCostUsd": "0.0004410000",
    "messageCount": 14
  }
}
```

Блок `context` — не декорація: це видимий доказ того, що в модель пішла саме
релевантна історія (див. розділ 8).

### `GET /sessions/{id}`

| Request | Response `200 OK` |
|---|---|
| — | `id`, `title`, `model`, `systemPrompt`, `createdAt`, `updatedAt`, `messages[]`, `totals` |

```jsonc
// 200 OK
{
  "id": "3f1c...",
  "title": "Демо сесія",
  "model": "gpt-5-nano",
  "systemPrompt": "You are a helpful assistant.",
  "createdAt": "...",
  "updatedAt": "...",
  "messages": [
    { "id": "...", "role": "user",      "content": "...", "tokenCount": 12,  "createdAt": "..." },
    { "id": "...", "role": "assistant", "content": "...", "tokenCount": 178, "createdAt": "..." }
  ],
  "totals": {
    "messageCount": 14,
    "interactionCount": 7,
    "inputTokens": 2840,
    "cachedInputTokens": 0,
    "outputTokens": 1204,
    "reasoningTokens": 380,
    "totalCostUsd": "0.0004410000"
  }
}
```

### Формат помилки

```jsonc
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "code": "CONTEXT_BUDGET_EXCEEDED",
  "message": "Message does not fit the context budget (needs 9210 tokens, budget 8000)",
  "path": "/sessions/3f1c.../messages",
  "timestamp": "2026-08-31T12:00:05.120Z"
}
```

| Ситуація | Статус | `code` |
|---|---|---|
| Порожній / завеликий `content`, некоректний UUID | 400 | `VALIDATION_FAILED` |
| Непідтримувана модель | 400 | `UNSUPPORTED_MODEL` |
| Сесію не знайдено | 404 | `SESSION_NOT_FOUND` |
| Конкурентна вставка в ту саму сесію | 409 | `SEQUENCE_CONFLICT` |
| Повідомлення не влазить у токен-бюджет | 422 | `CONTEXT_BUDGET_EXCEEDED` |
| OpenAI повернув 429 | 429 | `UPSTREAM_RATE_LIMITED` (з `Retry-After`, якщо є) |
| OpenAI 5xx або мережева помилка | 502 | `UPSTREAM_ERROR` |
| Таймаут виклику OpenAI | 504 | `UPSTREAM_TIMEOUT` |

Ключ OpenAI, сирі відповіді SDK та стек-трейси клієнту не повертаються —
глобальний фільтр логує повне повідомлення провайдера на сервері, а клієнту
віддає лише нормалізований код і фіксований текст.

## 5. Перевірка

Найпростіше — файл `requests.http` у корені (працює прямо у WebStorm/IDEA, а
також у розширенні REST Client для VS Code): відкрити файл і виконати запити
по порядку.

Той самий сценарій через `curl`:

```bash
SID=$(curl -s -X POST localhost:3000/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"smoke"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -X POST localhost:3000/sessions/$SID/messages \
  -H 'content-type: application/json' \
  -d '{"content":"Say hello in exactly three words."}' | python3 -m json.tool

curl -s -X POST localhost:3000/sessions/$SID/messages \
  -H 'content-type: application/json' \
  -d '{"content":"How many words were in your previous answer?"}' | python3 -m json.tool

curl -s localhost:3000/sessions/$SID | python3 -m json.tool
```

Друге повідомлення явно спирається на перше («скільки слів було в попередній
відповіді?») — модель може відповісти правильно, лише якщо історія сесії
справді дійшла до неї в контексті. Це і є доказ роботи історії, а не просто
факт, що ендпоінт відповідає 200.

Заміните `localhost:3000` на `localhost:$HOST_PORT`, якщо піднімали з
власним `HOST_PORT`.

## 6. Модель і тарифи

Ставки — статичний знімок офіційної сторінки тарифів OpenAI
(https://openai.com/api/pricing/) від **2026-08-31**, у `pricing_source =
"openai-public-2026-08-31"`. Ставки не підтягуються з інтернету в рантаймі —
таблиця в `src/config/pricing.config.ts` оновлюється вручну, свідомо.

USD за 1M токенів:

| Модель | Input | Cached input | Output | Reasoning |
|---|---:|---:|---:|:---:|
| `gpt-5` | 1.25 | 0.125 | 10.00 | так |
| `gpt-5-mini` | 0.25 | 0.025 | 2.00 | так |
| `gpt-5-nano` (за замовчуванням) | 0.05 | 0.005 | 0.40 | так |
| `gpt-4.1-mini` | 0.40 | 0.10 | 1.60 | ні |
| `gpt-4o-mini` | 0.15 | 0.075 | 0.60 | ні |

### Формула

```
billableInput = inputTokens − cachedInputTokens

inputCost  = billableInput      / 1e6 × inputPerMTok
           + cachedInputTokens  / 1e6 × cachedInputPerMTok

outputCost = outputTokens       / 1e6 × outputPerMTok

totalCost  = inputCost + outputCost
```

Два місця, де легко помилитись (обидва закриті тестами в
`test/pricing.service.spec.ts`):

- **Кешовані токени.** `usage.input_tokens_details.cached_tokens` уже входить
  у загальний `input_tokens`, тому перед множенням на повну ставку його треба
  **відняти** від `inputTokens`, а не рахувати окремо поверх. Кешований токен
  тарифікується за нижчою ставкою (для `gpt-5-nano` — у 10 разів дешевше).
  Без віднімання вартість систематично завищується.
- **Reasoning-токени.** У сімействі GPT-5 вони **вже включені** в
  `output_tokens`, який повертає OpenAI. Значення зберігається окремим полем
  для прозорості (звідки в звіті видно, скільки з output пішло на
  міркування), але **не додається повторно** до вартості.

## 7. Категорії usage, які не враховуються

API не використовує відповідні можливості OpenAI, тому ці категорії в наших
відповідях не з'являються і в розрахунок вартості не входять:

- **audio-токени** (голосовий ввід/вивід)
- **токени вбудованих інструментів** (web search, file search, code
  interpreter)
- **генерація зображень**

Якщо якась із цих категорій колись з'явиться у відповіді OpenAI, вона не буде
врахована в нашій вартості — це виявиться як розбіжність між нашою сумою і
рахунком в OpenAI, а не мовчки проковтнеться.

## 8. Як будується контекст

**Стратегія: head + tail під токен-бюджетом** — спрощений middle-out.

Обґрунтування спирається на статтю «Lost in the Middle: How Language Models
Use Long Contexts» (Liu et al., 2023, https://arxiv.org/abs/2307.03172): вона
показує, що точність моделі найвища, коли релевантна інформація стоїть на
початку або в кінці контексту, і просідає, коли вона в середині. Той самий
принцип лежить в основі трансформу `middle-out` в OpenRouter.

Коротко про алгоритм (`src/chat/history.builder.ts`, чиста функція без БД і
мережі):

1. Системний промпт і нове повідомлення користувача входять у контекст
   завжди; якщо їхня сума вже перевищує бюджет — `422
   CONTEXT_BUDGET_EXCEEDED`.
2. **Head** — перші повідомлення історії, доки не вичерпають свою частку
   бюджету (обмежена і кількістю, і часткою, щоб одне довге перше
   повідомлення не з'їло все вікно).
3. **Tail** — від найновішого повідомлення назад, доки влазить у залишок
   бюджету; на першому повідомленні, що не влазить, набір зупиняється (без
   пропусків, щоб не утворювати дірок у діалозі).
4. Якщо між head і tail лишився пропуск, у масив, що йде в OpenAI, вставляється
   службове `system`-повідомлення про пропуск — воно ніколи не зберігається
   в БД, тільки в самому запиті до моделі.

Ручки в `.env`, що керують вікном:

| Змінна | Що робить |
|---|---|
| `HISTORY_TOKEN_BUDGET` | загальний бюджет токенів на контекст (system + head + tail + нове повідомлення) |
| `HISTORY_PINNED_HEAD_MESSAGES` | скільки перших повідомлень історії розглядати під head |
| `HISTORY_HEAD_MAX_SHARE` | яку частку залишку бюджету (0–1) дозволено віддати під head |
| `HISTORY_GAP_MARKER` | чи вставляти службове повідомлення про пропуск, коли між head і tail є дірка |

## 9. Тести

```bash
make test
```

Jest, 31 тест. Свідомо покрита **чиста логіка** — місця, де помилка пройшла б
непоміченою в демо, але видно на кожному реальному рахунку:

- **`pricing.service.spec.ts`** — розрахунок вартості: по одному кейсу на
  кожну з п'яти моделей, кешовані токени за зниженою ставкою й без подвійної
  оплати, reasoning-токени не додаються поверх output, нульовий usage дає
  нульову вартість, невідома модель кидає `UnsupportedModelError`.
- **`history.builder.spec.ts`** — збірка вікна контексту: коротка історія
  входить повністю, довга ріжеться на head+tail з правильними лічильниками,
  завелике нове повідомлення кидає помилку бюджету, head понад свою частку
  відкидається на користь свіжості, маркер пропуску з'являється тільки коли
  дірка справді є, результат завжди хронологічний.

Обидва модулі — чисті функції без доступу до БД чи мережі, тому тести швидкі
й детерміновані. Плюс `env.validation.spec.ts` (валідація конфігурації) і
`openai.provider.spec.ts` (нормалізація відповіді OpenAI та класифікація
помилок провайдера на потрібні доменні типи).

E2E-тестів немає — це свідомий вибір, узгоджений з обмеженим таймбоксом; без
реального ключа OpenAI вони однаково не змогли б пройти повний цикл.

## 10. Відомі обмеження

1. Два одночасні повідомлення в одну сесію бачать однакову історію (обидва
   читають стан до запису одне одного). Унікальний індекс `(session_id,
   seq)` не дає зіпсувати нумерацію: конфлікт відкочує транзакцію й поверне
   `409 SEQUENCE_CONFLICT`. Продакшн-відповідь — `pg_advisory_xact_lock` на
   сесію, який серіалізує обміни в межах однієї сесії; у цьому таймбоксі не
   реалізовано.
2. Немає автентифікації, авторизації та rate limiting.
3. Немає streaming — відповідь віддається цілком.
4. Немає пагінації в `GET /sessions/{id}`: дуже довга сесія поверне велике
   тіло.
5. Таблиця тарифів ведеться вручну; знімок ставок від 2026-08-31.
6. Вартість рахується з usage, який повідомляє OpenAI; звірки з біллінговим
   API немає.
7. Наш підрахунок токенів — оцінка для побудови вікна; тарифікація завжди йде
   за цифрами OpenAI. Розбіжність видно в `estimatedInputTokens` поруч із
   фактичним `inputTokens`.
8. Категорії usage з розділу 7 не обробляються.
9. Немає ідемпотентності: повторний `POST` створює новий обмін.
10. Немає списку сесій (`GET /sessions`) — chat UI тримає поточний
    `sessionId` у `localStorage`.
11. Секрети лежать у `.env` відкритим текстом. Для локального запуску це
    нормально, у продакшні їхнє місце в секрет-менеджері, а не у файлі поруч
    з кодом.
12. Міграції проганяються при кожному старті контейнера. Ідемпотентно й
    зручно для демо, але в продакшні міграції — окремий крок деплою, а не
    частина запуску.

## 11. Що зробив би далі

- **Advisory lock на сесію** (`pg_advisory_xact_lock`) — прибирає гонку з
  пункту 1 вище: серіалізує обміни в межах однієї сесії замість покладатися
  на конфлікт унікального індексу й повторний запит клієнта.
- **Сумаризація витісненого контексту** — замість того, щоб просто викидати
  середину діалогу, стискати її одним додатковим викликом моделі в компактний
  підсумок і тримати його поруч із head. Дорожче й складніше в обліку (це
  окремий виклик зі своїм usage), тому свідомо не робилося в цьому таймбоксі.
- **Звірка з біллінговим API OpenAI** — періодично звіряти суму
  `total_cost_usd` за наш облік із фактичним рахунком OpenAI Usage API, щоб
  розбіжність (пункт 6 вище) не була лише теоретичним ризиком, а мала
  автоматичну перевірку.
