import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { answerBudget, asReadingSpace, depthDirective, detectIntent, isScheduleLookup } from './responseDepth.ts';

const chat = (message: string, hasImage = false) => answerBudget('chat', message, hasImage);

// ── The property this phase exists to establish ─────────────────────────────

Deno.test('THE TWO AXES ARE INDEPENDENT: asking for brevity never costs reasoning', () => {
  const full = chat('Why does the Michaelis-Menten approximation require the steady-state assumption?');
  const brief = chat('Briefly, why does the Michaelis-Menten approximation require the steady-state assumption?');
  // Same question, same thinking. Asserted as INVARIANCE, not as a fixed
  // value: what must never happen is brevity changing the effort, whatever
  // effort that question earns.
  assertEquals(full.effort, brief.effort);
  // Different amount shown.
  assertEquals(full.depth, 'standard');
  assertEquals(brief.depth, 'compact');
  assertNotEquals(full.depth, brief.depth);
  assertNotEquals(depthDirective(full.depth), depthDirective(brief.depth));
});

Deno.test('and asking for detail never buys reasoning a simple question did not need', () => {
  const plain = chat('What is my grade in this class?');
  const wordy = chat('What is my grade in this class? Give me a detailed explanation.');
  assertEquals(plain.effort, 'low');
  // A depth request re-opens reasoning only because it is no longer a bare
  // lookup — but the point is that verbosity moved and effort is decided on
  // its own terms, not dragged along by it.
  assertEquals(wordy.depth, 'deep');
  assertEquals(plain.depth, 'compact');
});

Deno.test('every rung is reachable, and low verbosity never implies low effort', () => {
  const compactHard = chat('In one sentence, derive why enzyme velocity saturates.');
  assertEquals(compactHard.verbosity, 'low');
  assertEquals(compactHard.effort, 'medium', 'a hard question asked briefly must still be reasoned about');
  // ...and the deep rung is the only one that raises the coarse parameter.
  assertEquals(chat('Walk me through it step by step').verbosity, 'medium');
  assertEquals(chat('What is mitosis?').verbosity, 'low');
});

// ── The matrix from the brief ───────────────────────────────────────────────

Deno.test('A · simple, no preference -> standard, and no longer than it is today', () => {
  const b = chat('What is mitosis?');
  assertEquals(b.depth, 'standard');
  // The coarse parameter stays where the old default had it; STANDARD is
  // separated from COMPACT by the directive, not by making answers longer.
  assertEquals(b.verbosity, 'low');
});

Deno.test('B · simple + explicit brief -> compact', () => {
  for (const m of ['What is mitosis? One sentence.', 'What is mitosis? Keep it short.', 'Quickly, what is mitosis?']) {
    assertEquals(chat(m).depth, 'compact', m);
    assertEquals(chat(m).verbosity, 'low', m);
  }
});

Deno.test('C · simple + explicit depth -> deep', () => {
  const b = chat('Explain mitosis deeply and walk me through every stage.');
  assertEquals(b.depth, 'deep');
});

Deno.test('D · complex, no preference -> reasoned and roomy', () => {
  const b = chat('Derive the Michaelis-Menten equation and explain the assumptions.');
  assertEquals(b.effort, 'medium');
  assertEquals(b.depth, 'deep');
});

Deno.test('E · complex + explicit brief -> reasoning untouched, visible answer concise', () => {
  const asked = 'Briefly explain why the steady-state approximation is used in Michaelis-Menten.';
  const same = 'Explain why the steady-state approximation is used in Michaelis-Menten.';
  const b = chat(asked);
  assertEquals(b.depth, 'compact');
  assertEquals(b.verbosity, 'low');
  // The point of the phase: the word "briefly" moved presentation and nothing
  // else. Production QA showed low effort answering this class of question
  // with every substantive point intact, so low is what it earns.
  assertEquals(b.effort, chat(same).effort);
});

Deno.test('a request to be walked through a derivation is what buys reasoning', () => {
  assertEquals(chat('What is the Michaelis-Menten equation?').effort, 'low');
  assertEquals(chat('Derive the Michaelis-Menten equation.').effort, 'medium');
  assertEquals(chat('Walk me through the derivation step by step.').effort, 'medium');
  // ...and asking for that derivation briefly still buys it.
  assertEquals(chat('Briefly, walk me through the derivation.').effort, 'medium');
  assertEquals(chat('Briefly, walk me through the derivation.').depth, 'compact');
});

Deno.test('F · REGRESSION: "why" alone no longer buys derivation treatment', () => {
  const b = chat('Why is my exam on Friday?');
  assertEquals(b.depth, 'compact');
  assertEquals(b.effort, 'low');
  // ...while a real conceptual "why" is not pushed down into the lookup class.
  const real = chat('Why does the steady-state approximation hold at high substrate concentration?');
  assertEquals(isScheduleLookup('Why does the steady-state approximation hold at high substrate concentration?'), false);
  assertEquals(real.depth, 'standard');
});

Deno.test('G · explicit short factual -> compact', () => {
  const b = chat('Just tell me when my exam is.');
  assertEquals(b.depth, 'compact');
  assertEquals(b.effort, 'low');
});

Deno.test('H · assignment and practice modes keep the budgets they had', () => {
  const assignment = answerBudget('explain_assignment', 'Explain the assignment "Problem Set 7".', false);
  assertEquals(assignment.effort, 'medium');
  assertEquals(assignment.depth, 'deep');
  for (const mode of ['practice', 'quiz']) {
    const p = answerBudget(mode, 'Create a quiz question from the most important current course material.', false);
    assertEquals(p.effort, 'low', mode);
    assertEquals(p.depth, 'compact', mode);
  }
});

Deno.test('a photo of a problem is read and worked through', () => {
  const b = chat('Is this right?', true);
  assertEquals(b.effort, 'medium');
  assertEquals(b.depth, 'standard');
});

// ── Removed heuristics stay removed ─────────────────────────────────────────

Deno.test('a long message is no longer treated as a hard one', () => {
  const rambling = 'What is mitosis? ' + 'I was reading my notes on the bus and got a bit lost. '.repeat(6);
  assertEquals(rambling.length > 180, true);
  assertEquals(chat(rambling).depth, 'standard', 'length is not complexity');
});

Deno.test('broad question words no longer raise depth on their own', () => {
  for (const m of ['How do I open the app?', 'What is the difference between my two classes?', 'Compare my two deadlines']) {
    assertNotEquals(chat(m).depth, 'deep', m);
  }
});

// ── Spanish ─────────────────────────────────────────────────────────────────

Deno.test('Spanish brevity intent is recognised', () => {
  for (const m of [
    '¿Qué es la mitosis? Brevemente.',
    'Explícame la mitosis en una frase.',
    'Resume la mitosis, por favor.',
    'Solo dime cuándo es mi examen.',
    'Rápidamente, ¿qué es la difusión facilitada?',
    'En pocas palabras, ¿qué es un p-valor?',
  ]) assertEquals(chat(m).depth, 'compact', m);
});

Deno.test('Spanish depth intent is recognised', () => {
  for (const m of [
    'Explícame la mitosis en detalle.',
    'Explica paso a paso la ecuación de Michaelis-Menten.',
    'Enséñame esto a fondo.',
    'Deduce la ecuación y explica los supuestos.',
    'Dame una explicación completa del transporte activo.',
  ]) assertEquals(chat(m).depth, 'deep', m);
});

Deno.test('Spanish brevity moves presentation only, never reasoning', () => {
  const brief = chat('Brevemente, ¿por qué la aproximación de estado estacionario es válida?');
  const plain = chat('¿Por qué la aproximación de estado estacionario es válida?');
  assertEquals(brief.depth, 'compact');
  assertEquals(brief.effort, plain.effort);
  // ...and the Spanish derivation request buys reasoning the same way.
  assertEquals(chat('Deduce la ecuación paso a paso.').effort, 'medium');
});

Deno.test('Spanish schedule lookups behave like their English twins', () => {
  for (const m of ['¿Cuándo es mi examen?', '¿Cuál es mi nota en esta clase?', '¿Cuál es la fecha de entrega?']) {
    assertEquals(chat(m).depth, 'compact', m);
    assertEquals(chat(m).effort, 'low', m);
  }
});

// ── Intent precedence and the classifier's narrowness ───────────────────────

Deno.test('when both intents appear, the request for brevity wins', () => {
  assertEquals(detectIntent('Explain this deeply, but keep it short'), 'brief');
  assertEquals(chat('Walk me through it briefly').depth, 'compact');
});

Deno.test('the schedule classifier does not fire on subject matter', () => {
  for (const m of [
    'Why does the steady-state approximation hold?',
    'When is mitosis most vulnerable to damage?',
    'What is the final step of glycolysis?',
    'Explain grade inflation in economics.',
  ]) assertEquals(isScheduleLookup(m), false, m);
  for (const m of ['When is my exam?', "What's due this week?", 'my final grade', '¿Cuándo es mi entrega?']) {
    assertEquals(isScheduleLookup(m), true, m);
  }
});

Deno.test('an empty or absent message never throws and lands on the default', () => {
  for (const m of ['', '   ']) {
    const b = chat(m);
    assertEquals(b.depth, 'standard');
    assertEquals(b.effort, 'low');
  }
});

// ── The directive ───────────────────────────────────────────────────────────

Deno.test('every rung carries the same two non-negotiables', () => {
  for (const d of ['compact', 'standard', 'deep'] as const) {
    const t = depthDirective(d);
    assertEquals(t.includes('Never drop a step'), true, d);
    assertEquals(t.includes('follow the student'), true, d);
    assertEquals(t.startsWith('LENGTH:'), true, d);
  }
  assertNotEquals(depthDirective('compact'), depthDirective('deep'));
});

Deno.test('the output cap is one generous guard, not a length control', () => {
  const all = [chat('What is mitosis?'), chat('Derive it in full detail'), chat('Briefly, what is mitosis?')];
  for (const b of all) assertEquals(b.maxTokens, 6144);
});

// ── Reading space (Phase 3B.5B) ─────────────────────────────────────────────

const spaced = (message: string, space: 'compact'|'regular'|'roomy'|null) =>
  answerBudget('chat', message, false, space);

Deno.test('READING SPACE NEVER TOUCHES REASONING', () => {
  for (const m of ['What is mitosis?', 'Derive the Michaelis-Menten equation.', 'When is my exam?']) {
    const efforts = (['compact','regular','roomy',null] as const).map((s) => spaced(m, s).effort);
    assertEquals(new Set(efforts).size, 1, `${m} changed effort with space: ${efforts.join()}`);
  }
});

Deno.test('a compact screen shortens an ordinary answer; a roomy one does not lengthen it', () => {
  const q = 'What does it mean that the pump is electrogenic?';
  assertEquals(spaced(q, 'compact').depth, 'compact');
  assertEquals(spaced(q, 'regular').depth, 'standard');
  // Room is permission, not obligation — roomy must NOT reach for deep.
  assertEquals(spaced(q, 'roomy').depth, 'standard');
});

Deno.test('explicit intent beats the environment in both directions', () => {
  // Compact screen must not suppress a requested walkthrough...
  assertEquals(spaced('Walk me through it step by step.', 'compact').depth, 'deep');
  assertEquals(spaced('Deduce la ecuación paso a paso.', 'compact').depth, 'deep');
  // ...and a roomy screen must not inflate a requested one-liner.
  assertEquals(spaced('What is mitosis? One sentence.', 'roomy').depth, 'compact');
  assertEquals(spaced('En pocas palabras, ¿qué es la mitosis?', 'roomy').depth, 'compact');
});

Deno.test('mode still outranks the environment', () => {
  assertEquals(answerBudget('explain_assignment', 'Explain this assignment.', false, 'compact').depth, 'deep');
  assertEquals(answerBudget('quiz', 'Create a quiz question.', false, 'roomy').depth, 'compact');
});

Deno.test('an older client that sends nothing behaves exactly as before', () => {
  for (const m of ['What is mitosis?', 'Briefly, what is mitosis?', 'Walk me through it.', 'When is my exam?']) {
    assertEquals(spaced(m, null).depth, answerBudget('chat', m, false).depth, m);
    assertEquals(spaced(m, null).effort, answerBudget('chat', m, false).effort, m);
  }
});

Deno.test('the roomy permission clause appears only on a roomy standard answer', () => {
  assertEquals(depthDirective('standard', 'roomy').includes('room on this screen'), true);
  assertEquals(depthDirective('standard', 'regular').includes('room on this screen'), false);
  assertEquals(depthDirective('standard', 'compact').includes('room on this screen'), false);
  assertEquals(depthDirective('compact', 'roomy').includes('room on this screen'), false);
  // The non-negotiables survive on every variant.
  for (const s of ['compact','regular','roomy'] as const) {
    assertEquals(depthDirective('standard', s).includes('Never drop a step'), true);
  }
});

Deno.test('compact forbids a summary WITHOUT forbidding a caveat that changes the reading', () => {
  // Blind review found compact dropping "one factor dominates" clauses on hard
  // conceptual questions, reading them as the closing summary the rung bans.
  // Screen-size routing would have handed that loss to every small-phone
  // student who never asked for brevity, so the exemption is explicit.
  const c = depthDirective('compact');
  assertEquals(c.includes('Do not end with a summary'), true);
  assertEquals(c.includes('is not a summary'), true);
  assertEquals(c.includes('one factor dominates'), true);
  assertEquals(c.includes('holds only under a condition'), true);
  // The blanket ban that caused the loss must be gone, not merely softened.
  assertEquals(c.includes('no closing summary'), false);
  // Every rung still carries the non-negotiables, compact included.
  for (const d of ['compact', 'standard', 'deep'] as const) {
    assertEquals(depthDirective(d).includes('Never drop a step'), true, d);
  }
  // The exemption belongs to compact alone; it is meaningless on the wider rungs.
  assertEquals(depthDirective('standard').includes('is not a summary'), false);
  assertEquals(depthDirective('deep').includes('is not a summary'), false);
});

Deno.test('a junk readingSpace value is ignored rather than trusted', () => {
  assertEquals(asReadingSpace('roomy'), 'roomy');
  for (const junk of ['ROOMY', 'huge', '', null, undefined, 3, {}, ['compact']]) {
    assertEquals(asReadingSpace(junk), null, JSON.stringify(junk));
  }
});
