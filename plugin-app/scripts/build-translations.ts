#!/usr/bin/env bun
/**
 * Generate seo-agent-{locale}.po + .json files for the bundled languages.
 *
 * Source: plugin/languages/seo-agent.pot (PHP + JS strings merged).
 * Output: plugin/languages/seo-agent-{locale}.po (+ .mo via msgfmt + .json
 *         for JS via wp i18n make-json).
 *
 * Translations are inline in this script so a typo + git diff is the entire
 * editorial workflow. To add a string after a code change:
 *   1. cd plugin && cp languages/seo-agent.pot /tmp/php.pot
 *   2. cd ../plugin-app && bun run scripts/extract-i18n.ts > /tmp/js.pot
 *   3. cd .. && cat /tmp/php.pot /tmp/js.pot | msguniq > plugin/languages/seo-agent.pot
 *   4. add the new msgid to the TRANSLATIONS map below for each locale
 *   5. bun run plugin-app/scripts/build-translations.ts
 *
 * Locales that ship: ru, uk, es, fr, pt_BR. English is the source.
 */

import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const REPO        = new URL("../..", import.meta.url).pathname;
const POT_PATH    = join(REPO, "plugin/languages/seo-agent.pot");
const LANG_DIR    = join(REPO, "plugin/languages");

// ─── locale plural-forms headers ───────────────────────────────────────────
// Standard Plural-Forms strings from translatewiki / WP locales.
const PLURAL: Record<string, string> = {
  ru:    "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 1 : 2);",
  uk:    "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 1 : 2);",
  es:    "nplurals=2; plural=(n != 1);",
  fr:    "nplurals=2; plural=(n > 1);",
  pt_BR: "nplurals=2; plural=(n > 1);",
};

// ─── translations, indexed [locale][msgid] = msgstr or [singular,plural,...] ─
type Trans = string | string[];
type Catalog = Record<string, Trans>;

const TRANSLATIONS: Record<string, Catalog> = {
  ru: {
    "AI SEO Agent":                    "AI SEO Agent",
    "SEO Agent":                       "SEO Agent",
    "Insufficient permissions.":       "Недостаточно прав.",
    "••••••• (set)":                   "••••••• (задан)",
    "Settings":                        "Настройки",
    "Anthropic API key":               "API-ключ Anthropic",
    "Save":                            "Сохранить",
    "Chat":                            "Чат",
    "Loading…":                        "Загрузка…",
    "Subscription":                    "Подписка",
    "Buy a license":                   "Купить лицензию",
    "Already have a license key?":     "Уже есть лицензионный ключ?",
    "License key":                     "Лицензионный ключ",
    "Could not reach the licensing server. Try again in a minute.": "Не удалось связаться с сервером лицензий. Повторите через минуту.",
    "License key on file:":            "Сохранённый ключ:",
    "Tier":                            "Тариф",
    "Status":                          "Статус",
    "Auto-renewal":                    "Автопродление",
    "on":                              "вкл",
    "off":                             "выкл",
    "Active until":                    "Действует до",
    "Next charge":                     "Следующее списание",
    "Card":                            "Карта",
    "Cancel subscription":             "Отменить подписку",
    "Cancellation stops auto-renewal. You keep access until %s.": "Отмена останавливает автопродление. Доступ сохраняется до %s.",
    "This subscription is no longer auto-renewing.": "Эта подписка больше не продлевается автоматически.",
    "Manage card on WayForPay":        "Управление картой на WayForPay",
    "Cancel auto-renewal? You'll keep access until the current period ends.": "Отменить автопродление? Доступ сохранится до конца текущего периода.",
    "Cancel failed — check the browser console.": "Не удалось отменить — проверьте консоль браузера.",
    "Cancel failed:":                  "Не удалось отменить:",
    ", %d failed":                     ", %d с ошибкой",
    "(no title)":                      "(без заголовка)",
    "/ Skipped %d":                    "/ Пропущено %d",
    "%1$d / %2$d applied":             "%1$d / %2$d применено",
    "%d failed":                       "%d с ошибкой",
    "Agent is thinking…":              "Агент думает…",
    "Applied %1$d / Failed %2$d / Skipped %3$d": "Применено %1$d / Ошибок %2$d / Пропущено %3$d",
    "Applied %1$d / Failed %2$d / Total %3$d":   "Применено %1$d / Ошибок %2$d / Всего %3$d",
    "Apply to remaining posts":        "Применить к остальным постам",
    "Ask the agent…":                  "Спросите агента…",
    "Cancel":                          "Отмена",
    "Configuration missing.":          "Отсутствует конфигурация.",
    "Could not format summary.":       "Не удалось отформатировать сводку.",
    "current:":                        "текущий:",
    "Dismiss":                         "Скрыть",
    "Errors (%d)":                     "Ошибки (%d)",
    "History #%d":                     "История #%d",
    "job %s":                          "задача %s",
    "Job %s":                          "Задача %s",
    "No proposals returned.":          "Предложения не получены.",
    "Post %d":                         "Пост %d",
    "Proposals (%d)":                  "Предложения (%d)",
    "reasoning":                       "обоснование",
    "refine: e.g. more aggressive, no emoji": "уточнить: например «жёстче», «без эмодзи»",
    "Rollback all in job %s":          "Откатить всё в задаче %s",
    "Rolled back %d":                  "Откачено %d",
    "Send":                            "Отправить",
    "Set your Anthropic API key in the form above to start chatting.": "Введите API-ключ Anthropic в форме выше, чтобы начать чат.",
    "Stop":                            "Остановить",
    "View summary":                    "Открыть сводку",
    "Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done": "Массовая задача (%1$d страниц) завершилась, пока вас не было — выполнено %2$d/%3$d",
    "show %d row":                     ["показать %d строку", "показать %d строки", "показать %d строк"],
  },

  uk: {
    "AI SEO Agent":                    "AI SEO Agent",
    "SEO Agent":                       "SEO Agent",
    "Insufficient permissions.":       "Недостатньо прав.",
    "••••••• (set)":                   "••••••• (задано)",
    "Settings":                        "Налаштування",
    "Anthropic API key":               "API-ключ Anthropic",
    "Save":                            "Зберегти",
    "Chat":                            "Чат",
    "Loading…":                        "Завантаження…",
    "Subscription":                    "Підписка",
    "Buy a license":                   "Купити ліцензію",
    "Already have a license key?":     "Уже маєте ліцензійний ключ?",
    "License key":                     "Ліцензійний ключ",
    "Could not reach the licensing server. Try again in a minute.": "Не вдалося зв'язатися з сервером ліцензій. Спробуйте за хвилину.",
    "License key on file:":            "Збережений ключ:",
    "Tier":                            "Тариф",
    "Status":                          "Статус",
    "Auto-renewal":                    "Автопоновлення",
    "on":                              "увімк",
    "off":                             "вимк",
    "Active until":                    "Активно до",
    "Next charge":                     "Наступне списання",
    "Card":                            "Картка",
    "Cancel subscription":             "Скасувати підписку",
    "Cancellation stops auto-renewal. You keep access until %s.": "Скасування зупиняє автопоновлення. Доступ зберігається до %s.",
    "This subscription is no longer auto-renewing.": "Ця підписка більше не поновлюється автоматично.",
    "Manage card on WayForPay":        "Керування карткою на WayForPay",
    "Cancel auto-renewal? You'll keep access until the current period ends.": "Скасувати автопоновлення? Доступ збережеться до кінця поточного періоду.",
    "Cancel failed — check the browser console.": "Не вдалося скасувати — перевірте консоль браузера.",
    "Cancel failed:":                  "Не вдалося скасувати:",
    ", %d failed":                     ", %d з помилкою",
    "(no title)":                      "(без заголовка)",
    "/ Skipped %d":                    "/ Пропущено %d",
    "%1$d / %2$d applied":             "%1$d / %2$d застосовано",
    "%d failed":                       "%d з помилкою",
    "Agent is thinking…":              "Агент думає…",
    "Applied %1$d / Failed %2$d / Skipped %3$d": "Застосовано %1$d / Помилок %2$d / Пропущено %3$d",
    "Applied %1$d / Failed %2$d / Total %3$d":   "Застосовано %1$d / Помилок %2$d / Усього %3$d",
    "Apply to remaining posts":        "Застосувати до решти постів",
    "Ask the agent…":                  "Запитайте агента…",
    "Cancel":                          "Скасувати",
    "Configuration missing.":          "Бракує конфігурації.",
    "Could not format summary.":       "Не вдалося сформувати зведення.",
    "current:":                        "поточний:",
    "Dismiss":                         "Сховати",
    "Errors (%d)":                     "Помилки (%d)",
    "History #%d":                     "Історія #%d",
    "job %s":                          "задача %s",
    "Job %s":                          "Задача %s",
    "No proposals returned.":          "Пропозицій не отримано.",
    "Post %d":                         "Пост %d",
    "Proposals (%d)":                  "Пропозиції (%d)",
    "reasoning":                       "обґрунтування",
    "refine: e.g. more aggressive, no emoji": "уточнити: напр. «жорсткіше», «без емодзі»",
    "Rollback all in job %s":          "Відкотити все в задачі %s",
    "Rolled back %d":                  "Відкочено %d",
    "Send":                            "Надіслати",
    "Set your Anthropic API key in the form above to start chatting.": "Введіть API-ключ Anthropic у форму вище, щоб почати чат.",
    "Stop":                            "Зупинити",
    "View summary":                    "Відкрити зведення",
    "Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done": "Масова задача (%1$d сторінок) завершилась, поки вас не було — виконано %2$d/%3$d",
    "show %d row":                     ["показати %d рядок", "показати %d рядки", "показати %d рядків"],
  },

  es: {
    "AI SEO Agent":                    "AI SEO Agent",
    "SEO Agent":                       "SEO Agent",
    "Insufficient permissions.":       "Permisos insuficientes.",
    "••••••• (set)":                   "••••••• (establecido)",
    "Settings":                        "Configuración",
    "Anthropic API key":               "Clave API de Anthropic",
    "Save":                            "Guardar",
    "Chat":                            "Chat",
    "Loading…":                        "Cargando…",
    "Subscription":                    "Suscripción",
    "Buy a license":                   "Comprar licencia",
    "Already have a license key?":     "¿Ya tienes una clave de licencia?",
    "License key":                     "Clave de licencia",
    "Could not reach the licensing server. Try again in a minute.": "No se pudo contactar con el servidor de licencias. Inténtalo de nuevo en un minuto.",
    "License key on file:":            "Clave guardada:",
    "Tier":                            "Plan",
    "Status":                          "Estado",
    "Auto-renewal":                    "Renovación automática",
    "on":                              "act.",
    "off":                             "desact.",
    "Active until":                    "Activa hasta",
    "Next charge":                     "Próximo cargo",
    "Card":                            "Tarjeta",
    "Cancel subscription":             "Cancelar suscripción",
    "Cancellation stops auto-renewal. You keep access until %s.": "La cancelación detiene la renovación automática. Conservas acceso hasta %s.",
    "This subscription is no longer auto-renewing.": "Esta suscripción ya no se renueva automáticamente.",
    "Manage card on WayForPay":        "Gestionar tarjeta en WayForPay",
    "Cancel auto-renewal? You'll keep access until the current period ends.": "¿Cancelar la renovación automática? Conservas el acceso hasta el final del período actual.",
    "Cancel failed — check the browser console.": "Cancelación fallida — revisa la consola del navegador.",
    "Cancel failed:":                  "Cancelación fallida:",
    ", %d failed":                     ", %d con error",
    "(no title)":                      "(sin título)",
    "/ Skipped %d":                    "/ Omitidos %d",
    "%1$d / %2$d applied":             "%1$d / %2$d aplicados",
    "%d failed":                       "%d con error",
    "Agent is thinking…":              "El agente está pensando…",
    "Applied %1$d / Failed %2$d / Skipped %3$d": "Aplicados %1$d / Errores %2$d / Omitidos %3$d",
    "Applied %1$d / Failed %2$d / Total %3$d":   "Aplicados %1$d / Errores %2$d / Total %3$d",
    "Apply to remaining posts":        "Aplicar al resto de las entradas",
    "Ask the agent…":                  "Pregúntale al agente…",
    "Cancel":                          "Cancelar",
    "Configuration missing.":          "Falta la configuración.",
    "Could not format summary.":       "No se pudo formatear el resumen.",
    "current:":                        "actual:",
    "Dismiss":                         "Descartar",
    "Errors (%d)":                     "Errores (%d)",
    "History #%d":                     "Historial #%d",
    "job %s":                          "tarea %s",
    "Job %s":                          "Tarea %s",
    "No proposals returned.":          "No se recibieron propuestas.",
    "Post %d":                         "Entrada %d",
    "Proposals (%d)":                  "Propuestas (%d)",
    "reasoning":                       "razonamiento",
    "refine: e.g. more aggressive, no emoji": "refinar: p. ej. más directo, sin emojis",
    "Rollback all in job %s":          "Revertir todo en la tarea %s",
    "Rolled back %d":                  "Revertidos %d",
    "Send":                            "Enviar",
    "Set your Anthropic API key in the form above to start chatting.": "Introduce tu clave API de Anthropic en el formulario de arriba para empezar a chatear.",
    "Stop":                            "Detener",
    "View summary":                    "Ver resumen",
    "Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done": "La última tarea en lote (%1$d páginas) terminó mientras estabas ausente — %2$d/%3$d completadas",
    "show %d row":                     ["mostrar %d fila", "mostrar %d filas"],
  },

  fr: {
    "AI SEO Agent":                    "AI SEO Agent",
    "SEO Agent":                       "SEO Agent",
    "Insufficient permissions.":       "Autorisations insuffisantes.",
    "••••••• (set)":                   "••••••• (défini)",
    "Settings":                        "Réglages",
    "Anthropic API key":               "Clé API Anthropic",
    "Save":                            "Enregistrer",
    "Chat":                            "Chat",
    "Loading…":                        "Chargement…",
    "Subscription":                    "Abonnement",
    "Buy a license":                   "Acheter une licence",
    "Already have a license key?":     "Vous avez déjà une clé de licence ?",
    "License key":                     "Clé de licence",
    "Could not reach the licensing server. Try again in a minute.": "Impossible de joindre le serveur de licences. Réessayez dans une minute.",
    "License key on file:":            "Clé enregistrée :",
    "Tier":                            "Plan",
    "Status":                          "Statut",
    "Auto-renewal":                    "Renouvellement automatique",
    "on":                              "act.",
    "off":                             "désact.",
    "Active until":                    "Actif jusqu'au",
    "Next charge":                     "Prochain prélèvement",
    "Card":                            "Carte",
    "Cancel subscription":             "Annuler l'abonnement",
    "Cancellation stops auto-renewal. You keep access until %s.": "L'annulation arrête le renouvellement automatique. Vous gardez l'accès jusqu'au %s.",
    "This subscription is no longer auto-renewing.": "Cet abonnement ne se renouvelle plus automatiquement.",
    "Manage card on WayForPay":        "Gérer la carte sur WayForPay",
    "Cancel auto-renewal? You'll keep access until the current period ends.": "Annuler le renouvellement automatique ? Vous gardez l'accès jusqu'à la fin de la période en cours.",
    "Cancel failed — check the browser console.": "Échec de l'annulation — vérifiez la console du navigateur.",
    "Cancel failed:":                  "Échec de l'annulation :",
    ", %d failed":                     ", %d en erreur",
    "(no title)":                      "(sans titre)",
    "/ Skipped %d":                    "/ Ignorés %d",
    "%1$d / %2$d applied":             "%1$d / %2$d appliqués",
    "%d failed":                       "%d en erreur",
    "Agent is thinking…":              "L'agent réfléchit…",
    "Applied %1$d / Failed %2$d / Skipped %3$d": "Appliqués %1$d / Erreurs %2$d / Ignorés %3$d",
    "Applied %1$d / Failed %2$d / Total %3$d":   "Appliqués %1$d / Erreurs %2$d / Total %3$d",
    "Apply to remaining posts":        "Appliquer aux autres articles",
    "Ask the agent…":                  "Demandez à l'agent…",
    "Cancel":                          "Annuler",
    "Configuration missing.":          "Configuration manquante.",
    "Could not format summary.":       "Impossible de formater le résumé.",
    "current:":                        "actuel :",
    "Dismiss":                         "Masquer",
    "Errors (%d)":                     "Erreurs (%d)",
    "History #%d":                     "Historique n°%d",
    "job %s":                          "tâche %s",
    "Job %s":                          "Tâche %s",
    "No proposals returned.":          "Aucune proposition retournée.",
    "Post %d":                         "Article %d",
    "Proposals (%d)":                  "Propositions (%d)",
    "reasoning":                       "raisonnement",
    "refine: e.g. more aggressive, no emoji": "préciser : p. ex. plus direct, sans emoji",
    "Rollback all in job %s":          "Annuler tout dans la tâche %s",
    "Rolled back %d":                  "Annulés %d",
    "Send":                            "Envoyer",
    "Set your Anthropic API key in the form above to start chatting.": "Saisissez votre clé API Anthropic dans le formulaire ci-dessus pour commencer.",
    "Stop":                            "Arrêter",
    "View summary":                    "Voir le résumé",
    "Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done": "Dernière tâche en lot (%1$d pages) terminée pendant votre absence — %2$d/%3$d effectuées",
    "show %d row":                     ["afficher %d ligne", "afficher %d lignes"],
  },

  pt_BR: {
    "AI SEO Agent":                    "AI SEO Agent",
    "SEO Agent":                       "SEO Agent",
    "Insufficient permissions.":       "Permissões insuficientes.",
    "••••••• (set)":                   "••••••• (definida)",
    "Settings":                        "Configurações",
    "Anthropic API key":               "Chave da API Anthropic",
    "Save":                            "Salvar",
    "Chat":                            "Chat",
    "Loading…":                        "Carregando…",
    "Subscription":                    "Assinatura",
    "Buy a license":                   "Comprar licença",
    "Already have a license key?":     "Já tem uma chave de licença?",
    "License key":                     "Chave de licença",
    "Could not reach the licensing server. Try again in a minute.": "Não foi possível contatar o servidor de licenças. Tente novamente em um minuto.",
    "License key on file:":            "Chave salva:",
    "Tier":                            "Plano",
    "Status":                          "Status",
    "Auto-renewal":                    "Renovação automática",
    "on":                              "lig.",
    "off":                             "deslig.",
    "Active until":                    "Ativa até",
    "Next charge":                     "Próxima cobrança",
    "Card":                            "Cartão",
    "Cancel subscription":             "Cancelar assinatura",
    "Cancellation stops auto-renewal. You keep access until %s.": "O cancelamento interrompe a renovação automática. Você mantém o acesso até %s.",
    "This subscription is no longer auto-renewing.": "Esta assinatura não está mais sendo renovada automaticamente.",
    "Manage card on WayForPay":        "Gerenciar cartão no WayForPay",
    "Cancel auto-renewal? You'll keep access until the current period ends.": "Cancelar a renovação automática? Você mantém o acesso até o fim do período atual.",
    "Cancel failed — check the browser console.": "Falha ao cancelar — verifique o console do navegador.",
    "Cancel failed:":                  "Falha ao cancelar:",
    ", %d failed":                     ", %d com erro",
    "(no title)":                      "(sem título)",
    "/ Skipped %d":                    "/ Ignorados %d",
    "%1$d / %2$d applied":             "%1$d / %2$d aplicados",
    "%d failed":                       "%d com erro",
    "Agent is thinking…":              "O agente está pensando…",
    "Applied %1$d / Failed %2$d / Skipped %3$d": "Aplicados %1$d / Erros %2$d / Ignorados %3$d",
    "Applied %1$d / Failed %2$d / Total %3$d":   "Aplicados %1$d / Erros %2$d / Total %3$d",
    "Apply to remaining posts":        "Aplicar aos demais posts",
    "Ask the agent…":                  "Pergunte ao agente…",
    "Cancel":                          "Cancelar",
    "Configuration missing.":          "Configuração ausente.",
    "Could not format summary.":       "Não foi possível formatar o resumo.",
    "current:":                        "atual:",
    "Dismiss":                         "Dispensar",
    "Errors (%d)":                     "Erros (%d)",
    "History #%d":                     "Histórico #%d",
    "job %s":                          "tarefa %s",
    "Job %s":                          "Tarefa %s",
    "No proposals returned.":          "Nenhuma proposta retornada.",
    "Post %d":                         "Post %d",
    "Proposals (%d)":                  "Propostas (%d)",
    "reasoning":                       "raciocínio",
    "refine: e.g. more aggressive, no emoji": "refinar: ex. «mais agressivo», «sem emoji»",
    "Rollback all in job %s":          "Reverter tudo na tarefa %s",
    "Rolled back %d":                  "Revertidos %d",
    "Send":                            "Enviar",
    "Set your Anthropic API key in the form above to start chatting.": "Informe sua chave da API Anthropic no formulário acima para começar a conversar.",
    "Stop":                            "Parar",
    "View summary":                    "Ver resumo",
    "Last bulk job (%1$d pages) finished while you were away — %2$d/%3$d done": "A última tarefa em lote (%1$d páginas) terminou enquanto você estava ausente — %2$d/%3$d concluídas",
    "show %d row":                     ["mostrar %d linha", "mostrar %d linhas"],
  },
};

// ─── parse the .pot to get the canonical entry list ────────────────────────
type PotEntry = { msgid: string; msgid_plural?: string };

async function parsePot(path: string): Promise<PotEntry[]> {
  const text = await Bun.file(path).text();
  const out: PotEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith('msgid "') && !ln.startsWith('msgid_plural')) {
      const id = unescape(ln.slice('msgid "'.length, -1));
      if (id === "") continue;  // header
      let plural: string | undefined;
      const next = lines[i + 1];
      if (next && next.startsWith('msgid_plural "')) {
        plural = unescape(next.slice('msgid_plural "'.length, -1));
      }
      out.push({ msgid: id, msgid_plural: plural });
    }
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ─── emit each .po file ────────────────────────────────────────────────────
const entries = await parsePot(POT_PATH);
console.error(`source .pot has ${entries.length} entries`);

for (const [locale, catalog] of Object.entries(TRANSLATIONS)) {
  const lines: string[] = [];
  lines.push(`# Translation of AI SEO Agent into ${locale}.`);
  lines.push(`# This file is distributed under the GPL-2.0-or-later.`);
  lines.push(`msgid ""`);
  lines.push(`msgstr ""`);
  lines.push(`"Content-Type: text/plain; charset=UTF-8\\n"`);
  lines.push(`"Content-Transfer-Encoding: 8bit\\n"`);
  lines.push(`"Project-Id-Version: AI SEO Agent 1.0.0\\n"`);
  lines.push(`"Language: ${locale}\\n"`);
  lines.push(`"Plural-Forms: ${PLURAL[locale]}\\n"`);
  lines.push(`"X-Domain: seo-agent\\n"`);
  lines.push("");

  let translated = 0, missing = 0;
  for (const e of entries) {
    const t = catalog[e.msgid];
    lines.push(`msgid "${escape(e.msgid)}"`);
    if (e.msgid_plural) {
      lines.push(`msgid_plural "${escape(e.msgid_plural)}"`);
      const plurals = Array.isArray(t) ? t : [];
      const slots   = (PLURAL[locale]!.match(/nplurals=(\d+)/)?.[1]) ?? "2";
      for (let i = 0; i < Number(slots); i++) {
        const v = plurals[i] ?? "";
        lines.push(`msgstr[${i}] "${escape(v)}"`);
        if (v) translated++; else missing++;
      }
    } else {
      const v = typeof t === "string" ? t : "";
      lines.push(`msgstr "${escape(v)}"`);
      if (v) translated++; else missing++;
    }
    lines.push("");
  }

  const poPath = join(LANG_DIR, `seo-agent-${locale}.po`);
  if (!existsSync(dirname(poPath))) await mkdir(dirname(poPath), { recursive: true });
  await writeFile(poPath, lines.join("\n"));
  console.error(`${locale}: ${translated} translated, ${missing} missing → ${poPath}`);
}
