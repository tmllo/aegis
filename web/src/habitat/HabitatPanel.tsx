import { useState } from "react";
import type { Anomaly, ChannelKey, HabitatData, Metrics } from "./types";
import { HONEST_FOOTER, STATUS_COLOR, anomalyTag, fmtDate, latestValue, leadTimeText } from "./logic";
import { Sparkline } from "./Sparkline";

interface Props { data: HabitatData; focusAnomalyId?: string | null }

/** The Habitat tab. Everything comes from habitat_telemetry.json. */
export function HabitatPanel({ data, focusAnomalyId = null }: Props) {
  const [days, setDays] = useState<number | "all">(14);
  const keys = Object.keys(data.channels) as ChannelKey[];
  const anomalies = [...data.anomalies].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const focus = anomalies.find((a) => a.id === focusAnomalyId) ?? null;

  return (
    <section className="flex flex-col gap-6 p-6 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Habitat watch</h2>
          <p className="text-slate-400">Life support is part of crew health: NASA's "hostile closed environment" hazard.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={data.status.overall} big />
          <div className="flex overflow-hidden rounded-lg border border-slate-700 text-sm">
            {([14, "all"] as const).map((v) => (
              <button key={String(v)} onClick={() => setDays(v)}
                      className={`px-3 py-1.5 ${days === v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
                {v === "all" ? "Full mission" : "Last 14 days"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {focus && <AnomalyCard a={focus} data={data} focused />}

      <div className="flex flex-col divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
        {keys.map((k) => {
          const ch = data.channels[k];
          const v = latestValue(data, k);
          return (
            <div key={k} className="grid grid-cols-[minmax(220px,1fr)_3fr] items-center gap-6 px-5 py-4">
              <div className="flex items-start gap-3">
                <StatusDot status={data.status.by_channel[k]} />
                <div>
                  <div className="text-lg font-medium">{ch.label}</div>
                  <div className="text-sm text-slate-400">{ch.subsystem}</div>
                  <div className="mt-1 font-mono text-2xl">
                    {v == null ? "—" : v.toFixed(k === "rh_pct" ? 0 : 2)}<span className="ml-1 text-base text-slate-400">{ch.unit}</span>
                  </div>
                </div>
              </div>
              <div>
                <Sparkline data={data} channel={k} days={days} highlightId={focusAnomalyId} />
                <p className="mt-1 text-sm text-slate-400">{ch.health_link}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Legend />

      <div className="grid gap-4 md:grid-cols-2">
        {anomalies.filter((a) => a.id !== focus?.id).map((a) => <AnomalyCard key={a.id} a={a} data={data} />)}
      </div>

      <ValidationCard data={data} />

      <footer className="text-sm text-slate-500">{HONEST_FOOTER} {data.meta.data_credit ? `· ${data.meta.data_credit}` : ""}</footer>
    </section>
  );
}

function StatusDot({ status, big = false }: { status: keyof typeof STATUS_COLOR; big?: boolean }) {
  const s = big ? 18 : 12;
  return <span aria-label={`status ${status}`} className="mt-1.5 inline-block shrink-0 rounded-full"
               style={{ width: s, height: s, background: STATUS_COLOR[status], boxShadow: `0 0 12px ${STATUS_COLOR[status]}88` }} />;
}

function AnomalyCard({ a, data, focused = false }: { a: Anomaly; data: HabitatData; focused?: boolean }) {
  const tag = anomalyTag(a);
  const lead = leadTimeText(a);
  const ch = data.channels[a.channel];
  return (
    <article className={`rounded-2xl border p-5 ${focused ? "border-sky-400/60 bg-sky-950/30" : "border-slate-800 bg-slate-900/60"}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full px-2.5 py-0.5 font-medium text-slate-950" style={{ background: tag.color }}>{tag.label}</span>
        <span className="rounded-full px-2.5 py-0.5 font-medium text-slate-950" style={{ background: STATUS_COLOR[a.severity] }}>{a.severity}</span>
        <span className="text-slate-400">{ch.label} · {a.status}</span>
      </div>
      <h3 className="mt-3 text-lg font-medium">{a.fault ?? "Unplanned anomaly"}</h3>
      <p className="mt-1 text-slate-300">{a.message}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-400">
        <dt>Started</dt><dd className="text-slate-200">{fmtDate(a.start)}</dd>
        <dt>Detected</dt><dd className="text-slate-200">{fmtDate(a.detected_at)}</dd>
        <dt>Limit crossed</dt><dd className="text-slate-200">{fmtDate(a.limit_crossed_at)}</dd>
      </dl>
      {lead && <p className="mt-2 text-sm font-medium text-slate-200">{lead}</p>}
      {a.linked_crew_flags.map((l) => (
        <p key={l.crew_id + l.metric} className="mt-2 rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-300">
          Possible environmental cause for crew {l.crew_id} ({l.metric}, {l.from} → {l.to}). {l.note}
        </p>
      ))}
      {a.detected && <p className="mt-3 text-sm"><span className="text-slate-400">Action: </span>{a.action}</p>}
    </article>
  );
}

function Legend() {
  const item = (el: JSX.Element, label: string) => <span className="flex items-center gap-2">{el}{label}</span>;
  return (
    <div className="flex flex-wrap gap-5 text-sm text-slate-400">
      {item(<span className="inline-block h-3 w-0.5 bg-sky-400" />, "Model detection")}
      {item(<span className="inline-block h-3 w-0.5 border-l-2 border-dashed border-amber-400" />, "Limit crossed")}
      {item(<span className="inline-block h-0 w-5 border-t-2 border-dashed border-amber-400" />, "Safety limit")}
      {item(<span className="inline-block h-2 w-5 bg-amber-500" />, "Anomaly score above amber")}
    </div>
  );
}

function ValidationCard({ data }: { data: HabitatData }) {
  const v = data.meta.validation;
  const m = v?.model, b = v?.baseline_static_3sigma;
  if (!v || !m || m.f0_5 == null) {
    return <div className="rounded-2xl border border-slate-800 p-5 text-slate-400">Detector validation on NASA SMAP/MSL: pending.</div>;
  }
  const row = (label: string, k: keyof Metrics, digits = 2) => (
    <tr key={k} className="border-t border-slate-800">
      <td className="py-1.5 text-slate-400">{label}</td>
      <td className="py-1.5 text-right font-mono text-lg">{m[k]?.toFixed(digits) ?? "—"}</td>
      <td className="py-1.5 text-right font-mono text-lg text-slate-400">{b?.[k]?.toFixed(digits) ?? "—"}</td>
    </tr>
  );
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-lg font-medium">Validated on real NASA spacecraft telemetry</h3>
      <p className="text-sm text-slate-400">{v.tuned_on && `Tuned on ${v.tuned_on}`}{v.tested_on && ` · tested once on ${v.tested_on}`}{v.protocol && ` · ${v.protocol}`}</p>
      <table className="mt-3 w-full max-w-lg text-sm">
        <thead><tr className="text-slate-500"><th className="text-left font-normal">Held-out test</th><th className="text-right font-normal">Our detector</th><th className="text-right font-normal">3σ rule</th></tr></thead>
        <tbody>
          {row("Precision", "precision")}
          {row("Recall", "recall")}
          {row("F0.5", "f0_5")}
          {row("False alarms / 10k steps", "false_alarms_per_10k_steps", 1)}
        </tbody>
      </table>
    </div>
  );
}
