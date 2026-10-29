/**
 * The consulting layer's public vocabulary.
 *
 * The capability graph is deliberately data, not prompt text. A graph node is a
 * promise: "this platform can recognise this class of problem, name the first
 * check, prescribe an action, and point at evidence." If a node has no source or
 * no action, it is a slogan and the tests reject it.
 */

export type CapabilityFamily =
  'navigation' | 'data-product' | 'agent-product' | 'delivery' | 'surface';

export interface CheckerRef {
  /** A command a human or CI can actually run. */
  cmd: string;
  /** The exit-code contract, when the checker defines one. */
  exit?: string;
  /** What this checker cannot decide. */
  note?: string;
}

export interface SourceRef {
  /** Repository-relative path. Must exist; the graph test proves it. */
  path: string;
  /** Optional heading inside the file. */
  heading?: string;
  /** Why this source is relevant. */
  why?: string;
}

export interface CapabilityNode {
  id: string;
  title: string;
  family: CapabilityFamily;
  /** One paragraph a non-specialist can act on. */
  summary: string;
  /** High-signal words. Weighted heavily by the classifier. */
  keywords: string[];
  /** Broader vocabulary a user might actually type. */
  aliases: string[];
  /** Canonical questions this node answers. */
  questions: string[];
  /** How the problem sounds in a chat message. */
  symptoms: string[];
  /** Ordered prescriptions. Each item should be executable or decidable. */
  actions: string[];
  /** Artifacts the user should end up with. */
  artifacts: string[];
  /** Commands that turn the claim into evidence. */
  checkers: CheckerRef[];
  /** Documents that support this node. */
  sources: SourceRef[];
  /** Honest limits. A node without boundaries is over-claiming. */
  boundaries: string[];
  /** Adjacent nodes worth reading next. */
  related: string[];
}

export type CapabilityEdgeRelation = 'feeds' | 'verifies' | 'diagnoses' | 'requires' | 'explains';

export interface CapabilityEdge {
  from: string;
  to: string;
  relation: CapabilityEdgeRelation;
  note: string;
}

/**
 * A problem-solving route is the graph's operational half: a symptom observed in
 * the wild, the node that owns it, the first check, and the prescription.
 */
export interface ProblemRoute {
  id: string;
  /** Phrases that should route here. */
  symptoms: string[];
  nodeIds: string[];
  firstCheck: string;
  prescription: string[];
  /** What a good answer must cite. */
  evidence: SourceRef[];
  /** When this route is the wrong one. */
  notWhen: string[];
}

export interface CapabilityGraph {
  version: string;
  updatedAt: string;
  axes: {
    lifecycle: string[];
    dataLayers: string[];
    pillars: string[];
    agentStages: string[];
    deliveryLanes: string[];
    gates: { id: string; question: string; evidence: string }[];
  };
  nodes: CapabilityNode[];
  edges: CapabilityEdge[];
  routes: ProblemRoute[];
}

export interface KnowledgeChunk {
  id: string;
  /** Repository-relative source path. */
  path: string;
  /** Heading path, e.g. "数据产品方案 > 七、前置验收". */
  heading: string;
  /** Body, including the heading line. */
  text: string;
  /** Number of tokens, filled by the index. */
  length: number;
  /** Synthetic chunks are generated from structured data or the graph. */
  kind: 'document' | 'matrix' | 'capability';
}

export interface RetrievedChunk {
  chunk: KnowledgeChunk;
  score: number;
  /** Fraction of query terms the chunk covers, 0..1. */
  coverage: number;
  matchedTerms: string[];
}

export type Confidence = 'high' | 'medium' | 'low';

/** One turn of prior conversation, used for thread-level follow-ups. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConsultStep {
  name: 'classify' | 'retrieve' | 'compose' | 'synthesize';
  detail: string;
}

export interface ConsultAnswer {
  text: string;
  nodeId?: string;
  routeId?: string;
  confidence: Confidence;
  sources: SourceRef[];
  retrieved: RetrievedChunk[];
  steps: ConsultStep[];
  /** True when the question fell outside the platform's declared scope. */
  outOfScope: boolean;
}
