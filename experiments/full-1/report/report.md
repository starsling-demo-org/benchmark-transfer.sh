# StarSling Whole-Pipeline Benchmark Report (`full-1`)

- **Upstream:** `dutchcoders/transfer.sh@20efd89137d4fe13122e1b4cd48b1deab0f34fbd`
- **Timestamp Resolution:** `1s` (GitHub Actions workflow/job/step timestamps)

## Event `main-push` · cold cache

**Total speedup 10.18×: hardware speedup 2.52×, self-improving CI speedup 4.03× on StarSling Runners and — on GitHub-hosted runners. Evidence: coverage-qualified.**

### Runner configurations

| Runner configuration | Complete / requested | CI duration p50 (IQR) | CI minutes p50 | Estimated cost p50 (USD) | Trigger latency p50 | Harness overhead p50 |
|---|---|---|---|---|---|---|
| `github-baseline` | 5/5 | 1171.0 s (IQR 485.0 s, n=5) | 27.30 min | $0.4800 | 5.0 s | 1.0 s |
| `starsling-baseline` | 5/5 | 464.0 s (IQR 8.0 s, n=5) | 11.18 min | $0.1040 | 4.0 s | 0.0 s |
| `starsling-patched` | 5/5 | 115.0 s (IQR 1.0 s, n=5) | 5.20 min | $0.0560 | 4.0 s | 0.0 s |

### Speedups

| Speedup | Ratio | Compares | Cost neutral |
|---|---|---|---|
| `github-baseline` / `github-patched` | — | Self-improving CI speedup, GitHub-hosted runners | Not established (Self-improving CI changed which runners jobs use, so its speedup includes a hardware change.) |
| `starsling-baseline` / `starsling-patched` | 4.03× | Self-improving CI speedup, StarSling Runners | Yes |
| `github-baseline` / `starsling-baseline` | 2.52× | Hardware speedup | Not applicable: hardware speedups never establish it |
| `github-baseline` / `starsling-patched` | 10.18× | Total speedup | Not applicable |

### Step times

| Workflow › job | Step | Change | GitHub-hosted p50 | GitHub-hosted, self-improving CI p50 | StarSling, hardware only p50 | StarSling, self-improving CI p50 |
|---|---|---|---|---|---|---|
| `.github/workflows/test.yml#golangci` | Set up job | `matched` | 2.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/test.yml#golangci` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Run actions/checkout@v7 | `matched` | 1.0 s | — | 1.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Run actions/setup-go@v7 | `matched` | 8.0 s | — | 5.0 s | 5.0 s |
| `.github/workflows/test.yml#golangci` | golangci-lint | `matched` | 39.0 s | — | 24.0 s | 23.0 s |
| `.github/workflows/test.yml#golangci` | Post golangci-lint | `matched` | 1.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Post Run actions/setup-go@v7 | `matched` | 4.0 s | — | 3.0 s | 3.0 s |
| `.github/workflows/test.yml#golangci` | Post Run actions/checkout@v7 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Set up job | `matched` | 1.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Run actions/checkout@v7 | `matched` | 1.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/test.yml#test` | Install Go tip | `matched` | 86.5 s | — | 34.0 s | 32.5 s |
| `.github/workflows/test.yml#test` | Install bootstrap Go for tip | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Vet and test no tip | `matched` | 54.0 s | — | 25.0 s | 26.0 s |
| `.github/workflows/test.yml#test` | Vet and test gotip | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Post Install bootstrap Go for tip | `matched` | 3.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/test.yml#test` | Post Run actions/checkout@v7 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Install Go 1.27 | `matched` | 4.0 s | — | 1.5 s | 2.0 s |
| `.github/workflows/test.yml#test` | Post Install Go 1.27 | `matched` | 3.0 s | — | 2.0 s | 1.0 s |
| `.github/workflows/test.yml#test` | Install Go 1.26 | `matched` | 0.5 s | — | 2.0 s | 2.0 s |
| `.github/workflows/test.yml#test` | Post Install Go 1.26 | `matched` | 5.0 s | — | 3.0 s | 3.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up job | `matched` | 1.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Checkout | `matched` | 1.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Prepare | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up QEMU | `matched` | 4.0 s | — | 2.0 s | 2.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up Docker Buildx | `matched` | 6.0 s | — | 3.0 s | 4.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Available platforms | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Buildx (build) | `matched` | 1126.0 s | — | 442.0 s | 74.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Login | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Buildx (push) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Check Manifest | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Clear | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Set up Docker Buildx | `matched` | 25.0 s | — | 5.0 s | 4.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Set up QEMU | `matched` | 1.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Checkout | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Find Go tip's commit | `added` | — | — | — | 0.0 s |
| `.github/workflows/test.yml#test` | Cache Go tip | `added` | — | — | — | 0.0 s |
| `.github/workflows/test.yml#test` | Post Cache Go tip | `added` | — | — | — | 2.0 s |

### Samples

| Sample ID | Round | Runner configuration | Complete | CI duration | CI minutes | Runs and diagnostics |
|---|---|---|---|---|---|---|
| `full-1-main-push-cold-rep1-starsling-baseline` | 1 | `starsling-baseline` | ✓ | 578.0 s | 13.85m | [run #43788591651](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43788591651), [run #43788591628](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43788591628) |
| `full-1-main-push-cold-rep1-github-baseline` | 1 | `github-baseline` | ✓ | 1639.0 s | 35.42m | [run #43790010180](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43790010180), [run #43790010419](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43790010419) |
| `full-1-main-push-cold-rep1-starsling-patched` | 1 | `starsling-patched` | ✓ | 114.0 s | 5.43m | [run #43793474858](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43793474858), [run #43793474908](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43793474908) |
| `full-1-main-push-cold-rep2-starsling-patched` | 2 | `starsling-patched` | ✓ | 115.0 s | 5.02m | [run #43794294668](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43794294668), [run #43794294675](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43794294675) |
| `full-1-main-push-cold-rep2-starsling-baseline` | 2 | `starsling-baseline` | ✓ | 455.0 s | 11.18m | [run #43795116314](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43795116314), [run #43795116296](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43795116296) |
| `full-1-main-push-cold-rep2-github-baseline` | 2 | `github-baseline` | ✓ | 1601.0 s | 34.85m | [run #43796537095](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43796537095), [run #43796537006](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43796537006) |
| `full-1-main-push-cold-rep3-starsling-patched-retry1` | 3 | `starsling-patched` | ✓ | 115.0 s | 5.20m | [run #43800849988](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43800849988), [run #43800849969](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43800849969) |
| `full-1-main-push-cold-rep3-github-baseline` | 3 | `github-baseline` | ✓ | 1171.0 s | 27.30m | [run #43801649791](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43801649791), [run #43801649802](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43801649802) |
| `full-1-main-push-cold-rep3-starsling-baseline` | 3 | `starsling-baseline` | ✓ | 464.0 s | 11.38m | [run #43804326957](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43804326957), [run #43804326946](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43804326946) |
| `full-1-main-push-cold-rep4-github-baseline` | 4 | `github-baseline` | ✓ | 1116.0 s | 26.12m | [run #43805715515](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43805715515), [run #43805715525](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43805715525) |
| `full-1-main-push-cold-rep4-starsling-patched` | 4 | `starsling-patched` | ✓ | 134.0 s | 5.77m | [run #43814460282](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43814460282), [run #43814460288](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43814460288) |
| `full-1-main-push-cold-rep4-starsling-baseline` | 4 | `starsling-baseline` | ✓ | 464.0 s | 11.07m | [run #43815392255](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43815392255), [run #43815392279](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43815392279) |
| `full-1-main-push-cold-rep5-starsling-baseline` | 5 | `starsling-baseline` | ✓ | 456.0 s | 10.93m | [run #43816996067](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43816996067), [run #43816996074](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43816996074) |
| `full-1-main-push-cold-rep5-github-baseline` | 5 | `github-baseline` | ✓ | 1059.0 s | 25.22m | [run #43818658283](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43818658283), [run #43818658087](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43818658087) |
| `full-1-main-push-cold-rep5-starsling-patched` | 5 | `starsling-patched` | ✓ | 112.0 s | 5.05m | [run #43821463837](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43821463837), [run #43821463570](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43821463570) |
| `full-1-main-push-cold-rep3-starsling-patched` | 3 | `starsling-patched` | ✗ | 77.0 s | — | [run #43799940574](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43799940574), [run #43799940553](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43799940553) (Workflow ".github/workflows/build-docker-images.yml" (run 43799940574) has not completed (status=in_progress); Job ".github/workflows/build-docker-images.yml#buildx" is still in_progress; Workflow not successful: .github/workflows/build-docker-images.yml; Workflow not successful: .github/workflows/test.yml; Failed jobs: .github/workflows/test.yml#Test with 1.27, .github/workflows/test.yml#Test with tip; Missing timestamps on executed jobs: .github/workflows/build-docker-images.yml#buildx; Staging failed: Incomplete sample full-1-main-push-cold-rep3-starsling-patched; state remains leased for collect/recover) |

## Event `main-push` · warm cache

**Total speedup 11.68×: hardware speedup 2.47×, self-improving CI speedup 4.72× on StarSling Runners and — on GitHub-hosted runners. Evidence: coverage-qualified.**

### Runner configurations

| Runner configuration | Complete / requested | CI duration p50 (IQR) | CI minutes p50 | Estimated cost p50 (USD) | Trigger latency p50 | Harness overhead p50 |
|---|---|---|---|---|---|---|
| `github-baseline` | 5/5 | 1145.0 s (IQR 550.0 s, n=5) | 23.80 min | $0.4320 | 4.0 s | 0.0 s |
| `starsling-baseline` | 5/5 | 463.0 s (IQR 13.0 s, n=5) | 10.23 min | $0.1040 | 4.0 s | 0.0 s |
| `starsling-patched` | 5/5 | 98.0 s (IQR 1.0 s, n=5) | 2.95 min | $0.0480 | 5.0 s | 0.0 s |

### Speedups

| Speedup | Ratio | Compares | Cost neutral |
|---|---|---|---|
| `github-baseline` / `github-patched` | — | Self-improving CI speedup, GitHub-hosted runners | Not established (Self-improving CI changed which runners jobs use, so its speedup includes a hardware change.) |
| `starsling-baseline` / `starsling-patched` | 4.72× | Self-improving CI speedup, StarSling Runners | Yes |
| `github-baseline` / `starsling-baseline` | 2.47× | Hardware speedup | Not applicable: hardware speedups never establish it |
| `github-baseline` / `starsling-patched` | 11.68× | Total speedup | Not applicable |

### Step times

| Workflow › job | Step | Change | GitHub-hosted p50 | GitHub-hosted, self-improving CI p50 | StarSling, hardware only p50 | StarSling, self-improving CI p50 |
|---|---|---|---|---|---|---|
| `.github/workflows/test.yml#test` | Set up job | `matched` | 1.0 s | — | 0.0 s | 1.0 s |
| `.github/workflows/test.yml#test` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Run actions/checkout@v7 | `matched` | 1.0 s | — | 1.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Install Go 1.26 | `matched` | 2.0 s | — | 3.5 s | 4.0 s |
| `.github/workflows/test.yml#test` | Install bootstrap Go for tip | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Vet and test no tip | `matched` | 4.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Vet and test gotip | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Post Install Go 1.26 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Post Run actions/checkout@v7 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Set up job | `matched` | 1.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Run actions/checkout@v7 | `matched` | 1.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/test.yml#golangci` | Run actions/setup-go@v7 | `matched` | 14.0 s | — | 10.0 s | 9.0 s |
| `.github/workflows/test.yml#golangci` | golangci-lint | `matched` | 3.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/test.yml#golangci` | Post golangci-lint | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Post Run actions/setup-go@v7 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Post Run actions/checkout@v7 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Install Go 1.27 | `matched` | 5.5 s | — | 3.5 s | 3.5 s |
| `.github/workflows/test.yml#test` | Post Install Go 1.27 | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Install Go tip | `matched` | 69.0 s | — | 31.0 s | 0.5 s |
| `.github/workflows/test.yml#test` | Post Install bootstrap Go for tip | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up job | `matched` | 1.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Benchmark event context (harness) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Checkout | `matched` | 0.0 s | — | 1.0 s | 1.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Prepare | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up QEMU | `matched` | 5.0 s | — | 3.0 s | 2.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up Docker Buildx | `matched` | 7.0 s | — | 3.0 s | 3.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Available platforms | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Buildx (build) | `matched` | 1102.0 s | — | 439.0 s | 74.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Login | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Buildx (push) | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Docker Check Manifest | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Clear | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Set up Docker Buildx | `matched` | 19.0 s | — | 4.0 s | 3.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Set up QEMU | `matched` | 0.0 s | — | 0.0 s | 1.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Post Checkout | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Complete job | `matched` | 0.0 s | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#golangci` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Set up runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/build-docker-images.yml#buildx` | Complete runner | `matched` | — | — | 0.0 s | 0.0 s |
| `.github/workflows/test.yml#test` | Find Go tip's commit | `added` | — | — | — | 0.0 s |
| `.github/workflows/test.yml#test` | Cache Go tip | `added` | — | — | — | 0.0 s |
| `.github/workflows/test.yml#test` | Post Cache Go tip | `added` | — | — | — | 0.0 s |

### Samples

| Sample ID | Round | Runner configuration | Complete | CI duration | CI minutes | Runs and diagnostics |
|---|---|---|---|---|---|---|
| `full-1-main-push-warm-rep1-github-baseline` | 1 | `github-baseline` | ✓ | 1667.0 s | 32.88m | [run #43824793676](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43824793676), [run #43824793771](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43824793771) |
| `full-1-main-push-warm-rep1-starsling-patched` | 1 | `starsling-patched` | ✓ | 100.0 s | 2.95m | [run #43829559076](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43829559076), [run #43829559188](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43829559188) |
| `full-1-main-push-warm-rep1-starsling-baseline` | 1 | `starsling-baseline` | ✓ | 454.0 s | 10.17m | [run #43832472277](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43832472277), [run #43832472405](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43832472405) |
| `full-1-main-push-warm-rep2-starsling-baseline` | 2 | `starsling-baseline` | ✓ | 463.0 s | 9.90m | [run #43836033149](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43836033149), [run #43836033279](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43836033279) |
| `full-1-main-push-warm-rep2-github-baseline` | 2 | `github-baseline` | ✓ | 918.0 s | 19.88m | [run #43842919875](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43842919875), [run #43842919591](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43842919591) |
| `full-1-main-push-warm-rep2-starsling-patched` | 2 | `starsling-patched` | ✓ | 98.0 s | 2.80m | [run #43847293560](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43847293560), [run #43847293598](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43847293598) |
| `full-1-main-push-warm-rep3-github-baseline` | 3 | `github-baseline` | ✓ | 1519.0 s | 30.30m | [run #43852777935](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43852777935), [run #43852777871](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43852777871) |
| `full-1-main-push-warm-rep3-starsling-baseline` | 3 | `starsling-baseline` | ✓ | 508.0 s | 11.08m | [run #43859211134](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43859211134), [run #43859210820](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43859210820) |
| `full-1-main-push-warm-rep3-starsling-patched` | 3 | `starsling-patched` | ✓ | 98.0 s | 2.98m | [run #43862259732](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43862259732), [run #43862259733](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43862259733) |
| `full-1-main-push-warm-rep4-starsling-baseline` | 4 | `starsling-baseline` | ✓ | 453.0 s | 10.23m | [run #43865523585](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43865523585), [run #43865523709](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43865523709) |
| `full-1-main-push-warm-rep4-starsling-patched` | 4 | `starsling-patched` | ✓ | 92.0 s | 2.85m | [run #43868750227](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43868750227), [run #43868750252](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43868750252) |
| `full-1-main-push-warm-rep4-github-baseline` | 4 | `github-baseline` | ✓ | 1145.0 s | 23.80m | [run #43873631644](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43873631644), [run #43873631338](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43873631338) |
| `full-1-main-push-warm-rep5-github-baseline` | 5 | `github-baseline` | ✓ | 969.0 s | 21.43m | [run #43881537606](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43881537606), [run #43881538099](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43881538099) |
| `full-1-main-push-warm-rep5-starsling-baseline` | 5 | `starsling-baseline` | ✓ | 467.0 s | 10.67m | [run #43887519720](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43887519720), [run #43887519931](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43887519931) |
| `full-1-main-push-warm-rep5-starsling-patched` | 5 | `starsling-patched` | ✓ | 99.0 s | 3.60m | [run #43891334509](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43891334509), [run #43891334456](https://github.com/starsling-demo-org/benchmark-transfer.sh/actions/runs/43891334456) |



## GitHub API calls

Budget: 252 calls per hour for this controller. Free `304 Not Modified` answers are listed separately and do not count against the account.

- **Experiment:** 1439 calls (3076 free 304s); jobs 278, job-logs 229, run-list 215, workflows 202, workflow-write 190, cache-delete 164, artifacts 93, caches 63, other-read 2, run-read 2, run-write 1
- **Waiting:** 15852 s stretched to fit the budget, 0 s waiting for an account reset

| Sample | Calls | Free 304s | Biggest callers |
| --- | ---: | ---: | --- |
| `full-1-main-push-cold-rep1-starsling-baseline` | 30 | 60 | workflows 8, run-list 5, workflow-write 5, jobs 5, job-logs 5, artifacts 2 |
| `full-1-main-push-cold-rep1-github-baseline` | 26 | 113 | jobs 7, job-logs 5, run-list 4, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep1-starsling-patched` | 24 | 35 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-cold-rep2-starsling-patched` | 24 | 35 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-cold-rep2-starsling-baseline` | 25 | 59 | run-list 5, jobs 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep2-github-baseline` | 28 | 122 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 3 |
| `full-1-main-push-cold-rep3-starsling-patched` | 21 | 32 | workflows 4, workflow-write 4, jobs 4, job-logs 4, run-list 3, artifacts 2 |
| `full-1-main-push-cold-rep3-starsling-patched-retry1` | 26 | 35 | workflows 6, jobs 6, job-logs 5, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-cold-rep3-github-baseline` | 28 | 96 | jobs 9, job-logs 5, run-list 4, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep3-starsling-baseline` | 24 | 60 | jobs 5, job-logs 5, run-list 4, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep4-github-baseline` | 27 | 87 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep4-starsling-patched` | 36 | 25 | workflows 9, run-list 8, workflow-write 6, jobs 6, job-logs 5, artifacts 2 |
| `full-1-main-push-cold-rep4-starsling-baseline` | 25 | 63 | run-list 5, jobs 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep5-starsling-baseline` | 25 | 63 | run-list 5, jobs 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep5-github-baseline` | 27 | 101 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-cold-rep5-starsling-patched` | 24 | 39 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-warm-rep1-github-baseline-seed` | 27 | 91 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep1-github-baseline` | 28 | 120 | jobs 7, run-list 6, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep1-starsling-patched-seed` | 23 | 40 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-warm-rep1-starsling-patched` | 24 | 39 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep1-starsling-baseline-seed` | 25 | 63 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep1-starsling-baseline` | 28 | 61 | run-list 6, jobs 6, workflows 5, job-logs 5, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep2-starsling-baseline-seed` | 26 | 62 | jobs 6, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep2-starsling-baseline` | 26 | 62 | jobs 6, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep2-github-baseline-seed` | 26 | 112 | jobs 7, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep2-github-baseline` | 26 | 87 | jobs 7, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep2-starsling-patched-seed` | 24 | 39 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 3, artifacts 2 |
| `full-1-main-push-warm-rep2-starsling-patched` | 24 | 39 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep3-github-baseline-seed` | 27 | 116 | run-list 6, jobs 6, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep3-github-baseline` | 26 | 112 | jobs 7, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep3-starsling-baseline-seed` | 27 | 61 | run-list 6, jobs 6, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep3-starsling-baseline` | 25 | 63 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep3-starsling-patched-seed` | 25 | 38 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep3-starsling-patched` | 24 | 39 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep4-starsling-baseline-seed` | 27 | 61 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep4-starsling-baseline` | 25 | 63 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep4-starsling-patched-seed` | 25 | 38 | jobs 6, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep4-starsling-patched` | 24 | 39 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep4-github-baseline-seed` | 27 | 91 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep4-github-baseline` | 29 | 92 | run-list 7, jobs 7, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep5-github-baseline-seed` | 27 | 106 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep5-github-baseline` | 27 | 96 | jobs 7, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep5-starsling-baseline-seed` | 26 | 62 | jobs 6, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep5-starsling-baseline` | 26 | 62 | jobs 6, run-list 5, job-logs 5, workflows 4, workflow-write 4, artifacts 2 |
| `full-1-main-push-warm-rep5-starsling-patched-seed` | 24 | 39 | jobs 5, job-logs 5, workflows 4, workflow-write 4, run-list 4, artifacts 2 |
| `full-1-main-push-warm-rep5-starsling-patched` | 23 | 40 | job-logs 5, workflows 4, workflow-write 4, run-list 4, jobs 4, artifacts 2 |
