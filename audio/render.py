"""COLOSSUS soundtrack: score + designed SFX + ambience, mixed and mastered to out/soundtrack.wav.

Deterministic: same samples + same code -> same file.  Usage (from the project root):
    python -I audio/render.py            # full render (~3-6 min)
Key: D minor throughout (Aeolian/Phrygian colours). Cue times come from src/shots.js CUES.
"""
import os, sys, math, time, json
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from dsp import *  # noqa
import sfx as X  # noqa

PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, 'out', 'soundtrack.wav')
DUR = 77.5
TAIL = 0.0
N = secs(DUR)
T0 = time.time()

C = dict(bolt=20.3, flash=21.0, shock=22.0, startle=23.5, steam=24.5, hand=38.0, rise=40.5, shadow=42.5,
         head=45.0, headUp=49.5, legLift=55.0, silence=57.5, kick=59.0, debris=60.0, houseHit=61.6, run=66.5,
         breach=68.5, walkers=71.0, end=77.5)


def _read_cues():
    """Keep in sync with src/shots.js: parse its CUES block (falls back to the table above)."""
    import re
    try:
        src = open(os.path.join(PROJ, 'src', 'shots.js'), encoding='utf-8').read()
        blk = src[src.index('export const CUES'):]
        blk = blk[:blk.index('};')]
        found = {k: float(v) for k, v in re.findall(r'(\w+):\s*([0-9.]+)', blk)}
        for k in C:
            if k in found and abs(found[k] - C[k]) > 1e-6:
                print(f'CUE {k}: shots.js says {found[k]} (was {C[k]})')
                C[k] = found[k]
    except Exception as e:  # pragma: no cover
        print('could not read src/shots.js CUES:', e)


_read_cues()


def _read_live():
    """out/cues_live.json, dumped from the running film by audio/tools/dump_cues.mjs (boulder impacts from
    FILM.ctx.fx.impacts with distance/pan to the shot camera, CUES, colossus visor ignite). Required."""
    p = os.path.join(PROJ, 'out', 'cues_live.json')
    if not os.path.exists(p):
        raise SystemExit(f'MISSING {p} -- run first:  node audio/tools/dump_cues.mjs   (reads the impacts from the film)')
    d = json.load(open(p, encoding='utf-8'))
    if not d.get('impacts'):
        raise SystemExit(f'{p} has no impacts: re-run node audio/tools/dump_cues.mjs')
    for k, v in d.get('cues', {}).items():
        if k in C and abs(v - C[k]) > 1e-6:
            print(f'CUE {k}: live film says {v} (was {C[k]})')
            C[k] = v
    return d


LIVE = _read_live()
IMPACTS = LIVE['impacts']
_house = [m for m in IMPACTS if m.get('houseHit')]
if _house:
    C['houseHit'] = _house[0]['t']
# colossus timing (src/colossus-pose.js)
HAND_IMPACT = C['hand'] + 0.333   # fingers pop over the parapet at 38.0, the IMPACT lands at 38.333
CROWN = 45.3                      # the crown clears the parapet
VISOR = LIVE.get('colossus', {}).get('visorIgnite') or 47.2   # the visor slit ignites with a flash
GLOW, GONE = C['breach'], 70.2    # dissolve glow from 68.5, the colossus is gone at 70.2

BUSES = ['str', 'brass', 'wind', 'choir', 'harp', 'perc', 'sub', 'sfx', 'world', 'amb', 'tinn', 'hush']
B = {k: np.zeros((N, 2)) for k in BUSES}


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def M(n):
    return midi(n) if isinstance(n, str) else n


def spread(x, p):
    """Place a stereo sample toward a side (p in -1..1) keeping its own image."""
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    if p > 0:
        y[:, 1] += x[:, 0] * (1 - gl) * 0.7
    elif p < 0:
        y[:, 0] += x[:, 1] * (1 - gr) * 0.7
    return y


SEAT = {'vn_sus': -0.45, 'vn_trem': -0.45, 'va_sus': 0.15, 'va_trem': 0.15, 'vc_sus': 0.4, 'vc_trem': 0.4,
        'cb_sus': 0.55, 'cb_trem': 0.55, 'hn_sus': -0.3, 'hn_stac': -0.3, 'tb_sus': 0.3, 'tb_stac': 0.3,
        'tu_sus': 0.45, 'tu_stac': 0.45, 'tp_sus': 0.05, 'fl': -0.15, 'ob': 0.1, 'cl': -0.1, 'bn': 0.2,
        'harp': -0.6, 'glock': -0.25, 'glass': 0.0, 'bells': 0.3, 'vib_bow': 0.0}
BUSOF = {'vn': 'str', 'va': 'str', 'vc': 'str', 'cb': 'str', 'hn': 'brass', 'tb': 'brass', 'tu': 'brass',
         'tp': 'brass', 'fl': 'wind', 'ob': 'wind', 'cl': 'wind', 'bn': 'wind', 'harp': 'harp', 'glock': 'harp',
         'glass': 'harp', 'bells': 'amb', 'vib': 'harp'}
INST = {}
NOTES = []  # symbolic log of every sampled note (for the harmony analysis)
EVENTS = []  # every non-note sound added to a bus: [t0, t1, bus, label, level dB] (for the cue sheet in NOTES.md)
_add = add
_VARS = {'br': 'birds', 'w': 'canal water', 'wd': 'wind', 'mm': 'town murmur', 'br2': 'breeze (petals)',
         'rt': 'room tone', 'roll': 'timpani roll (cresc.)', 'rc': 'bass drum roll (cresc.)', 'sw': 'reverse swell',
         'sh': 'visor shimmer (sine cluster)', 'mm2': 'fearful murmur', 'x': 'boulder'}


def add(bus, x, t, gain=1.0):  # noqa: F811  (logging wrapper around dsp.add)
    import inspect, re
    fr = inspect.currentframe().f_back
    fn = fr.f_code.co_name
    if fn not in ('note', 'choir'):
        src_fr = fr.f_back if fn in ('hit',) else fr
        line = (inspect.getframeinfo(src_fr).code_context or [''])[0]
        if fn == 'timp':
            label = 'timpani'
        else:
            m = re.search(r"X\.S\('(\w+)'", line) or re.search(r"X\.(\w+)\(", line)
            label = m.group(1) if m else None
            if label is None or label in ('st', 'np'):
                m2 = re.search(r"\(\s*B\['\w+'\],\s*(\w+)", line) or re.search(r"hit\('\w+',\s*(\w+)", line)
                label = _VARS.get(m2.group(1), m2.group(1)) if m2 else 'sound'
            if label == 'thump':
                label = 'sub thump'
        y = x if x.ndim == 1 else np.abs(x).max(1)
        pk = np.abs(y).max() * gain + 1e-12
        idx = np.where(np.abs(y) * gain > pk * 0.1)[0]
        if len(idx):
            lvl = 20 * np.log10(np.sqrt(np.mean((x[idx[0]:idx[-1] + 1] * gain) ** 2)) + 1e-12)
            EVENTS.append([round(t + idx[0] / SR, 2), round(t + idx[-1] / SR, 2), [k for k, v in B.items() if v is bus][0],
                           label, round(float(lvl), 1)])
    _add(bus, x, t, gain)


def I(key):
    if key not in INST:
        INST[key] = Inst(key)
    return INST[key]


def note(key, n, t, dur, vel=0.6, g=0.0, att=0.0, rel=0.6, shape=None, bus=None, cents=0.0, rr=0):
    """Add one sampled note. g = gain dB; shape = [(t_rel, gain), ...] dynamic envelope inside the note."""
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key})
    x = I(key).note(M(n), dur, vel=vel, att=att, rel=rel, cents=cents, rr=rr)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    x = spread(x, SEAT.get(key, 0.0))
    add(B[bus or BUSOF[key.split('_')[0]]], x, t, db(g))


def chord(key, notes, t, dur, rr=0, **kw):
    for i, n in enumerate(notes):
        note(key, n, t, dur, rr=rr + i, **kw)


def choir(n, t, d, seed, voices=10, vowel='a', att=0.4, rel=0.8, g=0.0, shape=None, vib=0.012):
    """Formant-synth 'aah'/'ooh' section note (logged like the sampled notes)."""
    NOTES.append({'t': round(t, 3), 'dur': round(d, 3), 'midi': M(n), 'vel': 0.6, 'g': g, 'inst': 'choir_' + vowel})
    x = choir_note(M(n), d, seed, voices, vowel, att=att, rel=rel, vib=vib)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    add(B['choir'], x, t, db(g))


def hit(bus, x, t, g=0.0):
    add(B[bus], x, t, db(g))


def timp(n, t, g=0.0, drum=2, dur=4.0):
    f, pk = X.TIMP[drum]
    x = load(f)
    pk = pk or 150.0
    target = hz(M(n))
    # move the strongest partial to the target pitch class (nearest octave)
    ratio = target / pk
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = varispeed(x, ratio)[:secs(dur)]
    add(B['perc'], fade(y.copy(), 0.0005, 0.3), t, db(g))


# =====================================================================================================
# A. 0 - 18  morning: warm, slightly melancholic, never bouncy (D minor add9 / Bbmaj7 / Gm9 / Asus4)
# =====================================================================================================
def section_peace():
    log('peace')
    chords = [(0.0, 4.9, ['D3', 'A3', 'E4', 'F4']), (4.5, 4.9, ['Bb2', 'F3', 'A3', 'D4']),
              (9.0, 4.9, ['G2', 'D3', 'Bb3', 'A4']), (13.5, 5.6, ['A2', 'E3', 'F3', 'D4'])]
    for k, (t, d, ns) in enumerate(chords):
        last = k == 3
        sh = [(0, 1), (d, 1), (d + 2, 1)] if not last else [(0, 1), (3.0, 1), (5.4, 0.35), (7.5, 0.0)]
        for i, n in enumerate(ns):
            key = 'vc_sus' if M(n) < 52 else 'va_sus' if M(n) < 62 else 'vn_sus'
            note(key, n, t, d, vel=0.15, g=-10, att=1.4 if k else 2.2, rel=2.0, shape=sh, rr=i)
        # contrabass root, very soft
        note('cb_sus', M(ns[0]) - 12, t, d, vel=0.1, g=-17, att=1.5, rel=1.8, shape=sh)
    # harp: slow broken chords with rubato, decaying velocity (calm, not a dance)
    r = rng(5)
    harps = [['D2', 'A2', 'D3', 'E3', 'F3', 'A3', 'E4'], ['Bb1', 'F2', 'Bb2', 'D3', 'F3', 'A3', 'D4'],
             ['G1', 'D2', 'G2', 'Bb2', 'D3', 'A3', 'Bb3'], ['A1', 'E2', 'A2', 'D3', 'E3', 'F3']]
    pat = [0, 1, 2, 3, 4, 5, 6, 4]
    for k, (t, d, _) in enumerate(chords):
        ns = harps[k]
        for j, p in enumerate(pat if k < 3 else pat[:6]):
            tt = t + 0.25 + j * 0.52 + r.uniform(-0.03, 0.03)
            v = 0.4 - 0.025 * j
            note('harp', ns[min(p, len(ns) - 1)], tt, 2.6, vel=v, g=-9 - (4 if k == 3 else 0), rel=1.4)
    # celesta-like glints (glockenspiel, very soft, far)
    for t, n in [(2.4, 'A5'), (6.9, 'F5'), (11.3, 'D5'), (15.0, 'E5')]:
        note('harp', n, t, 2.5, vel=0.25, g=-17, rel=1.5)
        note('vib_bow', M(n) - 12 if M(n) - 12 >= 45 else n, t + 0.02, 1.6, vel=0.3, g=-30, att=0.1, rel=1.2, bus='harp')
    # solo flute, answered by oboe: sighing, stepwise, ends unresolved on the sus4
    fl = [(1.2, 'A4', 2.2), (3.4, 'G4', 0.7), (4.1, 'F4', 0.5), (4.6, 'D5', 2.0), (6.6, 'C5', 0.8), (7.4, 'A4', 1.5)]
    for t, n, d in fl:
        note('fl', n, t, d + 0.15, vel=0.35, g=-12, att=0.12, rel=0.5)
    ob = [(9.0, 'Bb4', 1.8), (10.8, 'A4', 0.6), (11.4, 'G4', 0.6), (12.0, 'F4', 1.4), (13.5, 'E4', 2.3), (15.8, 'D4', 2.6)]
    for t, n, d in ob:
        note('ob', n, t, d + 0.12, vel=0.3, g=-15, att=0.1, rel=0.7 if n != 'D4' else 1.6,
             shape=[(0, 1), (d, 1), (d + 1.6, 0.0)] if n == 'D4' else None)


# =====================================================================================================
# B. 18 - 20.3 thinning, a low drone creeps in.  Then bolt / flash / shock (21.0 - 24.5)
# =====================================================================================================
def section_omen():
    log('omen + flash')
    note('cb_sus', 'D2', 17.6, 3.4, vel=0.2, g=-15, att=2.4, rel=0.05, shape=[(0, 0.3), (2.7, 1.0), (3.4, 1.0)])
    note('vc_sus', 'D2', 18.2, 2.8, vel=0.15, g=-17, att=2.0, rel=0.05)
    note('va_trem', 'Eb3', 19.2, 1.8, vel=0.1, g=-28, att=1.4, rel=0.05)
    # bolt
    hit('sfx', X.thunder_bolt(), C['bolt'], -8)
    # the dome swells: reverse cymbal + rising noise into the flash
    sw = X.reverse_swell(0.62, 11, 'sus_cresc', 0.9)
    hit('sfx', sw, C['flash'] - len(sw) / SR, -8)
    hit('sub', X.flash_boom(), C['flash'], 3)
    hit('tinn', X.tinnitus(3.6), C['flash'] + 0.15, -24)
    hit('world', X.shock_wave(), C['shock'], -11)
    hit('world', X.debris_rattle(2.6, 51, 1.0, 1.0), C['startle'], -9)
    # muffled low string murmur creeping back under the ringing
    note('cb_trem', 'D2', 22.6, 2.4, vel=0.25, g=-15, att=1.5, rel=0.5)


# =====================================================================================================
# C. 24.5 - 38  dread
# =====================================================================================================
def section_dread():
    log('dread')
    swell = lambda d, a=0.3, b=1.0: [(0, a), (d, b), (d + 3, b)]
    note('cb_trem', 'D2', 24.5, 10.0, vel=0.3, g=-12, att=2.0, rel=1.0, shape=swell(10, 0.5, 1.0))
    note('vc_trem', 'D2', 25.5, 9.0, vel=0.25, g=-14, att=3.0, rel=1.0, shape=swell(9, 0.4, 1))
    note('vc_trem', 'Eb2', 26.5, 8.0, vel=0.2, g=-16, att=3.5, rel=1.0, shape=swell(8, 0.4, 1))
    note('va_trem', 'F3', 29.0, 5.5, vel=0.2, g=-16, att=2.5, rel=1.0)
    note('va_trem', 'Eb3', 29.6, 4.9, vel=0.2, g=-17, att=2.5, rel=1.0)
    note('vn_trem', 'D5', 31.0, 3.5, vel=0.15, g=-22, att=2.0, rel=1.0)
    note('vn_trem', 'Eb5', 31.4, 3.1, vel=0.15, g=-23, att=2.0, rel=1.0)
    note('va_trem', 'F4', 31.2, 3.3, vel=0.15, g=-22, att=2.0, rel=1.0)
    note('bn', 'D2', 27.5, 7.0, vel=0.25, g=-16, att=2.0, rel=1.0)
    # semitone threat motif in low horns (A -> Bb), twice, getting closer
    for t, g in [(28.6, -15), (32.4, -12)]:
        note('hn_sus', 'D3', t, 1.4, vel=0.35, g=g, att=0.35, rel=0.3)
        note('hn_sus', 'Eb3', t + 1.35, 2.2, vel=0.4, g=g + 1, att=0.2, rel=1.0)
        note('tb_sus', 'D2', t, 3.6, vel=0.3, g=g - 3, att=0.8, rel=1.0)
    # 34.5 - 37.3: everyone frozen. The orchestra drops to a whisper (cluster held very soft)
    note('cb_trem', 'D2', 34.4, 3.2, vel=0.15, g=-18, att=0.6, rel=0.3)
    note('vn_trem', 'D5', 34.4, 3.0, vel=0.1, g=-28, att=0.4, rel=0.3)
    note('vn_trem', 'Eb5', 34.4, 3.0, vel=0.1, g=-28, att=0.4, rel=0.3)
    # heartbeat from 26, stronger and a little faster, stops before the hand
    t, k = 26.0, 0
    while t < 37.2:
        lv = 0.35 + 0.65 * min(1, (t - 26) / 9)
        hit('sub', X.heartbeat(lv, 150 + k), t, -10)
        t += 1.0 - 0.1 * min(1, (t - 26) / 9)
        k += 1
    # metal groans from behind the wall (distant)
    hit('sfx', X.metal_groan(3.6, 201, 1.0, 1.0), 27.0, -13)
    hit('sfx', X.metal_groan(4.2, 202, 0.85, 1.0), 31.0, -11)
    hit('sfx', X.metal_groan(2.6, 203, 1.1, 0.7), 35.2, -15)
    # suck-in before the hand
    sw = X.reverse_swell(0.7, 12, 'gong_roll', 0.8)
    hit('sfx', sw, HAND_IMPACT - len(sw) / SR, -7)
    # 38.0 - 38.33: the fingers pop over the parapet -> a fast air whoosh rushing into the impact
    n = secs(HAND_IMPACT - C['hand'] + 0.08)
    tt = np.arange(n) / SR
    wz = np.stack([pink(n, 16), pink(n, 17)], 1)
    wz = sweep_lp(wz, 500 + 4500 * np.clip(tt / (n / SR - 0.08), 0, 1) ** 2)
    wz = hp(wz, 120) * env_points(n, [(0, 0), (0.06, 0.35), (n / SR - 0.08, 1.0), (n / SR, 0)])[:, None] ** 1.5
    hit('sfx', wz, C['hand'], -6)


# =====================================================================================================
# D. 38.333 HAND stinger (fingers over the parapet at 38.0, impact 38.333), 38.5 - 45.3 ostinato / rise
# =====================================================================================================
def section_hand_rise():
    log('hand + rise')
    t = HAND_IMPACT
    sh = [(0, 1), (0.5, 0.8), (1.5, 0.35), (4, 0.25)]
    note('tu_sus', 'D1', t, 1.6, vel=1.0, g=2, att=0.0, rel=1.5, shape=sh)
    chord('tb_sus', ['D2', 'A2'], t, 1.6, vel=1.0, g=1, rel=1.5, shape=sh)
    chord('hn_sus', ['D3', 'Eb3', 'A3'], t, 1.6, vel=1.0, g=0, rel=1.5, shape=sh)
    chord('vc_sus', ['D2', 'D3'], t, 1.8, vel=1.0, g=0, rel=1.5, shape=sh)
    note('cb_sus', 'D1', t, 1.8, vel=1.0, g=1, rel=1.5, shape=sh)
    timp('D2', t, 3, drum=2)
    hit('perc', X.S('bd_vsco_fff', 0.8), t, 2)
    hit('perc', X.S('bd2_ff', 0.7), t + 0.004, 0)
    hit('perc', X.S('gong_ff', 0.8), t + 0.01, -3)
    hit('perc', X.S('crash_ff'), t, -7)
    hit('sub', X.st(X.thump(70, 26, 1.3, 4.0, 300) * 1.3, 0), t, 1)
    hit('world', X.stone_crunch(1.8, 301, 1.3), t, 3)
    hit('perc', X.S('anvil', 0.5), t + 0.005, -8)
    hit('world', X.grinding_crack(2.4, 302, 1.0), t + 0.1, -4)
    hit('world', X.grains(4.0, lambda u: 50 * math.exp(-u / 1.5) + 3, 303, 900, 6000, (0.002, 0.01), (5, 18)), t + 0.5, -4)

    # ostinato: low strings + basses, 8ths accelerating 96 -> 122 bpm, D Phrygian (D Eb F)
    pat = ['D2', 'D2', 'D3', 'D2', 'F2', 'D2', 'Eb2', 'D2', 'D2', 'D2', 'F2', 'D2', 'Eb2', 'D2', 'C3', 'Eb2']
    tt, k = 39.0, 0
    while tt < CROWN:
        u = (tt - 39.0) / (CROWN - 39.0)
        e8 = 60 / (96 + 26 * u) / 2
        n = pat[k % len(pat)]
        acc = k % 4 == 0
        v = 0.45 + 0.4 * u + (0.15 if acc else 0)
        note('vc_spic', n, tt, e8 * 0.7, vel=min(1, v), g=-7 + 5 * u + (2 if acc else 0), rel=0.15, rr=k)
        note('va_spic', M(n) + 12, tt, e8 * 0.6, vel=min(1, v) * 0.8, g=-14 + 6 * u, rel=0.12, rr=k + 1)
        if acc or k % 4 == 3:
            note('cb_spic', M(n) - 12, tt, e8 * 0.7, vel=min(1, v), g=-8 + 5 * u, rel=0.15, rr=k)
        if tt >= 40.5 and k % 2 == 0:
            timp('D2' if n != 'Eb2' else 'Eb2', tt, -14 + 10 * u + (3 if acc else 0), drum=2, dur=1.5)
        tt += e8
        k += 1
    # high string tension swelling, semitone clusters rising with the colossus
    note('vn_trem', 'D5', 40.5, 2.1, vel=0.3, g=-17, att=1.0, rel=0.3)
    note('vn_trem', 'Eb5', 40.5, 2.1, vel=0.3, g=-18, att=1.0, rel=0.3)
    note('vn_trem', 'Eb5', 42.5, 2.6, vel=0.5, g=-15, att=0.6, rel=0.3)
    note('vn_trem', 'F5', 42.5, 2.6, vel=0.5, g=-16, att=0.6, rel=0.3)
    note('va_trem', 'D4', 42.5, 2.6, vel=0.5, g=-14, att=0.8, rel=0.3)
    note('hn_sus', 'D3', 40.5, 1.0, vel=0.5, g=-11, att=0.6, rel=0.2)
    note('hn_sus', 'F3', 41.5, 1.0, vel=0.55, g=-10, att=0.2, rel=0.2)
    note('va_sus', 'F3', 40.5, 4.5, vel=0.4, g=-15, att=1.0, rel=0.3)
    note('hn_sus', 'Eb3', 42.5, 2.6, vel=0.7, g=-9, att=0.5, rel=0.2, shape=[(0, 0.6), (2.5, 1.0)])
    note('tb_sus', 'D2', 43.0, 2.1, vel=0.7, g=-9, att=1.2, rel=0.2)
    note('tu_sus', 'D1', 43.3, 1.8, vel=0.7, g=-10, att=1.0, rel=0.2)
    rc = load(X.P['bd2_roll_ff'])[secs(1.0):secs(1.0) + secs(2.6)]
    rc = rc * np.linspace(0.05, 1.0, len(rc))[:, None] ** 2.5
    add(B['perc'], fade(rc.copy(), 0.3, 0.03), CROWN - 2.6, db(-6))
    sw = X.reverse_swell(1.6, 13, 'sus_roll_long', 1.0)
    hit('perc', sw, CROWN - len(sw) / SR, -8)
    # the rise: creaking metal, steam bursts, the shadow
    hit('sfx', X.metal_groan(4.5, 211, 0.75, 1.2, 0.5), C['rise'], -11)
    hit('sfx', X.steam_burst(2.4, 212), C['rise'] + 0.1, -14)
    hit('sfx', X.steam_burst(2.6, 213), C['shadow'], -14)
    n = secs(3.0)
    whoosh = lp(np.stack([brown(n, 214), brown(n, 215)], 1), 300) * env_points(n, [(0, 0), (1.2, 1), (3.0, 0)])[:, None]
    hit('sfx', whoosh, C['shadow'] - 0.4, -11)


# =====================================================================================================
# E. 45 - 49.5 HEAD: the goosebumps.  i - bvi - iv - i, all minor (Dm, Bbm, Gm, Dm), crescendo -> 49.5 terror chord
# =====================================================================================================
def section_head():
    log('head (choir)')
    # the crown clears the parapet at CROWN (45.3); the Gm chord lands with the visor ignition (47.2)
    c2 = (CROWN + VISOR) / 2
    c4 = (VISOR + C['headUp']) / 2 + 0.1
    prog = [(CROWN, c2 - CROWN, ['D2', 'A2'], ['D3', 'A3'], ['F4', 'A4', 'D5'], 0.45),
            (c2, VISOR - c2, ['Bb1', 'F2'], ['Bb2', 'F3'], ['Db4', 'F4', 'Bb4'], 0.55),
            (VISOR, c4 - VISOR, ['G1', 'D2'], ['G2', 'D3'], ['D4', 'G4', 'Bb4'], 0.68),
            (c4, C['headUp'] - c4, ['D2', 'A2'], ['D3', 'A3'], ['F4', 'A4', 'D5'], 0.82)]
    for k, (t, d, low, mid, top, v) in enumerate(prog):
        o = 0.12  # overlap
        g = [-4, -1, 2.5, 3.5][k]
        # choir
        for i, n in enumerate(mid):
            choir(n, t, d + o, 1000 + k * 10 + i, 10, 'a', att=0.35 if k else 1.0, rel=0.5, g=g - 6)
        for i, n in enumerate(top):
            choir(n, t, d + o, 1100 + k * 10 + i, 12, 'a', att=0.35 if k else 1.0, rel=0.5, g=g - 8)
        # brass (the first chord is a fortepiano: a deep accent as the head breaks the skyline, then the swell)
        fp = [(0, 2.6), (0.35, 1.0), (d + 1, 1.0)] if k == 0 else None
        note('tu_sus', M(low[0]) - 12, t, d + o, vel=v if k else 0.9, g=g - 1, att=0.15 if k else 0.0, rel=0.4, shape=fp)
        chord('tb_sus', low, t, d + o, vel=v if k else 0.9, g=g - 1, att=0.15 if k else 0.0, rel=0.4, shape=fp)
        if k == 0:
            hit('perc', X.S('bd_vsco_ff', 0.7), t, -8)
            hit('perc', X.S('gong_mf', 0.75), t, -12)
        chord('hn_sus', mid, t, d + o, vel=v, g=g - 1, att=0.15, rel=0.4)
        if k >= 2:
            chord('tp_sus', top[:2], t, d + o, vel=v, g=g - 7, att=0.1, rel=0.4)
            note('vn_trem', M(top[-1]) + 12 if M(top[-1]) + 12 <= 86 else top[-1], t, d + o, vel=v, g=g - 9, att=0.1, rel=0.4)
        # strings
        chord('vc_sus', [low[0], mid[0]], t, d + o, vel=v, g=g - 3, att=0.2, rel=0.4)
        chord('va_sus', mid[1:] + [top[0]], t, d + o, vel=v, g=g - 4, att=0.2, rel=0.4)
        chord('vn_sus', top[1:], t, d + o, vel=v, g=g - 4, att=0.2, rel=0.4)
        note('cb_sus', M(low[0]) - 12 if M(low[0]) - 12 >= 24 else low[0], t, d + o, vel=v, g=g - 3, att=0.15, rel=0.4)
        timp(low[0], t, g - 4, drum=2)
    # crescendo engine: timpani roll + bass drum roll + cymbal swell into 49.5
    roll = varispeed(load(X.P['timp_roll']), 0.95)[:secs(2.6)]
    roll = roll * np.linspace(0.15, 1.0, len(roll))[:, None] ** 2
    add(B['perc'], fade(roll.copy(), 0.2, 0.02), C['headUp'] - 2.6, db(-4))
    sw = X.reverse_swell(1.3, 14, 'gong_roll', 0.9)
    add(B['perc'], sw, C['headUp'] - len(sw) / SR, db(-7))

    # visor ignition at VISOR (47.2): a bright flash hit (bell + struck glass + cluster spike), then the shimmer
    # (bowed vibes + glass + a beating sine cluster) holds and grows to the headUp chord
    t = VISOR
    hl = C['headUp'] - t
    note('bells', 'D5', t, 2.5, vel=0.7, g=-10, rel=2.0, bus='harp')
    note('glass', 'D6', t, 1.5, vel=0.9, g=-9, att=0.0, rel=1.2, bus='harp')
    hit('perc', hp(X.S('crash_ff'), 3000), t, -17)
    note('vib_bow', 'D5', t, hl + 1.1, vel=0.8, g=-2, att=0.25, rel=1.5, bus='harp')
    note('vib_bow', 'A5', t + 0.15, hl + 0.9, vel=0.8, g=-6, att=0.4, rel=1.5, bus='harp')
    note('glass', 'D5', t + 0.1, hl + 1.0, vel=0.8, g=-4, att=0.3, rel=1.5, bus='harp')
    n = secs(hl + 1.8)
    tt = np.arange(n) / SR
    spike = np.clip(tt / 0.03, 0, 1) * np.exp(-tt / 0.35)                       # the ignite flash
    hold = np.clip(tt / 0.4, 0, 1) * (0.45 + 0.55 * np.clip(tt / hl, 0, 1) ** 2)  # glow growing to headUp
    e = (np.maximum(spike, hold) * np.exp(-np.maximum(0, tt - hl) / 0.8))
    sh = sum(np.sin(2 * np.pi * f * tt + p) * a for f, p, a in
             [(1174.7, 0, 1), (1176.9, 1, .7), (2349.3, 2, .5), (3524, 3, .3), (4698.6, 4, .2)])
    sh = sh * (1 + 0.3 * np.sin(2 * np.pi * 7 * tt)) * e
    add(B['harp'], X.st(sh * 0.05, 0.8, 3), t, db(9))

    # 49.5: impact + the vast dissonant chord (D minor with Ab and Eb), decaying into the drone
    t = C['headUp']
    hit('perc', X.S('bd_vsco_fff', 0.85), t, -6)
    hit('perc', X.S('gong_ff', 0.9), t, -8)
    hit('perc', X.S('crash_ff'), t, -11)
    timp('D2', t, -1, drum=2)
    hit('sub', X.st(X.thump(65, 30, 1.0, 3.0, 400), 0), t, -6)
    d = 3.2
    shp = [(0, 1), (0.6, 0.75), (d, 0.3), (d + 2.5, 0.0)]
    note('tu_sus', 'D1', t, d, vel=1.0, g=-2, rel=2.5, shape=shp)
    chord('tb_sus', ['D2', 'A2'], t, d, vel=1.0, g=-3, rel=2.5, shape=shp)
    chord('hn_sus', ['D3', 'Ab3', 'F4'], t, d, vel=1.0, g=-3, rel=2.5, shape=shp)
    chord('tp_sus', ['Ab4', 'Eb5'], t, d, vel=0.9, g=-8, rel=2.0, shape=shp)
    chord('vc_sus', ['D2', 'A2'], t, d, vel=1.0, g=-4, rel=2.5, shape=shp)
    chord('va_sus', ['Ab3', 'D4'], t, d, vel=1.0, g=-5, rel=2.5, shape=shp)
    chord('vn_trem', ['F5', 'Eb6'], t, d, vel=0.9, g=-8, rel=2.5, shape=shp)
    note('cb_sus', 'D1', t, d, vel=1.0, g=-3, rel=2.5, shape=shp)
    for i, n in enumerate(['D3', 'Ab3']):
        choir(n, t, d, 1300 + i, 10, 'a', att=0.12, rel=3.0, g=-3, shape=shp)
    for i, n in enumerate(['F4', 'D5', 'Eb5']):
        choir(n, t, d, 1310 + i, 12, 'a', att=0.12, rel=3.0, g=-6, shape=shp)


# =====================================================================================================
# F. 49.5 - 57.5 suspended terror, 55 legLift build, hard cut to silence at 57.5
# =====================================================================================================
def section_terror():
    log('terror + silence')
    note('cb_sus', 'D2', 51.0, 6.6, vel=0.4, g=-11, att=2.0, rel=0.05)
    note('vc_trem', 'D2', 51.5, 6.1, vel=0.3, g=-14, att=2.0, rel=0.05, shape=[(0, 0.6), (3.5, 0.6), (6.1, 1.4)])
    note('va_trem', 'Eb3', 52.5, 5.1, vel=0.2, g=-19, att=2.0, rel=0.05, shape=[(0, 0.6), (2.5, 0.6), (5.1, 1.6)])
    t, k = 51.0, 0
    while t < 57.3:
        u = (t - 51) / 6.3
        hit('sub', X.heartbeat(0.55 + 0.45 * u, 500 + k), t, -11)
        t += 0.92 - 0.2 * u
        k += 1
    hit('sfx', lp(X.steam_burst(2.2, 501), 2500), 51.0, -16)
    hit('sfx', lp(X.steam_burst(2.0, 502), 2500), 53.6, -17)
    hit('sfx', X.metal_groan(3.0, 503, 0.9, 0.8), 52.3, -16)
    # 55: the leg lifts -- grinding metal, ground rumble, rising brass and strings into the cut
    t = C['legLift']
    hit('sfx', X.metal_groan(2.6, 504, 0.6, 1.5, 0.8), t, -6)
    n = secs(2.6)
    rb = lp(np.stack([brown(n, 505), brown(n, 506)], 1), 140) * env_points(n, [(0, 0), (0.4, 1), (2.6, 0.8)])[:, None]
    hit('sub', rb, t, -11)
    hit('world', X.debris_rattle(2.4, 507, 0.6, 0.6), t + 0.3, -10)
    up = [(0, 0.25), (2.45, 1.0), (2.6, 1.0)]
    note('tb_sus', 'D2', t, 2.5, vel=0.85, g=-1, att=0.4, rel=0.03, shape=up)
    note('tb_sus', 'Eb2', t + 0.8, 1.7, vel=0.8, g=-4, att=0.4, rel=0.03, shape=up)
    note('tu_sus', 'D1', t, 2.5, vel=0.8, g=-3, att=0.4, rel=0.03, shape=up)
    note('hn_sus', 'D3', t + 0.3, 2.2, vel=0.8, g=-5, att=0.6, rel=0.03, shape=up)
    note('hn_sus', 'Eb3', t + 1.1, 1.4, vel=0.8, g=-6, att=0.4, rel=0.03, shape=up)
    chord('vn_trem', ['D5', 'Eb5', 'F5'], t + 0.5, 2.0, vel=0.7, g=-8, att=1.0, rel=0.03, shape=up)
    chord('vc_trem', ['D2', 'Eb2'], t, 2.5, vel=0.7, g=-6, att=0.8, rel=0.03, shape=up)
    roll = varispeed(load(X.P['timp_roll2']), 0.9)[:secs(2.5)] * np.linspace(0.1, 1, secs(2.5))[:, None] ** 2
    add(B['perc'], roll, t, db(-7))
    # the held breath: almost nothing (room tone, one faint high glass tone, a few grains of dust)
    s0, s1 = C['silence'], C['kick']
    rt = X.room_tone(s1 - s0 + 0.2, 510)
    add(B['hush'], rt * env_points(len(rt), [(0, 0), (0.15, 1), (s1 - s0, 1), (s1 - s0 + 0.2, 0)])[:, None], s0, db(-38))
    note('glass', 'D5', s0 + 0.1, 1.3, vel=0.3, g=-42, att=0.5, rel=0.2, bus='hush')
    hit('hush', X.grains(1.2, lambda u: 6, 511, 1500, 6000, (0.002, 0.006), (6, 16)), s0 + 0.2, -34)


# =====================================================================================================
# G. 59 - 68.5 KICK and chaos
# =====================================================================================================
BEAT = 60 / 132
BAR = BEAT * 4


def section_chaos():
    log('kick + chaos')
    t = C['kick']
    hit('sub', X.explosion(), t, 4.5)
    # orchestra re-enters with full force on D
    sh = [(0, 1), (0.4, 0.85), (1.6, 0.6), (1.85, 0.5)]
    note('tu_sus', 'D1', t, 1.7, vel=1, g=-2, rel=0.6, shape=sh)
    chord('tb_sus', ['D2', 'A2', 'D3'], t, 1.7, vel=1, g=-3, rel=0.6, shape=sh)
    chord('hn_sus', ['D3', 'F3', 'A3'], t, 1.7, vel=1, g=-3, rel=0.6, shape=sh)
    chord('tp_sus', ['D4', 'F4'], t, 1.7, vel=1, g=-8, rel=0.6, shape=sh)
    timp('D2', t, 0, drum=2)
    hit('perc', X.S('gong2_fff', 0.7), t, -6)

    bars = [(59.0, 'D'), (59.0 + BAR, 'Bb'), (59.0 + 2 * BAR, 'Eb'), (59.0 + 3 * BAR, 'D'), (59.0 + 4 * BAR, 'G'),
            (59.0 + 5 * BAR, 'D')]
    CH = {'D': (['D2', 'A2'], ['D3', 'F3', 'A3'], 'D'), 'Bb': (['Bb1', 'F2'], ['Bb2', 'F3', 'Bb3'], 'Bb'),
          'Eb': (['Eb2', 'Bb2'], ['Eb3', 'Bb3', 'Eb4'], 'Eb'), 'G': (['G1', 'D2'], ['G2', 'Bb2', 'D3'], 'G')}
    TIMPN = {'D': 'D2', 'Bb': 'Bb1', 'Eb': 'Eb2', 'G': 'G2'}
    horn = {0: [('D4', 0, 4)], 1: [('F4', 0, 3), ('E4', 3, 1)], 2: [('Eb4', 0, 4)], 3: [('D4', 0, 2), ('E4', 2, 2)],
            4: [('D4', 0, 4)], 5: [('D4', 0, 2)]}
    vnline = ['A5', 'F5', 'Gb5', 'A5', 'G5', 'F5']
    big = [1, 0, 0, 1, 0, 0, 1, 0]
    tom = [0, 0, 1, 0, 1, 1, 0, 1]
    for bi, (tb_, name) in enumerate(bars):
        low, mid, _ = CH[name]
        last = bi == 5
        end = C['breach'] if last else tb_ + BAR
        dur = end - tb_
        g = 0 if bi < 5 else -5
        # sustained strings + low brass pads under the hits
        chord('vc_trem', [low[0], low[1]], tb_, dur, vel=0.85, g=-8 + g, att=0.05, rel=0.25 if not last else 0.6)
        chord('va_trem', mid, tb_, dur, vel=0.8, g=-11 + g, att=0.05, rel=0.25 if not last else 0.6)
        note('cb_trem', M(low[0]) - 12 if M(low[0]) - 12 >= 26 else low[0], tb_, dur, vel=0.85, g=-8 + g, rel=0.3)
        note('vn_trem', vnline[bi], tb_, dur, vel=0.75, g=-12 + g, att=0.05, rel=0.3)
        note('vn_trem', M(vnline[bi]) - 12, tb_, dur, vel=0.7, g=-14 + g, att=0.05, rel=0.3)
        if bi >= 1:
            for n, b0, nb in horn[bi]:
                note('hn_sus', n, tb_ + b0 * BEAT, nb * BEAT + 0.05, vel=0.9, g=-6 + g, att=0.06, rel=0.4)
                note('hn_sus', M(n) - 12, tb_ + b0 * BEAT, nb * BEAT + 0.05, vel=0.85, g=-9 + g, att=0.06, rel=0.4)
        if 2 <= bi <= 4:
            for i, n in enumerate(mid):
                choir(M(n) + 12, tb_, dur + 0.1, 2000 + bi * 10 + i, 10, 'a', att=0.15, rel=0.5, g=-9)
        # 3+3+2 percussion and low brass stabs
        for e in range(8):
            te = tb_ + e * BEAT / 2
            if te >= C['breach'] - 0.05:
                break
            if big[e]:
                hit('perc', X.S('bd2_f' if e else 'bd2_ff', 0.82, 2.0), te, -4 if e == 0 else -6)
                hit('perc', X.S('frameL' if e % 2 else 'frameL2', 0.8, 1.0), te, -8)
                timp(TIMPN[name], te, -4 if e == 0 else -7, drum=2, dur=1.6)
                stv = 0.95 if e == 0 else 0.8
                chord('tb_stac', low, te, 0.25, vel=stv, g=-6, rel=0.25, rr=e)
                note('tu_stac', M(low[0]) - 12 if M(low[0]) - 12 >= 33 else low[0], te, 0.25, vel=stv, g=-6, rel=0.25, rr=e)
                note('hn_stac', mid[0], te, 0.25, vel=stv, g=-9, rel=0.25, rr=e)
            if tom[e]:
                hit('perc', X.S('tomL' if e % 2 else 'tomH', 0.85, 1.0), te, -11)
        if bi == 3:  # 16th fill on the last two beats
            for j in range(8):
                te = tb_ + 2 * BEAT + j * BEAT / 4
                hit('perc', X.S('tomL2' if j % 2 else 'tomH2', 0.85, 0.8), te, -15 + j)
    # boulders: whistle + impact on the FX department's live landings (out/cues_live.json from FILM.ctx.fx.impacts);
    # distance / pan relative to the camera of the shot each one lands in, size -> weight and level
    for i, m in enumerate(b for b in IMPACTS if not b.get('houseHit')):
        ti, size = m['t'], m['size']
        dist = max(1.0, min(3.2, m['dist'] / 60))
        pn = max(-0.85, min(0.85, m['pan'] * 0.85))
        x, w = X.boulder(dist, 600 + i * 7, 1.0, size / 4.5, pn)
        if m['front'] < -0.3:   # behind the camera: a little duller
            x = lp(x, 2500)
        hit('world', x, ti - w, -3 - 5 * (dist - 1) + 6 * math.log10(size / 4.5))
    # the house
    x, w = X.boulder(1.0, 690, 0.9, 1.3)
    hit('world', x, C['houseHit'] - w, 0)
    hit('world', X.collapse(), C['houseHit'], -4)
    # dust wave and running from 66.5
    hit('world', X.dust_roar(4.2), C['run'] - 0.3, -5)
    hit('world', X.debris_rattle(4.0, 700, 0.6, 2.0), C['run'], -9)
    # constant debris rain bed
    n = secs(9.0)
    bed = X.grains(9.0, lambda u: 35, 710, 600, 5000, (0.002, 0.015), (4, 14))
    hit('world', bed * env_points(n, [(0, 0), (1, 1), (8, 1), (9, 0)])[:, None], 59.5, -12)


# =====================================================================================================
# H. 68.5 - 77.5 lament
# =====================================================================================================
def section_lament():
    log('lament')
    t = C['breach']
    hit('perc', X.S('gong_p', 0.8), t, -17)
    for t0, n, d in [(t, 'D2', 2.6), (71.1, 'C2', 1.1), (72.2, 'Bb1', 1.4), (73.6, 'A1', 3.2)]:
        note('cb_sus', n, t0, d, vel=0.4, g=-10, att=0.3, rel=1.5)
    melody = [(68.8, 'D3', 2.3), (71.1, 'C3', 1.1), (72.2, 'Bb2', 1.5), (73.7, 'A2', 2.6)]
    for t0, n, d in melody:
        note('vc_sus', n, t0, d + 0.1, vel=0.5, g=-8, att=0.35, rel=1.2 if n != 'A2' else 1.8)
    # lower harmony in violas, sighing
    for t0, n, d in [(69.2, 'F3', 1.9), (71.1, 'Eb3', 1.1), (72.2, 'Db3', 1.35), (73.7, 'E3', 2.6)]:
        note('va_sus', n, t0, d, vel=0.35, g=-13, att=0.6, rel=1.5)
    # choir 'oo', soft and low, open fifths for the end (no major third)
    pads = [(68.9, 2.3, ['D3', 'A3', 'F4']), (71.1, 1.2, ['C3', 'G3', 'Eb4']), (72.2, 1.5, ['Bb2', 'F3', 'Db4']),
            (73.6, 3.0, ['A2', 'E3', 'A3'])]
    for k, (t0, d, ns) in enumerate(pads):
        for i, n in enumerate(ns):
            choir(n, t0, d, 3000 + k * 10 + i, 10, 'u', att=0.9, rel=1.4, g=-16, vib=0.008)
    note('vn_sus', 'A5', 70.4, 5.6, vel=0.2, g=-21, att=2.0, rel=1.5)
    note('vn_sus', 'A4', 70.6, 5.4, vel=0.2, g=-22, att=2.0, rel=1.5)
    # the colossus dissolving: glow from GLOW (68.5), gone at GONE (70.2): a long steam release + the visor tone
    # (bowed vibes / glass D) fading out exactly when it disappears
    hit('sfx', X.steam_burst(GONE - GLOW + 2.0, 801, 0.8), GLOW, -19)
    dg = GONE - GLOW
    note('vib_bow', 'D5', GLOW, dg, vel=0.5, g=-17, att=0.4, rel=0.15, bus='harp', shape=[(0, 1), (dg, 0.25)])
    note('glass', 'A5', GLOW + 0.2, dg - 0.2, vel=0.5, g=-21, att=0.5, rel=0.15, bus='harp', shape=[(0, 1), (dg, 0.2)])
    # distant walkers
    tt, k = C['walkers'] + 0.2, 0
    while tt < 77.0:
        hit('world', X.footstep_far(820 + k, 1.0), tt, -19 - 1.0 * k * 0.3)
        tt += 1.4
        k += 1
    tt = C['walkers'] + 0.95
    while tt < 77.0:
        hit('world', lp(X.footstep_far(860 + k, 0.6), 200), tt, -24)
        tt += 1.55
        k += 1


# =====================================================================================================
# Ambience
# =====================================================================================================
def ambience():
    log('ambience')
    d = 21.2
    n = secs(d)
    life = env_points(n, [(0, 1), (17.6, 1), (19.6, 0.15), (20.3, 0.1), (21.2, 0.1)])
    br = X.birds(18.0, 900)
    br = br * env_points(len(br), [(0, 1), (16.8, 1), (17.9, 0)])[:, None]
    add(B['amb'], br, 0, db(-28))
    # water: louder in the canal-steps shots (s01, s03, s06)
    w = X.water(d, 910)
    near = env_points(n, [(0, 1), (7.4, 1), (7.6, 0.35), (12.9, 0.35), (13.1, 0.9), (15.4, 0.9), (15.6, 0.3), (21.2, 0.3)])
    add(B['amb'], w * (near * life)[:, None], 0, db(-21))
    wd = X.wind(d, 920)
    add(B['amb'], wd * life[:, None], 0, db(-27))
    mm = X.murmur(d, 930)
    add(B['amb'], mm * (life * env_points(n, [(0, 0.6), (3.5, 0.6), (7.5, 1.0), (13, 0.8), (21.2, 0.8)]))[:, None], 0, db(-31))
    # gentle breeze on the petals (s01), laundry flapping softly (s07)
    add(B['amb'], X.flaps(2.5, 940, 5, 0.12), 15.6, db(-16))
    n2 = secs(1.6)
    br2 = sweep_lp(np.stack([pink(n2, 941), pink(n2, 942)], 1), 300 + 1500 * env_points(n2, [(0, 0), (0.6, 1), (1.6, 0)]))
    add(B['amb'], br2 * env_points(n2, [(0, 0), (0.6, 1), (1.6, 0)])[:, None], 0.0, db(-24))
    # distant tower bell, two tolls
    note('bells', 'D3', 3.0, 5.5, vel=0.3, g=-25, rel=2.0, bus='amb')
    note('bells', 'A3', 9.6, 5.5, vel=0.3, g=-28, rel=2.0, bus='amb')
    # after the flash: the world is muffled, then wind and fearful murmur return and die away
    d2 = DUR - 21.0
    n3 = secs(d2)
    wl = env_points(n3, [(0, 0.3), (1.0, 1.0), (3.5, 0.7), (16, 0.6), (37, 0.5), (47, 0.7), (56.5, 0.3)])
    add(B['amb'], X.wind(d2, 950, wl), 21.0, db(-25))
    mm2 = X.murmur(7.0, 960, 20)
    add(B['amb'], mm2 * env_points(len(mm2), [(0, 0), (0.8, 1), (3.0, 0.6), (7.0, 0)])[:, None], 24.5, db(-30))
    # steam bed behind the wall from 24.5, louder as the colossus appears, gone by the end
    n4 = secs(DUR - C['steam'])
    lv = env_points(n4, [(0, 0), (1.2, 0.6), (4, 0.7), (13, 0.75), (21, 0.9), (33, 1.0), (44, 0.9), (50, 0.4), (53, 0.0)])
    add(B['sfx'], X.steam_bed(n4, 970, C['steam'], lv), C['steam'], db(-22))
    add(B['sfx'], lp(X.steam_burst(3.5, 971, 0.6), 1800), C['steam'] + 0.05, db(-15))


# =====================================================================================================
# Mix + master
# =====================================================================================================
# fader rides (dB) per group: the dynamic contour of the film
GROUPS = {'music': ['str', 'brass', 'wind', 'choir', 'harp', 'perc'], 'fx': ['sfx', 'world'], 'sub': ['sub']}
RIDES = {
    'music': [(0, 0), (24.0, 0), (25.0, 7), (34.2, 7), (34.6, 3), (37.6, 3), (37.9, 0), (54.8, 0), (55.3, 4), (57.4, 4), (57.5, 0), (59.9, 0), (60.3, 3), (68.3, 3),
              (68.6, 2), (DUR, 2)],
    'fx': [(0, 0), (21.8, 0), (22.0, -2), (25.0, -2), (25.5, 4), (37.0, 4), (37.5, 0), (59.8, 0), (60.3, -4), (68.3, -4),
           (69.5, -5), (DUR, -5)],
    'sub': [(0, 0), (DUR, 0)],
}


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    k = kweight(x)
    blk, hop = secs(0.4), secs(0.1)
    ms = np.array([np.mean(k[i:i + blk] ** 2, 0).sum() for i in range(0, len(k) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak(x):
    return np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()


def softclip(x, knee):
    """Smooth saturation above the knee (adds weight to booms, lowers their crest factor)."""
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    h = 1.0 - knee
    y[over] = np.sign(x[over]) * (knee + h * np.tanh((a[over] - knee) / h))
    return y


def limiter(x, ceiling_db=-1.3):
    c = db(ceiling_db)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(1)
    pk = up.reshape(-1, 4).max(1)[:len(x)]
    if len(pk) < len(x):
        pk = np.pad(pk, (0, len(x) - len(pk)))
    req = np.minimum(1.0, c / (pk + 1e-12))
    la = secs(0.004)
    g = minimum_filter1d(req, 2 * la + 1)
    # 1 ms control rate: instant attack (lookahead already applied), smooth one-pole release
    h = 48
    m = len(g) // h
    gc = g[:m * h].reshape(m, h).min(1)
    a = math.exp(-1 / (0.15 * 1000))
    out = np.empty(m)
    prev = 1.0
    for i in range(m):
        v = gc[i]
        prev = v if v < prev else prev * a + v * (1 - a)
        out[i] = prev
    gs = np.interp(np.arange(len(x)), np.arange(m) * h + h / 2, out)
    gs = np.minimum(gs, g)
    gs = uniform_filter1d(minimum_filter1d(gs, la + 1), la)  # smooth corners, never above the requirement
    return x * gs[:, None], 20 * np.log10(gs.min())


def master():
    log('reverbs')
    hall = make_ir(3.6, 3.0, 1.8, 77, predelay=0.025)
    big = make_ir(6.0, 5.0, 2.5, 78, predelay=0.04)
    outdoor = make_ir(1.4, 0.9, 0.5, 79, predelay=0.012, width=0.8)
    mix = np.zeros((N, 2))
    sends = {  # bus: (dry dB, hall send, big send, outdoor send)
        'str': (0, 0.32, 0.10, 0), 'brass': (0, 0.30, 0.12, 0), 'wind': (0, 0.40, 0.05, 0),
        'choir': (0, 0.30, 0.38, 0), 'harp': (0, 0.42, 0.10, 0), 'perc': (0, 0.22, 0.14, 0),
        'sub': (0, 0.0, 0.10, 0), 'sfx': (0, 0.05, 0.30, 0), 'world': (0, 0.0, 0.18, 0.15),
        'amb': (0, 0.0, 0.0, 0.25), 'tinn': (0, 0, 0, 0), 'hush': (0, 0, 0.0, 0.2)}
    # muffled world after the flash (low-pass that slowly reopens) on everything diegetic
    f = env_points(N, [(0, 20000), (21.02, 20000), (21.1, 350), (22.0, 500), (23.5, 1500), (24.6, 9000), (25.5, 20000), (DUR, 20000)])
    for k in ('amb', 'world', 'sfx'):
        seg = slice(secs(20.9), secs(26.0))
        B[k][seg] = sweep_lp(B[k][seg], f[seg])
    for k, pts in RIDES.items():
        for bk in GROUPS[k]:
            B[bk] *= db(env_points(N, pts))[:, None]
    wet_h = np.zeros((N, 2))
    wet_b = np.zeros((N, 2))
    wet_o = np.zeros((N, 2))
    for k, (d, sh, sb, so) in sends.items():
        x = B[k]
        mix += x * db(d)
        wet_h += x * sh
        wet_b += x * sb
        wet_o += x * so
    mix += convolve(wet_h, hall) * 0.55
    mix += convolve(wet_b, big) * 0.55
    mix += convolve(wet_o, outdoor) * 0.5
    mix = hp(mix, 22, 2)
    # mono below ~110 Hz (decorrelated rumbles otherwise smear the low end)
    mid_, side = (mix[:, 0] + mix[:, 1]) / 2, (mix[:, 0] - mix[:, 1]) / 2
    side = hp(side, 110, 4)
    mix = np.stack([mid_ + side, mid_ - side], 1)
    # the held breath: hard cut of everything (incl. reverb tails) 57.5 -> 59.0, then the hush layer alone
    gate = env_points(N, [(0, 1), (C['silence'] - 0.03, 1), (C['silence'] + 0.04, 0.0), (C['kick'] - 0.002, 0.0),
                          (C['kick'], 1), (DUR, 1)])
    hush = B['hush'] + convolve(B['hush'] * 0.2, outdoor) * 0.5
    mix = mix * gate[:, None] + hush * (1 - gate)[:, None]
    # end: fade to silence by 77.5
    mix *= env_points(N, [(0, 1), (75.6, 1), (77.35, 0), (DUR, 0)])[:, None]
    # gentle fade in of the first frame
    mix *= env_points(N, [(0, 0), (0.08, 1), (DUR, 1)])[:, None]
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.save(os.path.join(HERE, 'cache', 'premaster.npy'), mix.astype(np.float32))
    return mix


def finalize(mix, target=-17.0):
    log('loudness')
    y = mix.copy()
    for it in range(4):
        L = lufs(y)
        y = y * db(target - L)
        # saturate only the low band (<150 Hz: booms gain weight and audible harmonics); mids/highs stay clean
        low = lp(lp(y, 150, 2), 150, 2)
        y = (y - low) + softclip(low, db(-7.0))
        y = softclip(y, db(-2.5))  # gentle full-band rounding of what is left above -2.5 dBFS
        y, gr = limiter(y, -1.6)
        L2 = lufs(y)
        log(f'  iter {it}: {L:.2f} -> {L2:.2f} LUFS, max GR {gr:.1f} dB')
        if abs(L2 - target) < 0.15:
            break
    # 16-bit with TPDF dither
    r = rng(4242)
    d = (r.random(y.shape) - r.random(y.shape)) / 32768
    y16 = np.clip(np.round((y + d) * 32767), -32768, 32767).astype(np.int16)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, y16[:N], SR, subtype='PCM_16')
    log('wrote', OUT, f'{len(y16) / SR:.3f} s', f'LUFS {lufs(y):.2f}', f'TP {20 * np.log10(true_peak(y)):.2f} dBTP')


if __name__ == '__main__':
    only = sys.argv[1:]
    section_peace()
    section_omen()
    section_dread()
    section_hand_rise()
    section_head()
    section_terror()
    section_chaos()
    section_lament()
    ambience()
    # bus trims (dB) -- the mix balance
    TRIM = {'str': 0, 'brass': 0, 'wind': 0, 'choir': 0, 'harp': 0, 'perc': 0, 'sub': 0, 'sfx': 0, 'world': 0,
            'amb': 0, 'tinn': 0, 'hush': 0}
    for k, v in TRIM.items():
        B[k] *= db(v)
    with open(os.path.join(HERE, 'notes.json'), 'w') as f:
        json.dump(NOTES, f)
    with open(os.path.join(HERE, 'events.json'), 'w') as f:
        json.dump(EVENTS, f)
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.savez_compressed(os.path.join(HERE, 'cache', 'buses.npz'), **{k: v.astype(np.float32) for k, v in B.items()})
    mix = master()
    finalize(mix)
    log('done')
