const LEFT_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const RIGHT_SCALE = [65.41, 73.42, 98, 110];
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.12;
const NOTE_ATTACK = 0.008;
const LEFT_DECAY = 0.2;
const RIGHT_DECAY = 0.28;

export function normalizeAudioLength(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const clamped = Math.min(1, Math.max(0, number));

  if (clamped < 0.1) {
    return 0;
  }

  if (clamped > 0.9) {
    return 1;
  }

  return clamped;
}

export function normalizeBpm(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 120;
  }

  return Math.min(160, Math.max(70, number));
}

export function normalizeRhythmDensity(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, number));
}

export function mapLengthToGain(length, masterVolume) {
  return normalizeAudioLength(length) * Math.min(1, Math.max(0, Number(masterVolume) || 0));
}

export function shouldTriggerVoice(stepIndex, voice, density, length) {
  const normalizedLength = normalizeAudioLength(length);

  if (normalizedLength === 0) {
    return false;
  }

  const effectiveDensity = normalizeRhythmDensity((normalizeRhythmDensity(density) + normalizedLength) / 2);

  if (voice === "right") {
    if (effectiveDensity > 0.72) {
      return stepIndex % 2 === 0 || stepIndex % 8 === 7;
    }

    if (effectiveDensity > 0.38) {
      return stepIndex % 2 === 0;
    }

    return stepIndex % 4 === 0;
  }

  if (effectiveDensity > 0.72) {
    return stepIndex % 2 === 1 || stepIndex % 8 === 4;
  }

  if (effectiveDensity > 0.38) {
    return stepIndex % 4 === 1 || stepIndex % 4 === 3;
  }

  return stepIndex % 8 === 3;
}

export function getVoiceFrequency(stepIndex, voice, length) {
  const normalizedLength = normalizeAudioLength(length);
  const scale = voice === "right" ? RIGHT_SCALE : LEFT_SCALE;
  const offset = Math.round(normalizedLength * (scale.length - 1));
  const index = (stepIndex + offset) % scale.length;

  return scale[index];
}

export class HandAudioController {
  #audioContext;
  #masterGain;
  #delay;
  #delayFeedback;
  #schedulerId;
  #nextStepTime = 0;
  #stepIndex = 0;
  #isEnabled = false;
  #state = {
    leftLength: 0,
    rightLength: 0,
    masterVolume: 0,
    bpm: 120,
    rhythmDensity: 0.5,
  };

  setEnabled(isEnabled) {
    this.#isEnabled = isEnabled;

    if (isEnabled) {
      this.#ensureGraph();
      this.#audioContext?.resume();
      this.#startScheduler();
    } else {
      this.#stopScheduler();
      this.#silence();
    }
  }

  update({ leftLength = 0, rightLength = 0, masterVolume = 0, bpm = 120, rhythmDensity = 0.5 }) {
    this.#state = {
      leftLength: normalizeAudioLength(leftLength),
      rightLength: normalizeAudioLength(rightLength),
      masterVolume: Math.min(1, Math.max(0, Number(masterVolume) || 0)),
      bpm: normalizeBpm(bpm),
      rhythmDensity: normalizeRhythmDensity(rhythmDensity),
    };

    if (this.#isEnabled) {
      this.#ensureGraph();
      this.#audioContext?.resume();
      this.#rampMasterGain(this.#state.masterVolume);
    }
  }

  stop() {
    this.#stopScheduler();
    this.#silence();
    this.#isEnabled = false;
  }

  #ensureGraph() {
    if (this.#audioContext) {
      return true;
    }

    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;

    if (!AudioContextClass) {
      return false;
    }

    this.#audioContext = new AudioContextClass();
    this.#masterGain = this.#audioContext.createGain();
    this.#delay = this.#audioContext.createDelay(0.5);
    this.#delayFeedback = this.#audioContext.createGain();

    this.#masterGain.gain.value = 0;
    this.#delay.delayTime.value = 0.18;
    this.#delayFeedback.gain.value = 0.24;
    this.#masterGain.connect(this.#audioContext.destination);
    this.#masterGain.connect(this.#delay);
    this.#delay.connect(this.#delayFeedback);
    this.#delayFeedback.connect(this.#delay);
    this.#delay.connect(this.#audioContext.destination);
    this.#nextStepTime = this.#audioContext.currentTime;
    return true;
  }

  #startScheduler() {
    if (this.#schedulerId || !this.#ensureGraph()) {
      return;
    }

    this.#schedulerId = setInterval(() => this.#scheduleAhead(), LOOKAHEAD_MS);
  }

  #stopScheduler() {
    if (!this.#schedulerId) {
      return;
    }

    clearInterval(this.#schedulerId);
    this.#schedulerId = null;
  }

  #scheduleAhead() {
    if (!this.#audioContext || !this.#isEnabled) {
      return;
    }

    while (this.#nextStepTime < this.#audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
      this.#scheduleStep(this.#stepIndex, this.#nextStepTime);
      this.#stepIndex += 1;
      this.#nextStepTime += 30 / this.#state.bpm;
    }
  }

  #scheduleStep(stepIndex, startTime) {
    if (shouldTriggerVoice(stepIndex, "right", this.#state.rhythmDensity, this.#state.rightLength)) {
      this.#triggerVoice("right", stepIndex, startTime);
    }

    if (shouldTriggerVoice(stepIndex, "left", this.#state.rhythmDensity, this.#state.leftLength)) {
      this.#triggerVoice("left", stepIndex, startTime + 0.01);
    }
  }

  #triggerVoice(voice, stepIndex, startTime) {
    const length = voice === "left" ? this.#state.leftLength : this.#state.rightLength;
    const frequency = getVoiceFrequency(stepIndex, voice, length);
    const oscillator = this.#audioContext.createOscillator();
    const gain = this.#audioContext.createGain();
    const filter = this.#audioContext.createBiquadFilter();
    const peakGain = mapLengthToGain(length, 1) * (voice === "left" ? 0.42 : 0.58);
    const decay = voice === "left" ? LEFT_DECAY : RIGHT_DECAY;

    oscillator.type = voice === "left" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    filter.type = voice === "left" ? "highpass" : "lowpass";
    filter.frequency.setValueAtTime(voice === "left" ? 760 + length * 1800 : 130 + length * 420, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + NOTE_ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.#masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + decay + 0.04);
  }

  #silence() {
    if (!this.#audioContext || !this.#masterGain) {
      return;
    }

    this.#rampMasterGain(0);
  }

  #rampMasterGain(value) {
    const now = this.#audioContext.currentTime;

    this.#masterGain.gain.cancelScheduledValues(now);
    this.#masterGain.gain.setTargetAtTime(value, now, 0.06);
  }
}
