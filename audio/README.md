# COLOSSUS — soundtrack (sound department)

Output: `out/soundtrack.wav` — 48 kHz, stereo, 16-bit, exactly 77.500 s, integrated loudness -17 LUFS, true peak about -1.5 dBTP (limiter ceiling -1.6, spec <= -1 dBTP).

## Render (deterministic)

From the repository root, Python 3.11+ with numpy, scipy, soundfile
(matplotlib only for the plot):

```
PY=python
$PY -I audio/tools/fetch_samples.py     # once: downloads the CC0 sample folders into audio/samples/ (~1.5 GB)
$PY -I audio/tools/build_index.py       # once: pitch-checks every sample, writes audio/samples/index.json
node audio/tools/dump_cues.mjs          # reads the live boulder impacts + cues from the film -> out/cues_live.json (required)
$PY -I audio/render.py                  # ~1 min: writes out/soundtrack.wav (+ audio/notes.json, caches)
$PY -I audio/tools/analyse.py           # report + out/sound_env.png + audio/analysis.json
$PY -I audio/tools/cuesheet.py > audio/cuesheet.md   # second-by-second cue sheet from what was mixed
$PY -I audio/tools/make_notes.py        # regenerates audio/NOTES.md with the measured numbers
ffmpeg -i out/soundtrack.wav -af ebur128=peak=true -f null -     # loudness check
```

Same samples + same code = the same file (all randomness is seeded).

## Layout

| File | What |
|---|---|
| `render.py` | the score (sections A–H, one function each), ambience, bus mix, reverbs, fader rides, master (LUFS normalise, soft clip, true-peak limiter, dither) |
| `lib/dsp.py` | sample instrument engine (nearest-zone pitch shifting, velocity layers, crossfade looping), filters, synthetic hall IRs, formant choir |
| `lib/sfx.py` | designed SFX: thunder bolt, flash boom, tinnitus, shock wave, debris, steam, metal groans, stone crunch, explosion, boulders, collapse, dust roar, footsteps, heartbeat, birds, water, wind, murmur |
| `tools/dump_cues.mjs` | opens the film headless (tools/env.mjs, scale 0.25), dumps FILM.ctx.fx.impacts (+ distance/pan to the shot camera), CUES and the visor ignite time to `out/cues_live.json` |
| `tools/fetch_samples.py`, `tools/build_index.py` | sample download + index |
| `tools/analyse.py` | RMS envelope, loudest moments, silence check, key per section (score + audio), major-triad scan, click scan, plot |
| `NOTES.md` | how the emotion map was built, the analysis of the delivered mix, second-by-second cue sheet |
| `cache/` | stems + pre-master mix of the last render (used by the analysis; safe to delete) |
| `notes.json`, `events.json` | log of every note / sound the last render mixed |
| `CREDITS.md` | sample sources and licenses |

Cue times are read from `src/shots.js` and from `out/cues_live.json` at every render; render.py stops if `cues_live.json` is missing. If the lead moves a cue or FX change the boulders, re-run `dump_cues.mjs` and re-render. Musical events inside a section are written relative to fixed times, so a big cue move still needs a look at that section.
