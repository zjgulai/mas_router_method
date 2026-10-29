"""每一个生成器共用的两个路径。

写在一处，因为六个生成器各写一份路径就是六处会漂移的声明——
这个仓库已经因为同一个事实存两份而错过一次（阶段编号）。

输出目录**只能**由 build.mjs 通过 STAGE_DIR 传入，没有回落值。
回落到直接写 docs/site 会让生成绕过孤儿检测，那是这个命令唯一的防线。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SKILLS = os.path.join(REPO, '.claude', 'skills')


def out_dir():
    d = os.environ.get('STAGE_DIR')
    if not d:
        raise SystemExit(
            'STAGE_DIR is not set. Run `node scripts/site/build.mjs` instead of '
            'calling a generator directly — it stages the output and checks for orphans.'
        )
    return d
