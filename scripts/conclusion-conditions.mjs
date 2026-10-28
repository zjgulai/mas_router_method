/**
 * Falsification conditions, as functions that can actually run.
 *
 * The design says the report layer's only real acceptance test is "人为造一次证伪
 * 触发，看它报不报". That only works if a falsification condition is a program, not
 * a sentence. "如果结论错了" cannot be triggered; `panel slope interval crosses zero`
 * can.
 *
 * So conditions live here as named checks over a small, fixed input shape:
 *
 *   { beta_ci, n_obs, region_coverage, kappa, design_effect_range, budget_changes }
 *
 * Each check returns { triggered: boolean, detail: string } — and `triggered: true`
 * means the conclusion is falsified, i.e. this is a *red* result. The naming is
 * deliberately about the check passing or firing, not about good or bad news: a
 * function called `isWrong()` returns true on a healthy conclusion, and someone will
 * invert it at a call site.
 *
 * One condition may be **unmeasurable** rather than satisfied. The fourth state
 * again: a check whose input is missing has not been passed. Returning `triggered:
 * false` for missing data is exactly the failure mode this repo keeps finding —
 * a green light that means "nobody looked".
 */

const ok = (detail) => ({ verdict: 'holds', triggered: false, detail });
const fire = (detail) => ({ verdict: 'falsified', triggered: true, detail });
const unknown = (detail) => ({ verdict: 'unmeasurable', triggered: false, detail });

export const CONDITIONS = {
  /**
   * Design §8.5 第 4 条 — the one most easily ignored and most important.
   * An interval spanning zero looks like a finding and says nothing.
   */
  'ci-excludes-zero': {
    what: '置信区间不跨 0',
    why: '跨过 0 的区间看起来像「有这个效应」，实际上什么都没说；产品必须标为「无结论」',
    check: ({ beta_ci }) => {
      if (!Array.isArray(beta_ci) || beta_ci.length !== 2) return unknown('no interval in the input');
      const [lo, hi] = beta_ci;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return unknown(`interval is not finite: [${lo}, ${hi}]`);
      if (lo <= 0 && hi >= 0) return fire(`interval [${fmt(lo)}, ${fmt(hi)}] contains 0`);
      return ok(`interval [${fmt(lo)}, ${fmt(hi)}] excludes 0`);
    },
  },

  /**
   * §8.5 第 3 条 — one mechanism or none. If the sign flips between regions there is
   * no common mechanism, and a pooled coefficient describes an average of opposites.
   */
  'regional-sign-consistent': {
    what: '各区域系数符号一致',
    why: '符号不一致说明没有统一机制，面板假设不成立',
    check: ({ region_betas }) => {
      if (!Array.isArray(region_betas) || region_betas.length < 2) return unknown('need coefficients for at least 2 regions');
      const signs = new Set(region_betas.map((b) => Math.sign(b)).filter((s) => s !== 0));
      if (signs.size > 1) return fire(`signs differ: ${region_betas.map(fmt).join(', ')}`);
      return ok(`all ${region_betas.length} regions share a sign`);
    },
  },


  /**
   * C2's condition, and it was missing.
   *
   * The design states it plainly: 滞后曲线无峰（单调下降或噪声）→ 说明没有可识别的传导，
   * 这条结论不成立. The condition list had seven entries and none of them could test a
   * lag curve, so C2 could only be "checked" with conditions written for C1 — which
   * silently pass. Found by running the new conclusion-card checker on a realistic C2.
   *
   * A peak means: the curve rises to a maximum and then falls. Two ways to have no peak —
   * monotone decrease (the effect is strongest at lag 0, so the "lag" story is wrong) and
   * noise (the maximum is within the noise of its neighbours). Both mean the same thing:
   * there is no transmission to identify.
   */
  'lag-has-peak': {
    what: '滞后曲线有峰',
    why: '无峰（单调下降或噪声）说明没有可识别的传导，滞后结构这条结论不成立',
    check: ({ lag_curve, lag_noise }) => {
      if (!Array.isArray(lag_curve) || lag_curve.length < 3) {
        return unknown('need at least three lags to talk about a peak');
      }
      if (!lag_curve.every((x) => Number.isFinite(x))) return unknown('lag curve has non-finite values');

      const maxAt = lag_curve.indexOf(Math.max(...lag_curve));
      // A peak at the last lag is not a peak — the curve may still be rising, or the
      // window is too short to see the fall. Both are 无法判断 about the peak, not断 about it.
      if (maxAt === lag_curve.length - 1) {
        return unknown(`the maximum is at the last lag (k=${maxAt}); the curve may not have turned yet — `
          + 'extend the window before concluding anything about a peak');
      }
      if (maxAt === 0) {
        return fire(`the curve is highest at lag 0 (${fmt(lag_curve[0])}) — the effect is contemporaneous, `
          + 'so there is no lag structure to report');
      }
      // Is the peak distinguishable from its neighbours? Without a noise scale, no.
      if (Number.isFinite(lag_noise) && lag_noise > 0) {
        const top = lag_curve[maxAt];
        const neighbour = Math.max(lag_curve[maxAt - 1], lag_curve[maxAt + 1] ?? -Infinity);
        if (top - neighbour <= lag_noise) {
          return fire(`the peak at k=${maxAt} (${fmt(top)}) is within the noise scale (${fmt(lag_noise)}) `
            + 'of its neighbours — that is a bump, not a peak');
        }
      }
      return ok(`peak at k=${maxAt} (${fmt(lag_curve[maxAt])}), falling on both sides`);
    },
  },

  /**
   * The shared confounder condition: C1 and C3 both die on an uncontrolled local event.
   *
   * The design puts it in C1's 证伪 as 存在未控制的本地事件（本地大促、本地竞品价格战）and
   * in C3's as 同期存在其他未控制事件（新品上市、平台活动）. It could not be a check until
   * there was somewhere to record those events — hence 已知事件 as input rather than a
   * judgement call by the model, which would always find a reason to say the window is clean.
   */
  'no-uncontrolled-events': {
    what: '窗口内没有未控制的本地事件',
    why: '本地大促、竞品价格战、新品上市会同时抬高声量与 GMV，效应被错误归给声量',
    check: ({ known_events, controlled }) => {
      if (!Array.isArray(known_events)) {
        return unknown('no event list in the input — an empty list is a claim that you looked, and that has to be supplied');
      }
      const controlledSet = new Set(Array.isArray(controlled) ? controlled : []);
      const loose = known_events.filter((e) => {
        const name = typeof e === 'string' ? e : (e && e.name) || '';
        return !controlledSet.has(name);
      });
      if (loose.length > 0) {
        return fire(`${loose.length} event(s) in the window are not in the control set: `
          + loose.slice(0, 3).map((e) => (typeof e === 'string' ? e : e.name)).join(', '));
      }
      return ok(`${known_events.length} event(s) in the window, all controlled`);
    },
  },

  /** §8.5 第 5 条 — below 0.7 the sentiment dimension is unusable and A2+/A2− collapse to A1. */
  'labelling-accurate': {
    what: '打标准确率 ≥ 0.7',
    why: '低于 0.7 情感维度不可用，A2+/A2− 退化为 A1',
    check: ({ kappa, accuracy }) => {
      if (!Number.isFinite(accuracy)) return unknown('no accuracy in the input — the gold set has not been compared');
      if (accuracy < 0.7) return fire(`accuracy ${fmt(accuracy)} < 0.7`);
      if (Number.isFinite(kappa) && kappa < 0.6) return fire(`Kappa ${fmt(kappa)} < 0.6 — the label definition itself is ambiguous, not the annotators`);
      return ok(`accuracy ${fmt(accuracy)}${Number.isFinite(kappa) ? `, Kappa ${fmt(kappa)}` : ''}`);
    },
  },

  /** §8.5 第 6 条 — below 40% the denominator is unusable and the product falls back to brand level. */
  'region-coverage-sufficient': {
    what: '区域归属覆盖率 ≥ 40%',
    why: '低于 40% 分母不可用，只能回到品牌整体层面，区域决策无法支撑',
    check: ({ region_coverage }) => {
      if (!Number.isFinite(region_coverage)) return unknown('no coverage in the input');
      if (region_coverage < 0.4) return fire(`coverage ${fmt(region_coverage)} < 0.40`);
      return ok(`coverage ${fmt(region_coverage)}`);
    },
  },

  /** §8.5 第 7 条 — a budget that moved once or twice has no identifying power for C4. */
  'budget-has-variation': {
    what: '预算在窗口内有足够的重新分配',
    why: '一年只调整一两次则 C4 无识别力，只能降级为描述性对比',
    check: ({ budget_changes }) => {
      if (!Number.isFinite(budget_changes)) return unknown('no budget history in the input');
      if (budget_changes < 3) return fire(`${budget_changes} reallocation(s) in the window — below 3, C4 has no identifying power`);
      return ok(`${budget_changes} reallocations`);
    },
  },

  /** §8.5 第 2 条 — controls that dominate mean the main effect is not volume. */
  'controls-do-not-reverse': {
    what: '加控制变量后结论不反转',
    why: '加控制变量后排序完全反转，说明主效应是某个控制变量，不是声量',
    check: ({ design_effect_range }) => {
      if (!Array.isArray(design_effect_range) || design_effect_range.length < 2) {
        return unknown('need the estimate before and after adding controls');
      }
      const [before, after] = design_effect_range;
      if (Math.sign(before) !== Math.sign(after)) {
        return fire(`estimate flips from ${fmt(before)} to ${fmt(after)} when controls are added`);
      }
      return ok(`${fmt(before)} → ${fmt(after)}, same direction`);
    },
  },

  /** A minimum sample, because a coefficient over twelve observations is arithmetic. */
  'sample-adequate': {
    what: '有效样本量达到下限',
    why: '周频下按周聚类后有效 N 远小于观测数；样本不足时区间宽到无信息',
    check: ({ n_obs, min_obs = 24 }) => {
      if (!Number.isFinite(n_obs)) return unknown('no observation count in the input');
      if (n_obs < min_obs) return fire(`${n_obs} observations < ${min_obs}`);
      return ok(`${n_obs} observations`);
    },
  },
};

const fmt = (x) => (Number.isFinite(x) ? Number(x).toFixed(3) : String(x));

/**
 * Run a conclusion's declared conditions against its data.
 *
 * `conditions` is the list of names from the conclusion card, in the order they
 * were written. `input` is whatever the pipeline could assemble.
 *
 * Returns per-condition results and a verdict:
 *
 *   falsified     at least one condition fired — the conclusion is dead
 *   unmeasurable  none fired, but at least one could not be evaluated
 *   active        every condition was evaluated and held
 *
 * `falsified` wins over `unmeasurable`: a conclusion already known to be wrong does
 * not become "maybe" because another check lacked data.
 */
export function checkConclusion(conditions, input) {
  const results = conditions.map((name) => {
    const c = CONDITIONS[name];
    if (c === undefined) {
      return { name, verdict: 'unmeasurable', triggered: false, detail: `no such condition "${name}" — a name that was never registered cannot be trusted to have passed` };
    }
    const r = c.check(input ?? {});
    return { name, what: c.what, why: c.why, ...r };
  });

  const verdict = results.some((r) => r.triggered) ? 'falsified'
    : results.some((r) => r.verdict === 'unmeasurable') ? 'unmeasurable'
      : 'active';

  return { verdict, results };
}
