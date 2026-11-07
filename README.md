# Syoh Timofey

Офіційний сайт для `https://syohtimofey.com` на Angular 21. Сайт збирається у статичні HTML-файли для Cloudflare Pages: головна сторінка, `/podcast/`, `/privacy/`, `/podcast/terms/` та `/legal/`; окремий Node.js-сервер на хостингу не потрібен.

`/legal/` пояснює особистий творчий характер проєкту та заявлену автором мету публікацій. Опис діяльності як хобі не скасовує вимог закону та не означає, що платні послуги є некомерційними. Цей розділ не гарантує відсутності претензій або законності будь-якого матеріалу в усіх країнах.

## Умови участі в подкасті

`/podcast/terms/` містить міжнародну основу умов для повнолітніх гостей, платних і безоплатних розмов. У платному форматі гість або замовник платить організатору — Сьоху Тимофію. Сторінка не створює автоматичного бронювання та не замінює індивідуального письмового погодження послуги й дозволів на запис.

Внутрішня українська чернетка згоди гостя: [docs/podcast-guest-release-draft.uk.md](docs/podcast-guest-release-draft.uk.md). Перед використанням потрібно визначити країну діяльності, належний статус організатора, реквізити й робочий юридичний контакт; погодити послуги, оплату, скасування та права на запис. Юрист відповідної країни має адаптувати документи до фактичного формату. Посилання на умови або галочка у формі самі по собі не підтверджують, що належну згоду гостя вже отримано. Приймання оплат через сайт не підключено.

## Локальний запуск і збірка

Перевірка коду, залежностей і публічних відповідей, внесені зміни та налаштування безпеки для власника описані у [docs/security-review-2026-11-07.uk.md](docs/security-review-2026-11-07.uk.md).

Використовуйте Node.js **24.14.0** — версію зафіксовано в `.node-version` для локальної роботи та Cloudflare Pages. Встановіть залежності з lock-файлу:

```sh
npm ci
npm start
```

Локальний сайт: `http://localhost:4200/`.

Для підготовки файлів до хостингу:

```sh
npm run build:hosting
```

Команда виконує production-збірку Angular, npm-хук `postbuild` і перевірку результату. Готова папка для завантаження: **`dist/syohtimofey/browser`**. Перевірити вже створену збірку окремо можна через `npm run check:hosting`. Для публікації використовуйте саме `npm run build:hosting`: прямий `ng build` оминає npm-хук, який готує інформаційні сторінки без Angular bootstrap.

Увімкнено `outputMode: "static"` і пререндеринг сторінок. Dancing Script розміщено локально в `public/fonts/` разом із ліцензією OFL; `font-display: swap` дозволяє одразу показати текст. Збірка й відвідувачі не звертаються до Google Fonts.

## Мобільна швидкодія

Чотири декоративні картинки підготовлено як оптимізовані WebP: 5 705 068 → 66 904 байти (−98,8%). Оригінальні PNG залишено в `public/` як джерела для обробки, але виключено з production-файлів у `angular.json`. Не повертайте їх у шаблон.

На поточній головній видимі лише Music і Podcast, їхній декор разом займає 20 566 байтів. Локальний Dancing Script для поточних заголовків Latin/700 зменшено з 42 708 до 25 444 байтів; старий файл і технічний README шрифту не копіюються у production. OFL збережено. Apple touch icon стиснуто з 78 676 до 56 209 байтів без зміни декодованих пікселів.

Спільна директива `ResizableMessage` обчислює доступне місце під час зміни геометрії, не на кожному введеному символі. Попередній етап оптимізації з результатами 18 тестів описано у [docs/performance-review-2026-11-07.uk.md](docs/performance-review-2026-11-07.uk.md); подальші зміни початкового завантаження — у [docs/startup-optimization-2026-11-07.uk.md](docs/startup-optimization-2026-11-07.uk.md).

Текстура скла обчислюється один раз при підготовці зображень і зберігається у `glass-texture.webp` (4 058 байтів), замість великого SVG-фільтра під час кожного відображення. На телефоні немає backdrop blur; заголовки сповіщень не анімуються безперервно. Обробник скролу пасивний, працює не частіше одного разу за кадр і оновлює Angular лише при зміні стану заголовка.

Спільний `app.scss` збирається як глобальний CSS після `styles.scss`, а не вбудовується рядком у початковий JavaScript. Форми Contact і Podcast винесені в окремі компоненти `@defer`: їхній код попередньо завантажується після початкової роботи браузера або при наведенні/фокусі кнопки. Це зменшує критичний JavaScript на старті; після idle-prefetch загальна кількість завантажених байтів може зрости. Помилка завантаження не залишає сторінку заблокованою: вікно можна закрити, а сторінку — перезавантажити.

Прямі візити до `/privacy/`, `/legal/` і `/podcast/terms/` використовують готові HTML/CSS без Angular app bootstrap. `scripts/static-information-pages.mjs` запускається через `postbuild`, зберігає стилі, метадані й JSON-LD, нормалізує CSS-loader і залишає звичайні посилання. Переходи з цих прямих сторінок виконуються як повна навігація браузера; перехід із головної всередині Angular усе ще використовує окремі lazy-модулі. Список цих трьох сторінок навмисно закритий: додавання інтерактивних елементів зупиняє збірку й потребує перегляду оптимізації. Cloudflare може окремо додавати свій RUM-скрипт після публікації.

Перегенерувати лише декор, аватар і текстуру:

```sh
node scripts/optimize-images.mjs --decorations-only
```

`npm run check:hosting` перевіряє також мобільний бюджет декору (80 KiB), локальні ресурси та відсутність великого SVG-фільтра. `_headers` задає річний immutable-кеш лише JS/CSS із хешами в назвах; для HTML це правило не застосовується.

Для локальної діагностики готової збірки є `node scripts/preview-performance.mjs dist/syohtimofey/browser 4174`. Відкрийте `http://127.0.0.1:4174/`; read-only показники зберігаються в DOM `#performance-report`. Діагностичний скрипт підключає лише цей сервер, у production він не потрапляє. Вимірювання у настільному браузері на мобільній ширині не замінюють перевірку на фізичному телефоні.

Документація: [статична збірка Angular](https://angular.dev/guide/hybrid-rendering), [структура файлів для deployment](https://angular.dev/tools/cli/deployment), [версії середовища Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/build-image/).

## Cloudflare Pages через Git — основний варіант

1. Розмістіть цей репозиторій у GitHub або GitLab.
2. У Cloudflare відкрийте **Workers & Pages → Create application → Pages → Import an existing Git repository** і виберіть репозиторій.
3. Вкажіть налаштування:

| Поле | Значення |
| --- | --- |
| Production branch | Ваша фактична основна гілка репозиторію |
| Root directory | Корінь репозиторію; поле можна залишити порожнім |
| Build command | `npm run build:hosting` |
| Build output directory | `dist/syohtimofey/browser` |
| Node.js | `24.14.0`, визначається з `.node-version` |

4. Запустіть **Save and Deploy**. Наступні push у вибрану production-гілку запускатимуть нову збірку.

У `wrangler.jsonc` задано назву проєкту `syohtimofey` і ту саму папку `pages_build_output_dir`. Якщо ця назва зайнята у Cloudflare, виберіть іншу назву Pages-проєкту та узгодьте її з конфігурацією; адреса власного домену від цього не змінюється.

Дивіться [офіційну інструкцію Cloudflare для Angular](https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/).

## Статична альтернатива: ручне завантаження без доставки форм

Цей спосіб публікує тільки сторінки й ресурси. Dashboard Direct Upload не підтримує Pages Functions, тому для робочих форм використовуйте наявне підключення Git або Wrangler. [Документація розгортання Functions](https://developers.cloudflare.com/pages/functions/get-started/).

Після `npm run build:hosting` можна створити **Pages → Direct Upload** і завантажити папку `dist/syohtimofey/browser` або ZIP із її вмістом. `index.html`, `_headers` і `404.html` мають бути в корені завантаження, без зовнішньої папки `browser`.

Створити ZIP у PowerShell:

```powershell
Compress-Archive -Path dist/syohtimofey/browser/* -DestinationPath dist/syohtimofey-cloudflare-pages.zip -Force
```

Після змін коду повторіть збірку та створення ZIP. Для Direct Upload автоматичні оновлення з Git не вмикаються; щоб перейти на Git integration, потрібно створити новий Pages-проєкт. [Документація Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Підключення syohtimofey.com

1. Після успішного deployment відкрийте **Pages-проєкт → Custom domains → Set up a domain**.
2. Додайте `syohtimofey.com` та підтвердьте DNS-запис, запропонований Cloudflare. Домен має бути активною zone у тому самому Cloudflare account.
3. Дочекайтеся стану **Active** для домену та перевірте `https://syohtimofey.com/` і `https://syohtimofey.com/privacy/`.

Домен потрібно прив’язати саме через **Custom domains**: одного ручного CNAME недостатньо. [Документація власних доменів](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Щоб `www.syohtimofey.com` перенаправляв на основну адресу, створіть у Cloudflare **Bulk Redirects** список і правило:

| Налаштування | Значення |
| --- | --- |
| Source URL | `www.syohtimofey.com` |
| Target URL | `https://syohtimofey.com` |
| Status | `301` |
| Preserve query string | Увімкнено |
| Subpath matching | Увімкнено |
| Preserve path suffix | Увімкнено |

Для цього сценарію офіційна інструкція Cloudflare використовує proxied DNS-запис `A`, ім’я `www`, адреса `192.0.2.1`. Якщо запис `www` уже існує, спочатку перевірте його призначення. Перевірте, що `https://www.syohtimofey.com/privacy/` повертає `301` з `Location: https://syohtimofey.com/privacy/`.

Перенаправлення між доменами не задається через Pages `_redirects`. [Інструкція www → apex](https://developers.cloudflare.com/pages/how-to/www-redirect/), [можливості `_redirects`](https://developers.cloudflare.com/pages/configuration/redirects/).

## Що підготовлено

- Canonical URL і соціальні метадані використовують `https://syohtimofey.com`; адреса privacy — `/privacy/`.
- `public/robots.txt` і `public/sitemap.xml` описують сторінки для пошукових систем.
- `public/404.html` дає окрему сторінку для невідомих адрес; Cloudflare Pages повертає її з HTTP 404.
- `public/_headers` налаштовує заголовки відповідей для Pages.
- Instagram видимий; X і Twitch залишаються прихованими до додавання профілів.

Для Contact і анкети подкасту підготовлено серверну доставку через Cloudflare Pages Functions + Resend. У `functions/` у корені репозиторію містяться API; ця тека не є частиною статичної папки `dist`. Реальне надсилання стане доступним після налаштування Resend, Turnstile і серверних змінних Cloudflare та deployment через Git. Код не містить робочих секретів і сам по собі не підтверджує доставку листів.

Покрокова інструкція: [docs/email-delivery-setup.uk.md](docs/email-delivery-setup.uk.md). Листи надходять на `timofeysyoh@gmail.com`; Reply-To містить email відвідувача. Ключ API та секрет Turnstile зберігаються у Cloudflare, а не в Angular або Git. Відкриття форми не завантажує Turnstile: перевірка починається під час спроби надсилання.

Під час перевірки й надсилання поверх форми відкривається спільне модальне вікно з індикатором. Turnstile, якщо потрібна взаємодія, залишається доступним усередині нього. Після прийняття листа сервісом форма закривається, а сповіщення «Message sent» або «Application sent» зникає через 4 секунди. Помилка залишає форму відкритою із заповненими полями.

## Подкаст

Картка **Podcast → Explore** у Ventures відкриває внутрішню сторінку `/podcast/`. Вона завантажується окремим JS-модулем і пререндериться разом з іншими сторінками. Кнопка **Book a conversation** відкриває модальне вікно з анкетою гостя, пропозиції гостя або співпраці.

Анкета використовує той самий обробник доставки, що й Contact, з окремими перевірками полів і темою листа. Якщо сервер не налаштований або перевірка не пройдена, форма показує помилку без удаваного підтвердження. Успішний результат означає прийняття сервісом для доставки, а не гарантію потрапляння у «Вхідні». Закриття вікна очищає поля й припиняє очікування у браузері; вже отриманий сервером запит або надісланий лист це не відкликає. Подання анкети не створює бронювання, оплати або дозволу на запис.

Перевірити поведінку статичних сторінок і заголовків після deployment допоможуть [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) та [Headers](https://developers.cloudflare.com/pages/configuration/headers/).
