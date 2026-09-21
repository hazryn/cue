"""
Mały syntezator do dźwięków Drużynady.

Wszystko liczymy na numpy i zapisujemy jako WAV — plików jest 38, więc ręczne
nagrywanie odpadało, a generator pozwala poprawić pojedynczy dźwięk bez ruszania
reszty. Stylistyka: teleturniej z lat 80., czyli proste fale, wyraźny atak
i sporo pogłosu.
"""
from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np

SR = 44100

# Równomiernie temperowany strój — nuty podajemy nazwami, nie hercami
_NOTE_BASE = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4,
              'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}


def note(name: str) -> float:
    """'A4' -> 440.0"""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * (2 ** ((_NOTE_BASE[pitch] + (octave - 4) * 12) / 12))


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(SR * dur))


def t(dur: float) -> np.ndarray:
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


# ----------------------------------------------------------------- oscylatory

def sine(freq: float, dur: float, phase: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * freq * t(dur) + phase)


def square(freq: float, dur: float, duty: float = 0.5) -> np.ndarray:
    frac = (freq * t(dur)) % 1.0
    return np.where(frac < duty, 1.0, -1.0)


def saw(freq: float, dur: float) -> np.ndarray:
    return 2.0 * ((freq * t(dur)) % 1.0) - 1.0


def triangle(freq: float, dur: float) -> np.ndarray:
    return 2.0 * np.abs(2.0 * ((freq * t(dur)) % 1.0) - 1.0) - 1.0


def noise(dur: float, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1, 1, int(SR * dur))


def sweep(f0: float, f1: float, dur: float, wave_fn=np.sin, log: bool = True) -> np.ndarray:
    """Przemiatanie częstotliwości — logarytmiczne brzmi naturalniej dla ucha."""
    time = t(dur)
    if log and f0 > 0 and f1 > 0:
        freqs = f0 * (f1 / f0) ** (time / max(dur, 1e-6))
    else:
        freqs = np.linspace(f0, f1, len(time))
    phase = 2 * np.pi * np.cumsum(freqs) / SR
    return wave_fn(phase)


# ------------------------------------------------------------------ obwiednie

def adsr(dur: float, attack=0.01, decay=0.1, sustain=0.7, release=0.2) -> np.ndarray:
    n = int(SR * dur)
    a, d, r = int(SR * attack), int(SR * decay), int(SR * release)
    s = max(n - a - d - r, 0)
    env = np.concatenate([
        np.linspace(0, 1, a, endpoint=False) if a else np.array([]),
        np.linspace(1, sustain, d, endpoint=False) if d else np.array([]),
        np.full(s, sustain),
        np.linspace(sustain, 0, r) if r else np.array([]),
    ])
    return np.pad(env, (0, max(n - len(env), 0)))[:n]


def perc(dur: float, sharpness: float = 5.0) -> np.ndarray:
    """Obwiednia perkusyjna: natychmiastowy atak, wykładniczy zanik."""
    time = t(dur)
    env = np.exp(-sharpness * time / max(dur, 1e-6))
    attack = int(SR * 0.002)
    if attack:
        env[:attack] *= np.linspace(0, 1, attack)
    return env


# -------------------------------------------------------------------- efekty

def reverb(x: np.ndarray, amount: float = 0.3, decay: float = 0.4) -> np.ndarray:
    """Tani pogłos na kilku opóźnieniach — wystarczy, żeby dźwięk nie był suchy."""
    out = x.copy()
    for delay_ms, gain in ((37, 0.7), (61, 0.5), (89, 0.36), (127, 0.25)):
        d = int(SR * delay_ms / 1000)
        tail = np.pad(x, (d, 0))[: len(x)] * gain * amount
        out += tail * decay
    return out


def echo(x: np.ndarray, delay: float, repeats: int = 3, gain: float = 0.45) -> np.ndarray:
    out = x.copy()
    d = int(SR * delay)
    for i in range(1, repeats + 1):
        out += np.pad(x, (d * i, 0))[: len(x)] * (gain ** i)
    return out


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Jednobiegunowy filtr — zdejmuje ostrość z fal prostokątnych."""
    alpha = math.exp(-2 * math.pi * cutoff / SR)
    out = np.zeros_like(x)
    prev = 0.0
    for i, sample in enumerate(x):
        prev = (1 - alpha) * sample + alpha * prev
        out[i] = prev
    return out


def vibrato(x: np.ndarray, rate: float = 5.0, depth: float = 0.25) -> np.ndarray:
    return x * (1 - depth + depth * np.sin(2 * np.pi * rate * t(len(x) / SR)))


# ------------------------------------------------------------------- składanie

def mix(*parts: np.ndarray) -> np.ndarray:
    length = max(len(p) for p in parts)
    out = np.zeros(length)
    for part in parts:
        out[: len(part)] += part
    return out


def seq(*parts: np.ndarray) -> np.ndarray:
    return np.concatenate(parts)


def at(x: np.ndarray, start: float, length: float | None = None) -> np.ndarray:
    """Umieszcza dźwięk na osi czasu — do budowania fanfar i pętli."""
    pad = int(SR * start)
    out = np.pad(x, (pad, 0))
    if length is not None:
        target = int(SR * length)
        out = np.pad(out, (0, max(0, target - len(out))))[:target]
    return out


def chord(freqs, dur: float, wave_fn=sine, env=None, detune: float = 0.0) -> np.ndarray:
    env = adsr(dur, 0.01, 0.15, 0.6, 0.3) if env is None else env
    out = np.zeros(int(SR * dur))
    for i, f in enumerate(freqs):
        out += wave_fn(f * (1 + detune * (i % 2 * 2 - 1)), dur)
    return out / max(len(freqs), 1) * env


def normalize(x: np.ndarray, peak: float = 0.89) -> np.ndarray:
    top = np.max(np.abs(x))
    return x * (peak / top) if top > 0 else x


def fade(x: np.ndarray, fade_in: float = 0.005, fade_out: float = 0.02) -> np.ndarray:
    out = x.copy()
    a, b = int(SR * fade_in), int(SR * fade_out)
    if a:
        out[:a] *= np.linspace(0, 1, a)
    if b:
        out[-b:] *= np.linspace(1, 0, b)
    return out


def loopable(x: np.ndarray, crossfade: float = 0.25) -> np.ndarray:
    """Zapętlenie bez kliknięcia: koniec przenika się z początkiem."""
    n = int(SR * crossfade)
    if n * 2 >= len(x):
        return fade(x)
    head, tail = x[:n], x[-n:]
    blended = tail * np.linspace(1, 0, n) + head * np.linspace(0, 1, n)
    return np.concatenate([blended, x[n:-n]])


def save_wav(path: Path, x: np.ndarray, peak: float = 0.89) -> None:
    data = (normalize(np.clip(x, -1.5, 1.5), peak) * 32767).astype(np.int16)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())
