# Installing EndoDJ

## Desktop app (recommended)

Installers are built automatically by GitHub Actions ("Desktop installers" workflow) for every
pull request and every version tag:

| System | File | How to install |
|--------|------|----------------|
| Windows 10/11 (64-bit) | `EndoDJ-<version>-win-x64.exe` | Run it and follow the installer (you can choose the folder; it adds Start-menu and desktop shortcuts). |
| Linux | `EndoDJ-<version>-linux-x86_64.AppImage` or `…-linux-amd64.deb` | AppImage: `chmod +x` it and run. Debian/Ubuntu: `sudo apt install ./EndoDJ-…deb`. |

Where to download:
- **Releases**: the repository's *Releases* page — a new one for every change merged into `main`.
- **Latest development build**: repository → *Actions* → *Desktop installers* → newest run →
  *Artifacts* (`EndoDJ-Windows`, `EndoDJ-Linux`). You must be signed in to GitHub.
- **macOS** is not built for now (not needed yet). The `mac` section in `package.json` → `build`
  is kept; add `macos-latest` back to the workflow matrix to build a `.dmg`.

### Automatic updates
Installed apps update themselves (Windows installer and Linux AppImage):
- Every push to `main` builds a new version and publishes it as a GitHub Release (`v0.2.<build>`).
- EndoDJ checks the latest Release when it starts and every 4 hours, downloads new versions in the
  background, and installs them when you restart (or quit). A **Restart to update** button appears in the
  top bar when one is ready; Settings → General shows the version and a **Check for updates** button.
- Every push to `main` or the development branch is published as a Release, so the app updates after every change.
- Updating replaces the old version: the installer removes the previous version's program files, and EndoDJ
  deletes the downloaded update installer on its next start. Your library, cues, playlists and settings stay.
- The `.deb` package does not self-update — reinstall it, or use the AppImage.

### "Unknown publisher" warnings
The installers are **not code-signed yet** (signing certificates cost money). Your system will warn you once:
- **Windows SmartScreen**: click *More info* → *Run anyway*.

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
