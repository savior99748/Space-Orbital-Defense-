# Mobile build (Android + iOS)

Capacitor wrapper around the web game. See [../../PUBLISHING.md](../../PUBLISHING.md#mobile-capacitor).

```bash
npm install
npx cap add android   # once (commit the generated android/ folder)
npm run android       # copy the latest game files and open Android Studio
```

iOS needs a Mac with Xcode: `npx cap add ios`, then `npm run ios`.
