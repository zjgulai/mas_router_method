# repo-vitals

一个仓库名进去，一句可审计的结论出来。

```
node src/index.js --repo moment/moment
node src/index.js --repo jquery/jquery --json
node test/runner.js
```

无依赖，Node 22+。设 `GITHUB_TOKEN` 可提高 API 限额。

**它看什么**：作者是否声明废弃、维护活跃度、是否归档、贡献者数量、许可证、issue 负载（按星数标准化）。

**它不看什么**（每个结论都会打印出来）：代码是否能用、API 是否好写、是否解决你的问题、安全历史、维护者是否响应 issue。

**已知限制**：只读 README 前 2000 字符；贡献者数是"总线因子"的代理而非本身；issue 负载说不清响应速度。

## 检查

`node test/runner.js` — 22 条，分三组：
- A 组（机制）：来源可追溯、失败不出结论、结论与表格一致、可重复
- B 组（**结果对不对**）：已知坏样本必须判坏、已知好样本不能误杀、每条信号必须说明盲区
- 降级：哪个取数失败该停、哪个只算缺口

B 组是这套方法第一版缺失的那一类。
