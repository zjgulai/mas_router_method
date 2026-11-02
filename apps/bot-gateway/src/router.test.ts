import { describe, expect, it } from 'vitest';
import { isRecipeIntent } from './router.js';

describe('isRecipeIntent', () => {
  it('matches a tiktok video url', () => {
    expect(
      isRecipeIntent('给 Sunday Press 拆一条 https://www.tiktok.com/@x/video/7300000000000000001'),
    ).toBe(true);
  });

  it('matches a vt.tiktok.com short link', () => {
    expect(isRecipeIntent('看看这个 https://vt.tiktok.com/ZSjkAbCdE/')).toBe(true);
  });

  it('matches the /recipe prefix', () => {
    expect(isRecipeIntent('/recipe 把上周那条健身视频拆给我们')).toBe(true);
  });

  it('does not match a plain consult question', () => {
    expect(isRecipeIntent('口径表和指标字典有什么区别')).toBe(false);
  });

  it('does not match a non-tiktok url', () => {
    expect(isRecipeIntent('参考这篇 https://example.com/blog/tiktok-tips')).toBe(false);
  });

  it('matches when the url sits mid-sentence', () => {
    expect(
      isRecipeIntent('这条 https://www.tiktok.com/@creator/video/1234567890 为什么火，顺便拆一份'),
    ).toBe(true);
  });
});
