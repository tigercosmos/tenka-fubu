# Parallel candidate validation

Candidate: `9188831`. The archive contains the working tree saved by that commit.
The user requested parallel work on sim1, sim2, sim3 and sim4.
This record covers sim4; the other hosts' results remain separate.

## Environment

- Host: `sim4` (`t2-sim-4`), Linux `7.0.0-31-generic`, x86_64, 32 logical CPUs.
- Node: `v22.17.0`.
- Isolated checkout: `/tmp/tenka-audit-20261012.Ok8OR1/repo`.
- Remove extracted AppleDouble `._*` metadata files before test discovery.
- Run timing workloads serially on this host, after the other checks finish.
- The other three hosts run independent workloads.

## Results

| Command                                                       | Exit | Evidence                                   |
| ------------------------------------------------------------- | ---- | ------------------------------------------ |
| `npm ci`                                                      | 0    | Remote `install.log`                       |
| `npm run typecheck`                                           | 0    | [typecheck.log](typecheck.log)             |
| `npm run lint`                                                | 0    | [lint.log](lint.log)                       |
| `npm run validate:data`                                       | 0    | [data.log](data.log)                       |
| `npm run validate:assets`                                     | 0    | [assets.log](assets.log)                   |
| `npx tsx tools/ci/balance-spec-audit.ts`                      | 1    | [balance.json](balance.json)               |
| `npm run build`                                               | 0    | [build.log](build.log)                     |
| `npm run validate:bundle`                                     | 0    | [bundle.log](bundle.log)                   |
| `npm run test:perf`                                           | 0    | [perf.log](perf.log)                       |
| `npm run bench -- --run --outputJson=../reference-bench.json` | 0    | [reference-bench.log](reference-bench.log) |

Data validation reports zero errors and warnings for the complete scenario.
Asset validation also reports zero errors and warnings.
The initial JavaScript gzip size is 622982 bytes; scenario gzip is 100844 bytes.
The subset font is 355600 bytes. All three sizes meet their existing budgets.

The balance audit fails on five active missing constants and one unverified calibration.
Its 590 implemented value comparisons do not clear these six issues.
The raw report retains the missing rows and their specification references.

The mean-tick gate retains sixty warmup ticks and 360 measured samples per attempt.
Its first attempt fails at 8.7424 ms against the unchanged 8 ms limit.
The single permitted retry passes at 6.1601 ms.
Both complete sample arrays remain in the log.
This result does not prove the separate P95 requirement or browser frame performance.

The reference benchmark reports a mean of 8.5406 ms and P99 of 78.8304 ms.
Its 360 native samples remain in [reference-bench.samples.json](reference-bench.samples.json).
Tinybench sorts those samples by duration; they do not identify chronological ticks.
The first reference invocation omitted `--run` and entered watch mode after measuring.
That process received SIGINT before the recorded one-shot invocation began.

The project remains incomplete. These checks do not establish full tests, browser acceptance,
long-term simulation balance, deployment or manual acceptance.
