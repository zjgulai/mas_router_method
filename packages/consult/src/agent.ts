import { capabilityGraph } from './capability-graph.js';
import { KnowledgeCorpus } from './corpus.js';
import { classifyQuestion, composeAnswer, buildMenu } from './answer.js';
import { createLlmFromEnv, type LlmSynthesizer } from './llm.js';
import { findPlay } from './plays.js';
import { findRepoRoot } from './paths.js';
import type {
  CapabilityGraph,
  CapabilityNode,
  ConsultAnswer,
  ConversationTurn,
  ProblemRoute,
} from './types.js';
import { tokenize } from './tokenize.js';

export interface MainConsultAgentOptions {
  graph?: CapabilityGraph;
  corpus?: KnowledgeCorpus;
  root?: string;
  /** Portable source bundle; see `scripts/materialize-main-knowledge.py`. */
  sourcesPath?: string;
  llm?: LlmSynthesizer | null;
  maxChars?: number;
}

/**
 * The Main agent.
 *
 * This is an agent in the operational sense, not a chat wrapper: it classifies the
 * question into a capability node, retrieves evidence, selects a problem route,
 * composes a grounded answer, and optionally asks a model to rewrite it. Every
 * step is recorded so the Feishu gateway can log why an answer looked the way it
 * did.
 */
export class MainConsultAgent {
  readonly graph: CapabilityGraph;
  readonly corpus: KnowledgeCorpus;
  private readonly llm: LlmSynthesizer | null;
  private readonly maxChars: number;

  constructor(options: MainConsultAgentOptions = {}) {
    this.graph = options.graph ?? capabilityGraph;
    this.corpus =
      options.corpus ??
      KnowledgeCorpus.load({
        root: options.root ?? findRepoRoot(),
        graph: this.graph,
        ...(options.sourcesPath !== undefined ? { sourcesPath: options.sourcesPath } : {}),
      });
    this.llm = options.llm ?? null;
    this.maxChars = options.maxChars ?? 3400;
  }

  static fromRepo(
    options: Omit<MainConsultAgentOptions, 'corpus' | 'graph'> = {},
  ): MainConsultAgent {
    const root = options.root ?? findRepoRoot();
    return new MainConsultAgent({
      ...options,
      root,
      graph: capabilityGraph,
      corpus: KnowledgeCorpus.load({
        root,
        graph: capabilityGraph,
        ...(options.sourcesPath !== undefined ? { sourcesPath: options.sourcesPath } : {}),
      }),
      llm: options.llm === undefined ? createLlmFromEnv() : options.llm,
    });
  }

  capabilities(): CapabilityNode[] {
    return this.graph.nodes;
  }

  menu(): string {
    return buildMenu(this.graph);
  }

  routeFor(question: string): ProblemRoute | undefined {
    const q = question.trim().toLowerCase();
    const qTokens = new Set(tokenize(question));
    let best: { route: ProblemRoute; score: number } | undefined;

    for (const route of this.graph.routes) {
      let score = 0;
      for (const symptom of route.symptoms) {
        if (q.includes(symptom.toLowerCase())) score += symptom.length >= 3 ? 3 : 1.5;
        const overlap = jaccard(qTokens, new Set(tokenize(symptom)));
        if (overlap > 0.2) score += overlap * 4;
      }
      if (best === undefined || score > best.score) best = { route, score };
    }

    if (best === undefined || best.score < 1.5) return undefined;
    return best.route;
  }

  async answer(
    question: string,
    options: { history?: ConversationTurn[] } = {},
  ): Promise<ConsultAnswer> {
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      return {
        text: this.menu(),
        confidence: 'high',
        sources: [],
        retrieved: [],
        steps: [{ name: 'classify', detail: 'empty question -> menu' }],
        outOfScope: false,
      };
    }

    const history = options.history?.slice(-4) ?? [];
    const historyText = history
      .map((turn) => `${turn.role}: ${turn.text.slice(0, 600)}`)
      .join('\n');
    const contextualQuestion =
      historyText.length === 0 ? trimmed : `${historyText}\nuser: ${trimmed}`;

    const retrieved = this.corpus.search(contextualQuestion, 10);
    const classification = classifyQuestion(contextualQuestion, this.graph, retrieved);
    const route = this.routeFor(contextualQuestion);

    // The node's own sources are the evidence contract. Pull them in even when
    // the query terms do not match code identifiers, then let the composer quote
    // from them first.
    const earlyPlay = classification.needsContext
      ? undefined
      : findPlay(trimmed, history);
    const nodeId = earlyPlay?.nodeId ?? classification.node?.id;
    const evidenceNode =
      nodeId === undefined
        ? undefined
        : this.graph.nodes.find((node) => node.id === nodeId);
    const sourceEvidence =
      evidenceNode === undefined
        ? []
        : this.corpus.evidenceForPaths(
            evidenceNode.sources.map((source) => source.path),
            2,
          );
    const seen = new Set(sourceEvidence.map((item) => item.chunk.id));
    const groundedEvidence = [
      ...sourceEvidence,
      ...retrieved.filter((item) => !seen.has(item.chunk.id)),
    ];
    const grounded = composeAnswer(trimmed, this.graph, groundedEvidence, classification, {
      maxChars: this.maxChars,
      history,
    });

    const steps = [...grounded.steps];
    if (history.length > 0) {
      steps.push({ name: 'classify', detail: `historyTurns=${history.length}` });
    }
    if (route !== undefined) {
      steps.push({ name: 'classify', detail: `route=${route.id}; firstCheck=${route.firstCheck}` });
    }

    let text = grounded.text;
    if (this.llm !== null && !grounded.outOfScope && classification.node !== undefined) {
      const synthesised = await this.llm.synthesize({
        question: trimmed,
        grounded: grounded.text,
        node: classification.node,
        retrieved,
        history,
      });
      if (synthesised !== null) {
        text =
          synthesised.length > this.maxChars
            ? `${synthesised.slice(0, this.maxChars - 12)}\n…（已截断）`
            : synthesised;
        steps.push({ name: 'synthesize', detail: `provider=${this.llm.name}` });
      } else {
        steps.push({ name: 'synthesize', detail: `provider=${this.llm.name}; fallback=grounded` });
      }
    }

    return {
      ...grounded,
      text,
      ...(route !== undefined ? { routeId: route.id } : {}),
      steps,
    };
  }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
