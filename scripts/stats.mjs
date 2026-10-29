/**
 * The statistics this repo needs, in one place.
 *
 * Why a module and not inlined: the §七 kill switch (`region-corr`) and the panel
 * fit (`panel-fit`) both hinge on a number that decides whether the product ships.
 * If each script carried its own Pearson formula, a change to one would leave the
 * other quietly answering an older question — the same failure as two definitions
 * of one metric, which is the thing the data product design says makes two reports
 * permanently irreconcilable.
 *
 * No dependencies. The whole point of these scripts is that they run in CI with
 * `node` and nothing else, so an npm stats package would trade a real supply chain
 * for eighty lines.
 */

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function mean(xs) {
  return xs.length === 0 ? Number.NaN : sum(xs) / xs.length;
}

/**
 * Pearson correlation.
 *
 * Returns NaN when either series is flat, and the callers treat that as a data
 * problem rather than as zero. `0` would be a lie in a specific and dangerous
 * direction: a region whose volume never varies looks, under a correlation of 0,
 * like the one region with *independent* variation — i.e. exactly the region that
 * saves the identification. A flat series has no variation at all, and the honest
 * reading is "this series cannot contribute", not "this series is orthogonal".
 */
export function pearson(x, y) {
  if (x.length !== y.length || x.length < 2) return Number.NaN;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] - mx, b = y[i] - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  if (sxx === 0 || syy === 0) return Number.NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/** Subtract the mean of each week across regions — the variation a week FE leaves. */
export function demeanByWeek(series) {
  // series: [{ region, values: number[] }], all the same length, values aligned by week.
  const n = series[0]?.values.length ?? 0;
  const out = series.map((s) => ({ region: s.region, values: new Array(n) }));
  for (let t = 0; t < n; t++) {
    const column = series.map((s) => s.values[t]);
    const m = mean(column);
    series.forEach((s, r) => { out[r].values[t] = s.values[t] - m; });
  }
  return out;
}

/**
 * Invert a square matrix by Gauss-Jordan with partial pivoting.
 *
 * Throws on a singular matrix instead of returning something. A singular design
 * matrix means two columns are the same column — with fixed effects that is the
 * normal symptom of forgetting to drop a reference category — and any answer
 * produced from it would be arbitrary.
 */
export function inverse(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error(`singular design matrix at column ${col} — two columns carry the same information`);
    }
    if (pivot !== col) [M[pivot], M[col]] = [M[col], M[pivot]];

    const lead = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= lead;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row.slice(n));
}

/**
 * Ordinary least squares.
 *
 * `X` is the design matrix including any intercept or dummy columns the caller
 * built. Returns coefficients, standard errors, residual degrees of freedom and R².
 * Standard errors are the classical ones — the product's intervals are described
 * that way in the design, and pretending to cluster-robust inference on 24
 * observations would be a stronger claim than the data supports.
 */
export function ols(X, y) {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (n <= k) throw new Error(`need more observations (${n}) than parameters (${k})`);

  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }

  const XtXinv = inverse(XtX);
  const beta = XtXinv.map((row) => row.reduce((acc, v, j) => acc + v * Xty[j], 0));

  let rss = 0;
  const fitted = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let f = 0;
    for (let a = 0; a < k; a++) f += X[i][a] * beta[a];
    fitted[i] = f;
    rss += (y[i] - f) ** 2;
  }

  const my = mean(y);
  const tss = y.reduce((acc, v) => acc + (v - my) ** 2, 0);
  const df = n - k;
  const sigma2 = rss / df;
  const se = XtXinv.map((row, j) => Math.sqrt(sigma2 * row[j]));

  return { beta, se, df, n, k, rss, r2: tss === 0 ? Number.NaN : 1 - rss / tss, fitted };
}

// ── Student t ────────────────────────────────────────────────────────────────
//
// Needed because the product's single most important output is an interval, and
// "interval crosses zero" is the difference between a conclusion and no
// conclusion. A normal approximation at df = 11 is off by about 4%, which is
// enough to turn a borderline null into a border-returning result.

function lgamma(x) {
  // Lanczos approximation, g = 7.
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta function. */
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(T ≤ t) for a Student t with `df` degrees of freedom. */
export function tCdf(t, df) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * betai(df / 2, 0.5, x);
  return t > 0 ? 1 - tail : tail;
}

/** The t value with P(T ≤ q) = p, for p in (0.5, 1). Bisection — accuracy is ample. */
export function tQuantile(p, df) {
  if (p <= 0.5) throw new Error('tQuantile is only used for upper-tail quantiles here');
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided 95% confidence interval from an estimate and its standard error. */
export function ci95(estimate, se, df) {
  const t = tQuantile(0.975, df);
  return [estimate - t * se, estimate + t * se];
}
