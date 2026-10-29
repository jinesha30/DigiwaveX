/**
 * DigiWave X — Main Application Controller
 * Tailored for SIGMA MODEL COM122L: Study of Line Codes & Their Spectral Analysis
 * Coordinates: Virtual CRT DSO, Virtual RF Spectrum Analyzer, 8-Bit Word Generator,
 * 6 Line Coding Formats, Line Decoder, AI Tutor ("Dr. Wave"), and COM122L Training Manual.
 */

(function (window) {
  'use strict';

  class DigiWaveApp {
    constructor() {
      // Application State matching COM122L / COM101N Specifications
      this.state = {
        experimentId: 'line_coding',           // 'line_coding' or 'am_modulation'
        scheme: 'nrz',                         // Line coding scheme
        bits: [1, 0, 1, 1, 0, 0, 1, 0],         // 8-Bit Word Generator default (0xB2)
        voltage: 1.0,                          // Peak voltage
        samplesPerBit: 2,                      // Oversampling
        clockFreqKhz: 10.0,                    // Specification #2: 10 KHz Word Clock
        instrumentMode: 'time',                // 'time' (DSO), 'freq' (Spectrum), 'split' (Dual), 'xy' (Trapezoid)
        activeTab: 'spectral',                 // 'spectral', 'decoding', 'whatif', 'misconceptions', 'dsss', 'am_table'
        powerOn: true,                         // 230V AC Mains Power Switch
        audioEnabled: false,                   // Audio acoustic synth
        Em: 2.5,                               // Audio Modulating Amplitude in Volts (0 - 5.0V)
        fm: 1000.0,                            // Audio Modulating Frequency in Hz (300 - 3400 Hz)
        Ec: 5.0,                               // RF Carrier Amplitude in Volts (0.5 - 10.0V)
        fc: 455000.0,                          // RF Carrier Frequency in Hz (400 - 1000 kHz)
        rfLink: 'closed_dsbfc',                // 'closed_dsbfc' or 'open_dsbsc'
      };

      // Sub-modules
      this.api = new window.ApiClient('http://127.0.0.1:8000');
      this.oscilloscope = new window.Oscilloscope('oscilloscopeCanvas');
      this.spectrumAnalyzer = new window.SpectrumAnalyzer('spectrumCanvas');
      this.workbench = new window.Workbench('wiresOverlay', {
        onWiringChange: (conns, status) => this.onWiringChanged(conns, status),
      });
      this.tutor = new window.TutorController(this.api, this);
      this.walkthrough = new window.JudgeWalkthrough(this);
      window.DigiWaveWalkthrough = this.walkthrough;

      // Audio Synth Context
      this.audioCtx = null;

      this.initUI();
      this.bindEvents();

      // Check URL query parameters for default experiment
      const urlParams = new URLSearchParams(window.location.search);
      const urlExp = urlParams.get('experiment');
      if (urlExp === 'am_modulation') {
        this.switchExperiment('am_modulation');
      } else {
        this.updateSimulation();
      }

      // Ensure wires and canvases are stabilized after DOM render
      setTimeout(() => {
        if (this.workbench) this.workbench.renderWires();
        if (this.oscilloscope) this.oscilloscope.resizeCanvas();
        if (this.spectrumAnalyzer) this.spectrumAnalyzer.resizeCanvas();
      }, 60);
    }

    getState() {
      return {
        ...this.state,
        connections: this.workbench ? this.workbench.connections : [],
      };
    }

    initUI() {
      this.renderHardwareSwitches();
      this.renderSpectralTable();
      this.renderMisconceptions();
      this.setupDSSS();

      // Hook API health callback
      this.api.onStatusChange = (status) => {
        const pill = document.getElementById('backendStatusPill');
        const text = document.getElementById('backendStatusText');
        const dot = document.getElementById('backendStatusDot');

        if (status.online) {
          pill.className = 'backend-status-pill badge-green';
          text.textContent = status.gemini ? 'FastAPI + Gemini 2.5' : 'FastAPI Engine Connected';
          dot.className = 'status-dot active-green';
        } else {
          pill.className = 'backend-status-pill';
          text.textContent = 'Client Oracle Mode (Offline Safe)';
          dot.className = 'status-dot active-cyan';
        }
      };
    }

    bindEvents() {
      // 00. Master Experiment Selector (Line Coding vs AM Modulation)
      const expSelect = document.getElementById('experimentSelect');
      if (expSelect) {
        expSelect.addEventListener('change', (e) => {
          this.switchExperiment(e.target.value);
        });
      }

      // AM Modulation Trainer Kit Interactive Controls (SIGMA MODEL COM101N)
      const amAudioFreqSlider = document.getElementById('amAudioFreqSlider');
      if (amAudioFreqSlider) {
        amAudioFreqSlider.addEventListener('input', (e) => {
          this.state.fm = parseFloat(e.target.value);
          const lbl = document.getElementById('amAudioFreqVal');
          if (lbl) lbl.textContent = (this.state.fm / 1000).toFixed(2) + ' kHz';
          this.updateSimulation();
        });
      }

      const amAudioAmpSlider = document.getElementById('amAudioAmpSlider');
      if (amAudioAmpSlider) {
        amAudioAmpSlider.addEventListener('input', (e) => {
          this.state.Em = parseFloat(e.target.value);
          const lbl = document.getElementById('amAudioAmpVal');
          if (lbl) lbl.textContent = this.state.Em.toFixed(2) + ' V';
          this.updateSimulation();
        });
      }

      const amRfFreqSlider = document.getElementById('amRfFreqSlider');
      if (amRfFreqSlider) {
        amRfFreqSlider.addEventListener('input', (e) => {
          this.state.fc = parseFloat(e.target.value) * 1000;
          const lbl = document.getElementById('amRfFreqVal');
          if (lbl) lbl.textContent = (this.state.fc / 1000).toFixed(0) + ' kHz';
          this.updateSimulation();
        });
      }

      const amRfAmpSlider = document.getElementById('amRfAmpSlider');
      if (amRfAmpSlider) {
        amRfAmpSlider.addEventListener('input', (e) => {
          this.state.Ec = parseFloat(e.target.value);
          const lbl = document.getElementById('amRfAmpVal');
          if (lbl) lbl.textContent = this.state.Ec.toFixed(2) + ' V';
          this.updateSimulation();
        });
      }

      const amRfLinkSelect = document.getElementById('amRfLinkSelect');
      const amPhysicalRfLink = document.getElementById('amPhysicalRfLink');

      const setRfLinkState = (val) => {
        this.state.rfLink = val;
        if (amRfLinkSelect) amRfLinkSelect.value = val;
        if (amPhysicalRfLink) {
          amPhysicalRfLink.classList.toggle('closed', val === 'closed_dsbfc');
          amPhysicalRfLink.title = val === 'closed_dsbfc'
            ? 'RF LINK: CLOSED (DSB-FC Standard AM) — Click to Open (DSB-SC)'
            : 'RF LINK: OPEN (DSB-SC Carrier Suppressed) — Click to Close (DSB-FC)';
        }
        this.updateSimulation();
      };

      if (amRfLinkSelect) {
        amRfLinkSelect.addEventListener('change', (e) => setRfLinkState(e.target.value));
      }
      if (amPhysicalRfLink) {
        amPhysicalRfLink.addEventListener('click', () => {
          setRfLinkState(this.state.rfLink === 'closed_dsbfc' ? 'open_dsbsc' : 'closed_dsbfc');
        });
      }

      // Diode Detector Filter Capacitor Selection (OA79 & Low Pass Filter)
      const filterCaps = [0.001, 0.01, 0.047, 0.1];
      let filterCapIdx = 1; // default 0.01 µF
      const amDetFilterBtn = document.getElementById('amDetFilterBtn');
      const amPhysVarC = document.getElementById('amPhysVarC');

      const cycleFilterCap = () => {
        filterCapIdx = (filterCapIdx + 1) % filterCaps.length;
        const capVal = filterCaps[filterCapIdx];
        if (amDetFilterBtn) amDetFilterBtn.textContent = `C = ${capVal} \u03BCF`;
        this.updateSimulation();
      };

      if (amDetFilterBtn) amDetFilterBtn.addEventListener('click', cycleFilterCap);
      if (amPhysVarC) amPhysVarC.addEventListener('click', cycleFilterCap);

      // Diode Polarity Switch
      const amPhysDiodePolarity = document.getElementById('amPhysDiodePolarity');
      if (amPhysDiodePolarity) {
        amPhysDiodePolarity.addEventListener('click', () => {
          amPhysDiodePolarity.classList.toggle('down');
          amPhysDiodePolarity.classList.toggle('up');
          this.updateSimulation();
        });
      }

      // PICT Expt 1 Modulation Presets
      document.querySelectorAll('.am-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.am-preset-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const preset = btn.getAttribute('data-am-preset');
          if (preset === 'm0') {
            this.state.Em = 0.0;
            this.state.Ec = 5.0;
          } else if (preset === 'munder') {
            this.state.Em = 2.5;
            this.state.Ec = 5.0;
          } else if (preset === 'm1') {
            this.state.Em = 5.0;
            this.state.Ec = 5.0;
          } else if (preset === 'mover') {
            this.state.Em = 7.5;
            this.state.Ec = 5.0;
          }

          if (amAudioAmpSlider) amAudioAmpSlider.value = this.state.Em;
          const lblEm = document.getElementById('amAudioAmpVal');
          if (lblEm) lblEm.textContent = this.state.Em.toFixed(2) + ' V';

          if (amRfAmpSlider) amRfAmpSlider.value = this.state.Ec;
          const lblEc = document.getElementById('amRfAmpVal');
          if (lblEc) lblEc.textContent = this.state.Ec.toFixed(2) + ' V';

          this.updateSimulation();
        });
      });

      // Record Active AM Measurement to Table
      const btnRecord = document.getElementById('btnRecordAmRow');
      if (btnRecord) {
        btnRecord.addEventListener('click', () => {
          this.recordActiveAMMeasurement();
        });
      }

      // 0. Physical vs Schematic View Mode Switcher (Compatible with both experiments)
      const btnViewPhysical = document.getElementById('btnViewPhysical');
      const btnViewBlocks = document.getElementById('btnViewBlocks');

      if (btnViewPhysical && btnViewBlocks) {
        btnViewPhysical.addEventListener('click', () => {
          btnViewPhysical.classList.add('active');
          btnViewBlocks.classList.remove('active');
          const probeDock = document.getElementById('probeStationDock');
          const banner = document.getElementById('activeLineCodeBanner');
          const wiresOverlay = document.getElementById('wiresOverlay');
          const physChassis = document.getElementById('physicalTrainerChassis');
          const physChassisAM = document.getElementById('physicalTrainerChassisAM');
          const blocksGrid = document.getElementById('circuitBlocksGrid');
          const blocksGridAM = document.getElementById('circuitBlocksGridAM');

          if (probeDock) probeDock.style.display = 'flex';
          if (wiresOverlay) wiresOverlay.style.display = 'block';

          if (this.state.experimentId === 'am_modulation') {
            if (physChassisAM) physChassisAM.style.display = 'flex';
            if (blocksGridAM) blocksGridAM.style.display = 'none';
            if (physChassis) physChassis.style.display = 'none';
            if (blocksGrid) blocksGrid.style.display = 'none';
            if (banner) banner.style.display = 'none';
          } else {
            if (physChassis) physChassis.style.display = 'flex';
            if (blocksGrid) blocksGrid.style.display = 'none';
            if (physChassisAM) physChassisAM.style.display = 'none';
            if (blocksGridAM) blocksGridAM.style.display = 'none';
            if (banner) banner.style.display = 'flex';
          }

          if (this.workbench) {
            this.workbench.setViewMode('physical');
          }
          this.updateSimulation();
          if (this.oscilloscope) this.oscilloscope.resizeCanvas();
          if (this.spectrumAnalyzer) this.spectrumAnalyzer.resizeCanvas();
        });

        btnViewBlocks.addEventListener('click', () => {
          btnViewBlocks.classList.add('active');
          btnViewPhysical.classList.remove('active');
          const probeDock = document.getElementById('probeStationDock');
          const banner = document.getElementById('activeLineCodeBanner');
          const wiresOverlay = document.getElementById('wiresOverlay');
          const physChassis = document.getElementById('physicalTrainerChassis');
          const physChassisAM = document.getElementById('physicalTrainerChassisAM');
          const blocksGrid = document.getElementById('circuitBlocksGrid');
          const blocksGridAM = document.getElementById('circuitBlocksGridAM');

          if (wiresOverlay) wiresOverlay.style.display = 'block';

          if (this.state.experimentId === 'am_modulation') {
            if (physChassisAM) physChassisAM.style.display = 'none';
            if (blocksGridAM) blocksGridAM.style.display = 'grid';
            if (physChassis) physChassis.style.display = 'none';
            if (blocksGrid) blocksGrid.style.display = 'none';
            if (banner) banner.style.display = 'none';
            if (probeDock) probeDock.style.display = 'flex';
          } else {
            if (physChassis) physChassis.style.display = 'none';
            if (blocksGrid) blocksGrid.style.display = 'grid';
            if (physChassisAM) physChassisAM.style.display = 'none';
            if (blocksGridAM) blocksGridAM.style.display = 'none';
            if (banner) banner.style.display = 'none';
            if (probeDock) probeDock.style.display = 'none';
          }

          if (this.workbench) {
            this.workbench.setViewMode('blocks');
          }
          this.updateSimulation();
          if (this.oscilloscope) this.oscilloscope.resizeCanvas();
          if (this.spectrumAnalyzer) this.spectrumAnalyzer.resizeCanvas();
        });
      }

      // 1. Power Rocker Switch (230V AC 50 Hz) — Both Physical S1 and Schematic UI
      const handlePowerToggle = () => {
        this.state.powerOn = !this.state.powerOn;
        
        // Sync Schematic UI
        const powerBtn = document.getElementById('powerRockerBtn');
        if (powerBtn) {
          powerBtn.classList.toggle('on', this.state.powerOn);
          powerBtn.textContent = this.state.powerOn ? 'POWER: ON' : 'POWER: OFF';
        }
        const pilotLed = document.getElementById('powerPilotLed');
        if (pilotLed) pilotLed.classList.toggle('on', this.state.powerOn);

        // Sync Physical Front Panel S1 and Pilot LED (COM122N)
        const physPower = document.getElementById('physicalPowerToggle');
        if (physPower) physPower.classList.toggle('on', this.state.powerOn);

        const physPowerLed = document.getElementById('physicalPowerLed');
        if (physPowerLed) physPowerLed.classList.toggle('on', this.state.powerOn);

        // Sync Physical Front Panel S1 and Pilot LED (COM101N AM)
        const amPhysPower = document.getElementById('amPhysicalPowerToggle');
        if (amPhysPower) amPhysPower.classList.toggle('on', this.state.powerOn);

        const amPhysPowerLed = document.getElementById('amPhysicalPowerLed');
        if (amPhysPowerLed) amPhysPowerLed.classList.toggle('on', this.state.powerOn);

        this.renderHardwareSwitches();
        this.updateSimulation();
      };

      const powerBtn = document.getElementById('powerRockerBtn');
      if (powerBtn) powerBtn.addEventListener('click', handlePowerToggle);

      const physPower = document.getElementById('physicalPowerToggle');
      if (physPower) physPower.addEventListener('click', handlePowerToggle);

      const amPhysPower = document.getElementById('amPhysicalPowerToggle');
      if (amPhysPower) amPhysPower.addEventListener('click', handlePowerToggle);

      // Physical Front Panel 8-Bit DIP Switch Bank Click Handlers (D8 MSB .. D1 LSB)
      document.querySelectorAll('.physical-dip-switch').forEach(sw => {
        sw.addEventListener('click', () => {
          const bitIdx = parseInt(sw.getAttribute('data-bit-index'), 10);
          if (!isNaN(bitIdx) && bitIdx >= 0 && bitIdx < 8) {
            this.state.bits[bitIdx] = this.state.bits[bitIdx] === 1 ? 0 : 1;
            this.renderHardwareSwitches();
            this.updateSimulation();
          }
        });
      });

      // 2. Instrument Mode Switcher (Time Domain / Frequency Domain / Split View)
      document.querySelectorAll('.inst-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          this.setInstrumentMode(mode);
        });
      });

      // 3. Line Coding Scheme Selector (Dropdown + PCB Buttons)
      const schemeSelect = document.getElementById('schemeSelect');
      if (schemeSelect) {
        schemeSelect.addEventListener('change', (e) => {
          this.setScheme(e.target.value);
        });
      }

      document.querySelectorAll('.format-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const scheme = btn.getAttribute('data-scheme');
          this.setScheme(scheme);
        });
      });

      // 4. Peak Voltage Input
      const voltageInput = document.getElementById('voltageInput');
      if (voltageInput) {
        voltageInput.addEventListener('input', (e) => {
          this.state.voltage = parseFloat(e.target.value) || 1.0;
          this.updateSimulation();
        });
      }

      // 5. 8-Bit Word Presets
      document.querySelectorAll('.pattern-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const pattern = btn.getAttribute('data-pattern');
          if (pattern) {
            this.setBitstream(pattern.split('').map(Number));
          }
        });
      });

      // 6. Oscilloscope Controls
      const runStopBtn = document.getElementById('scopeRunStopBtn');
      if (runStopBtn) {
        runStopBtn.addEventListener('click', () => {
          if (this.oscilloscope.isRunning) {
            this.oscilloscope.stopSweep();
            runStopBtn.textContent = 'RUN';
            runStopBtn.classList.replace('btn-accent', 'btn-outline');
          } else {
            this.oscilloscope.resumeSweep();
            runStopBtn.textContent = 'STOP';
            runStopBtn.classList.replace('btn-outline', 'btn-accent');
          }
        });
      }

      const timebaseInc = document.getElementById('timebaseInc');
      const timebaseDec = document.getElementById('timebaseDec');
      if (timebaseInc && timebaseDec) {
        timebaseInc.addEventListener('click', () => {
          this.oscilloscope.timebaseMs = Math.min(5.0, this.oscilloscope.timebaseMs + 0.5);
          document.getElementById('timebaseVal').textContent = `${this.oscilloscope.timebaseMs.toFixed(1)} ms/div`;
        });
        timebaseDec.addEventListener('click', () => {
          this.oscilloscope.timebaseMs = Math.max(0.2, this.oscilloscope.timebaseMs - 0.2);
          document.getElementById('timebaseVal').textContent = `${this.oscilloscope.timebaseMs.toFixed(1)} ms/div`;
        });
      }

      const voltsInc = document.getElementById('voltsInc');
      const voltsDec = document.getElementById('voltsDec');
      if (voltsInc && voltsDec) {
        voltsInc.addEventListener('click', () => {
          this.oscilloscope.voltsPerDiv = Math.min(3.0, this.oscilloscope.voltsPerDiv + 0.5);
          document.getElementById('voltsDivVal').textContent = `${this.oscilloscope.voltsPerDiv.toFixed(1)} V/div`;
          this.oscilloscope.draw();
        });
        voltsDec.addEventListener('click', () => {
          this.oscilloscope.voltsPerDiv = Math.max(0.5, this.oscilloscope.voltsPerDiv - 0.2);
          document.getElementById('voltsDivVal').textContent = `${this.oscilloscope.voltsPerDiv.toFixed(1)} V/div`;
          this.oscilloscope.draw();
        });
      }

      // 7. Spectrum Analyzer Controls
      document.querySelectorAll('.span-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.span-btn').forEach(b => b.classList.remove('active-chip'));
          btn.classList.add('active-chip');
          const span = parseFloat(btn.getAttribute('data-span')) || 40.0;
          this.spectrumAnalyzer.setSpan(span);
        });
      });

      document.querySelectorAll('.trace-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.trace-btn').forEach(b => b.classList.remove('active-chip'));
          btn.classList.add('active-chip');
          const trace = btn.getAttribute('data-trace') || 'both';
          this.spectrumAnalyzer.setTraceMode(trace);
        });
      });

      const peakHoldBtn = document.getElementById('spectrumPeakHoldBtn');
      if (peakHoldBtn) {
        peakHoldBtn.addEventListener('click', () => {
          this.spectrumAnalyzer.togglePeakHold();
          peakHoldBtn.classList.toggle('active-chip', this.spectrumAnalyzer.peakHold);
        });
      }

      // 8. Auto-Wire & Clear Patch Wires
      const autoWireBtn = document.getElementById('autoWireBtn');
      if (autoWireBtn) {
        autoWireBtn.addEventListener('click', () => {
          this.workbench.autoWire();
        });
      }

      const clearWiresBtn = document.getElementById('clearWiresBtn');
      if (clearWiresBtn) {
        clearWiresBtn.addEventListener('click', () => {
          this.workbench.clearWires();
        });
      }

      // 9. Tabbed Analytical Panels
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchTab(btn.getAttribute('data-tab'));
        });
      });

      // 10. Training Manual Modal (Standard Accessory 1)
      const openManualBtn = document.getElementById('openManualBtn');
      const closeManualBtn = document.getElementById('closeManualBtn');
      const manualModal = document.getElementById('manualModal');

      if (openManualBtn && manualModal) {
        openManualBtn.addEventListener('click', () => {
          manualModal.classList.add('open');
        });
      }
      if (closeManualBtn && manualModal) {
        closeManualBtn.addEventListener('click', () => {
          manualModal.classList.remove('open');
        });
      }

      // Inside Manual Tab Navigation
      document.querySelectorAll('.manual-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.manual-nav-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.getAttribute('data-manual-tab');
          document.querySelectorAll('.manual-tab-content').forEach(p => {
            p.style.display = p.id === `manual-${target}` ? 'block' : 'none';
          });
        });
      });

      // 11. Audio Synth Toggle
      const synthBtn = document.getElementById('audioSynthBtn');
      if (synthBtn) {
        synthBtn.addEventListener('click', () => this.toggleAudio());
      }
    }

    setInstrumentMode(mode) {
      this.state.instrumentMode = mode;
      
      document.querySelectorAll('.inst-tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
      });

      const scopeScreen = document.getElementById('scopeScreenWrapper');
      const spectrumScreen = document.getElementById('spectrumScreenWrapper');
      const scopeControls = document.getElementById('dsoControlsPanel');
      const spectrumControls = document.getElementById('spectrumControlsPanel');
      const scopeTelemetry = document.getElementById('scopeTelemetryStrip');
      const spectrumTelemetry = document.getElementById('spectrumTelemetryStrip');
      const screensGrid = document.getElementById('instrumentScreensGrid');

      if (!scopeScreen || !spectrumScreen) return;

      if (mode === 'xy') {
        screensGrid.className = 'instrument-screens-grid';
        scopeScreen.style.display = 'flex';
        spectrumScreen.style.display = 'none';
        if (scopeControls) scopeControls.style.display = 'none';
        if (spectrumControls) spectrumControls.style.display = 'none';
        if (scopeTelemetry) scopeTelemetry.style.display = 'grid';
        if (spectrumTelemetry) spectrumTelemetry.style.display = 'none';
        this.oscilloscope.setDisplayMode('xy');
        this.oscilloscope.resizeCanvas();
      } else if (mode === 'time') {
        screensGrid.className = 'instrument-screens-grid';
        scopeScreen.style.display = 'flex';
        spectrumScreen.style.display = 'none';
        if (scopeControls) scopeControls.style.display = this.state.experimentId === 'am_modulation' ? 'none' : 'flex';
        if (spectrumControls) spectrumControls.style.display = 'none';
        if (scopeTelemetry) scopeTelemetry.style.display = 'grid';
        if (spectrumTelemetry) spectrumTelemetry.style.display = 'none';
        this.oscilloscope.setDisplayMode('time');
        this.oscilloscope.resizeCanvas();
      } else if (mode === 'freq') {
        screensGrid.className = 'instrument-screens-grid';
        scopeScreen.style.display = 'none';
        spectrumScreen.style.display = 'flex';
        if (scopeControls) scopeControls.style.display = 'none';
        if (spectrumControls) spectrumControls.style.display = 'flex';
        if (scopeTelemetry) scopeTelemetry.style.display = 'none';
        if (spectrumTelemetry) spectrumTelemetry.style.display = 'grid';
        this.spectrumAnalyzer.resizeCanvas();
      } else if (mode === 'split') {
        screensGrid.className = 'instrument-screens-grid split-mode';
        scopeScreen.style.display = 'flex';
        spectrumScreen.style.display = 'flex';
        if (scopeControls) scopeControls.style.display = this.state.experimentId === 'am_modulation' ? 'none' : 'flex';
        if (spectrumControls) spectrumControls.style.display = 'flex';
        if (scopeTelemetry) scopeTelemetry.style.display = 'grid';
        if (spectrumTelemetry) spectrumTelemetry.style.display = 'grid';
        this.oscilloscope.resizeCanvas();
        this.spectrumAnalyzer.resizeCanvas();
      }
    }

    switchTab(tabId) {
      this.state.activeTab = tabId;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
      document.querySelectorAll('.tab-content-panel').forEach(panel => {
        panel.style.display = panel.id === `tab-${tabId}` ? 'block' : 'none';
      });
    }

    switchExperiment(expId) {
      this.state.experimentId = expId;

      // Sync dropdown
      const expSelect = document.getElementById('experimentSelect');
      if (expSelect) expSelect.value = expId;

      const physChassis = document.getElementById('physicalTrainerChassis');
      const physChassisAM = document.getElementById('physicalTrainerChassisAM');
      const blocksGrid = document.getElementById('circuitBlocksGrid');
      const blocksGridAM = document.getElementById('circuitBlocksGridAM');
      const panelViewSwitcher = document.querySelector('.panel-view-switcher');
      const activeLineBanner = document.getElementById('activeLineCodeBanner');
      const brandTitle = document.querySelector('.brand-title');
      const brandSubtitle = document.querySelector('.brand-subtitle');
      const trainerTitleText = document.querySelector('.trainer-title-text');
      const trainerSpecsPills = document.querySelector('.trainer-specs-pills');
      const probeDock = document.getElementById('probeStationDock');
      const probeCh1Label = document.querySelector('.probe-dock-item.ch1 .probe-dock-label span:nth-child(2)');
      const probeCh2Label = document.getElementById('probeCh2Label');
      const probeSpectrumLabel = document.querySelector('.probe-dock-item.spectrum .probe-dock-label span:nth-child(2)');
      const probeDecLabel = document.querySelector('.probe-dock-item.decoder .probe-dock-label span:nth-child(2)');
      const scopeControls = document.getElementById('dsoControlsPanel');

      const isBlocks = this.workbench && this.workbench.viewMode === 'blocks';

      if (expId === 'am_modulation') {
        if (physChassis) physChassis.style.display = 'none';
        if (blocksGrid) blocksGrid.style.display = 'none';
        if (physChassisAM) physChassisAM.style.display = isBlocks ? 'none' : 'flex';
        if (blocksGridAM) blocksGridAM.style.display = isBlocks ? 'grid' : 'none';
        if (panelViewSwitcher) panelViewSwitcher.style.display = 'flex';
        if (activeLineBanner) activeLineBanner.style.display = 'none';
        if (probeDock) probeDock.style.display = 'flex';
        if (scopeControls) scopeControls.style.display = 'none';

        if (brandTitle) brandTitle.textContent = 'COM101N \u2022 AM/DSB/SSB MODULATION & DEMODULATION';
        if (brandSubtitle) brandSubtitle.textContent = 'PICT PCS Practical 1 \u2022 230V AC, 50 Hz \u2022 Audio Gen 8038 \u2022 Modulator 1496 \u2022 Diode OA79';

        if (trainerTitleText) {
          trainerTitleText.innerHTML = `
            <h3>AM / DSB / SSB MODULATION &amp; DEMODULATION TRAINER</h3>
            <span>MODEL - COM101N &bull; PICT PCS EXPERIMENT NO. 1 &bull; 230V AC, 50 Hz</span>
          `;
        }

        if (trainerSpecsPills) {
          trainerSpecsPills.innerHTML = `
            <span class="spec-pill">&#9889; 230V AC, 50 Hz</span>
            <span class="spec-pill">&#127911; Audio: 300 - 3400 Hz</span>
            <span class="spec-pill">&#128225; RF: 455 kHz</span>
            <span class="spec-pill">&#128260; Modulator: IC 1496</span>
            <span class="spec-pill">&#128268; Diode: OA79</span>
            <div class="wiring-validation-pill valid" id="wiringValidationPill">
              <span class="status-dot active-green"></span>
              <span>Circuit Valid</span>
            </div>
          `;
        }

        if (probeCh1Label) probeCh1Label.textContent = 'AF / X-AXIS';
        if (probeCh2Label) probeCh2Label.textContent = 'AM / Y-AXIS';
        if (probeSpectrumLabel) probeSpectrumLabel.textContent = '455 kHz RF';
        if (probeDecLabel) probeDecLabel.textContent = 'OA79 DIODE';

        const instBrandTitle = document.getElementById('instrumentBrandTitle');
        const instBrandSpecs = document.getElementById('instrumentBrandSpecs');
        const wiringEngineBadge = document.getElementById('wiringEngineBadge');
        if (instBrandTitle) instBrandTitle.textContent = 'PHILIPS OS-9020B (20 MHz) & RF SPECTRUM ANALYZER';
        if (instBrandSpecs) instBrandSpecs.innerHTML = 'Dual-Trace CRO &bull; X-Y Trapezoid Mode &bull; 455 kHz RF Spectrum';
        if (wiringEngineBadge) wiringEngineBadge.textContent = 'SIGMA COM101N WIRING ENGINE';

        this.workbench.setExperiment('am_modulation');
        this.switchTab('am_table');
      } else {
        if (physChassisAM) physChassisAM.style.display = 'none';
        if (blocksGridAM) blocksGridAM.style.display = 'none';
        if (physChassis) physChassis.style.display = isBlocks ? 'none' : 'flex';
        if (blocksGrid) blocksGrid.style.display = isBlocks ? 'grid' : 'none';
        if (panelViewSwitcher) panelViewSwitcher.style.display = 'flex';
        if (activeLineBanner) activeLineBanner.style.display = isBlocks ? 'none' : 'flex';
        if (probeDock) probeDock.style.display = isBlocks ? 'none' : 'flex';
        if (scopeControls && this.state.instrumentMode !== 'freq') scopeControls.style.display = 'flex';

        if (brandTitle) brandTitle.textContent = 'COM122L \u2022 STUDY OF LINE CODES & SPECTRAL ANALYSIS';
        if (brandSubtitle) brandSubtitle.textContent = 'Virtual Hardware Laboratory \u2022 230V AC, 50 Hz \u2022 10 KHz Clock';

        if (trainerTitleText) {
          trainerTitleText.innerHTML = `
            <h3>STUDY OF LINE CODES &amp; THEIR SPECTRAL ANALYSIS</h3>
            <span>MODEL - COM122L &bull; DIGITAL COMMUNICATION PRACTICALS</span>
          `;
        }

        if (trainerSpecsPills) {
          trainerSpecsPills.innerHTML = `
            <span class="spec-pill">&#9889; 230V AC, 50 Hz</span>
            <span class="spec-pill">&#128421; 8-Bit Word Generator</span>
            <span class="spec-pill">&#9201; 10 KHz Word Clock</span>
            <div class="wiring-validation-pill valid" id="wiringValidationPill">
              <span class="status-dot active-green"></span>
              <span>Circuit Valid</span>
            </div>
          `;
        }

        if (probeCh1Label) probeCh1Label.textContent = 'CLK / SYNC';
        if (probeCh2Label) probeCh2Label.textContent = 'AMI BIPOLAR';
        if (probeSpectrumLabel) probeSpectrumLabel.textContent = '0 - 80 kHz';
        if (probeDecLabel) probeDecLabel.textContent = 'RECEIVER';

        const instBrandTitle = document.getElementById('instrumentBrandTitle');
        const instBrandSpecs = document.getElementById('instrumentBrandSpecs');
        const wiringEngineBadge = document.getElementById('wiringEngineBadge');
        if (instBrandTitle) instBrandTitle.textContent = 'COM122L DUAL INSTRUMENTATION';
        if (instBrandSpecs) instBrandSpecs.innerHTML = 'CRT DSO &bull; RF Spectrum Analyzer &bull; 10 KHz Word Clock';
        if (wiringEngineBadge) wiringEngineBadge.textContent = 'SIGMA COM122L WIRING ENGINE';

        this.workbench.setExperiment('line_coding');
        this.switchTab('spectral');
      }

      this.updateSimulation();
      if (this.tutor) {
        this.tutor.setLevel(this.tutor.currentHintLevel || 1);
      }
      setTimeout(() => {
        if (this.workbench) this.workbench.renderWires();
        if (this.oscilloscope) this.oscilloscope.resizeCanvas();
        if (this.spectrumAnalyzer) this.spectrumAnalyzer.resizeCanvas();
      }, 50);
    }

    recordActiveAMMeasurement() {
      const { Em, Ec, fm, fc, rfLink } = this.state;
      const am = window.DigiWaveOracle ? window.DigiWaveOracle.calculateAM({ Em, Ec, fm, fc, rf_link: rfLink }) : null;
      if (!am) return;

      const obsTbody = document.getElementById('amObservationTableBody');
      if (obsTbody) {
        const rowIdx = obsTbody.children.length + 1;
        const tr = document.createElement('tr');
        tr.className = 'active-row';
        tr.style.background = 'rgba(56,189,248,0.15)';
        tr.innerHTML = `
          <td>${rowIdx}</td>
          <td>${Em.toFixed(2)} V</td>
          <td>${Ec.toFixed(2)} V</td>
          <td>${(Em/Ec).toFixed(2)}</td>
          <td>${am.Emax.toFixed(2)} V</td>
          <td>${am.Emin.toFixed(2)} V</td>
          <td>${(am.mGraphical).toFixed(2)}</td>
          <td>${am.L1.toFixed(2)} V</td>
          <td>${am.L2.toFixed(2)} V</td>
          <td>${(am.mTrapezoidal).toFixed(2)}</td>
          <td><span class="badge ${am.m <= 1.0 ? 'badge-green' : 'badge-red'}">${am.patternDesc.split('(')[0].trim()}</span></td>
        `;
        obsTbody.appendChild(tr);
      }

      const resTbody = document.getElementById('amResultTableBody');
      if (resTbody) {
        const tr = document.createElement('tr');
        tr.className = 'active-row';
        tr.style.background = 'rgba(56,189,248,0.15)';
        tr.innerHTML = `
          <td>${Ec.toFixed(2)} V</td>
          <td>${am.m.toFixed(2)}</td>
          <td>${(am.Pc * 1000).toFixed(2)} mW</td>
          <td>${(am.Psb * 1000).toFixed(2)} mW</td>
          <td>${(am.Pt * 1000).toFixed(2)} mW</td>
          <td>${(am.efficiency).toFixed(2)}%</td>
          <td>${(am.bandwidthHz / 1000).toFixed(2)} kHz</td>
        `;
        resTbody.appendChild(tr);
      }
    }

    setScheme(scheme) {
      this.state.scheme = scheme;

      // Sync dropdown
      const schemeSelect = document.getElementById('schemeSelect');
      if (schemeSelect) schemeSelect.value = scheme;

      // Sync format buttons
      document.querySelectorAll('.format-choice-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-scheme') === scheme);
      });

      // Synchronize physical trainer kit probe cord to this line code format (physical mode only)
      if (this.workbench && this.workbench.viewMode === 'physical') {
        const SCHEME_TO_LINE_PORT = {
          'ami': 'line_ami_bipolar',
          'nrz': 'line_nrz_bipolar',
          'nrz_unipolar': 'line_nrz_unipolar',
          'nrzm': 'line_nrz_m',
          'rz_unipolar': 'line_rz_unipolar',
          'bipolar_rz': 'line_rz_bipolar',
          'manchester': 'line_biphase_manchester',
        };
        const targetPort = SCHEME_TO_LINE_PORT[scheme];
        if (targetPort) {
          const currentProbe = this.workbench.validateWiring().probedScheme;
          if (currentProbe !== scheme) {
            this.workbench.probeLineCode(targetPort);
            return;
          }
        }
      }

      if (this.tutor && typeof this.tutor.onSchemeChanged === 'function') {
        this.tutor.onSchemeChanged(scheme);
      }

      this.updateSimulation();
    }

    setBitstream(bits) {
      if (!bits || bits.length === 0) return;
      // Pad or clamp to 8 bits for COM122L Word Length specification
      if (bits.length < 8) {
        while (bits.length < 8) bits.push(0);
      } else if (bits.length > 8) {
        bits = bits.slice(0, 8);
      }
      this.state.bits = bits;
      this.renderHardwareSwitches();
      this.updateSimulation();
    }

    /**
     * Render the 8 Physical Hardware Rocker Switches (D7 to D0) with active LEDs.
     */
    renderHardwareSwitches() {
      const container = document.getElementById('switchBank8bit');
      if (!container) return;

      container.innerHTML = '';

      // Display bits MSB to LSB (D7 down to D0)
      for (let i = 0; i < 8; i++) {
        const bitVal = this.state.bits[i] !== undefined ? this.state.bits[i] : 0;
        const bitLabel = `D${7 - i}`; // D7 down to D0

        const unit = document.createElement('div');
        unit.className = 'switch-unit';

        // LED Indicator above switch
        const led = document.createElement('div');
        led.className = `switch-led ${bitVal === 1 ? 'high' : ''}`;
        led.id = `led-d${7 - i}`;

        // Toggle Switch Body
        const sw = document.createElement('div');
        sw.className = `hardware-toggle-switch ${bitVal === 1 ? 'switch-up' : 'switch-down'}`;
        sw.title = `Click to toggle ${bitLabel} (${bitVal === 1 ? 'Logic 1' : 'Logic 0'})`;

        const lever = document.createElement('div');
        lever.className = 'toggle-lever';
        sw.appendChild(lever);

        // Switch Label (D7..D0)
        const lbl = document.createElement('span');
        lbl.className = 'switch-label';
        lbl.textContent = bitLabel;

        // Toggle event
        sw.addEventListener('click', () => {
          this.state.bits[i] = this.state.bits[i] === 1 ? 0 : 1;
          this.renderHardwareSwitches();
          this.updateSimulation();
        });

        unit.appendChild(led);
        unit.appendChild(sw);
        unit.appendChild(lbl);
        container.appendChild(unit);
      }

      // Update Word Hex and Binary displays
      const binStr = this.state.bits.join('');
      const hexVal = parseInt(binStr, 2).toString(16).toUpperCase().padStart(2, '0');

      const hexEl = document.getElementById('wordHexDisplay');
      if (hexEl) hexEl.textContent = `HEX: 0x${hexVal}`;

      const binEl = document.getElementById('wordBinDisplay');
      if (binEl) binEl.textContent = `BIN: ${binStr}`;

      // Synchronize 8 Physical Front-Panel DIP Switches (D8 down to D1)
      for (let i = 0; i < 8; i++) {
        const bitVal = this.state.bits[i] !== undefined ? this.state.bits[i] : 0;
        const sw = document.getElementById(`physSwitchD${8 - i}`);
        const led = document.getElementById(`physLedD${8 - i}`);
        if (sw) {
          sw.className = `physical-dip-switch ${bitVal === 1 ? 'up' : 'down'}`;
        }
        if (led) {
          led.className = `physical-dip-led ${bitVal === 1 && this.state.powerOn ? 'on' : ''}`;
        }
      }
    }

    /**
     * Render the 8-Bit Recovered Data LEDs in the Line Decoding Section (Experiment 1).
     */
    renderRecoveredData(recoveredBits, isMatch) {
      const container = document.getElementById('recoveredLedBank');
      if (!container) return;

      container.innerHTML = '';

      for (let i = 0; i < 8; i++) {
        const bitVal = recoveredBits && recoveredBits[i] !== undefined ? recoveredBits[i] : 0;
        const bitLabel = `R${7 - i}`;

        const unit = document.createElement('div');
        unit.className = 'recovered-unit';

        const led = document.createElement('div');
        led.className = `recovered-led ${bitVal === 1 && this.state.powerOn ? 'on' : ''}`;

        const lbl = document.createElement('span');
        lbl.className = 'switch-label';
        lbl.textContent = bitLabel;

        unit.appendChild(led);
        unit.appendChild(lbl);
        container.appendChild(unit);
      }

      const matchBadge = document.getElementById('decodeMatchBadge');
      if (matchBadge) {
        if (!this.state.powerOn) {
          matchBadge.className = 'decode-match-badge mismatched';
          matchBadge.innerHTML = '&#9888; POWER OFF';
        } else if (isMatch) {
          const binStr = (recoveredBits || []).join('');
          matchBadge.className = 'decode-match-badge matched';
          matchBadge.innerHTML = `&#10004; DECODED: <strong>${binStr}</strong> (100% MATCH, BER: 0.00)`;
        } else {
          matchBadge.className = 'decode-match-badge mismatched';
          matchBadge.innerHTML = '&#9888; WIRING OPEN / MISMATCH DETECTED';
        }
      }
    }

    onWiringChanged(connections, status) {
      const SCHEME_DISPLAY_NAMES = {
        'ami': 'AMI Bipolar (Alternate Mark Inversion, Zero DC)',
        'nrz': 'Polar NRZ (Bipolar \u00B11V)',
        'nrz_unipolar': 'Unipolar NRZ (0V / +1V)',
        'nrzm': 'NRZ-M (Differential Mark)',
        'rz_unipolar': 'Unipolar RZ (Half-Bit Pulses)',
        'bipolar_rz': 'Bipolar RZ (\u00B11V Return to Zero)',
        'manchester': 'Bi-Phase Manchester (Split-Phase)',
      };

      const chip = document.getElementById('activeLineCodeChip');
      const probeCh2Label = document.getElementById('probeCh2Label');

      // If student probed a specific line coding output on the physical kit, auto-switch scheme
      if (status.probedScheme) {
        if (status.probedScheme !== this.state.scheme) {
          this.state.scheme = status.probedScheme;
          const schemeSelect = document.getElementById('schemeSelect');
          if (schemeSelect) schemeSelect.value = status.probedScheme;
          document.querySelectorAll('.format-choice-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-scheme') === status.probedScheme);
          });
        }
        const humanName = SCHEME_DISPLAY_NAMES[status.probedScheme] || status.probedScheme.toUpperCase();
        if (chip) {
          chip.textContent = humanName;
          chip.style.background = '#0284c7';
          chip.style.boxShadow = '0 0 12px rgba(2, 132, 199, 0.8)';
        }
        if (probeCh2Label) {
          probeCh2Label.textContent = status.probedScheme.toUpperCase();
        }
      } else if (this.workbench && this.workbench.viewMode === 'blocks' && status.isScopeConnected) {
        // In Schematic Blocks view with encoder.out patched to scope
        const humanName = SCHEME_DISPLAY_NAMES[this.state.scheme] || this.state.scheme.toUpperCase();
        if (chip) {
          chip.textContent = humanName;
          chip.style.background = '#0284c7';
          chip.style.boxShadow = '0 0 12px rgba(2, 132, 199, 0.8)';
        }
        if (probeCh2Label) {
          probeCh2Label.textContent = this.state.scheme.toUpperCase();
        }
      } else {
        // No line code currently patched into scope.in
        if (chip) {
          chip.textContent = 'DISCONNECTED (Click any Line Code Jack to Execute)';
          chip.style.background = '#ef4444';
          chip.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.8)';
        }
        if (probeCh2Label) {
          probeCh2Label.textContent = 'DISCONNECTED';
        }
      }

      const pill = document.getElementById('wiringValidationPill');
      if (pill) {
        if (status.isValid) {
          pill.className = 'wiring-validation-pill valid';
          pill.innerHTML = '<span class="status-dot active-green"></span> Circuit Valid';
        } else {
          pill.className = 'wiring-validation-pill fault';
          pill.innerHTML = '<span class="status-dot active-rose"></span> Patch Cord Open / Disconnected';
        }
      }

      this.updateSimulation();
    }

    updateSimulation() {
      if (this.state.experimentId === 'am_modulation') {
        const { Em, fm, Ec, fc, rfLink, powerOn } = this.state;
        const validation = this.workbench.validateWiring();

        let amData;
        if (!powerOn || !validation.isValid) {
          amData = window.DigiWaveOracle.calculateAM({
            Em: 0, fm, Ec: 0, fc, rf_link: rfLink
          });
        } else {
          amData = window.DigiWaveOracle.calculateAM({
            Em, fm, Ec, fc, rf_link: rfLink
          });
        }

        // Update Oscilloscope
        const isXY = this.state.instrumentMode === 'xy';
        this.oscilloscope.setAMData(amData, isXY ? 'xy' : 'time');

        // Update HUD Overlays
        const hudCh1 = document.getElementById('hudCh1');
        const hudCh2 = document.getElementById('hudCh2');
        if (hudCh1) hudCh1.textContent = `CH1: AUDIO SINE fm = ${(fm/1000).toFixed(1)} kHz \u2022 Em = ${Em.toFixed(2)} V`;
        if (hudCh2) hudCh2.textContent = `CH2: AM DSB-FC fc = ${(fc/1000).toFixed(0)} kHz \u2022 m = ${amData.m.toFixed(2)} (${amData.patternDesc.split('(')[0].trim()})`;

        // Update Live AM readout badge
        const liveReadout = document.getElementById('amLiveMReadout');
        if (liveReadout) {
          liveReadout.innerHTML = `Theoretical m: <strong>${amData.m.toFixed(2)}</strong> &bull; Pattern: <strong>${amData.patternDesc.split('(')[0].trim()}</strong> &bull; PT: <strong>${(amData.Pt*1000).toFixed(1)} mW</strong>`;
        }

        // Check Diode Detector Diagonal Peak Clipping (Page 4)
        const detStatusBadge = document.getElementById('amDetStatusBadge');
        if (detStatusBadge) {
          const capBtn = document.getElementById('amDetFilterBtn');
          const capText = capBtn ? capBtn.textContent : '0.01';
          const capMatch = capText.match(/[\d\.]+/);
          const cUf = capMatch ? parseFloat(capMatch[0]) : 0.01;
          const cF = cUf * 1e-6;
          const rLoad = 10000; // 10 kOhm standard load
          const tau = rLoad * cF;
          const omegaM = 2 * Math.PI * fm;
          const m = amData.m;
          if (m <= 0.01) {
            detStatusBadge.className = 'badge badge-green';
            detStatusBadge.textContent = 'Carrier Rectified (m = 0)';
          } else if (m < 1.0) {
            const maxTau = Math.sqrt(1 - m * m) / (m * omegaM);
            if (tau <= maxTau) {
              detStatusBadge.className = 'badge badge-green';
              detStatusBadge.textContent = 'Demod OK (No Clipping)';
            } else {
              detStatusBadge.className = 'badge badge-red';
              detStatusBadge.textContent = 'Diagonal Peak Clipping!';
            }
          } else {
            detStatusBadge.className = 'badge badge-red';
            detStatusBadge.textContent = 'Negative Peak Clipping (m \u2265 1)';
          }
        }

        // Update Telemetry Strips
        const dcEl = document.getElementById('metricDc');
        const transEl = document.getElementById('metricTransitions');
        const clockEl = document.getElementById('metricClock');
        const decodedEl = document.getElementById('metricDecoded');
        if (dcEl) {
          dcEl.textContent = `Ec = ${Ec.toFixed(2)} V`;
          dcEl.className = 'telemetry-val positive';
        }
        if (transEl) {
          transEl.textContent = `Em = ${Em.toFixed(2)} V`;
        }
        if (clockEl) {
          clockEl.textContent = `m = ${amData.m.toFixed(2)}`;
          clockEl.className = amData.m <= 1.0 ? 'telemetry-val positive' : 'telemetry-val warning';
        }
        if (decodedEl) {
          decodedEl.textContent = `${(amData.efficiency).toFixed(1)}% Eff`;
          decodedEl.className = 'telemetry-val positive';
        }

        const specDcEl = document.getElementById('metricSpecDc');
        const specNullEl = document.getElementById('metricSpecNull');
        const specBwEl = document.getElementById('metricSpecBw');
        const specSpikeEl = document.getElementById('metricSpecSpike');
        if (specDcEl) specDcEl.textContent = `${(amData.Pc * 1000).toFixed(1)} mW`;
        if (specNullEl) specNullEl.textContent = `${(amData.bandwidthHz / 1000).toFixed(1)} kHz`;
        if (specBwEl) specBwEl.textContent = `${(amData.bandwidthHz / 1000).toFixed(1)} kHz`;
        if (specSpikeEl) specSpikeEl.textContent = `fc = ${(fc/1000).toFixed(0)} kHz`;

        return;
      }

      const { scheme, bits, voltage, samplesPerBit, powerOn } = this.state;
      const validation = this.workbench.validateWiring();

      let waveform = [];
      let recoveredBits = [];
      let isMatch = false;

      if (!powerOn) {
        // Flatline if power is off
        waveform = new Array(bits.length * samplesPerBit).fill(0.0);
        recoveredBits = new Array(8).fill(0);
        isMatch = false;
      } else if (validation.isSourceConnected && validation.isScopeConnected) {
        // True line coded waveform
        waveform = window.DigiWaveOracle.encode(scheme, bits, samplesPerBit);
        // Receiver decoding (Experiment 1)
        if (validation.isDecoderConnected) {
          recoveredBits = window.DigiWaveOracle.decode(scheme, waveform, samplesPerBit);
          isMatch = recoveredBits.length === bits.length && recoveredBits.every((b, i) => b === bits[i]);
        } else {
          recoveredBits = new Array(8).fill(0);
          isMatch = false;
        }
      } else {
        // Signal disconnected
        waveform = new Array(bits.length * samplesPerBit).fill(0.0);
        recoveredBits = new Array(8).fill(0);
        isMatch = false;
      }

      // Update Oscilloscope
      this.oscilloscope.setWaveforms(waveform, bits, samplesPerBit, voltage);

      // Update Spectrum Analyzer
      if (powerOn && (validation.isSpectrumConnected || validation.isScopeConnected)) {
        this.spectrumAnalyzer.setSignal(scheme, bits, voltage);
      } else {
        this.spectrumAnalyzer.setSignal(scheme, [0, 0, 0, 0, 0, 0, 0, 0], 0.0);
      }

      // Update Line Decoder 8-Bit Recovered Display
      this.renderRecoveredData(recoveredBits, isMatch);

      // Update Telemetry Metrics Strips
      const metrics = window.DigiWaveOracle.calculateMetrics(waveform, bits, voltage);
      const spectralMetrics = window.DigiWaveOracle.calculateSpectralMetrics(scheme, bits, voltage, this.state.clockFreqKhz);

      this.updateTelemetryHUD(metrics, spectralMetrics, isMatch);
      this.updateWhatIf();

      if (this.state.audioEnabled && powerOn) {
        this.playTone(metrics.dcComponent, metrics.transitions);
      }
    }

    updateTelemetryHUD(metrics, spectralMetrics, isMatch) {
      // Time Domain Telemetry
      const dcEl = document.getElementById('metricDc');
      const transEl = document.getElementById('metricTransitions');
      const clockEl = document.getElementById('metricClock');
      const decodedEl = document.getElementById('metricDecoded');

      if (dcEl) {
        dcEl.textContent = `${metrics.dcComponent.toFixed(3)} V`;
        dcEl.className = Math.abs(metrics.dcComponent) < 0.05 ? 'telemetry-val zero' : 'telemetry-val warning';
      }
      if (transEl) {
        transEl.textContent = `${metrics.transitions} Edges`;
      }
      if (clockEl) {
        clockEl.textContent = metrics.clockCapability.split(' ')[0];
      }
      if (decodedEl) {
        decodedEl.textContent = isMatch ? 'Matched (100%)' : 'Disconnected / Error';
        decodedEl.className = isMatch ? 'telemetry-val positive' : 'telemetry-val warning';
      }

      // Frequency Domain Telemetry (Experiment 2)
      const specDcEl = document.getElementById('metricSpecDc');
      const specNullEl = document.getElementById('metricSpecNull');
      const specBwEl = document.getElementById('metricSpecBw');
      const specSpikeEl = document.getElementById('metricSpecSpike');

      if (specDcEl) {
        if (this.state.scheme === 'ami' || this.state.scheme === 'manchester') {
          specDcEl.textContent = '-\u221E dBm (Zero DC)';
          specDcEl.className = 'telemetry-val positive';
        } else if (this.state.scheme === 'nrz_unipolar') {
          specDcEl.textContent = '+6.0 dBm (High)';
          specDcEl.className = 'telemetry-val warning';
        } else {
          specDcEl.textContent = `${(metrics.dcComponent * 5).toFixed(1)} dBm`;
          specDcEl.className = 'telemetry-val';
        }
      }

      if (specNullEl) {
        specNullEl.textContent = `${spectralMetrics.firstNullKhz.toFixed(1)} kHz`;
      }
      if (specBwEl) {
        specBwEl.textContent = `${spectralMetrics.mainLobeBwKhz.toFixed(1)} kHz`;
      }
      if (specSpikeEl) {
        specSpikeEl.textContent = spectralMetrics.hasClockSpike ? 'Yes (+10 kHz Spike)' : 'No (Suppressed)';
        specSpikeEl.className = spectralMetrics.hasClockSpike ? 'telemetry-val positive' : 'telemetry-val';
      }

      // CRT HUD Overlays
      const hudCh1 = document.getElementById('hudCh1');
      if (hudCh1) hudCh1.textContent = `CH1: 8-Bit Word (${this.state.bits.join('')}) \u2022 10 kHz CLK`;

      const hudCh2 = document.getElementById('hudCh2');
      if (hudCh2) hudCh2.textContent = `CH2: ${spectralMetrics.name.toUpperCase()} (DC: ${metrics.dcComponent.toFixed(2)}V)`;
    }

    renderSpectralTable() {
      const container = document.getElementById('spectralTableBody');
      if (!container) return;

      const schemes = ['nrz_unipolar', 'rz_unipolar', 'ami', 'nrz', 'bipolar_rz', 'manchester'];

      container.innerHTML = schemes.map(key => {
        const m = window.DigiWaveOracle.SPECTRAL_METRICS[key];
        const isActive = this.state.scheme === key;

        return `
          <tr class="${isActive ? 'active-row' : ''}">
            <td><strong>${m.name}</strong></td>
            <td><code>${m.formula}</code></td>
            <td>${m.firstNullKhz.toFixed(1)} kHz</td>
            <td>${m.mainLobeBwKhz.toFixed(1)} kHz</td>
            <td>${m.dcStatus}</td>
            <td>${m.bwEfficiency}</td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="window.DigiWaveApp.setScheme('${key}'); window.DigiWaveApp.setInstrumentMode('freq');">
                &#128202; Observe Spectrum
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    switchTab(tabId) {
      this.state.activeTab = tabId;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
      document.querySelectorAll('.tab-content-panel').forEach(panel => {
        panel.style.display = panel.id === `tab-${tabId}` ? 'block' : 'none';
      });
    }

    updateWhatIf() {
      const whatifScheme = document.getElementById('whatifSchemeSelect')?.value || 'manchester';
      const whatifBitsStr = document.getElementById('whatifBitsInput')?.value || this.state.bits.join('');
      const whatifBits = whatifBitsStr.replace(/[^01]/g, '').split('').map(Number);

      if (whatifBits.length === 0) return;

      const baseWave = window.DigiWaveOracle.encode(this.state.scheme, this.state.bits);
      const baseMetrics = window.DigiWaveOracle.calculateMetrics(baseWave, this.state.bits, this.state.voltage);

      const modWave = window.DigiWaveOracle.encode(whatifScheme, whatifBits);
      const modMetrics = window.DigiWaveOracle.calculateMetrics(modWave, whatifBits, this.state.voltage);

      const baseDcEl = document.getElementById('whatifBaseDc');
      const modDcEl = document.getElementById('whatifModDc');
      const diffDcEl = document.getElementById('whatifDiffDc');

      if (baseDcEl) baseDcEl.textContent = `${baseMetrics.dcComponent.toFixed(3)} V`;
      if (modDcEl) modDcEl.textContent = `${modMetrics.dcComponent.toFixed(3)} V`;
      if (diffDcEl) {
        const deltaDc = modMetrics.dcComponent - baseMetrics.dcComponent;
        diffDcEl.textContent = `${deltaDc >= 0 ? '+' : ''}${deltaDc.toFixed(3)} V`;
        diffDcEl.className = Math.abs(modMetrics.dcComponent) < Math.abs(baseMetrics.dcComponent) ? 'diff-delta improved' : 'diff-delta degraded';
      }

      const baseTrEl = document.getElementById('whatifBaseTrans');
      const modTrEl = document.getElementById('whatifModTrans');
      const diffTrEl = document.getElementById('whatifDiffTrans');

      if (baseTrEl) baseTrEl.textContent = `${baseMetrics.transitions}`;
      if (modTrEl) modTrEl.textContent = `${modMetrics.transitions}`;
      if (diffTrEl) {
        const deltaTr = modMetrics.transitions - baseMetrics.transitions;
        diffTrEl.textContent = `${deltaTr >= 0 ? '+' : ''}${deltaTr}`;
        diffTrEl.className = deltaTr >= 0 ? 'diff-delta improved' : 'diff-delta degraded';
      }
    }

    renderMisconceptions() {
      const container = document.getElementById('misconceptionsList');
      if (!container) return;

      container.innerHTML = window.DigiWaveMisconceptions.list.map(m => `
        <div class="misconception-card">
          <div class="misconception-tag">${m.tag}</div>
          <div class="misconception-name">${m.name}</div>
          <div class="misconception-desc">${m.description}</div>
          <button class="btn btn-outline btn-sm" onclick="window.DigiWaveMisconceptions.trigger('${m.id}', window.DigiWaveApp)">
            &#9888; Inject Fault &amp; Diagnose
          </button>
        </div>
      `).join('');
    }

    setupDSSS() {
      const runDsssBtn = document.getElementById('runDsssBtn');
      const dsssContainer = document.getElementById('dsssStagesContainer');

      this.dsssRunner = {
        run: async (bits, chipRate = 4, fc = 500.0, seed = 0) => {
          let result = await this.api.postDSSS(bits, chipRate, fc, seed);
          if (!result) {
            result = window.DigiWaveOracle.runDSSS(bits, chipRate, seed);
          }

          if (dsssContainer) {
            dsssContainer.innerHTML = `
              <div class="dsss-stage-row">
                <div class="dsss-stage-name">&#128421; 1. Input 8-Bit Word</div>
                <div>${bits.map(b => `<span class="badge ${b === 1 ? 'badge-green' : 'badge-amber'}">${b}</span>`).join(' ')}</div>
              </div>
              <div class="dsss-stage-row">
                <div class="dsss-stage-name">&#9881; 2. Spreading Sequence (${chipRate} chips/bit)</div>
                <div class="dsss-chips-preview">
                  ${result.pn_code || result.pnCode ? (result.pn_code || result.pnCode).map(c => `
                    <div class="dsss-chip-block ${c > 0 ? 'pos' : 'neg'}">${c > 0 ? '+1' : '-1'}</div>
                  `).join('') : ''}
                </div>
              </div>
              <div class="dsss-stage-row">
                <div class="dsss-stage-name">&#9889; 3. Spread Wideband Signal</div>
                <div style="font-size: 11px; color: #38bdf8;">${(result.spread_signal || result.spreadSignal || []).length} total chips transmitted</div>
              </div>
              <div class="dsss-stage-row" style="border-left: 3px solid #10b981;">
                <div class="dsss-stage-name" style="color: #34d399;">&#x2714; 4. Coherent Receiver Despreading</div>
                <div>Recovered: ${(result.recovered_bits || result.recoveredBits || []).join('')} 
                  <span class="badge badge-green">${result.bits_match || result.matched ? '100% RECOVERED' : 'ERRORS'}</span>
                </div>
              </div>
            `;
          }
        }
      };

      if (runDsssBtn) {
        runDsssBtn.addEventListener('click', () => {
          this.dsssRunner.run(this.state.bits, 4, 500.0, 0);
        });
      }
    }

    toggleAudio() {
      this.state.audioEnabled = !this.state.audioEnabled;
      const btn = document.getElementById('audioSynthBtn');
      if (btn) {
        btn.classList.toggle('active', this.state.audioEnabled);
        btn.innerHTML = this.state.audioEnabled ? '&#128266; Synth ON' : '&#128264; Synth OFF';
      }

      if (this.state.audioEnabled && !this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
    }

    playTone(dc, transitions) {
      if (!this.audioCtx) return;
      try {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        const freq = Math.max(150, Math.min(1200, 300 + transitions * 50));
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.15);
      } catch (e) {
        // Audio policy ignore
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.DigiWaveApp = new DigiWaveApp();
  });
})(window);
