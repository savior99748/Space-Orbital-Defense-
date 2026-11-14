# Uploading Ringwarden to Steam

You need: your Steamworks **App ID** and **Windows depot ID**, the Steamworks SDK (download it from Steamworks;
it's licensed to your account, so it is **never** committed to this repo), and a Windows PC.

## One-time setup
1. Unzip the Steamworks SDK somewhere simple, e.g. `C:\steamworks_sdk`. You only use `sdk\tools\ContentBuilder\`.
2. Copy `ringwarden_app_build.vdf` (this folder) into `ContentBuilder\scripts\`, and `upload.bat` into
   `ContentBuilder\`.
3. Open `ringwarden_app_build.vdf` in Notepad and replace `APPID` and `DEPOTID` with your numbers.
4. Set `"steamAppId"` in `platforms/electron/package.json` to your App ID (achievements, overlay, Steam Cloud).
5. Run `ContentBuilder\builder\steamcmd.exe` once; it updates itself. Type `quit`.

## Every upload
1. GitHub → Actions → **Desktop build** → *Run workflow*. When it finishes, download **ringwarden-steam-windows**.
2. Delete what's in `ContentBuilder\content\ringwarden_windows\` and unzip the download into it, so that
   `Ringwarden Orbital Defense.exe` sits directly in that folder.
3. Double-click `upload.bat`, sign in. (Tip: set `"Preview" "1"` first for a dry run.)
4. In Steamworks → your app → **SteamPipe → Builds**, set the new build live on a branch (`default` = what players
   get). Then set the launch option: executable `Ringwarden Orbital Defense.exe` (Installation → General).

The installer (`ringwarden-windows-installer`) is for sharing outside Steam; Steam itself gets the folder.
