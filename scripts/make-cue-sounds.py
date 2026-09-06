#!/usr/bin/env python3
"""
Generates the two Play timer cues in assets/audio.

These are synthesised rather than sourced so the repo owns them outright and Play never waits on a
network fetch. Run this only to regenerate the committed .wav files:

    python3 scripts/make-cue-sounds.py

Both are mono 16-bit at 44.1 kHz, which every browser and both native platforms decode without a
codec. Peaks sit near -3 dBFS so the Play surface can hold its own volume down and still cut
through music.
"""

import math
import os
import struct
import wave

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")


def write_wav(name, samples):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    peak = max(abs(s) for s in samples) or 1.0
    gain = 0.7 / peak
    frames = b"".join(
        struct.pack("<h", max(-32768, min(32767, int(s * gain * 32767)))) for s in samples
    )
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(frames)
    print(f"{name}: {len(samples) / RATE:.2f}s, {len(frames) + 44} bytes")


def whistle(duration=0.30, freq=3150.0):
    """
    A coach's whistle: a high tone with the fast warble a pea makes rattling in the chamber.

    The warble matters more than the pitch. A pure 3 kHz sine reads as an alarm or a notification;
    the frequency wobble is what makes an ear hear "whistle" and look up.
    """
    total = int(RATE * duration)
    samples = []
    phase = 0.0
    for index in range(total):
        t = index / RATE
        # Attack fast enough to sound struck, then a short fall so it does not linger over music.
        attack = min(1.0, t / 0.006)
        release = min(1.0, (duration - t) / 0.05)
        envelope = attack * max(0.0, release) ** 0.6

        warble = 1.0 + 0.028 * math.sin(2 * math.pi * 27.0 * t)
        # A whistle rises very slightly as breath pressure builds.
        sweep = 1.0 + 0.05 * min(1.0, t / 0.08)
        phase += 2 * math.pi * freq * warble * sweep / RATE

        tone = math.sin(phase)
        tone += 0.34 * math.sin(2 * phase)
        tone += 0.10 * math.sin(3 * phase)
        # A trace of breath noise keeps it from sounding synthesised.
        noise = 0.05 * ((index * 1103515245 + 12345) % 2147483648 / 1073741824.0 - 1.0)
        samples.append(envelope * (tone * 0.62 + noise))
    return samples


def bell(duration=0.85, freq=784.0):
    """
    A round-ended bell: an inharmonic partial stack over an exponential decay.

    The partial ratios are the ones that make metal sound like metal instead of an organ. Each
    partial decays faster than the one below it, which is why a real bell turns pure as it fades.
    """
    partials = [
        (1.00, 1.00, 3.2),
        (2.00, 0.42, 4.6),
        (2.76, 0.28, 6.0),
        (5.40, 0.14, 9.0),
        (8.93, 0.06, 13.0),
    ]
    total = int(RATE * duration)
    samples = []
    for index in range(total):
        t = index / RATE
        strike = min(1.0, t / 0.003)
        value = 0.0
        for ratio, amplitude, decay in partials:
            value += amplitude * math.exp(-decay * t) * math.sin(2 * math.pi * freq * ratio * t)
        # A tail fade so the file never ends on a non-zero sample and clicks.
        fade = min(1.0, (duration - t) / 0.04)
        samples.append(strike * max(0.0, fade) * value)
    return samples


if __name__ == "__main__":
    write_wav("whistle.wav", whistle())
    write_wav("bell.wav", bell())
