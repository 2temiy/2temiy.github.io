import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  BadgeCheck,
  Ban,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  Code2,
  Command,
  Crown,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Flame,
  Gauge,
  Gem,
  Globe2,
  Inbox,
  Languages,
  LayoutDashboard,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  MonitorCog,
  Palette,
  PieChart,
  PlugZap,
  Radio,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Swords,
  TerminalSquare,
  TimerReset,
  UserCog,
  UserPlus,
  Users,
  VolumeX,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type TabId =
  | 'overview'
  | 'safety'
  | 'members'
  | 'staff'
  | 'feed'
  | 'broadcast'
  | 'automation'
  | 'ai'
  | 'clans'
  | 'reports'
  | 'settings'
  | 'system';

type Tone = 'lime' | 'cyan' | 'violet' | 'amber' | 'rose' | 'blue' | 'slate';

interface NavTab {
  id: TabId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  count?: string;
}

interface FeatureCard {
  title: string;
  text: string;
  icon: LucideIcon;
  tone: Tone;
  chips: string[];
}

interface MemberRow {
  name: string;
  handle: string;
  role: string;
  warns: number;
  rep: number;
  status: 'online' | 'muted' | 'risk' | 'trusted';
}

const toneClasses: Record<Tone, { card: string; icon: string; text: string; pill: string; glow: string }> = {
  lime: {
    card: 'border-lime-300/25 bg-lime-300/10',
    icon: 'bg-lime-300 text-black',
    text: 'text-lime-200',
    pill: 'bg-lime-300/15 text-lime-100 ring-lime-300/25',
    glow: 'shadow-lime-300/20',
  },
  cyan: {
    card: 'border-cyan-300/25 bg-cyan-300/10',
    icon: 'bg-cyan-300 text-black',
    text: 'text-cyan-200',
    pill: 'bg-cyan-300/15 text-cyan-100 ring-cyan-300/25',
    glow: 'shadow-cyan-300/20',
  },
  violet: {
    card: 'border-fuchsia-300/25 bg-fuchsia-300/10',
    icon: 'bg-fuchsia-300 text-black',
    text: 'text-fuchsia-200',
    pill: 'bg-fuchsia-300/15 text-fuchsia-100 ring-fuchsia-300/25',
    glow: 'shadow-fuchsia-300/20',
  },
  amber: {
    card: 'border-amber-300/25 bg-amber-300/10',
    icon: 'bg-amber-300 text-black',
    text: 'text-amber-200',
    pill: 'bg-amber-300/15 text-amber-100 ring-amber-300/25',
    glow: 'shadow-amber-300/20',
  },
  rose: {
    card: 'border-rose-300/25 bg-rose-300/10',
    icon: 'bg-rose-300 text-black',
    text: 'text-rose-200',
    pill: 'bg-rose-300/15 text-rose-100 ring-rose-300/25',
    glow: 'shadow-rose-300/20',
  },
  blue: {
    card: 'border-blue-300/25 bg-blue-300/10',
    icon: 'bg-blue-300 text-black',
    text: 'text-blue-200',
    pill: 'bg-blue-300/15 text-blue-100 ring-blue-300/25',
    glow: 'shadow-blue-300/20',
  },
  slate: {
    card: 'border-white/10 bg-white/[0.055]',
    icon: 'bg-white text-black',
    text: 'text-white/70',
    pill: 'bg-white/10 text-white/70 ring-white/10',
    glow: 'shadow-white/10',
  },
};

const tabs: NavTab[] = [
  { id: 'overview', title: 'Пульт', subtitle: 'живий стан', icon: LayoutDashboard },
  { id: 'safety', title: 'Захист', subtitle: 'антиспам + ризики', icon: ShieldAlert, count: '12' },
  { id: 'members', title: 'Учасники', subtitle: 'пошук + bulk', icon: Users, count: '4.8k' },
  { id: 'staff', title: 'Стафф', subtitle: 'ранги + права', icon: UserCog },
  { id: 'feed', title: 'Стрічка', subtitle: 'чат у реальному часі', icon: MessageSquareText },
  { id: 'broadcast', title: 'Розсилки', subtitle: 'пости + A/B', icon: Megaphone },
  { id: 'automation', title: 'Автофлоу', subtitle: 'тригери + сценарії', icon: WandSparkles, count: '9' },
  { id: 'ai', title: 'AI-модератор', subtitle: 'тон + токсичність', icon: Brain },
  { id: 'clans', title: 'Клани', subtitle: 'івенти + війни', icon: Swords },
  { id: 'reports', title: 'Звіти', subtitle: 'експорт + графіки', icon: PieChart },
  { id: 'settings', title: 'Налаштування', subtitle: 'правила + бренд', icon: Settings },
  { id: 'system', title: 'Система', subtitle: 'D1 + webhooks', icon: MonitorCog },
];

const quickActions = [
  { title: 'Тихий режим', text: 'замутити нових + закрити медіа', icon: VolumeX, tone: 'rose' as Tone },
  { title: 'Рейд-щит', text: 'капча, ліміти, анти-лінки на максимум', icon: Shield, tone: 'lime' as Tone },
  { title: 'Оголошення', text: 'пост у всі чати з preview', icon: Send, tone: 'cyan' as Tone },
  { title: 'Бекап', text: 'експорт D1, логів і налаштувань', icon: Download, tone: 'violet' as Tone },
];

const stats = [
  { label: 'Активні чати', value: '128', trend: '+14 за тиждень', icon: Globe2, tone: 'lime' as Tone },
  { label: 'Повідомлень сьогодні', value: '84.6k', trend: 'пік о 20:00', icon: MessageCircle, tone: 'cyan' as Tone },
  { label: 'Авто-дій', value: '2 941', trend: '91% без ручного втручання', icon: Zap, tone: 'violet' as Tone },
  { label: 'Ризик зараз', value: 'низький', trend: '3 інциденти на review', icon: ShieldCheck, tone: 'amber' as Tone },
];

const safetyModules: FeatureCard[] = [
  { title: 'Антимат 2.0', text: 'Стоп-слова, fuzzy-match, винятки, авто-delete і whitelist довірених.', icon: Ban, tone: 'rose', chips: ['fuzzy', 'white-list', 'лог'] },
  { title: 'Анти-лінки', text: 'Дозволені домени, UTM-clean, бан коротких URL і попередній ризик.', icon: Lock, tone: 'amber', chips: ['домени', 'short URL', 'preview'] },
  { title: 'Анти-флуд', text: 'Ліміти на секунди, burst-режим, caps-lock, emoji-spam і copy-paste хвилі.', icon: TimerReset, tone: 'cyan', chips: ['burst', 'caps', 'emoji'] },
  { title: 'NSFW guard', text: 'Перевірка медіа через AI, quarantine-черга й ручне підтвердження стаффом.', icon: Eye, tone: 'violet', chips: ['AI', 'media', 'queue'] },
  { title: 'Trust score', text: 'Рейтинг довіри за віком акаунта, історією, репою, варнами й активністю.', icon: Star, tone: 'lime', chips: ['score', 'репа', 'історія'] },
  { title: 'Appeals center', text: 'Користувач може оскаржити мут/бан, а стафф бачить повний контекст.', icon: FileText, tone: 'blue', chips: ['appeal', 'evidence', 'status'] },
];

const automationFlows: FeatureCard[] = [
  { title: 'Анти-рейд автопілот', text: 'Бачить хвилю нових акаунтів, вмикає капчу, ліміти, slow-mode і пише стаффу.', icon: ShieldAlert, tone: 'rose', chips: ['капча', 'slow-mode', 'alert'] },
  { title: 'Розумні покарання', text: 'Варн → мут → бан із різними правилами для мату, лінків, флуду, NSFW і токсичності.', icon: ClipboardCheck, tone: 'amber', chips: ['ескалації', 'таймери', 'причини'] },
  { title: 'Welcome funnel', text: 'Новачок отримує правила, кнопки ролей, квест першого повідомлення і бонус репутації.', icon: UserPlus, tone: 'lime', chips: ['ролі', 'квести', 'онбординг'] },
  { title: 'Контент-план', text: 'Пости за розкладом, A/B заголовки, автоповтори й відкладені конкурси в один клік.', icon: CalendarClock, tone: 'cyan', chips: ['розклад', 'A/B', 'конкурси'] },
  { title: 'AI-помічник стаффа', text: 'Підсумовує конфлікти, пропонує рішення, генерує відповідь і пояснює історію.', icon: Bot, tone: 'violet', chips: ['summary', 'tone', 'verdict'] },
  { title: 'Аналітика настрою', text: 'Трек токсичності, вайбу, тем, скарг і моментів, де треба втрутитись людині.', icon: Activity, tone: 'blue', chips: ['sentiment', 'теми', 'скарги'] },
];

const members: MemberRow[] = [
  { name: 'temiy.exe', handle: '@2temiy', role: 'Овнер', warns: 0, rep: 984, status: 'online' },
  { name: 'Mira Flow', handle: '@miraflow', role: 'Ст. адмін', warns: 1, rep: 551, status: 'trusted' },
  { name: 'toxic_guest', handle: '@guest404', role: 'Учасник', warns: 4, rep: -32, status: 'risk' },
  { name: 'Muted Panda', handle: '@panda', role: 'Учасник', warns: 2, rep: 18, status: 'muted' },
];

const chart = [38, 52, 41, 70, 88, 64, 92, 76, 110, 142, 168, 190, 171, 155, 132, 118, 136, 174, 211, 244, 230, 184, 126, 74];

const rights = [
  ['Мл. модератор', 'warn, del, warns', '🟢'],
  ['Модератор', 'mute, kick, read-only log', '🔵'],
  ['Ст. модератор', 'ban, unban, appeals', '🟣'],
  ['Мл. адмін', 'words, trust, info, rules', '🟡'],
  ['Адмін', 'settings, broadcast, reports', '🟠'],
  ['Ст. адмін', 'rank, staff, automations', '🔴'],
  ['Овнер', 'system, danger zone, billing', '⭐'],
];

const aiCards: FeatureCard[] = [
  { title: 'AI verdict', text: 'Пояснює, чому дія спрацювала, і дає модератору 3 варіанти рішення.', icon: ClipboardCheck, tone: 'lime', chips: ['reason', 'evidence', 'next step'] },
  { title: 'Tone rewrite', text: 'Переписує сухі відповіді стаффа в нормальний людський тон без токсичності.', icon: Languages, tone: 'cyan', chips: ['UA', 'RU', 'EN'] },
  { title: 'Мем-фільтр', text: 'Відрізняє меми від реально токсичних повідомлень і зменшує false-positive.', icon: Flame, tone: 'amber', chips: ['context', 'meme', 'sarcasm'] },
  { title: 'Summary дня', text: 'Щовечора генерує дайджест: конфлікти, топ теми, ризики, герої дня.', icon: Sparkles, tone: 'violet', chips: ['digest', 'topics', 'wins'] },
];

const systemChecks: Array<{ title: string; value: string; icon: LucideIcon; tone: Tone }> = [
  { title: 'Webhook', value: '200 OK', icon: PlugZap, tone: 'lime' },
  { title: 'D1 database', value: 'fast', icon: Database, tone: 'cyan' },
  { title: 'KV cache', value: 'warm', icon: Cloud, tone: 'violet' },
  { title: 'Telegram API', value: '41 ms', icon: Radio, tone: 'amber' },
  { title: 'Worker routes', value: '18 active', icon: Code2, tone: 'blue' },
  { title: 'Error budget', value: '0.02%', icon: AlertTriangle, tone: 'rose' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [strictMode, setStrictMode] = useState(true);
  const [autoPilot, setAutoPilot] = useState(true);
  const [selectedChat, setSelectedChat] = useState('Shadow Hub UA');
  const [searchQuery, setSearchQuery] = useState('');
  const [broadcastTone, setBroadcastTone] = useState('молодіжно');

  const activeTabInfo = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? tabs[0], [activeTab]);
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => `${member.name} ${member.handle} ${member.role}`.toLowerCase().includes(query));
  }, [searchQuery]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#07080d] text-white selection:bg-lime-300/30">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-14rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-lime-300/15 blur-[150px]" />
        <div className="absolute -left-40 top-56 h-[32rem] w-[32rem] rounded-full bg-cyan-500/15 blur-[130px]" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-fuchsia-600/20 blur-[160px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[size:42px_42px] opacity-20" />
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <TopBar selectedChat={selectedChat} setSelectedChat={setSelectedChat} />

        <div className="grid flex-1 gap-4 py-5 lg:grid-cols-[290px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl">
            <div className="mb-3 rounded-[1.55rem] border border-lime-300/20 bg-lime-300/10 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-300 text-black shadow-lg shadow-lime-300/25">
                  <Command className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.22em] text-lime-100">BotPanel Max</p>
                  <p className="text-xs text-white/45">Cloudflare Workers + D1</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <StatusPill label="Webhook live" tone="lime" />
                <StatusPill label="AI online" tone="cyan" />
              </div>
            </div>

            <div className="space-y-1.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-lime-300/50 bg-white/[0.10] shadow-xl shadow-lime-300/10'
                        : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${active ? 'bg-lime-300 text-black' : 'bg-white/8 text-white/60 group-hover:text-white'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-black">{tab.title}</p>
                        {tab.count ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-white/60">{tab.count}</span> : null}
                      </div>
                      <p className="truncate text-xs text-white/40">{tab.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            <HeroPanel
              activeTabInfo={activeTabInfo}
              strictMode={strictMode}
              setStrictMode={setStrictMode}
              autoPilot={autoPilot}
              setAutoPilot={setAutoPilot}
            />
            <div className="mt-4">
              {activeTab === 'overview' && <Overview />}
              {activeTab === 'safety' && <Safety strictMode={strictMode} setStrictMode={setStrictMode} />}
              {activeTab === 'members' && <Members searchQuery={searchQuery} setSearchQuery={setSearchQuery} filteredMembers={filteredMembers} />}
              {activeTab === 'staff' && <Staff />}
              {activeTab === 'feed' && <Feed />}
              {activeTab === 'broadcast' && <Broadcast broadcastTone={broadcastTone} setBroadcastTone={setBroadcastTone} />}
              {activeTab === 'automation' && <Automation autoPilot={autoPilot} setAutoPilot={setAutoPilot} />}
              {activeTab === 'ai' && <AiPanel />}
              {activeTab === 'clans' && <Clans />}
              {activeTab === 'reports' && <Reports />}
              {activeTab === 'settings' && <SettingsPanel />}
              {activeTab === 'system' && <SystemPanel />}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function TopBar({
  selectedChat,
  setSelectedChat,
}: {
  selectedChat: string;
  setSelectedChat: (value: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black">
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">Панель управління модераційним ботом</h1>
            <span className="rounded-full bg-lime-300 px-2.5 py-1 text-xs font-black text-black">MAX EDITION</span>
          </div>
          <p className="text-sm text-white/45">Модерація, AI, аналітика, розсилки, клани, бекапи — усе в одному місці.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-[230px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <select
            value={selectedChat}
            onChange={(event) => setSelectedChat(event.target.value)}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-sm font-bold text-white outline-none transition focus:border-lime-300/60"
          >
            <option>Shadow Hub UA</option>
            <option>CS2 Kyiv Squad</option>
            <option>Memes Factory</option>
            <option>Канал анонсів</option>
          </select>
        </label>
        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 text-sm font-black text-black transition hover:bg-lime-200">
          <Rocket className="h-4 w-4" />
          Запустити рейд-щит
        </button>
      </div>
    </nav>
  );
}

function HeroPanel({
  activeTabInfo,
  strictMode,
  setStrictMode,
  autoPilot,
  setAutoPilot,
}: {
  activeTabInfo: NavTab;
  strictMode: boolean;
  setStrictMode: (value: boolean) => void;
  autoPilot: boolean;
  setAutoPilot: (value: boolean) => void;
}) {
  const Icon = activeTabInfo.icon;
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#10121c]/85 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl">
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1.5 text-sm font-bold text-lime-100">
            <Sparkles className="h-4 w-4" />
            Активний розділ: {activeTabInfo.title}
          </div>
          <h2 className="max-w-4xl text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl">
            Пульт, де модерація виглядає
            <span className="block bg-gradient-to-r from-lime-200 via-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">
              як продукт, а не таблиця з кнопками
            </span>
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/60">
            Live-дашборд, bulk-дії, AI-рішення, розсилки, автомації, клани, звіти,
            системний моніторинг і безпечна danger-zone — буквально максимум функцій.
          </p>
          <div className="mt-5 grid max-w-xl grid-cols-2 gap-2">
            <Toggle label="Strict-mode" enabled={strictMode} onClick={() => setStrictMode(!strictMode)} />
            <Toggle label="Autopilot" enabled={autoPilot} onClick={() => setAutoPilot(!autoPilot)} />
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-lime-300 to-cyan-300 text-black">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-white/35">Control center</p>
              <p className="text-xl font-black">Стан системи: стабільно</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Ping" value="41 ms" />
            <MiniMetric label="D1" value="99.9%" />
            <MiniMetric label="Queue" value="7" />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/45">
              <span>Навантаження за 24 години</span>
              <span>live</span>
            </div>
            <Chart />
          </div>
        </div>
      </div>
    </section>
  );
}

function Overview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title="Швидкі дії" icon={Zap} action="гарячі кнопки">
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <FeatureButton key={action.title} {...action} />
            ))}
          </div>
        </Panel>
        <Panel title="Live-журнал" icon={Radio} action="оновлено щойно">
          <Timeline />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Risk radar" icon={Gauge} action="AI score">
          <div className="flex items-center justify-center py-5">
            <div className="relative grid h-56 w-56 place-items-center rounded-full border border-lime-300/20 bg-lime-300/5">
              <div className="absolute inset-8 rounded-full border border-cyan-300/20" />
              <div className="absolute inset-16 rounded-full border border-fuchsia-300/20" />
              <div className="absolute left-1/2 top-1/2 h-1 w-24 origin-left -translate-y-1/2 rotate-[28deg] rounded-full bg-lime-300 shadow-lg shadow-lime-300/40" />
              <div className="text-center">
                <p className="text-5xl font-black text-lime-200">18</p>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/35">low risk</p>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Черга стаффа" icon={Inbox} action="6 задач">
          <QueueList />
        </Panel>
        <Panel title="Що додано" icon={BadgeCheck} action="до потолка">
          <div className="grid gap-2">
            {['12 великих розділів', '60+ видимих функцій', 'bulk-модерація', 'AI-центр', 'розсилки й автомації', 'звіти та healthcheck'].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-3 text-sm font-bold text-white/70">
                <CheckCircle2 className="h-4 w-4 text-lime-200" />
                {item}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Safety({ strictMode, setStrictMode }: { strictMode: boolean; setStrictMode: (value: boolean) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Рівень захисту" icon={ShieldAlert} action={strictMode ? 'строгий' : 'мʼякий'}>
          <div className="rounded-[1.5rem] border border-rose-300/20 bg-rose-300/10 p-4">
            <p className="text-sm text-white/55">Перемикає мат, лінки, флуд, медіа, капчу й trust-score одним тумблером.</p>
            <button onClick={() => setStrictMode(!strictMode)} className="mt-4 w-full rounded-2xl bg-white px-4 py-3 font-black text-black transition hover:bg-lime-100">
              {strictMode ? 'Зробити мʼякше' : 'Увімкнути strict-mode'}
            </button>
          </div>
        </Panel>
        <Panel title="Карантин" icon={Archive} action="14 обʼєктів">
          <div className="space-y-2">
            {['медіа на перевірці', 'підозрілі URL', 'нові акаунти', 'апеляції'].map((label, index) => (
              <ProgressRow key={label} label={label} value={[62, 38, 24, 12][index]} tone={['rose', 'amber', 'cyan', 'violet'][index] as Tone} />
            ))}
          </div>
        </Panel>
        <Panel title="Сейф-лісти" icon={Lock} action="whitelist">
          <div className="flex flex-wrap gap-2">
            {['youtube.com', 't.me/official', 'faceit.com', 'steamcommunity.com', '@trusted', 'mod-only'].map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-3 py-2 text-sm font-bold text-white/70 ring-1 ring-white/10">
                {tag}
              </span>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {safetyModules.map((feature) => (
          <FeatureCardView key={feature.title} feature={feature} />
        ))}
      </div>
    </div>
  );
}

function Members({
  searchQuery,
  setSearchQuery,
  filteredMembers,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filteredMembers: MemberRow[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel title="Учасники" icon={Users} action="пошук, сортування, bulk">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Пошук по імені, username або ролі"
              className="w-full rounded-2xl border border-white/10 bg-black/25 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none transition placeholder:text-white/30 focus:border-lime-300/50"
            />
          </label>
          <div className="flex gap-2">
            <SmallButton icon={Filter} label="Фільтр" />
            <SmallButton icon={Download} label="Експорт" />
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {['мут', 'розмут', 'кік', 'бан', 'ранг', 'довірити', 'скинути варни', 'написати'].map((action) => (
            <button key={action} className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-black text-white/65 transition hover:border-lime-300/40 hover:text-white">
              {action}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredMembers.map((member) => (
            <MemberItem key={member.handle} member={member} />
          ))}
        </div>
      </Panel>
      <Panel title="Профіль користувача" icon={UserCog} action="360°">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-lime-300 to-cyan-300 text-lg font-black text-black">TE</div>
            <div>
              <p className="text-xl font-black">temiy.exe</p>
              <p className="text-sm text-white/45">@2temiy · id 777000</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Варни" value="0" />
            <MiniMetric label="Репа" value="+984" />
            <MiniMetric label="Trust" value="99" />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {['історія повідомлень', 'модераційний лог', 'спільні клани', 'апеляції', 'нотатки стаффа'].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-3">
              <span className="text-sm font-bold text-white/65">{item}</span>
              <ChevronRight className="h-4 w-4 text-white/30" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Staff() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title="Матриця прав" icon={Crown} action="7 рівнів">
        <div className="space-y-2">
          {rights.map(([role, permissions, icon], index) => (
            <div key={role} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
              <div className="font-black">{icon} {role}</div>
              <div className="text-sm text-white/50">{permissions}</div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/50">lvl {index + 1}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Стафф health" icon={Activity} action="пульс команди">
        <div className="space-y-3">
          <ProgressRow label="швидкість реакції" value={86} tone="lime" />
          <ProgressRow label="закриті апеляції" value={72} tone="cyan" />
          <ProgressRow label="чергові онлайн" value={58} tone="violet" />
          <ProgressRow label="помилки модерації" value={12} tone="rose" />
        </div>
      </Panel>
    </div>
  );
}

function Feed() {
  const messages = [
    ['temiy.exe', 'оновив правила, тепер посилання тільки з whitelist', '13:13', 'system'],
    ['Mira Flow', 'забрала апеляцію #184, очікую докази', '13:09', 'mod'],
    ['toxic_guest', 'та це просто мем був...', '13:04', 'risk'],
    ['BotPanel', 'авто-мут на 30 хв: invite-spam', '13:02', 'bot'],
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title="Live-стрічка" icon={MessageSquareText} action="auto-refresh">
        <div className="space-y-3">
          {messages.map(([name, text, time, type]) => (
            <div key={`${name}-${time}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{name}</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">{text}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${type === 'risk' ? toneClasses.rose.pill : type === 'bot' ? toneClasses.lime.pill : toneClasses.slate.pill}`}>
                  {time}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['відповісти', 'редагувати', 'пін', 'видалити', 'до профілю'].map((action) => (
                  <button key={action} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/55 transition hover:text-white">
                    {action}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Композер" icon={Send} action="Markdown / HTML">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {['Markdown', 'HTML', 'без превʼю', 'тихий режим'].map((item) => (
              <span key={item} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/55">{item}</span>
            ))}
          </div>
          <div className="min-h-40 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/45">
            Напиши пост, відповідь, службове повідомлення або шаблон. AI може зробити текст коротшим, людянішим чи жорсткішим.
          </div>
          <button className="mt-3 w-full rounded-2xl bg-lime-300 px-4 py-3 font-black text-black transition hover:bg-lime-200">
            Надіслати в чат
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Broadcast({ broadcastTone, setBroadcastTone }: { broadcastTone: string; setBroadcastTone: (value: string) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel title="Розсилка нового рівня" icon={Megaphone} action="A/B + schedule">
        <div className="grid gap-3 lg:grid-cols-2">
          {['усі чати', 'тільки активні', 'за тегами', 'за мовою', 'канали', 'тестова група'].map((segment) => (
            <label key={segment} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <input type="checkbox" defaultChecked={['усі чати', 'тестова група'].includes(segment)} className="h-4 w-4 accent-lime-300" />
              <span className="text-sm font-bold text-white/70">{segment}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-lime-200" />
            <span className="text-sm font-black">Тон повідомлення</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {['молодіжно', 'офіційно', 'мемно', 'коротко'].map((tone) => (
              <button
                key={tone}
                onClick={() => setBroadcastTone(tone)}
                className={`rounded-2xl px-3 py-2 text-sm font-black transition ${broadcastTone === tone ? 'bg-lime-300 text-black' : 'bg-white/10 text-white/55 hover:text-white'}`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Перед відправкою" icon={ClipboardCheck} action="контроль">
        <div className="space-y-2">
          {[
            ['Preview у Telegram', 'перевірити форматування'],
            ['Анти-спам ліміт', 'розтягнути на 12 хвилин'],
            ['UTM-мітки', 'автоматично додати'],
            ['Звіт доставки', 'після завершення'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl bg-white/[0.04] p-3">
              <p className="font-black">{title}</p>
              <p className="text-sm text-white/45">{text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Automation({ autoPilot, setAutoPilot }: { autoPilot: boolean; setAutoPilot: (value: boolean) => void }) {
  return (
    <Panel title="Автопілот" icon={WandSparkles} action={autoPilot ? 'увімкнено' : 'пауза'}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {automationFlows.map((feature) => (
            <FeatureCardView key={feature.title} feature={feature} />
          ))}
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
          <p className="text-lg font-black">Конструктор правил</p>
          <p className="mt-2 text-sm leading-6 text-white/50">IF користувач новий + кидає URL → delete → captcha → alert staff → note in profile.</p>
          <button onClick={() => setAutoPilot(!autoPilot)} className="mt-4 w-full rounded-2xl bg-white px-4 py-3 font-black text-black transition hover:bg-lime-100">
            {autoPilot ? 'Поставити на паузу' : 'Увімкнути автопілот'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function AiPanel() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {aiCards.map((feature) => (
          <FeatureCardView key={feature.title} feature={feature} />
        ))}
      </div>
      <Panel title="AI cockpit" icon={Brain} action="moderation brain">
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-fuchsia-100">
              <Sparkles className="h-4 w-4" />
              Приклад AI-рішення
            </div>
            <p className="text-xl font-black">Ймовірний invite-spam, але без токсичності.</p>
            <p className="mt-2 leading-7 text-white/55">Рекомендація: видалити повідомлення, дати короткий варн, не мутити користувача через нормальну історію активності.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['видалити', 'варн', 'ігнор', 'відправити на review'].map((action) => (
                <button key={action} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white/60 transition hover:bg-lime-300 hover:text-black">
                  {action}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <ProgressRow label="токсичність" value={21} tone="lime" />
            <ProgressRow label="спам-ризик" value={74} tone="amber" />
            <ProgressRow label="контекст мемів" value={88} tone="cyan" />
            <ProgressRow label="потрібна людина" value={37} tone="violet" />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Clans() {
  const clans = [
    ['NAVI Kids', 'NVK', 'відкритий', 984, 42],
    ['Dust Rats', 'RAT', 'закритий', 741, 33],
    ['Mirage Gods', 'MGD', 'івент', 690, 28],
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title="Клани та івенти" icon={Swords} action="економіка комʼюніті">
        <div className="space-y-3">
          {clans.map(([name, tag, state, rep, memberCount]) => (
            <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black">[{tag}] {name}</p>
                  <p className="text-sm text-white/45">{state} · {memberCount} учасників</p>
                </div>
                <span className="rounded-full bg-lime-300/15 px-3 py-1.5 text-sm font-black text-lime-100">★ {rep}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Гейміфікація" icon={Gem} action="утримання">
        <div className="grid gap-2">
          {['кланові війни', 'щоденні квести', 'магазин ролей', 'бейджі активності', 'сезонний рейтинг', 'турнірні сітки'].map((item) => (
            <div key={item} className="rounded-2xl bg-white/[0.04] p-3 text-sm font-bold text-white/65">
              {item}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Reports() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Аналітика" icon={PieChart} action="дашборди">
        <div className="space-y-3">
          <ProgressRow label="активність" value={82} tone="lime" />
          <ProgressRow label="утримання" value={68} tone="cyan" />
          <ProgressRow label="модераційне навантаження" value={54} tone="violet" />
          <ProgressRow label="ризик токсичності" value={18} tone="rose" />
        </div>
      </Panel>
      <Panel title="Експорти" icon={Download} action="JSON / CSV">
        <div className="grid gap-2">
          {['усі дані чату', 'лог модерації', 'користувачі', 'варни', 'AI verdicts', 'налаштування'].map((item) => (
            <SmallButton key={item} icon={Archive} label={item} />
          ))}
        </div>
      </Panel>
      <Panel title="Звіти для овнера" icon={Mail} action="щодня">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
          <p className="text-lg font-black">Daily digest</p>
          <p className="mt-2 text-sm leading-6 text-white/50">О 22:00 бот надсилає короткий звіт: активність, ризики, топ модераторів, конфлікти та рекомендації.</p>
          <button className="mt-4 w-full rounded-2xl bg-lime-300 px-4 py-3 font-black text-black">Увімкнути</button>
        </div>
      </Panel>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Правила чату" icon={FileText} action="версії">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
            <p className="mb-3 text-sm font-black text-white/60">Редактор правил із шаблонами</p>
            <div className="min-h-36 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/45">
              1. Без спаму та токсичності. 2. Посилання тільки з whitelist. 3. Поважай стафф. 4. Апеляції через кнопку.
            </div>
          </div>
        </Panel>
        <Panel title="Бренд панелі" icon={Palette} action="людяний дизайн">
          <div className="grid gap-3 sm:grid-cols-2">
            {['тема neon dark', 'українська локалізація', 'короткі тексти', 'молодіжний tone-of-voice', 'кастомні бейджі', 'лого чату'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm font-bold text-white/65">{item}</div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Глобальні перемикачі" icon={SlidersHorizontal} action="one-click">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {['анти-мат', 'анти-лінки', 'анти-флуд', 'капча', 'welcome', 'AI verdict', 'лог-чат', 'апеляції'].map((label, index) => (
            <Toggle key={label} label={label} enabled={index !== 7} onClick={() => undefined} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SystemPanel() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title="Системний моніторинг" icon={MonitorCog} action="Cloudflare">
        <div className="grid gap-3 md:grid-cols-2">
          {systemChecks.map(({ title, value, icon: Icon, tone }) => (
            <div key={title} className={`rounded-2xl border p-4 ${toneClasses[tone].card}`}>
              <Icon className={`mb-3 h-5 w-5 ${toneClasses[tone].text}`} />
              <p className="font-black">{title}</p>
              <p className="text-sm text-white/50">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Dev tools" icon={TerminalSquare} action="admin-only">
        <div className="space-y-2">
          {[
            ['/setup', 'перевстановити webhook'],
            ['schema check', 'перевірити D1 таблиці'],
            ['dry-run broadcast', 'тест без відправки'],
            ['seed demo data', 'демо для панелі'],
            ['rollback config', 'відкотити налаштування'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl bg-white/[0.04] p-3">
              <p className="font-black">{title}</p>
              <p className="text-sm text-white/45">{text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, trend, icon: Icon, tone }: { label: string; value: string; trend: string; icon: LucideIcon; tone: Tone }) {
  const classes = toneClasses[tone];
  return (
    <article className={`rounded-[1.7rem] border p-4 shadow-xl ${classes.card} ${classes.glow}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white/45">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
        </div>
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${classes.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={`mt-4 text-sm font-bold ${classes.text}`}>{trend}</p>
    </article>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-black">{title}</h3>
        </div>
        {action ? <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/45">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FeatureCardView({ feature }: { feature: FeatureCard }) {
  const Icon = feature.icon;
  const classes = toneClasses[feature.tone];
  return (
    <article className={`rounded-[1.7rem] border p-4 transition hover:-translate-y-0.5 ${classes.card}`}>
      <div className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl ${classes.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="text-lg font-black">{feature.title}</h4>
      <p className="mt-2 text-sm leading-6 text-white/55">{feature.text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {feature.chips.map((chip) => (
          <span key={chip} className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classes.pill}`}>
            {chip}
          </span>
        ))}
      </div>
    </article>
  );
}

function FeatureButton({ title, text, icon: Icon, tone }: { title: string; text: string; icon: LucideIcon; tone: Tone }) {
  const classes = toneClasses[tone];
  return (
    <button className={`group rounded-[1.45rem] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl ${classes.card} ${classes.glow}`}>
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-2xl ${classes.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-black">{title}</p>
          <p className="text-sm text-white/50">{text}</p>
        </div>
      </div>
    </button>
  );
}

function Toggle({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        enabled ? 'border-lime-300/35 bg-lime-300/12 text-lime-100' : 'border-white/10 bg-white/[0.04] text-white/50'
      }`}
    >
      <span className="text-sm font-black">{label}</span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition ${enabled ? 'bg-lime-300' : 'bg-white/20'}`}>
        <span className={`block h-4 w-4 rounded-full bg-black transition ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-center font-black ring-1 ${toneClasses[tone].pill}`}>
      {label}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.055] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/30">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function Chart() {
  const max = Math.max(...chart);
  return (
    <div className="flex h-24 items-end gap-1.5">
      {chart.map((value, index) => (
        <div
          key={`${value}-${index}`}
          className="flex-1 rounded-t-lg bg-gradient-to-t from-lime-300/35 to-cyan-200/80"
          style={{ height: `${Math.max(12, Math.round((value / max) * 96))}%` }}
          title={`${value} повідомлень`}
        />
      ))}
    </div>
  );
}

function Timeline() {
  const timeline = [
    ['13:02', 'Анти-рейд перевірив 41 нового', '3 акаунти відправлено на капчу, 0 false-positive', 'lime'],
    ['12:48', 'AI підсумував конфлікт', 'Сформовано короткий звіт для старших модераторів', 'violet'],
    ['12:21', 'Заблоковано invite-spam', '7 однакових посилань, авто-мут 30 хвилин', 'rose'],
    ['11:50', 'Розсилка доставлена', '121 чат, 98.4% доставлено, 2 помилки прав', 'cyan'],
  ];
  return (
    <div className="space-y-3">
      {timeline.map(([time, title, detail, tone]) => (
        <div key={`${time}-${title}`} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${toneClasses[tone as Tone].icon}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black">{title}</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-black text-white/40">{time}</span>
            </div>
            <p className="mt-1 text-sm text-white/50">{detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function QueueList() {
  return (
    <div className="space-y-2">
      {[
        ['Апеляція #184', 'потрібен старший модератор', 'amber'],
        ['3 нових слова', 'підтвердити в антиматі', 'rose'],
        ['Розсилка #22', 'чекає preview', 'cyan'],
        ['Кланова війна', 'підтвердити результат', 'violet'],
      ].map(([title, text, tone]) => (
        <div key={title} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
          <div className={`h-2.5 w-2.5 rounded-full ${toneClasses[tone as Tone].icon}`} />
          <div>
            <p className="font-black">{title}</p>
            <p className="text-sm text-white/45">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressRow({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-white/65">{label}</span>
        <span className={`font-black ${toneClasses[tone].text}`}>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${toneClasses[tone].icon}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SmallButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 text-sm font-black text-white/65 transition hover:border-lime-300/40 hover:text-white">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MemberItem({ member }: { member: MemberRow }) {
  const statusTone: Record<MemberRow['status'], Tone> = {
    online: 'lime',
    muted: 'blue',
    risk: 'rose',
    trusted: 'cyan',
  };
  const statusText: Record<MemberRow['status'], string> = {
    online: 'online',
    muted: 'muted',
    risk: 'risk',
    trusted: 'trusted',
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black">
          {member.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">{member.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${toneClasses[statusTone[member.status]].pill}`}>{statusText[member.status]}</span>
          </div>
          <p className="truncate text-sm text-white/45">{member.handle} · {member.role} · ⚠ {member.warns} · ★ {member.rep}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {['профіль', 'мут', 'ранг'].map((action) => (
          <button key={action} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/55 transition hover:text-white">
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
