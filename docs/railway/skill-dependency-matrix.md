# Railway Skill Dependency Matrix

`last_updated_utc`: 2026-02-23T00:00:00Z  
`scope`: OpenClaw on Railway Linux containers (amd64 + arm64)

This matrix tracks blockers from the built-in Skills page and maps each blocker to an install/config action that works in Railway.

## In Image (Implemented)

These dependencies are now installed in the Docker runtime image for both `amd64` and `arm64`.

| Dependency | Source | Verify command | Skills impacted |
| --- | --- | --- | --- |
| `jq` | apt package `jq` | `jq --version` | `session-logs`, `trello` (binary portion) |
| `rg` | apt package `ripgrep` | `rg --version` | `session-logs` |
| `tmux` | apt package `tmux` | `tmux -V` | `tmux` |
| `ffmpeg` | apt package `ffmpeg` | `ffmpeg -version` | `video-frames` |
| `gh` | pinned GitHub release `v2.87.2` | `gh --version` | `github` |
| `uv` | pinned uv release `0.10.4` | `uv --version` | `local-places`, `nano-banana-pro` (binary portion), `nano-pdf` install flow |

## Bootstrap Template (Implemented)

Use `scripts/bootstrap/railway-skill-deps.sh` as `/data/workspace/bootstrap.sh` for persistent installs under `/data`.

| Dependency / CLI | Version pin | Source | Arch support | Verify command | Skills impacted |
| --- | --- | --- | --- | --- | --- |
| `op` | `2.31.0` | `https://cache.agilebits.com/dist/1P/op2/pkg/v2.31.0/op_linux_<arch>_v2.31.0.zip` | `amd64`, `arm64` | `op --version` | `1password` |
| `gemini` | `0.29.5` | npm `@google/gemini-cli@0.29.5` | node runtime (arch-agnostic package) | `gemini --version` | `gemini` |
| `clawhub` | `0.7.0` | npm `clawhub@0.7.0` | node runtime (arch-agnostic package) | `clawhub --version` | `clawhub` |
| `mcporter` | `0.7.3` | npm `mcporter@0.7.3` | node runtime (arch-agnostic package) | `mcporter --help` | `mcporter` |
| `oracle` | `0.8.6` | npm `@steipete/oracle@0.8.6` | node runtime (arch-agnostic package) | `oracle --help` | `oracle` |

## Config/Secret-Only Blockers (Not Binary Installs)

| Requirement | Skills blocked until set |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | `goplaces`, `local-places` |
| `GEMINI_API_KEY` | `nano-banana-pro` |
| `ELEVENLABS_API_KEY` | `sag` |
| `TRELLO_API_KEY`, `TRELLO_TOKEN` | `trello` |
| `NOTION_API_KEY` | `notion` |
| `SHERPA_ONNX_RUNTIME_DIR`, `SHERPA_ONNX_MODEL_DIR` | `sherpa-onnx-tts` |
| `channels.bluebubbles` | `bluebubbles` |
| `channels.slack` | `slack` |
| `plugins.entries.voice-call.enabled` | `voice-call` |

## Excluded on Railway Linux (Darwin-Only)

Do not queue these for installation in Railway Linux:

- `apple-notes`
- `apple-reminders`
- `bear-notes`
- `imsg`
- `model-usage`
- `peekaboo`
- `things-mac`

## Remaining Linux Blockers (Planned Next Wave)

These are still blocked after the current implementation and need dedicated source mapping:

- `blogwatcher` (`bin:blogwatcher`)
- `blucli` (`bin:blu`)
- `camsnap` (`bin:camsnap`)
- `eightctl` (`bin:eightctl`)
- `gog` (`bin:gog`)
- `goplaces` (`bin:goplaces` + API key)
- `himalaya` (`bin:himalaya`)
- `nano-pdf` (`bin:nano-pdf`)
- `obsidian` (`bin:obsidian-cli`)
- `openai-whisper` (`bin:whisper`)
- `openhue` (`bin:openhue`)
- `ordercli` (`bin:ordercli`)
- `sag` (`bin:sag` + API key)
- `songsee` (`bin:songsee`)
- `sonoscli` (`bin:sonos`)
- `summarize` (`bin:summarize`)
- `wacli` (`bin:wacli`)
- `coding-agent`, `spotify-player` (UI blocker reason currently unknown)
