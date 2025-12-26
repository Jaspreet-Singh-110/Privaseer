import { ShieldCheck, WifiOff } from 'lucide-react';
import type { StepContentProps } from './types';

export function ProtectionStep({ theme }: StepContentProps): JSX.Element {
  const isDark = theme === 'dark';
  const containerBg = isDark
    ? 'bg-gray-800 text-white border border-gray-700'
    : 'bg-white text-gray-900 shadow-lg border border-gray-200';
  const accentText = isDark ? 'text-blue-400' : 'text-blue-600';
  const secondaryText = isDark ? 'text-gray-300' : 'text-gray-700';
  const cardBorder = isDark ? 'border-gray-700' : 'border-gray-200';
  const cardBgPrimary = isDark ? 'bg-gray-700' : 'bg-gray-50';
  const cardBgSecondary = isDark ? 'bg-gray-800' : 'bg-white shadow';
  const chipText = isDark ? 'text-gray-400' : 'text-gray-600';
  const blockedText = isDark ? 'text-green-400' : 'text-green-600';

  return (
    <section className={`flex flex-col gap-6 rounded-3xl p-8 backdrop-blur ${containerBg}`}>
      <header className="space-y-2">
        <p className={`text-sm uppercase tracking-[0.3em] ${accentText}`}>Real-time protection</p>
        <h2 className="text-3xl font-semibold leading-snug">
          Firewall-grade blocking before trackers ever reach your browser.
        </h2>
        <p className={`text-base max-w-3xl ${secondaryText}`}>
          Privaseer pairs the Chrome Declarative Net Request API with adaptive risk scores. Every
          request is fingerprinted, categorized, and either blocked or allowed within milliseconds —
          even when service workers go to sleep.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <article className={`rounded-2xl border ${cardBorder} ${cardBgPrimary} p-5`}>
          <div className="mb-4 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-600'
              }`}
            >
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-[0.2em] ${chipText}`}>Protected Tabs</p>
              <p className="text-lg font-semibold">Live Firewall</p>
            </div>
          </div>
          <ul className={`space-y-2 text-sm ${secondaryText}`}>
            <li>• Debounced badge updates prevent flicker</li>
            <li>• Domain intelligence + threat taxonomy</li>
            <li>• High-risk trackers trigger severity alerts</li>
          </ul>
        </article>

        <article className={`rounded-2xl border ${cardBorder} ${cardBgSecondary} p-5`}>
          <p className={`text-xs uppercase tracking-[0.2em] ${chipText}`}>Live simulation</p>
          <div className="mt-4 space-y-3">
            {['analytics-beacon.js', 'fingerprint-pro.js', 'pixel-ads.js'].map((script) => (
              <div
                key={script}
                className={`flex items-center justify-between rounded-2xl border ${
                  isDark
                    ? 'border-white/10 bg-black/20 text-white/80'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                } px-4 py-3 text-sm font-mono`}
              >
                <span>{script}</span>
                <span className={`inline-flex items-center gap-1 ${blockedText}`}>
                  <WifiOff className="h-3.5 w-3.5" />
                  blocked
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

