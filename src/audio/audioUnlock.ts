/**
 * Web Audio Unlock Utility for iOS Safari, Android, and Earphone / Headphone routing
 *
 * Resolves:
 * 1. iOS Silent Switch (マナーモード): Web Audio is classified as 'Ambient' by default,
 *    which mutes Web Audio in Safari even through earphones unless promoted to 'Playback' category.
 * 2. Asynchronous AudioContext suspension / interruption when Bluetooth earphones connect.
 * 3. User activation requirement on mobile touchstart/touchend.
 */

export function unlockWebAudio(ctx: AudioContext): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. Resume AudioContext if suspended or interrupted
    const state = ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      ctx.resume().catch(() => {});
    }

    // 2. Play 1-sample silent Web Audio buffer to trigger hardware clock
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Ignore
    }

    // 3. HTML5 Audio ping: forces iOS WebKit to switch session category from 'Ambient' to 'Playback'
    // This allows audio to play through headphones / earphones even if iPhone silent switch is ON!
    try {
      const audio = new Audio();
      // 1-sample silent WAV base64
      audio.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.volume = 0.01;
      const p = audio.play();
      if (p) {
        p.then(() => {
          audio.pause();
          audio.remove();
          resolve(true);
        }).catch(() => {
          resolve(false);
        });
        return;
      }
    } catch {
      // Fallback
    }

    resolve(true);
  });
}
