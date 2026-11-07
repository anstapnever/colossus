"""Analyse out/soundtrack.wav: RMS envelope, loudest moments, silence check, key/mode per section, plot.
Usage: python -I audio/tools/analyse.py [wav]   -> prints a report, writes out/sound_env.png and audio/analysis.json
"""
import os, sys, json, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(os.path.dirname(HERE))
wav = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROJ, 'out', 'soundtrack.wav')
x, sr = sf.read(wav, always_2d=True)
mono = x.mean(1)
dur = len(x) / sr
CUES = dict(bolt=20.3, flash=21.0, shock=22.0, steam=24.5, handImpact=38.333, rise=40.5, shadow=42.5, crown=45.3,
            visor=47.2, headUp=49.5, legLift=55.0, silence=57.5, kick=59.0, houseHit=61.6, run=66.5,
            breach=68.5, gone=70.2, walkers=71.0)
try:  # live values dumped from the film (audio/tools/dump_cues.mjs)
    _L = json.load(open(os.path.join(PROJ, 'out', 'cues_live.json'), encoding='utf-8'))
    for _k, _v in _L.get('cues', {}).items():
        if _k in CUES:
            CUES[_k] = _v
    if _L.get('colossus', {}).get('visorIgnite'):
        CUES['visor'] = _L['colossus']['visorIgnite']
    IMPACT_T = [m['t'] for m in _L['impacts'] if not m.get('houseHit')]
except Exception:
    IMPACT_T = []


def rms_db(seg):
    return 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-10)


def win_rms(w, hop):
    n, h = int(w * sr), int(hop * sr)
    t = np.arange(0, len(x) - n + 1, h)
    return t / sr, np.array([rms_db(x[i:i + n]) for i in t])


rep = {'file': wav, 'duration': dur}
ts, r1 = win_rms(1.0, 1.0)
rep['rms_per_second'] = [round(float(v), 1) for v in r1]
tq, rq = win_rms(0.4, 0.05)
# momentary loudness (EBU R128, 400 ms K-weighted) every 50 ms, and its maximum per second
_b1, _a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
_b2, _a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
kx = signal.lfilter(_b2, _a2, signal.lfilter(_b1, _a1, x, axis=0), axis=0)
_n, _h = int(0.4 * sr), int(0.05 * sr)
tm = np.arange(0, len(x) - _n + 1, _h) / sr
mom = np.array([-0.691 + 10 * np.log10(np.mean(kx[i:i + _n] ** 2, 0).sum() + 1e-12) for i in range(0, len(x) - _n + 1, _h)])
rep['momentary_lufs_max_per_second'] = [round(float(mom[(tm >= i) & (tm + 0.4 <= i + 1)].max()), 1) for i in range(int(dur))]
order_m = np.argsort(-mom)
pk_m = []
for i in order_m:
    if all(abs(tm[i] - p) > 2.0 for p, _ in pk_m):
        pk_m.append((float(tm[i] + 0.2), float(mom[i])))
    if len(pk_m) >= 8:
        break
rep['loudest_momentary_lufs'] = [(round(a, 2), round(b, 1)) for a, b in pk_m]
# loudest moments (0.4 s windows, local maxima at least 2 s apart)
order = np.argsort(-rq)
peaks = []
for i in order:
    if all(abs(tq[i] - p) > 2.0 for p, _ in peaks):
        peaks.append((float(tq[i] + 0.2), float(rq[i])))
    if len(peaks) >= 8:
        break
rep['loudest_0.4s'] = [(round(a, 2), round(b, 1)) for a, b in peaks]
s0, s1 = int(57.55 * sr), int(58.95 * sr)
rep['silence_57.5_59_rms_db'] = round(rms_db(x[s0:s1]), 1)
rep['silence_57.5_59_peak_db'] = round(20 * np.log10(np.abs(x[s0:s1]).max() + 1e-10), 1)

# ---- key / mode per section: chroma vs Krumhansl-Kessler profiles
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def chroma(a, b):
    seg = mono[int(a * sr):int(b * sr)]
    f, t, Z = signal.stft(seg, sr, nperseg=16384, noverlap=8192)
    P = np.abs(Z) ** 2
    m = (f > 105) & (f < 2000)
    pc = np.round(12 * np.log2(f[m] / 440) + 9) % 12
    E = P[m].sum(1)
    E = E / (f[m] ** 0.0)
    ch = np.array([E[pc == k].sum() for k in range(12)])
    return ch / (ch.sum() + 1e-12)


def keycorr(ch):
    res = []
    for k in range(12):
        res.append((np.corrcoef(ch, np.roll(MAJ, k))[0, 1], NAMES[k] + ' major'))
        res.append((np.corrcoef(ch, np.roll(MIN, k))[0, 1], NAMES[k] + ' minor'))
    res.sort(reverse=True)
    best_major = max(r for r in res if 'major' in r[1])
    return res[0], best_major


SECTIONS = [('peace', 0, 18), ('omen', 18, 20.3), ('dread', 24.5, 38), ('rise', 38, 45), ('head', 45, 49.5),
            ('terror', 49.5, 57.5), ('chaos', 59, 68.5), ('lament', 68.5, 77.5)]
# ---- same on the music stems only, with a harmonic-salience chroma (sub-harmonic summation + removal of
#      partials explained by a stronger lower pitch), so overtones (e.g. Eb -> Bb) do not pose as notes


def salience_chroma(seg):
    f, t, Z = signal.stft(seg, sr, nperseg=32768, noverlap=24576)
    P = (np.abs(Z) ** 2).sum(1)
    mids = np.arange(24, 108)
    fm = 69 + 12 * np.log2(np.maximum(f, 1) / 440)
    A = np.sqrt(np.array([P[(fm >= m - 0.5) & (fm < m + 0.5)].sum() for m in mids]))
    S = np.zeros(len(mids))
    for i in range(len(mids)):
        for h in range(1, 9):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S[i] += 0.84 ** (h - 1) * A[j]
    S2 = S.copy()
    for i in np.argsort(-S):
        for h in (2, 3, 4, 5, 6):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S2[j] = max(0, S2[j] - 0.9 * S[i] * 0.84 ** (h - 1))
    ch = np.zeros(12)
    for i, m in enumerate(mids):
        ch[m % 12] += S2[i] ** 2
    return ch / (ch.sum() + 1e-12)


stem = os.path.join(PROJ, 'audio', 'cache', 'buses.npz')
if os.path.exists(stem):
    d = np.load(stem)
    mus = sum(d[k].astype(np.float64) for k in ('str', 'brass', 'wind', 'choir', 'harp') if k in d.files).mean(1)
    rep['key_music_stems'] = {}
    for name, a, b in SECTIONS:
        if name == 'omen':
            b = 20.25
        ch = salience_chroma(mus[int(a * sr):int(b * sr)])
        best, bmaj = keycorr(ch)
        rep['key_music_stems'][name] = {'best': best[1], 'r': round(best[0], 2), 'best_major': bmaj[1],
                                        'r_major': round(bmaj[0], 2), 'top': [NAMES[i] for i in np.argsort(-ch)[:5]]}

# ---- symbolic harmony check from the score itself (audio/notes.json written by render.py)
nj = os.path.join(PROJ, 'audio', 'notes.json')
if os.path.exists(nj):
    notes = json.load(open(nj))
    rep['key_score'] = {}
    for name, a, b in SECTIONS:
        ch = np.zeros(12)
        for nt in notes:
            ov = min(b, nt['t'] + nt['dur']) - max(a, nt['t'])
            if ov > 0:
                ch[nt['midi'] % 12] += ov * (10 ** (nt['g'] / 20)) * (0.35 + 0.65 * nt['vel'])
        best, bmaj = keycorr(ch / ch.sum())
        rep['key_score'][name] = {'best': best[1], 'r': round(best[0], 2), 'best_major': bmaj[1],
                                  'r_major': round(bmaj[0], 2), 'top': [NAMES[i] for i in np.argsort(-ch)[:5]]}
    # every moment after 18 s where a major triad (root + M3 + P5) sounds, with its weight share
    maj = []
    for tt in np.arange(18.0, dur, 0.1):
        w = np.zeros(12)
        for nt in notes:
            if nt['t'] <= tt < nt['t'] + nt['dur']:
                w[nt['midi'] % 12] += 10 ** (nt['g'] / 20) * (0.35 + 0.65 * nt['vel'])
        if w.sum() == 0:
            continue
        on = w > 0.12 * w.max()
        for r0 in range(12):
            if on[r0] and on[(r0 + 4) % 12] and on[(r0 + 7) % 12]:
                maj.append((round(float(tt), 1), NAMES[r0]))
    spans = []
    for tt, r0 in maj:
        if spans and spans[-1][2] == r0 and tt - spans[-1][1] < 0.15:
            spans[-1][1] = tt
        else:
            spans.append([tt, tt, r0])
    rep['major_triads_after_18s'] = [(a, round(b + 0.1, 1), r0 + ' major') for a, b, r0 in spans]

# ---- click / discontinuity scan: isolated HF spikes far above the local level
hpx = signal.sosfilt(signal.butter(4, 4000, 'highpass', fs=sr, output='sos'), mono)
env = np.sqrt(signal.lfilter([1 / 480], [1, -1 + 1 / 480], hpx ** 2))
spk = np.abs(hpx) > 10 * (np.concatenate([np.full(240, env[0]), env[:-240]]) + 10 ** (-60 / 20))
clicks = np.unique(np.round(np.where(spk)[0] / sr, 2))
rep['click_candidates'] = [float(c) for c in clicks[:40]]
rep['click_count'] = int(len(clicks))

# ---- spectral centroid per second
cent = []
for i in range(int(dur)):
    seg = mono[i * sr:(i + 1) * sr]
    sp = np.abs(np.fft.rfft(seg))
    fr = np.fft.rfftfreq(len(seg), 1 / sr)
    cent.append(round(float((sp * fr).sum() / (sp.sum() + 1e-9))))
rep['centroid_per_second'] = cent

print(json.dumps({k: v for k, v in rep.items() if k not in ('rms_per_second', 'centroid_per_second')}, indent=1))
print('RMS per second (dBFS):')
for i, v in enumerate(r1):
    print(f'{i:3d}-{i + 1:<3d} {v:6.1f}  {"#" * max(0, int((v + 60) / 1.5))}')
with open(os.path.join(PROJ, 'audio', 'analysis.json'), 'w') as f:
    json.dump(rep, f, indent=1)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(16, 5.5), dpi=110)
    ax.plot(tq + 0.2, rq, color='#2a6f97', lw=0.8, label='RMS 0.4 s window (dBFS)')
    ax.plot(tm + 0.2, mom, color='#3a9d23', lw=0.8, alpha=0.8, label='momentary loudness (LUFS, 400 ms)')
    ax.step(ts, r1, where='post', color='#d1495b', lw=1.6, label='RMS per second')
    for k, v in CUES.items():
        ax.axvline(v, color='#888', lw=0.7, ls='--')
        ax.text(v, -2, k, rotation=90, fontsize=7, va='top', ha='right', color='#444')
    for i, v in enumerate(IMPACT_T):
        ax.plot([v, v], [-78, -74], color='#7a4e2d', lw=1.2, label='boulder impact (live FX)' if i == 0 else None)
    ax.axhspan(-80, -40, xmin=57.5 / dur, xmax=59 / dur, color='#f4d35e', alpha=0.4)
    ax.axhline(-40, color='#f4a259', lw=0.6)
    ax.set_xlim(0, dur)
    ax.set_ylim(-80, 0)
    ax.set_xlabel('film time (s)')
    ax.set_ylabel('dBFS / LUFS')
    ax.set_title('COLOSSUS soundtrack — RMS envelope with story cues')
    ax.legend(loc='lower left', fontsize=8)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(os.path.join(PROJ, 'out', 'sound_env.png'))
    print('plot -> out/sound_env.png')
except ImportError:
    print('matplotlib missing: no plot')
