/**
 * One-step inverse forming: the blank of a DRAWN part.
 *
 * The unfold (blank-unfold.ts) is geometry: as-rigid-as-possible, which is
 * exact for a bent part and a compromise for a drawn one. A drawn cup
 * flattened that way comes out about 13% short of the blank the die actually
 * needs, because rigidity treats stretch and compression alike and knows
 * nothing about the metal. This pass starts from that flat and moves the
 * vertices to minimise the plastic work of forming the part from it — the
 * one-step inverse approach every forming package's quick estimator uses
 * (FASTBLANK, AutoForm-OneStep, NX One-Step): the formed shape is fixed, the
 * flat is the unknown, the material is rigid-plastic with power-law hardening
 * σ̄ = K·ε̄ⁿ, von Mises, incompressible, Hencky strain. The research prototype
 * with this energy landed within 0.62% of the textbook blank for a drawn cup
 * (research/fastblank/README.md).
 *
 * Per triangle, with F the deformation gradient from flat to formed and
 * σ₁, σ₂ its principal stretches: ε₁ = ln σ₁, ε₂ = ln σ₂, ε₃ = −ε₁ − ε₂
 * (volume constancy), ε̄ = √((2/3)(ε₁² + ε₂² + ε₃²)), and the work per unit
 * volume W = K·ε̄ⁿ⁺¹/(n + 1). The energy is Σ A₃ᵢ·Wᵢ (gauge and K are the same
 * for every triangle and drop out of the minimiser). The gradient goes through
 * the singular values of F analytically — dεₖ = uₖᵀ dF vₖ / σₖ with
 * dF = −F·dJf·Jf⁻¹ — and the minimisation is L-BFGS with a backtracking line
 * search. ε̄ is regularised near zero so n < 1 keeps a finite gradient.
 *
 * The thinning map ε₃ and the (major, minor) strain pairs are what the
 * forming-limit check (src/engine/forming-properties.ts) reads.
 */
import { measureFlat, type FlatInternals, type UnfoldedSkin } from './blank-unfold.js';

export interface InverseOptions {
  /** Strain-hardening exponent of σ̄ = K·ε̄ⁿ. 1 is the quadratic (linear-hardening) energy the prototype validated. */
  nValue?: number;
  maxIterations?: number;
  /** Relative energy decrease below which the solve stops. */
  tolerance?: number;
}

export interface StrainSummary {
  /** Area-weighted thinning percentiles, percent of gauge (positive = thinner). The extremes
   *  are the 99.5th percentile over the well-shaped triangles: OCCT meshes a bend wall as
   *  slivers, and a sliver's strain says nothing about the metal around it. */
  thinningP50Pct: number;
  thinningP95Pct: number;
  maxThinningPct: number;
  maxThickeningPct: number;
  /** The worst (major, minor) true-strain pairs by major strain — what the FLC check reads. */
  strainPoints: Array<[number, number]>;
}

export interface InverseResult {
  flat: Omit<UnfoldedSkin, 'iterations' | 'internals'>;
  internals: FlatInternals;
  iterations: number;
  energyStart: number;
  energyEnd: number;
  strain: StrainSummary;
  nValue: number;
}

const EPS_REG = 1e-3;

/** Energy and gradient of the plastic work over the real triangles. */
function energyAndGradient(f: FlatInternals, U: Float64Array, n: number, grad: Float64Array | null): number {
  const { T, X, mReal } = f;
  if (grad) grad.fill(0);
  let E = 0;
  for (let i = 0; i < mReal; i++) {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    // Jf columns are the flat edge vectors; J3 the formed ones (local frame).
    const f00 = U[2 * b] - U[2 * a], f10 = U[2 * b + 1] - U[2 * a + 1];
    const f01 = U[2 * c] - U[2 * a], f11 = U[2 * c + 1] - U[2 * a + 1];
    const det = f00 * f11 - f01 * f10;
    const g00 = X[6 * i + 2], g10 = X[6 * i + 3], g01 = X[6 * i + 4], g11 = X[6 * i + 5];
    const A3 = Math.abs(g00 * g11 - g01 * g10) / 2;
    if (Math.abs(det) < 1e-12 || A3 < 1e-12) continue;
    const i00 = f11 / det, i01 = -f01 / det, i10 = -f10 / det, i11 = f00 / det;
    // F = J3 · Jf⁻¹
    const F00 = g00 * i00 + g01 * i10, F01 = g00 * i01 + g01 * i11;
    const F10 = g10 * i00 + g11 * i10, F11 = g10 * i01 + g11 * i11;
    // Principal stretches from C = FᵀF: eigenvalues σ², eigenvectors the right
    // singular vectors v_k. Only v_k is needed for the gradient, since
    // Fᵀu_k = σ_k v_k, which sidesteps every sign and transpose convention.
    const c00 = F00 * F00 + F10 * F10, c01 = F00 * F01 + F10 * F11, c11 = F01 * F01 + F11 * F11;
    const tr = c00 + c11, dt = c00 * c11 - c01 * c01;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - dt));
    const l1 = Math.max(1e-18, tr / 2 + disc), l2 = Math.max(1e-18, tr / 2 - disc);
    const s1 = Math.sqrt(l1), s2 = Math.sqrt(l2);
    const psi = 0.5 * Math.atan2(2 * c01, c00 - c11);
    const v1 = [Math.cos(psi), Math.sin(psi)], v2 = [-Math.sin(psi), Math.cos(psi)];
    const e1 = Math.log(Math.max(1e-9, s1)), e2 = Math.log(Math.max(1e-9, s2));
    const e3 = -e1 - e2;
    const eqRaw = Math.sqrt((2 / 3) * (e1 * e1 + e2 * e2 + e3 * e3));
    const eq = Math.sqrt(eqRaw * eqRaw + EPS_REG * EPS_REG);
    E += A3 * Math.pow(eq, n + 1) / (n + 1);
    if (!grad) continue;
    // dW/dε̄ = ε̄ⁿ; dε̄/dε₁ = (2/3)(2ε₁ + ε₂)/ε̄, dε̄/dε₂ = (2/3)(2ε₂ + ε₁)/ε̄.
    const dW = Math.pow(eq, n);
    const w1 = A3 * dW * (2 / 3) * (2 * e1 + e2) / eq;
    const w2 = A3 * dW * (2 / 3) * (2 * e2 + e1) / eq;
    // dε_k/dJf_{ab} = −(v_k)_a (Jf⁻¹ v_k)_b, from dσ_k = u_kᵀ dF v_k and dF = −F dJf Jf⁻¹.
    const Jiv1 = [i00 * v1[0] + i01 * v1[1], i10 * v1[0] + i11 * v1[1]];
    const Jiv2 = [i00 * v2[0] + i01 * v2[1], i10 * v2[0] + i11 * v2[1]];
    const d00 = -(w1 * v1[0] * Jiv1[0] + w2 * v2[0] * Jiv2[0]);
    const d01 = -(w1 * v1[0] * Jiv1[1] + w2 * v2[0] * Jiv2[1]);
    const d10 = -(w1 * v1[1] * Jiv1[0] + w2 * v2[1] * Jiv2[0]);
    const d11 = -(w1 * v1[1] * Jiv1[1] + w2 * v2[1] * Jiv2[1]);
    // Jf = [u_b − u_a | u_c − u_a]: column 0 = (f00, f10) from b, column 1 = (f01, f11) from c.
    grad[2 * b] += d00; grad[2 * b + 1] += d10;
    grad[2 * c] += d01; grad[2 * c + 1] += d11;
    grad[2 * a] -= d00 + d01; grad[2 * a + 1] -= d10 + d11;
  }
  return E;
}

/** Sign of the flat orientation the majority of real triangles have at x. */
function majorityOrientation(f: FlatInternals, x: Float64Array): number {
  let pos = 0, neg = 0;
  for (let i = 0; i < f.mReal; i++) {
    const a = f.T[3 * i], b = f.T[3 * i + 1], c = f.T[3 * i + 2];
    const det = (x[2 * b] - x[2 * a]) * (x[2 * c + 1] - x[2 * a + 1]) - (x[2 * c] - x[2 * a]) * (x[2 * b + 1] - x[2 * a + 1]);
    if (det > 0) pos++; else if (det < 0) neg++;
  }
  return pos >= neg ? 1 : -1;
}

/** True when no real triangle is inverted against `sign` at x — the injectivity barrier. */
function orientationKept(f: FlatInternals, x: Float64Array, sign: number): boolean {
  for (let i = 0; i < f.mReal; i++) {
    const a = f.T[3 * i], b = f.T[3 * i + 1], c = f.T[3 * i + 2];
    const det = (x[2 * b] - x[2 * a]) * (x[2 * c + 1] - x[2 * a + 1]) - (x[2 * c] - x[2 * a]) * (x[2 * b + 1] - x[2 * a + 1]);
    if (det * sign <= 0) return false;
  }
  return true;
}

/** Principal strains of every real triangle on a flat U, for the thinning summary. */
export function strainSummary(f: FlatInternals, U: Float64Array, keep = 200): StrainSummary {
  const { T, X, mReal } = f;
  const thin: Array<[number, number]> = [];   // [thinning fraction, area]
  const pts: Array<[number, number, number]> = [];   // [e1, e2, area]
  let total = 0;
  // A well-shaped triangle: at least a tenth of the mean area and no angle under ~3°.
  let meanArea = 0;
  for (let i = 0; i < mReal; i++) meanArea += Math.abs(X[6 * i + 2] * X[6 * i + 5] - X[6 * i + 4] * X[6 * i + 3]) / 2;
  meanArea /= Math.max(1, mReal);
  const wellShaped = (i: number, A3: number): boolean => {
    if (A3 < 0.1 * meanArea) return false;
    const x1 = X[6 * i + 2], y1 = X[6 * i + 3], x2 = X[6 * i + 4], y2 = X[6 * i + 5];
    const l0 = Math.hypot(x1, y1), l1 = Math.hypot(x2 - x1, y2 - y1), l2 = Math.hypot(x2, y2);
    const longest = Math.max(l0, l1, l2);
    return 2 * A3 / (longest * longest) > 0.05;   // height ÷ longest side
  };
  for (let i = 0; i < mReal; i++) {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    const f00 = U[2 * b] - U[2 * a], f10 = U[2 * b + 1] - U[2 * a + 1];
    const f01 = U[2 * c] - U[2 * a], f11 = U[2 * c + 1] - U[2 * a + 1];
    const det = f00 * f11 - f01 * f10;
    const g00 = X[6 * i + 2], g10 = X[6 * i + 3], g01 = X[6 * i + 4], g11 = X[6 * i + 5];
    const A3 = Math.abs(g00 * g11 - g01 * g10) / 2;
    if (Math.abs(det) < 1e-12 || A3 < 1e-9) continue;
    const i00 = f11 / det, i01 = -f01 / det, i10 = -f10 / det, i11 = f00 / det;
    const F00 = g00 * i00 + g01 * i10, F01 = g00 * i01 + g01 * i11;
    const F10 = g10 * i00 + g11 * i10, F11 = g10 * i01 + g11 * i11;
    const Em = (F00 + F11) / 2, Fm = (F00 - F11) / 2, Gm = (F10 + F01) / 2, Hm = (F10 - F01) / 2;
    const Q = Math.hypot(Em, Hm), R = Math.hypot(Fm, Gm);
    const e1 = Math.log(Math.max(1e-9, Q + R)), e2 = Math.log(Math.max(1e-9, Math.abs(Q - R)));
    const e3 = -e1 - e2;
    const thinning = 1 - Math.exp(e3);      // > 0 thinner
    thin.push([thinning, A3]); total += A3;
    if (wellShaped(i, A3)) pts.push([Math.max(e1, e2), Math.min(e1, e2), A3]);
  }
  thin.sort((p, q) => p[0] - q[0]);
  const pct = (q: number) => { let acc = 0; for (const [v, a] of thin) { acc += a; if (acc >= q * total) return v; } return thin.length ? thin[thin.length - 1][0] : 0; };
  pts.sort((p, q) => q[0] - p[0]);
  return {
    thinningP50Pct: pct(0.5) * 100,
    thinningP95Pct: pct(0.95) * 100,
    maxThinningPct: pct(0.995) * 100,
    maxThickeningPct: -pct(0.005) * 100,
    strainPoints: pts.slice(0, keep).map(([e1, e2]) => [Math.round(e1 * 1e4) / 1e4, Math.round(e2 * 1e4) / 1e4]),
  };
}

/**
 * Minimise the plastic work from the unfold's flat. Returns the measured flat
 * (outline, area, rectangle), the thinning summary and the energies.
 */
export function inverseForm(f: FlatInternals, opts: InverseOptions = {}): InverseResult {
  const n = opts.nValue ?? 1;
  const maxIt = opts.maxIterations ?? 300;
  const tol = opts.tolerance ?? 1e-8;
  const N = f.U.length;
  const x = Float64Array.from(f.U);
  const g = new Float64Array(N);
  let E = energyAndGradient(f, x, n, g);
  const E0 = E;
  // The unfold's flat is fold-free; keep it so. A step that inverts a triangle
  // is refused in the line search rather than penalised in the energy.
  const sign = majorityOrientation(f, x);
  // L-BFGS, m = 8.
  const m = 8;
  const S: Float64Array[] = [], Y: Float64Array[] = [], rho: number[] = [];
  const q = new Float64Array(N), d = new Float64Array(N), xNew = new Float64Array(N), gNew = new Float64Array(N);
  let it = 0;
  for (; it < maxIt; it++) {
    // Two-loop recursion → search direction d = −H g.
    q.set(g);
    const alpha: number[] = new Array(S.length);
    for (let k = S.length - 1; k >= 0; k--) {
      let sq = 0; for (let j = 0; j < N; j++) sq += S[k][j] * q[j];
      alpha[k] = rho[k] * sq;
      for (let j = 0; j < N; j++) q[j] -= alpha[k] * Y[k][j];
    }
    let gamma = 1;
    if (S.length) {
      const k = S.length - 1;
      let sy = 0, yy = 0;
      for (let j = 0; j < N; j++) { sy += S[k][j] * Y[k][j]; yy += Y[k][j] * Y[k][j]; }
      gamma = yy > 0 ? sy / yy : 1;
    } else {
      // First step: scale so the initial move is a small fraction of the mesh.
      let gn = 0; for (let j = 0; j < N; j++) gn += g[j] * g[j];
      gamma = gn > 0 ? 1e-2 * Math.sqrt(N) / Math.sqrt(gn) : 1;
    }
    for (let j = 0; j < N; j++) q[j] *= gamma;
    for (let k = 0; k < S.length; k++) {
      let yq = 0; for (let j = 0; j < N; j++) yq += Y[k][j] * q[j];
      const beta = rho[k] * yq;
      for (let j = 0; j < N; j++) q[j] += S[k][j] * (alpha[k] - beta);
    }
    for (let j = 0; j < N; j++) d[j] = -q[j];
    let gd = 0; for (let j = 0; j < N; j++) gd += g[j] * d[j];
    if (gd >= 0) { for (let j = 0; j < N; j++) d[j] = -g[j]; gd = 0; for (let j = 0; j < N; j++) gd += g[j] * d[j]; S.length = 0; Y.length = 0; rho.length = 0; }
    // Backtracking Armijo line search.
    let step = 1, ENew = Infinity, ok = false;
    for (let ls = 0; ls < 30; ls++) {
      for (let j = 0; j < N; j++) xNew[j] = x[j] + step * d[j];
      if (orientationKept(f, xNew, sign)) {
        ENew = energyAndGradient(f, xNew, n, gNew);
        if (Number.isFinite(ENew) && ENew <= E + 1e-4 * step * gd) { ok = true; break; }
      }
      step *= 0.5;
    }
    if (!ok) break;
    // Update the history.
    const s = new Float64Array(N), y = new Float64Array(N);
    let sy = 0;
    for (let j = 0; j < N; j++) { s[j] = xNew[j] - x[j]; y[j] = gNew[j] - g[j]; sy += s[j] * y[j]; }
    if (sy > 1e-18) {
      S.push(s); Y.push(y); rho.push(1 / sy);
      if (S.length > m) { S.shift(); Y.shift(); rho.shift(); }
    }
    x.set(xNew); g.set(gNew);
    const rel = (E - ENew) / Math.max(1e-300, Math.abs(E));
    E = ENew;
    if (rel < tol) { it++; break; }
  }
  const internals: FlatInternals = { ...f, U: x };
  return {
    flat: measureFlat(internals),
    internals,
    iterations: it,
    energyStart: E0,
    energyEnd: E,
    strain: strainSummary(internals, x),
    nValue: n,
  };
}

/** Finite-difference check of the analytic gradient, for the tests. */
export function gradientCheck(f: FlatInternals, n = 1, probes = 6): { maxRelErr: number } {
  const N = f.U.length;
  const g = new Float64Array(N);
  const E0 = energyAndGradient(f, f.U, n, g);
  let maxRel = 0;
  const h = 1e-6;
  for (let p = 0; p < probes; p++) {
    const j = Math.floor(((p + 0.5) / probes) * N);
    const x = Float64Array.from(f.U);
    x[j] += h; const Ep = energyAndGradient(f, x, n, null);
    x[j] -= 2 * h; const Em = energyAndGradient(f, x, n, null);
    const fd = (Ep - Em) / (2 * h);
    const rel = Math.abs(fd - g[j]) / Math.max(1e-9, Math.abs(fd), Math.abs(g[j]));
    if (rel > maxRel) maxRel = rel;
  }
  void E0;
  return { maxRelErr: maxRel };
}
