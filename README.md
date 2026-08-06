# SysMind

A powerful and intuitive system mapping tool designed for visualizing ideas, planning projects, and organizing thoughts. Create interconnected nodes and connections to build complex diagrams with ease.

## Features

- **Node Creation**: Add nodes with different styles (default, text, note, warning)
- **Connections**: Create directional connections between nodes (forward, backward, both, none)
- **Keyboard Shortcuts**: Full keyboard navigation and editing support
- **Undo/Redo**: Complete history management
- **Import/Export**: Save and load system maps as JSON files
- **Zoom & Pan**: Smooth canvas navigation
- **Multi-language**: Support for English and Chinese
- **Responsive Design**: Works on desktop and mobile browsers

## How to Use

### Creating Nodes
- Press `Enter` to create a new node
- Click on a node to select and edit its text
- Use `Tab` to cycle through node styles

### Creating Connections
- Select a node and press `Enter` to start a connection
- Click on another node to complete the connection
- Hold `Shift + Enter` to create a node below the current one
- Press `Ctrl + Enter` (or `Cmd + Enter` on Mac) for return connections

### Navigation
- Use arrow keys to move focus between elements
- `Ctrl + Scroll` (or `Cmd + Scroll` on Mac) to zoom in/out
- `Ctrl + 0` (or `Cmd + 0` on Mac) to reset zoom
- Drag the canvas to pan around

### Editing
- Press `Space` to edit the selected element
- Press `Delete` (or `Backspace` on Mac) to delete focused elements
- `Ctrl + Z` (or `Cmd + Z` on Mac) to undo
- `Ctrl + Y` (or `Cmd + Y` on Mac) to redo

## Build Targets

The repository supports three independent targets:

| Target | Command | Output |
| --- | --- | --- |
| Local Web | `npm run dev` | `http://localhost:3000` |
| GitHub Pages | `npm run build:pages` | `forpages/` |
| Windows Desktop | `npm run tauri:build` | `fortauri/release/SysMind-tauri-portable-win-x64.zip` and GitHub Release asset |

[Download SysMind for Windows](https://github.com/LeoAtopos/sysmind/releases/latest/download/SysMind-tauri-portable-win-x64.zip)

[View GitHub Releases](https://github.com/LeoAtopos/sysmind/releases)

[Open SysMind on GitHub Pages](https://leoatopos.github.io/sysmind/)

Install root dependencies before running the local or Pages targets:

```bash
npm install
```

The Tauri target also requires Rust/Cargo and the Windows WebView2 Runtime. Its
dependencies are installed separately:

```bash
cd fortauri
npm install
npm run tauri:build
```

Each Windows release also publishes a SHA256 checksum file alongside the zip.

## Controls

| Action            | Shortcut                       |
| ----------------- | ------------------------------ |
| Create Node       | `Enter`                        |
| Create Connection | `Enter` (on selected node)     |
| Create Node Below | `Shift + Enter`                |
| Return Connection | `Ctrl + Enter` / `Cmd + Enter` |
| Edit Text         | `Space`                        |
| Delete            | `Delete` / `Backspace`         |
| Undo              | `Ctrl + Z` / `Cmd + Z`         |
| Redo              | `Ctrl + Y` / `Cmd + Y`         |
| Zoom In           | `Ctrl + =` / `Cmd + =`         |
| Zoom Out          | `Ctrl + -` / `Cmd + -`         |
| Reset Zoom        | `Ctrl + 0` / `Cmd + 0`         |
| Move Focus        | Arrow Keys                     |
| Cycle Node Style  | `Tab`                          |
| Search            | `/`                            |
| Open Shortcuts    | `Shift + ?`                    |


