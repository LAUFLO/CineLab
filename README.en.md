<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-wordmark-dark.png">
    <img src="docs/brand/readme-wordmark-light.png" alt="CineLab" width="360">
  </picture>
</p>

<p align="center">
  A local-first AI creation workbench · Infinite canvas + CineBot + MCP + Clip Studio + Director Stage + Film Study
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

CineLab is a local-first AI creation workbench. Image, video, audio and text generation all happen on the same infinite canvas. Nodes, edges, assets, timelines, 3D previews, generation history and agent sessions are stored in your own `.cinelab` project folder.

Creation is split into four workspaces: the infinite canvas for assets and generation, Clip Studio for timelines, Director Stage for 3D previs, and Film Study for turning reference footage into shot lists and remake workflows. CineBot operates all four spaces with natural language. External agents can connect through MCP and use the same tool set.

The model layer is fully open: providers, models, Base URL, API key, headers and parameters are all configurable. You can connect any OpenAI-compatible endpoint, self-hosted service or relay, or adapt other protocols with a custom HTTP template. Built-in presets are optional shortcuts, not a locked provider list.

## Core capabilities

### Infinite canvas

- Free node placement, drag-to-connect, generate from the right-side `+`
- Multiple projects and canvases, autosave, crash recovery, project covers
- Groups, storyboard groups, 2K stitching, version stacks
- Node toolbar: grid split, multi-angle, relight, portrait, cutout, free crop, 3D lighting
- Inline node operation editors for crop, cutout, subtitle removal, video crop, outpaint, inpaint, erase, element edit, relight, multi-angle, color grade, portrait, clip trim, grid split and depth capture; floating chrome hides while dragging
- Text nodes support Markdown WYSIWYG: type `#`, `-`, `>`, `**` and more to format in place
- Reference slots for images, videos, audio and text, plus `@` text mentions
- Result nodes keep the toolbar but hide the Prompt Bar

### CineBot and MCP

**CineBot** is the built-in agent and currently exposes 93 tools:

- Covers canvas, Clip Studio, Director Stage, Film Study, generation, asset library, prompts, styles, skills and projects
- Generation proposals are submitted only after confirmation, so nothing is charged up front
- Permission modes, turn undo, project-scoped sessions, three-level skill directories
- Import skills from a folder or ZIP and enable them per global / project scope

**MCP** lets external agents use the same capabilities and currently exposes 100 tools:

- Built-in MCP server over HTTP and stdio, bound to localhost and protected by a Bearer token
- Tool names match CineBot; coverage includes projects, canvas, Clip Studio, Director Stage, Film Study, assets, prompts, styles, skills, asset ingest and vocal/background separation
- Write tools execute directly without an in-app confirmation dialog
- Read-only mode is the safety switch: every write tool is rejected while it is on
- Destructive tools are marked in red in settings
- The settings panel supports search and read-only / write / destructive filters

### Asset library and prompts

- Prompt presets: create, edit, delete, full-text preview, name capsules insertable anywhere in the prompt, expanded in place on send; the official "画面去脏" preset is read-only
- Style library: official read-only styles plus custom styles, category browsing, 8-column thumbnails, one-click apply; adds the official Wes Anderson style
- Asset library: global / project assets, prompt templates, character cards and styles shown from the same source
- Workflow templates: save a canvas flow to the asset library and pick it when creating a project; upload, generation, film-study and studio nodes become placeholders until you replace the material
- Presets, styles and prompt templates are also available to CineBot and MCP for search, reading and management

### Clip Studio

- Multi-track timeline for video, audio, subtitles and images
- Trim, split, snapping, speed, volume, fades and transitions
- Automatic rough cut: remove silence, split by shots, beat markers, beat split
- Local Whisper subtitles, ffmpeg export written back to the canvas
- Subtitle tracks can be exported separately as WebVTT
- Canvas nodes preview the timeline in real time without exporting first; playback works inside the node
- Exported versions can be deleted with their files and stale edges cleaned up

### Director Stage

- three.js scene: mannequins, primitives, planes, crowd arrays, local glTF
- Multiple cameras, camera keyframe moves, shot duration and aspect ratio
- Semantic shots: describe framing such as "over-the-shoulder A looking at B" or "two-person medium shot" and let the solver place cameras without crossing the line
- Scene image to blockout: drop in a concept image and generate a shootable 3D scene
- Object position, rotation, scale, pose, color, visibility and background
- Export blockout previews back to the canvas; viewport captures become image nodes

### Frame-by-frame film study

- Video node to film-study node with automatic shot detection and first/middle/last frames
- Per-shot understanding of shot size, camera, movement, lighting, composition, dialogue and prompt
- Deterministic evidence: stills, still-image pans, code-rendered, screen capture, live action, AI, 3D
- Automatic scene splitting and three-node shot groups (first frame, last frame, text)
- Character sheets, style profiles, scene and audio groups, all ingestible into the asset library
- Cast/location mapping then one-click remake: build generation nodes with first/last frames and prompts, without charging automatically
- Re-run a single shot to refresh its frames, description and prompt

### Local media

- Vocal / background separation: video sources produce a silent video plus audio, audio sources produce audio only
- Depth motion capture (VDA Small), output ratio follows the input
- Frame extraction, cropping, audio/video demux, subtitle removal, shot retakes
- Video crop presets 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 plus custom aspect ratio
- Cutout, outpainting through configured image models, layer separation, grid split, storyboard stitching
- Models and runtimes download on demand and are not bundled in the installer

### Fully open model configuration

- Providers, models, Base URL, API key, headers and parameters are all local and configurable
- Any OpenAI-compatible endpoint, self-hosted service or relay; built-in presets (Kling, Volcengine Ark, MiniMax, Vidu and others) can be freely edited or removed
- Custom HTTP templates for non-OpenAI protocols
- Per-model capability declarations: input media (text / image / audio / video), generation modes, reference audio / video, parameter panel and output traits
- Configuration lives in local `models.json` and can be backed up, migrated or versioned
- Capability consistency checks: declarations are aligned with adapter behavior, and unsupported inputs fail at the generation entry

### Local adapters

- Run in a separate utility process with health checks, version, logs and hot reload
- Support same-name model overrides and `http-template` extensions
- MCP tools can list, reload and read adapter logs

## Download and install

Download the latest build from [GitHub Releases](https://github.com/LAUFLO/CineLab/releases/latest):

Current version: **v0.5.4**. See [CHANGELOG.md](CHANGELOG.md) for the full change log (Chinese).

| Platform | Recommended file | Requirements |
|---|---|---|
| Windows | `CineLab-0.5.4-x64.exe` | Windows 10 / 11 x64 |
| macOS | `CineLab-0.5.4-arm64.dmg` | macOS 12+, Apple Silicon |

### Windows

- The installer is not code-signed. On SmartScreen, choose "More info → Run anyway"
- Project data stays in the folder you choose; configuration lives in `%APPDATA%\CineLab`
- Uninstall from Windows Settings → Apps → CineLab

### macOS

- The installer is unsigned and not notarized. On first launch, right-click → Open, or allow it in System Settings → Privacy & Security
- Depth capture, vision enhancement and local subtitle components download per platform; vision enhancement depends on the Depth Motion Capture runtime
- The first macOS release does not support auto-update; download new versions manually
- Configuration lives in `~/Library/Application Support/CineLab`

After downloading, verify the installer against `SHA256SUMS.txt` on the release page.

If checking or downloading an update fails, the app offers "Open release page" and "Download in browser" fallbacks, trying the mirror proxy before the original GitHub URL.

## First run

1. Open CineLab and create a project in the project center
2. Go to Settings → Model providers, pick a preset or fill in Base URL / API key manually
3. Return to the canvas, double-click empty space or click the right-side `+` to create the first node
4. Download local subtitle, depth capture, vocal separation or vision components when prompted
5. To connect an external agent, open Settings → MCP and copy the HTTP or stdio configuration into your client

## Data and backup

- Projects live in the `.cinelab` folder you choose and contain canvases, timelines, Director Stage docs, film studies, assets, agent sessions and generation proposals
- Model configuration, settings and the MCP token live in the user data directory: `%APPDATA%\CineLab` on Windows, `~/Library/Application Support/CineLab` on macOS
- `models.json` can be backed up and moved to another machine
- Projects can be exported as an archive from the UI or through the MCP `project_export` tool
- All data stays local by default; CineLab does not upload project content

## Feedback

Report bugs and feature requests in [GitHub Issues](https://github.com/LAUFLO/CineLab/issues). Search for an existing issue first.

Please do not report security vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md) instead.

## Docs

- [Documentation index](docs/README.md): current docs, implemented plans and archived history
- [Code map](docs/code-map/README.md): module status, entry points and existing implementations
- [Changelog](CHANGELOG.md): changes per release
- [Architecture](docs/architecture.md): main-process architecture, project format, provider interface, task system
- [Model configuration](docs/models.md): `models.json` format and provider configuration
- [UI spec](docs/ui-spec.md): layout, node structure, Prompt Bar, toolbar inventory
- [CineBot capabilities](docs/agent-capabilities.md): current tools, validation, confirmation rules and turn undo
- [MCP](docs/mcp.md): HTTP / stdio setup, 100 tools, read-only mode and troubleshooting
- [Clip Studio](docs/code-map/03-clip-studio.md)
- [Director Stage](docs/code-map/04-director-stage.md)
- [Film Study](docs/code-map/05-film-study.md)

## Development

Environment requirements, common commands, project structure, branch policy and PR checks are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

The project is under active development. Issues and PRs are welcome. For larger changes, open an issue first to align on the approach, and read [CONTRIBUTING.md](CONTRIBUTING.md) and the [branch policy](docs/branch-policy.md) before submitting.

## License

[MIT](LICENSE)
