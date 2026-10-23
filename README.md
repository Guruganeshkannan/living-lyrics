# Living Lyrics

A Windows lyric visualizer in the spirit of the Cotodama Lyric Speaker. It shows the lyrics of whatever is playing on your PC (Spotify, YouTube in a browser, VLC and more) and places each line in a 3D world that reacts to the song's mood, sections and live audio.

It supports English and the major Indian languages (Tamil, Hindi, Urdu, Telugu, Kannada, Malayalam, Bengali, Marathi, Punjabi and Gujarati), in native script and in romanized spellings such as Tanglish and Hinglish.

## Run

```bash
npm install        # also downloads the Electron binary
npm run dev        # dev mode with hot reload
npm start          # production build + run
npm test           # unit tests
```

Play a song in any app that shows up in the Windows media flyout.

### Lyric sources

Lyrics are looked up in this order:

1. **Your own files:** dropped `.lrc` files, or files in `Documents/LivingLyrics/lyrics/`.
2. **The cache.**
3. **All online sources at the same time.** The best match wins, and the search gives up after 12 s.

| Source | Gives |
|---|---|
| [LRCLIB](https://lrclib.net) | Synced and plain lyrics (open, community-made) |
| Musixmatch (unofficial desktop endpoint) | Word-by-word timing when available. It may throttle anonymous use, in which case the app pauses it for 10 minutes. |
| NetEase Cloud Music (unofficial web API) | Synced lyrics |
| lyrics.ovh | Plain lyrics, used as a last resort |

To switch sources on or off, or change the timeout, edit `%APPDATA%/living-lyrics/settings.json`:

```json
{ "providers": ["lrclib", "musixmatch", "netease", "lyrics.ovh"], "searchTimeoutMs": 12000 }
```

Synced results are cached permanently. Misses and plain-only results are retried after a day.

## Keys

| Key | Action |
|---|---|
| `[` / `]` | Shift lyrics sync for this song by −/+100 ms (saved) |
| `Shift` + `[` / `]` | Shift sync for all songs (covers output-device latency) |
| `M` | Cycle mood manually, then back to auto |
| `R` | Look up this song's lyrics again |
| `F` / `Esc` | Toggle / exit fullscreen |
| `P` | Mini always-on-top window |
| `D` | Debug overlay: lyrics source, language, section, mood, camera, world, current motion choice, key, BPM, fps |
| `Ctrl+Shift+D` | Demo harness: cycle the built-in sample songs in every language |

**Your own lyrics:** drop a `.lrc` or `.txt` file on the window to assign it to the current song. You can also put `Artist - Title.lrc` files in `Documents/LivingLyrics/lyrics/`. Your own files always beat LRCLIB.

## How it works

- **Text:** lines are real DOM text, so Indian scripts and Urdu shape correctly.
  - Each line is placed in 3D with `CSS3DRenderer` and shares one camera with the WebGL world.
  - Words are split into aksharas, so conjuncts like क्ष or க்ஷ stay whole.
  - Each akshara gets a liquid karaoke sweep timed to the singing; Urdu sweeps right to left.
- **Camera:** each mood has its own path through space:
  - drift (romance, calm)
  - descend (heartbreak)
  - rise (triumphant)
  - jump (hype)
  - punch (revenge)
  - orbit (dark)
  - zigzag (playful)
  - pan (nostalgic)

  Chorus starts get a pull-back then push-in. Fly-ins land on the beat.
- **Worlds:** 8 shader scenes switch at section changes and are tinted by the song's key:
  - nebula
  - aurora
  - warp tunnel
  - mesh-gradient liquid
  - rain on glass
  - inferno
  - synthwave
  - crystal shards
- **Choreography:** 26 modern entrances and 17 exits.
  - Each line's move is scored against the song: mood blend, energy, tempo, the line's own emotion, how long it's sung, its length, its section and its words. For example, "break" shatters, tears fall and fire burns to ash.
  - Particle disintegration is used as punctuation, at section ends and on keywords, not on every line.
- **Mood (no AI):** emotion lexicons in `src/main/data/lexicon/*.json` are combined with live audio analysis (key mode, tempo, energy).
  - Romanized word lists only switch on when that language is detected, so English songs aren't misread.
- **Performance:** adaptive quality steps resolution, particles and shader detail up or down to stay smooth.

## Tuning

- **Mood words:** edit `src/main/data/lexicon/<lang>.json`. Each file has `moods`, `effects`, `negators` and `markers` (the common words used to detect romanized text). `word:2` gives a word double weight.
- **A mood's look:** edit its entry in `src/renderer/themes/themes.ts` (palette, fonts, camera, worlds per section, exit style).
- **New motion:** add a preset in `src/renderer/transitions/presets.ts` and give it a profile in `TransitionEngine.ts`.

## Troubleshooting

- **No track detected:** the player must publish to Windows media controls. Check with `D`.
- **No lyrics:** press `R`, or drop a `.lrc` file. The status line at the bottom says what happened.
- **"Electron uninstall" error:** run `node node_modules/electron/install.js`.
- **`app.whenReady` undefined:** unset the `ELECTRON_RUN_AS_NODE` environment variable (some IDE hosts set it).
