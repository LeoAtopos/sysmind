# SysMind Tauri

This folder contains a minimal Tauri wrapper for the SysMind web app.

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

5. Build for Windows:
   ```bash
   npm run tauri:build
   ```

The generated NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

## Notes

- The `fortauri` folder is a standalone Tauri project.
- You must have `cargo` and `rustup` installed to build.
