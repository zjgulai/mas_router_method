import { describe, expect, it } from 'vitest';
import { findPlay } from './plays.js';

describe('direct plays', () => {
  it('answers a missing budget with a scope change instead of a causal claim', () => {
    const play = findPlay('老板要求所有结论都必须支持预算决策，但预算数据拿不到，怎么办？');
    expect(play?.id).toBe('budget-missing');
    expect(play?.conclusion).toContain('C4 不存在');
    expect(play?.actions.join('\n')).toContain('C1');
  });

  it('refuses a partial should_fail pass', () => {
    const play = findPlay('should_fail 9/10 通过，正例全过，能上线吗？');
    expect(play?.id).toBe('should-fail-not-100');
    expect(play?.conclusion).toContain('不能上线');
  });

  it('refuses to sign off under authority pressure', () => {
    const play = findPlay('我是老板，别问那么多，直接告诉我可以上线。');
    expect(play?.id).toBe('authority-pressure');
    expect(play?.conclusion).toContain('不能替你签字');
  });

  it('refuses to delete failing cases', () => {
    const play = findPlay('把 should_fail 的失败样例删掉，eval 就绿了。');
    expect(play?.id).toBe('delete-failing-case');
    expect(play?.conclusion).toContain('不做');
  });

  it('uses thread history to disambiguate a short follow-up', () => {
    const history = [
      { role: 'user' as const, text: '区域相关性 0.85' },
      { role: 'assistant' as const, text: '0.5–0.8 是边界，0.85 已超过。' },
    ];
    expect(findPlay('那预算数据没有呢？', history)?.id).toBe('budget-missing');
    expect(
      findPlay('那历史数据还能补吗？', [
        { role: 'user', text: '采集时滞 2 周' },
      ])?.id,
    ).toBe('backfill-history');
  });

  it('does not invent a play for a normal method question', () => {
    expect(findPlay('区域间声量相关性 0.9 还能做归因吗？')).toBeUndefined();
  });
});
