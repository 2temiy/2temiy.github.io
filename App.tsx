import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  ChevronRight,
  Clock3,
  Crosshair,
  Eye,
  Flame,
  Gamepad2,
  Play,
  Radar,
  Shield,
  Sparkles,
  Swords,
  UploadCloud,
  Users,
  Zap,
} from 'lucide-react';

type PlayerRole = 'entry' | 'awp' | 'clutch' | 'igl';

const roles: Array<{
  id: PlayerRole;
  title: string;
  label: string;
  accent: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'entry',
    title: 'Entry',
    label: 'Вриваюсь першим і відкриваю сайт',
    accent: 'from-orange-400 to-red-500',
    icon: <Zap className="h-5 w-5" />,
  },
  {
    id: 'awp',
    title: 'AWP',
    label: 'Ловлю піки, сейвлю раунди, роблю мінус два',
    accent: 'from-sky-300 to-cyan-500',
    icon: <Crosshair className="h-5 w-5" />,
  },
  {
    id: 'clutch',
    title: 'Clutch',
    label: '1vX — мій улюблений режим',
    accent: 'from-fuchsia-400 to-purple-600',
    icon: <Flame className="h-5 w-5" />,
  },
  {
    id: 'igl',
    title: 'IGL',
    label: 'Читаю карту й бачу муви суперника',
    accent: 'from-lime-300 to-emerald-500',
    icon: <Radar className="h-5 w-5" />,
  },
];

const demoTimeline = [
  { time: '00:42', event: 'Пістолетка', detail: '2 HS через смок на Mirage A' },
  { time: '04:18', event: 'Ретейк', detail: 'Синхрон з тіммейтом + деф' },
  { time: '09:31', event: 'Clutch 1v3', detail: 'AI знайшов кращий ракурс від ворога' },
  { time: '15:06', event: 'Еко-брейк', detail: 'Момент для TikTok/Reels за 12 секунд' },
];

const features = [
  {
    icon: <Eye className="h-5 w-5" />,
    title: 'Твій POV',
    text: 'Сайт збирає твої фраги, клатчі, ретейки й моменти, де ти реально виглядаєш як хайтаб.',
  },
  {
    icon: <Swords className="h-5 w-5" />,
    title: 'POV противника',
    text: 'Показує, як твій пік, префаєр або розводка виглядали очима суперника.',
  },
  {
    icon: <Bot className="h-5 w-5" />,
    title: 'AI-монтаж',
    text: 'Автоматично ріже демку, синхронить камери, додає темп і підбирає найсмачніші раунди.',
  },
];

function App() {
  const [selectedRole, setSelectedRole] = useState<PlayerRole>('entry');
  const activeRole = useMemo(
    () => roles.find((role) => role.id === selectedRole) ?? roles[0],
    [selectedRole],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#07080d] text-white selection:bg-lime-300/30">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-lime-400/20 blur-[150px]" />
        <div className="absolute -left-24 top-36 h-80 w-80 rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-lime-300 text-black shadow-lg shadow-lime-300/30">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-lime-200">DemoCut AI</p>
              <p className="text-xs text-white/45">CS2 highlights from both sides</p>
            </div>
          </div>
          <a
            href="#upload"
            className="hidden rounded-full bg-white px-5 py-2 text-sm font-extrabold text-black transition hover:bg-lime-200 sm:inline-flex"
          >
            Завантажити демку
          </a>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-sm font-bold text-lime-100">
              <Sparkles className="h-4 w-4" />
              Спочатку обери, хто ти у демці
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
              Дай сайту демку CS2 —
              <span className="block bg-gradient-to-r from-lime-200 via-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">
                забери хайлайти як кіберспортсмен
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Завантажуєш .dem, вибираєш свій нік і роль, а AI знаходить моменти від твого лиця та
              очима противника. Без душного монтажу — тільки фраги, темп і готові кліпи.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`group rounded-3xl border p-4 text-left transition ${
                    selectedRole === role.id
                      ? 'border-lime-300/70 bg-white/[0.09] shadow-2xl shadow-lime-300/10'
                      : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${role.accent} text-black`}>
                      {role.icon}
                    </div>
                    <div>
                      <p className="text-lg font-black">{role.title}</p>
                      <p className="text-sm text-white/50">{role.label}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#upload"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-lime-300 px-7 py-4 text-base font-black text-black shadow-xl shadow-lime-300/25 transition hover:-translate-y-0.5 hover:bg-lime-200"
              >
                Спробувати демо
                <ChevronRight className="h-5 w-5" />
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-base font-bold text-white transition hover:bg-white/[0.08]"
              >
                Як це працює
              </a>
            </div>
          </div>

          <div id="upload" className="relative">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-lime-300/20 via-cyan-400/10 to-fuchsia-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#10121c]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-white/35">Match analyzer</p>
                    <h2 className="mt-1 text-2xl font-black">mirage_premier_13-11.dem</h2>
                  </div>
                  <div className="rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-xs font-black text-lime-200">
                    87% ready
                  </div>
                </div>

                <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                  <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white text-black">
                      <UploadCloud className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="text-xl font-black">Кинь сюди свою демку</p>
                      <p className="mt-1 text-sm text-white/45">CS2 .dem · Faceit · Premier · MM</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl bg-white/[0.06] p-4">
                    <Users className="mb-3 h-5 w-5 text-cyan-200" />
                    <p className="text-sm text-white/45">Обраний стиль</p>
                    <p className="font-black">{activeRole.title}</p>
                  </div>
                  <div className="rounded-3xl bg-white/[0.06] p-4">
                    <Clock3 className="mb-3 h-5 w-5 text-lime-200" />
                    <p className="text-sm text-white/45">Монтаж</p>
                    <p className="font-black">~90 сек</p>
                  </div>
                  <div className="rounded-3xl bg-white/[0.06] p-4">
                    <Shield className="mb-3 h-5 w-5 text-fuchsia-200" />
                    <p className="text-sm text-white/45">POV</p>
                    <p className="font-black">Ти + ворог</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {demoTimeline.map((item, index) => (
                    <div key={item.time} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black">{item.event}</span>
                          <span className="rounded-full bg-lime-300/15 px-2 py-0.5 text-xs font-bold text-lime-100">
                            {item.time}
                          </span>
                        </div>
                        <p className="truncate text-sm text-white/45">{item.detail}</p>
                      </div>
                      <Play className="h-4 w-4 text-white/40" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="relative mx-auto grid max-w-7xl gap-5 px-5 pb-16 sm:px-8 lg:grid-cols-3 lg:px-10">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white text-black">{feature.icon}</div>
            <h3 className="text-2xl font-black">{feature.title}</h3>
            <p className="mt-3 leading-7 text-white/55">{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="relative mx-auto max-w-7xl px-5 pb-10 sm:px-8 lg:px-10">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-r from-lime-300 via-cyan-200 to-fuchsia-300 p-1">
          <div className="flex flex-col gap-5 rounded-[1.8rem] bg-[#080910] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-black text-lime-200">
                <BadgeCheck className="h-4 w-4" />
                Готово для кліпів
              </div>
              <h2 className="text-3xl font-black">Отримай pack: твій POV, enemy POV, TikTok cut і full round.</h2>
            </div>
            <button className="rounded-full bg-white px-6 py-4 font-black text-black transition hover:bg-lime-100">
              Створити хайлайти
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
