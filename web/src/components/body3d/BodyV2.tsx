import "./body3d.css";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { CrewData, Status } from "./types";
import { derive, SCENARIOS, worst, type Finding, type ScenarioKey } from "./derive";
import { FINDING_TARGET, LENSES, TARGETS, type Lens, type TargetId } from "./targets";
import { Body, CameraRig, Hotspots, Radiation, ViewShift, type Hotspot, type Layers } from "./BodyScene";
import { MicroView, OrganView } from "./Inspector";

const STATUS_WORD: Record<Status, string> = { green: "All normal", amber: "Watch", red: "Act now" };

function Icon({ s, size = 16 }: { s: Status; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="ico">
      {s === "green" && (<><circle cx="8" cy="8" r="7" fill="#0ca30c" /><path d="M4.5 8.2l2.3 2.3 4.7-4.8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>)}
      {s === "amber" && (<><path d="M8 1.5l7 12.5H1z" fill="#fab219" /><path d="M8 6v4" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="12" r="1" fill="#0b0b0b" /></>)}
      {s === "red" && (<><path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="#d03b3b" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></>)}
    </svg>
  );
}

export default function App({ dataUrl = "/data/crew_data.json" }: { dataUrl?: string }) {
  const [data, setData] = useState<CrewData | null>(null);
  const [ci, setCi] = useState(0);
  const [scenario, setScenario] = useState<ScenarioKey>("live");
  const [lens, setLens] = useState<Lens>("all");
  const [target, setTarget] = useState<TargetId | null>(null);
  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState<Layers>({ skin: true, muscles: true, skeleton: true, vessels: true, organs: true });

  useEffect(() => { fetch(dataUrl).then((r) => r.json()).then(setData).catch(() => setData(null)); }, [dataUrl]);

  const open = (t: TargetId | null) => { setTarget(t); if (t && !LENSES[lens].targets.includes(t)) setLens(TARGETS[t].lens); };

  // Deep links for rehearsing the pitch: #hypertension-heart, #storm-dna, #sleep-brain-2 (scenario-target-crew#).
  useEffect(() => {
    const [sc, tg, cr] = location.hash.slice(1).split("-");
    if (sc && sc in SCENARIOS) setScenario(sc as ScenarioKey);
    if (tg && tg in TARGETS) { setTarget(tg as TargetId); setLens(TARGETS[tg as TargetId].lens); }
    else if (tg && tg in LENSES) setLens(tg as Lens);
    if (cr && +cr >= 1) setCi(+cr - 1);
  }, []);

  const m = data?.crew[ci];
  const { vis, findings } = useMemo(() => (data && m ? derive(data, m, scenario) : { vis: null, findings: [] as Finding[] }), [data, m, scenario]);
  const top = findings[0];
  const level: Status = top?.status ?? "green";
  const statusOf = (t: TargetId): Status => findings.filter((f) => TARGETS[t].findingIds.includes(f.id)).reduce<Status>((a, f) => worst(a, f.status), "green");
  const lensStatus = (l: Lens): Status => (l === "all" ? level : LENSES[l].targets.reduce<Status>((a, t) => worst(a, statusOf(t)), "green"));

  const T = target ? TARGETS[target] : null;
  const spots: Hotspot[] = vis ? [...new Set([...LENSES[lens].targets, ...(target ? [target] : [])])].map((id) => ({ id, pos: TARGETS[id].spot, lines: TARGETS[id].hot(vis), status: statusOf(id) })) : [];
  const view = T
    ? { key: `t-${T.id}`, target: T.box.c, offset: [0.25, 0.08, Math.max(0.75, Math.hypot(...T.box.h) * 3.6)] }
    : { key: `l-${lens}`, ...LENSES[lens].cam };
  const tFindings = T ? findings.filter((f) => T.findingIds.includes(f.id)) : [];
  const lensFindings = lens === "all" ? findings : findings.filter((f) => { const t = FINDING_TARGET[f.id]; return t && LENSES[lens].targets.includes(t); });

  return (
    <div className={`app lvl-${level} ${T ? "has-insp" : ""}`}>
      <div className="stage">
        <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.1, 3.3], fov: 32, near: 0.01, far: 50 }} gl={{ antialias: true }}>
          <color attach="background" args={[level === "red" ? "#120607" : level === "amber" ? "#100c05" : "#06080c"]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[2, 3, 3]} intensity={1.6} />
          <directionalLight position={[-3, 1.5, -2]} intensity={1.1} color="#7aa6ff" />
          <Environment resolution={128}>
            <Lightformer intensity={2} position={[0, 4, 4]} scale={[6, 2, 1]} />
            <Lightformer intensity={1} position={[-4, 1, -2]} scale={[2, 6, 1]} color="#88aaff" />
            <Lightformer intensity={0.8} position={[4, 0, 2]} scale={[2, 4, 1]} color="#ffd9c0" />
          </Environment>
          <Suspense fallback={null}>
            {vis && <Body vis={vis} lens={lens} layers={layers} onPick={open} onReady={() => setReady(true)} />}
            {vis && <Radiation level={vis.radiation > 0.5 ? vis.radiation : lens === "radiation" ? 0.25 : vis.radiation * 0.3} />}
            {vis && <Hotspots spots={spots} active={target} onPick={open} />}
          </Suspense>
          <CameraRig view={view} />
          <ViewShift px={T ? 290 : 190} />
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.75} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.25} darkness={0.7} />
          </EffectComposer>
        </Canvas>
        {!ready && <div className="loader"><div className="loader-bar"><div className="loader-run" /></div><span>Loading 3D anatomy (about 11 MB)…</span></div>}
      </div>

      <div className={`warnlight warnlight--${level}`} aria-hidden />

      <header className="topbar">
        <div className="brand"><b>AEGIS</b><span>{data?.mission.name ?? ""}</span></div>
        <nav className="pills">
          {data?.crew.map((c, i) => (
            <button key={c.id} className={i === ci ? "on" : ""} onClick={() => { setCi(i); setTarget(null); }}><Icon s={i === ci ? level : c.status.overall} size={14} />{c.name}</button>
          ))}
        </nav>
        <label className="scenario">
          <span>Data</span>
          <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioKey)}>
            {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{k === "live" ? v.label : `Simulate: ${v.label}`}</option>)}
          </select>
        </label>
      </header>

      {/* lenses: what kind of data you're looking at */}
      <nav className="lenses" aria-label="Data lens">
        <div className="lenses-title">Look at</div>
        {(Object.keys(LENSES) as Lens[]).map((l) => (
          <button key={l} className={lens === l ? "on" : ""} onClick={() => { setLens(l); setTarget(null); }}>
            <Icon s={lensStatus(l)} size={13} />
            <span><b>{LENSES[l].label}</b><i>{LENSES[l].sub}</i></span>
          </button>
        ))}
        <div className="lenses-title">Layers</div>
        <div className="layers">
          {(Object.keys(layers) as (keyof Layers)[]).map((k) => (
            <label key={k} className={layers[k] ? "on" : ""}><input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />{k}</label>
          ))}
        </div>
      </nav>

      {top && (
        <div className={`banner banner--${top.status}`} role="alert">
          <Icon s={top.status} size={26} />
          <div className="banner-text">
            <div className="banner-kicker">{top.status === "red" ? "ACT NOW" : "WATCH"}{top.simulated ? " · simulated" : ""}</div>
            <div className="banner-title">{top.title} <span>{top.numbers[0]?.value}</span></div>
          </div>
          {FINDING_TARGET[top.id] && FINDING_TARGET[top.id] !== target && <button onClick={() => open(FINDING_TARGET[top.id])}>Look inside →</button>}
        </div>
      )}

      {T && vis ? (
        <aside className="panel insp">
          <div className="insp-head">
            <div><h2>{T.label}</h2><div className={`chip chip--${statusOf(T.id)}`}><Icon s={statusOf(T.id)} size={14} />{STATUS_WORD[statusOf(T.id)]}</div></div>
            <button className="close" onClick={() => setTarget(null)} aria-label="Close">✕</button>
          </div>
          <div className="view view--organ"><OrganView target={T} vis={vis} /><span className="view-cap">Live · drag to turn</span></div>
          <div className="view view--micro">
            <MicroView target={T} vis={vis} />
            <span className="view-cap">Close-up: {T.microTitle}</span>
            {T.microNote && (<><span className="view-l">{T.microNote[0]}</span><span className="view-r">{T.microNote[1]}</span></>)}
          </div>
          <div className="nums nums--row">{T.readings(vis, data?.career_limit_mSv ?? 600).map((n) => <div key={n.label}><span>{n.label}</span><b>{n.value}</b></div>)}</div>
          {tFindings.map((f) => (
            <div key={f.id} className={`finding finding--${f.status}`}>
              <div className="finding-head"><Icon s={f.status} /><strong>{f.title}</strong></div>
              <h4>What's happening inside</h4><p className="inside">{f.inside}</p>
              {f.action && (<><h4>What to do</h4><p className="action">{f.action}</p></>)}
              {f.status === "red" && <button className="surgeon">Contact flight surgeon</button>}
            </div>
          ))}
          {tFindings.length === 0 && <div className="finding finding--green"><h4>What you're seeing</h4><p className="inside">{T.see}</p></div>}
          <p className="space"><b>In space:</b> {T.space}</p>
        </aside>
      ) : (
        <aside className="panel">
          <h2>{lens === "all" ? m?.name ?? "" : LENSES[lens].label}</h2>
          <div className={`chip chip--${lensStatus(lens)}`}><Icon s={lensStatus(lens)} size={14} />{STATUS_WORD[lensStatus(lens)]}</div>
          {lensFindings.map((f) => (
            <div key={f.id} className={`finding finding--${f.status} finding--link`} onClick={() => open(FINDING_TARGET[f.id])}>
              <div className="finding-head"><Icon s={f.status} /><strong>{f.title}</strong></div>
              <div className="nums">{f.numbers.map((n) => <div key={n.label}><span>{n.label}</span><b>{n.value}</b></div>)}</div>
              <span className="more">Look inside →</span>
            </div>
          ))}
          {lensFindings.length === 0 && <div className="finding finding--green"><p className="inside">Everything measured in this view is inside this astronaut's own normal range.</p></div>}
          <h4>Open a close-up</h4>
          <div className="regions">
            {LENSES[lens].targets.map((t) => <button key={t} onClick={() => open(t)}><Icon s={statusOf(t)} size={13} />{TARGETS[t].label}</button>)}
          </div>
        </aside>
      )}

      <div className="hint">Drag to rotate · scroll to zoom · click any organ or label to open it</div>
      <footer className="foot">{scenario !== "live" ? "Simulated scenario · " : ""}Simulated crew data · Not medical advice · Anatomy: BodyParts3D 4.0, © DBCLS, CC BY 4.0</footer>
    </div>
  );
}
