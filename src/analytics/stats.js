// Statistical primitives (no dependencies).

export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs) {
  return xs.length ? sum(xs) / xs.length : null;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mode(xs) {
  if (!xs.length) return null;
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (best == null || c > best.c || (c === best.c && v < best.v)) best = { v, c };
  return best.v;
}

export function variance(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

export function stdDev(xs) {
  const v = variance(xs);
  return v == null ? null : Math.sqrt(v);
}

// Lanczos approximation.
export function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // series for P
    let ap = a;
    let del = 1 / a;
    let s = del;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-15) break;
    }
    return 1 - s * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // continued fraction for Q
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquarePValue(statistic, df) {
  if (df <= 0) return null;
  return Math.min(1, Math.max(0, gammaQ(df / 2, statistic / 2)));
}

/**
 * Chi-square goodness-of-fit. Cells with expected count < minExpected are merged
 * (adjacent cells when `ordered`, otherwise pooled into one "other" cell).
 */
export function chiSquareTest(observed, expectedProbs, { minExpected = 5, ordered = true } = {}) {
  const n = sum(observed);
  const cells = observed.map((o, i) => ({ o, e: expectedProbs[i] * n }));
  if (n === 0) return { statistic: null, df: 0, pValue: null, sampleSize: 0, insufficient: true, cells: 0 };

  let merged = [];
  if (ordered) {
    let acc = { o: 0, e: 0 };
    for (const c of cells) {
      acc = { o: acc.o + c.o, e: acc.e + c.e };
      if (acc.e >= minExpected) {
        merged.push(acc);
        acc = { o: 0, e: 0 };
      }
    }
    if (acc.e > 0 || acc.o > 0) {
      if (merged.length) {
        const last = merged.pop();
        merged.push({ o: last.o + acc.o, e: last.e + acc.e });
      } else merged.push(acc);
    }
  } else {
    const big = cells.filter((c) => c.e >= minExpected);
    const small = cells.filter((c) => c.e < minExpected);
    merged = [...big];
    if (small.length) {
      const pooled = small.reduce((a, c) => ({ o: a.o + c.o, e: a.e + c.e }), { o: 0, e: 0 });
      if (pooled.e >= minExpected || !merged.length) merged.push(pooled);
      else {
        const last = merged.pop();
        merged.push({ o: last.o + pooled.o, e: last.e + pooled.e });
      }
    }
  }
  merged = merged.filter((c) => c.e > 0);
  const df = merged.length - 1;
  if (df < 1 || merged.some((c) => c.e < minExpected)) {
    return { statistic: null, df: Math.max(df, 0), pValue: null, sampleSize: n, insufficient: true, cells: merged.length };
  }
  const statistic = sum(merged.map((c) => (c.o - c.e) ** 2 / c.e));
  return { statistic, df, pValue: chiSquarePValue(statistic, df), sampleSize: n, insufficient: false, cells: merged.length };
}

export function logChoose(n, k) {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomialUpperTail(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let total = 0;
  for (let i = k; i <= n; i++) {
    total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

export function binomialPmf(k, n, p) {
  if (k < 0 || k > n) return 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

// Abramowitz & Stegun 7.1.26
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** One-sided (greater) z-test of a sample mean against a known mean/variance. */
export function zTestGreater(sampleMean, n, popMean, popVariance) {
  if (!n || !popVariance) return { z: null, pValue: null };
  const z = (sampleMean - popMean) / Math.sqrt(popVariance / n);
  return { z, pValue: 1 - normalCdf(z) };
}
