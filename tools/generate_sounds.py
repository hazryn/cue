#!/usr/bin/env python3
"""
Generuje komplet dźwięków Drużynady do frontend/public/audio/.

    python3 tools/generate_sounds.py            # wszystkie
    python3 tools/generate_sounds.py hit strike_3   # wybrane

Wymaga numpy i ffmpeg (konwersja WAV -> mp3). Regeneracja pojedynczego dźwięku
nie rusza pozostałych, więc można podkręcać je po kolei aż zabrzmią dobrze.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from sound_lib import (SR, adsr, at, chord, echo, fade, lowpass, loopable, mix,
                       noise, note, normalize, perc, reverb, save_wav, seq,
                       sine, silence, square, saw, sweep, triangle, vibrato)

OUT = Path(__file__).resolve().parent.parent / 'frontend' / 'public' / 'audio'

# Akord durowy w trzech przewrotach — podstawa wszystkich fanfar
MAJOR = (0, 4, 7, 12)


def harmonics(freq: float, dur: float, weights=(1.0, 0.5, 0.25, 0.12)) -> np.ndarray:
    out = np.zeros(int(SR * dur))
    for i, w in enumerate(weights, start=1):
        out += sine(freq * i, dur) * w
    return out / sum(weights)


def bell(freq: float, dur: float, sharp: float = 4.0) -> np.ndarray:
    """Dzwonek: nieparzyste harmoniczne z lekkim rozstrojeniem."""
    body = (sine(freq, dur) + 0.6 * sine(freq * 2.01, dur)
            + 0.35 * sine(freq * 3.02, dur) + 0.2 * sine(freq * 4.97, dur))
    return body / 2.15 * perc(dur, sharp)


def buzzer(freq: float, dur: float, wobble: float = 18.0) -> np.ndarray:
    """Brzęczyk: prostokąt z wibracją, przepuszczony przez filtr, żeby nie kłuł."""
    base = square(freq, dur, duty=0.42) * 0.6 + saw(freq * 1.005, dur) * 0.4
    modulated = base * (0.75 + 0.25 * np.sin(2 * np.pi * wobble * np.linspace(0, dur, len(base))))
    return lowpass(modulated, 2200) * adsr(dur, 0.005, 0.05, 0.85, 0.08)


def fanfare(root: str, dur: float, brass: bool = True) -> np.ndarray:
    """Wznoszące arpeggio zwieńczone akordem — chleb powszedni teleturnieju."""
    f0 = note(root)
    step = dur / 6
    wave_fn = (lambda f, d: (saw(f, d) * 0.5 + square(f, d, 0.45) * 0.3 + sine(f, d) * 0.2)) if brass else sine
    parts = []
    for i, semi in enumerate(MAJOR):
        freq = f0 * 2 ** (semi / 12)
        tone = wave_fn(freq, step * 1.4) * adsr(step * 1.4, 0.012, 0.08, 0.7, 0.2)
        parts.append(at(lowpass(tone, 3600), i * step))
    final = chord([f0 * 2 ** (s / 12) for s in (0, 4, 7, 12, 16)], dur - 3 * step,
                  wave_fn=lambda f, d: saw(f, d) * 0.45 + sine(f, d) * 0.55,
                  env=adsr(dur - 3 * step, 0.02, 0.25, 0.55, 0.5))
    parts.append(at(lowpass(final, 3800), 4 * step))
    return reverb(mix(*parts), 0.35)


def sparkle(dur: float, seed: int = 1, count: int = 14) -> np.ndarray:
    """Iskierki — dosypywane do fanfar i odsłonięć."""
    rng = np.random.default_rng(seed)
    out = np.zeros(int(SR * dur))
    for _ in range(count):
        start = rng.uniform(0, dur * 0.75)
        freq = rng.uniform(1800, 5200)
        grain = sine(freq, 0.09) * perc(0.09, 14)
        out = mix(out, at(grain * 0.35, start, dur))
    return out


def ticker(dur: float, clicks: int = 18) -> np.ndarray:
    """Licznik punktów: przyspieszające kliki o rosnącej wysokości."""
    out = np.zeros(int(SR * dur))
    for i in range(clicks):
        pos = dur * (i / clicks) ** 1.35
        freq = 900 + 60 * i
        click = (sine(freq, 0.035) + noise(0.035, seed=i) * 0.25) * perc(0.035, 30)
        out = mix(out, at(click * 0.5, pos, dur))
    return out


# =============================================================== definicje

def s_theme_intro() -> np.ndarray:
    """Pętla do lobby: bas, akordy i prosta melodia, ~16 s, gotowa do zapętlenia."""
    bpm, bars = 112, 8
    beat = 60 / bpm
    dur = beat * 4 * bars
    progression = ['C3', 'A2', 'F2', 'G2']

    bass = np.zeros(int(SR * dur))
    pads = np.zeros(int(SR * dur))
    for bar in range(bars):
        root = progression[bar % len(progression)]
        start = bar * 4 * beat
        for b in range(4):
            pluck = (square(note(root) / 2, beat * 0.5, 0.3) * 0.6
                     + sine(note(root) / 2, beat * 0.5) * 0.4)
            bass = mix(bass, at(lowpass(pluck, 900) * perc(beat * 0.5, 6) * 0.55,
                                start + b * beat, dur))
        pad = chord([note(root) * 2 ** (s / 12) for s in (0, 4, 7)], beat * 3.6,
                    wave_fn=lambda f, d: triangle(f, d) * 0.6 + sine(f, d) * 0.4,
                    env=adsr(beat * 3.6, 0.35, 0.4, 0.5, 0.9))
        pads = mix(pads, at(pad * 0.3, start, dur))

    melody_notes = ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5']
    melody = np.zeros(int(SR * dur))
    for bar in range(bars):
        name = melody_notes[bar % len(melody_notes)]
        start = bar * 4 * beat + beat * 0.5
        lead = (saw(note(name), beat * 1.2) * 0.35 + sine(note(name), beat * 1.2) * 0.65)
        melody = mix(melody, at(lowpass(lead, 3000) * adsr(beat * 1.2, 0.02, 0.2, 0.5, 0.4) * 0.3,
                                start, dur))

    hats = np.zeros(int(SR * dur))
    for i in range(int(dur / (beat / 2))):
        hats = mix(hats, at(noise(0.03, seed=i) * perc(0.03, 40) * 0.08, i * beat / 2, dur))

    return loopable(reverb(mix(bass, pads, melody, hats), 0.25), crossfade=0.4)


def s_game_start() -> np.ndarray:
    intro = sweep(200, 1200, 0.5, log=True) * adsr(0.5, 0.05, 0.1, 0.6, 0.3) * 0.4
    return mix(at(intro, 0), at(fanfare('C4', 2.6), 0.35), at(sparkle(3.0, seed=3), 0.4))


def s_question_reveal() -> np.ndarray:
    whoosh = lowpass(noise(0.45, seed=7), 1800) * adsr(0.45, 0.18, 0.1, 0.5, 0.15) * 0.35
    tone = chord([note('C5'), note('E5'), note('G5')], 0.7, env=adsr(0.7, 0.02, 0.2, 0.4, 0.45))
    return reverb(mix(whoosh, at(tone * 0.6, 0.12)), 0.3)


def s_transition() -> np.ndarray:
    up = sweep(400, 2400, 0.35, wave_fn=lambda p: np.sin(p) * 0.6 + np.sign(np.sin(p)) * 0.4)
    return fade(reverb(up * adsr(0.35, 0.02, 0.1, 0.5, 0.2) * 0.45, 0.25))


def s_race_open() -> np.ndarray:
    beep1 = sine(note('A4'), 0.11) * perc(0.11, 9)
    beep2 = sine(note('E5'), 0.16) * perc(0.16, 7)
    return fade(reverb(seq(beep1, silence(0.03), beep2) * 0.9, 0.18))


def s_countdown_tick() -> np.ndarray:
    # Pojedynczy, niższy sygnał na każdą cyfrę — race_open po nim brzmi jak „start"
    body = sine(note('A4'), 0.18) * perc(0.18, 11) * 0.8 + sine(note('A5'), 0.18) * perc(0.18, 16) * 0.2
    return fade(reverb(body, 0.12))


def s_buzz() -> np.ndarray:
    click = (square(320, 0.09, 0.35) * 0.5 + noise(0.09, seed=2) * 0.5) * perc(0.09, 26)
    return fade(lowpass(click, 3000))


def s_buzz_win() -> np.ndarray:
    hit = buzzer(180, 0.16, wobble=30) * 0.7
    rise = sweep(300, 900, 0.5) * adsr(0.5, 0.01, 0.1, 0.7, 0.3) * 0.4
    stab = chord([note('C5'), note('G5'), note('C6')], 0.7, env=adsr(0.7, 0.01, 0.15, 0.5, 0.5))
    return reverb(mix(hit, at(rise, 0.1), at(stab * 0.55, 0.22), at(sparkle(1.0, seed=5), 0.25)), 0.3)


def s_tiebreak() -> np.ndarray:
    parts = [at(sine(note(n), 0.13) * perc(0.13, 10) * 0.8, i * 0.15)
             for i, n in enumerate(('E5', 'G5', 'C6'))]
    return fade(reverb(mix(*parts), 0.3))


def s_hit() -> np.ndarray:
    return fade(reverb(mix(bell(note('C6'), 1.1), bell(note('G6'), 1.1) * 0.5), 0.4))


def s_hit_top() -> np.ndarray:
    base = mix(bell(note('C6'), 1.6), bell(note('E6'), 1.6) * 0.6, bell(note('G6'), 1.6) * 0.45)
    return fade(reverb(mix(base, sparkle(1.6, seed=11, count=18) * 0.7), 0.45))


def _strike(freq: float, dur: float, wobble: float) -> np.ndarray:
    return fade(reverb(buzzer(freq, dur, wobble) * 0.85, 0.25))


def s_strike_1() -> np.ndarray:
    return _strike(196, 0.55, 16)


def s_strike_2() -> np.ndarray:
    return _strike(165, 0.7, 18)


def s_strike_3() -> np.ndarray:
    body = buzzer(131, 1.5, 20) * 0.9
    drop = sweep(131, 62, 1.5, wave_fn=lambda p: np.sign(np.sin(p))) * adsr(1.5, 0.01, 0.4, 0.5, 0.6) * 0.35
    return fade(reverb(mix(body, lowpass(drop, 900)), 0.4))


def s_already_revealed() -> np.ndarray:
    return fade(lowpass(buzzer(240, 0.22, 26) * 0.6, 1600))


def s_board_clear() -> np.ndarray:
    return mix(fanfare('G4', 3.2), at(sparkle(3.4, seed=17, count=26), 0.1),
               at(ticker(1.2, 22) * 0.6, 0.2))


def s_steal_open() -> np.ndarray:
    tension = vibrato(saw(note('A3'), 1.2) * 0.35 + sine(note('A4'), 1.2) * 0.3, rate=7, depth=0.4)
    rise = sweep(220, 660, 1.2) * adsr(1.2, 0.3, 0.2, 0.6, 0.3) * 0.25
    return fade(reverb(mix(lowpass(tension, 2200) * adsr(1.2, 0.2, 0.2, 0.7, 0.35), rise), 0.35))


def s_steal_win() -> np.ndarray:
    return mix(fanfare('D4', 2.2), at(sparkle(2.4, seed=23), 0.15))


def s_steal_fail() -> np.ndarray:
    drop = sweep(440, 150, 1.0, wave_fn=lambda p: np.sin(p) * 0.6 + np.sign(np.sin(p)) * 0.4)
    return fade(reverb(lowpass(drop, 1800) * adsr(1.0, 0.01, 0.25, 0.5, 0.5) * 0.55, 0.3))


def s_pool_award() -> np.ndarray:
    return fade(reverb(mix(ticker(1.5, 26), at(bell(note('C6'), 0.9) * 0.7, 1.4)), 0.3))


def s_pool_lost() -> np.ndarray:
    sad = chord([note('D4'), note('F4'), note('G#4')], 1.8,
                wave_fn=lambda f, d: saw(f, d) * 0.5 + triangle(f, d) * 0.5,
                env=adsr(1.8, 0.05, 0.5, 0.35, 0.9))
    fall = sweep(300, 110, 1.8) * adsr(1.8, 0.02, 0.4, 0.4, 0.8) * 0.3
    return fade(reverb(mix(lowpass(sad, 1800) * 0.7, lowpass(fall, 1200)), 0.45))


def s_reveal_single() -> np.ndarray:
    pop = (sine(660, 0.16) * 0.6 + triangle(1320, 0.16) * 0.4) * perc(0.16, 12)
    return fade(reverb(pop, 0.3))


def s_timeout() -> np.ndarray:
    gong = mix(bell(note('E3'), 1.6, sharp=2.2), bell(note('B3'), 1.6, sharp=2.4) * 0.5)
    return fade(reverb(gong * 0.8, 0.5))


def s_scores() -> np.ndarray:
    return fade(reverb(chord([note('C5'), note('E5'), note('G5')], 1.0,
                             env=adsr(1.0, 0.02, 0.25, 0.4, 0.6)) * 0.75, 0.35))


def s_leaderboard() -> np.ndarray:
    return mix(fanfare('F4', 3.4), at(sparkle(3.6, seed=31, count=22), 0.2))


def s_winner() -> np.ndarray:
    main = fanfare('C4', 4.0)
    high = at(fanfare('C5', 2.4, brass=False) * 0.45, 1.2)
    return mix(main, high, at(sparkle(4.2, seed=37, count=34), 0.3), at(ticker(2.0, 30) * 0.4, 0.6))


def s_final_intro() -> np.ndarray:
    swell = sweep(80, 320, 2.2) * adsr(2.2, 1.4, 0.3, 0.7, 0.4) * 0.4
    stab = chord([note('C4'), note('G4'), note('C5'), note('E5')], 2.0,
                 wave_fn=lambda f, d: saw(f, d) * 0.45 + sine(f, d) * 0.55,
                 env=adsr(2.0, 0.03, 0.4, 0.5, 0.9))
    return fade(reverb(mix(lowpass(swell, 1400), at(lowpass(stab, 3200) * 0.7, 1.6)), 0.45))


def s_final_timer_start() -> np.ndarray:
    return fade(sine(note('A5'), 0.18) * perc(0.18, 8) * 0.85)


def s_final_tick() -> np.ndarray:
    """Pętla 1 s: dwa tyknięcia, jak zegar w studiu."""
    click = (sine(1200, 0.045) * 0.5 + noise(0.045, seed=41) * 0.5) * perc(0.045, 34)
    tock = (sine(900, 0.05) * 0.5 + noise(0.05, seed=42) * 0.5) * perc(0.05, 30)
    return loopable(mix(at(click * 0.8, 0.0, 1.0), at(tock * 0.65, 0.5, 1.0)), crossfade=0.04)


def s_final_ok() -> np.ndarray:
    """Neutralne potwierdzenie — identyczne przy trafieniu i przy błędzie."""
    return fade(lowpass((sine(520, 0.09) * 0.6 + triangle(780, 0.09) * 0.4) * perc(0.09, 18), 3000) * 0.8)


def s_final_pass() -> np.ndarray:
    down = seq(sine(note('G5'), 0.09) * perc(0.09, 12), sine(note('D5'), 0.13) * perc(0.13, 10))
    return fade(reverb(down * 0.75, 0.2))


def s_final_time_up() -> np.ndarray:
    alarm = np.zeros(int(SR * 1.4))
    for i in range(3):
        beep = square(note('A4'), 0.16, 0.5) * adsr(0.16, 0.005, 0.05, 0.8, 0.06)
        alarm = mix(alarm, at(lowpass(beep, 2600) * 0.6, i * 0.22, 1.4))
    return fade(reverb(mix(alarm, at(bell(note('A3'), 0.9, 2.5) * 0.6, 0.7)), 0.4))


def s_duplicate_buzz() -> np.ndarray:
    """Brzęczyk duplikatu — wyraźnie inny niż X-y rundy głównej."""
    wob = buzzer(300, 0.5, wobble=34) * 0.7
    second = at(buzzer(260, 0.45, wobble=30) * 0.6, 0.28, 0.85)
    return fade(reverb(mix(wob, second), 0.3))


def s_final_reveal() -> np.ndarray:
    return fade(reverb(mix(bell(note('E6'), 0.9), sparkle(0.9, seed=47, count=10) * 0.6), 0.35))


def s_final_reveal_zero() -> np.ndarray:
    return fade(reverb(lowpass(triangle(note('A3'), 0.5), 900) * perc(0.5, 5) * 0.7, 0.3))


def s_final_win() -> np.ndarray:
    main = fanfare('C4', 5.0)
    echo_layer = at(fanfare('G4', 3.0, brass=False) * 0.4, 1.6)
    crowd = lowpass(noise(5.2, seed=53), 1100) * adsr(5.2, 0.6, 1.5, 0.35, 2.0) * 0.18
    return mix(main, echo_layer, crowd, at(sparkle(5.4, seed=59, count=48), 0.2))


def s_final_lose() -> np.ndarray:
    fall = chord([note('A3'), note('C4'), note('D#4')], 2.6,
                 wave_fn=lambda f, d: saw(f, d) * 0.5 + triangle(f, d) * 0.5,
                 env=adsr(2.6, 0.08, 0.7, 0.3, 1.4))
    slide = sweep(260, 90, 2.6) * adsr(2.6, 0.05, 0.6, 0.35, 1.2) * 0.3
    return fade(reverb(mix(lowpass(fall, 1500) * 0.7, lowpass(slide, 900)), 0.5))


def s_error() -> np.ndarray:
    return fade(lowpass(buzzer(200, 0.18, 30) * 0.5, 1400))


def s_undo() -> np.ndarray:
    rewind = sweep(1400, 380, 0.35) * adsr(0.35, 0.01, 0.1, 0.6, 0.2)
    grain = noise(0.35, seed=61) * perc(0.35, 8) * 0.15
    return fade(reverb(mix(rewind * 0.5, grain), 0.2))


SOUNDS = {name[2:]: fn for name, fn in sorted(globals().items()) if name.startswith('s_')}


def build(names: list[str]) -> None:
    if shutil.which('ffmpeg') is None:
        sys.exit('Potrzebny ffmpeg do konwersji na mp3')
    OUT.mkdir(parents=True, exist_ok=True)

    for name in names:
        fn = SOUNDS.get(name)
        if fn is None:
            print(f'  ? nieznany dźwięk: {name}')
            continue
        audio = fn()
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            wav_path = Path(tmp.name)
        save_wav(wav_path, audio)
        mp3_path = OUT / f'{name}.mp3'
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav_path),
             '-codec:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '1', str(mp3_path)],
            check=True,
        )
        wav_path.unlink(missing_ok=True)
        print(f'  ✓ {name}.mp3  ({len(audio) / SR:.1f} s, {mp3_path.stat().st_size // 1024} kB)')


if __name__ == '__main__':
    requested = sys.argv[1:] or sorted(SOUNDS)
    print(f'Generuję {len(requested)} dźwięków do {OUT}')
    build(requested)
