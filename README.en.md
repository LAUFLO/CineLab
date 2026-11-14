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
  <img alt="Electron" src="https://img.shields.io/badge/Electron-45-1f1f1f.svg">
  <img alt="React" src="https://img.shields.io/badge/React-19-1f1f1f.svg">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-1f1f1f.svg">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1f1f1f.svg">
</p>

<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

## Overview

CineLab is a local-first creative workspace for AI-generated media. Image, video, audio and text generation all happen on one infinite canvas, while CineBot operates the canvas, clip studio, director stage and film-study data in natural language. Assets, nodes, edges, generation history and agent sessions stay inside a local `.cinelab` project folder.

Unlike cloud-only creative tools, CineLab does not lock you to a model vendor. It works with any OpenAI-compatible endpoint, self-hosted services and proxies, and ships adapters for Kling, Volcengine Ark, MiniMax, Vidu and custom HTTP templates.

The canvas interaction is modelled after LibTV's infinite canvas, with the goal of matching its feel while keeping the model layer open.

## Features

### Canvas and projects

- **Infinite canvas**: free-form nodes, drag-to-connect edges, right-side `+` to start generation
- **Multiple projects and canvases**: one project can contain several canvases with create, switch, rename and delete
- **Autosave**: canvas and project metadata are written continuously and recover after a crash
- **Project center**: recent projects and 1:1 project covers from local images or canvas output
- **Groups and storyboards**: regular groups, storyboard groups, grid layout, 2K stitching and conversion back to regular groups
- **Version stack**: compare, roll back and continue from earlier generations of the same node

### CineBot

- **Conversational control**: create, move, connect and delete nodes, edit titles and text, and register generation proposals in natural language
- **Four workspaces**: canvas, clip studio, director stage and film study
- **Node operation bridge**: grid split, crop, frame extraction, clip capture, audio/video separation, subtitle removal, matting and object removal share one executor between the UI and the agent
- **Generation proposals**: model operations are registered through `generation_propose` and only submitted after the user confirms, so nothing is charged up front
- **Turn undo**: canvas, timeline, scene and film-study edits in one turn collapse into a single undo entry
- **Permissions and confirmations**: read-only, current-workspace and full-access modes; destructive actions require confirmation
- **Sessions and skills**: sessions live inside the project, with history, context compaction and a three-level skill directory

### Clip Studio

- **Multi-track timeline**: video, audio, subtitle and image tracks with drag, trim, split and snapping
- **Clip properties**: speed, volume, mute, opacity, fades and transitions
- **Auto rough cut**: remove silence, split by shot, beat markers and beat splitting
- **Auto subtitles**: local Whisper transcription written back as subtitle clips
- **Final export**: ffmpeg render written back to the clip-studio node on the canvas

### Director Stage

- **3D scene**: mannequins, primitives, planes, crowd arrays and local glTF
- **Cameras and shots**: multiple cameras, keyframed camera moves, shot duration and aspect ratio
- **Scene editing**: object position, rotation, scale, pose, color, visibility and background
- **Previs export**: local three.js render plus ffmpeg video export back to the canvas

### Frame-by-frame film study

- **Node entry point**: video node toolbar → film study → storyboard group and sheet are created automatically
- **Automatic breakdown**: shot detection or fixed intervals, with AI descriptions for shot size, camera, movement, lighting, image and prompt
- **Study data**: section title, timing, structural role, description, prompt, dialogue, music and notes
- **Subtitles and export**: extract embedded subtitles and export Markdown, an AI analysis package or a full study package
- **Advanced editor**: the original study room remains as an advanced overlay for the sheet

### Generation

- **Image**: text-to-image, image-to-image, grids, multi-angle, relighting, portraits, matting and outpainting
- **Video**: text-to-video, image-to-video, first/last frame and adapters for Kling, Volcengine Ark, MiniMax and Vidu
- **Audio**: TTS and music generation
- **Text**: LLM nodes, screenplay generation and prompt rewriting
- **Task queue**: concurrency limits, progress events, cancellation and retry

### Local media processing

- **Depth-based motion capture**: VDA Small video depth maps that follow the input aspect ratio, with on-demand components
- **Video tools**: trim, crop, separate audio/video, frame extraction, subtitle removal and shot regeneration
- **Image tools**: free crop, grid split, storyboard stitching, matting, outpainting and layer separation
- **Files and export**: project packaging, current canvas PNG and selected-asset ZIP export

### Creative experience

- **Node toolbar**: primary actions plus a more menu, with customizable favorites
- **Command palette, shortcuts and generation history**: one entry point in the bottom toolbar
- **Light and dark themes**: black/white/gray design driven by CSS variables
- **Unified tooltips**: popups automatically avoid the viewport edges

## Download and install

Download the latest release from [GitHub Releases](https://github.com/LAUFLO/CineLab/releases/latest):

- Windows x64: `CineLab Setup 0.1.0.exe`
- macOS Apple Silicon: `CineLab-0.1.0-arm64.dmg`

### Windows

- Windows 10 / 11 x64
- The installer is unsigned. If SmartScreen appears, choose "More info" → "Run anyway".
- Verify the download against `SHA256SUMS.txt` on the release page.
- Project data stays in the folder you choose; settings live in `%APPDATA%\CineLab`.
- Uninstall from Windows Settings → Apps → CineLab.

### macOS

- macOS 12+, Apple Silicon
- The package is unsigned and not notarized. On first launch, right-click → Open, or allow it in System Settings → Privacy & Security.
- Depth capture, vision enhancement and local subtitle runtimes are downloaded per platform.
- Auto-update is disabled in the first macOS release; download new versions manually.
- Settings live in `~/Library/Application Support/CineLab`.

To run from source, see Quick start below.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Electron 45, frameless windows, isolated main process |
| Frontend | React 19 + TypeScript 7 + Vite 8 |
| Canvas | React Flow 12 (`@xyflow/react`) |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 + CSS variables (light and dark themes) |
| Validation | Zod 4 |
| Media | ffmpeg-static + ffprobe-static |
| Storage | Project folders with JSON / JSONL, no SQLite |
| Agent | Custom AgentRuntime, OpenAI-compatible function calling, SSE streaming |

## Quick start

Node.js 24 and pnpm 12 are required. If `pnpm` is not on `PATH`, run `corepack enable` first.

```bash
corepack pnpm install
corepack pnpm dev
```

Create a project on the welcome screen, configure a model provider and API key in Settings, then return to the canvas.

If the Electron binary download fails on Windows:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

## Development commands

```bash
corepack pnpm dev              # Electron + Vite
corepack pnpm dev:isolated     # isolated test instance with its own userData and CDP port
corepack pnpm typecheck        # main and renderer type checks
corepack pnpm test             # Vitest unit tests
corepack pnpm test:coverage    # coverage
corepack pnpm test:e2e         # Playwright desktop e2e
corepack pnpm build            # production build
corepack pnpm dist:win         # Windows installer
corepack pnpm dist:mac         # macOS installer (must run on macOS)
corepack pnpm check:encryption # verify transparently encrypted files and Git blobs are plaintext
corepack pnpm check:docs       # docs status, links, index and agent tool list
corepack pnpm models:check     # validate models.json
```

## Project layout

```text
src/
├─ main/       Main process: windows, IPC, projects, providers, task queue, agent, clip export, stage rendering, component downloads
│  ├─ agent/          AgentRuntime, tool registry, capability catalog, sessions, skills, proposals
│  ├─ film-study/     frame extraction, shot detection, AI analysis, export
│  ├─ stage/          director stage scene storage and previs
│  ├─ timeline/       timeline analysis and export
│  └─ ...
├─ preload/    contextBridge bridge
├─ shared/     node / project / provider / media / agent / timeline / scene schemas and IPC contracts
└─ renderer/
   └─ src/
      ├─ canvas/      canvas, nodes, edges, toolbar, prompt bar, film-study nodes
      ├─ agent/       CineBot panel, session state, canvas/clip/stage/study bridges
      ├─ studio/      clip studio timeline, inspector, export
      ├─ stage/       director stage viewport, inspector, timeline
      ├─ stores/      Zustand stores
      ├─ panels/      settings, asset library, project center
      ├─ components/  shared and brand components
      ├─ theme/       theme switching
      └─ styles/      CSS variables and global styles
```

## Documentation

Most design documents are currently written in Chinese; code and UI structure are documented alongside the source.

- [Document index](docs/README.md)
- [Architecture](docs/architecture.md)
- [UI specification](docs/ui-spec.md)
- [CineBot architecture](docs/agent-architecture-plan.md)
- [CineBot capabilities](docs/agent-capabilities.md)
- [Model configuration](docs/models.md)
- [Clip Studio](docs/clip-studio-plan.md)
- [Director Stage](docs/director-stage-plan.md)
- [Film study](docs/film-study-plan.md)
- [Roadmap](docs/roadmap-plan.md)

## Roadmap

Done:

- [x] Infinite canvas, edges, autosave, multiple projects and canvases
- [x] OpenAI-compatible text-to-image, image-to-image, text and TTS
- [x] Kling, Volcengine Ark, MiniMax and Vidu video adapters
- [x] Groups, storyboard groups and 2K stitching
- [x] Node toolbar: grids, multi-angle, relighting, portraits, matting, free crop and 3D lighting
- [x] Depth-based motion capture (VDA Small, on-demand components)
- [x] Clip Studio: multi-track, auto subtitles, silence removal, shot/beat splitting, transitions and export
- [x] Director Stage: 3D scene, cameras, shots, camera moves, backgrounds and previs
- [x] Film study: automatic breakdown, AI descriptions, section editing, subtitle extraction and export
- [x] CineBot phases 1–4: canvas / clip / stage / study tools, operation bridge, capability catalog and proposals
- [x] Windows x64 and macOS Apple Silicon installers
- [x] macOS depth / vision / whisper component runtimes
- [x] Git workflow, Vitest, Playwright and GitHub Actions packaging for both platforms

Planned:

- [ ] macOS code signing, notarization and auto-update
- [ ] macOS Intel (x64) installer
- [ ] Agent support for mask-based operations (inpaint / erase / element edit)
- [ ] Film-study analysis package import
- [ ] Director Stage object animation tracks and standalone lights
- [ ] Real tokenizer, dynamic tool exposure and context budgeting
- [ ] Agnes video retest once its queue recovers
- [ ] English UI

## Contributing

The project is evolving quickly; issues and pull requests are welcome. Please open an issue to align on larger changes and follow the [branch policy](docs/branch-policy.md).

## License

[MIT](LICENSE)
