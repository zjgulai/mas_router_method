"""robots.txt 与 sitemap.xml：给搜索引擎的最低限度门牌。

这两个文件由生成器产出而不是手工放置，原因与站点其他产物相同：孤儿检测必须
知道每个文件的来源。build.mjs 会把生成器产出的全部常规文件（不止 html）拷进
docs/site，因此这里产出的两个文件会被一并带走。

ORIGIN 写死为生产域名 main.luteos.com。GitHub Pages 上的副本会拿到指向生产
域名的 sitemap——这反而是对的：搜索引擎无论从哪个镜像发现站点，都应该收敛到
唯一的正式地址，而不是收录两个重复的 origin。
"""
import os

from paths import REPO, out_dir

ORIGIN = 'https://main.luteos.com'


def site_urls():
    """枚举全部公开页面：根级生成页 + originals/ 冻结原件。

    三条排除规则，各有一条理由：
    - docs/index.html 是 Pages 的跳转入口，不是内容页；
    - 404.html 不该被索引——它会以 404 状态被访问（nginx internal）；
    - originals/ 不经过暂存目录（手写原件，从未被生成器拷贝），
      所以直接从仓库里枚举。
    """
    out = out_dir()
    urls = []
    for name in sorted(os.listdir(out)):
        if not name.endswith('.html') or name == '404.html':
            continue
        loc = ORIGIN + '/' if name == 'index.html' else f'{ORIGIN}/{name}'
        urls.append(loc)
    originals = os.path.join(REPO, 'docs', 'site', 'originals')
    if os.path.isdir(originals):
        for name in sorted(os.listdir(originals)):
            if name.endswith('.html'):
                urls.append(f'{ORIGIN}/originals/{name}')
    # 根 URL 排第一：sitemap 顺序不影响抓取，但影响每一个打开它的人先看到什么。
    root = ORIGIN + '/'
    if root in urls:
        urls.remove(root)
    return [root] + urls


def robots_text():
    return (
        'User-agent: *\n'
        'Allow: /\n'
        f'Sitemap: {ORIGIN}/sitemap.xml\n'
    )


def sitemap_text(urls):
    # 不写 <lastmod>：生成必须逐字节可复现，任何取当前时间的字段都会让
    # CI 的「产物 == 生成器输出」检查变成掷骰子。
    entries = '\n'.join(f'    <loc>{u}</loc>' for u in urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{entries}\n'
        '</urlset>\n'
    )


if __name__ == '__main__':
    out = out_dir()
    urls = site_urls()
    with open(os.path.join(out, 'robots.txt'), 'w', encoding='utf-8') as fh:
        fh.write(robots_text())
    with open(os.path.join(out, 'sitemap.xml'), 'w', encoding='utf-8') as fh:
        fh.write(sitemap_text(urls))
    print(f'robots.txt + sitemap.xml 生成（{len(urls)} 个 URL）')
