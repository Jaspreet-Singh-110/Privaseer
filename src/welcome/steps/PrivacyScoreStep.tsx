import { Activity } from 'lucide-react';
import type { StepContentProps } from './types';

const sampleHistory = [
  { label: 'Mon', value: 74 },
  { label: 'Tue', value: 82 },
  { label: 'Wed', value: 88 },
  { label: 'Thu', value: 92 },
  { label: 'Fri', value: 90 },
];

export function PrivacyScoreStep({ theme }: StepContentProps): JSX.Element {
  const isDark = theme === 'dark';
  const sectionBackground = isDark
    ? 'border-gray-700 bg-gray-800 text-white'
    : 'border-gray-200 bg-white text-gray-900';
  const subtitle = isDark ? 'text-gray-400' : 'text-gray-600';
  const secondary = isDark ? 'text-gray-300' : 'text-gray-700';
  const panelBorder = isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white';
  const statsBorder = isDark
    ? 'border-gray-700 bg-gray-800 text-white'
    : 'border-gray-200 bg-gray-50 text-gray-900';

  return (
    <section
      className={`rounded-3xl border bg-gradient-to-br p-8 backdrop-blur ${sectionBackground}`}
    >
      <header className="space-y-3">
        <p className={`text-sm uppercase tracking-[0.3em] ${subtitle}`}>Privacy score</p>
        <h2 className="text-3xl font-semibold leading-tight">
          A single signal that combines trackers blocked, consent violations, and clean browsing
          streaks.
        </h2>
        <p className={`text-base max-w-3xl ${secondary}`}>
          Every interaction updates your score instantly. Transparent penalties & rewards make it
          obvious how to stay above 90 and unlock "Excellent" status.
        </p>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className={`flex flex-col gap-5 rounded-2xl border p-6 ${panelBorder}`}>
          <div className="flex items-baseline gap-3">
            <span className="text-6xl font-black">92</span>
            <span
              className={`text-lg uppercase tracking-[0.3em] ${
                isDark ? 'text-emerald-200' : 'text-emerald-600'
              }`}
            >
              Excellent
            </span>
          </div>
          <p className={`text-sm ${secondary}`}>
            +2 for clean day • -1 for tracker bursts • +4 for consent-safe browsing.
          </p>

          <div className="flex gap-2">
            {sampleHistory.map((entry) => (
              <div key={entry.label} className="flex-1 text-center">
                <div
                  className={`mb-2 h-28 rounded-full ${
                    isDark ? 'bg-white/10' : 'bg-slate-100 shadow-inner'
                  }`}
                >
                  <div
                    className={`mx-auto mt-auto h-full w-full rounded-full bg-gradient-to-t ${
                      isDark ? 'from-emerald-300 to-white' : 'from-emerald-500 to-sky-100'
                    }`}
                    style={{ height: `${entry.value}%` }}
                  />
                </div>
                <p className={`text-xs uppercase tracking-wide ${subtitle}`}>{entry.label}</p>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {entry.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border p-6 ${statsBorder}`}>
          <div
            className={`mb-4 flex items-center gap-2 text-sm uppercase tracking-[0.3em] ${subtitle}`}
          >
            <Activity className="h-4 w-4" />
            Live telemetry
          </div>
          <ul className={`space-y-4 text-sm ${secondary}`}>
            <li>
              <span className={isDark ? 'text-white' : 'text-slate-800'}>Trackers blocked</span>
              <span
                className={`float-right font-semibold ${
                  isDark ? 'text-emerald-300' : 'text-emerald-600'
                }`}
              >
                +37 today
              </span>
            </li>
            <li>
              <span className={isDark ? 'text-white' : 'text-slate-800'}>Clean sites visited</span>
              <span
                className={`float-right font-semibold ${
                  isDark ? 'text-emerald-300' : 'text-emerald-600'
                }`}
              >
                +5
              </span>
            </li>
            <li>
              <span className={isDark ? 'text-white' : 'text-slate-800'}>Consent violations</span>
              <span
                className={`float-right font-semibold ${
                  isDark ? 'text-amber-300' : 'text-amber-600'
                }`}
              >
                1 flagged
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

