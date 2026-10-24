# link-digest

把网页变成短摘要的小工具。一个地址进去，一份摘要出来。

```
node src/index.js --url https://example.com
node src/index.js --offline test.html --json
node test/run-tests.js
```

无依赖。需要 Node 22+。

**已知限制**（不是"以后改进"，是现在就存在）：
- 提取是粗糙的：它按标签去壳，不区分正文和导航。维基百科这类页面会把语言列表混进摘要。
- 不执行 JavaScript，所以只对服务端渲染的页面有效。
- 中英混排、日文、阿拉伯文的分句都不准。分句规则只对拉丁句号有效。
- 日志只有一个文件，没有轮转。
