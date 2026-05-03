/**
 * Chat Moderation Bot — Cloudflare Workers + D1
 *
 * Иерархия рангов:
 *   1 🟢 Мл. модератор  — /warn /del /warns
 *   2 🔵 Модератор      — + /mute /unmute /kick /ro
 *   3 🟣 Ст. модератор  — + /ban /unban
 *   4 🟡 Мл. админ      — + /addword /delword /trust /untrust /info
 *   5 🟠 Админ          — + /set /settings
 *   6 🔴 Ст. админ      — + /promote /demote /setrank /staff
 *   7 ⭐ Овнер          — всё (Telegram creator автоматически)
 *
 * Env: BOT_TOKEN, DB, BASE_URL, LOG_CHAT_ID (опц.), HF_TOKEN (опц. для NSFW)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.BOT_TOKEN) return new Response("BOT_TOKEN not set", { status: 500 });
    if (!env.DB)        return new Response("DB binding not set", { status: 500 });

    await ensureSchema(env.DB);

    if (request.method === "POST" && url.pathname === "/webhook") {
      let update;
      try { update = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
      try { await handleUpdate(update, env); } catch (err) {
        console.error("Error:", err?.stack || String(err));
      }
      return new Response("ok");
    }

    if (url.pathname === "/setup" && request.method === "GET") {
      const base = env.BASE_URL || `https://${url.host}`;
      try {
        await tg(env, "setWebhook", {
          url: `${base}/webhook`,
          allowed_updates: [
            "message", "edited_message", "channel_post", "edited_channel_post",
            "callback_query", "my_chat_member", "chat_member",
          ],
        });
        const me = await tg(env, "getMe", {});
        return new Response(JSON.stringify({ ok: true, bot: me.username }), {
          headers: { "content-type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }

    // ── DASHBOARD ────────────────────────────────────────────────────────────
    if (url.pathname === "/dashboard") {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html;charset=utf-8" } });
    }

    // ── API (защищено паролем) ────────────────────────────────────────────────
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type, x-dashboard-password, x-admin-key",
          },
        });
      }

      const pwd = (
        request.headers.get("x-dashboard-password") ??
        request.headers.get("x-admin-key") ??
        url.searchParams.get("pwd") ??
        ""
      ).trim();

      const expected = String(env.DASHBOARD_PASSWORD ?? "").trim();

      if (!expected) {
        return new Response(JSON.stringify({ error: "DASHBOARD_PASSWORD не задан в переменных воркера" }), {
          status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        });
      }

      if (pwd !== expected) {
        return new Response(JSON.stringify({
          error: "forbidden",
          debug: {
            hasEnv: !!env.DASHBOARD_PASSWORD,
            pwdLen: pwd.length,
            expectedLen: expected.length,
            headerPresent: request.headers.has("x-dashboard-password"),
            queryPresent: url.searchParams.has("pwd"),
          }
        }), {
          status: 403, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        });
      }

      return handleDashboardApi(request, env, url);
    }

    return new Response("Moderation bot is running. Visit /setup to register webhook.");
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// РАНГИ
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = [
  { level: 0, label: "Участник",      icon: "👤" },
  { level: 1, label: "Мл. модератор", icon: "🟢" },
  { level: 2, label: "Модератор",     icon: "🔵" },
  { level: 3, label: "Ст. модератор", icon: "🟣" },
  { level: 4, label: "Мл. админ",     icon: "🟡" },
  { level: 5, label: "Админ",         icon: "🟠" },
  { level: 6, label: "Ст. админ",     icon: "🔴" },
  { level: 7, label: "Овнер",         icon: "⭐" },
];

const CMD_LEVEL = {
  "/warn": 1, "/unwarn": 1, "/warns": 1, "/del": 1, "/d": 1,
  "/mute": 2, "/unmute": 2, "/kick": 2, "/ro": 2,
  "/ban": 3, "/unban": 3,
  "/addword": 4, "/delword": 4, "/words": 4, "/trust": 4, "/untrust": 4, "/info": 4,
  "/settings": 5, "/set": 5, "/setrules": 5, "/setrulestext": 5,
  "/promote": 6, "/demote": 6, "/setrank": 6, "/staff": 6,
};

function rank(level) {
  return RANKS.find(r => r.level === Number(level)) || RANKS[0];
}

function rankFromName(name = "") {
  const n = name.toLowerCase().trim();
  const map = {
    "мл. модератор": 1, "мл модератор": 1, "jrmod": 1,
    "модератор": 2, "mod": 2, "мод": 2,
    "ст. модератор": 3, "ст модератор": 3, "srmod": 3,
    "мл. админ": 4, "мл админ": 4, "jradmin": 4,
    "админ": 5, "admin": 5,
    "ст. админ": 6, "ст админ": 6, "sradmin": 6,
  };
  return map[n] ?? null;
}

async function getLevel(env, chatId, userId) {
  try {
    const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: userId });
    if (m.status === "creator") return 7;
  } catch {}
  const row = await env.DB.prepare(
    `SELECT rank_level FROM staff WHERE chat_id = ? AND user_id = ? LIMIT 1`
  ).bind(chatId, userId).first();
  return Number(row?.rank_level || 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// РОУТЕР
// ═══════════════════════════════════════════════════════════════════════════

async function handleUpdate(update, env) {
  if (update.callback_query) { await handleCallback(update.callback_query, env); return; }

  // my_chat_member: бот добавлен/удалён/изменён статус в чате
  if (update.my_chat_member) {
    const chat   = update.my_chat_member.chat;
    const status = update.my_chat_member.new_chat_member?.status || "";
    if (status === "left" || status === "kicked") {
      try {
        await env.DB.prepare(`UPDATE chat_meta SET removed = 1, last_seen = ? WHERE chat_id = ?`)
          .bind(nowTs(), String(chat.id)).run();
      } catch {}
    } else {
      await upsertChatMeta(env, chat);
    }
    return;
  }

  if (update.message?.new_chat_members) {
    await upsertChatMeta(env, update.message.chat);
    await handleNewMembers(update.message, env);
    return;
  }

  if (update.message?.left_chat_member) {
    const cid = String(update.message.chat.id);
    const uid = String(update.message.left_chat_member.id);
    await env.DB.prepare(`DELETE FROM captcha_pending WHERE chat_id = ? AND user_id = ?`).bind(cid, uid).run();
    return;
  }

  // Каналы: обновляем мета и логируем посты, на этом всё (модерации в каналах нет)
  const channelMsg = update.channel_post || update.edited_channel_post;
  if (channelMsg) {
    await upsertChatMeta(env, channelMsg.chat);
    await logMessage(env.DB, String(channelMsg.chat.id), channelMsg);
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id || "");
  const text   = msg.text || msg.caption || "";
  const cmd    = getCmd(text);
  if (!userId) return;

  const cfg = await getConfig(env.DB, chatId);

  // Кэшируем пользователя
  if (msg.from) await cacheUser(env.DB, chatId, msg.from);

  // Обновляем мета-инфу о чате (для дашборда)
  await upsertChatMeta(env, msg.chat);

  // Сохраняем сообщение в ленту (для веб-панели)
  await logMessage(env.DB, chatId, msg);

  if (cmd === "/help" || cmd === "/modhelp") {
    await sendHelpMenu(env, msg, chatId);
    return;
  }

  if (cmd && CMD_LEVEL[cmd] !== undefined) {
    const lvl = await getLevel(env, chatId, userId);
    const min = CMD_LEVEL[cmd];
    if (lvl >= min) {
      await doCommand(msg, cmd, text, env, cfg, lvl);
    } else if (lvl >= 1) {
      await tempReply(env, msg, `❌ Нужен ранг: *${rank(min).icon} ${rank(min).label}*`);
    }
    return;
  }

  if (cmd && CMD_LEVEL[cmd] !== undefined) {
    const lvl = await getLevel(env, chatId, userId);
    const min = CMD_LEVEL[cmd];
    if (lvl >= min) {
      await doCommand(msg, cmd, text, env, cfg, lvl);
    } else if (lvl >= 1) {
      await tempReply(env, msg, `❌ Нужен ранг: *${rank(min).icon} ${rank(min).label}*`);
    }
    return;
  }

  const firstWord = text.trim().split(/\s+/)[0]?.toLowerCase();

  // ── Управление чатом: -чат / +чат ───────────────────────────────────────
  if (firstWord === "-чат" || firstWord === "+чат") {
    const lvl = await getLevel(env, chatId, userId);
    if (lvl < 5) {
      await tempReply(env, msg, `❌ Нужен ранг: 🟠 Админ`);
      return;
    }
    const close = firstWord === "-чат";
    try {
      await tg(env, "setChatPermissions", {
        chat_id: chatId,
        permissions: {
          can_send_messages:       !close,
          can_send_media_messages: !close,
          can_send_polls:          !close,
          can_send_other_messages: !close,
          can_add_web_page_previews: !close,
          can_change_info:         false,
          can_invite_users:        !close,
          can_pin_messages:        false,
        },
      });
      await delMsg(env, chatId, msg.message_id);
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: close
          ? `🔒 Чат закрыт. Писать могут только администраторы.\n\nОткрыть: +чат`
          : `🔓 Чат открыт. Все участники могут писать снова.`,
        parse_mode: "Markdown",
      });
    } catch (err) {
      await tempReply(env, msg, `❌ Не удалось изменить права чата: ${err.message}`);
    }
    return;
  }

  // ── Русские алиасы команд (без слэша) ───────────────────────────────────
  const RU_ALIASES = {
    "бан": "/ban", "кик": "/kick", "мут": "/mute",
    "варн": "/warn", "разбан": "/unban", "размут": "/unmute",
    "инфо": "/info", "стафф": "/staff", "хелп": "/help",
    "правила": "/rules",
  };

  if (RU_ALIASES[firstWord]) {
    const aliasCmd = RU_ALIASES[firstWord];

    // /rules — доступна всем
    if (aliasCmd === "/rules") {
      await handleRules(env, msg, chatId, cfg);
      return;
    }

    // /help — всем
    if (aliasCmd === "/help") {
      await sendHelpMenu(env, msg, chatId);
      return;
    }

    // Остальные — проверяем уровень
    if (CMD_LEVEL[aliasCmd] !== undefined) {
      const lvl = await getLevel(env, chatId, userId);
      const min = CMD_LEVEL[aliasCmd];
      // Подменяем текст: "бан @user причина" → "/ban @user причина"
      const newText = aliasCmd + text.trim().slice(firstWord.length);
      if (lvl >= min) {
        await doCommand(msg, aliasCmd, newText, env, cfg, lvl);
      } else if (lvl >= 1) {
        await tempReply(env, msg, `❌ Нужен ранг: *${rank(min).icon} ${rank(min).label}*`);
      }
      return;
    }
  }

  // ── /rules (слэш) — всем ─────────────────────────────────────────────────
  if (cmd === "/rules") {
    await handleRules(env, msg, chatId, cfg);
    return;
  }

  // ── Клановые команды ─────────────────────────────────────────────────────
  const CLAN_CMDS = ["/клан", "/clan"];
  if (CLAN_CMDS.includes(cmd) || firstWord === "клан") {
    await handleClanCommand(msg, text, env, cfg);
    return;
  }

  // ── Фан-команды ──────────────────────────────────────────────────────────
  if (await handleFun(msg, cmd, text, env, cfg)) return;

  await autoMod(msg, env, cfg);
}

// ═══════════════════════════════════════════════════════════════════════════
// СИСТЕМА КЛАНОВ
// ═══════════════════════════════════════════════════════════════════════════

async function handleClanCommand(msg, text, env, cfg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from.id);
  const caller = getUserName(msg.from);

  // Парсим подкоманду: /клан создать Название | клан создать Название
  const parts  = text.trim().replace(/^\/?(клан|clan)(?:@\w+)?\s*/i, "").trim().split(/\s+/);
  const sub    = parts[0]?.toLowerCase() || "";
  const rest   = parts.slice(1).join(" ").trim();

  // Получаем клан пользователя
  const myMembership = await env.DB.prepare(
    `SELECT cm.clan_id, cm.role, c.name, c.tag, c.owner_id, c.is_open, c.total_rep, c.description
     FROM clan_members cm JOIN clans c ON c.id = cm.clan_id
     WHERE cm.chat_id = ? AND cm.user_id = ? LIMIT 1`
  ).bind(chatId, userId).first();

  // ── помощь ───────────────────────────────────────────────────────────────
  if (sub === "помощь" || sub === "help" || sub === "помощ") {
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `⚔️ *Система кланов — Команды*\n` +
        `${"─".repeat(26)}\n` +
        `⚠️ _Кланы находятся в бете — возможны баги_\n\n` +
        `👤 *Для всех:*\n` +
        `/клан — мой клан\n` +
        `/клан помощь — это меню\n` +
        `/клан создать \\[ТЕГ\\] Название — создать клан\n` +
        `/клан инфо Название — инфо о клане\n` +
        `/клан вступить Название — вступить в открытый клан\n` +
        `/клан принять Название — принять приглашение\n` +
        `/клан выйти — покинуть клан\n` +
        `/клан рейтинг — топ кланов\n\n` +
        `👮 *Для лидера и офицера:*\n` +
        `/клан пригласить @user — пригласить участника\n` +
        `/клан кик @user — выгнать из клана\n\n` +
        `👑 *Только лидер:*\n` +
        `/клан офицер @user — назначить офицера\n` +
        `/клан описание текст — изменить описание\n` +
        `/клан открыть — сделать клан открытым\n` +
        `/клан закрыть — сделать клан закрытым\n` +
        `/клан война Название — объявить войну\n` +
        `/клан распустить — удалить клан\n\n` +
        `💡 *Пример создания:*\n` +
        `/клан создать \\[REA\\] Reanimal`,
    });
    return;
  }

  // ── /клан (без аргументов) — показать свой клан или помощь ───────────────
  if (!sub) {
    if (myMembership) {
      await showClanInfo(env, chatId, myMembership.clan_id);
    } else {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        parse_mode: "Markdown",
        text:
          `⚔️ *Система кланов*\n\n` +
          `*Команды:*\n` +
          `/клан создать [тег] Название — создать клан\n` +
          `/клан инфо Название — информация о клане\n` +
          `/клан вступить Название — вступить в открытый клан\n` +
          `/клан выйти — покинуть клан\n` +
          `/клан пригласить @user — пригласить участника (лидер/офицер)\n` +
          `/клан принять Название — принять приглашение\n` +
          `/клан кик @user — выгнать из клана (лидер/офицер)\n` +
          `/клан офицер @user — назначить офицера (лидер)\n` +
          `/клан описание текст — изменить описание (лидер)\n` +
          `/клан открыть / /клан закрыть — открытый/закрытый клан (лидер)\n` +
          `/клан война Название — объявить войну (лидер)\n` +
          `/клан рейтинг — топ кланов\n` +
          `/клан распустить — удалить клан (только лидер)`,
      });
    }
    return;
  }

  // ── создать ───────────────────────────────────────────────────────────────
  if (sub === "создать" || sub === "create") {
    if (myMembership) {
      await tempReply(env, msg, `❌ Ты уже состоишь в клане *${myMembership.name}*. Сначала выйди (/клан выйти)`);
      return;
    }

    // Формат: /клан создать [ТЕГ] Название
    const tagMatch = rest.match(/^\[(\w{1,5})\]\s*(.+)$/);
    let tag, name;
    if (tagMatch) {
      tag  = tagMatch[1].toUpperCase();
      name = tagMatch[2].trim();
    } else {
      name = rest;
      tag  = name.slice(0, 4).toUpperCase().replace(/\s/g, "");
    }

    if (!name || name.length < 2) {
      await tempReply(env, msg, "❓ Укажи название: `/клан создать [ТЕГ] Название`");
      return;
    }
    if (name.length > 30) {
      await tempReply(env, msg, "❌ Название клана не может быть длиннее 30 символов.");
      return;
    }

    // Проверяем уникальность
    const exists = await env.DB.prepare(
      `SELECT 1 FROM clans WHERE chat_id = ? AND (name = ? OR tag = ?) LIMIT 1`
    ).bind(chatId, name, tag).first();
    if (exists) {
      await tempReply(env, msg, `❌ Клан с таким названием или тегом уже существует.`);
      return;
    }

    const ins = await env.DB.prepare(
      `INSERT INTO clans (chat_id, name, tag, owner_id, is_open, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).bind(chatId, name, tag, userId, nowTs()).run();

    const clanId = Number(ins.meta?.last_row_id);
    await env.DB.prepare(
      `INSERT INTO clan_members (clan_id, chat_id, user_id, role, joined_at)
       VALUES (?, ?, ?, 'leader', ?)`
    ).bind(clanId, chatId, userId, nowTs()).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `⚔️ Клан *[${tag}] ${name}* основан!\n\n` +
        `👑 Лидер: ${caller}\n` +
        `🔓 Тип: открытый\n\n` +
        `Приглашай участников: /клан пригласить @user\n` +
        `Или сделай клан открытым чтобы все могли вступить.`,
    });
    return;
  }

  // ── инфо ─────────────────────────────────────────────────────────────────
  if (sub === "инфо" || sub === "info") {
    const clanName = rest;
    const clan = await env.DB.prepare(
      `SELECT * FROM clans WHERE chat_id = ? AND (name = ? OR tag = ?) LIMIT 1`
    ).bind(chatId, clanName, clanName.toUpperCase()).first();
    if (!clan) { await tempReply(env, msg, `❌ Клан *${clanName}* не найден.`); return; }
    await showClanInfo(env, chatId, clan.id);
    return;
  }

  // ── рейтинг ───────────────────────────────────────────────────────────────
  if (sub === "рейтинг" || sub === "топ" || sub === "top") {
    const clans = await env.DB.prepare(
      `SELECT c.name, c.tag, c.total_rep, COUNT(cm.user_id) as members
       FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id
       WHERE c.chat_id = ? GROUP BY c.id ORDER BY c.total_rep DESC LIMIT 10`
    ).bind(chatId).all();

    const items = clans.results || [];
    if (!items.length) { await tempReply(env, msg, "Кланов пока нет. Создай первый: /клан создать Название"); return; }

    const medals = ["🥇","🥈","🥉"];
    const lines  = ["⚔️ *Рейтинг кланов*", "─".repeat(22)];
    items.forEach((c, i) => {
      lines.push(`${medals[i] || `${i+1}.`} *[${c.tag}] ${c.name}*`);
      lines.push(`   👥 ${c.members} чел. | ⭐ ${c.total_rep} реп.`);
    });

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "Markdown" });
    return;
  }

  // ── вступить ──────────────────────────────────────────────────────────────
  if (sub === "вступить" || sub === "join") {
    if (myMembership) { await tempReply(env, msg, `❌ Ты уже в клане *${myMembership.name}*.`); return; }

    const clan = await env.DB.prepare(
      `SELECT * FROM clans WHERE chat_id = ? AND (name = ? OR tag = ?) LIMIT 1`
    ).bind(chatId, rest, rest.toUpperCase()).first();
    if (!clan) { await tempReply(env, msg, `❌ Клан *${rest}* не найден.`); return; }

    if (!clan.is_open) {
      // Проверяем приглашение
      const invite = await env.DB.prepare(
        `SELECT 1 FROM clan_invites WHERE clan_id = ? AND user_id = ? LIMIT 1`
      ).bind(clan.id, userId).first();
      if (!invite) {
        await tempReply(env, msg, `❌ Клан *${clan.name}* закрытый. Попроси лидера пригласить тебя.`);
        return;
      }
      await env.DB.prepare(`DELETE FROM clan_invites WHERE clan_id = ? AND user_id = ?`)
        .bind(clan.id, userId).run();
    }

    const memberCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM clan_members WHERE clan_id = ?`
    ).bind(clan.id).first();
    if (Number(memberCount?.cnt || 0) >= 20) {
      await tempReply(env, msg, `❌ Клан *${clan.name}* заполнен (максимум 20 участников).`);
      return;
    }

    await env.DB.prepare(
      `INSERT INTO clan_members (clan_id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?)`
    ).bind(clan.id, chatId, userId, nowTs()).run();

    // Добавляем репутацию пользователя в клановый банк
    const userRep = await env.DB.prepare(
      `SELECT rep FROM reputation WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, userId).first();
    const rep = Number(userRep?.rep || 0);
    if (rep > 0) {
      await env.DB.prepare(`UPDATE clans SET total_rep = total_rep + ? WHERE id = ?`).bind(rep, clan.id).run();
    }

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: `⚔️ *${caller}* вступил(а) в клан *[${clan.tag}] ${clan.name}*!`,
    });
    return;
  }

  // ── принять (приглашение) ─────────────────────────────────────────────────
  if (sub === "принять" || sub === "accept") {
    if (myMembership) { await tempReply(env, msg, `❌ Ты уже в клане *${myMembership.name}*.`); return; }

    const clan = await env.DB.prepare(
      `SELECT * FROM clans WHERE chat_id = ? AND (name = ? OR tag = ?) LIMIT 1`
    ).bind(chatId, rest, rest.toUpperCase()).first();
    if (!clan) { await tempReply(env, msg, `❌ Клан не найден.`); return; }

    const invite = await env.DB.prepare(
      `SELECT 1 FROM clan_invites WHERE clan_id = ? AND user_id = ? LIMIT 1`
    ).bind(clan.id, userId).first();
    if (!invite) { await tempReply(env, msg, `❌ У тебя нет приглашения от этого клана.`); return; }

    await env.DB.prepare(`DELETE FROM clan_invites WHERE clan_id = ? AND user_id = ?`).bind(clan.id, userId).run();
    await env.DB.prepare(
      `INSERT INTO clan_members (clan_id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?)`
    ).bind(clan.id, chatId, userId, nowTs()).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: `⚔️ *${caller}* принял(а) приглашение и вступил(а) в клан *[${clan.tag}] ${clan.name}*!`,
    });
    return;
  }

  // ── выйти ────────────────────────────────────────────────────────────────
  if (sub === "выйти" || sub === "leave") {
    if (!myMembership) { await tempReply(env, msg, "❌ Ты не состоишь ни в одном клане."); return; }
    if (myMembership.role === "leader") {
      await tempReply(env, msg, "❌ Лидер не может покинуть клан. Сначала передай лидерство или распусти клан (/клан распустить).");
      return;
    }

    await env.DB.prepare(`DELETE FROM clan_members WHERE chat_id = ? AND user_id = ?`).bind(chatId, userId).run();
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: `👋 *${caller}* покинул(а) клан *${myMembership.name}*.`,
    });
    return;
  }

  // ── пригласить ────────────────────────────────────────────────────────────
  if (sub === "пригласить" || sub === "invite") {
    if (!myMembership) { await tempReply(env, msg, "❌ Ты не состоишь в клане."); return; }
    if (!["leader","officer"].includes(myMembership.role)) {
      await tempReply(env, msg, "❌ Только лидер или офицер может приглашать."); return;
    }

    const target = await getTarget(msg, env, chatId);
    if (!target) { await tempReply(env, msg, "❓ Ответь на сообщение пользователя или укажи @username"); return; }

    const alreadyIn = await env.DB.prepare(
      `SELECT 1 FROM clan_members WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    if (alreadyIn) { await tempReply(env, msg, `❌ ${target.name} уже состоит в клане.`); return; }

    await env.DB.prepare(
      `INSERT INTO clan_invites (clan_id, chat_id, user_id, invited_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(clan_id, user_id) DO UPDATE SET invited_at = excluded.invited_at`
    ).bind(myMembership.clan_id, chatId, target.id, nowTs()).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text:
        `📨 *${caller}* приглашает *${target.name}* в клан *${myMembership.name}*!\n\n` +
        `*${target.name}*, напиши:\n/клан принять ${myMembership.name}`,
    });
    return;
  }

  // ── кик ──────────────────────────────────────────────────────────────────
  if (sub === "кик" || sub === "kick") {
    if (!myMembership) { await tempReply(env, msg, "❌ Ты не состоишь в клане."); return; }
    if (!["leader","officer"].includes(myMembership.role)) {
      await tempReply(env, msg, "❌ Только лидер или офицер может кикать."); return;
    }

    const target = await getTarget(msg, env, chatId);
    if (!target) { await tempReply(env, msg, "❓ Укажи пользователя"); return; }
    if (target.id === userId) { await tempReply(env, msg, "❌ Нельзя кикнуть себя."); return; }

    const targetMember = await env.DB.prepare(
      `SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ? LIMIT 1`
    ).bind(myMembership.clan_id, target.id).first();
    if (!targetMember) { await tempReply(env, msg, `❌ ${target.name} не состоит в твоём клане.`); return; }
    if (targetMember.role === "leader") { await tempReply(env, msg, "❌ Нельзя кикнуть лидера."); return; }
    if (targetMember.role === "officer" && myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер может кикнуть офицера."); return;
    }

    await env.DB.prepare(`DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?`)
      .bind(myMembership.clan_id, target.id).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: `🥾 *${target.name}* исключён(а) из клана *${myMembership.name}*.`,
    });
    return;
  }

  // ── офицер ───────────────────────────────────────────────────────────────
  if (sub === "офицер" || sub === "officer") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер может назначать офицеров."); return;
    }
    const target = await getTarget(msg, env, chatId);
    if (!target) { await tempReply(env, msg, "❓ Укажи пользователя"); return; }

    const targetMember = await env.DB.prepare(
      `SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ? LIMIT 1`
    ).bind(myMembership.clan_id, target.id).first();
    if (!targetMember) { await tempReply(env, msg, `❌ ${target.name} не в твоём клане.`); return; }

    const newRole = targetMember.role === "officer" ? "member" : "officer";
    await env.DB.prepare(`UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?`)
      .bind(newRole, myMembership.clan_id, target.id).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: newRole === "officer"
        ? `⭐ *${target.name}* назначен(а) офицером клана *${myMembership.name}*!`
        : `👤 *${target.name}* разжалован(а) до рядового участника.`,
    });
    return;
  }

  // ── описание ─────────────────────────────────────────────────────────────
  if (sub === "описание" || sub === "desc") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер может менять описание."); return;
    }
    if (!rest) { await tempReply(env, msg, "❓ Укажи текст описания."); return; }
    await env.DB.prepare(`UPDATE clans SET description = ? WHERE id = ?`)
      .bind(rest.slice(0, 200), myMembership.clan_id).run();
    await delMsg(env, chatId, msg.message_id);
    await tempMsg(env, chatId, `✅ Описание клана *${myMembership.name}* обновлено.`, 8);
    return;
  }

  // ── открыть / закрыть ────────────────────────────────────────────────────
  if (sub === "открыть" || sub === "open") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер."); return;
    }
    await env.DB.prepare(`UPDATE clans SET is_open = 1 WHERE id = ?`).bind(myMembership.clan_id).run();
    await delMsg(env, chatId, msg.message_id);
    await tempMsg(env, chatId, `🔓 Клан *${myMembership.name}* теперь открытый — все могут вступить.`, 8);
    return;
  }

  if (sub === "закрыть" || sub === "close") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер."); return;
    }
    await env.DB.prepare(`UPDATE clans SET is_open = 0 WHERE id = ?`).bind(myMembership.clan_id).run();
    await delMsg(env, chatId, msg.message_id);
    await tempMsg(env, chatId, `🔒 Клан *${myMembership.name}* закрыт — только по приглашению.`, 8);
    return;
  }

  // ── война ─────────────────────────────────────────────────────────────────
  if (sub === "война" || sub === "war") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер может объявлять войну."); return;
    }

    const enemy = await env.DB.prepare(
      `SELECT * FROM clans WHERE chat_id = ? AND (name = ? OR tag = ?) AND id != ? LIMIT 1`
    ).bind(chatId, rest, rest.toUpperCase(), myMembership.clan_id).first();
    if (!enemy) { await tempReply(env, msg, `❌ Клан *${rest}* не найден.`); return; }

    // Проверяем нет ли уже войны
    const activeWar = await env.DB.prepare(
      `SELECT 1 FROM clan_wars WHERE chat_id = ? AND status = 'active'
       AND (attacker_id = ? OR defender_id = ? OR attacker_id = ? OR defender_id = ?) LIMIT 1`
    ).bind(chatId, myMembership.clan_id, myMembership.clan_id, enemy.id, enemy.id).first();
    if (activeWar) { await tempReply(env, msg, "❌ Один из кланов уже ведёт войну."); return; }

    const warDuration = 24 * 3600; // 24 часа
    const endsAt = nowTs() + warDuration;

    // Считаем начальную репу кланов
    const attackerRep = await getClanTotalRep(env.DB, chatId, myMembership.clan_id);
    const defenderRep = await getClanTotalRep(env.DB, chatId, enemy.id);

    await env.DB.prepare(
      `INSERT INTO clan_wars (chat_id, attacker_id, defender_id, attacker_rep, defender_rep, status, started_at, ends_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(chatId, myMembership.clan_id, enemy.id, attackerRep, defenderRep, nowTs(), endsAt).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text:
        `⚔️ *ВОЙНА КЛАНОВ!*\n\n` +
        `*[${myMembership.tag}] ${myMembership.name}* объявил войну *[${enemy.tag}] ${enemy.name}*!\n\n` +
        `Война идёт 24 часа. Репутация участников клана идёт в общий зачёт.\n` +
        `Победит клан с большей суммарной репутацией участников.\n\n` +
        `🕐 Конец войны: через 24 часа`,
    });
    return;
  }

  // ── распустить ────────────────────────────────────────────────────────────
  if (sub === "распустить" || sub === "disband") {
    if (!myMembership || myMembership.role !== "leader") {
      await tempReply(env, msg, "❌ Только лидер может распустить клан."); return;
    }

    const clanId = myMembership.clan_id;
    await env.DB.prepare(`DELETE FROM clan_members WHERE clan_id = ?`).bind(clanId).run();
    await env.DB.prepare(`DELETE FROM clan_invites WHERE clan_id = ?`).bind(clanId).run();
    await env.DB.prepare(`DELETE FROM clans WHERE id = ?`).bind(clanId).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId, parse_mode: "Markdown",
      text: `💔 Клан *${myMembership.name}* распущен.`,
    });
    return;
  }

  await tempReply(env, msg, "❓ Неизвестная команда. Напиши /клан чтобы увидеть список.");
}

// Показать информацию о клане
async function showClanInfo(env, chatId, clanId) {
  const clan = await env.DB.prepare(`SELECT * FROM clans WHERE id = ? LIMIT 1`).bind(clanId).first();
  if (!clan) return;

  const members = await env.DB.prepare(
    `SELECT cm.user_id, cm.role FROM clan_members cm WHERE cm.clan_id = ? ORDER BY
     CASE cm.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END`
  ).bind(clanId).all();

  const roleIcon = { leader: "👑", officer: "⭐", member: "👤" };
  const lines    = [
    `⚔️ *[${clan.tag}] ${clan.name}*`,
    `─`.repeat(22),
  ];

  if (clan.description) lines.push(`📝 ${clan.description}`);

  lines.push(
    `👥 Участников: ${members.results?.length || 0}/20`,
    `⭐ Репутация: ${clan.total_rep}`,
    `${clan.is_open ? "🔓 Открытый" : "🔒 Закрытый"}`,
    ``,
    `*Состав:*`,
  );

  for (const m of members.results || []) {
    let name = `user_${m.user_id}`;
    try {
      const member = await tg(env, "getChatMember", { chat_id: chatId, user_id: m.user_id });
      if (member?.user) name = getUserName(member.user);
    } catch {}
    lines.push(`${roleIcon[m.role] || "👤"} ${name}`);
  }

  await tg(env, "sendMessage", {
    chat_id: chatId, text: lines.join("\n"), parse_mode: "Markdown",
  });
}

async function getClanTotalRep(db, chatId, clanId) {
  const members = await db.prepare(
    `SELECT user_id FROM clan_members WHERE clan_id = ?`
  ).bind(clanId).all();

  let total = 0;
  for (const m of members.results || []) {
    const r = await db.prepare(
      `SELECT rep FROM reputation WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, m.user_id).first();
    total += Number(r?.rep || 0);
  }
  return total;
}



async function handleRules(env, msg, chatId, cfg) {
  await delMsg(env, chatId, msg.message_id);
  const rules = cfg.rules_text;
  if (!rules) {
    await tempMsg(env, chatId,
      "📋 Правила ещё не установлены.\nАдмин может установить их командой:\n`/setrules текст правил`", 15
    );
    return;
  }
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `📋 *Правила чата*\n\n${rules}`,
    parse_mode: "Markdown",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ФАН-КОМАНДЫ
// ═══════════════════════════════════════════════════════════════════════════

async function handleFun(msg, cmd, text, env, cfg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from.id);
  const caller = getUserName(msg.from);

  // +rep / -rep
  if (text.trim().startsWith("+rep") || text.trim().startsWith("-rep")) {
    const isPlus  = text.trim().startsWith("+rep");
    const target  = await getTarget(msg, env, chatId);
    if (!target || target.id === userId) {
      await tempReply(env, msg, isPlus
        ? "❓ Ответь на чьё-то сообщение чтобы дать +rep"
        : "❓ Ответь на чьё-то сообщение чтобы дать -rep"
      );
      return true;
    }

    // Кулдаун — 1 раз в час на одного пользователя
    const cooldownKey = `rep_${userId}_${target.id}`;
    const lastRep = await env.DB.prepare(
      `SELECT ts FROM fun_cooldowns WHERE chat_id = ? AND key = ? LIMIT 1`
    ).bind(chatId, cooldownKey).first();

    if (lastRep && nowTs() - Number(lastRep.ts) < 3600) {
      const wait = 3600 - (nowTs() - Number(lastRep.ts));
      const mins = Math.ceil(wait / 60);
      await tempReply(env, msg, `⏳ Можно давать реп одному человеку раз в час. Подожди ещё ${mins} мин.`);
      return true;
    }

    await env.DB.prepare(
      `INSERT INTO fun_cooldowns (chat_id, key, ts) VALUES (?, ?, ?)
       ON CONFLICT(chat_id, key) DO UPDATE SET ts = excluded.ts`
    ).bind(chatId, cooldownKey, nowTs()).run();

    const delta = isPlus ? 1 : -1;
    await env.DB.prepare(
      `INSERT INTO reputation (chat_id, user_id, rep, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET rep = rep + ?, updated_at = excluded.updated_at`
    ).bind(chatId, target.id, delta, nowTs(), delta).run();

    const row = await env.DB.prepare(
      `SELECT rep FROM reputation WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    const totalRep = Number(row?.rep || 0);

    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: isPlus
        ? `👍 *${caller}* дал +rep пользователю *${target.name}*\nРепутация: ${totalRep > 0 ? "+" : ""}${totalRep}`
        : `👎 *${caller}* дал -rep пользователю *${target.name}*\nРепутация: ${totalRep > 0 ? "+" : ""}${totalRep}`,
      parse_mode: "Markdown",
    });
    await delMsg(env, chatId, msg.message_id);
    return true;
  }

  if (!cmd) return false;

  // /профиль или /profile
  if (cmd === "/профиль" || cmd === "/profile" || cmd === "/мойпроф") {
    const target = msg.reply_to_message?.from
      ? { id: String(msg.reply_to_message.from.id), name: getUserName(msg.reply_to_message.from) }
      : { id: userId, name: caller };

    const repRow = await env.DB.prepare(
      `SELECT rep FROM reputation WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    const rep = Number(repRow?.rep || 0);

    const warnCount = await env.DB.prepare(
      `SELECT count FROM warns WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    const warns = Number(warnCount?.count || 0);

    const lvl   = await getLevel(env, chatId, target.id);
    const rk    = rank(lvl);

    // Партнёр
    const marriage = await env.DB.prepare(
      `SELECT partner_id, partner_name FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();

    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "👤", "Профиль", [
      ["Пользователь", target.name],
      ["Ранг", `${rk.icon} ${rk.label}`],
      ["Репутация", `${rep > 0 ? "+" : ""}${rep}`],
      ["Варнов", String(warns)],
      ["Партнёр", marriage ? marriage.partner_name : "нет 💔"],
    ], null, [], 30);
    return true;
  }

  // /топ — топ репутации
  if (cmd === "/топ" || cmd === "/toprep" || cmd === "/репутация") {
    const rows = await env.DB.prepare(
      `SELECT user_id, rep FROM reputation WHERE chat_id = ? ORDER BY rep DESC LIMIT 10`
    ).bind(chatId).all();
    const items = rows.results || [];
    if (!items.length) {
      await tempReply(env, msg, "Репутация пока у всех нулевая.");
      return true;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const lines  = ["🏆 *Топ репутации*", "─".repeat(22)];
    for (let i = 0; i < items.length; i++) {
      const it   = items[i];
      let   name = `user_${it.user_id}`;
      try {
        const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: it.user_id });
        if (m?.user) name = getUserName(m.user);
      } catch {}
      const medal = medals[i] || `${i + 1}.`;
      lines.push(`${medal} ${name} — ${it.rep > 0 ? "+" : ""}${it.rep}`);
    }
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "Markdown" });
    return true;
  }

  // /обнять /поцеловать /ударить
  const actions = {
    "/обнять":     { verb: "обнял(а)",    emoji: "🤗" },
    "/поцеловать": { verb: "поцеловал(а)",emoji: "😘" },
    "/ударить":    { verb: "ударил(а)",    emoji: "👊" },
    "/погладить":  { verb: "погладил(а)", emoji: "🥰" },
    "/укусить":    { verb: "укусил(а)",   emoji: "😈" },
  };
  if (actions[cmd]) {
    const target = await getTarget(msg, env, chatId);
    if (!target) { await tempReply(env, msg, "Ответь на чьё-то сообщение"); return true; }
    const { verb, emoji } = actions[cmd];
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `${emoji} *${caller}* ${verb} *${target.name}*`,
      parse_mode: "Markdown",
    });
    return true;
  }

  // /8ball
  if (cmd === "/8ball" || cmd === "/шар") {
    const question = text.replace(/^\/\w+(?:@\w+)?\s*/i, "").trim();
    if (!question) { await tempReply(env, msg, "❓ Задай вопрос: `/8ball женюсь ли я?`"); return true; }
    const answers = [
      "✅ Однозначно да!", "✅ Бесспорно!", "✅ Без сомнений!",
      "✅ Да, определённо.", "✅ Можешь быть уверен.",
      "🤔 Пока не ясно, попробуй снова.", "🤔 Спроси позже.",
      "🤔 Лучше не рассказывать.", "🤔 Сейчас нельзя предсказать.",
      "❌ Не рассчитывай на это.", "❌ Мой ответ — нет.", "❌ Перспективы не очень.",
      "❌ Очень сомнительно.", "❌ Нет.",
    ];
    const answer = answers[Math.floor(Math.random() * answers.length)];
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `🎱 *Вопрос:* ${question}\n\n*Ответ:* ${answer}`,
      parse_mode: "Markdown",
    });
    return true;
  }

  // /дуэль
  if (cmd === "/дуэль" || cmd === "/duel") {
    const target = await getTarget(msg, env, chatId);
    if (!target || target.id === userId) {
      await tempReply(env, msg, "⚔️ Ответь на сообщение того с кем хочешь дуэль");
      return true;
    }
    const callerWins = Math.random() < 0.5;
    const winner = callerWins ? caller : target.name;
    const loser  = callerWins ? target.name : caller;
    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text:
        `⚔️ *Дуэль!*\n\n` +
        `*${caller}* vs *${target.name}*\n\n` +
        `🔫 Выстрел...\n\n` +
        `🏆 Победил *${winner}*!\n` +
        `💀 *${loser}* проигрывает.`,
      parse_mode: "Markdown",
    });
    return true;
  }

  // /женить — предложение руки и сердца
  if (cmd === "/женить" || cmd === "/marry" || cmd === "/свадьба") {
    const target = await getTarget(msg, env, chatId);
    if (!target) { await tempReply(env, msg, "💍 Ответь на сообщение того кому хочешь сделать предложение"); return true; }
    if (target.id === userId) { await tempReply(env, msg, "❌ Нельзя жениться на себе 😅"); return true; }

    // Проверяем уже в браке
    const myMarriage = await env.DB.prepare(
      `SELECT partner_name FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, userId).first();
    if (myMarriage) {
      await tempReply(env, msg, `❌ Ты уже состоишь в браке с *${myMarriage.partner_name}*! Сначала разведись (/развод)`);
      return true;
    }

    const theirMarriage = await env.DB.prepare(
      `SELECT partner_name FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    if (theirMarriage) {
      await tempReply(env, msg, `❌ *${target.name}* уже состоит в браке!`);
      return true;
    }

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text:
        `💍 *${caller}* делает предложение *${target.name}*!\n\n` +
        `*${target.name}*, ты принимаешь?`,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "💒 Да!", callback_data: `marry_yes:${userId}:${target.id}:${encodeURI(caller)}:${encodeURI(target.name)}` },
        { text: "💔 Нет", callback_data: `marry_no:${userId}:${target.id}` },
      ]]},
    });
    return true;
  }

  // /развод
  if (cmd === "/развод" || cmd === "/divorce") {
    const myMarriage = await env.DB.prepare(
      `SELECT partner_id, partner_name FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, userId).first();
    if (!myMarriage) { await tempReply(env, msg, "❌ Ты не состоишь в браке."); return true; }

    await env.DB.prepare(`DELETE FROM marriages WHERE chat_id = ? AND (user_id = ? OR user_id = ?)`)
      .bind(chatId, userId, myMarriage.partner_id).run();

    await delMsg(env, chatId, msg.message_id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `💔 *${caller}* и *${myMarriage.partner_name}* развелись.`,
      parse_mode: "Markdown",
    });
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// КОМАНДЫ
// ═══════════════════════════════════════════════════════════════════════════

async function doCommand(msg, cmd, text, env, cfg, callerLevel) {
  const chatId = String(msg.chat.id);
  const caller = getUserName(msg.from);
  const args   = parseArgs(text);
  const target = await getTarget(msg, env, chatId);

  const noTarget = async (hint) => {
    await tempReply(env, msg, `❓ ${hint || "Ответь на сообщение или укажи @username"}`);
  };

  // Если пользователь найден по username в кэше но не в Telegram
  if (target?.notFound) {
    await tempReply(env, msg,
      `❌ Пользователь *${target.name}* не найден.\n\nПользователь должен написать хотя бы одно сообщение в чат, или укажи его числовой ID.`
    );
    return;
  }

  if (cmd === "/warn") {
    if (!target) { await noTarget("`/warn @user причина`"); return; }
    const reason = args.reason || "нарушение правил";
    const warns  = await addWarn(env.DB, chatId, target.id);
    const max    = cfg.max_warns || 3;
    await delMsg(env, chatId, msg.message_id);
    if (warns >= max) {
      try { await tg(env, "banChatMember", { chat_id: chatId, user_id: target.id }); } catch {}
      await env.DB.prepare(`DELETE FROM warns WHERE chat_id = ? AND user_id = ?`).bind(chatId, target.id).run();
      await sendCard(env, chatId, "🚫", "Автобан", [
        ["Пользователь", target.name], ["Причина", reason],
        ["Варнов набрал", `${warnBar(warns, max)} ${warns}/${max}`], ["Модератор", caller],
      ]);
    } else {
      await sendCard(env, chatId, "⚠️", "Предупреждение", [
        ["Пользователь", target.name], ["Причина", reason],
        ["Варнов", `${warnBar(warns, max)} ${warns}/${max}`], ["Модератор", caller],
      ], warns >= max - 1 ? "⛔ Следующий = автобан" : null);
    }
    await logAct(env, chatId, target.id, target.name, `варн (${reason}) ${warns}/${max}`, cfg);
    return;
  }

  if (cmd === "/unwarn") {
    if (!target) { await noTarget(); return; }
    const left = await removeWarn(env.DB, chatId, target.id);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "✅", "Варн снят", [
      ["Пользователь", target.name],
      ["Осталось", `${warnBar(left, cfg.max_warns || 3)} ${left}/${cfg.max_warns || 3}`],
      ["Модератор", caller],
    ], null, [], 10);
    await logAct(env, chatId, target.id, target.name, "снят варн", cfg);
    return;
  }

  if (cmd === "/warns") {
    if (!target) { await noTarget(); return; }
    const count = await getWarnCount(env.DB, chatId, target.id);
    const max   = cfg.max_warns || 3;
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "📋", "Предупреждения", [
      ["Пользователь", target.name],
      ["Варнов", `${warnBar(count, max)} ${count}/${max}`],
    ], null, [], 15);
    return;
  }

  if (cmd === "/mute") {
    if (!target) { await noTarget("`/mute @user 1h причина`"); return; }
    const dur = args.duration || 3600;
    const rsn = args.reason   || "без причины";
    try {
      await muteMember(env, chatId, target.id, dur);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "🔇", "Мут", [
        ["Пользователь", target.name], ["Время", fmtDur(dur)],
        ["Причина", rsn], ["Модератор", caller],
      ], null, [[{ text: "🔊 Снять мут", callback_data: `unmute:${target.id}:${chatId}` }]]);
      await logAct(env, chatId, target.id, target.name, `мут ${fmtDur(dur)} (${rsn})`, cfg);
    } catch (e) { await tempReply(env, msg, `❌ Не удалось замутить: ${e.message}`); }
    return;
  }

  if (cmd === "/unmute") {
    if (!target) { await noTarget(); return; }
    try {
      await unmuteUser(env, chatId, target.id);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "🔊", "Мут снят", [
        ["Пользователь", target.name], ["Модератор", caller],
      ], null, [], 10);
      await logAct(env, chatId, target.id, target.name, "размут", cfg);
    } catch (e) { await tempReply(env, msg, `❌ Не удалось размутить: ${e.message}`); }
    return;
  }

  if (cmd === "/ro") {
    if (!target) { await noTarget("`/ro @user 30m причина`"); return; }
    const dur = args.duration || 3600;
    const rsn = args.reason   || "без причины";
    try {
      await tg(env, "restrictChatMember", {
        chat_id: chatId, user_id: target.id,
        until_date: nowTs() + dur,
        permissions: { can_send_messages: false, can_send_media_messages: false,
          can_send_polls: false, can_send_other_messages: false },
      });
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "📵", "Read-only", [
        ["Пользователь", target.name], ["Время", fmtDur(dur)],
        ["Причина", rsn], ["Модератор", caller],
      ]);
      await logAct(env, chatId, target.id, target.name, `ro ${fmtDur(dur)} (${rsn})`, cfg);
    } catch (e) { await tempReply(env, msg, `❌ Ошибка: ${e.message}`); }
    return;
  }

  if (cmd === "/ban") {
    if (!target) { await noTarget("`/ban @user 1d причина`"); return; }
    const dur = args.duration || 0;
    const rsn = args.reason   || "нарушение правил";
    try {
      await tg(env, "banChatMember", {
        chat_id: chatId, user_id: target.id,
        until_date: dur > 0 ? nowTs() + dur : 0,
      });
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "🚫", "Бан", [
        ["Пользователь", target.name],
        ["Срок", dur > 0 ? fmtDur(dur) : "навсегда"],
        ["Причина", rsn], ["Модератор", caller],
      ], null, [[{ text: "✅ Разбанить", callback_data: `unban:${target.id}:${chatId}` }]]);
      await logAct(env, chatId, target.id, target.name, `бан ${dur > 0 ? fmtDur(dur) : "навсегда"} (${rsn})`, cfg);
    } catch (e) { await tempReply(env, msg, `❌ Не удалось забанить: ${e.message}`); }
    return;
  }

  if (cmd === "/unban") {
    if (!target) { await noTarget(); return; }
    try {
      await tg(env, "unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "✅", "Разбан", [
        ["Пользователь", target.name], ["Модератор", caller],
      ], null, [], 10);
      await logAct(env, chatId, target.id, target.name, "разбан", cfg);
    } catch (e) { await tempReply(env, msg, `❌ Не удалось разбанить: ${e.message}`); }
    return;
  }

  if (cmd === "/kick") {
    if (!target) { await noTarget(); return; }
    const rsn = args.reason || "нарушение правил";
    try {
      await tg(env, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tg(env, "unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "👢", "Кик", [
        ["Пользователь", target.name], ["Причина", rsn], ["Модератор", caller],
      ], null, [], 15);
      await logAct(env, chatId, target.id, target.name, `кик (${rsn})`, cfg);
    } catch (e) { await tempReply(env, msg, `❌ Не удалось кикнуть: ${e.message}`); }
    return;
  }

  if (cmd === "/del" || cmd === "/d") {
    if (msg.reply_to_message) {
      try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id }); } catch {}
    }
    try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }); } catch {}
    return;
  }

  if (cmd === "/addword") {
    const word = args.reason?.toLowerCase();
    if (!word) { await tempReply(env, msg, "Использование: `/addword слово`"); return; }
    const words = (cfg.bad_words || "").split(",").map(w => w.trim()).filter(Boolean);
    if (!words.includes(word)) {
      words.push(word);
      await setSetting(env.DB, chatId, "bad_words", words.join(","));
    }
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "📝", "Стоп-слово добавлено", [["Слово", word]], null, [], 8);
    return;
  }

  if (cmd === "/delword") {
    const word = args.reason?.toLowerCase();
    if (!word) { await tempReply(env, msg, "Использование: `/delword слово`"); return; }
    const words = (cfg.bad_words || "").split(",").map(w => w.trim()).filter(w => w && w !== word);
    await setSetting(env.DB, chatId, "bad_words", words.join(","));
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "🗑", "Стоп-слово удалено", [["Слово", word]], null, [], 8);
    return;
  }

  if (cmd === "/words") {
    const words = (cfg.bad_words || "").split(",").map(w => w.trim()).filter(Boolean);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "📋", "Стоп-слова", [
      ["Кол-во", String(words.length)],
      ["Список", words.length ? words.join(", ") : "пусто"],
    ], null, [], 20);
    return;
  }

  if (cmd === "/trust") {
    if (!target) { await noTarget(); return; }
    await env.DB.prepare(
      `INSERT INTO trusted_users (chat_id, user_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`
    ).bind(chatId, target.id, nowTs()).run();
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "✅", "Доверенный", [
      ["Пользователь", target.name], ["Может слать", "ссылки ✅"],
    ], null, [], 10);
    return;
  }

  if (cmd === "/untrust") {
    if (!target) { await noTarget(); return; }
    await env.DB.prepare(`DELETE FROM trusted_users WHERE chat_id = ? AND user_id = ?`)
      .bind(chatId, target.id).run();
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "⛔", "Недоверенный", [
      ["Пользователь", target.name], ["Ссылки", "заблокированы"],
    ], null, [], 10);
    return;
  }

  if (cmd === "/info") {
    if (!target) { await noTarget(); return; }
    const wc      = await getWarnCount(env.DB, chatId, target.id);
    const max     = cfg.max_warns || 3;
    const trusted = await env.DB.prepare(
      `SELECT 1 FROM trusted_users WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, target.id).first();
    const tLvl = await getLevel(env, chatId, target.id);
    const tRnk = rank(tLvl);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "👤", "Информация", [
      ["Пользователь", target.name],
      ["ID", target.id],
      ["Ранг", `${tRnk.icon} ${tRnk.label}`],
      ["Варнов", `${warnBar(wc, max)} ${wc}/${max}`],
      ["Доверенный", trusted ? "да ✅" : "нет"],
    ], null, [[
      { text: "⚠️ Варн",   callback_data: `warn:${target.id}:${chatId}` },
      { text: "🔇 Мут 1ч", callback_data: `mute:${target.id}:${chatId}:3600` },
      { text: "🚫 Бан",    callback_data: `ban:${target.id}:${chatId}` },
    ]], 60);
    return;
  }

  if (cmd === "/setrules" || cmd === "/setrulestext") {
    const rulesText = text.replace(/^\/\w+(?:@\w+)?\s*/i, "").trim();
    if (!rulesText) { await tempReply(env, msg, "Использование: `/setrulestext текст правил`"); return; }
    await setSetting(env.DB, chatId, "rules_text", rulesText);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "📋", "Правила обновлены", [
      ["Текст", rulesText.slice(0, 100) + (rulesText.length > 100 ? "..." : "")],
    ], "Участники могут посмотреть правила командой /rules или написав «правила»", [], 10);
    return;
  }

  if (cmd === "/settings") {
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "⚙️", "Настройки чата", [
      ["Антимат",     cfg.antimat_enabled    ? "✅" : "❌"],
      ["Антиссылки",  cfg.antilinks_enabled  ? "✅" : "❌"],
      ["Антифлуд",    cfg.antiflood_enabled  ? "✅" : "❌"],
      ["Анти-NSFW",   cfg.antinsfw_enabled   ? "✅" : "❌"],
      ["Капча",       cfg.captcha_enabled    ? "✅" : "❌"],
      ["Приветствие", cfg.welcome_enabled    ? "✅" : "❌"],
      ["Макс. варнов",String(cfg.max_warns || 3)],
      ["Флуд-лимит",  `${cfg.flood_limit || 5}/${cfg.flood_window || 10}с`],
      ["Лог-чат",     cfg.log_chat_id ? "✅" : "нет"],
    ], null, [], 30);
    return;
  }

  if (cmd === "/set") {
    const parts = text.replace(/^\/set(?:@\w+)?\s*/i, "").trim().split(/\s+/);
    const key   = parts[0]?.toLowerCase();
    const val   = parts.slice(1).join(" ").toLowerCase();
    const on    = ["on","1","yes","да"].includes(val) ? 1 : 0;
    const boolKeys = { antimat:"antimat_enabled", antilinks:"antilinks_enabled",
      antiflood:"antiflood_enabled", antinsfw:"antinsfw_enabled",
      captcha:"captcha_enabled", welcome:"welcome_enabled" };
    if (boolKeys[key]) {
      await setSetting(env.DB, chatId, boolKeys[key], on);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "✅", "Настройка", [[key, on ? "включено ✅" : "выключено ❌"]], null, [], 8);
    } else if (key === "maxwarns") {
      const n = Math.max(1, Math.min(10, Number(val) || 3));
      await setSetting(env.DB, chatId, "max_warns", n);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "✅", "Настройка", [["Макс. варнов", String(n)]], null, [], 8);
    } else if (key === "floodlimit") {
      const n = Math.max(2, Math.min(30, Number(val) || 5));
      await setSetting(env.DB, chatId, "flood_limit", n);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "✅", "Настройка", [["Флуд-лимит", String(n)]], null, [], 8);
    } else if (key === "welcometext") {
      const wt = text.replace(/^\/set(?:@\w+)?\s+welcometext\s*/i, "").trim();
      await setSetting(env.DB, chatId, "welcome_text", wt);
      await delMsg(env, chatId, msg.message_id);
      await sendCard(env, chatId, "✅", "Приветствие", [["Текст", wt]], null, [], 8);
    } else {
      await tempReply(env, msg, "❓ Неизвестная настройка. Используй `/settings`");
    }
    return;
  }

  if (cmd === "/promote") {
    if (!target) { await noTarget("`/promote @user`"); return; }
    const tLvl = await getLevel(env, chatId, target.id);
    const maxTo = callerLevel - 1;
    if (maxTo <= 0) { await tempReply(env, msg, "❌ Недостаточно прав."); return; }
    if (tLvl >= maxTo) {
      await tempReply(env, msg, `❌ Максимальный доступный ранг: ${rank(maxTo).icon} ${rank(maxTo).label}`);
      return;
    }
    const newLvl = tLvl + 1;
    await setStaffRank(env.DB, chatId, target.id, newLvl, String(msg.from.id));
    await applyTelegramRank(env, chatId, target.id, newLvl);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, rank(newLvl).icon, "Повышение", [
      ["Пользователь", target.name],
      ["Новый ранг", `${rank(newLvl).icon} ${rank(newLvl).label}`],
      ["Повысил", caller],
    ]);
    await logAct(env, chatId, target.id, target.name, `повышен до ${rank(newLvl).label}`, cfg);
    return;
  }

  if (cmd === "/demote") {
    if (!target) { await noTarget("`/demote @user`"); return; }
    const tLvl = await getLevel(env, chatId, target.id);
    if (tLvl === 0) { await tempReply(env, msg, "❌ У пользователя нет ранга."); return; }
    if (tLvl >= callerLevel) {
      await tempReply(env, msg, "❌ Нельзя понизить пользователя с равным или высшим рангом.");
      return;
    }
    const newLvl = tLvl - 1;
    if (newLvl === 0) {
      await env.DB.prepare(`DELETE FROM staff WHERE chat_id = ? AND user_id = ?`).bind(chatId, target.id).run();
    } else {
      await setStaffRank(env.DB, chatId, target.id, newLvl, String(msg.from.id));
    }
    await applyTelegramRank(env, chatId, target.id, newLvl);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, "⬇️", "Понижение", [
      ["Пользователь", target.name],
      ["Новый ранг", `${rank(newLvl).icon} ${rank(newLvl).label}`],
      ["Понизил", caller],
    ]);
    await logAct(env, chatId, target.id, target.name, `понижен до ${rank(newLvl).label}`, cfg);
    return;
  }

  if (cmd === "/setrank") {
    if (!target) { await noTarget("`/setrank @user Модератор`"); return; }
    const newLvl = rankFromName(args.reason || "");
    if (newLvl === null) {
      await tempReply(env, msg,
        `❓ Доступные ранги:\n${RANKS.slice(1, 7).map(r => `${r.icon} ${r.label}`).join("\n")}`
      );
      return;
    }
    if (newLvl >= callerLevel) {
      await tempReply(env, msg, "❌ Нельзя назначить ранг равный или выше своего.");
      return;
    }
    const tLvl = await getLevel(env, chatId, target.id);
    if (tLvl >= callerLevel) {
      await tempReply(env, msg, "❌ Нельзя изменить ранг пользователя с равным или высшим рангом.");
      return;
    }
    if (newLvl === 0) {
      await env.DB.prepare(`DELETE FROM staff WHERE chat_id = ? AND user_id = ?`).bind(chatId, target.id).run();
    } else {
      await setStaffRank(env.DB, chatId, target.id, newLvl, String(msg.from.id));
    }
    await applyTelegramRank(env, chatId, target.id, newLvl);
    await delMsg(env, chatId, msg.message_id);
    await sendCard(env, chatId, rank(newLvl).icon, "Ранг назначен", [
      ["Пользователь", target.name],
      ["Ранг", `${rank(newLvl).icon} ${rank(newLvl).label}`],
      ["Назначил", caller],
    ]);
    await logAct(env, chatId, target.id, target.name, `ранг: ${rank(newLvl).label}`, cfg);
    return;
  }

  if (cmd === "/staff") {
    await delMsg(env, chatId, msg.message_id);
    const rows = await env.DB.prepare(
      `SELECT user_id, rank_level FROM staff WHERE chat_id = ? AND rank_level > 0 ORDER BY rank_level DESC`
    ).bind(chatId).all();
    const items = rows.results || [];
    if (!items.length) {
      await sendCard(env, chatId, "👥", "Команда", [["Состав", "Пока никого нет"]],
        "Используй /promote чтобы назначить", [], 20);
      return;
    }
    const groups = {};
    for (const it of items) {
      if (!groups[it.rank_level]) groups[it.rank_level] = [];
      groups[it.rank_level].push(it.user_id);
    }
    const lines = ["👥 *Команда чата*", "─".repeat(22)];
    for (const lvl of Object.keys(groups).sort((a, b) => Number(b) - Number(a))) {
      const r = rank(Number(lvl));
      lines.push(`\n${r.icon} *${r.label}*`);
      for (const uid of groups[lvl]) {
        let name = `user_${uid}`;
        try {
          const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: uid });
          if (m?.user) name = getUserName(m.user);
        } catch {}
        lines.push(`  • ${name}`);
      }
    }
    await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "Markdown" });
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

async function handleCallback(cb, env) {
  const data   = cb.data || "";
  const fromId = String(cb.from.id);

  // ── Брак — принятие/отклонение ───────────────────────────────────────────
  if (data.startsWith("marry_yes:") || data.startsWith("marry_no:")) {
    const parts      = data.split(":");
    const action     = parts[0];
    const proposerId = parts[1];
    const targetId   = parts[2];

    if (fromId !== targetId) {
      await answerCb(env, cb.id, "Это предложение не тебе 😄");
      return;
    }

    if (action === "marry_no") {
      await answerCb(env, cb.id, "💔 Отклонено");
      if (cb.message) {
        try {
          await tg(env, "editMessageText", {
            chat_id: cb.message.chat.id, message_id: cb.message.message_id,
            text: `💔 Предложение отклонено.`,
          });
        } catch {}
      }
      return;
    }

    // marry_yes
    const proposerName = decodeURI(parts[3] || `user_${proposerId}`);
    const targetName   = decodeURI(parts[4] || `user_${targetId}`);
    const chatId       = String(cb.message?.chat?.id || "");
    if (!chatId) return;

    // Проверяем что ещё не в браке (могли успеть между нажатием)
    const check1 = await env.DB.prepare(
      `SELECT 1 FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, proposerId).first();
    const check2 = await env.DB.prepare(
      `SELECT 1 FROM marriages WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, targetId).first();

    if (check1 || check2) {
      await answerCb(env, cb.id, "❌ Кто-то уже в браке!");
      return;
    }

    await env.DB.prepare(
      `INSERT INTO marriages (chat_id, user_id, partner_id, partner_name, married_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET partner_id = excluded.partner_id,
         partner_name = excluded.partner_name, married_at = excluded.married_at`
    ).bind(chatId, proposerId, targetId, targetName, nowTs()).run();

    await env.DB.prepare(
      `INSERT INTO marriages (chat_id, user_id, partner_id, partner_name, married_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET partner_id = excluded.partner_id,
         partner_name = excluded.partner_name, married_at = excluded.married_at`
    ).bind(chatId, targetId, proposerId, proposerName, nowTs()).run();

    await answerCb(env, cb.id, "💒 Совет да любовь!");
    if (cb.message) {
      try {
        await tg(env, "editMessageText", {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id,
          text: `💒 *${proposerName}* и *${targetName}* теперь состоят в браке! 🎉\n\n❤️ Совет да любовь!`,
          parse_mode: "Markdown",
        });
      } catch {}
    }
    return;
  }

  // ── Help ─────────────────────────────────────────────────────────────────
  if (data.startsWith("help:")) {
    const section = data.slice(5);

    const mainKeyboard = [[
      { text: "⚠️ Варны",    callback_data: "help:warns"  },
      { text: "🔇 Мут / RO", callback_data: "help:mute"   },
    ],[
      { text: "🚫 Бан / Кик",callback_data: "help:ban"    },
      { text: "🗑 Удаление", callback_data: "help:del"    },
    ],[
      { text: "🔍 Инфо",     callback_data: "help:info"   },
      { text: "⚙️ Настройки",callback_data: "help:settings"},
    ],[
      { text: "🎖 Ранги",    callback_data: "help:ranks"  },
      { text: "📝 Примеры",  callback_data: "help:examples"},
    ]];

    const mainText = `🛡 <b>Бот модерации — Команды</b>\n\nВыбери раздел:`;

    if (section === "main") {
      if (cb.message) {
        try {
          await tg(env, "editMessageText", {
            chat_id: cb.message.chat.id, message_id: cb.message.message_id,
            parse_mode: "HTML", text: mainText,
            reply_markup: { inline_keyboard: mainKeyboard },
          });
        } catch {}
      }
      await answerCb(env, cb.id, "");
      return;
    }

    const pages = {
      warns:    `<b>⚠️ Предупреждения</b>\n\n<code>/warn</code> — варн (ответь на сообщение)\n<code>/warn @user маты</code> — с причиной\n<code>/unwarn</code> — снять варн\n<code>/warns</code> — количество варнов\n\n💡 При достижении лимита — <b>автобан</b>\n<code>/set maxwarns 5</code> — изменить лимит`,
      mute:     `<b>🔇 Мут</b>\n\n<code>/mute</code> — мут на 1 час\n<code>/mute @user 30m маты</code> — с временем\n<code>/unmute</code> — снять мут\n<code>/ro @user 1h</code> — только читать\n\n⏱ Время: <code>5m</code>=5 мин, <code>2h</code>=2 часа, <code>1d</code>=1 день`,
      ban:      `<b>🚫 Бан / кик</b>\n\n<code>/ban</code> — бан навсегда\n<code>/ban @user расчлёнка</code> — с причиной\n<code>/ban @user 1d спам</code> — на время\n<code>/unban @user</code> — разбанить\n<code>/kick</code> — кикнуть (может вернуться)`,
      del:      `<b>🗑 Удаление</b>\n\n<code>/del</code> или <code>/d</code>\n\nОтветь на сообщение которое нужно удалить`,
      info:     `<b>🔍 Информация</b>\n\n<code>/info</code> — ранг, варны, ID\n<code>/trust @user</code> — разрешить ссылки\n<code>/untrust @user</code> — запретить\n<code>/addword слово</code> — стоп-слово\n<code>/words</code> — список стоп-слов`,
      settings: `<b>⚙️ Настройки</b> (Админ+)\n\n<code>/settings</code> — текущие\n<code>/set antimat on</code>\n<code>/set antilinks on</code>\n<code>/set antiflood on</code>\n<code>/set antinsfw on</code>\n<code>/set captcha on</code>\n<code>/set welcome on</code>\n<code>/set maxwarns 3</code>\n<code>/set floodlimit 5</code>\n<code>/set welcometext Привет, {name}!</code>`,
      ranks:    `<b>🎖 Ранги</b> (Ст. Админ+)\n\n<code>/promote @user</code> — повысить на 1 ранг\n<code>/demote @user</code> — понизить на 1 ранг\n<code>/setrank @user Модератор</code> — назначить ранг\n<code>/staff</code> — список команды\n\n🟢 Мл. модератор — warn, del\n🔵 Модератор — + mute, kick\n🟣 Ст. модератор — + ban\n🟡 Мл. админ — + стоп-слова, info\n🟠 Админ — + /set настройки\n🔴 Ст. админ — + управление рангами\n⭐ Овнер — всё`,
      examples: `<b>📝 Примеры</b>\n\nОтветь на сообщение нарушителя:\n<code>/mute 5h маты</code>\n<code>/ban 1d расчлёнка</code>\n<code>/warn оскорбление</code>\n<code>/ban спам</code> — навсегда\n<code>/ro 30m флуд</code>\n\nС указанием пользователя:\n<code>/mute @user 2h реклама</code>\n<code>/setrank @user Модератор</code>`,
    };

    const pageText = pages[section];
    if (!pageText) { await answerCb(env, cb.id, "Раздел не найден"); return; }

    if (cb.message) {
      try {
        await tg(env, "editMessageText", {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id,
          parse_mode: "HTML", text: pageText,
          reply_markup: { inline_keyboard: [[{ text: "◀️ Назад", callback_data: "help:main" }]] },
        });
      } catch {}
    }
    await answerCb(env, cb.id, "");
    return;
  }

  // ── Кнопки модерации ─────────────────────────────────────────────────────
  const action = data.split(":")[0];
  if (["unmute","unban","warn","mute","ban"].includes(action)) {
    const parts  = data.split(":");
    const userId = parts[1];
    const chatId = parts[2];
    const extra  = parts[3];

    const fromLvl = await getLevel(env, chatId, fromId);
    if (fromLvl < 1) { await answerCb(env, cb.id, "❌ Только для модераторов"); return; }

    const cfg     = await getConfig(env.DB, chatId);
    const modName = getUserName(cb.from);
    let   memName = `user_${userId}`;
    try {
      const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: userId });
      if (m?.user) memName = getUserName(m.user);
    } catch {}

    if (action === "unmute") {
      if (fromLvl < CMD_LEVEL["/unmute"]) { await answerCb(env, cb.id, "❌ Недостаточно прав"); return; }
      try {
        await unmuteUser(env, chatId, userId);
        await answerCb(env, cb.id, "🔊 Мут снят");
        if (cb.message) await editMsg(env, cb.message, `🔊 Мут снят — ${memName}\nМодератор: ${modName}`);
        await logAct(env, chatId, userId, memName, "размут (кнопка)", cfg);
      } catch { await answerCb(env, cb.id, "Ошибка"); }
      return;
    }

    if (action === "unban") {
      if (fromLvl < CMD_LEVEL["/unban"]) { await answerCb(env, cb.id, "❌ Недостаточно прав"); return; }
      try {
        await tg(env, "unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
        await answerCb(env, cb.id, "✅ Разбанен");
        if (cb.message) await editMsg(env, cb.message, `✅ Разбан — ${memName}\nМодератор: ${modName}`);
        await logAct(env, chatId, userId, memName, "разбан (кнопка)", cfg);
      } catch { await answerCb(env, cb.id, "Ошибка"); }
      return;
    }

    if (action === "warn") {
      if (fromLvl < CMD_LEVEL["/warn"]) { await answerCb(env, cb.id, "❌ Недостаточно прав"); return; }
      const warns = await addWarn(env.DB, chatId, userId);
      const max   = cfg.max_warns || 3;
      await answerCb(env, cb.id, `⚠️ Варн ${warns}/${max}`);
      if (warns >= max) {
        try { await tg(env, "banChatMember", { chat_id: chatId, user_id: userId }); } catch {}
        await env.DB.prepare(`DELETE FROM warns WHERE chat_id = ? AND user_id = ?`).bind(chatId, userId).run();
        if (cb.message) await editMsg(env, cb.message, `🚫 Автобан — ${memName} (${warns}/${max} варнов)`);
      } else {
        if (cb.message) await editMsg(env, cb.message,
          `⚠️ Варн — ${memName}\n${warnBar(warns, max)} ${warns}/${max}\nМодератор: ${modName}`
        );
      }
      await logAct(env, chatId, userId, memName, `варн ${warns}/${max} (кнопка)`, cfg);
      return;
    }

    if (action === "mute") {
      if (fromLvl < CMD_LEVEL["/mute"]) { await answerCb(env, cb.id, "❌ Недостаточно прав"); return; }
      const dur = Number(extra) || 3600;
      try {
        await muteMember(env, chatId, userId, dur);
        await answerCb(env, cb.id, `🔇 Мут ${fmtDur(dur)}`);
        if (cb.message) await editMsg(env, cb.message, `🔇 Мут ${fmtDur(dur)} — ${memName}\nМодератор: ${modName}`);
        await logAct(env, chatId, userId, memName, `мут ${fmtDur(dur)} (кнопка)`, cfg);
      } catch { await answerCb(env, cb.id, "Ошибка"); }
      return;
    }

    if (action === "ban") {
      if (fromLvl < CMD_LEVEL["/ban"]) { await answerCb(env, cb.id, "❌ Недостаточно прав"); return; }
      try {
        await tg(env, "banChatMember", { chat_id: chatId, user_id: userId });
        await answerCb(env, cb.id, "🚫 Забанен");
        if (cb.message) await editMsg(env, cb.message, `🚫 Бан — ${memName}\nМодератор: ${modName}`);
        await logAct(env, chatId, userId, memName, "бан (кнопка)", cfg);
      } catch { await answerCb(env, cb.id, "Ошибка"); }
      return;
    }
  }

  // ── Капча ────────────────────────────────────────────────────────────────
  if (data.startsWith("captcha:")) {
    const [, targetId, chatId] = data.split(":");
    if (fromId !== targetId) { await answerCb(env, cb.id, "Эта кнопка не для тебя 😄"); return; }
    try { await unmuteUser(env, chatId, targetId); } catch {}
    const p = await env.DB.prepare(
      `SELECT message_id FROM captcha_pending WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, targetId).first();
    if (p?.message_id) {
      try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: p.message_id }); } catch {}
    }
    await env.DB.prepare(`DELETE FROM captcha_pending WHERE chat_id = ? AND user_id = ?`)
      .bind(chatId, targetId).run();
    await answerCb(env, cb.id, "✅ Добро пожаловать!");
    const cfg = await getConfig(env.DB, chatId);
    if (cfg.welcome_enabled && cfg.welcome_text) {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: cfg.welcome_text.replace("{name}", getUserName(cb.from)),
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW MEMBERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleNewMembers(msg, env) {
  const chatId = String(msg.chat.id);
  const cfg    = await getConfig(env.DB, chatId);
  for (const member of msg.new_chat_members) {
    if (member.is_bot) continue;
    const userId = String(member.id);
    const name   = getUserName(member);
    if (cfg.captcha_enabled) {
      try {
        await tg(env, "restrictChatMember", {
          chat_id: chatId, user_id: userId,
          permissions: { can_send_messages: false },
        });
      } catch {}
      await env.DB.prepare(
        `INSERT INTO captcha_pending (chat_id, user_id, message_id, created_at)
         VALUES (?, ?, 0, ?) ON CONFLICT(chat_id, user_id) DO UPDATE SET created_at = excluded.created_at`
      ).bind(chatId, userId, nowTs()).run();
      const sent = await tg(env, "sendMessage", {
        chat_id: chatId,
        text: `👋 ${name}, докажи что ты не бот — нажми кнопку в течение 2 минут.`,
        reply_markup: { inline_keyboard: [[
          { text: "✅ Я не бот!", callback_data: `captcha:${userId}:${chatId}` },
        ]]},
      });
      await env.DB.prepare(`UPDATE captcha_pending SET message_id = ? WHERE chat_id = ? AND user_id = ?`)
        .bind(sent.message_id, chatId, userId).run();
    } else if (cfg.welcome_enabled && cfg.welcome_text) {
      await tg(env, "sendMessage", {
        chat_id: chatId,
        text: cfg.welcome_text.replace("{name}", name).replace("{chat}", msg.chat.title || ""),
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MOD
// ═══════════════════════════════════════════════════════════════════════════

async function autoMod(msg, env, cfg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id || "");
  if (!userId) return;
  const lvl = await getLevel(env, chatId, userId);
  if (lvl >= 1) return; // персонал не трогаем

  // Капча
  const pending = await env.DB.prepare(
    `SELECT 1 FROM captcha_pending WHERE chat_id = ? AND user_id = ? LIMIT 1`
  ).bind(chatId, userId).first();
  if (pending) {
    try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }); } catch {}
    return;
  }

  const text = msg.text || msg.caption || "";

  // NSFW
  if (cfg.antinsfw_enabled && (msg.photo || msg.document?.mime_type?.startsWith("image/"))) {
    const nsfw = await checkNsfw(env, msg);
    if (nsfw) {
      await delMsg(env, chatId, msg.message_id);
      const warns = await addWarn(env.DB, chatId, userId);
      const max   = cfg.max_warns || 3;
      if (warns >= max) {
        try { await tg(env, "banChatMember", { chat_id: chatId, user_id: userId }); } catch {}
        await env.DB.prepare(`DELETE FROM warns WHERE chat_id = ? AND user_id = ?`).bind(chatId, userId).run();
        await tempMsg(env, chatId, `🚫 ${getUserName(msg.from)} забанен за NSFW.`, 15);
      } else {
        await tempMsg(env, chatId, `🔞 ${getUserName(msg.from)}, NSFW удалено. Варн ${warns}/${max}.`, 10);
      }
      await logAct(env, chatId, userId, getUserName(msg.from), `NSFW ${warns}/${max}`, cfg);
      return;
    }
  }

  // Антимат
  if (cfg.antimat_enabled && hasBadWords(text, cfg.bad_words)) {
    await delMsg(env, chatId, msg.message_id);
    const warns = await addWarn(env.DB, chatId, userId);
    const max   = cfg.max_warns || 3;
    if (warns >= max) {
      try { await tg(env, "banChatMember", { chat_id: chatId, user_id: userId }); } catch {}
      await env.DB.prepare(`DELETE FROM warns WHERE chat_id = ? AND user_id = ?`).bind(chatId, userId).run();
      await tempMsg(env, chatId, `🚫 ${getUserName(msg.from)} забанен за мат.`, 15);
    } else {
      await tempMsg(env, chatId, `⚠️ ${getUserName(msg.from)}, мат удалён. Варн ${warns}/${max}.`, 10);
    }
    await logAct(env, chatId, userId, getUserName(msg.from), `мат ${warns}/${max}`, cfg);
    return;
  }

  // Антиссылки
  if (cfg.antilinks_enabled && hasLinks(text)) {
    const trusted = await env.DB.prepare(
      `SELECT 1 FROM trusted_users WHERE chat_id = ? AND user_id = ? LIMIT 1`
    ).bind(chatId, userId).first();
    if (!trusted) {
      await delMsg(env, chatId, msg.message_id);
      const warns = await addWarn(env.DB, chatId, userId);
      const max   = cfg.max_warns || 3;
      await tempMsg(env, chatId, `⚠️ ${getUserName(msg.from)}, ссылки запрещены. Варн ${warns}/${max}.`, 10);
      await logAct(env, chatId, userId, getUserName(msg.from), `ссылка ${warns}/${max}`, cfg);
      return;
    }
  }

  // Антифлуд
  if (cfg.antiflood_enabled) {
    const flood = await checkFlood(env.DB, chatId, userId, cfg.flood_limit || 5, cfg.flood_window || 10);
    if (flood) {
      await delMsg(env, chatId, msg.message_id);
      await muteMember(env, chatId, userId, 60);
      await tempMsg(env, chatId, `⚡ ${getUserName(msg.from)} замучен на 1 минуту за флуд.`, 10);
      await logAct(env, chatId, userId, getUserName(msg.from), "автомут-флуд", cfg);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELP MENU
// ═══════════════════════════════════════════════════════════════════════════

async function sendHelpMenu(env, msg, chatId) {
  try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }); } catch {}
  await tg(env, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `🛡 <b>Бот модерации — Команды</b>\n\nВыбери раздел:`,
    reply_markup: { inline_keyboard: [[
      { text: "⚠️ Варны",    callback_data: "help:warns"   },
      { text: "🔇 Мут / RO", callback_data: "help:mute"    },
    ],[
      { text: "🚫 Бан / Кик",callback_data: "help:ban"     },
      { text: "🗑 Удаление", callback_data: "help:del"     },
    ],[
      { text: "🔍 Инфо",     callback_data: "help:info"    },
      { text: "⚙️ Настройки",callback_data: "help:settings"},
    ],[
      { text: "🎖 Ранги",    callback_data: "help:ranks"   },
      { text: "📝 Примеры",  callback_data: "help:examples"},
    ]]},
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function sendCard(env, chatId, icon, title, fields, note = null, buttons = [], autoDelSec = 0) {
  const lines = [`${icon} *${title}*`, "─".repeat(22)];
  for (const [k, v] of fields) lines.push(`*${k}:* ${v}`);
  if (note) { lines.push("─".repeat(22)); lines.push(note); }
  const payload = { chat_id: chatId, text: lines.join("\n"), parse_mode: "Markdown" };
  if (buttons.length) payload.reply_markup = { inline_keyboard: buttons };
  const sent = await tg(env, "sendMessage", payload);
  if (autoDelSec > 0 && !buttons.length) {
    setTimeout(async () => {
      try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: sent.message_id }); } catch {}
    }, autoDelSec * 1000);
  }
  return sent;
}

async function tempMsg(env, chatId, text, delaySec = 10) {
  try {
    const sent = await tg(env, "sendMessage", { chat_id: chatId, text });
    setTimeout(async () => {
      try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: sent.message_id }); } catch {}
    }, delaySec * 1000);
  } catch {}
}

async function tempReply(env, msg, text, delaySec = 8) {
  try {
    const sent = await tg(env, "sendMessage", {
      chat_id: String(msg.chat.id), text, parse_mode: "Markdown",
      reply_to_message_id: msg.message_id,
    });
    setTimeout(async () => {
      try { await tg(env, "deleteMessage", { chat_id: String(msg.chat.id), message_id: sent.message_id }); } catch {}
      try { await tg(env, "deleteMessage", { chat_id: String(msg.chat.id), message_id: msg.message_id }); } catch {}
    }, delaySec * 1000);
  } catch {}
}

async function editMsg(env, message, text) {
  try {
    await tg(env, "editMessageText", {
      chat_id: message.chat.id, message_id: message.message_id,
      text, parse_mode: "Markdown",
    });
  } catch {}
}

async function answerCb(env, id, text) {
  try { await tg(env, "answerCallbackQuery", { callback_query_id: id, text, show_alert: false }); } catch {}
}

async function delMsg(env, chatId, messageId) {
  try { await tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId }); } catch {}
}

async function muteMember(env, chatId, userId, durationSec) {
  await tg(env, "restrictChatMember", {
    chat_id: chatId, user_id: userId,
    until_date: durationSec > 0 ? nowTs() + durationSec : 0,
    permissions: { can_send_messages: false, can_send_media_messages: false,
      can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false },
  });
}

async function unmuteUser(env, chatId, userId) {
  await tg(env, "restrictChatMember", {
    chat_id: chatId, user_id: userId,
    permissions: { can_send_messages: true, can_send_media_messages: true,
      can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true },
  });
}

async function getTarget(msg, env, chatId) {
  // 1. Ответ на сообщение — самый надёжный способ
  if (msg.reply_to_message?.from) {
    const f = msg.reply_to_message.from;
    return { id: String(f.id), name: getUserName(f) };
  }

  const text = msg.text || "";

  // 2. @username — пробуем через Telegram API
  const um = text.match(/@(\w+)/);
  if (um) {
    try {
      const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: `@${um[1]}` });
      if (m?.user) return { id: String(m.user.id), name: getUserName(m.user) };
    } catch {}
    // Если Telegram не нашёл — ищем в нашем кэше пользователей
    const cached = await env.DB.prepare(
      `SELECT user_id, display_name FROM user_cache WHERE chat_id = ? AND username = ? LIMIT 1`
    ).bind(chatId, um[1].toLowerCase()).first();
    if (cached) return { id: cached.user_id, name: cached.display_name };

    // Не нашли — сообщаем что пользователь должен написать в чат
    return { id: null, name: `@${um[1]}`, notFound: true };
  }

  // 3. Числовой ID
  const im = text.match(/\b(\d{5,})\b/);
  if (im) {
    try {
      const m = await tg(env, "getChatMember", { chat_id: chatId, user_id: im[1] });
      if (m?.user) return { id: String(m.user.id), name: getUserName(m.user) };
    } catch {}
    return { id: im[1], name: `user_${im[1]}` };
  }

  return null;
}

// Кэшируем пользователей когда они пишут в чат
async function cacheUser(db, chatId, user) {
  if (!user?.id) return;
  try {
    await db.prepare(
      `INSERT INTO user_cache (chat_id, user_id, username, display_name, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`
    ).bind(
      chatId, String(user.id),
      (user.username || "").toLowerCase(),
      getUserName(user),
      nowTs()
    ).run();
  } catch {}
}

async function upsertChatMeta(env, chat) {
  if (!chat?.id) return;
  const chatId = String(chat.id);
  const title  = chat.title || (chat.first_name ? `${chat.first_name}${chat.last_name ? " " + chat.last_name : ""}` : "") || "";
  const type   = chat.type || "";
  const uname  = chat.username || "";
  const ts     = nowTs();
  try {
    await env.DB.prepare(
      `INSERT INTO chat_meta (chat_id, title, type, username, first_seen, last_seen, removed)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(chat_id) DO UPDATE SET
         title     = CASE WHEN excluded.title <> '' THEN excluded.title ELSE chat_meta.title END,
         type      = CASE WHEN excluded.type  <> '' THEN excluded.type  ELSE chat_meta.type  END,
         username  = excluded.username,
         last_seen = excluded.last_seen,
         removed   = 0`
    ).bind(chatId, title, type, uname, ts, ts).run();
  } catch {}
}

async function logMessage(db, chatId, msg) {
  try {
    let kind = "text";
    if (msg.photo) kind = "photo";
    else if (msg.video) kind = "video";
    else if (msg.voice) kind = "voice";
    else if (msg.audio) kind = "audio";
    else if (msg.document) kind = "document";
    else if (msg.sticker) kind = "sticker";
    else if (msg.animation) kind = "animation";
    else if (msg.poll) kind = "poll";
    else if (msg.location) kind = "location";

    const rawText = msg.text || msg.caption || "";
    const text    = rawText.length > 4000 ? rawText.slice(0, 4000) : rawText;
    const userId  = String(msg.from?.id || "0");
    const userName = msg.from ? getUserName(msg.from) : "";

    await db.prepare(
      `INSERT INTO chat_messages (chat_id, message_id, user_id, user_name, text, kind, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(chatId, msg.message_id || 0, userId, userName, text, kind, msg.date || nowTs()).run();

    // Trim per-chat to last 1000 messages to keep D1 small
    await db.prepare(
      `DELETE FROM chat_messages
       WHERE chat_id = ?
         AND id NOT IN (
           SELECT id FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1000
         )`
    ).bind(chatId, chatId).run();
  } catch {}
}

function parseArgs(text = "") {
  const rest    = text.replace(/^\/\w+(?:@\w+)?/, "").trim();
  const noMen   = rest.replace(/^@\w+\s*/, "").trim();
  const tm      = noMen.match(/^(\d+[smhd])\s*/i);
  let dur = 0, reason = noMen;
  if (tm) { dur = parseDur(tm[1]); reason = noMen.slice(tm[0].length).trim(); }
  return { duration: dur, reason: reason || null };
}

function parseDur(str = "") {
  const m = str.trim().match(/^(\d+)(с|м|ч|д|s|m|h|d)?$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  switch ((m[2] || "м").toLowerCase()) {
    case "с": case "s": return n;
    case "м": case "m": return n * 60;
    case "ч": case "h": return n * 3600;
    case "д": case "d": return n * 86400;
    default:            return n * 60;
  }
}

function fmtDur(sec) {
  if (sec >= 86400) return `${Math.floor(sec / 86400)} д.`;
  if (sec >= 3600)  return `${Math.floor(sec / 3600)} ч.`;
  if (sec >= 60)    return `${Math.floor(sec / 60)} мин.`;
  return `${sec} сек.`;
}

function warnBar(count, max) {
  const f = Math.min(count, max);
  return "🟥".repeat(f) + "⬜".repeat(Math.max(0, max - f));
}

function getUserName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `user_${user.id}`;
}

function getCmd(text = "") {
  const m = text.trim().match(/^(\/[\w\u0400-\u04FF]+)(?:@\w+)?/);
  return m ? m[1].toLowerCase() : null;
}

function hasBadWords(text, str) {
  if (!text || !str) return false;
  const words = str.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  return words.some(w => lower.includes(w));
}

function hasLinks(text) {
  if (!text) return false;
  return /https?:\/\/|t\.me\/|tg:\/\//i.test(text);
}

async function checkFlood(db, chatId, userId, limit, windowSec) {
  const since = nowTs() - windowSec;
  const res = await db.prepare(
    `SELECT COUNT(*) as cnt FROM flood_log WHERE chat_id = ? AND user_id = ? AND ts > ?`
  ).bind(chatId, userId, since).first();
  await db.prepare(`INSERT INTO flood_log (chat_id, user_id, ts) VALUES (?, ?, ?)`)
    .bind(chatId, userId, nowTs()).run();
  if (Math.random() < 0.01) {
    await db.prepare(`DELETE FROM flood_log WHERE ts < ?`).bind(nowTs() - 3600).run();
  }
  return Number(res?.cnt || 0) >= limit;
}

async function checkNsfw(env, msg) {
  try {
    const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
    const info   = await tg(env, "getFile", { file_id: fileId });
    const url    = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.file_path}`;
    const res    = await fetch(url);
    if (!res.ok) return false;
    const buf    = await res.arrayBuffer();
    const bytes  = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);
    const mime   = info.file_path.endsWith(".png") ? "image/png" : "image/jpeg";
    const headers = { "Content-Type": "application/json" };
    if (env.HF_TOKEN) headers["Authorization"] = `Bearer ${env.HF_TOKEN}`;
    const hf = await fetch(
      "https://api-inference.huggingface.co/models/Falconsai/nsfw_image_detection",
      { method: "POST", headers, body: JSON.stringify({ inputs: `data:${mime};base64,${base64}` }) }
    );
    if (!hf.ok) return false;
    const data = await hf.json();
    if (!Array.isArray(data)) return false;
    const item = data.find(r => r.label?.toLowerCase() === "nsfw");
    return (item?.score || 0) >= 0.85;
  } catch { return false; }
}

// Применяет ранг в Telegram: делает админом с кастомным титулом
// или снимает админку если ранг 0
async function applyTelegramRank(env, chatId, userId, level) {
  const r = rank(level);
  try {
    if (level === 0) {
      // Снимаем права если были выданы ботом
      await tg(env, "promoteChatMember", {
        chat_id: chatId, user_id: userId,
        is_anonymous: false,
        can_manage_chat: false,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_post_messages: false,
        can_edit_messages: false,
        can_pin_messages: false,
      });
    } else {
      // Выдаём права соответственно рангу
      const canDelete   = level >= 1; // все могут удалять
      const canRestrict = level >= 2; // мут с модератора
      const canBan      = level >= 3; // бан со ст. модератора
      const canChange   = level >= 5; // настройки с админа
      const canPromote  = level >= 6; // повышать со ст. админа

      await tg(env, "promoteChatMember", {
        chat_id: chatId, user_id: userId,
        is_anonymous: false,
        can_manage_chat: true,
        can_delete_messages: canDelete,
        can_manage_video_chats: false,
        can_restrict_members: canRestrict,
        can_promote_members: canPromote,
        can_change_info: canChange,
        can_invite_users: true,
        can_pin_messages: canChange,
      });

      // Устанавливаем кастомный титул
      try {
        await tg(env, "setChatAdministratorCustomTitle", {
          chat_id: chatId,
          user_id: userId,
          custom_title: r.label,
        });
      } catch {}
    }
  } catch (err) {
    console.error("applyTelegramRank failed:", String(err));
  }
}


async function addWarn(db, chatId, userId) {
  await db.prepare(
    `INSERT INTO warns (chat_id, user_id, count, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  ).bind(chatId, userId, nowTs()).run();
  const r = await db.prepare(`SELECT count FROM warns WHERE chat_id = ? AND user_id = ? LIMIT 1`)
    .bind(chatId, userId).first();
  return Number(r?.count || 1);
}

async function removeWarn(db, chatId, userId) {
  await db.prepare(
    `UPDATE warns SET count = MAX(0, count - 1) WHERE chat_id = ? AND user_id = ?`
  ).bind(chatId, userId).run();
  const r = await db.prepare(`SELECT count FROM warns WHERE chat_id = ? AND user_id = ? LIMIT 1`)
    .bind(chatId, userId).first();
  return Number(r?.count || 0);
}

async function getWarnCount(db, chatId, userId) {
  const r = await db.prepare(`SELECT count FROM warns WHERE chat_id = ? AND user_id = ? LIMIT 1`)
    .bind(chatId, userId).first();
  return Number(r?.count || 0);
}

async function setStaffRank(db, chatId, userId, level, promotedBy) {
  await db.prepare(
    `INSERT INTO staff (chat_id, user_id, rank_level, promoted_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       rank_level = excluded.rank_level,
       promoted_by = excluded.promoted_by,
       updated_at = excluded.updated_at`
  ).bind(chatId, userId, level, promotedBy, nowTs()).run();
}

async function getConfig(db, chatId) {
  let row = await db.prepare(`SELECT * FROM chat_settings WHERE chat_id = ? LIMIT 1`).bind(chatId).first();
  if (!row) {
    await db.prepare(`INSERT INTO chat_settings (chat_id) VALUES (?) ON CONFLICT DO NOTHING`).bind(chatId).run();
    row = await db.prepare(`SELECT * FROM chat_settings WHERE chat_id = ? LIMIT 1`).bind(chatId).first();
  }
  return row || {};
}

async function setSetting(db, chatId, key, value) {
  await db.prepare(`UPDATE chat_settings SET ${key} = ? WHERE chat_id = ?`).bind(value, chatId).run();
}

async function logAct(env, chatId, userId, userName, action, cfg) {
  const logId = cfg.log_chat_id || env.LOG_CHAT_ID;
  if (!logId) return;
  try {
    await tg(env, "sendMessage", {
      chat_id: logId,
      text: `📋 *Лог*\nЧат: \`${chatId}\`\nПользователь: ${userName} (\`${userId}\`)\nДействие: ${action}\n${new Date().toISOString()}`,
      parse_mode: "Markdown",
    });
  } catch {}
}

function nowTs() { return Math.floor(Date.now() / 1000); }

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM API
// ═══════════════════════════════════════════════════════════════════════════

async function tg(env, method, payload) {
  const token = typeof env === "string" ? env : env.BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`${method}: non-JSON ${res.status}`); }
  if (!res.ok || !data.ok) throw new Error(`${method} [${res.status}]: ${JSON.stringify(data)}`);
  return data.result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

async function ensureSchema(db) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS staff (
      chat_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      rank_level  INTEGER NOT NULL DEFAULT 0,
      promoted_by TEXT,
      updated_at  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS chat_settings (
      chat_id           TEXT PRIMARY KEY,
      antimat_enabled   INTEGER NOT NULL DEFAULT 0,
      antilinks_enabled INTEGER NOT NULL DEFAULT 0,
      antiflood_enabled INTEGER NOT NULL DEFAULT 0,
      antinsfw_enabled  INTEGER NOT NULL DEFAULT 0,
      captcha_enabled   INTEGER NOT NULL DEFAULT 0,
      welcome_enabled   INTEGER NOT NULL DEFAULT 1,
      welcome_text      TEXT DEFAULT 'Добро пожаловать, {name}!',
      max_warns         INTEGER NOT NULL DEFAULT 3,
      flood_limit       INTEGER NOT NULL DEFAULT 5,
      flood_window      INTEGER NOT NULL DEFAULT 10,
      bad_words         TEXT DEFAULT '',
      log_chat_id       TEXT,
      rules_text        TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS reputation (
      chat_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      rep        INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS marriages (
      chat_id      TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      partner_id   TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      married_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS fun_cooldowns (
      chat_id TEXT NOT NULL,
      key     TEXT NOT NULL,
      ts      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, key)
    )`,
    `CREATE TABLE IF NOT EXISTS warns (
      chat_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS trusted_users (
      chat_id  TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      added_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS captcha_pending (
      chat_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      message_id INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_cache (
      chat_id      TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      username     TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_cache_username ON user_cache(chat_id, username)`,
    `CREATE TABLE IF NOT EXISTS flood_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ts      INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_staff_chat ON staff(chat_id, rank_level DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_flood_log  ON flood_log(chat_id, user_id, ts)`,
    `CREATE INDEX IF NOT EXISTS idx_warns_chat ON warns(chat_id)`,

    `CREATE TABLE IF NOT EXISTS clans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      tag         TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      owner_id    TEXT    NOT NULL,
      is_open     INTEGER NOT NULL DEFAULT 1,
      total_rep   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(chat_id, name),
      UNIQUE(chat_id, tag)
    )`,
    `CREATE TABLE IF NOT EXISTS clan_members (
      clan_id    INTEGER NOT NULL,
      chat_id    TEXT    NOT NULL,
      user_id    TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'member',
      joined_at  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS clan_invites (
      clan_id    INTEGER NOT NULL,
      chat_id    TEXT    NOT NULL,
      user_id    TEXT    NOT NULL,
      invited_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (clan_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS clan_wars (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id      TEXT    NOT NULL,
      attacker_id  INTEGER NOT NULL,
      defender_id  INTEGER NOT NULL,
      attacker_rep INTEGER NOT NULL DEFAULT 0,
      defender_rep INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'pending',
      started_at   INTEGER NOT NULL DEFAULT 0,
      ends_at      INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clans_chat        ON clans(chat_id, total_rep DESC)`,

    `CREATE TABLE IF NOT EXISTS chat_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     TEXT    NOT NULL,
      message_id  INTEGER NOT NULL,
      user_id     TEXT    NOT NULL,
      user_name   TEXT    NOT NULL DEFAULT '',
      text        TEXT    NOT NULL DEFAULT '',
      kind        TEXT    NOT NULL DEFAULT 'text',
      ts          INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, ts DESC)`,

    `CREATE TABLE IF NOT EXISTS chat_meta (
      chat_id      TEXT PRIMARY KEY,
      title        TEXT NOT NULL DEFAULT '',
      type         TEXT NOT NULL DEFAULT '',
      username     TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0,
      first_seen   INTEGER NOT NULL DEFAULT 0,
      last_seen    INTEGER NOT NULL DEFAULT 0,
      removed      INTEGER NOT NULL DEFAULT 0
    )`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run();
  }

  // Миграции для существующих баз
  const migrations = [
    `ALTER TABLE chat_settings ADD COLUMN rules_text TEXT DEFAULT ''`,
  ];
  for (const m of migrations) {
    try { await db.prepare(m).run(); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD API
// ═══════════════════════════════════════════════════════════════════════════

async function handleDashboardApi(request, env, url) {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });

  try {
    const path   = url.pathname;
    const chatId = url.searchParams.get("chat_id") || "";

    // GET /api/ping — проверка пароля
    if (path === "/api/ping") return json({ ok: true });

    // GET /api/bot-info
    if (path === "/api/bot-info") {
      const me = await tg(env, "getMe", {});
      return json({ username: me.username, first_name: me.first_name });
    }

    // GET /api/stats
    if (path === "/api/stats" && chatId) {
      const warns = await env.DB.prepare(
        `SELECT SUM(count) as total FROM warns WHERE chat_id = ?`
      ).bind(chatId).first();

      const staff = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM staff WHERE chat_id = ? AND rank_level > 0`
      ).bind(chatId).first();

      const recent = await env.DB.prepare(
        `SELECT action, user_id as target, '' as mod, updated_at as ts FROM warns WHERE chat_id = ? ORDER BY updated_at DESC LIMIT 5`
      ).bind(chatId).all();

      const topV = await env.DB.prepare(
        `SELECT user_id, count FROM warns WHERE chat_id = ? ORDER BY count DESC LIMIT 5`
      ).bind(chatId).all();

      // Resolve names from cache
      const topViolators = await Promise.all((topV.results || []).map(async v => {
        const c = await env.DB.prepare(
          `SELECT display_name FROM user_cache WHERE chat_id = ? AND user_id = ? LIMIT 1`
        ).bind(chatId, v.user_id).first();
        return { name: c?.display_name || `user_${v.user_id}`, warns: v.count };
      }));

      return json({
        warns:  Number(warns?.total || 0),
        bans:   0,
        mutes:  0,
        staff:  Number(staff?.cnt || 0),
        recent: [],
        top_violators: topViolators,
      });
    }

    // GET /api/settings
    if (path === "/api/settings" && chatId) {
      const cfg = await getConfig(env.DB, chatId);
      return json(cfg);
    }

    // POST /api/setting — изменить настройку
    if (path === "/api/setting" && request.method === "POST") {
      const body = await request.json();
      const { chat_id, key, value } = body;

      const boolKeys = {
        antimat: "antimat_enabled", antilinks: "antilinks_enabled",
        antiflood: "antiflood_enabled", antinsfw: "antinsfw_enabled",
        captcha: "captcha_enabled", welcome: "welcome_enabled",
      };

      if (boolKeys[key]) {
        await setSetting(env.DB, chat_id, boolKeys[key], value ? 1 : 0);
      } else if (key === "maxwarns") {
        await setSetting(env.DB, chat_id, "max_warns", Math.max(1, Math.min(10, Number(value))));
      } else if (key === "floodlimit") {
        await setSetting(env.DB, chat_id, "flood_limit", Math.max(2, Math.min(30, Number(value))));
      } else if (key === "welcometext") {
        await setSetting(env.DB, chat_id, "welcome_text", String(value));
      } else if (key === "bad_words_raw") {
        await setSetting(env.DB, chat_id, "bad_words", String(value));
      }

      return json({ ok: true });
    }

    // GET /api/staff
    if (path === "/api/staff" && chatId) {
      const rows = await env.DB.prepare(
        `SELECT user_id, rank_level FROM staff WHERE chat_id = ? AND rank_level > 0 ORDER BY rank_level DESC`
      ).bind(chatId).all();

      const staff = await Promise.all((rows.results || []).map(async s => {
        const c = await env.DB.prepare(
          `SELECT display_name FROM user_cache WHERE chat_id = ? AND user_id = ? LIMIT 1`
        ).bind(chatId, s.user_id).first();
        return { user_id: s.user_id, rank: s.rank_level, name: c?.display_name || `user_${s.user_id}` };
      }));

      return json({ staff });
    }

    // GET /api/log
    if (path === "/api/log" && chatId) {
      // Возвращаем последние варны как лог
      const rows = await env.DB.prepare(
        `SELECT w.user_id, w.count, w.updated_at, uc.display_name
         FROM warns w LEFT JOIN user_cache uc ON uc.chat_id = w.chat_id AND uc.user_id = w.user_id
         WHERE w.chat_id = ? ORDER BY w.updated_at DESC LIMIT 30`
      ).bind(chatId).all();

      const entries = (rows.results || []).map(r => ({
        action: `Варны: ${r.count}`,
        user:   r.display_name || `user_${r.user_id}`,
        ts:     r.updated_at,
      }));

      return json({ entries });
    }

    // GET /api/top
    if (path === "/api/top" && chatId) {
      const repRows = await env.DB.prepare(
        `SELECT r.user_id, r.rep, uc.display_name
         FROM reputation r LEFT JOIN user_cache uc ON uc.chat_id = r.chat_id AND uc.user_id = r.user_id
         WHERE r.chat_id = ? ORDER BY r.rep DESC LIMIT 10`
      ).bind(chatId).all();

      const warnRows = await env.DB.prepare(
        `SELECT w.user_id, w.count, uc.display_name
         FROM warns w LEFT JOIN user_cache uc ON uc.chat_id = w.chat_id AND uc.user_id = w.user_id
         WHERE w.chat_id = ? ORDER BY w.count DESC LIMIT 10`
      ).bind(chatId).all();

      return json({
        top_rep:   (repRows.results  || []).map(r => ({ name: r.display_name || `user_${r.user_id}`, rep: r.rep })),
        top_warns: (warnRows.results || []).map(r => ({ name: r.display_name || `user_${r.user_id}`, count: r.count })),
      });
    }

    // GET /api/clans
    if (path === "/api/clans" && chatId) {
      const rows = await env.DB.prepare(
        `SELECT c.*, COUNT(cm.user_id) as members
         FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id
         WHERE c.chat_id = ? GROUP BY c.id ORDER BY c.total_rep DESC`
      ).bind(chatId).all();

      return json({ clans: rows.results || [] });
    }

    // GET /api/rules
    if (path === "/api/rules" && chatId) {
      const cfg = await getConfig(env.DB, chatId);
      return json({ rules: cfg.rules_text || "" });
    }

    // POST /api/rules
    if (path === "/api/rules" && request.method === "POST") {
      const body = await request.json();
      await setSetting(env.DB, body.chat_id, "rules_text", body.text || "");
      return json({ ok: true });
    }

    // ── ЧАТЫ ─────────────────────────────────────────────────────────────
    // GET /api/chats — список всех чатов, в которых есть бот
    if (path === "/api/chats") {
      const rows = await env.DB.prepare(
        `SELECT chat_id, title, type, username, member_count, last_seen, removed
         FROM chat_meta ORDER BY removed ASC, last_seen DESC`
      ).all();
      const chats = await Promise.all((rows.results || []).map(async c => {
        const cnt = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM chat_messages WHERE chat_id = ?`
        ).bind(c.chat_id).first();
        return { ...c, messages_logged: Number(cnt?.cnt || 0) };
      }));
      return json({ chats });
    }

    // GET /api/chat-info?chat_id=... — свежие данные о чате
    if (path === "/api/chat-info" && chatId) {
      try {
        const info = await tg(env, "getChat", { chat_id: chatId });
        let member_count = 0;
        try {
          const r = await tg(env, "getChatMemberCount", { chat_id: chatId });
          member_count = Number(r) || 0;
        } catch {}
        await env.DB.prepare(
          `UPDATE chat_meta SET title = ?, type = ?, username = ?, member_count = ?, last_seen = ?, removed = 0 WHERE chat_id = ?`
        ).bind(info.title || "", info.type || "", info.username || "", member_count, nowTs(), chatId).run();
        return json({
          ok: true,
          chat_id: chatId,
          title: info.title || "",
          type: info.type || "",
          username: info.username || "",
          description: info.description || "",
          bio: info.bio || "",
          invite_link: info.invite_link || "",
          member_count,
        });
      } catch (err) {
        return json({ ok: false, error: String(err) }, 200);
      }
    }

    // POST /api/refresh-chats — пробежаться по всем чатам и обновить мета
    if (path === "/api/refresh-chats" && request.method === "POST") {
      const rows = await env.DB.prepare(
        `SELECT chat_id FROM chat_meta WHERE removed = 0`
      ).all();
      let ok = 0, fail = 0;
      for (const r of (rows.results || [])) {
        try {
          const info = await tg(env, "getChat", { chat_id: r.chat_id });
          let mc = 0;
          try { mc = Number(await tg(env, "getChatMemberCount", { chat_id: r.chat_id })) || 0; } catch {}
          await env.DB.prepare(
            `UPDATE chat_meta SET title = ?, type = ?, username = ?, member_count = ?, last_seen = ? WHERE chat_id = ?`
          ).bind(info.title || "", info.type || "", info.username || "", mc, nowTs(), r.chat_id).run();
          ok++;
        } catch {
          await env.DB.prepare(
            `UPDATE chat_meta SET removed = 1 WHERE chat_id = ?`
          ).bind(r.chat_id).run();
          fail++;
        }
      }
      return json({ ok: true, refreshed: ok, removed: fail });
    }

    // ── СООБЩЕНИЯ ────────────────────────────────────────────────────────
    // GET /api/messages?chat_id=&limit=&before_id=
    if (path === "/api/messages" && chatId) {
      const limit  = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
      const before = Number(url.searchParams.get("before_id")) || 0;
      const rows = before
        ? await env.DB.prepare(
            `SELECT id, message_id, user_id, user_name, text, kind, ts FROM chat_messages
             WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
          ).bind(chatId, before, limit).all()
        : await env.DB.prepare(
            `SELECT id, message_id, user_id, user_name, text, kind, ts FROM chat_messages
             WHERE chat_id = ? ORDER BY id DESC LIMIT ?`
          ).bind(chatId, limit).all();
      return json({ messages: rows.results || [] });
    }

    // POST /api/send-message { chat_id, text, reply_to? }
    if (path === "/api/send-message" && request.method === "POST") {
      const body = await request.json();
      if (!body.chat_id || !body.text) return json({ error: "chat_id and text required" }, 400);
      try {
        const r = await tg(env, "sendMessage", {
          chat_id: body.chat_id,
          text: String(body.text),
          parse_mode: body.parse_mode || undefined,
          reply_to_message_id: body.reply_to || undefined,
          disable_web_page_preview: body.disable_preview ? true : false,
        });
        return json({ ok: true, message_id: r.message_id });
      } catch (err) {
        return json({ ok: false, error: String(err) }, 200);
      }
    }

    // POST /api/delete-message { chat_id, message_id }
    if (path === "/api/delete-message" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "deleteMessage", { chat_id: body.chat_id, message_id: body.message_id });
        await env.DB.prepare(
          `DELETE FROM chat_messages WHERE chat_id = ? AND message_id = ?`
        ).bind(String(body.chat_id), Number(body.message_id)).run();
        return json({ ok: true });
      } catch (err) {
        return json({ ok: false, error: String(err) }, 200);
      }
    }

    // ── УЧАСТНИКИ ────────────────────────────────────────────────────────
    // GET /api/members?chat_id=&q=&limit=
    if (path === "/api/members" && chatId) {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
      const rows = q
        ? await env.DB.prepare(
            `SELECT uc.user_id, uc.username, uc.display_name, uc.updated_at,
                    COALESCE(s.rank_level, 0) as rank_level,
                    COALESCE(w.count, 0)      as warns,
                    COALESCE(r.rep, 0)        as rep
             FROM user_cache uc
             LEFT JOIN staff      s ON s.chat_id = uc.chat_id AND s.user_id = uc.user_id
             LEFT JOIN warns      w ON w.chat_id = uc.chat_id AND w.user_id = uc.user_id
             LEFT JOIN reputation r ON r.chat_id = uc.chat_id AND r.user_id = uc.user_id
             WHERE uc.chat_id = ? AND (LOWER(uc.username) LIKE ? OR LOWER(uc.display_name) LIKE ?)
             ORDER BY rank_level DESC, uc.updated_at DESC LIMIT ?`
          ).bind(chatId, `%${q}%`, `%${q}%`, limit).all()
        : await env.DB.prepare(
            `SELECT uc.user_id, uc.username, uc.display_name, uc.updated_at,
                    COALESCE(s.rank_level, 0) as rank_level,
                    COALESCE(w.count, 0)      as warns,
                    COALESCE(r.rep, 0)        as rep
             FROM user_cache uc
             LEFT JOIN staff      s ON s.chat_id = uc.chat_id AND s.user_id = uc.user_id
             LEFT JOIN warns      w ON w.chat_id = uc.chat_id AND w.user_id = uc.user_id
             LEFT JOIN reputation r ON r.chat_id = uc.chat_id AND r.user_id = uc.user_id
             WHERE uc.chat_id = ?
             ORDER BY rank_level DESC, uc.updated_at DESC LIMIT ?`
          ).bind(chatId, limit).all();
      return json({ members: rows.results || [] });
    }

    // ── МОДЕРАЦИЯ ────────────────────────────────────────────────────────
    // POST /api/kick { chat_id, user_id }
    if (path === "/api/kick" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "banChatMember", { chat_id: body.chat_id, user_id: Number(body.user_id) });
        await tg(env, "unbanChatMember", { chat_id: body.chat_id, user_id: Number(body.user_id) });
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/ban { chat_id, user_id, until? }
    if (path === "/api/ban" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "banChatMember", {
          chat_id: body.chat_id, user_id: Number(body.user_id),
          until_date: body.until ? Number(body.until) : undefined,
        });
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/unban { chat_id, user_id }
    if (path === "/api/unban" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "unbanChatMember", {
          chat_id: body.chat_id, user_id: Number(body.user_id), only_if_banned: true,
        });
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/mute { chat_id, user_id, duration_sec }
    if (path === "/api/mute" && request.method === "POST") {
      const body = await request.json();
      try {
        const until = nowTs() + Math.max(60, Number(body.duration_sec) || 3600);
        await tg(env, "restrictChatMember", {
          chat_id: body.chat_id, user_id: Number(body.user_id),
          until_date: until,
          permissions: {
            can_send_messages: false, can_send_media_messages: false, can_send_polls: false,
            can_send_other_messages: false, can_add_web_page_previews: false,
            can_change_info: false, can_invite_users: false, can_pin_messages: false,
          },
        });
        return json({ ok: true, until });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/unmute { chat_id, user_id }
    if (path === "/api/unmute" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "restrictChatMember", {
          chat_id: body.chat_id, user_id: Number(body.user_id),
          permissions: {
            can_send_messages: true, can_send_media_messages: true, can_send_polls: true,
            can_send_other_messages: true, can_add_web_page_previews: true,
            can_change_info: false, can_invite_users: true, can_pin_messages: false,
          },
        });
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/setrank { chat_id, user_id, level }
    if (path === "/api/setrank" && request.method === "POST") {
      const body = await request.json();
      const lvl  = Math.max(0, Math.min(7, Number(body.level)));
      try {
        if (lvl === 0) {
          await env.DB.prepare(
            `DELETE FROM staff WHERE chat_id = ? AND user_id = ?`
          ).bind(String(body.chat_id), String(body.user_id)).run();
        } else {
          await setStaffRank(env.DB, String(body.chat_id), String(body.user_id), lvl, "dashboard");
        }
        try { await applyTelegramRank(env, String(body.chat_id), String(body.user_id), lvl); } catch {}
        return json({ ok: true, level: lvl });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // ── РЕДАКТИРОВАНИЕ ЧАТА ──────────────────────────────────────────────
    // POST /api/edit-chat { chat_id, title?, description? }
    if (path === "/api/edit-chat" && request.method === "POST") {
      const body = await request.json();
      const errors = [];
      if (typeof body.title === "string") {
        try { await tg(env, "setChatTitle", { chat_id: body.chat_id, title: body.title }); }
        catch (err) { errors.push("title: " + String(err)); }
      }
      if (typeof body.description === "string") {
        try { await tg(env, "setChatDescription", { chat_id: body.chat_id, description: body.description }); }
        catch (err) { errors.push("description: " + String(err)); }
      }
      if (typeof body.title === "string") {
        await env.DB.prepare(
          `UPDATE chat_meta SET title = ?, last_seen = ? WHERE chat_id = ?`
        ).bind(body.title, nowTs(), String(body.chat_id)).run();
      }
      return json({ ok: errors.length === 0, errors });
    }

    // POST /api/pin { chat_id, message_id }
    if (path === "/api/pin" && request.method === "POST") {
      const body = await request.json();
      try {
        await tg(env, "pinChatMessage", {
          chat_id: body.chat_id, message_id: Number(body.message_id),
          disable_notification: body.silent ? true : false,
        });
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // POST /api/unpin { chat_id, message_id? }
    if (path === "/api/unpin" && request.method === "POST") {
      const body = await request.json();
      try {
        if (body.message_id) {
          await tg(env, "unpinChatMessage", { chat_id: body.chat_id, message_id: Number(body.message_id) });
        } else {
          await tg(env, "unpinAllChatMessages", { chat_id: body.chat_id });
        }
        return json({ ok: true });
      } catch (err) { return json({ ok: false, error: String(err) }, 200); }
    }

    // ── УДАЛЕНИЕ (бот выходит + чистим D1) ───────────────────────────────
    // POST /api/delete-chat { chat_id, wipe? }
    if (path === "/api/delete-chat" && request.method === "POST") {
      const body = await request.json();
      const cid  = String(body.chat_id || "");
      if (!cid) return json({ error: "chat_id required" }, 400);

      let leftOk = false, leftErr = null;
      try {
        await tg(env, "leaveChat", { chat_id: cid });
        leftOk = true;
      } catch (err) {
        leftErr = String(err);
      }

      const wipe = body.wipe !== false; // по умолчанию чистим
      let wiped = 0;
      if (wipe) {
        const tables = [
          "staff", "chat_settings", "reputation", "marriages", "fun_cooldowns",
          "warns", "trusted_users", "captcha_pending", "user_cache", "flood_log",
          "clans", "clan_members", "clan_invites", "clan_wars", "chat_messages",
        ];
        for (const t of tables) {
          try {
            const r = await env.DB.prepare(`DELETE FROM ${t} WHERE chat_id = ?`).bind(cid).run();
            wiped += r?.meta?.changes || 0;
          } catch {}
        }
      }

      await env.DB.prepare(
        `UPDATE chat_meta SET removed = 1, last_seen = ? WHERE chat_id = ?`
      ).bind(nowTs(), cid).run();

      return json({ ok: leftOk, left: leftOk, leave_error: leftErr, wiped, wipe });
    }

    return json({ error: "not found" }, 404);

  } catch (err) {
    console.error("API error:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BOT — Панель управления</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Russo+One&family=Mulish:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:        #0a0c10;
    --surface:   #111520;
    --surface2:  #161c2a;
    --border:    #1e2535;
    --border-h:  #2a3349;
    --accent:    #e8ff00;
    --accent2:   #00d4ff;
    --danger:    #ff3b5c;
    --success:   #00e676;
    --warn:      #ffb300;
    --text:      #e2e8f0;
    --muted:     #4a5568;
    --muted2:    #6b7689;
    --card-bg:   #13192a;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Mulish',sans-serif;min-height:100vh;overflow-x:hidden}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,255,0,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(232,255,0,.015) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}

  /* ── LOGIN ───────────────────────────────────────────────────────── */
  #login-screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;background:var(--bg)}
  .login-box{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:48px;width:380px;max-width:calc(100vw - 32px);text-align:center;position:relative;overflow:hidden}
  .login-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
  .login-logo{font-family:'Russo One',sans-serif;font-size:28px;color:var(--accent);letter-spacing:3px;margin-bottom:8px}
  .login-sub{color:var(--muted);font-size:13px;margin-bottom:32px}
  .login-box input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px;color:var(--text);font-family:'Mulish',sans-serif;font-size:15px;margin-bottom:16px;outline:none;transition:border-color .2s}
  .login-box input:focus{border-color:var(--accent)}
  .btn-login{width:100%;background:var(--accent);color:#000;border:none;border-radius:10px;padding:14px;font-family:'Russo One',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;transition:opacity .2s,transform .1s}
  .btn-login:hover{opacity:.9;transform:translateY(-1px)}
  .login-error{color:var(--danger);font-size:13px;margin-top:12px;display:none}

  /* ── LAYOUT ──────────────────────────────────────────────────────── */
  #app{display:none;position:relative;z-index:1}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(17,21,32,.85);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;gap:12px;flex-wrap:wrap}
  .logo{font-family:'Russo One',sans-serif;font-size:20px;color:var(--accent);letter-spacing:3px}
  .logo span{color:var(--text);opacity:.4}
  .topbar-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .status-dot{width:8px;height:8px;background:var(--success);border-radius:50%;box-shadow:0 0 8px var(--success);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .status-text{font-size:13px;color:var(--muted)}
  .btn-back{background:transparent;border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;transition:all .2s;display:inline-flex;align-items:center;gap:6px}
  .btn-back:hover{border-color:var(--accent);color:var(--accent)}
  .btn-logout{background:transparent;border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;transition:all .2s}
  .btn-logout:hover{border-color:var(--danger);color:var(--danger)}
  .crumbs{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
  .crumbs b{color:var(--text)}

  /* ── CHATS GRID ──────────────────────────────────────────────────── */
  #chat-picker{padding:48px 32px;max-width:1200px;margin:0 auto}
  .picker-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:32px;gap:16px;flex-wrap:wrap}
  .picker-title{font-family:'Russo One',sans-serif;font-size:32px;letter-spacing:1px}
  .picker-sub{color:var(--muted);font-size:14px;margin-top:6px}
  .picker-actions{display:flex;gap:10px}
  .btn{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:10px 18px;border-radius:10px;cursor:pointer;font-family:'Mulish',sans-serif;font-size:13px;font-weight:600;transition:all .2s;display:inline-flex;align-items:center;gap:8px}
  .btn:hover{border-color:var(--accent);color:var(--accent)}
  .btn-accent{background:var(--accent);color:#000;border-color:var(--accent)}
  .btn-accent:hover{opacity:.9;color:#000}
  .btn-danger{background:transparent;border-color:var(--danger);color:var(--danger)}
  .btn-danger:hover{background:var(--danger);color:#fff}
  .btn-ghost{background:transparent}
  .btn-sm{padding:6px 12px;font-size:12px;border-radius:8px}
  .chats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .chat-card{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:22px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;animation:fadeUp .3s ease both}
  .chat-card:hover{border-color:var(--accent);transform:translateY(-2px)}
  .chat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .3s}
  .chat-card:hover::after{transform:scaleX(1)}
  .chat-card.removed{opacity:.55;border-style:dashed}
  .chat-card.removed::after{background:var(--muted)}
  .chat-avatar{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-family:'Russo One',sans-serif;font-size:20px;color:#000;margin-bottom:14px}
  .chat-card.removed .chat-avatar{background:linear-gradient(135deg,#2a3349,#1e2535);color:var(--muted)}
  .chat-name{font-family:'Russo One',sans-serif;font-size:16px;letter-spacing:.5px;margin-bottom:4px;word-break:break-word}
  .chat-meta{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .chat-meta span{display:inline-flex;align-items:center;gap:4px}
  .chat-tags{display:flex;gap:6px;flex-wrap:wrap}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
  .badge-accent{background:rgba(232,255,0,.15);color:var(--accent)}
  .badge-blue{background:rgba(0,212,255,.15);color:var(--accent2)}
  .badge-red{background:rgba(255,59,92,.15);color:var(--danger)}
  .badge-gray{background:rgba(74,85,104,.25);color:var(--muted2)}
  .badge-warn{background:rgba(255,179,0,.15);color:var(--warn)}
  .badge-green{background:rgba(0,230,118,.15);color:var(--success)}
  .empty-state{text-align:center;padding:48px 16px;color:var(--muted);border:1px dashed var(--border);border-radius:14px}
  .empty-state h3{font-family:'Russo One',sans-serif;font-size:18px;color:var(--text);margin-bottom:8px;letter-spacing:1px}

  /* ── PANEL (per-chat) ────────────────────────────────────────────── */
  #chat-panel{display:none}
  .nav-tabs{display:flex;gap:4px;padding:14px 32px 0;border-bottom:1px solid var(--border);overflow-x:auto;background:var(--surface);position:sticky;top:65px;z-index:40;backdrop-filter:blur(8px)}
  .tab{padding:10px 16px;border-radius:10px 10px 0 0;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);border:1px solid transparent;border-bottom:none;transition:all .15s;position:relative;bottom:-1px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
  .tab:hover{color:var(--text)}
  .tab.active{background:var(--card-bg);border-color:var(--border);color:var(--accent);border-bottom-color:var(--card-bg)}
  .content{padding:28px 32px;max-width:1200px;margin:0 auto}
  .section{display:none}
  .section.active{display:block;animation:fadeUp .3s ease both}

  /* ── STATS ───────────────────────────────────────────────────────── */
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px}
  .stat-card{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:20px;position:relative;overflow:hidden;animation:fadeUp .4s ease both}
  .stat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px}
  .stat-card.yellow::after{background:var(--accent)}
  .stat-card.red::after{background:var(--danger)}
  .stat-card.blue::after{background:var(--accent2)}
  .stat-card.green::after{background:var(--success)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  .stat-label{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
  .stat-value{font-family:'Russo One',sans-serif;font-size:32px;line-height:1}
  .stat-card.yellow .stat-value{color:var(--accent)}
  .stat-card.red .stat-value{color:var(--danger)}
  .stat-card.blue .stat-value{color:var(--accent2)}
  .stat-card.green .stat-value{color:var(--success)}

  /* ── PANEL CARDS ─────────────────────────────────────────────────── */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media(max-width:900px){.two-col{grid-template-columns:1fr}}
  .panel{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden}
  .panel-header{padding:16px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .panel-title{font-family:'Russo One',sans-serif;font-size:13px;letter-spacing:2px;color:var(--accent);text-transform:uppercase}
  .panel-body{padding:16px 22px}

  /* lists */
  .list-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)}
  .list-row:last-child{border-bottom:none}
  .list-row .grow{flex:1;min-width:0}
  .list-name{font-weight:600;color:var(--text);word-break:break-word}
  .list-sub{font-size:12px;color:var(--muted)}
  .row-actions{display:flex;gap:6px;flex-wrap:wrap}

  /* settings */
  .setting-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);gap:12px}
  .setting-row:last-child{border-bottom:none}
  .setting-row .grow{flex:1;min-width:0}
  .setting-label{font-weight:600}
  .setting-desc{font-size:12px;color:var(--muted);margin-top:2px}
  .switch{position:relative;width:46px;height:24px;background:var(--border);border-radius:999px;cursor:pointer;transition:background .2s;flex-shrink:0}
  .switch::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
  .switch.on{background:var(--accent)}
  .switch.on::after{transform:translateX(22px)}

  /* inputs */
  .input,.textarea,.select{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-family:'Mulish',sans-serif;font-size:14px;outline:none;transition:border-color .2s}
  .input:focus,.textarea:focus,.select:focus{border-color:var(--accent)}
  .textarea{resize:vertical;min-height:80px;font-family:inherit}
  .input-row{display:flex;gap:8px;align-items:stretch}
  .input-row .input{flex:1}
  .num-row{display:inline-flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:6px 8px}
  .num-btn{width:28px;height:28px;border-radius:8px;border:none;background:var(--surface2);color:var(--text);font-size:14px;cursor:pointer}
  .num-btn:hover{background:var(--accent);color:#000}
  .num-val{min-width:32px;text-align:center;font-weight:700}

  /* feed */
  .feed{display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto;padding-right:6px}
  .msg{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;animation:fadeUp .25s ease both}
  .msg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}
  .msg-author{color:var(--accent);font-weight:700}
  .msg-time{color:var(--muted)}
  .msg-text{font-size:14px;color:var(--text);white-space:pre-wrap;word-break:break-word}
  .msg-kind{font-size:11px;color:var(--muted2);font-style:italic}
  .msg-actions{display:flex;gap:6px;align-items:center}
  .msg-tools{margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}

  /* danger zone */
  .danger-card{background:linear-gradient(135deg,rgba(255,59,92,.08),transparent);border:1px solid rgba(255,59,92,.4);border-radius:14px;padding:24px}
  .danger-title{font-family:'Russo One',sans-serif;font-size:14px;letter-spacing:2px;color:var(--danger);margin-bottom:8px;text-transform:uppercase}
  .danger-desc{font-size:13px;color:var(--text);margin-bottom:16px}
  .check-row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-bottom:14px;cursor:pointer;user-select:none}
  .check-row input{accent-color:var(--danger);width:16px;height:16px}

  /* toast */
  #toast{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:10px;padding:12px 18px;font-size:14px;font-weight:600;display:none;z-index:1000;max-width:340px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideIn .25s ease}
  #toast.error{border-left-color:var(--danger);color:var(--danger)}
  #toast.success{border-left-color:var(--success);color:var(--success)}
  @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}

  /* utility */
  .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .grow{flex:1}
  .mt-12{margin-top:12px}.mt-16{margin-top:16px}.mt-20{margin-top:20px}
  .mb-12{margin-bottom:12px}.mb-16{margin-bottom:16px}
  .muted{color:var(--muted)}
  .small{font-size:12px}
  .right{margin-left:auto}
  .nowrap{white-space:nowrap}
  .skeleton{background:linear-gradient(90deg,var(--surface2),var(--card-bg),var(--surface2));background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px;height:14px}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-track{background:var(--bg)}
  ::-webkit-scrollbar-thumb{background:var(--border-h);border-radius:4px}
  ::-webkit-scrollbar-thumb:hover{background:var(--muted)}
</style>
</head>
<body>

<!-- ── LOGIN SCREEN ──────────────────────────────────────────────── -->
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">BOT PANEL</div>
    <div class="login-sub">Панель управления модерационным ботом</div>
    <input id="pwd-input" type="password" placeholder="Пароль панели" autocomplete="current-password">
    <button class="btn-login" onclick="doLogin()">ВОЙТИ</button>
    <div id="login-err" class="login-error">Неверный пароль</div>
  </div>
</div>

<!-- ── APP ───────────────────────────────────────────────────────── -->
<div id="app">
  <div class="topbar">
    <div class="logo">BOT<span> // PANEL</span></div>
    <div class="topbar-right">
      <div class="row" id="crumbs"></div>
      <div class="status-dot"></div>
      <div class="status-text" id="bot-name">@bot</div>
      <button class="btn-logout" onclick="logout()">Выйти</button>
    </div>
  </div>

  <!-- ── CHAT PICKER ─────────────────────────────────────────────── -->
  <div id="chat-picker">
    <div class="picker-header">
      <div>
        <div class="picker-title">Выбери чат</div>
        <div class="picker-sub">Чаты, в которых установлен и работает бот</div>
      </div>
      <div class="picker-actions">
        <button class="btn" onclick="loadChats()">↻ Обновить список</button>
        <button class="btn btn-accent" onclick="refreshAllChats()">⤴ Подтянуть из Telegram</button>
      </div>
    </div>
    <div id="chats-grid" class="chats-grid"></div>
  </div>

  <!-- ── PER-CHAT PANEL ─────────────────────────────────────────── -->
  <div id="chat-panel">
    <div class="nav-tabs" id="nav-tabs">
      <div class="tab active" data-tab="dashboard">📊 Дашборд</div>
      <div class="tab" data-tab="feed">💬 Лента</div>
      <div class="tab" data-tab="send">✉️ Отправить</div>
      <div class="tab" data-tab="members">👥 Участники</div>
      <div class="tab" data-tab="staff">👮 Стафф</div>
      <div class="tab" data-tab="modlog">📋 Лог</div>
      <div class="tab" data-tab="top">🏆 Топы</div>
      <div class="tab" data-tab="clans">⚔️ Кланы</div>
      <div class="tab" data-tab="rules">📜 Правила</div>
      <div class="tab" data-tab="settings">⚙️ Настройки</div>
      <div class="tab" data-tab="manage">🔧 Управление</div>
    </div>

    <div class="content">

      <!-- DASHBOARD -->
      <div id="sec-dashboard" class="section active">
        <div class="stats-grid">
          <div class="stat-card yellow"><div class="stat-label">Сообщений (лог)</div><div class="stat-value" id="st-messages">—</div></div>
          <div class="stat-card red"><div class="stat-label">Варны (всего)</div><div class="stat-value" id="st-warns">—</div></div>
          <div class="stat-card blue"><div class="stat-label">Участники</div><div class="stat-value" id="st-members">—</div></div>
          <div class="stat-card green"><div class="stat-label">Стафф</div><div class="stat-value" id="st-staff">—</div></div>
        </div>
        <div class="two-col">
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Последние сообщения</div><button class="btn btn-sm" onclick="showTab('feed')">Открыть ленту →</button></div>
            <div class="panel-body" id="recent-feed"><div class="empty-state small">Загрузка…</div></div>
          </div>
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Топ нарушителей</div></div>
            <div class="panel-body" id="top-violators"></div>
          </div>
        </div>
        <div class="panel mt-20">
          <div class="panel-header"><div class="panel-title">Информация о чате</div><button class="btn btn-sm" onclick="loadChatInfo()">↻ Обновить</button></div>
          <div class="panel-body" id="chat-info-block"><div class="empty-state small">…</div></div>
        </div>
      </div>

      <!-- FEED -->
      <div id="sec-feed" class="section">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">Лента сообщений</div>
            <div class="row">
              <span class="small muted" id="feed-meta"></span>
              <label class="check-row" style="margin:0"><input type="checkbox" id="feed-auto" checked> авто</label>
              <button class="btn btn-sm" onclick="loadFeed()">↻ Обновить</button>
            </div>
          </div>
          <div class="panel-body">
            <div id="feed" class="feed"><div class="empty-state small">Загрузка…</div></div>
          </div>
        </div>
      </div>

      <!-- SEND -->
      <div id="sec-send" class="section">
        <div class="panel">
          <div class="panel-header"><div class="panel-title">Отправить сообщение</div></div>
          <div class="panel-body">
            <textarea id="send-text" class="textarea" placeholder="Текст сообщения... поддерживается Markdown" rows="6"></textarea>
            <div class="row mt-12">
              <select id="send-mode" class="select" style="max-width:200px">
                <option value="">Без форматирования</option>
                <option value="HTML">HTML</option>
                <option value="MarkdownV2">MarkdownV2</option>
                <option value="Markdown">Markdown</option>
              </select>
              <label class="check-row" style="margin:0"><input type="checkbox" id="send-nopreview"> без превью ссылок</label>
              <span class="grow"></span>
              <button class="btn btn-accent" onclick="sendMessage()">Отправить →</button>
            </div>
          </div>
        </div>
      </div>

      <!-- MEMBERS -->
      <div id="sec-members" class="section">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">Участники (кэш бота)</div>
            <div class="row">
              <input id="members-q" class="input" placeholder="Поиск по имени или @username" style="max-width:280px" oninput="onMembersSearch()">
              <button class="btn btn-sm" onclick="loadMembers()">↻</button>
            </div>
          </div>
          <div class="panel-body" id="members-list"><div class="empty-state small">Загрузка…</div></div>
        </div>
      </div>

      <!-- STAFF -->
      <div id="sec-staff" class="section">
        <div class="panel">
          <div class="panel-header"><div class="panel-title">Состав модерации</div></div>
          <div class="panel-body" id="staff-list"></div>
        </div>
      </div>

      <!-- MOD LOG -->
      <div id="sec-modlog" class="section">
        <div class="panel">
          <div class="panel-header"><div class="panel-title">Журнал модерации</div></div>
          <div class="panel-body" id="modlog-list"></div>
        </div>
      </div>

      <!-- TOP -->
      <div id="sec-top" class="section">
        <div class="two-col">
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Топ по репутации</div></div>
            <div class="panel-body" id="top-rep"></div>
          </div>
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Топ по варнам</div></div>
            <div class="panel-body" id="top-warns"></div>
          </div>
        </div>
      </div>

      <!-- CLANS -->
      <div id="sec-clans" class="section">
        <div class="panel">
          <div class="panel-header"><div class="panel-title">Кланы чата</div></div>
          <div class="panel-body" id="clans-list"></div>
        </div>
      </div>

      <!-- RULES -->
      <div id="sec-rules" class="section">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">Правила чата</div>
            <button class="btn btn-accent btn-sm" onclick="saveRules()">Сохранить</button>
          </div>
          <div class="panel-body">
            <textarea id="rules-text" class="textarea" rows="14" placeholder="Текст правил..."></textarea>
          </div>
        </div>
      </div>

      <!-- SETTINGS -->
      <div id="sec-settings" class="section">
        <div class="two-col">
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Авто-модерация</div></div>
            <div class="panel-body" id="settings-toggles"></div>
          </div>
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Числовые лимиты</div></div>
            <div class="panel-body" id="settings-numbers"></div>
          </div>
        </div>
        <div class="panel mt-20">
          <div class="panel-header">
            <div class="panel-title">Текст приветствия</div>
            <button class="btn btn-accent btn-sm" onclick="saveWelcome()">Сохранить</button>
          </div>
          <div class="panel-body">
            <textarea id="welcome-text" class="textarea" rows="3" placeholder="Добро пожаловать, {name}!"></textarea>
            <div class="small muted mt-12">Доступные плейсхолдеры: {name}, {chat}</div>
          </div>
        </div>
        <div class="panel mt-20">
          <div class="panel-header">
            <div class="panel-title">Запрещённые слова</div>
            <button class="btn btn-accent btn-sm" onclick="saveBadWords()">Сохранить</button>
          </div>
          <div class="panel-body">
            <textarea id="bad-words" class="textarea" rows="4" placeholder="через запятую или каждое с новой строки"></textarea>
          </div>
        </div>
      </div>

      <!-- MANAGE (edit / delete) -->
      <div id="sec-manage" class="section">
        <div class="panel">
          <div class="panel-header"><div class="panel-title">Редактировать чат</div></div>
          <div class="panel-body">
            <div class="setting-row">
              <div class="grow">
                <div class="setting-label">Название</div>
                <div class="setting-desc">Новое название чата (бот должен быть админом с правом «Изменять данные»)</div>
              </div>
              <input id="edit-title" class="input" style="max-width:340px" placeholder="Новое название">
            </div>
            <div class="setting-row" style="display:block">
              <div class="setting-label mb-12">Описание</div>
              <textarea id="edit-desc" class="textarea" rows="4" placeholder="Описание чата..."></textarea>
            </div>
            <div class="row mt-12" style="justify-content:flex-end">
              <button class="btn btn-accent" onclick="saveChatEdit()">Сохранить изменения</button>
            </div>
          </div>
        </div>

        <div class="panel mt-20">
          <div class="panel-header"><div class="panel-title">Закрепить сообщение</div></div>
          <div class="panel-body">
            <div class="row">
              <input id="pin-id" class="input" placeholder="ID сообщения" style="max-width:200px">
              <label class="check-row" style="margin:0"><input type="checkbox" id="pin-silent"> без уведомления</label>
              <button class="btn" onclick="pinMessage()">Закрепить</button>
              <button class="btn btn-ghost" onclick="unpinAll()">Открепить всё</button>
            </div>
          </div>
        </div>

        <div class="danger-card mt-20">
          <div class="danger-title">⚠ Опасная зона — удалить чат</div>
          <div class="danger-desc">
            Бот <b>не может удалить сам чат</b> в Telegram (это ограничение Bot API).
            Эта кнопка делает следующее:
            <ul style="margin:8px 0 0 22px">
              <li>Бот <b>выходит из чата</b> (<code>leaveChat</code>)</li>
              <li>Удаляет <b>все данные чата</b> из базы D1: настройки, варны, лог, кэш, кланы, сообщения и т.д.</li>
            </ul>
          </div>
          <label class="check-row"><input type="checkbox" id="confirm-delete"> Я понимаю и хочу удалить все данные чата.</label>
          <div class="row" style="justify-content:flex-end">
            <button class="btn btn-danger" onclick="deleteChat()">Бот покидает чат и удаляет данные</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<div id="toast"></div>

<script>
const API = '';
let PASSWORD = '';
let CHAT_ID  = '';
let CURRENT_CHAT = null;
let FEED_TIMER = null;

const RANK_ICONS = ['👤','🟢','🔵','🟣','🟡','🟠','🔴','⭐'];
const RANK_NAMES = ['Участник','Мл. модератор','Модератор','Ст. модератор','Мл. админ','Админ','Ст. админ','Овнер'];

// ── AUTH ─────────────────────────────────────────────────────────
function doLogin() {
  const pwd = document.getElementById('pwd-input').value;
  if (!pwd) return;
  PASSWORD = pwd;
  apiFetch('/api/ping').then(r => {
    if (r.ok) {
      try { sessionStorage.setItem('botpwd', pwd); } catch {}
      enterApp();
    } else {
      document.getElementById('login-err').style.display = 'block';
    }
  }).catch(() => {
    document.getElementById('login-err').style.display = 'block';
  });
}
function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadBotName();
  showChatPicker();
}
function logout() {
  PASSWORD = ''; CHAT_ID = ''; CURRENT_CHAT = null;
  try { sessionStorage.removeItem('botpwd'); } catch {}
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
try {
  const saved = sessionStorage.getItem('botpwd');
  if (saved) {
    PASSWORD = saved;
    apiFetch('/api/ping').then(r => { if (r.ok) enterApp(); }).catch(() => {});
  }
} catch {}

// ── API ──────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  const sep = path.includes('?') ? '&' : '?';
  const url = API + path + sep + 'pwd=' + encodeURIComponent(PASSWORD);
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}
async function apiGet(path) { const r = await apiFetch(path); if (!r.ok) throw new Error('API ' + r.status); return r.json(); }
async function apiPost(path, body) { const r = await apiFetch(path, 'POST', body); if (!r.ok) throw new Error('API ' + r.status); return r.json(); }

// ── UTIL ─────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmtTime(ts) { if (!ts) return ''; const d = new Date(Number(ts)*1000); return d.toLocaleString('ru-RU', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' }); }
function fmtDate(ts) { if (!ts) return '—'; const d = new Date(Number(ts)*1000); return d.toLocaleDateString('ru-RU'); }
function showToast(text, type = '') {
  const t = document.getElementById('toast');
  t.className = type;
  t.textContent = text;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.display = 'none'; }, 3000);
}
function rankBadge(level) {
  const lvl = Number(level) || 0;
  if (!lvl) return '';
  return '<span class="badge badge-accent">' + (RANK_ICONS[lvl] || '') + ' ' + esc(RANK_NAMES[lvl] || '') + '</span>';
}
function chatTypeBadge(type) {
  const map = { private:'private', group:'группа', supergroup:'супергруппа', channel:'канал' };
  const cls = type === 'channel' ? 'badge-blue' : type === 'private' ? 'badge-gray' : 'badge-accent';
  return '<span class="badge ' + cls + '">' + esc(map[type] || type || '?') + '</span>';
}
function initials(s) { const parts = String(s || '').trim().split(/\\s+/).filter(Boolean); return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase(); }
function num(n) { n = Number(n) || 0; return n.toLocaleString('ru-RU'); }

// ── BOT NAME ─────────────────────────────────────────────────────
async function loadBotName() {
  try { const d = await apiGet('/api/bot-info'); document.getElementById('bot-name').textContent = '@' + (d.username || 'bot'); } catch {}
}

// ── BREADCRUMBS ──────────────────────────────────────────────────
function renderCrumbs() {
  const el = document.getElementById('crumbs');
  if (!CURRENT_CHAT) { el.innerHTML = ''; return; }
  el.innerHTML = '<button class="btn-back" onclick="showChatPicker()">← К списку чатов</button>'
    + '<span class="crumbs"><span>Чат:</span> <b>' + esc(CURRENT_CHAT.title || CURRENT_CHAT.chat_id) + '</b></span>';
}

// ── CHAT PICKER ──────────────────────────────────────────────────
function showChatPicker() {
  CHAT_ID = ''; CURRENT_CHAT = null;
  if (FEED_TIMER) { clearInterval(FEED_TIMER); FEED_TIMER = null; }
  document.getElementById('chat-picker').style.display = 'block';
  document.getElementById('chat-panel').style.display = 'none';
  renderCrumbs();
  loadChats();
}

async function loadChats() {
  const grid = document.getElementById('chats-grid');
  grid.innerHTML = '<div class="empty-state small">Загрузка чатов…</div>';
  try {
    const d = await apiGet('/api/chats');
    const chats = d.chats || [];
    if (!chats.length) {
      grid.innerHTML = '<div class="empty-state"><h3>Чатов пока нет</h3>Добавь бота в группу или канал, и он появится здесь автоматически после первого сообщения.<div class="mt-12"><button class="btn btn-accent" onclick="refreshAllChats()">⤴ Подтянуть из Telegram</button></div></div>';
      return;
    }
    grid.innerHTML = chats.map(c => {
      const removed = !!c.removed;
      const title = c.title || ('chat ' + c.chat_id);
      const tags = [
        chatTypeBadge(c.type),
        c.username ? '<span class="badge badge-blue">@' + esc(c.username) + '</span>' : '',
        removed ? '<span class="badge badge-red">бот вышел</span>' : '',
      ].filter(Boolean).join(' ');
      return '<div class="chat-card ' + (removed ? 'removed' : '') + '" onclick="enterChat(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">'
        + '<div class="chat-avatar">' + esc(initials(title)) + '</div>'
        + '<div class="chat-name">' + esc(title) + '</div>'
        + '<div class="chat-meta">'
        +   '<span>👥 ' + num(c.member_count) + '</span>'
        +   '<span>💬 ' + num(c.messages_logged) + '</span>'
        +   '<span>🕒 ' + esc(fmtDate(c.last_seen)) + '</span>'
        + '</div>'
        + '<div class="chat-tags">' + tags + '</div>'
        + '<div class="small muted mt-12">id: ' + esc(c.chat_id) + '</div>'
        + '</div>';
    }).join('');
  } catch (e) {
    grid.innerHTML = '<div class="empty-state"><h3>Ошибка</h3>' + esc(String(e)) + '</div>';
  }
}

async function refreshAllChats() {
  showToast('Обновляю…');
  try {
    const r = await apiPost('/api/refresh-chats', {});
    showToast('Обновлено: ' + r.refreshed + ', недоступно: ' + r.removed, 'success');
    loadChats();
  } catch (e) { showToast('Ошибка обновления', 'error'); }
}

function enterChat(c) {
  CURRENT_CHAT = c;
  CHAT_ID = c.chat_id;
  document.getElementById('chat-picker').style.display = 'none';
  document.getElementById('chat-panel').style.display = 'block';
  renderCrumbs();
  showTab('dashboard');
  loadChatInfo();
}

// ── TABS ─────────────────────────────────────────────────────────
document.querySelectorAll('#nav-tabs .tab').forEach(t => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll('#nav-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  if (FEED_TIMER) { clearInterval(FEED_TIMER); FEED_TIMER = null; }
  if (!CHAT_ID) return;
  if (name === 'dashboard') { loadStats(); loadRecentFeed(); loadChatInfo(); }
  else if (name === 'feed') { loadFeed(); FEED_TIMER = setInterval(() => { if (document.getElementById('feed-auto').checked) loadFeed(true); }, 4000); }
  else if (name === 'members') loadMembers();
  else if (name === 'staff') loadStaff();
  else if (name === 'modlog') loadModLog();
  else if (name === 'top') loadTop();
  else if (name === 'clans') loadClans();
  else if (name === 'rules') loadRules();
  else if (name === 'settings') loadSettings();
  else if (name === 'manage') loadManage();
}

// ── STATS ────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const d = await apiGet('/api/stats?chat_id=' + CHAT_ID);
    document.getElementById('st-warns').textContent  = num(d.warns);
    document.getElementById('st-staff').textContent  = num(d.staff);
    document.getElementById('st-messages').textContent = CURRENT_CHAT?.messages_logged != null ? num(CURRENT_CHAT.messages_logged) : '—';
    document.getElementById('st-members').textContent = CURRENT_CHAT?.member_count ? num(CURRENT_CHAT.member_count) : '—';
    const tv = document.getElementById('top-violators');
    if (d.top_violators?.length) {
      tv.innerHTML = d.top_violators.map((v, i) => {
        return '<div class="list-row">'
          + '<div class="list-name">' + (i<3?['🥇','🥈','🥉'][i]:(i+1)+'.') + ' ' + esc(v.name) + '</div>'
          + '<div class="right"><span class="badge badge-warn">' + v.warns + ' варн.</span></div>'
          + '</div>';
      }).join('');
    } else { tv.innerHTML = '<div class="empty-state small">Нарушителей нет 🎉</div>'; }
  } catch {}
}

async function loadRecentFeed() {
  try {
    const d = await apiGet('/api/messages?chat_id=' + CHAT_ID + '&limit=8');
    const el = document.getElementById('recent-feed');
    if (!d.messages?.length) { el.innerHTML = '<div class="empty-state small">Сообщений пока нет</div>'; return; }
    el.innerHTML = d.messages.map(m => renderMsg(m, false)).join('');
  } catch {}
}

async function loadChatInfo() {
  const el = document.getElementById('chat-info-block');
  el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/chat-info?chat_id=' + CHAT_ID);
    if (!d.ok) { el.innerHTML = '<div class="empty-state small">Telegram говорит: ' + esc(d.error || 'недоступно') + '. Возможно, бот вышел из чата.</div>'; return; }
    if (CURRENT_CHAT) { CURRENT_CHAT.title = d.title || CURRENT_CHAT.title; CURRENT_CHAT.member_count = d.member_count; renderCrumbs(); }
    el.innerHTML = '<div class="setting-row"><div class="grow"><div class="setting-label">Название</div></div><div>' + esc(d.title || '—') + '</div></div>'
      + '<div class="setting-row"><div class="grow"><div class="setting-label">Тип</div></div><div>' + chatTypeBadge(d.type) + '</div></div>'
      + (d.username ? '<div class="setting-row"><div class="grow"><div class="setting-label">Username</div></div><div>@' + esc(d.username) + '</div></div>' : '')
      + '<div class="setting-row"><div class="grow"><div class="setting-label">Участников</div></div><div>' + num(d.member_count) + '</div></div>'
      + (d.invite_link ? '<div class="setting-row"><div class="grow"><div class="setting-label">Invite link</div></div><a href="' + esc(d.invite_link) + '" target="_blank" style="color:var(--accent2)">' + esc(d.invite_link) + '</a></div>' : '')
      + (d.description ? '<div class="setting-row" style="display:block"><div class="setting-label mb-12">Описание</div><div class="small muted" style="white-space:pre-wrap">' + esc(d.description) + '</div></div>' : '');
    document.getElementById('edit-title').value = d.title || '';
    document.getElementById('edit-desc').value = d.description || '';
  } catch (e) { el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}

// ── FEED ─────────────────────────────────────────────────────────
function renderMsg(m, withTools) {
  const kind = m.kind && m.kind !== 'text' ? '<span class="msg-kind">[' + esc(m.kind) + ']</span>' : '';
  const tools = withTools
    ? '<div class="msg-tools"><button class="btn btn-sm btn-danger" onclick="deleteMsg(' + m.message_id + ')">🗑 Удалить</button>'
      + '<button class="btn btn-sm" onclick="document.getElementById(\\'pin-id\\').value=' + m.message_id + ';showTab(\\'manage\\')">📌 Закрепить</button>'
      + '<button class="btn btn-sm" onclick="banUser(\\'' + m.user_id + '\\',\\'' + esc(m.user_name).replace(/\\'/g,\"\\\\'\") + '\\')">🔨 Бан автора</button></div>'
    : '';
  return '<div class="msg" data-mid="' + m.message_id + '">'
    + '<div class="msg-head"><span class="msg-author">' + esc(m.user_name || 'user_' + m.user_id) + '</span><span class="msg-time">' + esc(fmtTime(m.ts)) + '</span></div>'
    + (m.text ? '<div class="msg-text">' + esc(m.text) + '</div>' : '<div class="msg-text muted">(без текста)</div>')
    + (kind ? '<div>' + kind + '</div>' : '')
    + tools
    + '</div>';
}
async function loadFeed(silent) {
  const el = document.getElementById('feed');
  if (!silent) el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/messages?chat_id=' + CHAT_ID + '&limit=80');
    document.getElementById('feed-meta').textContent = (d.messages || []).length + ' сообщений';
    if (!d.messages?.length) { el.innerHTML = '<div class="empty-state small">Сообщений нет</div>'; return; }
    el.innerHTML = d.messages.map(m => renderMsg(m, true)).join('');
  } catch (e) { if (!silent) el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}
async function deleteMsg(mid) {
  if (!confirm('Удалить сообщение в чате? (через Bot API)')) return;
  try { const r = await apiPost('/api/delete-message', { chat_id: CHAT_ID, message_id: mid }); if (r.ok) { showToast('Удалено', 'success'); loadFeed(true); } else showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}

// ── SEND ─────────────────────────────────────────────────────────
async function sendMessage() {
  const text = document.getElementById('send-text').value.trim();
  if (!text) { showToast('Пустое сообщение', 'error'); return; }
  const parse_mode = document.getElementById('send-mode').value || null;
  const disable_preview = document.getElementById('send-nopreview').checked;
  try {
    const r = await apiPost('/api/send-message', { chat_id: CHAT_ID, text, parse_mode, disable_preview });
    if (r.ok) { showToast('Отправлено', 'success'); document.getElementById('send-text').value = ''; }
    else showToast(r.error || 'Ошибка', 'error');
  } catch { showToast('Ошибка', 'error'); }
}

// ── MEMBERS ──────────────────────────────────────────────────────
let MEMBERS_DEBOUNCE = null;
function onMembersSearch() { clearTimeout(MEMBERS_DEBOUNCE); MEMBERS_DEBOUNCE = setTimeout(loadMembers, 250); }
async function loadMembers() {
  const q = document.getElementById('members-q').value.trim();
  const el = document.getElementById('members-list');
  el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/members?chat_id=' + CHAT_ID + '&q=' + encodeURIComponent(q) + '&limit=200');
    if (!d.members?.length) { el.innerHTML = '<div class="empty-state small">Нет совпадений</div>'; return; }
    el.innerHTML = d.members.map(m => {
      const name = esc(m.display_name || ('user_' + m.user_id));
      const uname = m.username ? '@' + esc(m.username) : '';
      const safeName = name.replace(/'/g, "\\'");
      return '<div class="list-row">'
        + '<div class="chat-avatar" style="width:36px;height:36px;font-size:13px;border-radius:10px;flex-shrink:0">' + esc(initials(m.display_name || 'U')) + '</div>'
        + '<div class="grow">'
        +   '<div class="list-name">' + name + ' ' + rankBadge(m.rank_level) + '</div>'
        +   '<div class="list-sub">' + uname + ' · id ' + esc(m.user_id) + ' · ⚠ ' + (m.warns||0) + ' · ★ ' + (m.rep||0) + '</div>'
        + '</div>'
        + '<div class="row-actions">'
        +   '<button class="btn btn-sm" onclick="muteUser(\\'' + m.user_id + '\\',\\'' + safeName + '\\')">🔇 Мут</button>'
        +   '<button class="btn btn-sm" onclick="kickUser(\\'' + m.user_id + '\\',\\'' + safeName + '\\')">👢 Кик</button>'
        +   '<button class="btn btn-sm btn-danger" onclick="banUser(\\'' + m.user_id + '\\',\\'' + safeName + '\\')">🔨 Бан</button>'
        +   '<button class="btn btn-sm" onclick="setRankPrompt(\\'' + m.user_id + '\\',\\'' + safeName + '\\',' + (m.rank_level || 0) + ')">⚙ Ранг</button>'
        + '</div>'
        + '</div>';
    }).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}
async function kickUser(uid, name) {
  if (!confirm('Кикнуть ' + name + '?')) return;
  try { const r = await apiPost('/api/kick', { chat_id: CHAT_ID, user_id: uid }); r.ok ? showToast(name + ' кикнут', 'success') : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}
async function banUser(uid, name) {
  if (!confirm('Забанить ' + name + ' навсегда?')) return;
  try { const r = await apiPost('/api/ban', { chat_id: CHAT_ID, user_id: uid }); r.ok ? showToast(name + ' забанен', 'success') : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}
async function muteUser(uid, name) {
  const sec = prompt('Длительность мута в секундах (60–86400):', '3600'); if (!sec) return;
  try { const r = await apiPost('/api/mute', { chat_id: CHAT_ID, user_id: uid, duration_sec: Number(sec) }); r.ok ? showToast(name + ' замучен', 'success') : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}
async function setRankPrompt(uid, name, current) {
  const v = prompt('Новый ранг для ' + name + ' (0 = снять, 1=Мл.мод, 2=Мод, 3=Ст.мод, 4=Мл.адм, 5=Адм, 6=Ст.адм, 7=Овнер):', String(current || 0));
  if (v === null) return;
  const lvl = Math.max(0, Math.min(7, Number(v))); if (isNaN(lvl)) return;
  try { const r = await apiPost('/api/setrank', { chat_id: CHAT_ID, user_id: uid, level: lvl }); r.ok ? (showToast('Ранг установлен', 'success'), loadMembers()) : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}

// ── STAFF ────────────────────────────────────────────────────────
async function loadStaff() {
  const el = document.getElementById('staff-list');
  el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/staff?chat_id=' + CHAT_ID);
    if (!d.staff?.length) { el.innerHTML = '<div class="empty-state small">Стаффа пока нет</div>'; return; }
    el.innerHTML = d.staff.map(s => {
      const safeName = esc(s.name).replace(/'/g, "\\'");
      return '<div class="list-row">'
        + '<div class="chat-avatar" style="width:36px;height:36px;font-size:13px;border-radius:10px;flex-shrink:0">' + esc(initials(s.name)) + '</div>'
        + '<div class="grow"><div class="list-name">' + esc(s.name) + ' ' + rankBadge(s.rank) + '</div><div class="list-sub">id ' + esc(s.user_id) + '</div></div>'
        + '<div class="row-actions">'
        +   '<button class="btn btn-sm" onclick="setRankPrompt(\\'' + s.user_id + '\\',\\'' + safeName + '\\',' + s.rank + ')">⚙ Ранг</button>'
        +   '<button class="btn btn-sm btn-danger" onclick="setRankZero(\\'' + s.user_id + '\\',\\'' + safeName + '\\')">✖ Снять</button>'
        + '</div></div>';
    }).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}
async function setRankZero(uid, name) {
  if (!confirm('Снять ранг с ' + name + '?')) return;
  try { const r = await apiPost('/api/setrank', { chat_id: CHAT_ID, user_id: uid, level: 0 }); r.ok ? (showToast('Ранг снят', 'success'), loadStaff()) : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}

// ── MOD LOG ──────────────────────────────────────────────────────
async function loadModLog() {
  const el = document.getElementById('modlog-list');
  el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/log?chat_id=' + CHAT_ID);
    if (!d.entries?.length) { el.innerHTML = '<div class="empty-state small">Журнал пуст</div>'; return; }
    el.innerHTML = d.entries.map(e =>
      '<div class="list-row"><div class="grow"><div class="list-name">' + esc(e.action) + '</div><div class="list-sub">' + esc(e.user) + ' · ' + esc(fmtTime(e.ts)) + '</div></div></div>'
    ).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}

// ── TOP ──────────────────────────────────────────────────────────
async function loadTop() {
  try {
    const d = await apiGet('/api/top?chat_id=' + CHAT_ID);
    document.getElementById('top-rep').innerHTML = (d.top_rep && d.top_rep.length)
      ? d.top_rep.map((r,i)=>'<div class="list-row"><div class="grow"><div class="list-name">'+(i<3?['🥇','🥈','🥉'][i]:(i+1)+'.')+' '+esc(r.name)+'</div></div><div><span class="badge badge-green">★ '+r.rep+'</span></div></div>').join('')
      : '<div class="empty-state small">Пусто</div>';
    document.getElementById('top-warns').innerHTML = (d.top_warns && d.top_warns.length)
      ? d.top_warns.map((r,i)=>'<div class="list-row"><div class="grow"><div class="list-name">'+(i<3?['🥇','🥈','🥉'][i]:(i+1)+'.')+' '+esc(r.name)+'</div></div><div><span class="badge badge-warn">'+r.count+' варн.</span></div></div>').join('')
      : '<div class="empty-state small">Пусто</div>';
  } catch {}
}

// ── CLANS ────────────────────────────────────────────────────────
async function loadClans() {
  const el = document.getElementById('clans-list');
  el.innerHTML = '<div class="empty-state small">Загрузка…</div>';
  try {
    const d = await apiGet('/api/clans?chat_id=' + CHAT_ID);
    if (!d.clans?.length) { el.innerHTML = '<div class="empty-state small">Кланов нет</div>'; return; }
    el.innerHTML = d.clans.map(c =>
      '<div class="list-row"><div class="grow">'
      + '<div class="list-name">[' + esc(c.tag) + '] ' + esc(c.name) + (c.is_open ? ' <span class="badge badge-green">открыт</span>' : ' <span class="badge badge-gray">закрыт</span>') + '</div>'
      + '<div class="list-sub">' + esc(c.description || '—') + '</div>'
      + '</div>'
      + '<div><span class="badge badge-accent">★ ' + (c.total_rep||0) + '</span> <span class="badge badge-blue">👥 ' + (c.members||0) + '</span></div>'
      + '</div>'
    ).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state small">Ошибка: ' + esc(String(e)) + '</div>'; }
}

// ── RULES ────────────────────────────────────────────────────────
async function loadRules() {
  try { const d = await apiGet('/api/rules?chat_id=' + CHAT_ID); document.getElementById('rules-text').value = d.rules || ''; } catch {}
}
async function saveRules() {
  try { await apiPost('/api/rules', { chat_id: CHAT_ID, text: document.getElementById('rules-text').value }); showToast('Сохранено', 'success'); }
  catch { showToast('Ошибка', 'error'); }
}

// ── SETTINGS ─────────────────────────────────────────────────────
const TOGGLE_DEFS = [
  { key: 'antimat',   label: 'Анти-мат',         field: 'antimat_enabled',   desc: 'Удалять сообщения с матом' },
  { key: 'antilinks', label: 'Анти-ссылки',      field: 'antilinks_enabled', desc: 'Удалять сообщения со ссылками' },
  { key: 'antiflood', label: 'Анти-флуд',        field: 'antiflood_enabled', desc: 'Ограничение количества сообщений в окно времени' },
  { key: 'antinsfw',  label: 'Анти-NSFW',        field: 'antinsfw_enabled',  desc: 'Фильтр непристойных изображений' },
  { key: 'captcha',   label: 'Каптча',           field: 'captcha_enabled',   desc: 'Проверять новых участников' },
  { key: 'welcome',   label: 'Приветствие',      field: 'welcome_enabled',   desc: 'Показывать сообщение при входе нового участника' },
];
const NUM_DEFS = [
  { key: 'maxwarns',   label: 'Макс. варнов',  field: 'max_warns',   min: 1, max: 10 },
  { key: 'floodlimit', label: 'Лимит флуда',   field: 'flood_limit', min: 2, max: 30 },
];

async function loadSettings() {
  try {
    const d = await apiGet('/api/settings?chat_id=' + CHAT_ID);
    document.getElementById('settings-toggles').innerHTML = TOGGLE_DEFS.map(t => {
      const on = !!d[t.field];
      return '<div class="setting-row"><div class="grow"><div class="setting-label">' + t.label + '</div><div class="setting-desc">' + t.desc + '</div></div>'
        + '<div class="switch ' + (on ? 'on' : '') + '" data-key="' + t.key + '" onclick="toggleSetting(this)"></div></div>';
    }).join('');
    document.getElementById('settings-numbers').innerHTML = NUM_DEFS.map(n => {
      const v = Number(d[n.field]) || n.min;
      return '<div class="setting-row"><div class="grow"><div class="setting-label">' + n.label + '</div><div class="setting-desc">от ' + n.min + ' до ' + n.max + '</div></div>'
        + '<div class="num-row"><button class="num-btn" onclick="numChange(\\'' + n.key + '\\',-1)">−</button>'
        +   '<span class="num-val" id="num-' + n.key + '">' + v + '</span>'
        +   '<button class="num-btn" onclick="numChange(\\'' + n.key + '\\',1)">+</button></div></div>';
    }).join('');
    document.getElementById('welcome-text').value = d.welcome_text || '';
    document.getElementById('bad-words').value    = d.bad_words   || '';
  } catch (e) { showToast('Ошибка загрузки настроек', 'error'); }
}
async function toggleSetting(el) {
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  try { await apiPost('/api/setting', { chat_id: CHAT_ID, key: el.dataset.key, value: on ? 1 : 0 }); showToast('Сохранено', 'success'); }
  catch { showToast('Ошибка', 'error'); el.classList.toggle('on'); }
}
async function numChange(key, delta) {
  const el = document.getElementById('num-' + key);
  const def = NUM_DEFS.find(n => n.key === key); if (!def) return;
  let v = Number(el.textContent) + delta;
  if (v < def.min) v = def.min; if (v > def.max) v = def.max;
  el.textContent = v;
  try { await apiPost('/api/setting', { chat_id: CHAT_ID, key, value: v }); }
  catch { showToast('Ошибка', 'error'); }
}
async function saveWelcome() {
  try { await apiPost('/api/setting', { chat_id: CHAT_ID, key: 'welcometext', value: document.getElementById('welcome-text').value }); showToast('Сохранено', 'success'); }
  catch { showToast('Ошибка', 'error'); }
}
async function saveBadWords() {
  try { await apiPost('/api/setting', { chat_id: CHAT_ID, key: 'bad_words_raw', value: document.getElementById('bad-words').value }); showToast('Сохранено', 'success'); }
  catch { showToast('Ошибка', 'error'); }
}

// ── MANAGE ───────────────────────────────────────────────────────
async function loadManage() {
  await loadChatInfo();
  document.getElementById('confirm-delete').checked = false;
}
async function saveChatEdit() {
  const title = document.getElementById('edit-title').value;
  const desc  = document.getElementById('edit-desc').value;
  try {
    const r = await apiPost('/api/edit-chat', { chat_id: CHAT_ID, title, description: desc });
    if (r.ok) { showToast('Чат обновлён', 'success'); loadChatInfo(); }
    else showToast(r.errors?.join('; ') || 'Часть не сохранена', 'error');
  } catch { showToast('Ошибка', 'error'); }
}
async function pinMessage() {
  const id = Number(document.getElementById('pin-id').value); if (!id) return showToast('Укажи ID', 'error');
  const silent = document.getElementById('pin-silent').checked;
  try { const r = await apiPost('/api/pin', { chat_id: CHAT_ID, message_id: id, silent }); r.ok ? showToast('Закреплено', 'success') : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}
async function unpinAll() {
  if (!confirm('Открепить все сообщения?')) return;
  try { const r = await apiPost('/api/unpin', { chat_id: CHAT_ID }); r.ok ? showToast('Откреплено', 'success') : showToast(r.error || 'Ошибка', 'error'); }
  catch { showToast('Ошибка', 'error'); }
}
async function deleteChat() {
  if (!document.getElementById('confirm-delete').checked) { showToast('Подтверди удаление чекбоксом', 'error'); return; }
  if (!confirm('УДАЛИТЬ этот чат? Бот выйдет, все данные будут стёрты. Это действие нельзя отменить.')) return;
  try {
    const r = await apiPost('/api/delete-chat', { chat_id: CHAT_ID, wipe: true });
    showToast(r.left ? 'Бот вышел, удалено записей: ' + r.wiped : ('Бот не смог выйти: ' + (r.leave_error || '?') + '. Записей удалено: ' + r.wiped), r.left ? 'success' : 'error');
    setTimeout(showChatPicker, 800);
  } catch { showToast('Ошибка', 'error'); }
}
</script>
</body>
</html>
`;