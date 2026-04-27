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

1. [ ] Plugin Check plugin (https://wordpress.org/plugins/plugin-check/) — нет ошибок и warnings
2. [ ] PHPCS с правилами WordPress + WordPress-VIP-Go — без errors
3. [ ] Активация на чистом WP последней версии — без warnings/notices с `WP_DEBUG = true`
4. [ ] `WP_DEBUG_LOG` пустой после прогона основных сценариев
5. [ ] Деактивация и удаление — чистит за собой
6. [ ] Работает на PHP 7.4 (или указанной минимальной)
7. [ ] readme.txt валиден через официальный валидатор
8. [ ] Слаг проверен на trademark
9. [ ] В ZIP нет `.git/`, `node_modules/`, `.DS_Store`, `Thumbs.db`, IDE-папок
10. [ ] Скриншоты названы `screenshot-1.png`, `screenshot-2.png` (в `assets/` для репо или в корне для плагина)
11. [ ] Иконка `icon-128x128.png` и `icon-256x256.png`, баннер `banner-772x250.png` и `banner-1544x500.png` (всё в `assets/` SVN, не в ZIP плагина)
12. [ ] Все формы с nonce, все handlers с capability check
13. [ ] Поиск по коду: `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, `$_SERVER` — везде sanitize + unslash
14. [ ] Поиск `echo` — везде escape
15. [ ] Поиск `$wpdb->query`, `->get_*` — везде prepare

---

## 12. Сабмит и общение

- Заливать через https://wordpress.org/plugins/developers/add/
- ZIP до 10 МБ (если больше — оптимизировать)
- В описании при сабмите быть конкретным: что делает, какие сервисы использует, ссылки на демо
- Ответы ревьюверам — Reply в существующем треде, отвечать по каждому пункту с указанием файла/строки фикса
- Отвечать в течение 1-2 дней — не давать треду уйти в архив

---

## Project-specific notes (WP AI SEO Agent)

Когда дойдём до Plan 4 (Launch), пройти все пункты выше плюс уточнить:

- **Slug**: пока в репо плагин лежит как `seo-agent` / `wp-ai-seo-agent`. Финальный wp.org slug решить ДО сабмита (необратимо). Не начинать с `wp-` или `seo-` если хочется верх индекса.
- **Trademark check**: продукт упоминает RankMath/Yoast/AIOSEO/SEOPress в качестве адаптеров. В названии и слаге — нельзя; в Description/`for X` — можно с осторожностью. Anthropic / Claude — упоминать нельзя в названии (BYO key — упомянуть в Third Party Services).
- **Third Party Services секция** обязательна: backend Node-сервис делает вызовы к Anthropic API от имени пользователя (с его ключом). Описать что данные постов отправляются на Anthropic, дать ссылку на их Terms/Privacy. Также backend hosted на Hetzner — описать.
- **GSC OAuth** (Plan 4): тоже Third Party Service (Google), полная privacy disclosure.
- **Префикс**: сейчас в коде `seoagent_` / `SEO_AGENT_` / `seo_agent_`. Проверить, что нигде не утекли `wp_seoagent_` (таблица БД ОК — она с `$wpdb->prefix` префиксом, но имя самой таблицы тоже не должно начинаться с `wp_` — наша `wp_seoagent_jobs` фактически становится `wp_<prefix>_seoagent_jobs` через `$wpdb->prefix` — ОК, но финальное имя проверить).
- **Минификация**: plugin-app билдится через Vite/esbuild. Source TS/TSX в `plugin-app/src/`, build артефакты в `plugin/build/`. Нужно убедиться что и source И build в финальном ZIP (или в репо source отдельно от ZIP-а).
- **Backend в ZIP не идёт**: продукт client+server, Node backend деплоится отдельно (Hetzner). В wp.org попадает только PHP-плагин. Описать в readme что backend self-hostable / опционально managed.
- **Capability check**: REST endpoints сейчас используют `permit_admin_or_secret` + `permit_admin_or_write_secret`. Для wp.org review — capability check на admin endpoints (`/chat`) уже есть (`permit_admin`). Backend↔WP shared-secret — это auth между двумя машинами, ревью wp.org на это не смотрит.
- **wp_options encrypted с AUTH_KEY**: проверить, что метод хранения Anthropic API key соответствует best practices. AUTH_KEY-based encryption приемлемо.
- **uninstall.php**: на момент Plan 4 надо будет добавить — чистить `wp_seoagent_history`, `wp_seoagent_jobs`, options.

Пройтись по этому документу финально перед тегом `v1.0.0` в Plan 4.
