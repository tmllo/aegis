import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { conceptIds, conceptLoaders, type ConceptMeta } from './registry';
import { Footer } from './components/Footer';

/** Lists every registered concept as a card. Meta is read from each concept module. */
export function ConceptsIndex() {
  const [metas, setMetas] = useState<Record<string, ConceptMeta | undefined>>({});

  useEffect(() => {
    let alive = true;
    for (const id of conceptIds) {
      conceptLoaders[id]()
        .then((m) => alive && setMetas((prev) => ({ ...prev, [id]: m.meta })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-baseline justify-between border-b border-line px-8 py-6">
        <h1 className="font-display text-2xl font-medium tracking-tight">
          e<sup>x</sup> Crew Station
        </h1>
        <span className="font-mono text-xs uppercase tracking-widest text-faint">
          Concepts {String(conceptIds.length).padStart(2, '0')}
        </span>
      </header>

      <main className="grid flex-1 content-start gap-4 p-8 sm:grid-cols-2 xl:grid-cols-3">
        {conceptIds.map((id, i) => {
          const meta = metas[id];
          return (
            <Link
              key={id}
              to={`/concepts/${id}`}
              className="group flex min-h-[176px] flex-col justify-between rounded border border-line bg-surface p-6 transition-colors duration-base ease-out hover:border-accent hover:bg-surface-2"
            >
              <div className="flex items-start justify-between font-mono text-xs uppercase tracking-widest text-faint">
                <span>{String(i + 1).padStart(2, '0')}</span>
                <span>{meta?.surface ?? ''}</span>
              </div>
              <div>
                <h2 className="font-display text-xl font-medium">{meta?.title ?? id}</h2>
                <p className="mt-1 text-sm text-dim">{meta?.direction ?? ''}</p>
                <p className="mt-3 font-mono text-xs text-faint group-hover:text-accent">/concepts/{id}</p>
              </div>
            </Link>
          );
        })}
      </main>

      <Footer />
    </div>
  );
}
