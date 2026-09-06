/**
 * How hard to think, and how much to say — decided separately.
 *
 * These were one decision until now. `answerBudget` returned reasoning.effort
 * and text.verbosity as a matched pair, so every rule that shortened an answer
 * also made it less well reasoned. That is the wrong coupling in both
 * directions: a hard question asked "briefly" still needs the thinking, and a
 * student who wants a paragraph about mitosis does not need deeper reasoning to
 * get one. It also meant Semora could only ever be asked for MORE — the
 * vocabulary of brevity did nothing at all.
 *
 *   EFFORT    is about correctness. It follows the question, and nothing else.
 *             It must never be lowered because the visible answer is short, and
 *             in a later phase must never be lowered because a screen is small.
 *   VERBOSITY is about presentation. It follows what the student asked for, and
 *             otherwise stays out of the model's way.
 *
 * Pure and dependency-free so the matrix in responseDepth.test.ts can prove the
 * two axes move independently; index.ts owns all I/O.
 */

export type Effort = 'low' | 'medium';
/** Only values already proven against this model in production are emitted. */
export type Verbosity = 'low' | 'medium';
export type Depth = 'compact' | 'standard' | 'deep';
export type Intent = 'brief' | 'deep' | null;

export interface AnswerBudget {
  effort: Effort;
  verbosity: Verbosity;
  depth: Depth;
  maxTokens: number;
}

/**
 * A ceiling against a runaway generation, NOT a length control.
 *
 * Production telemetry over 60 days: the longest answer the Tutor has ever
 * produced is 966 output tokens, against a floor of 2048. The old two-value
 * cap never bound anything, so keeping two of them only implied a lever that
 * does not exist. One generous guard replaces both.
 */
const MAX_OUTPUT_TOKENS = 6144;

/**
 * Explicit requests, in both shipped languages.
 *
 * Deliberately SHORT lists of unambiguous markers rather than an attempt at
 * every phrasing. They exist only to set the verbosity parameter, which a
 * prompt cannot do; the prompt separately tells the model to honour any request
 * for brevity or detail it can see in the question, so a phrasing missing here
 * is still respected in the writing. Missing a marker degrades to the default,
 * never to the opposite of what was asked.
 */
const BRIEF_INTENT = new RegExp([
  // English
  '\\bbrief(ly)?\\b', '\\bquick(ly)?\\b', '\\bconcise(ly)?\\b', '\\bshort(er)? (answer|version)\\b',
  '\\b(in )?(one|two|a) (sentence|line)s?\\b', '\\bone[- ]liner\\b', '\\bjust (tell|give|the answer)\\b',
  '\\bsummar(y|ise|ize)\\b', '\\btl;?dr\\b', '\\bin a nutshell\\b', '\\bkeep it short\\b',
  // Spanish
  '\\bbreve(mente)?\\b', '\\br[áa]pid(o|amente)\\b', '\\bconcis(o|a)\\b',
  '\\ben (una|1) (frase|oraci[óo]n|l[íi]nea)\\b', '\\bresum(e|en|ir)\\b',
  '\\ben pocas palabras\\b', '\\bs[óo]lo dime\\b', '\\bsolo dime\\b',
].join('|'), 'i');

const DEEP_INTENT = new RegExp([
  // English
  '\\bin depth\\b', '\\bdeeply\\b', '\\bin detail\\b', '\\bdetailed\\b', '\\bthorough(ly)?\\b',
  '\\bwalk me through\\b', '\\bstep[- ]by[- ]step\\b', '\\ball (the )?steps\\b', '\\bshow (all )?(your |the )?(work|steps)\\b',
  '\\bteach me\\b', '\\bfull (explanation|walkthrough)\\b', '\\bderive\\b', '\\bderivation\\b', '\\bprove\\b', '\\bproof\\b',
  // Spanish
  '\\ben detalle\\b', '\\bdetallad(o|a|amente)\\b', '\\ba fondo\\b', '\\ben profundidad\\b',
  '\\bpaso a paso\\b', '\\btodos los pasos\\b', '\\bens[ée][ñn]ame\\b', '\\bexplicaci[óo]n completa\\b',
  '\\bdeduce\\b', '\\bdeducci[óo]n\\b', '\\bdemuestra\\b',
].join('|'), 'i');

/**
 * A question about the student's own timetable or marks, rather than about the
 * subject.
 *
 * This is the only place a question is classified at all, and it exists to fix
 * one specific defect: "Why is my exam on Friday?" used to receive
 * derivation-grade treatment because it contained the word "why". Matching on
 * the student's own possessed artefacts ("my exam", "mi entrega") or an
 * explicit due-date word is far narrower than matching a question word, and it
 * cannot fire on "Why does the steady-state approximation hold?", which owns
 * nothing and mentions no deadline.
 */
const OWN_SCHEDULE = new RegExp([
  '\\b(my|mi|mis)\\s+(\\w+\\s+){0,2}(exams?|quiz(zes)?|tests?|midterms?|finals?|assignments?|homework|classes|class|deadlines?|grades?|gpa|scores?|average|examen(es)?|prueba(s)?|tarea(s)?|entrega(s)?|clase(s)?|nota(s)?|calificaci[óo]n(es)?|promedio)\\b',
  '\\b(due|deadline)\\b', '\\bwhat\'?s due\\b', '\\bfecha de entrega\\b',
].join('|'), 'i');

/** What the student explicitly asked for, if anything. */
export function detectIntent(message: string): Intent {
  const text = message ?? '';
  const brief = BRIEF_INTENT.test(text);
  const deep = DEEP_INTENT.test(text);
  // Brevity wins a tie on purpose. "Explain this deeply, but keep it short"
  // is a request for short; the depth marker describes the subject, the
  // brevity marker describes the answer they want to read.
  if (brief) return 'brief';
  if (deep) return 'deep';
  return null;
}

export function isScheduleLookup(message: string): boolean {
  return OWN_SCHEDULE.test(message ?? '');
}

/**
 * How hard to think. Never a function of how much will be shown.
 *
 * `low` is the default, on evidence rather than on thrift. Matched-pair QA
 * against production Luna — the same question phrased so the old rule sent it
 * down each branch — found no correctness gap at low effort on any class
 * tested: a multi-step charge calculation reached the same figure by the same
 * route, and a hard kinetics question produced every substantive point the
 * medium answer did, in half the words. Latency was flat, and on the hardest
 * pair low was actually the slower of the two.
 *
 * So effort is spent only where something must be WORKED OUT rather than
 * explained: a photo that has to be read before it can be reasoned about,
 * assignment planning, and a student explicitly asking to be walked through a
 * derivation or proof. An earlier draft of this file defaulted to `medium` as
 * a safety blanket; that routed 84 of 86 historical questions to the more
 * expensive setting to buy a quality difference the QA could not detect.
 *
 * The honest limit: four matched pairs is a small sample, and no image case was
 * tested. The guardrails in the report exist so this stays a measured decision.
 */
export function reasoningEffort(opts: { message: string; mode: string; hasImage: boolean }): Effort {
  // A photo has to be read before it can be reasoned about.
  if (opts.hasImage) return 'medium';
  if (opts.mode === 'explain_assignment') return 'medium';
  // Practice and quiz generation write one small JSON object from material
  // already in the prompt; this is the budget they have always had.
  if (opts.mode === 'practice' || opts.mode === 'quiz') return 'low';
  // Asked to be walked through a derivation or proof — the one request that
  // reliably means "do the work", not "say more words".
  if (DEEP_INTENT.test(opts.message ?? '')) return 'medium';
  return 'low';
}

/**
 * How much the student should see. Never a function of how hard the question is
 * to think about — the model sizes the explanation to the concept, and this
 * only says how much room it has to do that in.
 */
export function responseDepth(opts: { message: string; mode: string; hasImage: boolean }): Depth {
  const intent = detectIntent(opts.message);
  if (intent === 'brief') return 'compact';
  if (intent === 'deep') return 'deep';
  if (opts.mode === 'explain_assignment') return 'deep';
  if (opts.mode === 'practice' || opts.mode === 'quiz') return 'compact';
  // A photo of a problem is nearly always worked through rather than answered.
  if (opts.hasImage) return 'standard';
  if (isScheduleLookup(opts.message)) return 'compact';
  return 'standard';
}

export function answerBudget(mode: string, message: string, hasImage: boolean): AnswerBudget {
  const input = { message: message ?? '', mode, hasImage };
  const depth = responseDepth(input);
  return {
    effort: reasoningEffort(input),
    // 'high' is not emitted: only 'low' and 'medium' are proven against this
    // model in production, and a rejected parameter would fail the whole turn.
    //
    // 'medium' is reserved for the DEEP rung so that this phase does not
    // quietly lengthen everything. Replaying 86 real questions through both
    // rules: the old keyword split produced verbosity=low 47 times, and making
    // STANDARD medium would have cut that to 3 — about half of all answers
    // getting longer, which is the opposite of what the reading experience
    // needs and is not a change a decoupling phase should smuggle in. The
    // coarse parameter therefore stays where it was, and COMPACT versus
    // STANDARD is separated by the directive, which is the precise instrument.
    verbosity: depth === 'deep' ? 'medium' : 'low',
    depth,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
}

/**
 * The one place visible length is described to the model.
 *
 * Replaces the blanket "Be concise" rule that used to sit in the system prompt,
 * so there is exactly one instruction about length in the whole prompt and
 * nothing for the model to reconcile. Every rung repeats the same two
 * non-negotiables — size to the concept, never drop a step — because those are
 * what stop this becoming "short answers on small screens".
 */
export function depthDirective(depth: Depth): string {
  const shared = 'Match the explanation to what the question actually requires: a simple question stays short even when there is room, and a genuinely multi-step one keeps every step it needs even when the answer is meant to be brief. Never drop a step, a caveat or a citation to save space. If the student asks for more or less detail than this, follow the student.';
  if (depth === 'compact') {
    return `LENGTH: Answer first, in the opening sentence. Then give only the reasoning needed to trust it. No preamble, no recap of the question, no closing summary, and no example unless the answer is wrong without one. ${shared}`;
  }
  if (depth === 'deep') {
    return `LENGTH: Give the full walkthrough — the reasoning, the steps in order, the assumptions being made, and a worked example where one earns its place. Name the misconception nearby if there is an obvious one. ${shared}`;
  }
  return `LENGTH: Lead with the answer, then explain it. Include the distinction or the steps that matter, and an example only where it materially helps. ${shared}`;
}
