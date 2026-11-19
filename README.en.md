<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-wordmark-dark.png">
    <img src="docs/brand/readme-wordmark-light.png" alt="CineLab" width="360">
  </picture>
</p>

<p align="center">
  A local-first AI creative workspace · infinite canvas + CineBot + clip studio + director stage + frame-by-frame film study
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1f1f1f.svg">
  <a href="https://github.com/LAUFLO/CineLab/releases/latest"><img alt="Version" src="https://img.shields.io/github/v/release/LAUFLO/CineLab?label=version&color=1f1f1f"></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

<p align="center">
  <a href="https://github.com/LAUFLO/CineLab/releases/latest">Download</a>
  ·
  <a href="docs/README.md">Docs</a>
  ·
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=ee4gcf5b-e0c4-4ede-b6e8-524abb223c01">Feishu group</a>
  ·
  <a href="https://qun.qq.com/universal-share/share?ac=1&authKey=Q9ARD0p6c%2BkqnN5F4k%2BMysAX18yETDp%2F9OGNOL%2F%2FVL8eXMcotGtyMs26DyaLTKXH&busi_data=eyJncm91cENvZGUiOiIxMTM2NDMzODU4IiwidG9rZW4iOiJ2Q2ViQmtJSHBQSzh6UlFXVWI2QmtxMUlIZDFzaC95VlFoY05IRXc3Z00rcWFRMjhjZndFMnduTWNPVzBxc1JOIiwidWluIjoiMTE3NTA4MjQyNCJ9&data=-6tZHhq9ZGRpIjIU2f63RJcsU31U4SfF5aNtH5G0T6Cc2rjp_X9mzFu4KQuIToGQb2ODE5RhHgQRjsTnXVDycA&svctype=4&tempid=h5_group_info">QQ group: 1136433858</a>
</p>

## What is CineLab

CineLab is a local-first AI creative workspace. Image, video, audio and text generation all happen on one infinite canvas, and nodes, edges, assets, generation history and agent sessions stay inside your own `.cinelab` project folder.

The creative process is split into four workspaces: the infinite canvas for assets and generation, Clip Studio for the timeline, Director Stage for 3D previs, and frame-by-frame film study for shot breakdown. CineBot operates all four in natural language, and can register model operations as proposals that only run after you confirm.

CineLab keeps the model layer fully open: providers, models, base URLs, API keys, headers and parameters are all yours to configure. Connect any OpenAI-compatible endpoint, self-hosted service or proxy, or use custom HTTP templates for other protocols. Built-in presets are optional shortcuts and never limit which models you can add.

The canvas is built around an infinite, node-based workflow, with an emphasis on smooth drag-to-connect editing, clear generation chains and a fully open model layer.

## Core capabilities

### Infinite canvas

- Free-form nodes, drag-to-connect edges, right-side `+` to start generation
- Multiple projects and canvases, autosave, crash recovery and project covers
- Groups, storyboard groups, 2K stitching and a version stack
- Node toolbar: grids, multi-angle, relighting, portraits, matting, free crop and 3D lighting

### CineBot

- Create, move, connect and delete nodes, edit titles and text in natural language
- Covers the canvas, Clip Studio, Director Stage and film study
- Generation proposals only submit after confirmation, so nothing is charged up front
- Permission modes, turn undo, project-local sessions and a three-level skill directory

### Clip Studio

- Multi-track timeline for video, audio, subtitles and images
- Trim, split, snap, speed, volume, fades and transitions
- Auto rough cut: remove silence, split by shot, beat markers and beat splitting
- Local Whisper subtitles, ffmpeg export written back to the canvas
- Canvas nodes preview the timeline live without exporting a film first, and can play inline
- Export versions can be deleted together with their files and stale edges

### Director Stage

- three.js 3D scene: mannequins, primitives, planes, crowd arrays and local glTF
- Multiple cameras, keyframed camera moves, shot duration and aspect ratio
- Semantic shots: describe framing such as "over-the-shoulder from A to B" or "two-shot medium", and the camera is solved automatically without crossing the line
- Deterministic procedural worlds: streets, plazas and interiors with weather, water, landmarks and themes, reproducible from the same seed
- Scene-to-whitebox: drop in a concept image and get a shootable 3D scene
- Object position, rotation, scale, pose, color, visibility and background
- Previs export to video and back to the canvas

### Frame-by-frame film study

- Video node → film-study node → storyboard group and sheet created automatically
- Shot detection or fixed-interval splitting
- AI descriptions for shot size, camera, movement, lighting, image and prompt
- Section editing, embedded subtitle extraction, Markdown and study-package export

### Local media

- Depth-based motion capture (VDA Small) with output matching the input aspect ratio
- Frame extraction, crop, audio/video separation, subtitle removal and shot regeneration
- Matting, outpainting, layer separation, grid split and storyboard stitching
- Models and runtimes download on demand instead of shipping in the installer

### Fully open model configuration

- Configure providers, models, base URLs, API keys, headers and parameters locally, with no dependency on a built-in list
- Any OpenAI-compatible endpoint, self-hosted service or proxy; built-in presets (Kling, Volcengine Ark, MiniMax, Vidu and more) can be added, edited or removed without locking you to a vendor
- Custom HTTP templates for model services that do not follow the OpenAI protocol
- Per-model capabilities: input media (text / image / audio / video), generation modes, reference audio / video, parameter panels and output features, all declared per model
- Configuration lives in a local `models.json` that you can back up, migrate and version
- Capability consistency checks keep declarations aligned with what adapters actually execute, and unsupported inputs fail at the generation entry

## Download and install

Download the latest release from [GitHub Releases](https://github.com/LAUFLO/CineLab/releases/latest):

Current version: **v0.3.2**. See [CHANGELOG.md](CHANGELOG.md) for the full change log (Chinese).

| Platform | Recommended file | Requirements |
|---|---|---|
| Windows | `CineLab-0.3.2-x64.exe` | Windows 10 / 11 x64 |
| macOS | `CineLab-0.3.2-arm64.dmg` | macOS 12+, Apple Silicon |

### Windows

- The installer is unsigned. If SmartScreen appears, choose "More info" → "Run anyway".
- Project data stays in the folder you choose; settings live in `%APPDATA%\CineLab`.
- Uninstall from Windows Settings → Apps → CineLab.

### macOS

- The package is unsigned and not notarized. On first launch, right-click → Open, or allow it in System Settings → Privacy & Security.
- Depth capture, vision enhancement and local subtitle runtimes are downloaded per platform.
- Auto-update is disabled in the first macOS release; download new versions manually.
- Settings live in `~/Library/Application Support/CineLab`.

Verify downloads against `SHA256SUMS.txt` on the release page.

If checking for or downloading an update fails, the app offers "Open release page" and "Download in browser" actions, falling back from mirror proxies to the original GitHub URL.

## First run

1. Open CineLab and create a project in the project center
2. Go to Settings → Model providers and choose a preset, or enter a Base URL / API key manually
3. Return to the canvas, double-click empty space or click the right-side `+` to create your first node
4. When you need local subtitles, depth capture or vision enhancement, download the component when prompted

## Feedback

Report bugs and feature requests in [GitHub Issues](https://github.com/LAUFLO/CineLab/issues). Please search for an existing report first.

Do not open a public issue for security problems. Follow [SECURITY.md](SECURITY.md) instead.

## Documentation

Most design documents are currently written in Chinese.

- [Document index](docs/README.md)
- [Changelog](CHANGELOG.md)
- [Architecture](docs/architecture.md)
- [Model configuration](docs/models.md)
- [UI specification](docs/ui-spec.md)
- [CineBot capabilities](docs/agent-capabilities.md)
- [Clip Studio](docs/archive/clip-studio-plan.md) · [Director Stage](docs/archive/director-stage-plan.md)

## Development

Requirements, commands, project layout, branch policy and PR checks are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

The project is evolving quickly; issues and pull requests are welcome. For larger changes, open an issue first to align on the approach, and read [CONTRIBUTING.md](CONTRIBUTING.md) plus the [branch policy](docs/branch-policy.md) before submitting.

## License

[MIT](LICENSE)
