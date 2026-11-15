// Data lineage: where every number comes from and where it goes.
// Placeholder: the graph is typed and empty. The architecture agent fills LINEAGE.

export type LineageKind = 'device' | 'dataset' | 'api' | 'model' | 'core' | 'surface' | 'person';
export type LineageStatus = 'live' | 'simulated' | 'planned' | 'offline-sample';

export interface LineageNode {
  id: string;
  label: string;
  kind: LineageKind;
  status: LineageStatus;
  /** Who publishes it or what produces it. */
  source?: string;
  url?: string;
  license?: string;
}

export interface LineageEdge {
  /** LineageNode id. */
  from: string;
  /** LineageNode id. */
  to: string;
  label: string;
  /** What travels along the edge, for example 'Observation' or 'crew_data.json'. */
  payload: string;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export const LINEAGE: LineageGraph = { nodes: [], edges: [] };

/** Edge endpoints that name no node. An empty list means the graph is consistent. */
export function danglingEdges(graph: LineageGraph): LineageEdge[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return graph.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
}
