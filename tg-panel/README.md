# Telegram Bot Control Panel

Веб-панель управления для модерационного Telegram-бота на Cloudflare Workers + D1.

## Что делает панель

После логина (по паролю `DASHBOARD_PASSWORD`) открывается **выбор чата** — все группы и каналы, в которых работает бот, появляются автоматически после первого сообщения / события.

Кликаешь чат → открывается панель этого чата:

| Вкладка | Описание |
|---|---|
| 📊 Дашборд | Сводка: сообщения, варны, участники, топ нарушителей, инфо о чате |
| 💬 Лента | Live-лента сообщений (авто-обновление каждые 4 сек), удаление, бан автора |
| ✉️ Отправить | Отправка сообщений от имени бота (с Markdown / HTML) |
| 👥 Участники | Поиск по кэшу пользователей; кик / бан / мут / выдача рангов |
| 👮 Стафф | Список стаффа с рангами; снять / изменить ранг |
| 📋 Лог | Журнал модерации |
| 🏆 Топы | Топ по репутации и варнам |
| ⚔️ Кланы | Кланы чата |
| 📜 Правила | Редактирование правил |
| ⚙️ Настройки | Анти-мат / ссылки / флуд / NSFW, каптча, приветствие, лимиты, badwords |
| 🔧 Управление | Сменить название и описание чата, закреп/открёп, **удаление чата** |

### «Удалить чат»

Telegram Bot API **не позволяет** боту удалить сам чат. Кнопка делает следующее:
- Бот выходит из чата (`leaveChat`).
- Все данные чата стираются из D1: `chat_settings`, `staff`, `warns`, `user_cache`, `chat_messages`, кланы и т.д.

После этого чат пропадает из списка.

## Деплой

### Требования
- Cloudflare аккаунт + установленный `wrangler`
- Telegram bot token (от `@BotFather`)
- D1 база и Workers KV не нужны (только D1)

### Шаги
1. Скопируй `worker.js` в свой Cloudflare Worker (или создай новый).
2. Привяжи D1 базу под именем `DB`.
3. Задай переменные окружения / секреты:
   - `BOT_TOKEN` — токен бота
   - `DASHBOARD_PASSWORD` — пароль для веб-панели (любой, минимум 8 символов)
   - `BASE_URL` (опц.) — публичный URL воркера, например `https://my-bot.<account>.workers.dev`
   - `LOG_CHAT_ID` (опц.) — chat_id для лог-чата
   - `HF_TOKEN` (опц.) — для NSFW-фильтра через HuggingFace
4. Деплой: `wrangler deploy`.
5. Открой `https://<твой-воркер>/setup` — это зарегистрирует webhook и подпишет нужные типы апдейтов (`message`, `my_chat_member` и т.д.).
6. Открой `https://<твой-воркер>/dashboard` — введи пароль и пользуйся.

### Обновление
Если что-то ломается после обновления, открой `/setup` ещё раз — там вызывается `setWebhook` с актуальным `allowed_updates` и `ensureSchema()` создаст новые таблицы (`chat_messages`, `chat_meta`).

## Разработка

`worker.js` — единственный деплоимый файл. UI вынесен в `dashboard.html` для удобства редактирования и встраивается в `worker.js` скриптом сборки:

```bash
# отредактировал dashboard.html → пересобрал worker.js
node tg-panel/build.mjs
```

После сборки убедись, что синтаксис валиден:

```bash
node --check tg-panel/worker.js
```

## API (для своих интеграций)

Все эндпоинты под `/api/*` требуют пароль либо в заголовке `x-dashboard-password`, либо в query `?pwd=...`.

| Метод | Путь | Описание |
|---|---|---|
| GET  | `/api/ping` | проверка пароля |
| GET  | `/api/bot-info` | имя бота |
| GET  | `/api/chats` | список чатов |
| GET  | `/api/chat-info?chat_id=` | свежие данные о чате (через `getChat`) |
| POST | `/api/refresh-chats` | обновить мета по всем чатам |
| GET  | `/api/messages?chat_id=&limit=&before_id=` | лента сообщений |
| POST | `/api/send-message` | отправить сообщение `{chat_id,text,parse_mode?,reply_to?}` |
| POST | `/api/delete-message` | удалить сообщение `{chat_id,message_id}` |
| GET  | `/api/members?chat_id=&q=&limit=` | участники из кэша |
| GET  | `/api/staff?chat_id=` | список стаффа |
| GET  | `/api/log?chat_id=` | журнал |
| GET  | `/api/top?chat_id=` | топы |
| GET  | `/api/clans?chat_id=` | кланы |
| GET  | `/api/rules?chat_id=` | правила |
| POST | `/api/rules` | сохранить правила `{chat_id,text}` |
| GET  | `/api/settings?chat_id=` | настройки |
| POST | `/api/setting` | изменить настройку `{chat_id,key,value}` |
| POST | `/api/kick` | кик `{chat_id,user_id}` |
| POST | `/api/ban` | бан `{chat_id,user_id,until?}` |
| POST | `/api/unban` | разбан `{chat_id,user_id}` |
| POST | `/api/mute` | мут `{chat_id,user_id,duration_sec}` |
| POST | `/api/unmute` | размут `{chat_id,user_id}` |
| POST | `/api/setrank` | выдать ранг `{chat_id,user_id,level}` (0-7) |
| POST | `/api/edit-chat` | сменить название / описание `{chat_id,title?,description?}` |
| POST | `/api/pin` | закрепить `{chat_id,message_id,silent?}` |
| POST | `/api/unpin` | открепить `{chat_id,message_id?}` |
| POST | `/api/delete-chat` | бот выходит + чистим D1 `{chat_id,wipe?}` |

## Что бот должен иметь в чате

Чтобы все функции работали, бот должен быть **админом** с правами:
- удаление сообщений
- бан пользователей
- закреп сообщений
- изменение информации о чате (для смены названия/описания)
- приглашение пользователей
