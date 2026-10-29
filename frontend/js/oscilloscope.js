/**
 * DigiWave X — Virtual CRT Digital Storage Oscilloscope (DSO) Engine
 * Canvas 2D with phosphor persistence, CRT grid reticle, dual-trace & bit boundaries.
 * Supports:
 * 1. Digital Line Coding Time-Domain (NRZ, RZ, AMI, Manchester)
 * 2. Analog Amplitude Modulation Time-Domain (Modulated Carrier, Envelope, Emax/Emin)
 * 3. CRO Trapezoidal Display (X-Y Mode) with L1/L2 Dimension Readouts (Philips OS-9020B)
 */

(function (window) {
  'use strict';

  class Oscilloscope {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      // Oscilloscope Settings
      this.timebaseMs = 1.0; // ms / div
      this.voltsPerDiv = 1.0; // V / div
      this.offsetY = 0;
      this.isRunning = true;
      this.showCh1 = true;
      this.showCh2 = true;
      this.showGrid = true;
      this.showBitMarkers = true;

      // Operating Mode: 'digital' or 'am'
      this.signalType = 'digital';
      this.displayMode = 'time'; // 'time' or 'xy' (Trapezoid mode)

      // Digital Waveform Data
      this.ch1Data = []; // Raw bits reference
      this.ch2Data = []; // Encoded waveform samples
      this.bits = [];
      this.samplesPerBit = 2;
      this.voltage = 1.0;

      // AM Waveform Data
      this.amData = null;

      // Animation & Phosphor
      this.sweepX = 0;
      this.lastTimestamp = 0;
      this.animationFrameId = null;

      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());

      this.startSweep();
    }

    resizeCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = (rect.width || 600) * dpr;
      this.canvas.height = (rect.height || 240) * dpr;
      this.ctx.scale(dpr, dpr);
      this.width = rect.width || 600;
      this.height = rect.height || 240;
      this.draw();
    }

    setWaveforms(ch2Waveform, bits, samplesPerBit = 2, voltage = 1.0) {
      this.signalType = 'digital';
      this.ch2Data = ch2Waveform || [];
      this.bits = bits || [];
      this.samplesPerBit = samplesPerBit;
      this.voltage = voltage;

      // Construct reference binary step signal for CH1
      this.ch1Data = [];
      for (const b of this.bits) {
        for (let s = 0; s < this.samplesPerBit; s++) {
          this.ch1Data.push(b === 1 ? 1.0 : 0.0);
        }
      }

      this.draw();
    }

    setAMData(amData, displayMode = 'time') {
      this.signalType = 'am';
      this.amData = amData;
      this.displayMode = displayMode;
      this.draw();
    }

    setDisplayMode(mode) {
      this.displayMode = mode;
      this.draw();
    }

    startSweep() {
      const animate = () => {
        if (this.isRunning) {
          this.sweepX = (this.sweepX + 4) % (this.width || 600);
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
      const ctx = this.ctx;
      const w = this.width || 600;
      const h = this.height || 240;

      // Clear Screen with deep CRT phosphor background
      ctx.fillStyle = '#030806';
      ctx.fillRect(0, 0, w, h);

      if (this.showGrid) {
        this.drawCRTGrid(ctx, w, h);
      }

      // 1. Analog AM Modulation Mode
      if (this.signalType === 'am' && this.amData) {
        if (this.displayMode === 'xy') {
          this.drawTrapezoid(ctx, w, h);
        } else {
          this.drawAMWave(ctx, w, h);
        }
        return;
      }

      // 2. Digital Line Coding Mode
      if (this.bits.length > 0 && this.showBitMarkers) {
        this.drawBitBoundaries(ctx, w, h);
      }

      const centerY = h / 2 + this.offsetY;
      const scaleY = (h / 6) / this.voltsPerDiv;

      // Draw Channel 1 (Reference Bitstream in Cyan)
      if (this.showCh1 && this.ch1Data.length > 0) {
        this.drawTrace(ctx, this.ch1Data, '#00e5ff', centerY - 45, scaleY * 0.5, 'dashed');
      }

      // Draw Channel 2 (Line Encoded Waveform in Phosphor Green)
      if (this.showCh2 && this.ch2Data.length > 0) {
        this.drawTrace(ctx, this.ch2Data, '#00ff88', centerY + 20, scaleY, 'solid');
      }

      // Draw Beam Sweep Cursor
      if (this.isRunning) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.sweepX, 0);
        ctx.lineTo(this.sweepX, h);
        ctx.stroke();
      }
    }

    drawAMWave(ctx, w, h) {
      if (!this.amData || !this.amData.timeWaveform) return;
      const tw = this.amData.timeWaveform;
      const numPts = tw.amWave.length;
      if (numPts < 2) return;

      const centerY = h / 2 + this.offsetY;
      // Fit max expected amplitude (up to ~12V) into half screen height
      const maxV = Math.max(8.0, (this.amData.Ec + this.amData.Em) * 1.25);
      const scaleY = (h * 0.42) / maxV;
      const stepX = w / (numPts - 1);

      ctx.save();

      // Dotted horizontal baseline (0V)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      // Dotted lines for +Emax and -Emax
      const yEmax = centerY - this.amData.Emax * scaleY;
      const yEmin = centerY - this.amData.Emin * scaleY;
      const yNegEmax = centerY + this.amData.Emax * scaleY;
      const yNegEmin = centerY + this.amData.Emin * scaleY;

      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)'; // Yellow reference
      ctx.beginPath();
      ctx.moveTo(0, yEmax); ctx.lineTo(w, yEmax);
      ctx.moveTo(0, yNegEmax); ctx.lineTo(w, yNegEmax);
      ctx.stroke();

      if (this.amData.m <= 1.0 && this.amData.Emin > 0.05) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; // Cyan reference
        ctx.beginPath();
        ctx.moveTo(0, yEmin); ctx.lineTo(w, yEmin);
        ctx.moveTo(0, yNegEmin); ctx.lineTo(w, yNegEmin);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // 1. Draw Modulating Audio Signal em(t) (CH1 in Cyan Dashed)
      if (this.showCh1) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (let i = 0; i < numPts; i++) {
          const x = i * stepX;
          const y = centerY - tw.modulating[i] * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. Draw Envelopes (Upper and Lower in Amber Neon)
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);

      // Upper Envelope
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const x = i * stepX;
        const y = centerY - tw.envUpper[i] * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Lower Envelope
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const x = i * stepX;
        const y = centerY - tw.envLower[i] * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Draw Modulated AM Carrier Waveform (CH2 in Phosphor Green with Glow)
      if (this.showCh2) {
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < numPts; i++) {
          const x = i * stepX;
          const y = centerY - tw.amWave[i] * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // On-Screen HUD Annotations
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';

      // Emax / Emin markers
      ctx.fillStyle = '#facc15';
      ctx.fillText(`+Emax = ${(this.amData.Emax).toFixed(2)}V`, 12, Math.max(18, yEmax - 4));
      if (this.amData.m <= 1.0) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`+Emin = ${(this.amData.Emin).toFixed(2)}V`, 12, yEmin - 4);
      }

      // Beam Sweep Cursor
      if (this.isRunning) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.sweepX, 0);
        ctx.lineTo(this.sweepX, h);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawTrapezoid(ctx, w, h) {
      if (!this.amData) return;
      const d = this.amData;
      const cx = w / 2;
      const cy = h / 2 + this.offsetY;

      // Coordinate scaling: X spans modulating amplitude Em, Y spans max carrier + Em (Emax)
      const maxEm = Math.max(1.0, d.Em);
      const maxEmax = Math.max(2.0, d.Emax);

      // Fit into 65% of screen width and 75% of screen height
      const scaleX = (w * 0.32) / Math.max(3.0, maxEm);
      const scaleY = (h * 0.38) / Math.max(5.0, maxEmax);

      const xRight = cx + d.Em * scaleX;
      const xLeft = cx - d.Em * scaleX;

      const yRightTop = cy - d.Emax * scaleY;
      const yRightBottom = cy + d.Emax * scaleY;
      const yLeftTop = cy - d.Emin * scaleY;
      const yLeftBottom = cy + d.Emin * scaleY;

      ctx.save();

      // CRT X-Y Axes with Crosshairs
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      // Horizontal X-axis
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      // Vertical Y-axis
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
      ctx.setLineDash([]);

      // Axis Labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('+X (Modulating Audio em)', w - 160, cy - 8);
      ctx.fillText('-X (-em)', 12, cy - 8);
      ctx.fillText('+Y (AM Carrier eam)', cx + 8, 18);
      ctx.fillText('-Y (-eam)', cx + 8, h - 10);

      // 1. Draw High-Density Interior Lissajous Raster Lines (Simulating RF Carrier sweep in X-Y)
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.12)';
      ctx.lineWidth = 1;
      const numRasters = 48;
      for (let i = 0; i <= numRasters; i++) {
        const frac = i / numRasters;
        const x = xLeft + frac * (xRight - xLeft);
        // Modulating voltage at this x
        const emAtX = -d.Em + frac * (2 * d.Em);
        const instAmp = d.rfLink === 'closed_dsbfc' ? (d.Ec + emAtX) : emAtX;
        const currentYPeak = Math.abs(instAmp) * scaleY;

        ctx.beginPath();
        ctx.moveTo(x, cy - currentYPeak);
        ctx.lineTo(x, cy + currentYPeak);
        ctx.stroke();
      }

      // 2. Draw Outer Solid Perimeter & Shading
      if (d.m < 0.001) {
        // Pure unmodulated carrier -> Vertical Rectangle / Ribbon
        ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        const rectW = 20;
        ctx.fillRect(cx - rectW / 2, cy - d.Ec * scaleY, rectW, 2 * d.Ec * scaleY);
        ctx.strokeRect(cx - rectW / 2, cy - d.Ec * scaleY, rectW, 2 * d.Ec * scaleY);
      } else if (d.m <= 1.0) {
        // Standard Trapezoid or Critical Triangle (m = 1.0)
        ctx.fillStyle = 'rgba(0, 255, 136, 0.18)';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(xLeft, yLeftTop);
        ctx.lineTo(xRight, yRightTop);
        ctx.lineTo(xRight, yRightBottom);
        ctx.lineTo(xLeft, yLeftBottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // If critical modulation (m = 1), highlight the zero-pinch vertex
        if (d.m >= 0.95 && d.m <= 1.05) {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(xLeft, cy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Over-modulation (m > 1.0) -> Crossed Bow-Tie Pattern!
        // Intersection occurs at xCross where Ec + em = 0 -> em = -Ec
        const xCross = cx + (-d.Ec) * scaleX;
        const yCrossLeftTop = cy - (d.Em - d.Ec) * scaleY;
        const yCrossLeftBottom = cy + (d.Em - d.Ec) * scaleY;

        // Main positive lobe (right side of cross-over)
        ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(xCross, cy);
        ctx.lineTo(xRight, yRightTop);
        ctx.lineTo(xRight, yRightBottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inverted negative lobe (left side of cross-over - crossed bow-tie)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'; // Amber/Red glow for overmodulation lobe
        ctx.strokeStyle = '#f87171';
        ctx.beginPath();
        ctx.moveTo(xCross, cy);
        ctx.lineTo(xLeft, yCrossLeftTop);
        ctx.lineTo(xLeft, yCrossLeftBottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Highlight cross-over waist
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(xCross, cy, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText('180° Inversion Waist', xCross - 65, cy - 14);
      }
      ctx.shadowBlur = 0;

      // 3. Draw Dimension Arrows for L1 and L2 (From PICT Lab Manual Fig. 3)
      // Right vertical dimension arrow (L1 = 2·Emax)
      const arrowOffsetX = 24;
      const dimL1X = xRight + arrowOffsetX;
      this.drawDimensionArrow(ctx, dimL1X, yRightTop, dimL1X, yRightBottom, `L1 = ${(d.L1).toFixed(2)}V (2·Emax)`, '#facc15');

      // Left vertical dimension arrow (L2 = 2·Emin)
      if (d.m < 1.0 && d.L2 > 0.1) {
        const dimL2X = xLeft - arrowOffsetX;
        this.drawDimensionArrow(ctx, dimL2X, yLeftTop, dimL2X, yLeftBottom, `L2 = ${(d.L2).toFixed(2)}V (2·Emin)`, '#38bdf8');
      } else if (d.m >= 0.95 && d.m <= 1.05) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText('L2 = 0V (Apex)', xLeft - 95, cy + 4);
      } else if (d.m > 1.0) {
        const invertedL2 = 2.0 * (d.Em - d.Ec);
        const dimL2X = xLeft - arrowOffsetX;
        this.drawDimensionArrow(ctx, dimL2X, cy - invertedL2 * scaleY / 2, dimL2X, cy + invertedL2 * scaleY / 2, `L2 (Inv) = ${(invertedL2).toFixed(2)}V`, '#f87171');
      }

      // 4. On-Screen Mathematical CRO Badge (Top Right)
      const badgeW = 280;
      const badgeH = 74;
      const badgeX = w - badgeW - 14;
      const badgeY = 14;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('CRO X-Y TRAPEZOIDAL METHOD', badgeX + 10, badgeY + 18);

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`m = (L1 - L2) / (L1 + L2) = ${(d.mTrapezoidal).toFixed(3)}`, badgeX + 10, badgeY + 38);

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = d.m < 1.0 ? '#34d399' : (Math.abs(d.m - 1.0) <= 0.05 ? '#facc15' : '#ef4444');
      ctx.fillText(`Shape: ${d.patternDesc.split('(')[0].trim().toUpperCase()}`, badgeX + 10, badgeY + 58);

      ctx.restore();
    }

    drawDimensionArrow(ctx, x1, y1, x2, y2, label, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.4;

      // Guide line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Top arrow
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 4, y1 + 8);
      ctx.lineTo(x1 + 4, y1 + 8);
      ctx.closePath();
      ctx.fill();

      // Bottom arrow
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 4, y2 - 8);
      ctx.lineTo(x2 + 4, y2 - 8);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(label);
      const midY = (y1 + y2) / 2;
      ctx.fillText(label, x1 + 6, midY + 4);

      ctx.restore();
    }

    drawCRTGrid(ctx, w, h) {
      const divsX = 10;
      const divsY = 8;
      const stepX = w / divsX;
      const stepY = h / divsY;

      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.lineWidth = 1;

      // Vertical Grid Lines
      for (let x = 0; x <= w; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Horizontal Grid Lines
      for (let y = 0; y <= h; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Center Major Axes with subdivision tick marks
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.lineWidth = 1.2;

      // Center horizontal axis
      const midY = h / 2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      // Center vertical axis
      const midX = w / 2;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();

      // Tick marks on center axes
      const tickSize = 3;
      for (let x = 0; x <= w; x += stepX / 5) {
        ctx.beginPath();
        ctx.moveTo(x, midY - tickSize);
        ctx.lineTo(x, midY + tickSize);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += stepY / 5) {
        ctx.beginPath();
        ctx.moveTo(midX - tickSize, y);
        ctx.lineTo(midX + tickSize, y);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawBitBoundaries(ctx, w, h) {
      if (this.bits.length === 0) return;
      const bitWidth = w / this.bits.length;

      ctx.save();
      for (let i = 0; i < this.bits.length; i++) {
        const x = i * bitWidth;

        // Bit boundary vertical line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bit label at the top
        ctx.fillStyle = this.bits[i] === 1 ? '#34d399' : '#94a3b8';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`b${i}:${this.bits[i]}`, x + bitWidth / 2, 16);
      }

      // Final boundary
      ctx.beginPath();
      ctx.moveTo(w, 0);
      ctx.lineTo(w, h);
      ctx.stroke();

      ctx.restore();
    }

    drawTrace(ctx, data, color, centerY, scaleY, style = 'solid') {
      if (!data || data.length === 0) return;

      const nSamples = data.length;
      const stepX = this.width / nSamples;

      ctx.save();

      // CRT Phosphor Glow Layer
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = style === 'dashed' ? 1.5 : 2.5;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2;

      if (style === 'dashed') {
        ctx.setLineDash([4, 4]);
      }

      ctx.beginPath();
      let prevX = 0;
      let prevY = centerY - data[0] * scaleY;
      ctx.moveTo(prevX, prevY);

      for (let i = 0; i < nSamples; i++) {
        const x = i * stepX;
        const nextX = (i + 1) * stepX;
        const y = centerY - data[i] * scaleY;

        // Square wave step transitions
        ctx.lineTo(x, y);
        ctx.lineTo(nextX, y);
      }

      ctx.stroke();
      ctx.restore();
    }
  }

  window.Oscilloscope = Oscilloscope;
})(window);
