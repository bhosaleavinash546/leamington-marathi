/**
 * The engineer's decisions on a consolidated dataset (offline 2D drawing intelligence, Layer 3).
 *
 * Five actions — confirm, correct, reject, resolve a conflict, reopen — plus `supply` for a value no source states.
 * Each is a PURE function: it returns a new dataset and leaves the one it was given untouched, so the result can be
 * stored with a project and replayed. Every action writes a `history` entry (who, when, from, to, why) on each
 * parameter it changes; no reading is ever deleted, so one the engineer rejected can still be seen and reopened (only
 * values this layer interpreted are replaced, when the reading they came from is corrected).
 *
 * The clock is the caller's: `who.at` is an ISO timestamp passed in, never read here (the same input gives the same
 * dataset).
 *
 * Rules that follow from "only the engineer decides":
 *  - confirming a reading does NOT confirm what was interpreted from it — each interpreted value is confirmed itself;
 *  - correcting a reading re-runs its interpretation (the old interpreted values are replaced; one the engineer had
 *    already confirmed is reopened, not silently kept);
 *  - rejecting a reading rejects everything derived from it, so nothing built on a wrong reading reaches the costing.
 *
 * No cost formula.
 */
import type { ConsolidatedEngineeringData, EngineeringParameter, OverrideEntry, ParameterStatus, ParameterValue } from './model.js';
import { parameterDef } from './dictionary.js';
import { normaliseParameter } from './normalise.js';
import { interpretParameters } from './interpret.js';
import type { SpecLookup } from './interpret-tables.js';
import { computeMissing, computeNotCosted } from './reconcile.js';

export interface Who {
  /** Who decided (a user name or id). */
  by: string;
  /** When, as an ISO timestamp — supplied by the caller. */
  at: string;
  reason?: string;
}

export interface OverrideOptions {
  /** The company specification table, needed when a corrected specification code or designation is re-interpreted. */
  specLookup?: SpecLookup;
}

export class OverrideError extends Error {}

const snapshot = (p: EngineeringParameter) => ({ status: p.status, value: p.value, ...(p.unit ? { unit: p.unit } : {}) });

function entry(p: EngineeringParameter, action: OverrideEntry['action'], to: { status: ParameterStatus; value: ParameterValue; unit?: string }, who: Who): OverrideEntry {
  return { by: who.by, at: who.at, from: snapshot(p), to, action, ...(who.reason ? { reason: who.reason } : {}) };
}

/** A copy of the dataset with one parameter replaced by `change(parameter)`. Throws when the id is not in it. */
function withParameter(data: ConsolidatedEngineeringData, id: string, change: (p: EngineeringParameter) => EngineeringParameter): ConsolidatedEngineeringData {
  if (!data.parameters.some(p => p.id === id)) throw new OverrideError(`no parameter "${id}" in this dataset`);
  return { ...data, parameters: data.parameters.map(p => (p.id === id ? change(p) : p)) };
}

function apply(p: EngineeringParameter, action: OverrideEntry['action'], status: ParameterStatus, who: Who, value: ParameterValue = p.value, unit = p.unit): EngineeringParameter {
  return { ...p, value, ...(unit ? { unit } : {}), status, history: [...(p.history ?? []), entry(p, action, { status, value, ...(unit ? { unit } : {}) }, who)] };
}

/** Lists that depend on which parameters are live. */
function refresh(data: ConsolidatedEngineeringData, keepMissing: ConsolidatedEngineeringData['missing'] = data.missing): ConsolidatedEngineeringData {
  const live = new Set(data.parameters.filter(p => p.status !== 'rejected' && p.status !== 'missing').map(p => p.name));
  const expected = computeMissing(data.parameters, data.commodity);
  // Interpretation notes ("names no grade …") stay until a live parameter of that name exists.
  const notes = keepMissing.filter(m => !live.has(m.name) && !expected.some(e => e.name === m.name && e.why === m.why));
  return { ...data, missing: [...expected, ...notes], notCosted: computeNotCosted(data.parameters, data.commodity) };
}

const descendants = (data: ConsolidatedEngineeringData, id: string): EngineeringParameter[] => {
  const out: EngineeringParameter[] = []; const seen = new Set<string>([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of data.parameters) {
      if (!seen.has(p.id) && p.derivedFrom?.some(d => seen.has(d))) { seen.add(p.id); out.push(p); grew = true; }
    }
  }
  return out;
};

/** The engineer accepts the value as read. Only now may it reach the cost engine. */
export function confirm(data: ConsolidatedEngineeringData, parameterId: string, who: Who): ConsolidatedEngineeringData {
  const p = data.parameters.find(x => x.id === parameterId);
  if (!p) throw new OverrideError(`no parameter "${parameterId}" in this dataset`);
  if (p.status === 'conflict') throw new OverrideError(`"${parameterId}" is one side of a conflict — resolve the conflict (resolveConflict), do not confirm one side`);
  if (p.status === 'rejected') throw new OverrideError(`"${parameterId}" was rejected — reopen it first`);
  return refresh(withParameter(data, parameterId, x => apply(x, 'confirm', 'confirmed', who)));
}

/**
 * The engineer types a different value. The parameter becomes `corrected` (the reading is kept in `rawText` and the
 * history); what was interpreted from the old value is replaced by an interpretation of the new one.
 */
export function correct(data: ConsolidatedEngineeringData, parameterId: string, value: ParameterValue, who: Who,
  opts: OverrideOptions & { unit?: string } = {}): ConsolidatedEngineeringData {
  const p = data.parameters.find(x => x.id === parameterId);
  if (!p) throw new OverrideError(`no parameter "${parameterId}" in this dataset`);
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new OverrideError('a correction needs a value — to say a reading is wrong without giving one, reject it');
  }
  const unit = opts.unit ?? p.unit ?? parameterDef(p.name)?.unit;
  const typed = normaliseParameter({ ...p, value, ...(unit ? { unit } : {}) });
  let next = withParameter(data, parameterId, x => apply(x, 'correct', 'corrected', who, typed.value, typed.unit));
  next = closeConflictsOf(next, parameterId, who, 'corrected by the engineer');

  // Re-interpret from the corrected value (a derived value that is corrected is the engineer's own figure: nothing follows from it).
  if (p.source !== 'derived') {
    const old = descendants(next, parameterId);
    const oldIds = new Set(old.map(o => o.id));
    const corrected = next.parameters.find(x => x.id === parameterId)!;
    // The corrected value is read as a first-hand statement, with the dataset's other readings for context.
    const fresh = interpretParameters(
      [...next.parameters.filter(x => !oldIds.has(x.id) && x.id !== parameterId), { ...corrected, status: 'extracted' }],
      { ...(next.commodity ? { commodity: next.commodity } : {}), ...(opts.specLookup ? { specLookup: opts.specLookup } : {}) });
    // Only what follows from THIS parameter (directly, or through a chain: specification code → designation → grade).
    const freshById = new Map(fresh.parameters.map(f => [f.id, f]));
    const mine = (d: EngineeringParameter, depth = 0): boolean =>
      depth < 8 && (d.derivedFrom ?? []).some(id => id === parameterId || (freshById.has(id) && mine(freshById.get(id)!, depth + 1)));
    const derived = fresh.parameters.filter(d => mine(d));
    const derivedIds = new Set(derived.map(d => d.id));
    // A derived value the engineer had already confirmed was confirmed on the OLD reading: it comes back unconfirmed.
    const replaced = derived.map(d => {
      const was = old.find(o => o.id === d.id);
      if (was && (was.status === 'confirmed' || was.status === 'corrected')) {
        return { ...d, status: 'needs-validation' as const,
          note: `${d.note ?? ''}; re-interpreted after its source was corrected — the earlier confirmation no longer applies`,
          history: [...(was.history ?? []), { by: who.by, at: who.at, from: snapshot(was), to: { status: 'needs-validation', value: d.value },
            action: 'reopen' as const, reason: 'its source reading was corrected' }] };
      }
      return was?.history ? { ...d, history: was.history } : d;
    });
    const gone = new Set(old.filter(o => !derivedIds.has(o.id)).map(o => o.id));
    const oldText = typeof p.value === 'string' ? p.value.trim() : p.rawText?.trim();
    const notes = fresh.unresolved.filter(u => u.parameterId === parameterId || derivedIds.has(u.parameterId));
    next = {
      ...next,
      parameters: [...next.parameters.filter(x => !oldIds.has(x.id)), ...replaced],
      conflicts: next.conflicts.filter(c => !c.sides.some(s => gone.has(s.parameterId))),
      // Notes about the old reading go; notes about the new one come.
      missing: [...next.missing.filter(m => !(oldText && m.why.includes(`"${oldText}"`))), ...notes.map(u => ({ name: u.name, why: u.why }))],
    };
  }
  return refresh(next);
}

/** The engineer says the reading is wrong and gives no value. It, and everything derived from it, never reaches the cost engine. */
export function reject(data: ConsolidatedEngineeringData, parameterId: string, who: Who): ConsolidatedEngineeringData {
  if (!data.parameters.some(p => p.id === parameterId)) throw new OverrideError(`no parameter "${parameterId}" in this dataset`);
  const down = new Set(descendants(data, parameterId).map(p => p.id));
  let next: ConsolidatedEngineeringData = {
    ...data,
    parameters: data.parameters.map(p => {
      if (p.id === parameterId) return apply(p, 'reject', 'rejected', who);
      if (down.has(p.id) && p.status !== 'rejected') return apply(p, 'reject', 'rejected', { ...who, reason: `its source reading "${parameterId}" was rejected${who.reason ? ` — ${who.reason}` : ''}` });
      return p;
    }),
  };
  next = closeConflictsOf(next, parameterId, who, 'rejected by the engineer');
  return refresh(next);
}

/** When one side of an open conflict is corrected or rejected by hand, the conflict is closed in favour of nothing: the other sides stay as they are. */
function closeConflictsOf(data: ConsolidatedEngineeringData, parameterId: string, who: Who, how: string): ConsolidatedEngineeringData {
  const open = data.conflicts.filter(c => !c.resolution && c.sides.some(s => s.parameterId === parameterId));
  if (!open.length) return data;
  const others = new Set(open.flatMap(c => c.sides.map(s => s.parameterId)).filter(id => id !== parameterId));
  const stillInConflict = (id: string) => data.conflicts.some(c => !c.resolution && !open.includes(c) && c.sides.some(s => s.parameterId === id));
  return {
    ...data,
    conflicts: data.conflicts.map(c => (open.includes(c) ? { ...c, resolution: { parameterId, by: who.by, at: who.at, reason: `one side ${how}` } } : c)),
    // A side left alone goes back to an ordinary unconfirmed reading — it is no longer in dispute, and it is not confirmed.
    parameters: data.parameters.map(p => (others.has(p.id) && p.status === 'conflict' && !stillInConflict(p.id) ? { ...p, status: 'needs-validation' as const } : p)),
  };
}

/** Find an open conflict by index, or by name (+ the feature it applies to). */
function findConflict(data: ConsolidatedEngineeringData, ref: number | { name: string; featureId?: string }): number {
  if (typeof ref === 'number') return ref >= 0 && ref < data.conflicts.length ? ref : -1;
  return data.conflicts.findIndex(c => !c.resolution && c.name === ref.name && (ref.featureId === undefined || c.appliesTo?.featureId === ref.featureId));
}

/**
 * The engineer settles a conflict: by choosing one side (`{ parameterId }` — it becomes `confirmed`, the others
 * `rejected`), or by typing the value (`{ value }` — every side is rejected and the typed value is a new parameter).
 * The precedence suggestion is never applied by itself; this is the only way a conflict ends.
 */
export function resolveConflict(data: ConsolidatedEngineeringData, ref: number | { name: string; featureId?: string },
  choice: { parameterId: string } | { value: ParameterValue; unit?: string }, who: Who): ConsolidatedEngineeringData {
  const i = findConflict(data, ref);
  if (i < 0) throw new OverrideError('no such open conflict in this dataset');
  const c = data.conflicts[i];
  if (c.resolution) throw new OverrideError('this conflict is already resolved — reopen a side to change it');
  const sideIds = new Set(c.sides.map(s => s.parameterId));
  let chosenId: string;
  let parameters = data.parameters;
  if ('parameterId' in choice) {
    if (!sideIds.has(choice.parameterId)) throw new OverrideError(`"${choice.parameterId}" is not a side of this conflict`);
    chosenId = choice.parameterId;
  } else {
    const first = data.parameters.find(p => sideIds.has(p.id))!;
    const typed = supplied(data, { name: c.name, value: choice.value, ...(choice.unit ? { unit: choice.unit } : {}), ...(c.appliesTo ? { appliesTo: c.appliesTo } : first.appliesTo ? { appliesTo: first.appliesTo } : {}) }, who);
    parameters = [...parameters, typed];
    chosenId = typed.id;
  }
  const losers = new Set([...sideIds].filter(id => id !== chosenId));
  const down = new Set([...losers].flatMap(id => descendants(data, id).map(p => p.id)));
  const next: ConsolidatedEngineeringData = {
    ...data,
    conflicts: data.conflicts.map((x, k) => (k === i ? { ...x, resolution: { parameterId: chosenId, by: who.by, at: who.at, ...(who.reason ? { reason: who.reason } : {}) } } : x)),
    parameters: parameters.map(p => {
      if (p.id === chosenId && sideIds.has(p.id)) return apply(p, 'resolve-conflict', 'confirmed', who);
      if (losers.has(p.id)) return apply(p, 'resolve-conflict', 'rejected', who);
      if (down.has(p.id) && p.status !== 'rejected') return apply(p, 'reject', 'rejected', { ...who, reason: 'its source reading lost a conflict the engineer resolved' });
      return p;
    }),
  };
  return refresh(next);
}

/**
 * Undo the engineer's decision on a parameter: it goes back to the state and value it had before the decision, and a
 * conflict it settled is open again (every side back in conflict). The history keeps both the decision and the undo.
 */
export function reopen(data: ConsolidatedEngineeringData, parameterId: string, who: Who): ConsolidatedEngineeringData {
  const p = data.parameters.find(x => x.id === parameterId);
  if (!p) throw new OverrideError(`no parameter "${parameterId}" in this dataset`);
  const settled = data.conflicts.filter(c => c.resolution && c.sides.some(s => s.parameterId === parameterId));
  const ids = new Set<string>([parameterId, ...settled.flatMap(c => [...c.sides.map(s => s.parameterId), c.resolution!.parameterId])]);
  // What rejecting or resolving took down with it comes back too.
  for (const id of [...ids]) {
    for (const d of descendants(data, id)) {
      const last = d.history?.[d.history.length - 1];
      if (last?.action === 'reject' && /source reading/.test(last.reason ?? '')) ids.add(d.id);
    }
  }
  const restore = (x: EngineeringParameter): EngineeringParameter => {
    const hist = x.history ?? [];
    // The first decision since the last reopen holds the state to go back to.
    let k = hist.length;
    while (k > 0 && hist[k - 1].action !== 'reopen') k--;
    const firstSince = hist[k];
    if (!firstSince) return x;                      // nothing decided since it was last reopened
    const before = firstSince.from as { status: ParameterStatus; value: ParameterValue; unit?: string } | undefined;
    // A value the engineer supplied has no earlier state: reopening it withdraws it (kept in the dataset, rejected).
    const inConflict = settled.some(c => c.sides.some(s => s.parameterId === x.id));
    const status: ParameterStatus = !before ? 'rejected' : inConflict ? 'conflict' : before.status;
    const value = before ? before.value : x.value;
    return { ...x, value, ...(before?.unit ? { unit: before.unit } : {}), status,
      history: [...hist, { by: who.by, at: who.at, from: snapshot(x), to: { status, value }, action: 'reopen', ...(who.reason ? { reason: who.reason } : {}) }] };
  };
  const next: ConsolidatedEngineeringData = {
    ...data,
    conflicts: data.conflicts.map(c => (settled.includes(c) ? (({ resolution: _drop, ...rest }) => rest)(c) : c)),
    // A value the engineer typed to settle the conflict is withdrawn (kept, rejected) when the conflict reopens.
    parameters: data.parameters.map(x => {
      if (!ids.has(x.id)) return x;
      if (x.source === 'manual' && settled.some(c => c.resolution!.parameterId === x.id && !c.sides.some(s => s.parameterId === x.id))) {
        return apply(x, 'reopen', 'rejected', { ...who, reason: 'the conflict it settled was reopened' });
      }
      return (x.history?.length ? restore(x) : x);
    }),
  };
  return refresh(next);
}

function supplied(data: ConsolidatedEngineeringData, input: { name: string; value: ParameterValue; unit?: string; appliesTo?: EngineeringParameter['appliesTo']; note?: string }, who: Who): EngineeringParameter {
  if (input.value === undefined || input.value === null || (typeof input.value === 'string' && !input.value.trim())) throw new OverrideError('a supplied parameter needs a value');
  const unit = input.unit ?? parameterDef(input.name)?.unit;
  let n = 1; let id = `manual:${input.name}:${n}`;
  while (data.parameters.some(p => p.id === id)) id = `manual:${input.name}:${++n}`;
  const p = normaliseParameter({
    id, name: input.name, value: input.value, ...(unit ? { unit } : {}), source: 'manual', method: 'typed', kind: 'extracted', status: 'corrected',
    ...(input.appliesTo ? { appliesTo: input.appliesTo } : {}), ...(input.note ? { note: input.note } : {}),
  });
  return { ...p, history: [{ by: who.by, at: who.at, from: undefined, to: { status: 'corrected', value: p.value, ...(p.unit ? { unit: p.unit } : {}) }, action: 'correct', ...(who.reason ? { reason: who.reason } : {}) }] };
}

/**
 * The engineer states a value NO source gives (a missing parameter, or a fact a drawing cannot show — "not
 * leak-tight"). It is a new `manual` parameter, typed and therefore usable; the name leaves the missing list.
 */
export function supply(data: ConsolidatedEngineeringData, input: { name: string; value: ParameterValue; unit?: string; appliesTo?: EngineeringParameter['appliesTo']; note?: string },
  who: Who): ConsolidatedEngineeringData {
  const p = supplied(data, input, who);
  return refresh({ ...data, parameters: [...data.parameters, p] }, data.missing.filter(m => m.name !== input.name));
}
