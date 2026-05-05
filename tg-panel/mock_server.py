"""
Local mock for the Telegram bot dashboard.
- Serves tg-panel/dashboard.html at /dashboard
- Fakes every /api/* endpoint the dashboard talks to
- Includes adversarial display_name payloads to prove the XSS fix
- Returns mock data with deterministic values so the test plan's
  expected numbers (4, 7, 1234, 3) match
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8088
HERE = os.path.dirname(os.path.abspath(__file__))
DASHBOARD = os.path.join(HERE, "dashboard.html")

PASSWORD = "testpass"
START_TS = int(time.time())

STATE = {
    "messages": [
        {"message_id": 101, "user_id": "1001", "user_name": "Alice", "text": "Привет всем!", "kind": "text", "ts": START_TS - 600, "media": None, "reply_to": 0},
        {"message_id": 102, "user_id": "1002", "user_name": "Bob", "text": "Йо", "kind": "text", "ts": START_TS - 500, "media": None, "reply_to": 101},
        {"message_id": 103, "user_id": "1003", "user_name": "Charlie", "text": "Кто хочет CS-сервер сегодня?", "kind": "text", "ts": START_TS - 400, "media": None, "reply_to": 0},
        {"message_id": 104, "user_id": "1001", "user_name": "Alice", "text": "Я в деле", "kind": "text", "ts": START_TS - 300, "media": None, "reply_to": 103},
        {"message_id": 105, "user_id": "1002", "user_name": "Bob", "text": "", "kind": "photo", "ts": START_TS - 250,
         "media": {"kind": "photo", "file_id": "MOCK_FILE_PHOTO", "w": 800, "h": 600}, "reply_to": 0},
        {"message_id": 106, "user_id": "1003", "user_name": "Charlie", "text": "", "kind": "sticker", "ts": START_TS - 200,
         "media": {"kind": "sticker", "file_id": "MOCK_FILE_STICKER", "w": 512, "h": 512, "is_animated": False, "is_video": False, "emoji": "🔥", "thumb_file_id": "MOCK_FILE_STICKER_T"}, "reply_to": 0},
        {"message_id": 107, "user_id": "1001", "user_name": "Alice", "text": "посмотри", "kind": "document", "ts": START_TS - 100,
         "media": {"kind": "document", "file_id": "MOCK_FILE_DOC", "mime": "application/pdf", "name": "report.pdf", "size": 184320}, "reply_to": 0},
    ],
    "next_msg_id": 200,
    "extra_msg_ts": 0,
    "post_logout_msg_calls": 0,
    "logout_at_ts": 0,
}

# Adversarial members: if the inline-onclick string concat were still in place,
# rendering this list (or clicking action buttons) would execute alert().
MEMBERS = [
    {
        "user_id": "1001",
        "display_name": "Alice",
        "username": "alice_admin",
        "warns": 0,
        "rep": 12,
        "rank_level": 5,
    },
    {
        "user_id": "1002",
        "display_name": "Bob",
        "username": "",
        "warns": 2,
        "rep": 3,
        "rank_level": 0,
    },
    {
        "user_id": "9001",
        # buggy build: replace(/'/g,"\\'") was a no-op, so this would close
        # the JS string in the inline onclick="muteUser('...','...')"
        # and execute alert('XSS_FROM_NAME').
        "display_name": "');alert('XSS_FROM_NAME');//",
        "username": "evil_apos",
        "warns": 7,
        "rep": 0,
        "rank_level": 0,
    },
    {
        "user_id": "9002",
        # would have been HTML-escaped already by esc(), but test that the
        # whole pipeline keeps it inert.
        "display_name": "<img src=x onerror=alert('XSS_FROM_IMG')>",
        "username": "evil_html",
        "warns": 4,
        "rep": 0,
        "rank_level": 0,
    },
]

STAFF = [
    {"user_id": "1001", "name": "Alice", "rank": 7},
    {"user_id": "1010", "name": "Mr ' OR 1=1", "rank": 4},
    {"user_id": "1020", "name": "Dave", "rank": 2},
]

CHATS = [
    {
        "chat_id": "-1001234567890",
        "title": "Главный чат",
        "type": "supergroup",
        "username": "main_chat",
        "member_count": 1234,
        "messages_logged": 4,
        "first_seen": START_TS - 3600 * 24 * 30,
        "last_seen": START_TS - 60,
        "removed": 0,
    },
    {
        "chat_id": "-1009876543210",
        "title": "Тест канал",
        "type": "channel",
        "username": "test_channel",
        "member_count": 42,
        "messages_logged": 9,
        "first_seen": START_TS - 3600 * 24,
        "last_seen": START_TS - 300,
        "removed": 0,
    },
    {
        # Adversarial chat title: in the buggy build, `JSON.stringify(c).replace(/"/g,'&quot;')`
        # produces an onclick attribute whose HTML entity sequences (&#34;) decode back to
        # a literal " — closing the JS string and executing alert(). With the fixed
        # data-chat-idx + addEventListener, no chat data ever crosses into HTML attributes.
        "chat_id": "-1005555555555",
        "title": "&#34;+alert('XSS_FROM_TITLE')+&#34;",
        "type": "group",
        "username": "evil_chat",
        "member_count": 7,
        "messages_logged": 0,
        "first_seen": START_TS - 60,
        "last_seen": START_TS - 30,
        "removed": 0,
    },
]


def jbody(handler, code, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def parse_query(url):
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Quiet but keep one-line for our own grep
        print("[mock]", self.command, self.path, fmt % args)

    def _check_pwd(self, q):
        return q.get("pwd") == PASSWORD

    # ─────────────────────────────────────────── GET ───────────────────────────────
    def do_GET(self):
        path = urlparse(self.path).path
        q = parse_query(self.path)

        if path in ("/", "/dashboard"):
            with open(DASHBOARD, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if not path.startswith("/api/"):
            self.send_error(404)
            return

        if not self._check_pwd(q):
            jbody(self, 401, {"ok": False, "error": "bad password"})
            return

        if path == "/api/ping":
            return jbody(self, 200, {"ok": True})

        if path == "/api/bot-info":
            return jbody(self, 200, {"ok": True, "username": "test_panel_bot"})

        if path == "/api/chats":
            return jbody(self, 200, {"ok": True, "chats": CHATS})

        if path == "/api/chat-info":
            cid = q.get("chat_id", "")
            chat = next((c for c in CHATS if c["chat_id"] == cid), None)
            if not chat:
                return jbody(self, 200, {"ok": False, "error": "not found"})
            return jbody(self, 200, {
                "ok": True,
                "chat_id": chat["chat_id"],
                "title": chat["title"],
                "type": chat["type"],
                "username": chat.get("username", ""),
                "member_count": chat["member_count"],
                "description": "Главный чат группы. Описание из мока.",
                "invite_link": "https://t.me/+mockInvite",
                "linked_chat_id": "",
                "permissions": {},
            })

        if path == "/api/messages":
            # Inject one extra message ~5s after first /api/messages call to prove auto-refresh
            now = time.time()
            if STATE["extra_msg_ts"] == 0:
                STATE["extra_msg_ts"] = now + 5
            if now >= STATE["extra_msg_ts"] and not any(m["message_id"] == 200 for m in STATE["messages"]):
                STATE["messages"].append({
                    "message_id": 200,
                    "user_id": "1002",
                    "user_name": "Bob",
                    "text": "новое сообщение от мока (auto-refresh)",
                    "kind": "text",
                    "ts": int(now),
                })
            # Track post-logout polling: if logout happened, this is a leak.
            if STATE["logout_at_ts"] and now >= STATE["logout_at_ts"]:
                STATE["post_logout_msg_calls"] += 1
            limit = int(q.get("limit", 80))
            msgs = sorted(STATE["messages"], key=lambda m: m["ts"], reverse=True)[:limit]
            return jbody(self, 200, {"ok": True, "messages": msgs})

        if path == "/api/members":
            qs = (q.get("q") or "").lower()
            sort = q.get("sort", "rank")
            ms = [m for m in MEMBERS if not qs or qs in (m["display_name"] or "").lower()]
            # enrich with last_seen_at / status / avatar_path so the new UI
            # exercises avatar+status-dot rendering paths.
            for i, m in enumerate(ms):
                m.setdefault("last_seen_at", START_TS - 60 * (i + 1))
                m.setdefault("status", ["member", "administrator", "creator", "left"][i % 4])
                m.setdefault("avatar_path", "")  # empty → fallback to initials
            keyfns = {
                "rank":   lambda m: -(m.get("rank_level") or 0),
                "recent": lambda m: -(m.get("last_seen_at") or 0),
                "warns":  lambda m: -(m.get("warns") or 0),
                "rep":    lambda m: -(m.get("rep") or 0),
                "name":   lambda m: (m.get("display_name") or "").lower(),
            }
            ms = sorted(ms, key=keyfns.get(sort, keyfns["rank"]))
            return jbody(self, 200, {"ok": True, "members": ms, "total": len(MEMBERS)})

        if path == "/api/avatar":
            # standalone мок не имеет картинок — отдаём 404, дашборд должен
            # упасть в инициалы через avatarFallback().
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"no avatar")
            return

        if path == "/api/file":
            # Мок отдаёт пустые байты с правильным content-type, чтобы дашборд
            # рендерил <img>/<video>/<audio> заглушки и не падал на сетевых
            # ошибках. Реального содержимого тут не нужно — это standalone-тест.
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            # 1×1 transparent PNG so <img> doesn't trigger onerror in tests.
            self.wfile.write(bytes.fromhex(
                "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500000d0a2db40000000049454e44ae426082"
            ))
            return

        if path == "/api/user-info":
            uid = q.get("user_id", "")
            u = next((m for m in MEMBERS if m["user_id"] == uid), None)
            if not u:
                return jbody(self, 200, {"ok": True, "user": {
                    "user_id": uid, "display_name": "user_" + uid, "username": "",
                    "warns": 0, "rep": 0, "rank_level": 0, "status": "", "last_seen_at": 0,
                }, "antimat_events": [], "recent_messages": []})
            user = dict(u)
            user.setdefault("status", "member")
            user.setdefault("last_seen_at", START_TS - 600)
            return jbody(self, 200, {
                "ok": True,
                "user": user,
                "tg_status": "member",
                "antimat_events": [
                    {"matched": "слово1", "action": "варн 1/3", "ts": START_TS - 300},
                    {"matched": "слово2", "action": "бан",      "ts": START_TS - 200},
                ],
                "recent_messages": [
                    {"message_id": 991, "kind": "text", "text": "Привет всем", "ts": START_TS - 100},
                    {"message_id": 992, "kind": "text", "text": "Йо",          "ts": START_TS - 60},
                ],
            })

        if path == "/api/antimat-log":
            return jbody(self, 200, {"ok": True, "events": [
                {"user_id": "1002", "user_name": "Bob", "matched": "слово1", "action": "варн 1/3", "ts": START_TS - 300},
                {"user_id": "9001", "user_name": "');alert('XSS_FROM_NAME');//", "matched": "слово2", "action": "бан", "ts": START_TS - 200},
            ]})

        if path == "/api/activity":
            buckets = [0, 0, 1, 3, 7, 12, 18, 22, 25, 19, 14, 9, 6, 4, 3, 5, 8, 11, 16, 14, 10, 6, 3, 1]
            return jbody(self, 200, {"ok": True, "buckets": buckets, "total": sum(buckets)})

        if path == "/api/export":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Disposition", 'attachment; filename="chat-mock.json"')
            self.end_headers()
            self.wfile.write(json.dumps({"chat_id": "mock", "members": MEMBERS}, ensure_ascii=False, indent=2).encode("utf-8"))
            return

        if path == "/api/staff":
            return jbody(self, 200, {"ok": True, "staff": STAFF})

        if path == "/api/stats":
            top = sorted([m for m in MEMBERS if m["warns"] > 0], key=lambda m: m["warns"], reverse=True)[:5]
            return jbody(self, 200, {
                "ok": True,
                "warns": sum(m["warns"] for m in MEMBERS),
                "staff": len(STAFF),
                "top_violators": [{"name": m["display_name"], "warns": m["warns"]} for m in top],
            })

        if path == "/api/log":
            # Dashboard reads entries[].action, entries[].user, entries[].ts
            return jbody(self, 200, {"ok": True, "entries": [
                {"action": "Варны: 7", "user": "');alert('XSS_FROM_NAME');//", "ts": START_TS - 50},
                {"action": "Варны: 4", "user": "<img src=x onerror=alert('XSS_FROM_IMG')>", "ts": START_TS - 100},
                {"action": "Варны: 2", "user": "Bob", "ts": START_TS - 200},
            ]})

        if path == "/api/top":
            # Dashboard reads d.top_rep[].rep and d.top_warns[].count
            return jbody(self, 200, {
                "ok": True,
                "top_rep":   [{"name": m["display_name"], "rep":   m["rep"]}   for m in MEMBERS if m["rep"]   > 0],
                "top_warns": [{"name": m["display_name"], "count": m["warns"]} for m in MEMBERS if m["warns"] > 0],
            })

        if path == "/api/clans":
            return jbody(self, 200, {"ok": True, "clans": [
                {"tag": "[GG]", "name": "Good Guys", "leader": "Alice", "members": 10},
            ]})

        if path == "/api/rules":
            return jbody(self, 200, {"ok": True, "rules": "1. Не флудить\n2. Без мата\n"})

        if path == "/api/welcome":
            return jbody(self, 200, {"ok": True, "text": "Добро пожаловать!"})

        if path == "/api/badwords":
            return jbody(self, 200, {"ok": True, "words": "слово1\nслово2"})

        if path == "/api/settings":
            return jbody(self, 200, {
                "ok": True,
                "antimat_enabled": 1,
                "antilinks_enabled": 1,
                "antiflood_enabled": 0,
                "antitag_enabled": 0,
                "welcome_enabled": 1,
                "max_warns": 3,
                "flood_limit": 5,
                "flood_window": 10,
                "mute_seconds": 60,
            })

        if path == "/api/manage":
            return jbody(self, 200, {"ok": True, "title": "Главный чат", "description": "desc", "pinned": []})

        if path == "/api/pinned-list":
            return jbody(self, 200, {"ok": True, "pinned": []})

        if path == "/api/refresh-chats":
            return jbody(self, 200, {"ok": True, "chats": CHATS})

        if path == "/api/__test__/state":
            # convenience for test runner to read state
            return jbody(self, 200, {
                "ok": True,
                "post_logout_msg_calls": STATE["post_logout_msg_calls"],
                "logout_at_ts": STATE["logout_at_ts"],
            })

        return jbody(self, 200, {"ok": True, "stub": path})

    # ─────────────────────────────────────────── POST ──────────────────────────────
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            data = {}
        path = urlparse(self.path).path
        q = parse_query(self.path)
        if not self._check_pwd(q):
            return jbody(self, 401, {"ok": False, "error": "bad password"})

        if path == "/api/__test__/mark-logout":
            STATE["logout_at_ts"] = time.time()
            STATE["post_logout_msg_calls"] = 0
            return jbody(self, 200, {"ok": True})

        if path == "/api/refresh-chats":
            return jbody(self, 200, {"ok": True, "chats": CHATS})

        # Mirror worker.js: POST /api/rules saves rules text. Used by T9 to
        # verify the GET handler no longer shadows the POST when chat_id is in
        # the URL query.
        if path == "/api/rules":
            STATE["last_saved_rules"] = data.get("text", "")
            return jbody(self, 200, {"ok": True, "saved": True})

        if path == "/api/send-message":
            new_id = STATE["next_msg_id"]
            STATE["next_msg_id"] += 1
            STATE["messages"].append({
                "message_id": new_id,
                "user_id": "0",
                "user_name": "test_panel_bot",
                "text": data.get("text", ""),
                "kind": "text",
                "ts": int(time.time()),
            })
            return jbody(self, 200, {"ok": True, "message_id": new_id})

        if path == "/api/delete-message":
            mid = int(data.get("message_id", 0))
            STATE["messages"] = [m for m in STATE["messages"] if m["message_id"] != mid]
            return jbody(self, 200, {"ok": True})

        if path == "/api/sync-admins":
            return jbody(self, 200, {"ok": True, "added": 2, "total": 3})

        if path == "/api/bulk":
            ids = data.get("user_ids", []) or []
            return jbody(self, 200, {"ok": True, "processed": len(ids), "errors": []})

        if path == "/api/broadcast":
            chat_ids = data.get("chat_ids") or [c["chat_id"] for c in CHATS]
            return jbody(self, 200, {"ok": True, "sent": len(chat_ids), "total": len(chat_ids), "errors": []})

        # All moderation actions just echo ok
        if path in ("/api/kick", "/api/ban", "/api/unban", "/api/mute", "/api/unmute",
                    "/api/setrank", "/api/edit-chat", "/api/pin", "/api/unpin",
                    "/api/save-rules", "/api/save-welcome", "/api/save-badwords",
                    "/api/save-settings", "/api/delete-chat", "/api/purge-chat"):
            return jbody(self, 200, {"ok": True, "echo": data})

        return jbody(self, 200, {"ok": True, "stub": path})


def serve():
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[mock] listening on http://127.0.0.1:{PORT}/dashboard  (password={PASSWORD})")
    httpd.serve_forever()


if __name__ == "__main__":
    serve()
