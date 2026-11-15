// Concept registry. A folder src/concepts/<id>/index.tsx is picked up here
// automatically: nobody edits a shared file to add a concept.
//
// A concept module must have
//   export default function Concept() { ... }          the page
//   export const meta = { title, direction, surface }   shown on /concepts
import type { ComponentType } from 'react';

export interface ConceptMeta {
  /** Short name, 1-3 words. */
  title: string;
  /** One line: the visual direction. */
  direction: string;
  /** Which surface it shows: 'Crew Console', 'Systems', 'Wrist', 'Ground', ... */
  surface: string;
}

export interface ConceptModule {
  default: ComponentType;
  meta?: ConceptMeta;
}

const modules = import.meta.glob<ConceptModule>('./concepts/*/index.tsx');

const idOf = (path: string): string => path.split('/')[2];

/** Concept id (folder name) -> lazy loader. */
export const conceptLoaders: Record<string, () => Promise<ConceptModule>> = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [idOf(path), load]),
);

export const conceptIds: string[] = Object.keys(conceptLoaders).sort();
