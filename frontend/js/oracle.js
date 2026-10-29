/**
 * DigiWave X — Deterministic Ground-Truth Digital Communications Oracle
 * Matches backend NumPy implementations: encoders.py, decoders.py, and dsss.py
 */

(function (window) {
  'use strict';

  const SAMPLES_PER_BIT = 2;

  // --- 1. Line Encoders ---

  function encodeNRZ(bits, samplesPerBit = SAMPLES_PER_BIT) {
    // Polar NRZ-L: 1 -> +1, 0 -> -1
    const levels = [];
    for (const b of bits) {
      const v = b === 1 ? 1.0 : -1.0;
      for (let i = 0; i < samplesPerBit; i++) levels.push(v);
    }
    return levels;
  }

  function encodeNRZUnipolar(bits, samplesPerBit = SAMPLES_PER_BIT) {
    // Unipolar NRZ: 1 -> +1, 0 -> 0
    const levels = [];
    for (const b of bits) {
      const v = b === 1 ? 1.0 : 0.0;
      for (let i = 0; i < samplesPerBit; i++) levels.push(v);
    }
    return levels;
  }

  function encodeNRZM(bits, samplesPerBit = SAMPLES_PER_BIT, initialLevel = -1.0) {
    // NRZ-M (Mark / Differential): 1 -> transition (flip), 0 -> hold
    let level = initialLevel;
    const levels = [];
    for (const b of bits) {
      if (b === 1) level = -level;
      for (let i = 0; i < samplesPerBit; i++) levels.push(level);
    }
    return levels;
  }

  function encodeRZUnipolar(bits, samplesPerBit = SAMPLES_PER_BIT) {
    // Unipolar RZ: 1 -> +1 pulse first half, 0 second half; 0 -> 0 whole bit
    const half = Math.max(1, Math.floor(samplesPerBit / 2));
    const levels = [];
    for (const b of bits) {
      if (b === 1) {
        for (let i = 0; i < half; i++) levels.push(1.0);
        for (let i = half; i < samplesPerBit; i++) levels.push(0.0);
      } else {
        for (let i = 0; i < samplesPerBit; i++) levels.push(0.0);
      }
    }
    return levels;
  }

  function encodeBipolarRZ(bits, samplesPerBit = SAMPLES_PER_BIT) {
    // Bipolar RZ: 1 -> +1 first half then 0; 0 -> -1 first half then 0
    const half = Math.max(1, Math.floor(samplesPerBit / 2));
    const levels = [];
    for (const b of bits) {
      const pulse = b === 1 ? 1.0 : -1.0;
      for (let i = 0; i < half; i++) levels.push(pulse);
      for (let i = half; i < samplesPerBit; i++) levels.push(0.0);
    }
    return levels;
  }

  function encodeManchester(bits, samplesPerBit = SAMPLES_PER_BIT, convention = 'ieee') {
    // IEEE 802.3: 1 -> Low then High (-1, +1); 0 -> High then Low (+1, -1)
    // Thomas: 1 -> High then Low; 0 -> Low then High
    const half = Math.max(1, Math.floor(samplesPerBit / 2));
    const levels = [];
    for (const b of bits) {
      let first, second;
      if (convention === 'ieee') {
        first = b === 1 ? -1.0 : 1.0;
        second = b === 1 ? 1.0 : -1.0;
      } else {
        first = b === 1 ? 1.0 : -1.0;
        second = b === 1 ? -1.0 : 1.0;
      }
      for (let i = 0; i < half; i++) levels.push(first);
      for (let i = half; i < samplesPerBit; i++) levels.push(second);
    }
    return levels;
  }

  function encodeAMI(bits, samplesPerBit = SAMPLES_PER_BIT, misconceptionResetZeros = false) {
    // AMI (Alternate Mark Inversion): 0 -> 0; 1 -> alternating +1 / -1
    // If misconceptionResetZeros = true: marks reset polarity back to +1 after zeros
    const levels = [];
    let nextPolarity = 1.0;
    for (const b of bits) {
      if (b === 0) {
        for (let i = 0; i < samplesPerBit; i++) levels.push(0.0);
        if (misconceptionResetZeros) {
          nextPolarity = 1.0; // Misconception fault
        }
      } else {
        for (let i = 0; i < samplesPerBit; i++) levels.push(nextPolarity);
        nextPolarity = -nextPolarity;
      }
    }
    return levels;
  }

  const ENCODERS = {
    nrz: encodeNRZ,
    nrz_unipolar: encodeNRZUnipolar,
    nrzm: encodeNRZM,
    rz_unipolar: encodeRZUnipolar,
    bipolar_rz: encodeBipolarRZ,
    manchester: encodeManchester,
    ami: encodeAMI,
  };

  function encode(scheme, bits, samplesPerBit = SAMPLES_PER_BIT, options = {}) {
    const fn = ENCODERS[scheme.toLowerCase()];
    if (!fn) throw new Error(`Unknown scheme: ${scheme}`);
    if (scheme.toLowerCase() === 'manchester' && options.convention) {
      return fn(bits, samplesPerBit, options.convention);
    }
    if (scheme.toLowerCase() === 'ami' && options.misconceptionResetZeros) {
      return fn(bits, samplesPerBit, options.misconceptionResetZeros);
    }
    return fn(bits, samplesPerBit);
  }

  // --- 2. Decoders ---

  function decodeNRZ(levels, samplesPerBit = SAMPLES_PER_BIT) {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const bits = [];
    for (let i = 0; i < nBits; i++) {
      let sum = 0;
      for (let s = 0; s < samplesPerBit; s++) sum += levels[i * samplesPerBit + s];
      bits.push(sum / samplesPerBit > 0 ? 1 : 0);
    }
    return bits;
  }

  function decodeNRZUnipolar(levels, samplesPerBit = SAMPLES_PER_BIT) {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const bits = [];
    for (let i = 0; i < nBits; i++) {
      let sum = 0;
      for (let s = 0; s < samplesPerBit; s++) sum += levels[i * samplesPerBit + s];
      bits.push(sum / samplesPerBit > 0.5 ? 1 : 0);
    }
    return bits;
  }

  function decodeNRZM(levels, samplesPerBit = SAMPLES_PER_BIT, initialLevel = -1.0) {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const bits = [];
    let prev = initialLevel;
    for (let i = 0; i < nBits; i++) {
      let sum = 0;
      for (let s = 0; s < samplesPerBit; s++) sum += levels[i * samplesPerBit + s];
      const mean = sum / samplesPerBit;
      const current = mean > 0 ? 1.0 : -1.0;
      bits.push(current !== prev ? 1 : 0);
      prev = current;
    }
    return bits;
  }

  function decodeManchester(levels, samplesPerBit = SAMPLES_PER_BIT, convention = 'ieee') {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const bits = [];
    const half = Math.max(1, Math.floor(samplesPerBit / 2));
    for (let i = 0; i < nBits; i++) {
      const idx = i * samplesPerBit;
      let firstSum = 0;
      for (let s = 0; s < half; s++) firstSum += levels[idx + s];
      let secondSum = 0;
      for (let s = half; s < samplesPerBit; s++) secondSum += levels[idx + s];
      const diff = (secondSum / half) - (firstSum / half);
      if (convention === 'ieee') {
        bits.push(diff > 0 ? 1 : 0);
      } else {
        bits.push(diff < 0 ? 1 : 0);
      }
    }
    return bits;
  }

  function decodeAMI(levels, samplesPerBit = SAMPLES_PER_BIT) {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const bits = [];
    for (let i = 0; i < nBits; i++) {
      let sum = 0;
      for (let s = 0; s < samplesPerBit; s++) sum += levels[i * samplesPerBit + s];
      const mean = sum / samplesPerBit;
      bits.push(Math.abs(mean) > 0.25 ? 1 : 0);
    }
    return bits;
  }

  function decode(scheme, levels, samplesPerBit = SAMPLES_PER_BIT) {
    switch (scheme.toLowerCase()) {
      case 'nrz': return decodeNRZ(levels, samplesPerBit);
      case 'nrz_unipolar': return decodeNRZUnipolar(levels, samplesPerBit);
      case 'nrzm': return decodeNRZM(levels, samplesPerBit);
      case 'manchester': return decodeManchester(levels, samplesPerBit);
      case 'ami': return decodeAMI(levels, samplesPerBit);
      case 'rz_unipolar': return decodeNRZUnipolar(levels, samplesPerBit);
      case 'bipolar_rz': return decodeNRZ(levels, samplesPerBit);
      default: return decodeNRZ(levels, samplesPerBit);
    }
  }

  // --- 3. Diagnostics & AMI Code Violations ---

  function checkAMIViolation(levels, samplesPerBit = SAMPLES_PER_BIT) {
    const nBits = Math.floor(levels.length / samplesPerBit);
    const violations = [];
    let lastMarkPolarity = null;
    for (let i = 0; i < nBits; i++) {
      let sum = 0;
      for (let s = 0; s < samplesPerBit; s++) sum += levels[i * samplesPerBit + s];
      const mean = sum / samplesPerBit;
      if (Math.abs(mean) > 0.25) {
        const polarity = mean > 0 ? 1 : -1;
        if (lastMarkPolarity !== null && polarity === lastMarkPolarity) {
          violations.push(i);
        }
        lastMarkPolarity = polarity;
      }
    }
    return violations;
  }

  // --- 4. Signal Analysis & Telemetry Calculations ---

  function calculateMetrics(waveform, bits, voltage = 1.0) {
    if (!waveform || waveform.length === 0) {
      return { dcComponent: 0, transitions: 0, baudRate: 0, clockCapability: 'None' };
    }

    const scaled = waveform.map(v => v * voltage);
    const sum = scaled.reduce((acc, v) => acc + v, 0);
    const dcComponent = sum / scaled.length;

    let transitions = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (Math.abs(scaled[i] - scaled[i - 1]) > 0.05) {
        transitions++;
      }
    }

    // Clock recovery capability rating based on transition density
    const transPerBit = bits.length > 0 ? transitions / bits.length : 0;
    let clockCapability = 'Poor (Run of zeros hazard)';
    if (transPerBit >= 1.0) {
      clockCapability = 'Excellent (Guaranteed mid-bit clock)';
    } else if (transPerBit >= 0.5) {
      clockCapability = 'Moderate (Self-synchronizing on data)';
    }

    return {
      dcComponent: dcComponent,
      dcComponentPercent: (dcComponent / (voltage || 1)) * 100,
      transitions: transitions,
      transitionDensity: transPerBit,
      clockCapability: clockCapability,
      bitCount: bits.length,
      sampleCount: waveform.length,
    };
  }

  // --- 4b. Spectral Analysis Metrics (COM122L Experiment 2) ---

  const SPECTRAL_METRICS = {
    nrz_unipolar: {
      name: 'Unipolar NRZ',
      formula: 'S(f) = (V²Tb/4) · sinc²(fTb) + (V²/4) · δ(f)',
      firstNullKhz: 10.0,
      mainLobeBwKhz: 10.0,
      dcStatus: 'High DC Offset (+V/2)',
      hasClockSpike: false,
      bwEfficiency: '1.0 bps/Hz',
      clockExtraction: 'Poor (Requires external PLL, long runs of 0s or 1s lose sync)',
      appNotes: 'Short-range board-level signaling, TTL/CMOS logic interconnects.',
    },
    rz_unipolar: {
      name: 'Unipolar RZ',
      formula: 'S(f) = (V²Tb/16) · sinc²(fTb/2) · [1 + Σ δ(f - m/Tb)]',
      firstNullKhz: 20.0,
      mainLobeBwKhz: 20.0,
      dcStatus: 'Moderate DC (+V/4)',
      hasClockSpike: true, // Discrete 10 kHz clock tone!
      bwEfficiency: '0.5 bps/Hz',
      clockExtraction: 'Excellent (Discrete 10 kHz clock tone present in spectrum)',
      appNotes: 'Optical communications, simple receivers with tuned bandpass filter.',
    },
    ami: {
      name: 'Bipolar NRZ (AMI)',
      formula: 'S(f) = V²Tb · sinc²(fTb) · sin²(πfTb)',
      firstNullKhz: 10.0,
      mainLobeBwKhz: 10.0,
      dcStatus: 'Zero DC (S(0) = 0, No Baseline Drift)',
      hasClockSpike: false,
      bwEfficiency: '1.0 bps/Hz',
      clockExtraction: 'Good for active marks; vulnerable to long runs of zeros',
      appNotes: 'Telecom T1/E1 primary rate carrier trunks, transformer-coupled lines.',
    },
    nrz: {
      name: 'Polar NRZ',
      formula: 'S(f) = V²Tb · sinc²(fTb)',
      firstNullKhz: 10.0,
      mainLobeBwKhz: 10.0,
      dcStatus: 'Low to Zero DC (Symmetric around zero)',
      hasClockSpike: false,
      bwEfficiency: '1.0 bps/Hz',
      clockExtraction: 'Moderate (Depends on bit transition density)',
      appNotes: 'RS-232 serial links, magnetic recording, digital baseband.',
    },
    bipolar_rz: {
      name: 'Polar RZ',
      formula: 'S(f) = (V²Tb/4) · sinc²(fTb/2)',
      firstNullKhz: 20.0,
      mainLobeBwKhz: 20.0,
      dcStatus: 'Zero DC (Symmetric pulses return to 0)',
      hasClockSpike: false,
      bwEfficiency: '0.5 bps/Hz',
      clockExtraction: 'Good (Return-to-zero helps bit boundary detection)',
      appNotes: 'Baseband testing, synchronous data lines.',
    },
    manchester: {
      name: 'Bi-phase (Split phase) Manchester',
      formula: 'S(f) = V²Tb · sinc²(fTb/2) · sin²(πfTb/2)',
      firstNullKhz: 20.0,
      mainLobeBwKhz: 20.0,
      dcStatus: 'Zero DC (Complete DC Balance, No Drift)',
      hasClockSpike: false,
      bwEfficiency: '0.5 bps/Hz',
      clockExtraction: 'Guaranteed (Self-clocking via mandatory mid-bit transition)',
      appNotes: 'Ethernet IEEE 802.3 (10BASE-T), RFID, aerospace MIL-STD-1553.',
    },
  };

  function calculateSpectralMetrics(scheme, bits, voltage = 1.0, clockFreqKhz = 10.0) {
    const key = (scheme || 'nrz').toLowerCase();
    const meta = SPECTRAL_METRICS[key] || SPECTRAL_METRICS.nrz;
    const timeMetrics = calculateMetrics(encode(key, bits), bits, voltage);

    return {
      ...meta,
      clockFreqKhz: clockFreqKhz,
      timeMetrics: timeMetrics,
    };
  }

  // --- 5. DSSS Spread Spectrum Simulation ---

  function pseudoNoiseCode(chipRate, seed = 0) {
    // Simple deterministic pseudo-random generator
    let state = seed * 1664525 + 1013904223;
    const chips = [];
    for (let i = 0; i < chipRate; i++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      chips.push(state > 2147483648 ? 1.0 : -1.0);
    }
    return chips;
  }

  function runDSSS(bits, chipRate = 4, seed = 0) {
    const pnCode = pseudoNoiseCode(chipRate, seed);
    const spreadSignal = [];

    for (const b of bits) {
      const bipolarBit = b === 1 ? 1.0 : -1.0;
      for (const chip of pnCode) {
        spreadSignal.push(bipolarBit * chip);
      }
    }

    // Coherent detection / despreading
    const recoveredBits = [];
    const nBits = bits.length;
    for (let i = 0; i < nBits; i++) {
      let energy = 0;
      for (let c = 0; c < chipRate; c++) {
        energy += spreadSignal[i * chipRate + c] * pnCode[c];
      }
      recoveredBits.push(energy > 0 ? 1 : 0);
    }

    return {
      bits: bits,
      chipRate: chipRate,
      pnCode: pnCode,
      spreadSignal: spreadSignal,
      recoveredBits: recoveredBits,
      matched: recoveredBits.every((b, idx) => b === bits[idx]),
    };
  }

  // --- 6. Experiment 1: Amplitude Modulation (DSB-FC) & Trapezoid ---

  function calculateAM(params = {}) {
    const Em = Math.max(0.0, Number(params.Em !== undefined ? params.Em : 2.0));
    const Ec = Math.max(0.1, Number(params.Ec !== undefined ? params.Ec : 4.0));
    const fm = Math.max(100.0, Number(params.fm !== undefined ? params.fm : 1000.0));
    const fc = Math.max(fm * 2.0, Number(params.fc !== undefined ? params.fc : 455000.0));
    const rfLink = params.rf_link || 'closed_dsbfc';
    const R = Math.max(1.0, Number(params.load_resistance || 50.0));
    const numSamples = params.num_samples || 400;

    const isDsbfc = (rfLink === 'closed_dsbfc');
    const m = isDsbfc ? (Em / Ec) : Infinity;

    const Emax = Ec + Em;
    const Emin = m <= 1.0 ? Math.max(0.0, Ec - Em) : 0.0;

    const mGraphical = (Emax + Emin > 0) ? ((Emax - Emin) / (Emax + Emin)) : 0.0;

    // Trapezoid dimensions (CRO X-Y mode)
    const L1 = 2.0 * Emax;
    const L2 = 2.0 * Math.max(0.0, Ec - Em);
    const mTrapezoidal = (L1 + L2 > 0) ? ((L1 - L2) / (L1 + L2)) : 0.0;

    let patternType = 'trapezoid';
    let patternDesc = '';
    if (m < 0.001) {
      patternType = 'rectangle';
      patternDesc = 'Rectangle (m = 0, Pure Carrier)';
    } else if (m < 0.999) {
      patternType = 'trapezoid';
      patternDesc = `Trapezoid (Under-modulation, m = ${m.toFixed(2)} < 1)`;
    } else if (Math.abs(m - 1.0) <= 0.05) {
      patternType = 'triangle';
      patternDesc = `Triangle (Critical 100% Modulation, m = ${m.toFixed(2)} ≈ 1)`;
    } else {
      patternType = 'bowtie';
      patternDesc = `Crossed Bow-tie (Over-modulation, m = ${m.toFixed(2)} > 1, Envelope Distortion)`;
    }

    // Power calculations (R = 50 Ohms as per PICT manual Page 6)
    const Pc = (Ec * Ec) / (2.0 * R);
    const Psb = isDsbfc ? ((m * m * Ec * Ec) / (4.0 * R)) : ((Em * Em) / (4.0 * R));
    const Pusb = Psb / 2.0;
    const Plsb = Psb / 2.0;
    const Pt = Pc + Psb;
    const efficiency = Pt > 0 ? (Psb / Pt * 100.0) : 0.0;

    // Time waveform generation for 2 cycles of modulating wave
    const tPeriod = 2.0 / fm;
    const dt = tPeriod / numSamples;
    const timePts = [];
    const modPts = [];
    const carrierPts = [];
    const amPts = [];
    const envUpperPts = [];
    const envLowerPts = [];

    // Use a calibrated display carrier frequency (24 * fm) for crisp CRT envelope visibility
    const displayFc = 24.0 * fm;

    for (let i = 0; i < numSamples; i++) {
      const t = i * dt;
      timePts.push(t);
      const emT = Em * Math.cos(2.0 * Math.PI * fm * t);
      const ecT = Ec * Math.cos(2.0 * Math.PI * displayFc * t);
      modPts.push(emT);
      carrierPts.push(ecT);

      let amT, envUpper, envLower;
      if (isDsbfc) {
        const instAmp = Ec + emT;
        amT = instAmp * Math.cos(2.0 * Math.PI * displayFc * t);
        envUpper = m > 1.0 ? Math.abs(instAmp) : instAmp;
        envLower = -envUpper;
      } else {
        amT = emT * Math.cos(2.0 * Math.PI * displayFc * t);
        envUpper = Math.abs(emT);
        envLower = -envUpper;
      }

      amPts.push(amT);
      envUpperPts.push(envUpper);
      envLowerPts.push(envLower);
    }

    const trapezoidGeometry = {
      xLeft: -Em,
      xRight: +Em,
      yLeftTop: Math.max(0.0, Ec - Em),
      yLeftBottom: -Math.max(0.0, Ec - Em),
      yRightTop: Ec + Em,
      yRightBottom: -(Ec + Em),
      L1: L1,
      L2: L2,
      crossOver: m > 1.0,
      crossYTop: m > 1.0 ? (Em - Ec) : 0.0,
    };

    return {
      experiment: 'am_modulation',
      Em,
      fm,
      Ec,
      fc,
      rfLink,
      loadResistance: R,
      m,
      mGraphical,
      mTrapezoidal,
      Emax,
      Emin,
      L1,
      L2,
      patternType,
      patternDesc,
      Pc,
      Psb,
      Pusb,
      Plsb,
      Pt,
      efficiency,
      bandwidthHz: 2.0 * fm,
      trapezoidGeometry,
      numSamples,
      timeWaveform: {
        t: timePts,
        modulating: modPts,
        carrier: carrierPts,
        amWave: amPts,
        envUpper: envUpperPts,
        envLower: envLowerPts,
      },
    };
  }

  window.DigiWaveOracle = {
    encode,
    decode,
    checkAMIViolation,
    calculateMetrics,
    calculateSpectralMetrics,
    SPECTRAL_METRICS,
    runDSSS,
    calculateAM,
    ENCODERS,
  };
})(window);
