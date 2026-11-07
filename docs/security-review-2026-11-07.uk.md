# Перевірка безпеки — 7 листопада 2026

Перевірено код Angular і Pages Functions, дерево npm-залежностей, склад статичної збірки та публічні HTTP-відповіді `syohtimofey.com`. У перевіреному обсязі не виявлено витоку робочих секретів або підтвердженої критичної вразливості. Це перевірка доступного коду й відповідей, а не гарантія захисту від усіх атак або аудит закритих облікових записів.

## Що вже захищено

- Сайт публікує статичні сторінки; немає власних облікових записів, бази даних, завантаження файлів, платежів або адміністративного інтерфейсу.
- Секрети Resend і Turnstile читаються лише серверною функцією з Cloudflare. Публічний `turnstileSiteKey` у `/api/forms/config` призначений для браузера й не є секретом.
- API приймає лише POST із JSON, перевіряє Origin, обмежує тіло запиту 12 KiB та перевіряє дозволені поля, довжину, email, згоду й honeypot. Самої перевірки Origin недостатньо для захисту від ботів.
- Turnstile перевіряється на сервері з перевіркою hostname і action. Сервер задає одержувача, відправника та тему; відвідувач не може перетворити форму на довільний поштовий ретранслятор. Текст листа не інтерпретується як HTML.
- Зовнішні запити йдуть на фіксовані HTTPS-адреси з таймаутами. Помилки не розкривають секретів, персональні дані не записуються в прикладні журнали.
- У перевіреному клієнтському коді немає використання введених відвідувачем даних як виконуваного HTML або JavaScript.

## Зміни після перевірки

1. Усунено 16 помірних npm-попереджень у залежностях інструментів розробки. Вони походили від двох пакетів у дереві Angular CLI: `glob` і `minimatch`. Прямий production-аудит до змін уже мав 0 попереджень; повний повторний аудит після змін також має 0. Це не були 16 окремих підтверджених способів зламати публічний сайт.
2. Додано вузькі `overrides` під `@angular/cli → pacote`: `glob@14.0.2` і `minimatch@11.0.1`. Angular не понижувався. Пакети оновлено разом через зміну API minimatch. Під час майбутнього оновлення CLI перегляньте overrides і приберіть їх, коли офіційне дерево вже міститиме сумісні виправлені версії.
3. Додано HSTS на 180 днів. `includeSubDomains` і `preload` не вмикалися: HTTPS усіх можливих піддоменів не перевірено.
4. Додано базову CSP сторінок: заборона object/embed, стороннього base URL, вбудовування сайту у фрейм та відправлення HTML-форм на сторонній origin. Політика не містить обмеження `script-src` і не є повним захистом від XSS. Це зберігає наявну роботу Angular, Turnstile та аналітики Cloudflare. JSON-відповіді API отримали окрему сувору CSP й інші захисні заголовки.
5. Локальні `.env` додано до `.gitignore`. Перевірка перед публікацією відхиляє типові файли секретів, ключів, вихідних TypeScript-файлів і source maps у статичній папці. Вона автоматично запускається через `postbuild` як зі звичайним `npm run build`, так і з `npm run build:hosting`; прямий `ng build` оминає npm-хуки. Це перевірка назв файлів, а не повний пошук секретів за вмістом.

## Перевірки

- HTTPS повертає 200; HTTP перенаправляється на HTTPS.
- `/.env`, `/.dev.vars`, `/.git/config`, `/functions/api/forms.ts` і `/src/app/form-submission.ts` повернули 404.
- GET `/api/forms` відхилено з 405; порожній POST зі стороннім Origin — 403; порожній POST з Origin сайту — 400. Ці запити не надсилали листів.
- `/api/forms/config` не розкриває серверних секретів; відповіді API мають `Cache-Control: no-store`.
- npm audit: до виправлення — 16 moderate у dev-залежностях, 0 high/critical; після — 0 загалом. Production-залежності — 0.
- Успішні production-збірка п'яти маршрутів, перевірка TypeScript Functions, 40 клієнтських і 19 серверних тестів. Окремі локальні smoke-перевірки `ignore-walk`, `@tufjs/models`, `@npmcli/package-json` і `cacache` підтвердили роботу використаних API з оновленими glob/minimatch.
- Контрольний нешкідливий `.env`-файл у готовій папці зупинив перевірку публікації. Після видалення тільки цього контрольного файлу чиста збірка знову пройшла перевірку: 52 файли.
- Серверні тести використовують підмінені мережеві відповіді; реальних листів і проходження CAPTCHA під час аудиту не було.

Команди для повторення локальних перевірок:

```sh
npm ci
npm audit
npm audit --omit=dev
npm run test:functions
npm test -- --watch=false
npm run build:hosting
```

## Що власнику перевірити в облікових записах

Ці налаштування не видно в репозиторії або публічних HTTP-відповідях; їхній стан не підтверджено.

- Увімкнути двофакторний захист Cloudflare, GitHub, Resend і Gmail, зберегти резервні коди та перевірити сторонні доступи. Втрата облікового запису може дозволити підмінити сайт незалежно від захисту його форм.
- Для ключа Resend використовувати доступ **Sending access** лише для потрібного домену. Не публікувати ключ у Git або браузерному коді.
- У Cloudflare додати rate limiting для форми. Turnstile не замінює обмеження частоти: автоматизація з дійсними токенами може витрачати квоту листів.

Початкове правило для основного домену: **домен → Security → WAF / Security rules → Rate limiting rules**, вираз `http.request.uri.path eq "/api/forms"`, підрахунок за IP, понад **5 запитів за 10 секунд**, дія **Block** на **10 секунд**. Перевірте доступні поля свого тарифу та поведінку для користувачів зі спільною IP-адресою. Не додавайте умову HTTP method, якщо тариф її не підтримує. Це правило зони не означає автоматичного захисту альтернативної адреси `pages.dev`; обмеження частоти також не є точною глобальною квотою.

Регулярно встановлюйте сумісні виправлення залежностей, перевіряйте доставку форм і строк продовження домену. Налаштовані MFA та rate limiting не можна вважати виконаними лише через цю документацію.

## Джерела

- [Advisory glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [advisory minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- [Cloudflare Pages: HTTP headers](https://developers.cloudflare.com/pages/configuration/headers/), [HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/), [CSP для Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).
- [Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [створення правила в dashboard](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/).
- [MFA Cloudflare](https://developers.cloudflare.com/fundamentals/user-profiles/2fa/), [MFA GitHub](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication), [доступ ключів Resend](https://resend.com/docs/api-reference/api-keys/create-api-key), [обмеження ключа Resend за доменом](https://resend.com/docs/dashboard/api-keys/introduction).
