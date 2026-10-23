# Living Lyrics

A Windows desktop lyric visualizer in the spirit of the Cotodama Lyric Speaker. It shows the lyrics of whatever is playing on your PC (Spotify, YouTube in a browser, VLC and others), and the motion, color, typography and transitions follow the song's **mood** and **live audio**.

## Run

```bash
npm install        # also downloads the Electron binary
npm run dev        # dev mode with hot reload
npm start          # production build + run
npm test           # unit tests
```

Play a song in any app that shows up in the Windows media flyout. Lyrics are fetched from [LRCLIB](https://lrclib.net) and cached in `%APPDATA%/living-lyrics/cache`.

## Keys

| Key | Action |
|---|---|
| `[` / `]` | Lyrics sync −/+ 100 ms (saved per song) |
| `M` | Cycle mood manually (back to auto after the last one) |
| `F` / `Esc` | Toggle / exit fullscreen |
| `P` | Mini always-on-top window |
| `D` | Debug overlay (track, clock, section, mood, key, BPM, meters) |

## How the mood is decided (no AI)

1. **Lyrics** (`src/main/lyricMood.ts`): an emotion lexicon (`src/main/data/emotionLexicon.json`) plus AFINN sentiment places each line, section and the whole song on a valence/arousal plane. Repeated lines become the chorus; unique late lines become the bridge.
2. **Audio** (`src/renderer/mood/`): system-audio loopback gives the key (major/minor, Krumhansl profiles), tempo, energy and brightness. Sudden energy surges count as "the drop".
3. **Blend** (`moodDirector.ts`): mood = 60% lyrics + 40% audio. The audio share ramps in as its estimates settle, and a spring smooths the mood so visuals morph instead of snapping.

Nine themes (`src/renderer/themes/themes.ts`): romance, calm, nostalgic, playful, triumphant, hype, heartbreak, dark, revenge. Each defines fonts, palette, shader parameters, particle behavior, beat punch, shake, glitch and transition sets.

## Tuning

- **Wrong mood for a song type?** Add or remove words in `emotionLexicon.json` (`word:2` = double weight).
- **New look?** Add numbers to a theme; every scene parameter blends between moods automatically.
- **New transition?** Add it to `IN_PRESETS` / `OUT_PRESETS` in `src/renderer/transitions/presets.ts` and list it in a theme.

## Troubleshooting

- **No track detected:** the player must publish to Windows media controls (Spotify desktop, Chrome/Edge, and most players do). Check `D`.
- **Lyrics early or late:** press `[` / `]`. Browsers sometimes report position less precisely than Spotify.
- **"Electron uninstall" error:** run `node node_modules/electron/install.js`.
- **`app.whenReady` undefined:** the environment variable `ELECTRON_RUN_AS_NODE` is set (some IDE extension hosts do this). Unset it before running.
