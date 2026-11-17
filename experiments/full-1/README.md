# transfer.sh CI: GitHub vs StarSling

> Not affiliated with [dutchcoders/transfer.sh](https://github.com/dutchcoders/transfer.sh) (15.9k stars). This repository replays transfer.sh's own CI on real upstream commits to measure **how much machine time a push uses** (runner time) and **how long it waits for every check**, from the first workflow starting to the last job finishing.

## Results

**Pushes** (typical per push):

Cold: **StarSling: 5.3x less runner time** than GitHub per push (27.30 min → 5.20 min of machine time; GitHub 4 vCPU vs StarSling 4 vCPU). Warm: **StarSling: 8.1x less runner time** than GitHub per push (23.80 min → 2.95 min of machine time; GitHub 4 vCPU vs StarSling 4 vCPU).

StarSling = StarSling runners + StarSling agent PRs.

Cold: Wait: **StarSling is 10.2x faster** than GitHub for a push to finish every check (19.52 min → 1.92 min). Warm: Wait: **StarSling is 11.7x faster** than GitHub for a push to finish every check (19.08 min → 1.63 min).

| | Cold runner time | Cold vs GitHub | Cold wait | Cold vs GitHub | Warm runner time | Warm vs GitHub | Warm wait | Warm vs GitHub |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GitHub (the project's CI as is, on GitHub-hosted runners) | **27.30 min** | 1x | **19.52 min** | 1x | **23.80 min** | 1x | **19.08 min** | 1x |
| StarSling (StarSling runners + agent PRs) | **5.20 min** | **5.3x** less runner time | **1.92 min** | **10.2x** faster | **2.95 min** | **8.1x** less runner time | **1.63 min** | **11.7x** faster |

Runner time compared at these machine sizes: GitHub 4 vCPU vs StarSling 4 vCPU.

**Where the savings come from**

Runner time:

- Cold: StarSling runners alone (CI unchanged): 11.18 min, **2.4x** less runner time than GitHub
- Cold: StarSling agent PRs, on the same runners: **2.2x** less runner time (11.18 min → 5.20 min)
- Cold: Together: 2.4x × 2.2x = 5.3x
- Warm: StarSling runners alone (CI unchanged): 10.23 min, **2.3x** less runner time than GitHub
- Warm: StarSling agent PRs, on the same runners: **3.5x** less runner time (10.23 min → 2.95 min)
- Warm: Together: 2.3x × 3.5x = 8.1x

Wait:

- Cold: StarSling runners alone (CI unchanged): 7.73 min, **2.5x** faster than GitHub
- Cold: StarSling agent PRs, on the same runners: **4.0x** faster (7.73 min → 1.92 min)
- Cold: Together: 2.5x × 4.0x = 10.2x
- Warm: StarSling runners alone (CI unchanged): 7.72 min, **2.5x** faster than GitHub
- Warm: StarSling agent PRs, on the same runners: **4.7x** faster (7.72 min → 1.63 min)
- Warm: Together: 2.5x × 4.7x = 11.7x

> **1 sample(s) failed or were re-run and replaced** (StarSling + agent PRs: 1). Only complete samples are in the medians.

<sub>Typical = the median over complete rounds. Total = StarSling runners alone × agent PRs on top. Details are in the Appendix.</sub>

## Terms

| Term | Meaning |
|---|---|
| **Runner time** | Total machine time all jobs used for one push, summed across jobs; billed per second. |
| **Wait** | How long one push (or PR update) takes until every check has finished: from the first workflow starting to the last job finishing. |
| **GitHub** | The project's own CI, unchanged, on GitHub-hosted runners (the machines GitHub rents out). |
| **StarSling** | StarSling runners (faster machines) plus StarSling agent PRs (changes to the CI itself). |
| **Agent PRs** | Small pull requests StarSling's agent wrote against the project's CI to make it faster. Each is measured on its own in the Appendix. |
| **Median** | The middle result. Half the runs were faster, half were slower, so one odd run does not move it. |
| **Round** | One replay of the same change on every setup. Only rounds where every setup finished cleanly count. |
| **Cold** | Every run starts with no GitHub Actions caches (saved downloads and build output). |
| **Warm** | Every run starts from caches that an earlier run on the same setup saved. |

## Appendix

<details>
<summary>Agent PRs: what each one changed and its own effect</summary>

Merged in this order. Each row's effect comes from its own before/after experiment; the last row's cumulative wait is the headline.

| # | Agent PR | What it changed | Its own effect (typical wait, before → after) | Wait after it (cumulative) |
|---:|---|---|---|---:|
| 1 | [pull/1](https://github.com/starsling-demo-org/benchmark-transfer.sh/pull/1) | Two changes in one PR. (A) The Dockerfile cross-compiles the Go binary for each target CPU instead of compiling it under CPU emulation; one file, the Dockerfile. (B) `test.yml` caches the Go tip toolchain, keyed on Go tip's latest commit, so it is built from source only when tip has moved. | 7.73 min → 1.92 min (−75%), 5 runs per side | 1.92 min |

</details>

<details>
<summary>What was slow</summary>

Every push to transfer.sh's main branch starts two workflows at once. `build-docker-images.yml` has one job, `buildx`, which builds the image twice (the normal image and a `noroot` variant), each for four platforms: linux/386, linux/amd64, linux/arm/v7 and linux/arm64. The Go compile ran once per platform inside that platform's container, so the ARM builds compiled under a CPU emulator. The first build runs with `--no-cache --pull`, so no cache can help it. That one job is almost the whole wait: in this benchmark, cold, it took a median 1168 s of the 1171 s push on GitHub, and 456 s of the 464 s push on StarSling runners before any change. Alongside it, `test.yml` runs the tests under Go 1.26, Go 1.27 and Go tip, plus golangci-lint. The Go tip job builds Go itself from source on every run: that install step took a median 184 s on GitHub and 70 s on StarSling runners, cold. It is not on the wait (the Docker job is longer), but it is runner time on every push.

</details>

<details>
<summary>What we changed</summary>

The original showcase for this project proposed two fixes. Both are in one agent PR. The full benchmark measured them stacked together, and each fix was checked on the CI step it changes, on StarSling, with 5 runs on each side (the CI as it was, and the CI with the fix). Cold means no caches at the start; warm means starting from caches a seed run left behind.

| Fix | Result | Decision |
|---|---|---|
| A. Cross-compile the Go binary instead of compiling it under CPU emulation | Image build step, cold: 442 s to 74 s (median), **6.0x faster**; every run with the fix beat every run without it. Warm: 439 s to 74 s | Kept (agent PR 1) |
| B. Cache the Go tip toolchain, keyed on Go tip's latest commit | Go tip test job, warm: 96 s to 40 s (median), **2.4x faster**; every run with the fix beat every run without it. Cold (nothing to restore): 102 s to 107 s, a few seconds slower for the cache lookup and save | Kept (agent PR 1) |

Fix A shortens the wait and the runner time. Fix B saves runner time only: the Go tip job runs alongside the longer Docker job. Fix B's gain depends on Go tip not having moved since the last cached run: in the warm runs the seed run had already cached the same tip commit; on a push after tip has moved, the cache misses and the job runs as it does cold.

Because fix B uses a cache, the full benchmark runs both cold and warm. It compares GitHub-hosted runners, StarSling with the CI unchanged, and StarSling with the agent PR applied, over 5 rounds for each.

- [Two changes in one PR. (A) The Dockerfile cross-compiles the Go binary for each target CPU instead of compiling it under CPU emulation; one file, the Dockerfile. (B) `test.yml` caches the Go tip toolchain, keyed on Go tip's latest commit, so it is built from source only when tip has moved.](https://github.com/starsling-demo-org/benchmark-transfer.sh/pull/1)

</details>

<details>
<summary>Same checks, same results</summary>

Every counted sample's results were read from its own job logs. In all 15 cold samples (5 per configuration) the same 25 checks ran and passed: `go vet` and the tests of the `cmd`, `server` and `server/storage` packages under Go 1.26, Go 1.27 and Go tip, golangci-lint, and the Go binary, the image and the `noroot` image for each of linux/386, linux/amd64, linux/arm/v7 and linux/arm64. The root package has no test files in any run. In the 15 warm samples the same 25 checks passed, but Go took some package test results from its test cache instead of re-running them, in every configuration alike: the three Go 1.26 packages in every warm sample, and the three Go 1.27 packages as well in 4 of the 15 (1 GitHub, 1 StarSling unchanged, 2 StarSling + agent PR). Go tip's tests were never reused. Each reused result is linked to the seed run that produced it (see How it's measured). The binaries were not compared byte for byte: with the agent PR, Go cross-compiles them with the same command and flags (CGO off, static) instead of compiling each one under emulation.

</details>

<details>
<summary>Every push, round by round</summary>

Each cell is the whole wait for that push and links to its run.

| Upstream commit | Cache | Round | GitHub unchanged | StarSling unchanged (hardware alone) | StarSling + agent PRs |
|---|---|---:|---:|---:|---:|
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 1 | [27.32 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43790010180) | [9.63 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43788591651) | [1.90 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43793474858) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 2 | [26.68 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43796537095) | [7.58 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43795116314) | [1.92 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43794294668) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 3 | [19.52 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43801649791) | [7.73 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43804326957) | [1.92 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43800849988) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 4 | [18.60 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43805715515) | [7.73 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43815392255) | [2.23 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43814460282) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Cold | 5 | [17.65 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43818658283) | [7.60 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43816996067) | [1.87 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43821463837) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 1 | [27.78 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43824793676) | [7.57 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43832472277) | [1.67 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43829559076) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 2 | [15.30 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43842919875) | [7.72 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43836033149) | [1.63 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43847293560) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 3 | [25.32 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43852777935) | [8.47 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43859211134) | [1.63 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43862259732) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 4 | [19.08 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43873631644) | [7.55 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43865523585) | [1.53 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43868750227) |
| [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) | Warm | 5 | [16.15 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43881537606) | [7.78 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43887519720) | [1.65 min](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43891334509) |

</details>

<details>
<summary>How it's measured</summary>

1. **Pin.** dutchcoders/transfer.sh is pinned at [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd), the [`upstream/`](upstream) submodule in this repository. Each scenario replays one real upstream event: the merge of [`20efd891`](https://github.com/dutchcoders/transfer.sh/commit/20efd89137d4fe13122e1b4cd48b1deab0f34fbd) to `main`.
2. **Replay natively.** Each sample pushes that exact tree to this repository's `main` branch and fires the real GitHub event (a push, or a PR synchronize). Every workflow, job and step runs with its own triggers, filters, `needs`, conditions, matrices and `workflow_run` follow-ups, in the order GitHub schedules them.
3. **Runner configurations.** GitHub-hosted runners and StarSling Runners run the CI unchanged; StarSling Runners also run it with the agent PR applied (self-improving CI). Jobs on runners StarSling does not offer stay on GitHub-hosted runners in every configuration and still count.
4. **Rounds.** 5 rounds; in each, every runner configuration replays the event once, in a deterministic shuffled order, one sample at a time. Medians use only complete rounds, and a sample counts only if every expected job succeeded on the first attempt.
5. **Control caches.** Cold cache: Every sample starts with no GitHub Actions caches. Warm cache: Every sample starts from caches a seed run produced on the same runner configuration; seed time is not counted.
6. **Check.** Replays are compared job by job with upstream's own runs for the same commit, and every sample's test verdicts, coverage and cache restores are read from its own job logs.

- **Workflows in this push.** The replayed push changes only `README.md`. Upstream's `test.yml` and `build-docker-images.yml` have no path filters, so both run on every push to `main`. `release.yml` runs only on a published release or a manual dispatch, so it does not run here (upstream's own run for it on this push was a workflow-file error with no jobs).
- **Bench-only changes, identical in every configuration (GitHub, StarSling unchanged, StarSling + agent PR) and never part of the agent PR:**
  - Switched off: the Docker Hub login, the image push step (`Docker Buildx (push)`), the manifest check and the `Clear` step. Upstream's own condition is kept with `false &&` in front. The registry secrets do not exist here and nothing may be published. Upstream did run these steps on this push (the push step builds both images again and publishes them), so that upstream work is not in any column.
  - The two secret references (`DOCKER_USERNAME`, `DOCKER_PASSWORD`) are removed; only the switched-off login step reads them.
  - Runner labels: upstream's `ubuntu-latest` is replaced by the runner label of each configuration (see Runner sizes).
  - One harness step, `Benchmark event context (harness)`, is added at the start of every job. It prints two IDs so each job can be matched to its sample; its median time is 0 s.
  - On the agent PR's own branch (`starsling/develop`) only, a setup commit points the two workflows' triggers at that branch and their runners at StarSling, so the PR's checks run there. The measured replays do not use it.
- **Replaced samples.** One sample that never finished was discarded and re-run. It was the StarSling + agent PR sample of cold round 4; it left no record. The experiment was reopened (the reopening is recorded in `experiments/full-1`) and the sample re-run from a fresh cold cache. Separately, the StarSling + agent PR sample of cold round 3 failed at `actions/checkout` in two test jobs before any test ran, and was re-run; that is the 1 re-run sample counted below. In every counted sample, no job waited more than 19 s for a runner.
- **Warm runs and reused test results.** Before each warm sample, a seed run replays the previous upstream push ([`eae01b5b`](https://github.com/dutchcoders/transfer.sh/commit/eae01b5b953adb928ec804f66ac8b8fe6bbfb503), onto `c2f4a4cf`) on the same configuration; its time is not counted. Every Go test result a warm sample reused from Go's test cache (57 in all, across the 15 warm samples) is linked in the evidence record to the seed run that produced it, and that seed run passed: [`experiments/full-1/evidence/evidence.json`](https://github.com/starsling-demo-org/benchmark-transfer.sh/blob/bench/control/experiments/full-1/evidence/evidence.json) (for example, warm round 1 with the agent PR reused results from seed [run 43828737998](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43828737998)).
- **Runner sizes.** Upstream's `ubuntu-latest` jobs run on GitHub `ubuntu-26.04-4core` (4 vCPU, 16 GiB) and StarSling `starsling-ubuntu-26.04` (4 vCPU, 16 GiB). Every job in this push runs on those labels.

- **Cold:** Every sample starts with no GitHub Actions caches.
- **Warm:** Every sample starts from caches a seed run produced on the same runner configuration; seed time is not counted.
- **Failed or re-run samples** (replaced, not in the medians): GitHub unchanged: 0; StarSling unchanged (hardware alone): 0; StarSling + agent PRs: 1.

</details>

<details>
<summary>Runners</summary>

| Runners | Label | vCPU | Memory |
|---|---|---:|---:|
| GitHub-hosted | `ubuntu-26.04-4core` | 4 | 16 GiB |
| StarSling | `starsling-ubuntu-26.04` | 4 | 16 GiB |

GitHub-hosted jobs run on the explicit GitHub larger-runner label shown, pinned to the size of upstream's public-repository runner, so the comparison does not change with this repository's visibility.

</details>

<sub>Generated by `bench showcase` from experiment `full-1`. Machine-readable results: [`benchmark/results.json`](benchmark/results.json). Configurations: GitHub-hosted runners; StarSling Runners (hardware only); StarSling Runners (self-improving CI).</sub>
