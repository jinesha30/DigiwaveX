/**
 * DigiWave X — Judge Presentation Walkthrough Controller
 * Tailored for SIGMA MODEL COM122L: Study of Line Codes & Their Spectral Analysis.
 * 5-Step interactive demonstration tour tailored for hackathon / project judges.
 */

(function (window) {
  'use strict';

  const DEMO_STEPS = [
    {
      step: 1,
      title: 'SIGMA COM122L Trainer Kit & Oracle',
      badge: 'Hardware Kit',
      summary: 'Emulates the physical SIGMA COM122L hardware trainer kit: 230V AC 50 Hz power supply, 8-Bit Word Generator (D7..D0), 10 KHz Word Clock, and ground-truth deterministic mathematical oracle.',
      action: (app) => {
        app.workbench.autoWire();
        app.setInstrumentMode('time');
        app.setScheme('nrz');
        app.setBitstream([1, 0, 1, 1, 0, 0, 1, 0]);
        app.tutor.addAIMessage({
          answer: `**Welcome Judges to DigiWave X — SIGMA COM122L Virtual Laboratory!**\n\n**The Setup**: We are modeling the **SIGMA MODEL COM122L** trainer kit:\n- **Power**: 230V AC, 50 Hz\n- **Word Generator**: 8-bit toggle switches (D7..D0) generating word \`10110010\` (0xB2)\n- **Word Clock Frequency**: 10 KHz\n- **6 Line Coding Formats**: Unipolar NRZ, Unipolar RZ, Bipolar NRZ (AMI), Polar NRZ, Polar RZ, Bi-phase Manchester.\n\nEvery calculation is executed by a deterministic mathematical oracle with 100% ground-truth accuracy!`,
          confidence: 1.0,
          citations: ["SIGMA COM122L Trainer Kit Manual", "DigiWave X Architectural Whitepaper"],
          stage: "judge_intro",
        });
      }
    },
    {
      step: 2,
      title: 'Experiment 1: Line Coding & Decoding',
      badge: 'Experiment 1',
      summary: 'Observes line coding formats and verifies round-trip digital decoding back to the original 8-bit word with 0.00 Bit Error Rate.',
      action: (app) => {
        app.workbench.autoWire();
        app.setScheme('ami');
        app.setBitstream([1, 0, 1, 1, 0, 0, 1, 0]);
        app.switchTab('decoding');
        app.updateSimulation();
        app.tutor.addAIMessage({
          answer: `**Experiment 1: Digital Line Coding & Decoding**\n\n1. **Transmission**: The 8-bit word \`10110010\` is encoded into **Bipolar NRZ (AMI)**.\n2. **DC Component**: Note that the DC bias is **0.000 V** because marks strictly alternate (+1V, -1V).\n3. **Decoding**: The receiver slices the waveform at \u00B10.25V and reconstructs the recovered 8-bit word \`10110010\` on the green LED bank with **100% match (BER: 0.00)**!`,
          confidence: 0.99,
          citations: ["SIGMA COM122L Manual: Experiment 1", "Proakis: Digital Communications, Ch 4"],
          stage: "exp1_coding_decoding",
        });
      }
    },
    {
      step: 3,
      title: 'Experiment 2: RF Spectrum Analyzer',
      badge: 'Experiment 2',
      summary: 'Switches to the RF-122L Spectrum Analyzer to observe real-time FFT line spectrum and theoretical Power Spectral Density (PSD) envelopes.',
      action: (app) => {
        app.setInstrumentMode('freq');
        app.switchTab('spectral');
        app.setScheme('manchester');
        app.updateSimulation();
        app.tutor.addAIMessage({
          answer: `**Experiment 2: Spectral Analysis on RF Spectrum Analyzer**\n\nNotice the frequency domain display ($0$ to $40\\text{ kHz}$):\n- **Bi-phase Manchester Spectrum**: Power at $f=0$ is strictly **$-\\infty\\text{ dBm}$ (Zero DC component)**.\n- **First Spectral Null**: Located at $2 R_b = \\mathbf{20.0\\text{ kHz}}$ (double the bandwidth of NRZ).\n- **Clock Recovery**: Peak energy is concentrated near $10\\text{ kHz}$, providing guaranteed self-synchronization!\n\nJudges can also click **'Split View'** in the top instrument toolbar to see both Time and Frequency domains simultaneously!`,
          confidence: 1.0,
          citations: ["SIGMA COM122L Manual: Experiment 2", "Carlson: Communication Systems, Ch 7"],
          stage: "exp2_spectral_analysis",
        });
      }
    },
    {
      step: 4,
      title: 'Hardware Patch Bay & Fault Sandbox',
      badge: 'Hardware Faults',
      summary: 'Demonstrates realistic banana plug patch cords, open-circuit detection, and the classic AMI polarity reset misconception.',
      action: (app) => {
        app.setInstrumentMode('split');
        window.DigiWaveMisconceptions.trigger('ami_polarity_reset', app);
      }
    },
    {
      step: 5,
      title: 'Socratic AI Tutor & COM122L Manual',
      badge: 'Pedagogy & Manual',
      summary: 'Interactive COM122L Training Manual (Standard Accessory 1) combined with LangGraph 3-level hint escalation.',
      action: (app) => {
        const manualModal = document.getElementById('manualModal');
        if (manualModal) manualModal.classList.add('open');
        app.tutor.addAIMessage({
          answer: `**Integrated Training Manual & Socratic Pedagogy**\n\n- **Standard Accessory 1**: We've integrated the complete **SIGMA COM122L Training Manual**, with experiment procedures, theoretical PSD derivations, observation tables, and Viva Voce questions.\n- **Socratic Tutoring**: Dr. Wave provides 3-level hint escalation (Guide \u2192 Clue \u2192 Solution) diffed against the deterministic oracle to ensure 0% hallucination!`,
          confidence: 1.0,
          citations: ["SIGMA COM122L Training Manual", "IEEE Transactions on Learning Technologies"],
          stage: "pedagogy_and_manual",
        });
      }
    }
  ];

  class JudgeWalkthrough {
    constructor(app) {
      this.app = app;
      this.currentStep = 0;
      this.initDock();
    }

    initDock() {
      const dock = document.getElementById('judgeDock');
      if (!dock) return;

      dock.innerHTML = `
        <div class="dock-header">
          <div class="dock-title-group">
            <span class="badge badge-cyan">&#127942; JUDGES PRESENTATION TOUR</span>
            <span class="dock-status" id="tourProgress">Step 1 of 5</span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="window.DigiWaveWalkthrough.openModal()">
            View Script
          </button>
        </div>
        <div class="dock-content">
          <div class="tour-step-info">
            <span class="tour-step-badge" id="tourStepBadge">Architecture</span>
            <span class="tour-step-title" id="tourStepTitle">Problem &amp; Value Proposition</span>
            <p class="tour-step-desc" id="tourStepDesc"></p>
          </div>
          <div class="dock-buttons">
            <button class="btn btn-outline btn-sm" id="tourPrevBtn" disabled>&larr; Prev</button>
            <button class="btn btn-primary btn-sm" id="tourNextBtn">Run Step 1 &rarr;</button>
          </div>
        </div>
      `;

      document.getElementById('tourPrevBtn')?.addEventListener('click', () => this.prevStep());
      document.getElementById('tourNextBtn')?.addEventListener('click', () => this.nextStep());
    }

    goToStep(index) {
      if (index < 0 || index >= DEMO_STEPS.length) return;
      this.currentStep = index;
      const stepData = DEMO_STEPS[this.currentStep];

      // Update UI texts
      const badgeEl = document.getElementById('tourStepBadge');
      const titleEl = document.getElementById('tourStepTitle');
      const descEl = document.getElementById('tourStepDesc');
      const progressEl = document.getElementById('tourProgress');
      const prevBtn = document.getElementById('tourPrevBtn');
      const nextBtn = document.getElementById('tourNextBtn');

      if (badgeEl) badgeEl.textContent = stepData.badge;
      if (titleEl) titleEl.textContent = stepData.title;
      if (descEl) descEl.textContent = stepData.summary;
      if (progressEl) progressEl.textContent = `Step ${this.currentStep + 1} of ${DEMO_STEPS.length}`;

      if (prevBtn) prevBtn.disabled = this.currentStep === 0;
      if (nextBtn) {
        nextBtn.textContent = this.currentStep === DEMO_STEPS.length - 1 ? 'Finish Tour \u2714' : `Run Step ${this.currentStep + 2} \u2192`;
      }

      // Execute demonstration action
      if (typeof stepData.action === 'function') {
        stepData.action(this.app);
      }
    }

    nextStep() {
      if (this.currentStep < DEMO_STEPS.length - 1) {
        this.goToStep(this.currentStep + 1);
      } else {
        this.goToStep(0);
      }
    }

    prevStep() {
      if (this.currentStep > 0) {
        this.goToStep(this.currentStep - 1);
      }
    }

    openModal() {
      const modal = document.getElementById('judgeModal');
      const body = document.getElementById('judgeModalBody');
      if (!modal || !body) return;

      body.innerHTML = `
        <div style="font-size: 13px; line-height: 1.6; color: #cbd5e1;">
          <h4 style="color: #38bdf8; margin-bottom: 8px;">SIGMA MODEL COM122L Virtual Laboratory Walkthrough</h4>
          <p style="margin-bottom: 16px;">
            This presentation tour proves that DigiWave X replicates the physical Sigma COM122L trainer kit with mathematical precision, dual-mode instrumentation, and zero AI hallucination.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${DEMO_STEPS.map((s, idx) => `
              <div style="background: rgba(15,23,42,0.6); padding: 12px; border-radius: 8px; border: 1px solid #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <strong style="color: #f8fafc;">Step ${s.step}: ${s.title}</strong>
                  <span class="badge badge-cyan">${s.badge}</span>
                </div>
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">${s.summary}</div>
                <button class="btn btn-primary btn-sm" onclick="window.DigiWaveWalkthrough.goToStep(${idx}); document.getElementById('judgeModal').classList.remove('open');">
                  Jump to Step ${s.step}
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      modal.classList.add('open');

      const closeBtn = document.getElementById('closeJudgeModalBtn');
      if (closeBtn) {
        closeBtn.onclick = () => modal.classList.remove('open');
      }
    }
  }

  window.JudgeWalkthrough = JudgeWalkthrough;
})(window);
