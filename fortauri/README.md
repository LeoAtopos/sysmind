# SysMind Tauri

This folder contains the standalone Tauri desktop build for SysMind.

## Setup

1. Install Rust toolchain and Cargo:
   - https://www.rust-lang.org/tools/install

2. Install Tauri CLI:
   ```bash
   npm install -D @tauri-apps/cli
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run in Tauri dev mode:
   ```bash
   npm run tauri:dev
   ```

5. Build the portable Windows package:
   ```bash
   npm run tauri:build
   ```

The portable package is written to `release/SysMind-tauri-portable-win-x64.zip`.
The published download is attached to GitHub Releases together with a
`SysMind-tauri-portable-win-x64.zip.sha256` checksum file.

## Notes

- The `fortauri` folder is a standalone Tauri project.
- You must have `cargo` and `rustup` installed to build.
