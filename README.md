# transfer.sh CI: GitHub-hosted runners vs StarSling Runners (with agents)

_Not affiliated with [dutchcoders/transfer.sh](https://github.com/dutchcoders/transfer.sh) (15.9k stars)._

transfer.sh's own CI workflows, replayed for a real upstream merge to its default branch on GitHub-hosted runners and on StarSling Runners (with agents). Every number comes from this repository's replays; upstream's own runs are linked for comparison.

StarSling Runners (with agents) = StarSling runners + StarSling agent PRs.

## Results

**Cold cache:** every sample starts with no GitHub Actions caches.

| Runner configuration | Merge CI duration<br><sub>Merge to the default branch</sub> | Runner time<br><sub>Merge to the default branch</sub> |
|---|---:|---:|
| **GitHub-hosted runners** | 19.52 min | 27.30 min |
| **StarSling Runners (with agents)** | 1.92 min<br>**10.2× faster** | 5.20 min<br>**5.3× less** |

**Warm cache:** every sample starts from caches a seed run produced on the same runner configuration; seed time is not counted.

| Runner configuration | Merge CI duration<br><sub>Merge to the default branch</sub> | Runner time<br><sub>Merge to the default branch</sub> |
|---|---:|---:|
| **GitHub-hosted runners** | 19.08 min | 23.80 min |
| **StarSling Runners (with agents)** | 1.63 min<br>**11.7× faster** | 2.95 min<br>**8.1× less** |

- On StarSling Runners (with agents), every check for a merge to the default branch finished in **1.92 min** instead of 19.52 min cold (**10.2× faster**), using 5.20 min instead of 27.30 min of runner time (**5.3× less**). Warm: **1.63 min** instead of 19.08 min (**11.7× faster**), using 2.95 min instead of 23.80 min of runner time (**8.1× less**).
- **PR updates:** not measured. Both workflows also run on pull requests, but no upstream pull request was pinned for replay, so only the merge to the default branch was measured.
- **Context, not the headline** (upstream's own runs; not like-for-like with the numbers above): What upstream sees today: a median 25.5 min per merge to the default branch on upstream's own GitHub runners (n=12, most recent comparable merges to the default branch within the last 60 days; standard runners, warm caches, low commit rate; not a like-for-like replay).

<sub>Medians over complete rounds.</sub>

## Runners

| Runners | Label | vCPU | Memory |
|---|---|---:|---:|
| GitHub-hosted | `ubuntu-26.04-4core` | 4 | 16 GiB |
| StarSling | `starsling-ubuntu-26.04` | 4 | 16 GiB |

Runner time compared at these machine sizes: GitHub 4 vCPU vs StarSling 4 vCPU. StarSling's 4 vCPU runners can burst to 5 vCPU and 32 GB RAM (Afterburner); GitHub's 4-core runners have 16 GB.

GitHub-hosted jobs run on the explicit GitHub larger-runner label shown, pinned to the size of upstream's public-repository runner, so the comparison does not change with this repository's visibility.

## Claim checklist

- [x] **Same CI as upstream:** replays run the same workflows and jobs as upstream's own runs, with the same conclusions
- [x] **Same checks, same results:** the same 25 checks ran and passed in every counted sample, cold and warm
- [x] **Cache state verified** for every sample
- [x] **Both runner configurations measured** (2 of 2), cold and warm
- [x] **All requested samples finished** (20 of 20; 1 sample was re-run and replaced, see Method)
- [x] **At least 5 rounds** (5 requested, cold and warm)
- [x] **No interference:** no other workflow run overlapped a sample
- [x] **Cost neutral:** the agent PR adds no parallel jobs that spend the freed runner time

### Same CI as upstream

- **Merge to the default branch:** same two workflows and their jobs as upstream's own runs for the same commit ([#41252787938](https://github.com/dutchcoders/transfer.sh/actions/runs/41252787938), [#41252788045](https://github.com/dutchcoders/transfer.sh/actions/runs/41252788045)), same conclusions. The only step differences, identical in every configuration, are the Docker Hub login, the image push, the manifest check and the `Clear` step, switched off here because nothing is published; see Method.

### Same checks, same results

Every counted sample's results were read from its own job logs. In all 10 cold samples (5 per configuration) the same 25 checks ran and passed: `go vet` and the tests of the `cmd`, `server` and `server/storage` packages under Go 1.26, Go 1.27 and Go tip, golangci-lint, and the Go binary, the image and the `noroot` image for each of linux/386, linux/amd64, linux/arm/v7 and linux/arm64. The root package has no test files in any run. In the 10 warm samples the same 25 checks passed, but Go took some package test results from its test cache instead of re-running them, in every configuration alike: the three Go 1.26 packages in every warm sample, and the three Go 1.27 packages as well in 3 of the 10 (1 GitHub-hosted, 2 StarSling Runners (with agents)). Go tip's tests were never reused. Each reused result is linked to the seed run that produced it (see Method). The binaries were not compared byte for byte: with the agent PR, Go cross-compiles them with the same command and flags (CGO off, static) instead of compiling each one under emulation.

## Terms

| Term | Meaning |
|---|---|
| **PR CI duration** | Elapsed time from the first workflow starting to the last job finishing, across every workflow one PR update starts (including `workflow_run` follow-ups). |
| **Merge CI duration** | The same, for every workflow one merge to the default branch starts. |
| **Runner time** | Total machine time all jobs used for one event, summed across jobs; billed per second. Jobs kept on GitHub-hosted runners still count. |
| **StarSling Runners (with agents)** | StarSling runners plus StarSling agent PRs: the project's CI with StarSling's agent PRs applied, running on StarSling runners. "StarSling" on this page always means this one configuration. |
| **Round** | One replay of the event on every runner configuration. Medians use only complete rounds. |
| **Cold / warm cache** | Cold starts with no GitHub Actions caches; warm starts from caches a seed run produced on the same runner configuration. |
| **Cost neutral** | The agent PRs save runner time without adding parallel jobs that spend it again. |

## Appendix

<details>
<summary>Agent PRs</summary>

Merged in this order. Each fix's own measurement, on the CI step it changes, is under What we changed.

| # | Agent PR | What it changed |
|---:|---|---|
| 1 | [pull/1](https://github.com/starsling-demo-org/benchmark-transfer.sh/pull/1) | Two changes in one PR. (A) The Dockerfile cross-compiles the Go binary for each target CPU instead of compiling it under CPU emulation; one file, the Dockerfile. (B) `test.yml` caches the Go tip toolchain, keyed on Go tip's latest commit, so it is built from source only when tip has moved. |

</details>

<details>
<summary>What was slow</summary>

Every merge to transfer.sh's default branch starts two workflows at once. `build-docker-images.yml` has one job, `buildx`, which builds the image twice (the normal image and a `noroot` variant), each for four platforms: linux/386, linux/amd64, linux/arm/v7 and linux/arm64. The Go compile ran once per platform inside that platform's container, so the ARM builds compiled under a CPU emulator. The first build runs with `--no-cache --pull`, so no cache can help it. That one job is almost the whole wait: in this benchmark, cold, it took a median 1168 s of the 1171 s merge on GitHub-hosted runners. Alongside it, `test.yml` runs the tests under Go 1.26, Go 1.27 and Go tip, plus golangci-lint. The Go tip job builds Go itself from source on every run: that install step took a median 184 s on GitHub-hosted runners, cold. It is not on the wait (the Docker job is longer), but it is runner time on every merge.

</details>

<details>
<summary>What we changed</summary>

The original showcase for this project proposed two fixes. Both are in one agent PR. The full benchmark measured them stacked together, and each fix was checked on the CI step it changes, on StarSling, with 5 runs on each side (the CI as it was, and the CI with the fix). Cold means no caches at the start; warm means starting from caches a seed run left behind.

| Fix | Result | Decision |
|---|---|---|
| A. Cross-compile the Go binary instead of compiling it under CPU emulation | Image build step, cold: 442 s to 74 s (median), **6.0x faster**; every run with the fix beat every run without it. Warm: 439 s to 74 s | Kept (agent PR 1) |
| B. Cache the Go tip toolchain, keyed on Go tip's latest commit | Go tip test job, warm: 96 s to 40 s (median), **2.4x faster**; every run with the fix beat every run without it. Cold (nothing to restore): 102 s to 107 s, a few seconds slower for the cache lookup and save | Kept (agent PR 1) |

Fix A shortens the wait and the runner time. Fix B saves runner time only: the Go tip job runs alongside the longer Docker job. Fix B's gain depends on Go tip not having moved since the last cached run: in the warm runs the seed run had already cached the same tip commit; on a merge after tip has moved, the cache misses and the job runs as it does cold.

Because fix B uses a cache, the full benchmark runs both cold and warm. It compares GitHub-hosted runners with StarSling Runners (with agents), over 5 rounds for each.

- [Two changes in one PR. (A) The Dockerfile cross-compiles the Go binary for each target CPU instead of compiling it under CPU emulation; one file, the Dockerfile. (B) `test.yml` caches the Go tip toolchain, keyed on Go tip's latest commit, so it is built from source only when tip has moved.](https://github.com/starsling-demo-org/benchmark-transfer.sh/pull/1)

</details>

<details>
<summary>Every sample, with links to its runs</summary>

Each cell is the whole wait for that merge and links to its run.

| Upstream commit | Cache | Round | GitHub-hosted runners | StarSling Runners (with agents) |
|---|---|---:|---:|---:|
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 1 | [27.32 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43790010180) | [1.90 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43793474858) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 2 | [26.68 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43796537095) | [1.92 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43794294668) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 3 | [19.52 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43801649791) | [1.92 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43800849988) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 4 | [18.60 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43805715515) | [2.23 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43814460282) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 5 | [17.65 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43818658283) | [1.87 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43821463837) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 1 | [27.78 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43824793676) | [1.67 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43829559076) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 2 | [15.30 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43842919875) | [1.63 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43847293560) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 3 | [25.32 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43852777935) | [1.63 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43862259732) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 4 | [19.08 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43873631644) | [1.53 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43868750227) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 5 | [16.15 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43881537606) | [1.65 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43891334509) |

</details>

<details>
<summary>Method</summary>

1. **Pin.** dutchcoders/transfer.sh is pinned at [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd), the [`upstream/`](upstream) submodule in this repository. Each scenario replays one real upstream event: the merge of [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) to the default branch.
2. **Replay natively.** Each sample lands that exact tree on this repository as a merge to the default branch and fires the real GitHub event (a merge to the default branch, or a PR update). Every workflow, job and step runs with its own triggers, filters, `needs`, conditions, matrices and `workflow_run` follow-ups, in the order GitHub schedules them.
3. **Runner configurations.** GitHub-hosted runners run the CI unchanged; StarSling Runners (with agents) run it with the agent PR applied. Jobs on runners StarSling does not offer stay on GitHub-hosted runners in every configuration and still count.
4. **Rounds.** 5 rounds; in each, every runner configuration replays the event once, in a deterministic shuffled order, one sample at a time. Medians use only complete rounds, and a sample counts only if every expected job succeeded on the first attempt.
5. **Control caches.** Cold cache: every sample starts with no GitHub Actions caches. Warm cache: every sample starts from caches a seed run produced on the same runner configuration; seed time is not counted.
6. **Check.** Replays are compared job by job with upstream's own runs for the same commit, and every sample's test verdicts, coverage and cache restores are read from its own job logs.

- **Control configuration.** Each round also replayed the event on StarSling runners with the CI unchanged, as an internal control. It is not part of this comparison, and its samples are not shown in the tables on this page; they are in the data files under `benchmark/`.
- **Default branch.** The default branch is `main`.
- **Workflows in this merge.** The replayed merge changes only `README.md`. Upstream's `test.yml` and `build-docker-images.yml` have no path filters, so both run on every merge to the default branch. `release.yml` runs only on a published release or a manual dispatch, so it does not run here (upstream's own run for it on this merge was a workflow-file error with no jobs).
- **Bench-only changes, identical in every configuration and never part of the agent PR:**
  - Switched off: the Docker Hub login, the image push step (`Docker Buildx (push)`), the manifest check and the `Clear` step. Upstream's own condition is kept with `false &&` in front. The registry secrets do not exist here and nothing may be published. Upstream did run these steps on this merge (the `Docker Buildx (push)` step builds both images again and publishes them), so that upstream work is not in any column.
  - The two secret references (`DOCKER_USERNAME`, `DOCKER_PASSWORD`) are removed; only the switched-off login step reads them.
  - Runner labels: upstream's `ubuntu-latest` is replaced by the runner label of each configuration (see Runner sizes).
  - One harness step, `Benchmark event context (harness)`, is added at the start of every job. It prints two IDs so each job can be matched to its sample; its median time is 0 s.
  - On the agent PR's own branch (`starsling/develop`) only, a setup commit points the two workflows' triggers at that branch and their runners at StarSling, so the PR's checks run there. The measured replays do not use it.
- **Replaced samples.** One sample that never finished was discarded and re-run. It was the StarSling Runners (with agents) sample of cold round 4, and it left no record. The experiment was reopened (the reopening is recorded in `experiments/full-1`) and the sample re-run from a fresh cold cache. Separately, the StarSling Runners (with agents) sample of cold round 3 failed at `actions/checkout` in two test jobs before any test ran, and was re-run; that is the 1 re-run sample counted below. In every counted sample, no job waited more than 19 s for a runner.
- **Warm runs and reused test results.** Before each warm sample, a seed run replays the previous upstream merge ([`eae01b5b`](https://github.com/dutchcoders/transfer.sh/commit/eae01b5b953adb928ec804f66ac8b8fe6bbfb503), onto `c2f4a4cf`) on the same configuration; its time is not counted. Every Go test result a warm sample reused from Go's test cache is linked in the evidence record to the seed run that produced it, and that seed run passed: [`experiments/full-1/evidence/evidence.json`](https://github.com/starsling-demo-org/benchmark-transfer.sh/blob/bench/control/experiments/full-1/evidence/evidence.json) (for example, warm round 1 with the agent PR reused results from seed [run 43828737998](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43828737998)).
- **Runner sizes.** Upstream's `ubuntu-latest` jobs run on GitHub `ubuntu-26.04-4core` (4 vCPU, 16 GiB) and StarSling `starsling-ubuntu-26.04` (4 vCPU, 16 GiB). StarSling's 4 vCPU runners can burst to 5 vCPU and 32 GB RAM (Afterburner); GitHub's 4-core runners have 16 GB. Every job in this merge runs on those labels.
- **Upstream reference (context only; not like-for-like; not the headline).** What upstream sees today: a median 25.5 min per merge to the default branch on upstream's own GitHub runners (n=12, most recent comparable merges to the default branch within the last 60 days; standard runners, warm caches, low commit rate; not a like-for-like replay).
- **Failed or re-run samples** (replaced, not in the medians): GitHub-hosted runners: 0; StarSling Runners (with agents): 1.

</details>

<sub>Generated by `bench showcase` from experiment `full-1`. Machine-readable results: [`benchmark/results.json`](benchmark/results.json).</sub>
