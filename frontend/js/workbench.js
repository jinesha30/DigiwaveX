/**
 * DigiWave X — Interactive Virtual Trainer Kit & SVG Patch Bay Engine
 * SIGMA MODEL COM122L: Study of Line Codes & Their Spectral Analysis
 * Real-time port-to-port wiring, dynamic colorful Bézier patch cords, and deterministic connection verification.
 */

(function (window) {
  'use strict';

  class Workbench {
    constructor(overlaySvgId, options = {}) {
      this.svg = document.getElementById(overlaySvgId);
      this.container = this.svg ? this.svg.parentElement : null;
      this.onWiringChange = options.onWiringChange || null;

      // Base required connections for line coding experiment
      this.requiredConnections = [
        { from: 'source.out', to: 'encoder.in' },
        { from: 'encoder.out', to: 'scope.in' },
      ];

      // Line Coding scheme mapping for physical kit terminals
      this.schemeMap = {
        'line_ami_bipolar': 'ami',
        'line_nrz_unipolar': 'nrz_unipolar',
        'line_nrz_m': 'nrzm',
        'line_nrz_bipolar': 'nrz',
        'line_rz_unipolar': 'rz_unipolar',
        'line_rz_bipolar': 'bipolar_rz',
        'line_biphase_manchester': 'manchester',
        'line_biphase_mark': 'manchester',
        'encoder.out': null,
      };

      this.schemeToPortMap = {
        'ami': 'line_ami_bipolar',
        'nrz_unipolar': 'line_nrz_unipolar',
        'nrzm': 'line_nrz_m',
        'nrz': 'line_nrz_bipolar',
        'rz_unipolar': 'line_rz_unipolar',
        'bipolar_rz': 'line_rz_bipolar',
        'manchester': 'line_biphase_manchester',
      };

      this.experimentId = 'line_coding';
      this.viewMode = 'physical'; // 'physical' or 'blocks'
      this.lastProbedPort = 'line_ami_bipolar';

      // Default active connections on board power up (probing AMI Bipolar by default)
      this.connections = [
        { from: 'line_ami_bipolar', to: 'scope.in' },
        { from: 'gen_ck', to: 'scope.ch1_in' },
        { from: 'line_ami_bipolar', to: 'dec_ip' },
        { from: 'line_ami_bipolar', to: 'spectrum.in' },
      ];

      this.selectedPort = null;
      this.initEvents();
      this.renderWires();

      window.addEventListener('resize', () => this.renderWires());
    }

    setExperiment(expId) {
      this.experimentId = expId;
      if (expId === 'am_modulation') {
        this.connections = [
          { from: 'audio_sine_out', to: 'mod_ip' },
          { from: 'rf_osc_out', to: 'carrier_ip' },
          { from: 'am_mod_out', to: 'scope.in' },
          { from: 'audio_sine_out', to: 'scope.ch1_in' },
          { from: 'am_mod_out', to: 'spectrum.in' },
          { from: 'am_mod_out', to: 'am_det_in' },
        ];
      } else {
        const probedPort = this.lastProbedPort || 'line_ami_bipolar';
        this.connections = [
          { from: probedPort, to: 'scope.in' },
          { from: 'gen_ck', to: 'scope.ch1_in' },
          { from: probedPort, to: 'dec_ip' },
          { from: probedPort, to: 'spectrum.in' },
        ];
      }
      this.renderWires();
      this.notifyChange();
    }

    setViewMode(mode) {
      this.viewMode = mode;
      if (this.experimentId === 'am_modulation') {
        this.setExperiment('am_modulation');
        return;
      }
      if (mode === 'blocks') {
        this.connections = [];
      } else {
        const probedPort = this.lastProbedPort || 'line_ami_bipolar';
        this.connections = [
          { from: probedPort, to: 'scope.in' },
          { from: 'gen_ck', to: 'scope.ch1_in' },
          { from: probedPort, to: 'dec_ip' },
          { from: probedPort, to: 'spectrum.in' },
        ];
      }
      this.renderWires();
      this.notifyChange();
    }

    findJackElement(portId) {
      if (!portId) return null;
      let target = portId;

      if (this.experimentId === 'am_modulation') {
        if (target === 'cro.ch1_x') target = 'scope.ch1_in';
        if (target === 'cro.ch2_y') target = 'scope.in';
      } else {
        // Aliasing fallback if lingering connections exist across mode toggles
        if (this.viewMode === 'blocks') {
          if (target.startsWith('line_')) target = 'encoder.out';
          else if (target === 'gen_ck') target = 'clock.out';
          else if (target === 'dec_ip') target = 'decoder.in';
        } else if (this.viewMode === 'physical') {
          if (target === 'encoder.out') target = this.lastProbedPort || 'line_ami_bipolar';
          else if (target === 'clock.out') target = 'gen_ck';
        }
      }

      const elements = Array.from(document.querySelectorAll(`[data-port="${target}"]`));
      if (elements.length === 0) return null;

      // Filter to elements that are currently visible (non-zero bounding box)
      const visible = elements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (visible.length === 0) return null;
      if (visible.length === 1) return visible[0];

      // Disambiguate when multiple visible elements exist
      if (this.experimentId === 'am_modulation') {
        if (this.viewMode === 'blocks') {
          const blockJack = visible.find(el => el.closest('#circuitBlocksGridAM'));
          if (blockJack) return blockJack;
        } else {
          const amJack = visible.find(el => el.closest('#physicalTrainerChassisAM'));
          if (amJack) return amJack;
        }
      } else if (this.viewMode === 'blocks') {
        const blockJack = visible.find(el => el.closest('#circuitBlocksGrid'));
        if (blockJack) return blockJack;
      } else {
        const physJack = visible.find(el => el.closest('#physicalTrainerChassis'));
        if (physJack) return physJack;
      }

      return visible[0];
    }

    initEvents() {
      // Listen to clicks on banana jacks / physical ports
      document.addEventListener('click', (e) => {
        const portEl = e.target.closest('[data-port]');
        if (!portEl) return;

        // Skip switches or non-jack elements
        if (!portEl.classList.contains('banana-jack') && !portEl.classList.contains('physical-jack')) {
          return;
        }

        const portId = portEl.getAttribute('data-port');
        if (!portId) return;

        this.handlePortClick(portId, portEl);
      });
    }

    handlePortClick(portId, portEl) {
      if (!this.selectedPort) {
        // Direct click on a line coding output immediately switches execution to that line code
        if (portEl.classList.contains('line-code-jack')) {
          this.probeLineCode(portId);
          return;
        }

        // First port selected for custom patching
        this.selectedPort = { id: portId, el: portEl };
        portEl.classList.add('port-selected');
      } else {
        // Second port selected -> create connection
        const firstPort = this.selectedPort.id;
        const secondPort = portId;

        this.selectedPort.el.classList.remove('port-selected');
        this.selectedPort = null;

        if (firstPort === secondPort) {
          return;
        }

        this.addConnection(firstPort, secondPort);
      }
    }

    probeLineCode(linePortId) {
      this.lastProbedPort = linePortId;

      // In blocks mode, execution format is driven by dropdown/chips
      if (this.viewMode === 'blocks') {
        this.notifyChange();
        return;
      }

      // Re-route DSO CH2 (scope.in), Spectrum (spectrum.in), and DEC IN (dec_ip) to this line code output
      this.connections = this.connections.filter(c => 
        c.to !== 'scope.in' && c.from !== 'scope.in' &&
        c.to !== 'spectrum.in' && c.from !== 'spectrum.in' &&
        c.to !== 'dec_ip' && c.from !== 'dec_ip' &&
        c.to !== 'decoder.in' && c.from !== 'decoder.in'
      );
      this.connections.push({ from: linePortId, to: 'scope.in' });
      this.connections.push({ from: linePortId, to: 'spectrum.in' });
      this.connections.push({ from: linePortId, to: 'dec_ip' });

      // Ensure CH1 master clock is connected to scope.ch1_in
      const hasClock = this.connections.some(c => 
        (c.from === 'gen_ck' && c.to === 'scope.ch1_in') ||
        (c.from === 'scope.ch1_in' && c.to === 'gen_ck')
      );
      if (!hasClock) {
        this.connections.push({ from: 'gen_ck', to: 'scope.ch1_in' });
      }

      this.renderWires();
      this.notifyChange();
    }

    addConnection(fromPort, toPort) {
      // Single-input probe dock jacks only accept one wire at a time (like physical BNC jacks)
      const singleInputs = ['scope.in', 'scope.ch1_in', 'spectrum.in', 'dec_ip', 'decoder.in'];
      singleInputs.forEach(instPort => {
        if (fromPort === instPort || toPort === instPort) {
          this.connections = this.connections.filter(c => c.from !== instPort && c.to !== instPort);
        }
      });

      const exists = this.connections.some(
        c => (c.from === fromPort && c.to === toPort) || (c.from === toPort && c.to === fromPort)
      );

      if (!exists) {
        this.connections.push({ from: fromPort, to: toPort });
        this.renderWires();
        this.notifyChange();
      }
    }

    removeConnection(index) {
      if (index >= 0 && index < this.connections.length) {
        this.connections.splice(index, 1);
        this.renderWires();
        this.notifyChange();
      }
    }

    clearWires() {
      this.connections = [];
      this.renderWires();
      this.notifyChange();
    }

    autoWire() {
      if (this.experimentId === 'am_modulation') {
        this.setExperiment('am_modulation');
      } else {
        this.setViewMode(this.viewMode);
      }
    }

    validateWiring() {
      if (this.experimentId === 'am_modulation') {
        const present = new Set(this.connections.map(c => `${c.from}->${c.to}`));
        this.connections.forEach(c => present.add(`${c.to}->${c.from}`));

        const isAudioConnected = present.has('audio_sine_out->mod_ip') || present.has('mod_ip->audio_sine_out');
        const isCarrierConnected = present.has('rf_osc_out->carrier_ip') || present.has('carrier_ip->rf_osc_out');
        const isScopeConnected = present.has('am_mod_out->scope.in') || present.has('scope.in->am_mod_out') ||
                                 present.has('am_mod_out->scope.ch2_in') || present.has('scope.ch2_in->am_mod_out');
        const isDetectorConnected = present.has('am_mod_out->am_det_in') || present.has('am_det_in->am_mod_out');
        const isSpectrumConnected = present.has('am_mod_out->spectrum.in') || present.has('spectrum.in->am_mod_out');

        const isValid = isAudioConnected && isCarrierConnected && isScopeConnected;

        return {
          isValid: isValid,
          isSourceConnected: isAudioConnected && isCarrierConnected,
          isScopeConnected: isScopeConnected,
          isDecoderConnected: isDetectorConnected,
          isSpectrumConnected: isSpectrumConnected,
          isClockConnected: true,
          probedScheme: 'AM_DSB_FC',
          connectionsCount: this.connections.length,
        };
      }

      if (this.viewMode === 'blocks') {
        return {
          isValid: true,
          isSourceConnected: true,
          isScopeConnected: true,
          isDecoderConnected: true,
          isSpectrumConnected: true,
          isClockConnected: true,
          probedScheme: null,
          connectionsCount: 0,
        };
      }

      const present = new Set(this.connections.map(c => `${c.from}->${c.to}`));
      this.connections.forEach(c => present.add(`${c.to}->${c.from}`));

      let probedScheme = null;
      let isScopeConnected = false;
      let isDecoderConnected = false;
      let isSpectrumConnected = false;

      // Physical Kit validation
      const lineOuts = Object.keys(this.schemeMap);
      for (const lineOut of lineOuts) {
        if (present.has(`${lineOut}->scope.in`) || present.has(`scope.in->${lineOut}`) ||
            present.has(`${lineOut}->scope.ch2_in`) || present.has(`scope.ch2_in->${lineOut}`)) {
          isScopeConnected = true;
          if (this.schemeMap[lineOut]) {
            probedScheme = this.schemeMap[lineOut];
          }
        }
        if (present.has(`${lineOut}->decoder.in`) || present.has(`decoder.in->${lineOut}`) ||
            present.has(`${lineOut}->dec_ip`) || present.has(`dec_ip->${lineOut}`)) {
          isDecoderConnected = true;
        }
        if (present.has(`${lineOut}->spectrum.in`) || present.has(`spectrum.in->${lineOut}`)) {
          isSpectrumConnected = true;
        }
      }
      const isSourceConnected = true; // On physical PCB, generator is internally hardwired to line encoder
      const isClockConnected = present.has('gen_ck->scope.ch1_in') || present.has('scope.ch1_in->gen_ck');

      const isValid = isScopeConnected || isSpectrumConnected || isDecoderConnected;

      return {
        isValid: isValid,
        isSourceConnected: isSourceConnected,
        isScopeConnected: isScopeConnected,
        isDecoderConnected: isDecoderConnected,
        isSpectrumConnected: isSpectrumConnected,
        isClockConnected: isClockConnected,
        probedScheme: probedScheme,
        connectionsCount: this.connections.length,
      };
    }

    notifyChange() {
      const status = this.validateWiring();
      if (this.onWiringChange) {
        this.onWiringChange(this.connections, status);
      }
    }

    renderWires() {
      if (!this.svg || !this.container) return;

      // In blocks mode, circuit connections are internal to the PCB schematic blocks (no loose patch bay cords)
      if (this.viewMode === 'blocks') {
        while (this.svg.firstChild) {
          this.svg.removeChild(this.svg.firstChild);
        }
        document.querySelectorAll('.banana-jack, .physical-jack').forEach(el => el.classList.remove('port-active'));
        document.querySelectorAll('.line-code-jack').forEach(el => el.classList.remove('active-probed'));
        return;
      }

      const containerRect = this.container.getBoundingClientRect();
      this.svg.setAttribute('width', containerRect.width);
      this.svg.setAttribute('height', containerRect.height);

      // Clear existing SVG paths
      while (this.svg.firstChild) {
        this.svg.removeChild(this.svg.firstChild);
      }

      // Reset all port active classes & active-probed
      document.querySelectorAll('.banana-jack, .physical-jack').forEach(el => el.classList.remove('port-active'));
      document.querySelectorAll('.line-code-jack').forEach(el => el.classList.remove('active-probed'));

      // Highlight active probed jack
      if (this.viewMode === 'physical') {
        const probedConn = this.connections.find(c => 
          (c.to === 'scope.in' && c.from.startsWith('line_')) ||
          (c.from === 'scope.in' && c.to.startsWith('line_'))
        );
        if (probedConn) {
          const linePort = probedConn.to === 'scope.in' ? probedConn.from : probedConn.to;
          const probedEl = this.findJackElement(linePort);
          if (probedEl) probedEl.classList.add('active-probed');
        }
      }

      const cordColors = [
        '#38bdf8', // Cyber Cyan
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#ec4899', // Pink
        '#8b5cf6', // Violet
        '#06b6d4', // Teal
      ];

      this.connections.forEach((conn, idx) => {
        const fromEl = this.findJackElement(conn.from);
        const toEl = this.findJackElement(conn.to);

        if (!fromEl || !toEl) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        // Strict guard: NEVER render a wire if either endpoint has 0 dimensions (hidden/collapsed)
        if (fromRect.width === 0 || fromRect.height === 0 || toRect.width === 0 || toRect.height === 0) {
          return;
        }

        fromEl.classList.add('port-active');
        toEl.classList.add('port-active');

        const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
        const y1 = fromRect.top - containerRect.top + fromRect.height / 2;
        const x2 = toRect.left - containerRect.left + toRect.width / 2;
        const y2 = toRect.top - containerRect.top + toRect.height / 2;

        // Natural catenary curve (slight downward droop for realistic laboratory cables)
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sag = Math.min(50, Math.max(15, dist * 0.22));

        const cx1 = x1 + dx * 0.25;
        const cy1 = y1 + dy * 0.25 + sag;
        const cx2 = x1 + dx * 0.75;
        const cy2 = y1 + dy * 0.75 + sag;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);

        const color = cordColors[idx % cordColors.length];
        path.setAttribute('class', 'wire-path');
        path.style.stroke = color;
        path.style.filter = `drop-shadow(0 2px 8px ${color}88)`;
        path.style.strokeWidth = '4px';

        // Clicking a wire path removes it
        path.style.pointerEvents = 'stroke';
        path.style.cursor = 'pointer';
        path.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeConnection(idx);
        });

        this.svg.appendChild(path);
      });
    }
  }

  window.Workbench = Workbench;
})(window);
