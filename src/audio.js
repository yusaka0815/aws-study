/**
 * audio.js
 * Web Audio APIによる効果音
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtxCtor();
  }
  // Chromeの自動再生ポリシーで suspended になっている場合は resume
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 正解音: 柔らかく上昇する2音（ting-ting）
 */
export function playCorrectSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.08, 0.08);
    playTone(ctx, 1047, now + 0.07, 0.1, 0.07);
  } catch {
    // AudioContext 非サポートや権限エラーは無視
  }
}

/**
 * 不正解音: 柔らかく下降する単音グライド（woomp）
 */
export function playWrongSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.linearRampToValueAtTime(260, now + 0.22);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.start(now);
    osc.stop(now + 0.23);
  } catch {
    // 無視
  }
}

/**
 * 音符1つを鳴らす（正解音用）
 */
function playTone(ctx, frequency, startTime, duration, maxGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(maxGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}
