import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Lock,
  MessageCircle,
  MessageSquareText,
  Mic2,
  MoreHorizontal,
  Radio,
  Search,
  Send,
  Settings2,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserMinus,
  Users,
  Zap,
} from 'lucide-react';

type View = 'home' | 'overview' | 'chat' | 'content' | 'moderation' | 'settings' | 'danger';

type Channel = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  theme: string;
  members: string;
  online: number;
  messagesToday: number;
  warns: number;
  category: string;
  botRole: string;
};

type ChatMessage = {
  id: number;
  author: string;
  tag: string;
  text: string;
  time: string;
  status: 'ok' | 'watch' | 'danger';
};

type Member = {
  id: number;
  name: string;
  username: string;
  role: string;
  warns: number;
  lastSeen: string;
};

type SettingKey = 'antiSpam' | 'antiLinks' | 'welcome' | 'nightMode' | 'autoDelete';

const channels: Channel[] = [
  {
    id: 'main',
    name: '2temiy Community',
    handle: '@twotemiy_chat',
    avatar: '2T',
    theme: 'from-sky-400 via-cyan-300 to-blue-500',
    members: '18 420',
    online: 742,
    messagesToday: 1284,
    warns: 16,
    category: 'Основний чат',
    botRole: 'Адміністратор',
  },
  {
    id: 'news',
    name: '2temiy News',
    handle: '@twotemiy_news',
    avatar: 'NW',
    theme: 'from-fuchsia-400 via-violet-400 to-indigo-500',
    members: '42 800',
    online: 1180,
    messagesToday: 368,
    warns: 4,
    category: 'Канал новин',
    botRole: 'Публікації + модерація',
  },
  {
    id: 'mods',
    name: 'Staff Room',
    handle: '@twotemiy_staff',
    avatar: 'ST',
    theme: 'from-lime-300 via-emerald-300 to-teal-500',
    members: '64',
    online: 21,
    messagesToday: 97,
    warns: 0,
    category: 'Закритий чат',
    botRole: 'Повний доступ',
  },
];

const chatMessages: ChatMessage[] = [
  {
    id: 1,
    author: 'MaksDev',
    tag: '@maksdev',
    text: 'Коли буде новий пост? Хочу голосування по темі стріму.',
    time: '12:48',
    status: 'ok',
  },
  {
    id: 2,
    author: 'Lina',
    tag: '@linax',
    text: 'Бот видалив лінк, але це був нормальний ресурс. Можна додати в whitelist?',
    time: '12:51',
    status: 'watch',
  },
  {
    id: 3,
    author: 'dark_ad',
    tag: '@promo_fast',
    text: 'Залітайте на мій канал, там розіграш і промо...',
    time: '12:55',
    status: 'danger',
  },
];

const members: Member[] = [
  { id: 1, name: 'MaksDev', username: '@maksdev', role: 'Учасник', warns: 0, lastSeen: 'онлайн' },
  { id: 2, name: 'Lina', username: '@linax', role: 'Модератор', warns: 1, lastSeen: '2 хв тому' },
  { id: 3, name: 'dark_ad', username: '@promo_fast', role: 'Учасник', warns: 3, lastSeen: 'щойно' },
  { id: 4, name: 'Roma', username: '@romalive', role: 'Учасник', warns: 2, lastSeen: '18 хв тому' },
];

const quickActions = [
  { title: 'Написати пост', text: 'Опублікувати або запланувати повідомлення', icon: <Send className="h-5 w-5" /> },
  { title: 'Стежити за чатом', text: 'Live-стрічка, репорти, підозрілі повідомлення', icon: <Eye className="h-5 w-5" /> },
  { title: 'Редагувати канал', text: 'Назва, опис, правила, привітання', icon: <Edit3 className="h-5 w-5" /> },
  { title: 'Модерувати людей', text: 'Кік, мут, бан, попередження', icon: <ShieldAlert className="h-5 w-5" /> },
];

const initialSettings: Record<SettingKey, boolean> = {
  antiSpam: true,
  antiLinks: true,
  welcome: true,
  nightMode: false,
  autoDelete: true,
};

function TelegramDashboard() {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [message, setMessage] = useState('Привіт! Сьогодні о 20:00 буде анонс нового івенту. Не пропусти.');
  const [rules, setRules] = useState('Без спаму, реклами, токсичності та зливу приватних даних.');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [settings, setSettings] = useState(initialSettings);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? channels[0],
    [selectedChannelId],
  );

  const goToChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    setView('overview');
    setDeleteConfirm('');
  };

  const toggleSetting = (key: SettingKey) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  if (view === 'home' || selectedChannelId === null) {
    return <ChannelPicker onSelect={goToChannel} />;
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#070914] text-white selection:bg-cyan-300/30">
      <BackgroundGlow />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl lg:block">
          <button
            onClick={() => {
              setSelectedChannelId(null);
              setView('home');
            }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Вибір каналу
          </button>

          <ChannelBadge channel={selectedChannel} size="large" />

          <nav className="mt-8 space-y-2">
            <SidebarButton active={view === 'overview'} icon={<Zap />} label="Головна" onClick={() => setView('overview')} />
            <SidebarButton active={view === 'chat'} icon={<MessageCircle />} label="Чат наживо" onClick={() => setView('chat')} />
            <SidebarButton active={view === 'content'} icon={<MessageSquareText />} label="Пости" onClick={() => setView('content')} />
            <SidebarButton active={view === 'moderation'} icon={<Shield />} label="Модерація" onClick={() => setView('moderation')} />
            <SidebarButton active={view === 'settings'} icon={<Settings2 />} label="Налаштування" onClick={() => setView('settings')} />
            <SidebarButton active={view === 'danger'} icon={<Trash2 />} label="Видалити" danger onClick={() => setView('danger')} />
          </nav>
        </aside>

        <section className="w-full px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <ChannelAvatar channel={selectedChannel} />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{selectedChannel.name}</h1>
                  <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-xs font-black text-emerald-200">
                    bot online
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/50">
                  {selectedChannel.handle} · {selectedChannel.botRole}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold transition hover:bg-white/10">
                <Bell className="mr-2 inline h-4 w-4" />
                Сповіщення
              </button>
              <button onClick={() => setView('content')} className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-black text-black shadow-xl shadow-cyan-300/20 transition hover:bg-cyan-200">
                Написати
              </button>
            </div>
          </header>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            <MobileTab active={view === 'overview'} label="Головна" onClick={() => setView('overview')} />
            <MobileTab active={view === 'chat'} label="Чат" onClick={() => setView('chat')} />
            <MobileTab active={view === 'content'} label="Пости" onClick={() => setView('content')} />
            <MobileTab active={view === 'moderation'} label="Модерація" onClick={() => setView('moderation')} />
            <MobileTab active={view === 'settings'} label="Канал" onClick={() => setView('settings')} />
            <MobileTab active={view === 'danger'} label="Видалити" danger onClick={() => setView('danger')} />
          </div>

          <div className="mt-6">
            {view === 'overview' && <Overview channel={selectedChannel} />}
            {view === 'chat' && <ChatPanel />}
            {view === 'content' && <ContentPanel message={message} setMessage={setMessage} />}
            {view === 'moderation' && <ModerationPanel />}
            {view === 'settings' && (
              <SettingsPanel
                channel={selectedChannel}
                rules={rules}
                setRules={setRules}
                settings={settings}
                toggleSetting={toggleSetting}
              />
            )}
            {view === 'danger' && (
              <DangerPanel channel={selectedChannel} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ChannelPicker({ onSelect }: { onSelect: (channelId: string) => void }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070914] text-white selection:bg-cyan-300/30">
      <BackgroundGlow />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300 text-black shadow-lg shadow-cyan-300/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-100">TG Control</p>
              <p className="text-xs text-white/45">панель керування ботом</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100 sm:flex">
            <Radio className="h-4 w-4" />
            3 канали підключено
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100">
              <Sparkles className="h-4 w-4" />
              Обери Telegram-канал, де бот вже налаштований
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
              Один сайт —
              <span className="block bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-lime-200 bg-clip-text text-transparent">
                повний контроль над TG
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Пиши пости, стеж за чатом, редагуй правила, керуй модераторами, кікай порушників і тримай
              канал чистим без команд у Telegram.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => (
                <article key={action.title} className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
                  <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-white text-black">{action.icon}</div>
                  <h3 className="font-black">{action.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/50">{action.text}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-cyan-300/20 via-fuchsia-400/10 to-lime-300/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#101423]/90 p-5 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-white/35">Workspace</p>
                  <h2 className="mt-1 text-2xl font-black">Підключені канали</h2>
                </div>
                <button className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/65">
                  <Search className="mr-2 inline h-4 w-4" />
                  Пошук
                </button>
              </div>

              <div className="space-y-3">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => onSelect(channel.id)}
                    className="group flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-200/50 hover:bg-white/[0.09]"
                  >
                    <ChannelAvatar channel={channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-black">{channel.name}</p>
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/55">
                          {channel.category}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/45">{channel.handle}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-white/55">
                        <span>{channel.members} учасників</span>
                        <span>·</span>
                        <span>{channel.online} онлайн</span>
                        <span>·</span>
                        <span>{channel.botRole}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/35 transition group-hover:translate-x-1 group-hover:text-cyan-100" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Overview({ channel }: { channel: Channel }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Users />} label="Учасники" value={channel.members} accent="text-cyan-200" />
          <StatCard icon={<Radio />} label="Онлайн" value={String(channel.online)} accent="text-emerald-200" />
          <StatCard icon={<MessageCircle />} label="Повідомлень сьогодні" value={String(channel.messagesToday)} accent="text-fuchsia-200" />
          <StatCard icon={<AlertTriangle />} label="Попереджень" value={String(channel.warns)} accent="text-orange-200" />
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/70">Live центр</p>
              <h2 className="mt-1 text-2xl font-black">Що зараз відбувається</h2>
            </div>
            <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-black text-emerald-100">online</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ActivityCard title="Автомодерація" value="21 дія" text="спам, лінки, токсичність" />
            <ActivityCard title="Пости в черзі" value="4" text="2 сьогодні, 2 завтра" />
            <ActivityCard title="Репорти" value="7" text="потребують перевірки" danger />
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
          <h2 className="text-2xl font-black">Швидкі дії</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ActionButton icon={<Send />} title="Відправити оголошення" text="Одразу в канал або в розклад" />
            <ActionButton icon={<UserMinus />} title="Кікнути порушника" text="Знайди юзера й прибери з чату" />
            <ActionButton icon={<Lock />} title="Закрити чат" text="Увімкнути read-only режим" />
            <ActionButton icon={<Trash2 />} title="Видалити канал" text="Danger zone з підтвердженням" danger />
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black">Останній чат</h2>
          <MoreHorizontal className="h-5 w-5 text-white/40" />
        </div>
        <div className="mt-5 space-y-3">
          {chatMessages.map((message) => (
            <React.Fragment key={message.id}>
              <ChatBubble message={message} compact />
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/70">Моніторинг</p>
            <h2 className="mt-1 text-2xl font-black">Чат наживо</h2>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/65">Тільки репорти</button>
            <button className="rounded-full bg-white px-4 py-2 text-sm font-black text-black">Автооновлення</button>
          </div>
        </div>
        <div className="space-y-3">
          {chatMessages.map((message) => (
            <React.Fragment key={message.id}>
              <ChatBubble message={message} />
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <h2 className="text-2xl font-black">Дії з повідомленням</h2>
        <div className="mt-5 space-y-3">
          <ModerationButton icon={<Trash2 />} title="Видалити повідомлення" />
          <ModerationButton icon={<AlertTriangle />} title="Видати warn" />
          <ModerationButton icon={<Lock />} title="Мут на 1 годину" />
          <ModerationButton icon={<Ban />} title="Бан користувача" danger />
        </div>
      </section>
    </div>
  );
}

function ContentPanel({
  message,
  setMessage,
}: {
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/70">Composer</p>
            <h2 className="mt-1 text-2xl font-black">Написати повідомлення</h2>
          </div>
          <Mic2 className="h-6 w-6 text-white/35" />
        </div>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-56 w-full resize-none rounded-3xl border border-white/10 bg-black/20 p-5 text-base leading-8 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-200/60"
          placeholder="Напиши пост для каналу..."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-full bg-cyan-300 px-6 py-3 font-black text-black shadow-xl shadow-cyan-300/20 transition hover:bg-cyan-200">
            <Send className="mr-2 inline h-4 w-4" />
            Опублікувати
          </button>
          <button className="rounded-full border border-white/10 bg-white/[0.06] px-6 py-3 font-bold transition hover:bg-white/10">
            <CalendarClock className="mr-2 inline h-4 w-4" />
            Запланувати
          </button>
          <button className="rounded-full border border-white/10 px-6 py-3 font-bold text-white/60 transition hover:text-white">
            Зберегти чернетку
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <h2 className="text-2xl font-black">Превʼю поста</h2>
        <div className="mt-5 rounded-[1.6rem] border border-white/10 bg-[#172033] p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300 text-sm font-black text-black">TG</div>
            <div>
              <p className="font-black">Telegram канал</p>
              <p className="text-xs text-white/40">щойно · bot</p>
            </div>
          </div>
          <p className="whitespace-pre-wrap leading-7 text-white/80">{message}</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <ActivityCard title="Перегляди" value="~12k" text="прогноз" />
          <ActivityCard title="Реакції" value="820" text="прогноз" />
        </div>
      </section>
    </div>
  );
}

function ModerationPanel() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/70">Staff tools</p>
          <h2 className="mt-1 text-2xl font-black">Учасники та модерація</h2>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/45">
          <Search className="mr-2 inline h-4 w-4" />
          Пошук по username
        </div>
      </div>
      <div className="grid gap-3">
        {members.map((member) => (
          <div key={member.id} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-sm font-black text-black">
                {member.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{member.name}</p>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/55">{member.role}</span>
                  {member.warns >= 3 && (
                    <span className="rounded-full bg-rose-400/15 px-2 py-1 text-xs font-black text-rose-100">ризик</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/45">
                  {member.username} · {member.warns} warn · {member.lastSeen}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SmallAction label="Warn" />
              <SmallAction label="Mute" />
              <SmallAction label="Kick" />
              <SmallAction label="Ban" danger />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({
  channel,
  rules,
  setRules,
  settings,
  toggleSetting,
}: {
  channel: Channel;
  rules: string;
  setRules: React.Dispatch<React.SetStateAction<string>>;
  settings: Record<SettingKey, boolean>;
  toggleSetting: (key: SettingKey) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/70">Channel editor</p>
        <h2 className="mt-1 text-2xl font-black">Редагувати канал</h2>
        <div className="mt-5 grid gap-4">
          <Field label="Назва каналу" value={channel.name} />
          <Field label="Username" value={channel.handle} />
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-white/55">Правила</span>
            <textarea
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              className="min-h-36 w-full resize-none rounded-3xl border border-white/10 bg-black/20 p-4 leading-7 outline-none transition focus:border-cyan-200/60"
            />
          </label>
          <button className="w-fit rounded-full bg-cyan-300 px-6 py-3 font-black text-black shadow-xl shadow-cyan-300/20">
            Зберегти зміни
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
        <h2 className="text-2xl font-black">Автоматика</h2>
        <div className="mt-5 space-y-3">
          <SwitchRow label="Антиспам" enabled={settings.antiSpam} onClick={() => toggleSetting('antiSpam')} />
          <SwitchRow label="Антилінки" enabled={settings.antiLinks} onClick={() => toggleSetting('antiLinks')} />
          <SwitchRow label="Welcome-повідомлення" enabled={settings.welcome} onClick={() => toggleSetting('welcome')} />
          <SwitchRow label="Нічний режим" enabled={settings.nightMode} onClick={() => toggleSetting('nightMode')} />
          <SwitchRow label="Автовидалення токсичності" enabled={settings.autoDelete} onClick={() => toggleSetting('autoDelete')} />
        </div>
      </section>
    </div>
  );
}

function DangerPanel({
  channel,
  deleteConfirm,
  setDeleteConfirm,
}: {
  channel: Channel;
  deleteConfirm: string;
  setDeleteConfirm: React.Dispatch<React.SetStateAction<string>>;
}) {
  const canDelete = deleteConfirm === channel.handle;

  return (
    <section className="rounded-[2rem] border border-rose-400/20 bg-rose-500/[0.06] p-5 backdrop-blur-2xl">
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-3xl bg-rose-400 text-black">
            <Trash2 className="h-7 w-7" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-100/70">Danger zone</p>
          <h2 className="mt-2 text-3xl font-black">Видалити Telegram-канал з панелі</h2>
          <p className="mt-4 max-w-2xl leading-8 text-white/65">
            Тут має бути фінальна дія: відключити бота, прибрати webhook, очистити налаштування й видалити канал
            з панелі. Для безпеки кнопка активується тільки після підтвердження.
          </p>
        </div>
        <div className="rounded-[1.7rem] border border-rose-300/20 bg-black/25 p-5">
          <p className="font-black text-rose-100">Підтвердження</p>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Введи <span className="font-black text-white">{channel.handle}</span>, щоб активувати видалення.
          </p>
          <input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-rose-200/70"
            placeholder={channel.handle}
          />
          <button
            disabled={!canDelete}
            className={`mt-4 w-full rounded-2xl px-5 py-4 font-black transition ${
              canDelete ? 'bg-rose-400 text-black hover:bg-rose-300' : 'cursor-not-allowed bg-white/10 text-white/30'
            }`}
          >
            Видалити канал
          </button>
        </div>
      </div>
    </section>
  );
}

function BackgroundGlow() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-400/20 blur-[150px]" />
      <div className="absolute -left-24 top-36 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-[120px]" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-lime-400/15 blur-[140px]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
    </div>
  );
}

function ChannelBadge({ channel, size = 'default' }: { channel: Channel; size?: 'default' | 'large' }) {
  return (
    <div className={`rounded-[2rem] border border-white/10 bg-black/20 ${size === 'large' ? 'p-5' : 'p-4'}`}>
      <ChannelAvatar channel={channel} />
      <h2 className="mt-4 text-2xl font-black">{channel.name}</h2>
      <p className="mt-1 text-sm text-white/45">{channel.handle}</p>
      <div className="mt-4 flex items-center gap-2 text-sm font-bold text-emerald-100">
        <CheckCircle2 className="h-4 w-4" />
        Бот має права адміністратора
      </div>
    </div>
  );
}

function ChannelAvatar({ channel }: { channel: Channel }) {
  return (
    <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${channel.theme} font-black text-black shadow-xl`}>
      {channel.avatar}
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  danger = false,
  onClick,
}: {
  active: boolean;
  icon: React.ReactElement;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-bold transition ${
        active
          ? danger
            ? 'bg-rose-400/15 text-rose-100'
            : 'bg-cyan-300 text-black'
          : danger
            ? 'text-rose-200/70 hover:bg-rose-400/10 hover:text-rose-100'
            : 'text-white/55 hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      {React.cloneElement(icon, { className: 'h-5 w-5' })}
      {label}
    </button>
  );
}

function MobileTab({ active, label, danger = false, onClick }: { active: boolean; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
        active ? (danger ? 'bg-rose-400 text-black' : 'bg-cyan-300 text-black') : 'border border-white/10 bg-white/[0.05] text-white/65'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactElement; label: string; value: string; accent: string }) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
      <div className={`${accent} mb-4`}>{React.cloneElement(icon, { className: 'h-6 w-6' })}</div>
      <p className="text-sm text-white/45">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </article>
  );
}

function ActivityCard({ title, value, text, danger = false }: { title: string; value: string; text: string; danger?: boolean }) {
  return (
    <article className={`rounded-3xl border p-4 ${danger ? 'border-rose-300/20 bg-rose-400/10' : 'border-white/10 bg-white/[0.05]'}`}>
      <p className="text-sm text-white/45">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm text-white/45">{text}</p>
    </article>
  );
}

function ActionButton({ icon, title, text, danger = false }: { icon: React.ReactElement; title: string; text: string; danger?: boolean }) {
  return (
    <button className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${danger ? 'border-rose-300/20 bg-rose-400/10' : 'border-white/10 bg-white/[0.05] hover:bg-white/[0.08]'}`}>
      <div className={`mb-4 grid h-11 w-11 place-items-center rounded-2xl ${danger ? 'bg-rose-400 text-black' : 'bg-white text-black'}`}>
        {React.cloneElement(icon, { className: 'h-5 w-5' })}
      </div>
      <p className="font-black">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/50">{text}</p>
    </button>
  );
}

function ChatBubble({ message, compact = false }: { message: ChatMessage; compact?: boolean }) {
  const statusClass = {
    ok: 'bg-emerald-300/15 text-emerald-100',
    watch: 'bg-amber-300/15 text-amber-100',
    danger: 'bg-rose-400/15 text-rose-100',
  }[message.status];

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-sm font-black text-black">
          {message.author.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">{message.author}</p>
            <p className="text-sm text-white/40">{message.tag}</p>
            <span className={`rounded-full px-2 py-1 text-xs font-black ${statusClass}`}>{message.status}</span>
            <span className="text-xs text-white/35">{message.time}</span>
          </div>
          <p className={`mt-2 text-white/70 ${compact ? 'line-clamp-2 text-sm leading-6' : 'leading-7'}`}>{message.text}</p>
        </div>
      </div>
    </article>
  );
}

function ModerationButton({ icon, title, danger = false }: { icon: React.ReactElement; title: string; danger?: boolean }) {
  return (
    <button className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left font-bold transition ${danger ? 'border-rose-300/20 bg-rose-400/10 text-rose-100' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
      {React.cloneElement(icon, { className: 'h-5 w-5' })}
      {title}
    </button>
  );
}

function SmallAction({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <button className={`rounded-full px-4 py-2 text-sm font-black transition ${danger ? 'bg-rose-400 text-black hover:bg-rose-300' : 'border border-white/10 bg-white/[0.06] hover:bg-white/10'}`}>
      {label}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-white/55">{label}</span>
      <input
        defaultValue={value}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition focus:border-cyan-200/60"
      />
    </label>
  );
}

function SwitchRow({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <span className="font-bold">{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${enabled ? 'bg-cyan-300' : 'bg-white/15'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full transition ${enabled ? 'left-6 bg-black' : 'left-1 bg-white'}`} />
      </span>
    </button>
  );
}

export default TelegramDashboard;
