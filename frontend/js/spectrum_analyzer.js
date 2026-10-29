/**
 * DigiWave X — Virtual RF Spectrum Analyzer Engine (RF-122L)
 * Designed for SIGMA MODEL COM122L: Study of Line Codes & Their Spectral Analysis.
 * Implements real-time Discrete Fourier Transform (FFT) and theoretical Power Spectral Density (PSD)
 * for 10 KHz Word/Bit Clock and 8-Bit Data Word transmissions.
 */

(function (window) {
  'use strict';

  class SpectrumAnalyzer {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      // RF Spectrum Analyzer Parameters
      this.centerFreqKhz = 20.0;   // kHz center
      this.spanKhz = 40.0;         // kHz span (0 to 40 kHz default)
      this.rbwKhz = 0.5;           // Resolution bandwidth (kHz)
      this.refLevelDbm = 10.0;     // Top of screen in dBm
      this.dbPerDiv = 10.0;        // 10 dB per division (8 divisions = 80 dB range)
      this.traceMode = 'both';     // 'fft', 'theory', 'both'
      this.peakHold = false;
      this.isRunning = true;

      // Active Signal Data
      this.scheme = 'nrz';
      this.bits = [1, 0, 1, 1, 0, 0, 1, 0]; // 8-bit word default
      this.voltage = 1.0;
      this.bitRateKhz = 10.0;       // Specification #2: 10 KHz Word Clock Frequency

      // Marker 1 State
      this.marker1 = {
        freqKhz: 10.0,
        powerDbm: -10.0,
        autoPeak: true,
      };

      // Internal Buffers & Sweep
      this.sweepProgress = 0;
      this.peakHoldBuffer = [];
      this.fftSpectrum = [];
      this.theoreticalEnvelope = [];
      this.animationFrameId = null;

      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
      this.startSweep();
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = (rect.width || 600) * dpr;
      this.canvas.height = (rect.height || 240) * dpr;
      this.ctx.scale(dpr, dpr);
      this.width = rect.width || 600;
      this.height = rect.height || 240;
      this.computeSpectra();
      this.draw();
    }

    setSignal(scheme, bits, voltage = 1.0) {
      this.scheme = scheme || 'nrz';
      this.bits = bits && bits.length > 0 ? bits : [1, 0, 1, 1, 0, 0, 1, 0];
      this.voltage = voltage || 1.0;
      this.computeSpectra();
      this.draw();
    }

    setSpan(spanKhz) {
      this.spanKhz = spanKhz;
      this.centerFreqKhz = spanKhz / 2;
      this.computeSpectra();
      this.draw();
    }

    setTraceMode(mode) {
      this.traceMode = mode;
      this.draw();
    }

    togglePeakHold() {
      this.peakHold = !this.peakHold;
      this.peakHoldBuffer = [];
      this.draw();
    }

    /**
     * Compute both theoretical continuous PSD envelope S(f) and
     * discrete FFT line harmonics of the repeating 8-bit word at 10 kHz.
     */
    computeSpectra() {
      const startFreq = Math.max(0, this.centerFreqKhz - this.spanKhz / 2);
      const stopFreq = this.centerFreqKhz + this.spanKhz / 2;
      const numPoints = 250;
      const df = (stopFreq - startFreq) / (numPoints - 1);

      const V = this.voltage;
      const Rb = this.bitRateKhz; // 10 kHz
      const Tb = 1 / Rb;          // 0.1 ms (normalized to ms)

      this.theoreticalEnvelope = [];
      this.fftSpectrum = [];

      // 1. Calculate Theoretical Continuous PSD: S(f)
      for (let i = 0; i < numPoints; i++) {
        const f = startFreq + i * df; // in kHz
        let psd = 0;

        // Normalized sinc: sinc(x) = sin(pi*x)/(pi*x)
        const sinc = (x) => {
          if (Math.abs(x) < 1e-7) return 1.0;
          return Math.sin(Math.PI * x) / (Math.PI * x);
        };

        const f_Tb = f * Tb; // f / Rb

        switch (this.scheme.toLowerCase()) {
          case 'nrz_unipolar':
            // S(f) = (V^2 * Tb / 4) * sinc^2(f * Tb) + (V^2 / 4) * delta(0)
            psd = (V * V * Tb / 4.0) * Math.pow(sinc(f_Tb), 2);
            if (f < 0.25) psd += (V * V / 4.0) * 12.0; // Simulated DC delta spike
            break;

          case 'rz_unipolar':
            // S(f) = (V^2 * Tb / 16) * sinc^2(f * Tb / 2) * [1 + sum delta(f - m/Tb)]
            psd = (V * V * Tb / 16.0) * Math.pow(sinc(f_Tb / 2.0), 2);
            // Discrete clock spike at f = 10 kHz (m=1)
            if (Math.abs(f - 10.0) < 0.4) psd += (V * V / 16.0) * 10.0;
            if (f < 0.25) psd += (V * V / 16.0) * 10.0;
            break;

          case 'ami':
            // Bipolar NRZ (AMI): S(f) = V^2 * Tb * sinc^2(f * Tb) * sin^2(pi * f * Tb)
            // S(0) = 0! Zero DC component, peak near 5 kHz, null at 10 kHz
            psd = (V * V * Tb) * Math.pow(sinc(f_Tb), 2) * Math.pow(Math.sin(Math.PI * f_Tb), 2);
            break;

          case 'nrz':
            // Polar NRZ: S(f) = V^2 * Tb * sinc^2(f * Tb)
            // First null at f = Rb = 10 kHz
            psd = (V * V * Tb) * Math.pow(sinc(f_Tb), 2);
            break;

          case 'bipolar_rz':
            // Polar RZ: S(f) = (V^2 * Tb / 4) * sinc^2(f * Tb / 2)
            // First null at f = 2*Rb = 20 kHz
            psd = (V * V * Tb / 4.0) * Math.pow(sinc(f_Tb / 2.0), 2);
            break;

          case 'manchester':
            // Bi-phase Manchester: S(f) = V^2 * Tb * sinc^2(f * Tb / 2) * sin^2(pi * f * Tb / 2)
            // Zero at f = 0, first null at f = 2*Rb = 20 kHz, peak near 7.4 kHz
            psd = (V * V * Tb) * Math.pow(sinc(f_Tb / 2.0), 2) * Math.pow(Math.sin(Math.PI * f_Tb / 2.0), 2);
            break;

          default:
            psd = (V * V * Tb) * Math.pow(sinc(f_Tb), 2);
            break;
        }

        // Convert power to dBm (with reference 50 ohm load / calibration)
        const powerDbm = 10 * Math.log10(Math.max(1e-9, psd * 1000) + 1e-8) + 5.0;
        this.theoreticalEnvelope.push({ freq: f, dbm: Math.max(-85, Math.min(15, powerDbm)) });
      }

      // 2. Calculate Discrete FFT Spectrum for the actual repeating 8-bit word
      // Generate one period of the line coded waveform at high oversampling
      const samplesPerBit = 16;
      let waveform = [];
      try {
        waveform = window.DigiWaveOracle ? window.DigiWaveOracle.encode(this.scheme, this.bits, samplesPerBit) : [];
      } catch (e) {
        waveform = [];
      }

      if (waveform.length === 0) {
        waveform = this.bits.map(b => b === 1 ? V : -V);
      }

      const N = waveform.length; // e.g. 8 bits * 16 samples = 128 samples
      const FsKhz = Rb * samplesPerBit; // 10 kHz * 16 = 160 kHz sampling rate
      const fWordKhz = Rb / this.bits.length; // Repeating fundamental (1.25 kHz for 8 bits)

      // Discrete Fourier Transform
      for (let i = 0; i < numPoints; i++) {
        const f = startFreq + i * df;
        let real = 0;
        let imag = 0;

        // Sum over sampled periodic sequence
        for (let n = 0; n < N; n++) {
          const t = n / FsKhz; // time in ms
          const angle = -2 * Math.PI * f * t;
          real += waveform[n] * Math.cos(angle);
          imag += waveform[n] * Math.sin(angle);
        }

        const mag = Math.sqrt(real * real + imag * imag) / N;
        // Window sinc smoothing for realistic RBW filter response
        const sincShape = Math.sin(Math.PI * f / fWordKhz) / (Math.PI * f / fWordKhz + 1e-6);
        const combEmphasis = Math.pow(Math.cos(Math.PI * (f % fWordKhz) / fWordKhz), 12);
        const effectiveMag = mag * (0.8 + 0.4 * combEmphasis);

        const powerDbm = 20 * Math.log10(Math.max(1e-5, effectiveMag) * V + 1e-6) + 4.0;
        const clampedDbm = Math.max(-85, Math.min(15, powerDbm));
        this.fftSpectrum.push({ freq: f, dbm: clampedDbm });
      }

      // 3. Peak Marker Tracking
      if (this.marker1.autoPeak && this.fftSpectrum.length > 0) {
        let maxPoint = this.fftSpectrum[0];
        // Skip DC f=0 if user is analyzing AC spectrum
        const searchStart = this.scheme === 'nrz_unipolar' || this.scheme === 'rz_unipolar' ? 0 : 3;
        for (let i = searchStart; i < this.fftSpectrum.length; i++) {
          if (this.fftSpectrum[i].dbm > maxPoint.dbm) {
            maxPoint = this.fftSpectrum[i];
          }
        }
        this.marker1.freqKhz = maxPoint.freq;
        this.marker1.powerDbm = maxPoint.dbm;
      }
    }

    startSweep() {
      const animate = () => {
        if (this.isRunning) {
          this.sweepProgress = (this.sweepProgress + 3) % (this.width || 600);
          this.draw();
        }
        this.animationFrameId = requestAnimationFrame(animate);
      };
      this.animationFrameId = requestAnimationFrame(animate);
    }

    stopSweep() {
      this.isRunning = false;
    }

    resumeSweep() {
      this.isRunning = true;
    }

    draw() {
      if (!this.ctx || !this.width) return;
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Deep Phosphor Spectrum Analyzer Screen Background
      ctx.fillStyle = '#020907';
      ctx.fillRect(0, 0, w, h);

      // CRT Graticule Grid
      this.drawGraticule(ctx, w, h);

      // Theoretical Envelope Trace (Amber dashed line)
      if (this.traceMode === 'theory' || this.traceMode === 'both') {
        this.drawTheoreticalTrace(ctx, w, h);
      }

      // Active FFT Line Spectrum Trace (Glowing Cyan)
      if (this.traceMode === 'fft' || this.traceMode === 'both') {
        this.drawFFTTrace(ctx, w, h);
      }

      // Marker 1 Crosshair
      this.drawMarker(ctx, w, h);

      // Top On-Screen Telemetry HUD
      this.drawHUD(ctx, w, h);
    }

    drawGraticule(ctx, w, h) {
      const marginL = 45;
      const marginR = 15;
      const marginT = 24;
      const marginB = 24;
      const gridW = w - marginL - marginR;
      const gridH = h - marginT - marginB;

      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.lineWidth = 1;

      // 10 Horizontal Divisions (10 dB / div, total 80 dB)
      const vDivs = 8;
      for (let i = 0; i <= vDivs; i++) {
        const y = marginT + (gridH / vDivs) * i;
        ctx.beginPath();
        ctx.moveTo(marginL, y);
        ctx.lineTo(w - marginR, y);
        ctx.stroke();

        // Level labels in dBm
        const dbmLevel = this.refLevelDbm - i * this.dbPerDiv;
        ctx.fillStyle = 'rgba(52, 211, 153, 0.6)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${dbmLevel.toFixed(0)}`, marginL - 6, y + 3);
      }

      // 10 Vertical Frequency Divisions
      const hDivs = 10;
      const startF = Math.max(0, this.centerFreqKhz - this.spanKhz / 2);
      const spanF = this.spanKhz;
      for (let j = 0; j <= hDivs; j++) {
        const x = marginL + (gridW / hDivs) * j;
        ctx.beginPath();
        ctx.moveTo(x, marginT);
        ctx.lineTo(x, h - marginB);
        ctx.stroke();

        // Frequency labels in kHz
        const freqVal = startF + (spanF / hDivs) * j;
        ctx.fillStyle = 'rgba(52, 211, 153, 0.6)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${freqVal.toFixed(1)}k`, x, h - 8);
      }

      // Outer Graticule Box
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.strokeRect(marginL, marginT, gridW, gridH);

      // Special Line at 10 KHz (Fundamental Clock Frequency)
      const clockX = marginL + ((10.0 - startF) / spanF) * gridW;
      if (clockX >= marginL && clockX <= w - marginR) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(clockX, marginT);
        ctx.lineTo(clockX, h - marginB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('10k CLK', clockX, marginT + 10);
      }

      // Special Line at 20 KHz (2*Rb First Null for Manchester & RZ)
      const nullX = marginL + ((20.0 - startF) / spanF) * gridW;
      if (nullX >= marginL && nullX <= w - marginR) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(nullX, marginT);
        ctx.lineTo(nullX, h - marginB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('20k NULL', nullX, marginT + 10);
      }

      ctx.restore();
    }

    drawTheoreticalTrace(ctx, w, h) {
      if (!this.theoreticalEnvelope || this.theoreticalEnvelope.length === 0) return;
      const marginL = 45;
      const marginR = 15;
      const marginT = 24;
      const marginB = 24;
      const gridW = w - marginL - marginR;
      const gridH = h - marginT - marginB;

      const totalDbRange = 8 * this.dbPerDiv; // 80 dB

      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();

      const n = this.theoreticalEnvelope.length;
      for (let i = 0; i < n; i++) {
        const pt = this.theoreticalEnvelope[i];
        const x = marginL + (i / (n - 1)) * gridW;
        const normalizedY = (this.refLevelDbm - pt.dbm) / totalDbRange;
        const y = marginT + Math.min(gridH, Math.max(0, normalizedY * gridH));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawFFTTrace(ctx, w, h) {
      if (!this.fftSpectrum || this.fftSpectrum.length === 0) return;
      const marginL = 45;
      const marginR = 15;
      const marginT = 24;
      const marginB = 24;
      const gridW = w - marginL - marginR;
      const gridH = h - marginT - marginB;

      const totalDbRange = 8 * this.dbPerDiv;

      ctx.save();
      // Glowing Cyan Phosphor Line
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const n = this.fftSpectrum.length;
      for (let i = 0; i < n; i++) {
        const pt = this.fftSpectrum[i];
        const x = marginL + (i / (n - 1)) * gridW;
        const normalizedY = (this.refLevelDbm - pt.dbm) / totalDbRange;
        const y = marginT + Math.min(gridH, Math.max(0, normalizedY * gridH));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Translucent phosphor area glow fill
      ctx.lineTo(marginL + gridW, marginT + gridH);
      ctx.lineTo(marginL, marginT + gridH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, marginT, 0, marginT + gridH);
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.18)');
      grad.addColorStop(1, 'rgba(0, 242, 254, 0.01)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.restore();
    }

    drawMarker(ctx, w, h) {
      const marginL = 45;
      const marginR = 15;
      const marginT = 24;
      const marginB = 24;
      const gridW = w - marginL - marginR;
      const gridH = h - marginT - marginB;

      const startF = Math.max(0, this.centerFreqKhz - this.spanKhz / 2);
      const spanF = this.spanKhz;
      const totalDbRange = 8 * this.dbPerDiv;

      const mX = marginL + ((this.marker1.freqKhz - startF) / spanF) * gridW;
      const normY = (this.refLevelDbm - this.marker1.powerDbm) / totalDbRange;
      const mY = marginT + Math.min(gridH, Math.max(0, normY * gridH));

      if (mX >= marginL && mX <= w - marginR) {
        ctx.save();
        ctx.strokeStyle = '#f43f5e';
        ctx.fillStyle = '#f43f5e';
        ctx.lineWidth = 1.5;

        // Inverted Triangle Peak Marker
        ctx.beginPath();
        ctx.moveTo(mX, mY - 8);
        ctx.lineTo(mX - 5, mY - 14);
        ctx.lineTo(mX + 5, mY - 14);
        ctx.closePath();
        ctx.fill();

        // Marker crosshair dot
        ctx.beginPath();
        ctx.arc(mX, mY, 3, 0, 2 * Math.PI);
        ctx.stroke();

        // Marker Readout Flag
        ctx.font = '10px "JetBrains Mono", monospace';
        const label = `\u25BC M1: ${this.marker1.freqKhz.toFixed(2)} kHz, ${this.marker1.powerDbm.toFixed(1)} dBm`;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(mX + 6, mY - 26, 170, 16);
        ctx.strokeStyle = '#f43f5e';
        ctx.strokeRect(mX + 6, mY - 26, 170, 16);
        ctx.fillStyle = '#fecdd3';
        ctx.fillText(label, mX + 10, mY - 14);

        ctx.restore();
      }
    }

    drawHUD(ctx, w, h) {
      ctx.save();
      ctx.font = '10px "JetBrains Mono", monospace';

      // Top Left: Model & Center/Span
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`SIGMA RF-122L  SPAN: ${this.spanKhz.toFixed(1)} kHz  RBW: ${this.rbwKhz.toFixed(1)} kHz`, 48, 16);

      // Top Right: Line Code & Word Clock
      const schemeLabels = {
        nrz: 'Polar NRZ',
        nrz_unipolar: 'Unipolar NRZ',
        rz_unipolar: 'Unipolar RZ',
        bipolar_rz: 'Polar RZ',
        ami: 'Bipolar NRZ (AMI)',
        manchester: 'Bi-phase Manchester',
      };
      const label = schemeLabels[this.scheme.toLowerCase()] || this.scheme.toUpperCase();

      ctx.fillStyle = '#34d399';
      ctx.textAlign = 'right';
      ctx.fillText(`F_CLK: 10.0 kHz  \u2022  ${label}`, w - 18, 16);

      ctx.restore();
    }
  }

  window.SpectrumAnalyzer = SpectrumAnalyzer;
})(window);
