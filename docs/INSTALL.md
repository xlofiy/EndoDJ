# Installing EndoDJ

## Desktop app (recommended)

Installers are built automatically by GitHub Actions ("Desktop installers" workflow) for every
pull request and every version tag:

| System | File | How to install |
|--------|------|----------------|
| Windows 10/11 (64-bit) | `EndoDJ-<version>-win-x64.exe` | Run it and follow the installer (you can choose the folder; it adds Start-menu and desktop shortcuts). |
| macOS (Apple Silicon) | `EndoDJ-<version>-mac-arm64.dmg` | Open the .dmg, drag EndoDJ to Applications. |
| macOS (Intel) | `EndoDJ-<version>-mac-x64.dmg` | Same as above. |
| Linux | `EndoDJ-<version>-linux-x86_64.AppImage` or `…-linux-amd64.deb` | AppImage: `chmod +x` it and run. Debian/Ubuntu: `sudo apt install ./EndoDJ-…deb`. |

Where to download:
- **Releases** (for tagged versions such as `v0.2.0`): the repository's *Releases* page.
- **Latest development build**: repository → *Actions* → *Desktop installers* → newest run →
  *Artifacts* (`EndoDJ-Windows`, `EndoDJ-Linux`). You must be signed in to GitHub.
- **macOS** builds run for version tags and manual runs (*Actions* → *Desktop installers* →
  *Run workflow*). They need GitHub-hosted macOS runners to be available to the repository
  (Settings → Billing); so far the macOS jobs were never assigned a runner.

### "Unknown publisher" warnings
The installers are **not code-signed yet** (signing certificates cost money). Your system will warn you once:
- **Windows SmartScreen**: click *More info* → *Run anyway*.
- **macOS**: right-click EndoDJ in Applications → *Open* → *Open*. (Or System Settings → Privacy & Security → *Open Anyway*.)

### First start
1. Plug in the DDJ-FLX2 (USB), start EndoDJ, click **Start EndoDJ**.
2. Click **Add folder** and pick your music folder — EndoDJ remembers it, nothing is copied.
3. Controller → check the MIDI mapping with the monitor (see the hardware checklist in `HANDOFF.md`).

## Browser (no install)
```bash
npm install
npm run dev
```
Open the printed address in Chrome or Edge.

## Building the installers yourself
```bash
npm install
npm run dist          # installer for the system you are on, written to release/
npm run desktop       # just run the desktop app without packaging
```
