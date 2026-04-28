# WordPress.org Plugin Directory Submission Checklist

> Прогнать перед сабмитом плагина в директорию wordpress.org. Закроем всё → шанс пройти ревью с первого раза очень высокий.
>
> Целевая фаза: **Plan 4 (Launch)** — до этого момента можно отлаживать, но не сабмитить.
>
> Источник: пользовательский чеклист от 2026-04-27.

---

## 1. Структура и метаданные

### Главный PHP-файл (header)

```php
<?php
/**
 * Plugin Name:       Уникальное название (без trademark!)
 * Plugin URI:        https://example.com/plugin
 * Description:       Краткое описание (до 150 символов).
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Ваше имя
 * Author URI:        https://example.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-unique-slug
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
```

Защита `ABSPATH` — в **каждом** PHP-файле в начале, не только в главном.

### readme.txt (формат строгий)

```
=== Plugin Name ===
Contributors: yourwporgusername
Tags: tag1, tag2, tag3, tag4, tag5
Requires at least: 6.2
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Короткое описание до 150 символов.

== Description ==
Подробное описание...

== Installation ==
1. Загрузить ...
2. Активировать ...

== Frequently Asked Questions ==
= Вопрос? =
Ответ.

== Screenshots ==
1. Описание скриншота 1

== Changelog ==
= 1.0.0 =
* Initial release.

== Upgrade Notice ==
= 1.0.0 =
Initial release.

== Third Party Services ==
This plugin connects to api.example.com to [...].
Terms: https://example.com/terms
Privacy: https://example.com/privacy
```

Проверять через https://wordpress.org/plugins/developers/readme-validator/

### Версии

- `Stable tag` в readme = версия в главном файле
- `Tested up to` = актуальная версия WP
- Не указывать `Tested up to: 6.7.1` — только мажор.минор

---

## 2. Trademark / название (топ-1 причина отказа)

### НЕЛЬЗЯ начинать слаг/название с

`wordpress`, `woo`, `woocommerce`, `elementor`, `yoast`, `gutenberg`, `wp-`, `jetpack`, `bbpress`, `buddypress`, `divi`, `acf`, `advanced custom fields`, `contact form 7`, `wpforms`, `gravity forms`, `mailchimp`, `paypal`, `stripe`, `google`, `facebook`, `instagram`, `twitter`, `youtube`, `tiktok`, `amazon`, `apple`, `microsoft`, `chatgpt`, `openai`, `claude`, `anthropic` и т.д.

### Можно

- `My Plugin for WooCommerce` — `for X` в конце разрешено
- `MyPlugin – Stripe Integration` — упоминание сервиса в описании ок

### Слаг

- Нижний регистр, дефисы
- Назначается **навсегда** при первом сабмите — выбирать сразу финальное название
- Должен совпадать с папкой плагина

---

## 3. Безопасность (топ-2 причина отказа)

### Экранирование вывода — ВСЁ что выводится в HTML

```php
echo esc_html( $text );      // текст
echo esc_attr( $value );      // атрибуты
echo esc_url( $url );         // URL
echo esc_js( $js_string );    // в JS
echo wp_kses_post( $html );   // если нужен HTML
echo esc_textarea( $value );  // textarea
```

**Никогда:** `echo $variable;` без экранирования. Даже свои данные. Даже из БД. Всегда.

### Санитизация ввода

```php
$text  = sanitize_text_field( $_POST['field'] );
$email = sanitize_email( $_POST['email'] );
$url   = esc_url_raw( $_POST['url'] );
$int   = absint( $_POST['id'] );
$key   = sanitize_key( $_POST['key'] );
$html  = wp_kses_post( $_POST['content'] );
```

И обязательно `wp_unslash()` перед санитизацией:

```php
$text = sanitize_text_field( wp_unslash( $_POST['field'] ?? '' ) );
```

### Nonces — на ВСЕХ формах, AJAX, admin-actions

```php
// форма
wp_nonce_field( 'my_action', 'my_nonce' );

// проверка
if ( ! isset( $_POST['my_nonce'] )
     || ! wp_verify_nonce( wp_unslash( $_POST['my_nonce'] ), 'my_action' ) ) {
    wp_die( 'Security check failed' );
}

// AJAX
check_ajax_referer( 'my_action', 'nonce' );
```

### Проверка прав

```php
if ( ! current_user_can( 'manage_options' ) ) {
    wp_die( __( 'Permission denied', 'my-slug' ) );
}
```

В каждом admin-обработчике, AJAX-handler, REST endpoint.

### SQL — только через `$wpdb->prepare()`

```php
// ❌ SQL injection
$wpdb->query( "SELECT * FROM {$wpdb->prefix}table WHERE id = $id" );

// ✅ правильно
$wpdb->get_results( $wpdb->prepare(
    "SELECT * FROM {$wpdb->prefix}table WHERE id = %d AND name = %s",
    $id,
    $name
) );
```

Даже если `$id` это `(int)` — всё равно `prepare()`. Ревьюверы это требуют.

### Файлы

- WP_Filesystem API вместо `fopen`/`file_put_contents` где возможно
- Никогда не доверять `$_FILES` — проверять MIME через `wp_check_filetype_and_ext()`
- Не использовать `move_uploaded_file()` — использовать `wp_handle_upload()`

### Запрещено в коде

- `eval()`
- `base64_decode()` для исполнения кода
- `create_function()`
- `extract()` на user input
- `unserialize()` на user input (PHP object injection) — использовать `json_decode`
- `system()`, `exec()`, `shell_exec()`, `passthru()`
- Любая обфускация / minified PHP

---

## 4. Префиксы (изоляция)

Уникальный префикс для всего:

```php
// функции
function myslug_do_something() {}

// классы
class MySlug_Settings {}

// константы
define( 'MYSLUG_VERSION', '1.0.0' );

// опции в БД
get_option( 'myslug_settings' );

// post meta
get_post_meta( $id, '_myslug_field', true );

// hooks
do_action( 'myslug_after_save' );
apply_filters( 'myslug_settings', $settings );

// CSS классы / id
.myslug-button {}

// JS объекты
window.MySlug = {};

// transients
set_transient( 'myslug_cache_key', $data, HOUR_IN_SECONDS );
```

Минимум **4-5 символов** префикс. Не `wp_`, не `my_`, не `app_`, не `plugin_`.

---

## 5. Внешние ресурсы

### Всё локально

- JS, CSS, шрифты, иконки, картинки — внутри плагина
- Никаких Google Fonts, jQuery с CDN, Bootstrap CDN, Font Awesome CDN
- jQuery / wp-полифиллы — только из ядра WP через `wp_enqueue_script('jquery')`, не своя версия

### Composer / npm зависимости

- В ZIP не должно быть `node_modules/`, `.git/`, `.github/`, `tests/` (если не нужны)
- `composer.json` оставить можно но `vendor/` — только финальный prod-build
- Bundler-ить JS (webpack/vite) — ок, но в репо коммитить и source и build

### API-вызовы (бэкенд)

- `wp_remote_get()`, `wp_remote_post()` — никаких `curl`/`file_get_contents` напрямую
- Таймауты обязательны: `['timeout' => 15]`
- НЕ слать ничего до явного opt-in пользователя
- Документировать в readme.txt секцию `Third Party Services`

---

## 6. Опции и БД

### Активация / деактивация / удаление

```php
register_activation_hook( __FILE__, 'myslug_activate' );
register_deactivation_hook( __FILE__, 'myslug_deactivate' );
// uninstall.php в корне плагина — для очистки при удалении
```

`uninstall.php`:

```php
<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}
delete_option( 'myslug_settings' );
// чистим всё своё
```

### Таблицы в БД

- Создавать через `dbDelta()` с правильным форматом
- Использовать `$wpdb->prefix`
- Удалять при uninstall (если плагин не data-storage по природе)

### Settings API

Использовать `register_setting()` + `add_settings_section()` вместо своих кастомных save-обработчиков (меньше шансов на security-баги).

---

## 7. Подключение скриптов / стилей

```php
// ✅ правильно
add_action( 'wp_enqueue_scripts', 'myslug_enqueue_frontend' );
function myslug_enqueue_frontend() {
    wp_enqueue_style(
        'myslug-style',
        plugins_url( 'assets/css/style.css', __FILE__ ),
        [],
        MYSLUG_VERSION
    );
}

// admin отдельно
add_action( 'admin_enqueue_scripts', 'myslug_enqueue_admin' );
```

**НЕ делать:**
- `<script src="...">` напрямую в HTML
- `wp_head` с inline-скриптами без причины
- Грузить ассеты на ВСЕХ страницах если плагин нужен только на одной (проверять `get_current_screen()` или контекст)

---

## 8. i18n (локализация)

Всё пользовательское в строках — оборачивать:

```php
__( 'Save', 'my-slug' )            // вернуть строку
_e( 'Save', 'my-slug' )            // echo
esc_html__( 'Save', 'my-slug' )    // вернуть + escape
esc_html_e( 'Save', 'my-slug' )    // echo + escape
_n( 'item', 'items', $count, 'my-slug' )  // plural
```

`text-domain` = слаг плагина, константой не задавать, всегда строкой литералом (требование инструмента сборки переводов).

С WP 4.6+ `load_plugin_textdomain()` для своего .mo файла нужен только если переводы НЕ на translate.wordpress.org.

---

## 9. Что запрещено

- ❌ Admin notices с рекламой / апселлом без возможности скрыть навсегда
- ❌ Редирект на свою страницу после активации (раньше было можно, сейчас отказ)
- ❌ Изменение чужих опций / поведения других плагинов
- ❌ "Powered by [плагин]" во фронте без opt-in
- ❌ Создание admin-аккаунта при активации
- ❌ Affiliate-ссылки, реферальные коды без раскрытия
- ❌ Сборщик email-ов без opt-in и без privacy disclosure
- ❌ Включение копий чужих плагинов / тем
- ❌ Минифицированный JS/CSS без исходников рядом
- ❌ Картинки людей / контент с stock-сайтов без лицензии
- ❌ Изображения / иконки с trademark (логотипы Google, Facebook и т.д.)
- ❌ Скачивание / выполнение кода с внешних серверов в рантайме
- ❌ Скрытое поведение / "easter eggs" с side-effects

---

## 10. GPL и сторонний код

- Всё в плагине должно быть **GPLv2-compatible**
- Совместимые лицензии: GPL, MIT, Apache 2.0, BSD, ISC, LGPL
- Несовместимые: CC BY-NC, "free for personal use", proprietary
- Каждая использованная библиотека — указать в readme секции `External libraries` с лицензией
- Шрифты — только OFL / Apache / GPL
- Иконки — Dashicons (встроены в WP) или свои / open-source

---

## 11. Pre-submit чеклист (прогнать перед сабмитом)

> Состояние на 2026-04-28 — после `v0.8.0-recurring-billing` и Tier-1/2 wp.org-prep на main.

1. [ ] Plugin Check plugin (https://wordpress.org/plugins/plugin-check/) — нет ошибок и warnings *(требует test WP install + загрузить `dist/seo-agent.zip`)*
2. [x] PHPCS с правилами WordPress (+ PHPCompatibilityWP) — 0 errors / 0 warnings — `cd plugin && /usr/bin/php8.3 vendor/bin/phpcs`. Конфиг в `plugin/phpcs.xml.dist` с rationale-документированными excludes.
3. [ ] Активация на чистом WP последней версии — без warnings/notices с `WP_DEBUG = true` *(требует test WP install)*
4. [ ] `WP_DEBUG_LOG` пустой после прогона основных сценариев *(требует test WP install)*
5. [x] Деактивация и удаление — чистит за собой — `plugin/uninstall.php` дропает `wp_seoagent_history`, `wp_seoagent_jobs` + удаляет все `seo_agent_*` / `seoagent_*` options.
6. [x] Работает на минимальной PHP — header указывает `Requires PHP: 8.1`, PHPCompatibilityWP проверяет совместимость.
7. [ ] readme.txt валиден через официальный валидатор (https://wordpress.org/plugins/developers/readme-validator/) *(требует ручной upload)*
8. [x] Слаг проверен на trademark — `seo-agent` не начинается с restricted-prefix (wp-, woo-, yoast-, acf-, anthropic-, claude- и т.д.). RankMath/Yoast/AIOSEO/SEOPress упомянуты только в Description как target adapters, не в slug/name.
9. [x] В ZIP нет `.git/`, `node_modules/`, `.DS_Store`, `Thumbs.db`, IDE-папок — `scripts/build-wporg-zip.sh` whitelist'ом исключает; `dist/seo-agent.zip` (~84 KB, 27 файлов) проверен.
10. [ ] Скриншоты названы `screenshot-1.png`...`screenshot-4.png` (в SVN `/assets/` после wp.org-провижна слота) *(требует design assets)*
11. [ ] Иконка `icon-128x128.png` + `icon-256x256.png`, баннер `banner-772x250.png` + `banner-1544x500.png` (в SVN `/assets/`, НЕ в ZIP) *(требует design assets)*
12. [x] Все формы с nonce, все handlers с capability check — `check_admin_referer` / `check_ajax_referer` + `current_user_can('manage_options')` на всех admin handlers (`Admin_Page::handle_save_api_key`, `Subscription_Page::handle_save_license_key`, `Subscription_Page::handle_cancel_ajax`).
13. [x] Суперглобальные — везде `sanitize_text_field(wp_unslash(...))`. Закрыто в `chore(plugin): wp.org submission prep` коммите.
14. [x] `echo` — везде escape (`esc_html()` / `esc_attr()` / `esc_url()`). PHPCS подтверждает: `WordPress.Security.EscapeOutput.OutputNotEscaped` чисто, кроме одной аннотации на SSE-pipe в `proxy_chat` (rationale documented).
15. [x] `$wpdb->query` / `->get_*` — везде `$wpdb->prepare()`, кроме `uninstall.php` DROP TABLE (identifiers не параметризуются — аннотация с rationale) и `Jobs_Store::sweep_interrupted` (no user input).

---

## 12. Сабмит и общение

- Заливать через https://wordpress.org/plugins/developers/add/
- ZIP до 10 МБ (если больше — оптимизировать)
- В описании при сабмите быть конкретным: что делает, какие сервисы использует, ссылки на демо
- Ответы ревьюверам — Reply в существующем треде, отвечать по каждому пункту с указанием файла/строки фикса
- Отвечать в течение 1-2 дней — не давать треду уйти в архив

---

## Project-specific notes (WP AI SEO Agent)

Состояние на 2026-04-28 — большинство пунктов закрыто. Что осталось — внизу.

- **Slug**: финализирован `seo-agent` (не начинается с restricted-prefix). Решено.
- **Trademark check**: ✅ название "AI SEO Agent" чисто. RankMath/Yoast/AIOSEO/SEOPress упомянуты в Description как targets, не в name/slug. Anthropic/Claude не упоминаются в названии; BYO API key описан в Third Party Services.
- **Third Party Services**: ✅ закрыто в `plugin/readme.txt` § "Third Party Services" — полное disclosure для Anthropic API (с user-supplied key) и SEO-FRIENDLY backend (Hetzner-hosted), plus self-host pointer.
- **GSC OAuth** (Plan 4-C): пока не реализовано. Когда появится — добавить в Third Party Services.
- **Префикс**: ✅ codebase consistently `seoagent_` / `SEO_AGENT_` / `seo_agent_`. DB tables `wp_seoagent_history`, `wp_seoagent_jobs` через `$wpdb->prefix` (т.е. полное имя `<wp-prefix>seoagent_*`), не `wp_seoagent_*`-hardcoded.
- **Минификация**: ✅ Vite-build артефакты в `plugin/assets/dist/`; source TS/TSX в `plugin-app/src/` НЕ попадает в ZIP. `scripts/build-wporg-zip.sh` промоутит `manifest.json` из `.vite/` в `assets/dist/manifest.json` (no hidden dirs); `index.html` Vite-scaffolding исключён.
- **Backend в ZIP**: ✅ только PHP плагин; backend описан в README.md как self-host-able или managed.
- **Capability check**: ✅ все REST routes под `permit_admin_or_jwt` (admin-cookie OR Bearer service-JWT). `/chat` под `permit_admin`. Старые `permit_admin_or_secret` / `permit_admin_or_write_secret` удалены в JWT-cutover.
- **wp_options encrypted с AUTH_KEY**: ✅ `Settings::api_key` + все `License::*` (license_key, jwt, jwt_exp) шифруются AES-256-CBC через `AUTH_KEY`-derived secret.
- **uninstall.php**: ✅ есть, дропает `<prefix>seoagent_history` + `<prefix>seoagent_jobs`, удаляет все 5 options. Защита через `WP_UNINSTALL_PLUGIN`.
- **i18n**: ✅ все user-facing strings обёрнуты в `__()` / `esc_html__()` с domain `'seo-agent'`. `plugin/languages/seo-agent.pot` сгенерирован через `wp i18n make-pot` (36 строк). Frontend (plugin-app/src) — TODO для Plan 4-D2 если потребуется.

**Что осталось до сабмита (требует внешних артефактов):**

- [ ] Plugin Check tool — поставить https://wordpress.org/plugins/plugin-check/ на тестовый WP, залить `dist/seo-agent.zip`, прогнать.
- [ ] Активация на чистом WP с `WP_DEBUG=true` — без notices/warnings.
- [ ] readme.txt validator (https://wordpress.org/plugins/developers/readme-validator/).
- [ ] Design assets (icon-128/256, banner-772x250/1544x500, screenshot-1..4) для SVN `/assets/` после wp.org-провижна слота.
- [ ] Privacy/Terms pages на www.seo-friendly.org (readme ссылается на `/privacy` и `/terms`).
- [ ] Submit на https://wordpress.org/plugins/developers/add/.

**Команды для финального прогона перед сабмитом:**
```bash
# из repo root
cd plugin && /usr/bin/php8.3 vendor/bin/phpunit                    # 122/122
cd plugin && /usr/bin/php8.3 vendor/bin/phpcs --report=summary     # 0/0
cd plugin-app && bun run test                                      # 37/37
cd plugin-app && bun run build                                     # → plugin/assets/dist
cd ..; scripts/build-wporg-zip.sh                                  # → dist/seo-agent.zip
```

Пройтись по этому документу финально перед тегом `v1.0.0` в Plan 4.
