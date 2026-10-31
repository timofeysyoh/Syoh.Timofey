# Syoh Timofey

Офіційний сайт для `https://syohtimofey.com` на Angular 21. Сайт збирається у статичні HTML-файли для Cloudflare Pages: головна сторінка та `/privacy/` готові до віддачі з CDN, окремий Node.js-сервер на хостингу не потрібен.

## Локальний запуск і збірка

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

Команда виконує production-збірку Angular і перевірку результату. Готова папка для завантаження: **`dist/syohtimofey/browser`**. Перевірити вже створену збірку окремо можна через `npm run check:hosting`.

Увімкнено `outputMode: "static"` і пререндеринг сторінок. Dancing Script розміщено локально в `public/fonts/` разом із ліцензією OFL; `font-display: swap` дозволяє одразу показати текст. Збірка й відвідувачі не звертаються до Google Fonts.

## Мобільна швидкодія

Три декоративні картинки замінено оптимізованими WebP: 4 395 949 → 54 136 байтів (−98,8%). Оригінальні PNG залишено в `public/` як джерела для обробки, але виключено з production-файлів у `angular.json`. Не повертайте їх у шаблон.

Текстура скла обчислюється один раз при підготовці зображень і зберігається у `glass-texture.webp` (4 058 байтів), замість великого SVG-фільтра під час кожного відображення. На телефоні немає backdrop blur; заголовки сповіщень не анімуються безперервно. Обробник скролу пасивний, працює не частіше одного разу за кадр і оновлює Angular лише при зміні стану заголовка. Privacy завантажується окремим JS-модулем.

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

## Альтернатива: ручне завантаження

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
- Instagram, X і Twitch залишаються прихованими до додавання профілів.

Контактна форма зараз демонстраційна: вона показує повідомлення в інтерфейсі, але не надсилає листи й не має backend. Публікація статичних файлів цього не змінює; для реального приймання звернень потрібне окреме підключення сервісу або API.

Перевірити поведінку статичних сторінок і заголовків після deployment допоможуть [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) та [Headers](https://developers.cloudflare.com/pages/configuration/headers/).
