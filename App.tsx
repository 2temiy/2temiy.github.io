import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  Film,
  Flame,
  Gamepad2,
  Play,
  Radar,
  RefreshCw,
  Scissors,
  Shield,
  Sparkles,
  Swords,
  UploadCloud,
  UserRound,
  Wand2,
  Zap,
} from 'lucide-react';

type PlayerRole = 'entry' | 'awp' | 'clutch' | 'igl';
type FlowStep = 'upload' | 'player' | 'moment' | 'result';
type MomentMode = 'auto' | 'pistol' | 'retake' | 'clutch' | 'eco';

type Role = {
  id: PlayerRole;
  title: string;
  label: string;
  accent: string;
  icon: React.ReactNode;
};

type DemoMoment = {
  id: MomentMode;
  time: string;
  event: string;
  detail: string;
  score: string;
};

const roles: Role[] = [
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

const demoMoments: DemoMoment[] = [
  { id: 'pistol', time: '00:42', event: 'Пістолетка', detail: '2 HS через смок на Mirage A', score: '92%' },
  { id: 'retake', time: '04:18', event: 'Ретейк', detail: 'Синхрон з тіммейтом + дефьюз', score: '88%' },
  { id: 'clutch', time: '09:31', event: 'Clutch 1v3', detail: 'AI знайшов кращий POV від ворога', score: '99%' },
  { id: 'eco', time: '15:06', event: 'Еко-брейк', detail: 'Момент для TikTok/Reels за 12 секунд', score: '84%' },
];

const autoHighlight = demoMoments[2];

const features = [
  {
    icon: <UploadCloud className="h-5 w-5" />,
    title: '1. Кидаєш demo',
    text: 'Обираєш `.dem` файл — сайт одразу показує назву, вагу та переходить до вибору гравця.',
  },
  {
    icon: <UserRound className="h-5 w-5" />,
    title: '2. Показуєш хто ти',
    text: 'Вписуєш свій нік або Steam ID, щоб хайлайт був саме від твого лиця.',
  },
  {
    icon: <Scissors className="h-5 w-5" />,
    title: '3. Обираєш момент',
    text: 'Ставиш авто або конкретний раунд — і сайт збирає ready-to-post highlight pack.',
  },
];

function App() {
  const [selectedRole, setSelectedRole] = useState<PlayerRole>('entry');
  const [currentStep, setCurrentStep] = useState<FlowStep>('upload');
  const [demoFile, setDemoFile] = useState<File | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [momentMode, setMomentMode] = useState<MomentMode>('auto');
  const [isGenerating, setIsGenerating] = useState(false);

  const activeRole = useMemo(
    () => roles.find((role) => role.id === selectedRole) ?? roles[0],
    [selectedRole],
  );

  const selectedMoment = useMemo(
    () => (momentMode === 'auto' ? autoHighlight : demoMoments.find((moment) => moment.id === momentMode) ?? autoHighlight),
    [momentMode],
  );

  const demoName = demoFile?.name ?? 'mirage_premier_13-11.dem';
  const demoSize = demoFile ? `${(demoFile.size / 1024 / 1024).toFixed(1)} MB` : 'demo file waiting';
  const canContinueToMoment = playerName.trim().length > 1;
  const progress = currentStep === 'upload' ? '25%' : currentStep === 'player' ? '55%' : currentStep === 'moment' ? '80%' : '100%';

  const handleDemoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDemoFile(file);
    setCurrentStep('player');
  };

  const generateHighlights = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setCurrentStep('result');
    }, 850);
  };

  const resetFlow = () => {
    setDemoFile(null);
    setPlayerName('');
    setMomentMode('auto');
    setSelectedRole('entry');
    setCurrentStep('upload');
    setIsGenerating(false);
  };

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
              <p className="text-xs text-white/45">CS2 demo → ready highlights</p>
            </div>
          </div>
          <a
            href="#app"
            className="hidden rounded-full bg-white px-5 py-2 text-sm font-extrabold text-black transition hover:bg-lime-200 sm:inline-flex"
          >
            Запустити демку
          </a>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-sm font-bold text-lime-100">
              <Sparkles className="h-4 w-4" />
              Не просто лендинг — робочий демо-flow
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
              Закинь demo CS2 —
              <span className="block bg-gradient-to-r from-lime-200 via-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">
                вибери себе й момент
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Сайт приймає `.dem`, питає хто ти, дає вибрати авто-хайлайт або конкретний момент,
              а потім збирає результат: твій POV, enemy POV, TikTok cut і full round.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-white text-black">{feature.icon}</div>
                  <h3 className="font-black">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">{feature.text}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#app"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-lime-300 px-7 py-4 text-base font-black text-black shadow-xl shadow-lime-300/25 transition hover:-translate-y-0.5 hover:bg-lime-200"
              >
                Почати
                <ChevronRight className="h-5 w-5" />
              </a>
              <a
                href="#result-preview"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-base font-bold text-white transition hover:bg-white/[0.08]"
              >
                Що буде в результаті
              </a>
            </div>
          </div>

          <div id="app" className="relative scroll-mt-8">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-lime-300/20 via-cyan-400/10 to-fuchsia-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#10121c]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-white/35">Highlight builder</p>
                    <h2 className="mt-1 text-2xl font-black">{demoName}</h2>
                    <p className="mt-1 text-sm text-white/45">{demoSize}</p>
                  </div>
                  <div className="rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-xs font-black text-lime-200">
                    {progress} ready
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-2">
                  {['upload', 'player', 'moment', 'result'].map((step, index) => (
                    <div key={step} className={`h-2 rounded-full ${index <= ['upload', 'player', 'moment', 'result'].indexOf(currentStep) ? 'bg-lime-300' : 'bg-white/10'}`} />
                  ))}
                </div>

                {currentStep === 'upload' && (
                  <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-3 py-10 text-center transition hover:scale-[1.01]">
                      <input className="sr-only" type="file" accept=".dem" onChange={handleDemoUpload} />
                      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white text-black">
                        <UploadCloud className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="text-xl font-black">Кинь сюди свою демку</p>
                        <p className="mt-1 text-sm text-white/45">або натисни, щоб вибрати `.dem` файл</p>
                      </div>
                    </label>
                  </div>
                )}

                {currentStep === 'player' && (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-3xl bg-white/[0.04] p-4">
                      <label className="text-sm font-black text-white/70" htmlFor="player-name">
                        Хто ти в цій демці?
                      </label>
                      <input
                        id="player-name"
                        value={playerName}
                        onChange={(event) => setPlayerName(event.target.value)}
                        placeholder="Наприклад: s1mple або Steam ID"
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-base font-bold text-white outline-none transition placeholder:text-white/25 focus:border-lime-300/70"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
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

                    <button
                      onClick={() => setCurrentStep('moment')}
                      disabled={!canContinueToMoment}
                      className="w-full rounded-full bg-lime-300 px-6 py-4 font-black text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                    >
                      Продовжити до моментів
                    </button>
                  </div>
                )}

                {currentStep === 'moment' && (
                  <div className="mt-5 space-y-4">
                    <button
                      onClick={() => setMomentMode('auto')}
                      className={`flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition ${
                        momentMode === 'auto' ? 'border-lime-300/70 bg-lime-300/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                      }`}
                    >
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-lime-300 text-black">
                        <Wand2 className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-black">Авто: найкращий момент</p>
                        <p className="text-sm text-white/45">AI вибере найсильніший highlight у демці</p>
                      </div>
                      {momentMode === 'auto' && <Check className="h-5 w-5 text-lime-200" />}
                    </button>

                    <div className="space-y-3">
                      {demoMoments.map((moment) => (
                        <button
                          key={moment.id}
                          onClick={() => setMomentMode(moment.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                            momentMode === moment.id ? 'border-cyan-200/70 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black">
                            {moment.time}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black">{moment.event}</span>
                              <span className="rounded-full bg-lime-300/15 px-2 py-0.5 text-xs font-bold text-lime-100">
                                {moment.score}
                              </span>
                            </div>
                            <p className="truncate text-sm text-white/45">{moment.detail}</p>
                          </div>
                          <Play className="h-4 w-4 text-white/40" />
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={generateHighlights}
                      disabled={isGenerating}
                      className="w-full rounded-full bg-lime-300 px-6 py-4 font-black text-black transition hover:bg-lime-200 disabled:cursor-wait disabled:bg-lime-300/60"
                    >
                      {isGenerating ? 'Генеруємо хайлайти...' : 'Зробити хайлайти'}
                    </button>
                  </div>
                )}

                {currentStep === 'result' && (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-3xl border border-lime-300/30 bg-lime-300/10 p-5">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-black">
                        <BadgeCheck className="h-4 w-4" />
                        Pack ready
                      </div>
                      <h3 className="text-2xl font-black">{playerName || 'Player'} · {activeRole.title} · {selectedMoment.event}</h3>
                      <p className="mt-2 text-white/60">Demo: {demoName} · момент: {momentMode === 'auto' ? 'авто-вибір' : selectedMoment.time}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-3xl bg-white/[0.06] p-4">
                        <Eye className="mb-3 h-5 w-5 text-cyan-200" />
                        <p className="text-sm text-white/45">Твій POV</p>
                        <p className="font-black">15 sec clip</p>
                      </div>
                      <div className="rounded-3xl bg-white/[0.06] p-4">
                        <Swords className="mb-3 h-5 w-5 text-fuchsia-200" />
                        <p className="text-sm text-white/45">Enemy POV</p>
                        <p className="font-black">12 sec clip</p>
                      </div>
                      <div className="rounded-3xl bg-white/[0.06] p-4">
                        <Film className="mb-3 h-5 w-5 text-lime-200" />
                        <p className="text-sm text-white/45">Auto edit</p>
                        <p className="font-black">TikTok + full round</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-4 font-black text-black transition hover:bg-lime-100">
                        <Download className="h-5 w-5" />
                        Скачать highlight pack
                      </button>
                      <button
                        onClick={resetFlow}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-4 font-black text-white transition hover:bg-white/[0.08]"
                      >
                        <RefreshCw className="h-5 w-5" />
                        Нова демка
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 pb-10 sm:px-8 lg:px-10">
        <div id="result-preview" className="scroll-mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-r from-lime-300 via-cyan-200 to-fuchsia-300 p-1">
          <div className="flex flex-col gap-5 rounded-[1.8rem] bg-[#080910] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-black text-lime-200">
                <Shield className="h-4 w-4" />
                В браузері вже можна пройти весь сценарій
              </div>
              <h2 className="text-3xl font-black">Upload → player → moment/auto → highlight result.</h2>
            </div>
            <a href="#app" className="rounded-full bg-white px-6 py-4 text-center font-black text-black transition hover:bg-lime-100">
              Запустити
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
