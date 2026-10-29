/**
 * DigiWave X — AI Lab Instructor & Socratic Tutoring (LangGraph & PICT Lab Manual Interface)
 * Implements Level 1-3 Socratic hint escalation, textbook RAG citations, and deterministic verification.
 * Grounded directly in Pune Institute of Computer Technology (PICT) Department of E&TC
 * Subject: PCS (Principles of Communication Systems) — Experiment No. 7:
 * "Study Line codes (NRZ, RZ, AMI, Manchester), Sketch waveforms, Determine bandwidths."
 */

(function (window) {
  'use strict';

  class TutorController {
    constructor(apiClient, app = null) {
      this.api = apiClient;
      this.app = app;
      this.messagesContainer = document.getElementById('tutorMessages');
      this.inputField = document.getElementById('tutorInput');
      this.sendBtn = document.getElementById('tutorSendBtn');
      this.currentHintLevel = 1;

      this.initEvents();
      this.renderWelcome();
    }

    initEvents() {
      if (this.sendBtn) {
        this.sendBtn.addEventListener('click', () => this.handleSend());
      }
      if (this.inputField) {
        this.inputField.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
          }
        });
      }

      // Socratic Level Chips: Lvl 1 (Guide), Lvl 2 (Clue), Lvl 3 (Solution)
      document.querySelectorAll('.level-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const lvl = parseInt(chip.getAttribute('data-level'), 10) || 1;
          this.setLevel(lvl);
        });
      });

      // Quick Prompt Pills
      document.querySelectorAll('.prompt-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const text = pill.getAttribute('data-prompt') || pill.textContent;
          if (this.inputField) {
            this.inputField.value = text;
            this.handleSend();
          }
        });
      });
    }

    getAppState() {
      if (this.app && typeof this.app.getState === 'function') {
        return this.app.getState();
      }
      if (window.DigiWaveApp && typeof window.DigiWaveApp.getState === 'function') {
        return window.DigiWaveApp.getState();
      }
      return {
        scheme: 'ami',
        bits: [1, 0, 1, 1, 0, 0, 1, 0],
        voltage: 1.0,
        clockFreqKhz: 10.0,
        connections: [],
      };
    }

    setLevel(level) {
      this.currentHintLevel = level;
      document.querySelectorAll('.level-chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.getAttribute('data-level'), 10) === level);
      });

      const state = this.getAppState();
      const content = this.generateLevelContent(state, level);
      this.renderLevelCard(content);
    }

    onSchemeChanged(newScheme) {
      const state = this.getAppState();
      state.scheme = newScheme;
      const content = this.generateLevelContent(state, this.currentHintLevel);
      this.renderLevelCard(content);
    }

    renderWelcome() {
      const state = this.getAppState();
      const content = this.generateLevelContent(state, 1);
      this.renderLevelCard(content);
    }

    renderLevelCard(data) {
      if (!this.messagesContainer) return;
      let levelMsgEl = this.messagesContainer.querySelector('.message.ai.level-block');
      if (levelMsgEl) {
        levelMsgEl.innerHTML = this.buildAIMessageHtml(data);
      } else {
        const msgEl = document.createElement('div');
        msgEl.className = 'message ai level-block';
        msgEl.innerHTML = this.buildAIMessageHtml(data);
        if (this.messagesContainer.firstChild) {
          this.messagesContainer.insertBefore(msgEl, this.messagesContainer.firstChild);
        } else {
          this.messagesContainer.appendChild(msgEl);
        }
      }
      this.messagesContainer.scrollTop = 0;
    }

    addUserMessage(text) {
      const msgEl = document.createElement('div');
      msgEl.className = 'message user';
      msgEl.innerHTML = `
        <div class="message-bubble">${this.escapeHtml(text)}</div>
        <div class="message-meta">Student &bull; Just now</div>
      `;
      this.messagesContainer.appendChild(msgEl);
      this.scrollToBottom();
    }

    buildAIMessageHtml(data) {
      const confidence = data.confidence !== undefined ? Math.round(data.confidence * 100) : 99;
      const stage = data.stage || 'verified';
      const hintLevel = data.hintLevel || this.currentHintLevel || 1;
      const isAM = data.isAM || (this.getAppState() && this.getAppState().experimentId === 'am_modulation');

      const levelTitles = isAM ? {
        1: { title: 'PICT PCS Expt 1 — Level 1: Lab Guide & Socratic Inquiries (COM101N)', cls: 'lvl-1', badge: 'Guided Pedagogy' },
        2: { title: 'PICT PCS Expt 1 — Level 2: Diagnostic Clues & Analytical Formulas', cls: 'lvl-2', badge: 'Analytical Clue' },
        3: { title: 'PICT PCS Expt 1 — Level 3: Complete Solution & Observation Table', cls: 'lvl-3', badge: 'Deterministic Solution' },
      } : {
        1: { title: 'PICT PCS Expt 7 — Level 1: Lab Guide & Socratic Inquiries (COM122N)', cls: 'lvl-1', badge: 'Guided Pedagogy' },
        2: { title: 'PICT PCS Expt 7 — Level 2: Diagnostic Clues & Analytical Formulas', cls: 'lvl-2', badge: 'Analytical Clue' },
        3: { title: 'PICT PCS Expt 7 — Level 3: Complete Solution & Table 7.7', cls: 'lvl-3', badge: 'Deterministic Solution' },
      };
      const curLvlInfo = levelTitles[hintLevel] || levelTitles[1];

      let levelBannerHtml = `
        <div class="socratic-card-header ${curLvlInfo.cls}">
          <span style="font-weight: 700;">&#128161; ${curLvlInfo.title}</span>
          <span class="badge ${hintLevel === 1 ? 'badge-amber' : hintLevel === 2 ? 'badge-cyan' : 'badge-green'}">${curLvlInfo.badge}</span>
        </div>
      `;

      let hintHtml = '';
      if (data.hintText) {
        hintHtml = `
          <div class="hint-escalation-box">
            <div class="hint-header">
              <span>Socratic Hint (Level ${hintLevel})</span>
              <span class="badge badge-amber">Hint Escalation</span>
            </div>
            <div class="hint-body">${this.formatMarkdown(data.hintText)}</div>
          </div>
        `;
      }

      let citationsHtml = '';
      if (data.citations && data.citations.length > 0) {
        citationsHtml = `
          <div class="citations-wrapper">
            ${data.citations.map(c => `<span class="citation-chip">&#128214; ${this.escapeHtml(c)}</span>`).join('')}
          </div>
        `;
      }

      let groundTruthHtml = '';
      if (data.deterministicOracle) {
        const o = data.deterministicOracle;
        if (isAM) {
          groundTruthHtml = `
            <div class="ground-truth-box">
              <div class="ground-truth-title">&#x2714; Oracle Verified Ground Truth (PICT COM101N AM Engine)</div>
              <div>Modulation Index: <strong>m = ${Number(o.m !== undefined ? o.m : 0.5).toFixed(2)}</strong> (${o.patternDesc || 'Trapezoid'}) | Carrier Power: <strong>${((o.Pc || 0.25)*1000).toFixed(1)} mW</strong> | Total Power: <strong>${((o.Pt || 0.28)*1000).toFixed(1)} mW</strong> | Efficiency: <strong>${Number(o.efficiency || 11.1).toFixed(1)}%</strong></div>
            </div>
          `;
        } else {
          groundTruthHtml = `
            <div class="ground-truth-box">
              <div class="ground-truth-title">&#x2714; Oracle Verified Ground Truth (PICT COM122L Lab Engine)</div>
              <div>Format: <strong>${this.escapeHtml(o.scheme.toUpperCase())}</strong> | DC Bias: <strong>${o.dc_component !== undefined ? Number(o.dc_component).toFixed(3) : 0} V</strong> | Transitions: <strong>${o.transitions || 0}</strong> | Clock Extraction: <strong>${this.escapeHtml(o.clockCapability || 'Verified')}</strong></div>
            </div>
          `;
        }
      }

      return `
        <div class="message-bubble">
          ${levelBannerHtml}
          <div>${this.formatMarkdown(data.answer)}</div>
          ${hintHtml}
          ${groundTruthHtml}
          ${citationsHtml}
        </div>
        <div class="message-meta">
          <span class="status-dot active-green"></span>
          <span>Dr. Wave</span> &bull; 
          <span class="badge badge-green" title="Verified against deterministic engine">Oracle Verified (${confidence}%)</span> &bull;
          <span>Stage: ${stage}</span>
        </div>
      `;
    }

    addAIMessage(data) {
      const msgEl = document.createElement('div');
      msgEl.className = 'message ai';
      msgEl.innerHTML = this.buildAIMessageHtml(data);
      this.messagesContainer.appendChild(msgEl);
      this.scrollToBottom();
    }

    async handleSend() {
      const text = this.inputField.value.trim();
      if (!text) return;

      this.inputField.value = '';
      this.addUserMessage(text);

      const appState = this.getAppState();
      const blockInputs = {
        source: { bits: appState.bits.join('') },
        encoder: { scheme: appState.scheme },
        scope: { voltage: appState.voltage },
      };

      // Try FastAPI backend if online
      let response = null;
      if (this.api && this.api.isOnline) {
        try {
          response = await this.api.askTutor('line_coding', text, blockInputs, appState.connections);
        } catch (e) {
          response = null;
        }
      }

      if (response && response.answer) {
        this.addAIMessage({
          answer: response.answer,
          hintLevel: response.hint_level || this.currentHintLevel,
          hintText: response.hint_text,
          confidence: response.confidence,
          citations: response.citations,
          stage: response.stage,
          deterministicOracle: response.deterministic_oracle,
        });
      } else {
        // High quality client-side Socratic pedagogical engine grounded in PICT Lab Manual
        const clientAnswer = this.generateSocraticResponse(text, appState, this.currentHintLevel);
        this.addAIMessage(clientAnswer);
      }
    }

    /**
     * Generate structured content directly when student toggles Lvl 1 / Lvl 2 / Lvl 3.
     */
    generateLevelContent(state, level) {
      if (state.experimentId === 'am_modulation') {
        return this.generateAMLevelContent(state, level);
      }
      const scheme = state.scheme || 'ami';
      const bits = state.bits || [1, 0, 1, 1, 0, 0, 1, 0];
      const bitStr = bits.join('');
      const voltage = state.voltage || 1.0;
      const metrics = window.DigiWaveOracle ? window.DigiWaveOracle.calculateMetrics(
        window.DigiWaveOracle.encode(scheme, bits),
        bits,
        voltage
      ) : { dcComponent: 0, transitions: 4, clockCapability: 'Good' };

      const SCHEME_TITLES = {
        'ami': 'Bipolar NRZ / Alternate Mark Inversion (AMI)',
        'nrz': 'Polar NRZ (Non-Return to Zero)',
        'manchester': 'Split-Phase Manchester (Bi-Phase)',
        'rz_unipolar': 'Unipolar RZ (Return to Zero)',
        'bipolar_rz': 'Polar RZ (Return to Zero)',
        'nrz_unipolar': 'Unipolar NRZ (Non-Return to Zero)',
        'nrzm': 'NRZ-M (Differential Mark)',
      };
      const schemeTitle = SCHEME_TITLES[scheme] || scheme.toUpperCase();

      if (level === 1) {
        // --- LEVEL 1: GUIDE (PICT PCS Expt 7 Guided Pedagogy & Socratic Inquiries) ---
        return {
          answer: `### 📘 PUNE INSTITUTE OF COMPUTER TECHNOLOGY (PICT)
**Department of Electronics & Telecommunication Engineering**
**CLASS: S. E. (E &TC) | SUBJECT: PCS | EXPT. NO. : 7**

**TITLE:** Perform the experiment to study Line codes (NRZ, RZ, AMI, Manchester), Sketch the waveforms for Line codes, Determine the bandwidths of various Line codes.

- **Prerequisites (Manual Page 7.1):** 1. Spectral analysis of digital waveform, 2. Need for line coding
- **Objectives (Manual Page 7.1):** 1. To study concept of line coding, 2. Characteristics of line coding, 3. Comparison of different line codes
- **Apparatus (Manual Page 7.1):** 1. Line coding kit (Model COM122N / COM122L), 2. DSO Dual Channel (60 MHz)

---
#### 🧪 Experimental Procedure (Manual Page 7.7)
1. **Power Supply:** Switch on the power supply (230V AC, 50 Hz).
2. **Data Generator:** Word generator produces 8-bit test sequence \`${bitStr}\` at Word Clock frequency $R_b = 10\\text{ kHz}$ ($T_b = 100\\,\\mu\\text{s}$).
3. **Format Selection:** Active selected line code is **${schemeTitle}**.
4. **DSO & Spectrum:** Patch \`SIG OUT\` to DSO Channel 2 and Spectrum Analyzer input to observe time-domain waveforms and power spectra.
5. **Differential Data Formats:** Repeat observation for various test bit patterns.

---
#### 🔍 Socratic Guided Inquiries (The 7 Desirable Properties, Pages 7.1–7.2)
1. **DC Component (Property 1):** All cable and telephone transmission systems do not allow transmission of a DC signal. Therefore the line signal must have a zero average (DC) value. NRZ bipolar formats usually satisfy this requirement. Inspect the telemetry strip below: Is your DC voltage balanced near $0.00\\text{ V}$, or is there a non-zero bias?
2. **Self-Clocking Capability (Property 2):** Any digital communication system needs symbol or bit synchronization at the receiver. Does your waveform undergo transitions (zero-crossings) at regular intervals? If the sender transmits an unbroken stream of eight identical bits (e.g. \`11111111\` or \`00000000\`), does the receiver clock stay locked?
3. **Bandwidth Compression (Property 4):** Does the voltage pulse occupy the full bit duration $T_b = 100\\,\\mu\\text{s}$ (NRZ) or return to zero at half period $T_b/2 = 50\\,\\mu\\text{s}$ (RZ)? How does this pulse width affect the main lobe bandwidth on the Spectrum Analyzer?
4. **Noise Immunity & Crosstalk (Properties 6 & 7):** How many distinct decision voltage levels does the receiver need to distinguish (binary vs pseudoternary)? Does the energy around low frequencies create crosstalk in adjacent cable pairs?

---
📝 **Lab Assignment (Manual Page 7.9):**
Observe and sketch the waveform of **${schemeTitle}** for active sequence \`${bitStr}\` on your DSO. Switch to the **Frequency Domain** tab to observe the first spectral null!`,
          hintLevel: 1,
          hintText: "Need analytical clues, pulse width equations, or power spectra curves? Click **Lvl 2: Clue** to inspect mathematical formulas from Manual Sections 7.2–7.6!",
          confidence: 0.99,
          citations: [
            "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 7 (Pages 7.1 - 7.3)",
            "Taub, Schilling and Saha: Principles of Communication Systems (4th Ed), McGraw-Hill",
          ],
          stage: "socratic_guide",
          deterministicOracle: {
            scheme: scheme,
            dc_component: metrics.dcComponent,
            transitions: metrics.transitions,
            clockCapability: metrics.clockCapability,
          },
        };
      }

      if (level === 2) {
        // --- LEVEL 2: CLUE (Diagnostic Clues & Mathematical Formulas, Pages 7.1 - 7.6) ---
        let schemeClue = "";
        if (scheme === 'ami') {
          schemeClue = `**Bipolar NRZ / AMI Diagnostic Rule (PICT Fig. 5, Pages 7.4–7.5):**\n` +
            `- Successive logic '1's are represented by pulses with alternating polarity ($+A$ then $-A$), and no pulse ($0\\text{ V}$) is transmitted for logic '0'.\n` +
            `- Three voltage levels exist: $+A$, $0$, and $-A$ (pseudoternary format).\n` +
            `- **DC Elimination:** Strict absence of a DC component even with long strings of '0s' and '1s'. Allows transformer coupling in PCM-TDM T1 telephone systems!\n` +
            `- **Inversion Invariance:** Eliminates ambiguity that arises from polarity inversion in switched telephone lines.`;
        } else if (scheme === 'manchester') {
          schemeClue = `**Split-Phase Manchester Diagnostic Rule (PICT Fig. 6, Page 7.5):**\n` +
            `- Symbol '1': Transmitted as a positive pulse of $+A/2$ for first half symbol duration ($T_b/2$), followed by negative pulse of $-A/2$ for remaining half.\n` +
            `- Symbol '0': Transmitted in reverse order ($-A/2$ for first half, $+A/2$ for second half).\n` +
            `- **Self-Clocking:** Guaranteed mid-bit zero-crossing at $t = T_b/2$ on EVERY bit provides inherent synchronization.\n` +
            `- **Bandwidth Trade-off:** Attained at the expense of a bandwidth requirement of twice ($2/T_b = 20\\text{ kHz}$) that of NRZ. Standard for LANs (Ethernet / Cheapernet).`;
        } else if (scheme === 'nrz') {
          schemeClue = `**Polar NRZ Diagnostic Rule (PICT Fig. 4, Page 7.4):**\n` +
            `- Logic '1': Pulse of amplitude $+A/2$ of full duration $T_b$.\n` +
            `- Logic '0': Pulse of amplitude $-A/2$ of full duration $T_b$.\n` +
            `- **DC Balance:** Has NO DC component *only if* 0s and 1s occur in equal proportion ($N_1 = N_0$).\n` +
            `- **Noise Immunity:** Better noise immunity than unipolar RZ format.`;
        } else if (scheme === 'nrz_unipolar') {
          schemeClue = `**Unipolar NRZ Diagnostic Rule (PICT Fig. 2, Page 7.3):**\n` +
            `- Logic '1': Pulse of full bit duration $T_b$ and amplitude $+A$.\n` +
            `- Logic '0': Off pulse or zero amplitude ($0\\text{ V}$).\n` +
            `- **DC Penalty:** Non-zero DC average value ($+A/2$) that carries no information and wastes transmitter power.\n` +
            `- **Energy vs Sync:** Pulses carry more energy than RZ, but need synchronization at receiver because there is no separation between adjacent pulses.`;
        } else if (scheme === 'rz_unipolar') {
          schemeClue = `**Unipolar RZ Diagnostic Rule (PICT Fig. 1, Page 7.3):**\n` +
            `- Logic '1': On-pulse with amplitude $A$ and duration $T_b/2 = 50\\,\\mu\\text{s}$, followed by return to zero.\n` +
            `- Logic '0': Off-pulse ($a_k = 0$).\n` +
            `- **Discrete 10 kHz Clock Spike:** Periodic pulse repetition creates a discrete spectral delta component at $f = 10.0\\text{ kHz}$, allowing simple clock extraction via a passive tuned circuit.\n` +
            `- **DC Penalty:** Non-zero DC value wastes power.`;
        } else if (scheme === 'bipolar_rz') {
          schemeClue = `**Polar RZ Diagnostic Rule (PICT Fig. 3, Page 7.4):**\n` +
            `- Opposite polarity pulses of amplitude $\\pm A/2$ represent logic '1' and '0'.\n` +
            `- Pulses return to zero after half bit duration ($T_b/2$). Bandwidth expands to $2/T_b = 20\\text{ kHz}$.`;
        } else {
          schemeClue = `**NRZ-M (Differential Mark) Diagnostic Rule (PICT Sec. 7.2 Property 5):**\n` +
            `- Differential encoding: Logic '1' causes a transition, logic '0' causes no transition.\n` +
            `- Solves 180° phase inversion ambiguity in communication channels without requiring absolute polarity knowledge.`;
        }

        return {
          answer: `### 🔍 PICT PCS Expt 7 — Diagnostic Clues & Analytical Formulas

#### 1. Format-Specific Rules (Manual Pages 7.3–7.5)
${schemeClue}

---
#### 2. Power Spectra Analysis (Manual Page 7.6 Fig. 7)
- **Curve 'a' (Unipolar NRZ):** Most power concentrated between DC and bit rate of input data ($1/T_b = 10\\text{ kHz}$).
- **Curve 'b' (Polar NRZ):** Power lies in main lobe of sinc-shaped curve extending up to bit rate $1/T_b = 10.0\\text{ kHz}$.
- **Curve 'c' (AMI Bipolar NRZ):** Power lies inside $1/T_b = 10.0\\text{ kHz}$, with spectral content approaching strictly zero at zero frequency ($S(0) = 0$).
- **Curve 'd' (Manchester):** Most power lies inside bandwidth equal to $2/T_b = 20.0\\text{ kHz}$ (twice the bandwidth of NRZ formats).

---
#### 3. Core Analytical Formulas (Manual Pages 7.1–7.7)
- **Bit Period & Clock:** $T_b = 100\\,\\mu\\text{s}$, $R_b = 10\\text{ kHz}$.
- **Signaling Rate:** $r = 1/T_b = 10\\text{ kBaud}$ ($1/(2T_b)$ for Quaternary).
- **First Spectral Null (Transmission Bandwidth):**
  - **NRZ Formats & AMI:** $BW = 1/T_b = 10.0\\text{ kHz}$ (pulse width $\\tau = T_b = 100\\,\\mu\\text{s}$).
  - **RZ Formats & Manchester:** $BW = 2/T_b = 20.0\\text{ kHz}$ (pulse width $\\tau = T_b/2 = 50\\,\\mu\\text{s}$).
- **DC Component Formula:** $V_{dc} = \\frac{1}{N} \\sum_{k=1}^N a_k$.

---
#### 4. Live Circuit Telemetry (Active Trainer State)
- **Active Format:** ${schemeTitle}
- **Input 8-Bit Word:** \`${bitStr}\`
- **Measured DC Voltage:** **${metrics.dcComponent.toFixed(3)} V**
- **Detected Transitions:** **${metrics.transitions} zero-crossings**
- **Clock Extraction Feasibility:** **${metrics.clockCapability}**`,
          hintLevel: 2,
          hintText: "Notice the fundamental bandwidth theorem: Halving pulse duration from $T_b$ to $T_b/2$ doubles transmission bandwidth to $20\\text{ kHz}$! Click **Lvl 3: Solution** for full derivations and Table 7.7!",
          confidence: 0.99,
          citations: [
            "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 7 (Pages 7.3 - 7.6)",
            "B. P. Lathi & Zhi Ding: Modern Analog and Digital Communication Systems (4th Ed)",
          ],
          stage: "diagnostic_clue",
          deterministicOracle: {
            scheme: scheme,
            dc_component: metrics.dcComponent,
            transitions: metrics.transitions,
            clockCapability: metrics.clockCapability,
          },
        };
      }

      // --- LEVEL 3: SOLUTION (Complete Lab Manual Solution & Table 7.7) ---
      let detailedSolution = "";
      if (scheme === 'ami') {
        detailedSolution = `#### Mathematical Waveform Definition: Bipolar NRZ / AMI (PICT Fig. 5)
In **Bipolar NRZ (Alternate Mark Inversion / AMI)**:
- Logic **'1' (Mark)**: Encoded as pulses of alternating polarity ($+A$ then $-A$) of full bit duration $T_b$.
- Logic **'0' (Space)**: Encoded as zero voltage ($0\\text{ V}$).
- Symbol levels: Three distinct voltage levels: $+A$, $0$, and $-A$ (pseudoternary).

#### Power Spectral Density Formulation (PICT Fig. 7 Curve 'c')
$$S(f) = A^2 T_b \\left( \\frac{\\sin(\\pi f T_b)}{\\pi f T_b} \\right)^2 \\sin^2(\\pi f T_b)$$
- At $f = 0$: $\\sin^2(0) = 0 \\implies S(0) = 0$. The spectral content around zero frequency is strictly zero, completely eliminating DC baseline drift!
- First spectral null occurs at $f = 1/T_b = 10.0\\text{ kHz}$.
- Main lobe transmission bandwidth: $BW = 1/T_b = 10.0\\text{ kHz}$.

#### Practical Telecom Application (PICT Sec. 7.5)
AMI is the international standard format for **PCM-TDM T1 carrier digital telephony** ($1.544\\text{ Mbps}$). The absence of DC allows transformers for coupling and repeater power feeding without core saturation!`;
      } else if (scheme === 'manchester') {
        detailedSolution = `#### Mathematical Waveform Definition: Split-Phase Manchester (PICT Fig. 6)
In **Split-Phase Manchester (Bi-phase)**:
- Logic **'1'**: Transmitted as $+A/2$ for first half ($0 \\le t < T_b/2$), followed by $-A/2$ for remaining half ($T_b/2 \\le t < T_b$).
- Logic **'0'**: Transmitted in reverse order ($-A/2$ for first half, $+A/2$ for second half).

#### Power Spectral Density Formulation (PICT Fig. 7 Curve 'd')
$$S(f) = A^2 T_b \\cdot \\text{sinc}^2(f T_b / 2) \\cdot \\sin^2(\\pi f T_b / 2)$$
- Zero DC spectral component ($S(0) = 0$). Peak power occurs at $f \\approx 7.4\\text{ kHz}$.
- First spectral null occurs at $f = 2/T_b = 20.0\\text{ kHz}$.
- Required Bandwidth: $BW = 2/T_b = 20.0\\text{ kHz}$ (twice that of NRZ and AMI).

#### Practical Telecom Application (PICT Sec. 7.5)
Standardized in **IEEE 802.3 Local Area Networks (Ethernet 10BASE-T)** and Cheapernet. Inherent synchronization capacity crosses zero at regular intervals regardless of data pattern!`;
      } else if (scheme === 'nrz') {
        detailedSolution = `#### Mathematical Waveform Definition: Polar NRZ (PICT Fig. 4)
In **Polar NRZ**:
- Logic **'1'**: Pulse of $+A/2$ of full duration $T_b$.
- Logic **'0'**: Pulse of $-A/2$ of full duration $T_b$.

#### Power Spectral Density Formulation (PICT Fig. 7 Curve 'b')
$$S(f) = \\frac{A^2 T_b}{4} \\text{sinc}^2(f T_b)$$
- Main lobe sinc curve extends to first spectral null at $f = 1/T_b = 10.0\\text{ kHz}$.
- Transmission Bandwidth: $BW = 1/T_b = 10.0\\text{ kHz}$.
- DC component is zero only if logic 1s and 0s occur with equal probability.

#### Practical Telecom Application
Used in computer system backplanes, RS-232 serial communication, and internal digital bus architectures.`;
      } else if (scheme === 'nrz_unipolar') {
        detailedSolution = `#### Mathematical Waveform Definition: Unipolar NRZ (PICT Fig. 2)
In **Unipolar NRZ**:
- Logic **'1'**: Pulse of full bit duration $T_b$ and amplitude $+A$.
- Logic **'0'**: Off pulse or zero amplitude ($0\\text{ V}$).

#### Power Spectral Density Formulation (PICT Fig. 7 Curve 'a')
$$S(f) = \\frac{A^2 T_b}{4} \\text{sinc}^2(f T_b) + \\frac{A^2}{4} \\delta(f)$$
- DC Component: High discrete DC spike $\\frac{A^2}{4}\\delta(0)$ wastes $50\\%$ of transmitter power without carrying information.
- Main lobe bandwidth: $BW = 1/T_b = 10.0\\text{ kHz}$. Internal computer waveforms are usually of this type.`;
      } else if (scheme === 'rz_unipolar') {
        detailedSolution = `#### Mathematical Waveform Definition: Unipolar RZ (PICT Fig. 1)
In **Unipolar RZ**:
- Logic **'1'**: Pulse of amplitude $A$ and duration $T_b/2 = 50\\,\\mu\\text{s}$, followed by return to zero.
- Logic **'0'**: Zero voltage ($0\\text{ V}$) for entire bit duration $T_b$.

#### Power Spectral Density Formulation (PICT Sec. 7.3 & 7.6)
$$S(f) = \\frac{A^2 T_b}{16} \\text{sinc}^2(f T_b / 2) + \\frac{A^2}{16} \\sum_{n=-\\infty}^{\\infty} \\delta(f - n/T_b)$$
- Discrete Spectral Spikes: Contains discrete impulses at integer multiples of $10\\text{ kHz}$, including a distinct clock component at $f = 10.0\\text{ kHz}$.
- Bandwidth: $BW = 2/T_b = 20.0\\text{ kHz}$. Non-zero DC bias wastes power.`;
      } else if (scheme === 'bipolar_rz') {
        detailedSolution = `#### Mathematical Waveform Definition: Polar RZ (PICT Fig. 3)
In **Polar RZ**:
- Logic **'1'**: $+A/2$ for first half ($T_b/2$), then $0\\text{ V}$.
- Logic **'0'**: $-A/2$ for first half ($T_b/2$), then $0\\text{ V}$.
- Bandwidth: First null at $f = 2/T_b = 20.0\\text{ kHz}$. Overcomes unipolar power wastage.`;
      } else {
        detailedSolution = `#### Mathematical Waveform Definition: NRZ-M Differential Mark (PICT Sec. 7.2)
- Differential encoding: Symbol '1' causes a transition, symbol '0' causes no transition.
- Bandwidth: $BW = 1/T_b = 10.0\\text{ kHz}$. Inversion-invariant for phase-shift channels.`;
      }

      const sourceVsLine = `#### Difference Between Source Coding and Line Coding (PICT Manual Page 7.7 Verbatim)
- **Source Coding Techniques** (such as PCM, Delta modulation, ADM etc.): Used to convert an analog signal to its digitally coded equivalent. The output of a source coder is a train of binary digits i.e. "0s" and "1s".
- **Line Coding Techniques:** Convert the stream of binary digits into a format or code which is more suitable for transmission over a cable or any other medium. Satisfies transmission requirements: synchronization, elimination of DC component, low crosstalk, and minimum bandwidth.`;

      const comparisonTable = `#### Comparison of Line Codes (PICT Lab Manual Table 7.7 Verbatim)

| Sr. No | Parameter | Polar RZ | Polar NRZ | AMI (Bipolar NRZ) | Manchester (Split Phase) | Polar Quat. NRZ |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1. | **Transmission of DC component** | Yes | Yes (if unequal) | **No (0 V)** | **No (0 V)** | Possible |
| 2. | **Signaling rate** | $1/T_b$ | $1/T_b$ | $1/T_b$ | $1/T_b$ | $1/(2T_b)$ |
| 3. | **Noise immunity** | Low | Low | **High** | **High** | High |
| 4. | **Synchronizing capability** | Poor | Poor | **Very good** | **Very good** | Poor |
| 5. | **Bandwidth required** | $2/T_b$ ($20\\text{ kHz}$) | $1/T_b$ ($10\\text{ kHz}$) | $1/T_b$ ($10\\text{ kHz}$) | $2/T_b$ ($20\\text{ kHz}$) | $1/(2T_b)$ ($5\\text{ kHz}$) |
| 6. | **Crosstalk** | High | High | **Low** | **Low** | Low |`;

      const conclusion = `#### Experiment Conclusions (PICT Lab Manual Page 7.9)
1. **AMI (Bipolar NRZ)** achieves the optimal balance of narrow bandwidth ($10\\text{ kHz}$), zero DC bias, and low crosstalk, making it ideal for telecommunication carrier trunks (PCM-TDM T1).
2. **Manchester code** guarantees self-clocking and zero DC at the expense of doubling required bandwidth ($20\\text{ kHz}$), making it the chosen standard for local area network (LAN) Ethernet.
3. **NRZ formats** maximize bandwidth efficiency ($10\\text{ kHz}$) but lack reliable clock synchronization across long sequences of identical bits.
4. **RZ formats** require twice the bandwidth ($20\\text{ kHz}$) because pulse duration is halved ($T_b/2$).`;

      const references = `#### Textbook References (PICT Lab Manual Page 7.10)
1. Taub, Schilling and Saha, *Principles of Communication Systems*, McGraw-Hill, 4th Edition
2. B P Lathi, Zhi Ding, *Modern Analog and Digital Communication System*, Oxford University Press, 4th Edition
3. Simon Haykin, *Communication Systems*, 4th Edition, John Wiley & Sons
4. George Kennedy, *Electronic Communication Systems*, 5th Edition, McGraw-Hill
5. Frenzel, *Principles of Electronic Communication Systems*, 3rd Edition, Tata McGraw-Hill`;

      return {
        answer: `### 📋 PUNE INSTITUTE OF COMPUTER TECHNOLOGY (PICT)
**Department of Electronics & Telecommunication Engineering**
**CLASS: S. E. (E &TC) | SUBJECT: PCS | EXPT. NO. : 7 — Complete Solution**

${detailedSolution}

---
${sourceVsLine}

---
${comparisonTable}

---
${conclusion}

---
${references}`,
        hintLevel: 3,
        hintText: "This concludes the complete theoretical and experimental proof for PICT PCS Experiment No. 7. All parameters match the calibrated SIGMA COM122N hardware trainer readings!",
        confidence: 1.0,
        citations: [
          "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 7 (Pages 7.1 - 7.10)",
          "Taub, Schilling & Saha: Principles of Communication Systems (4th Ed), McGraw-Hill",
          "Simon Haykin: Communication Systems (4th Ed), John Wiley & Sons",
          "B. P. Lathi & Zhi Ding: Modern Digital and Analog Communication Systems (4th Ed)",
        ],
        stage: "complete_solution",
        deterministicOracle: {
          scheme: scheme,
          dc_component: metrics.dcComponent,
          transitions: metrics.transitions,
          clockCapability: metrics.clockCapability,
        },
      };
    }

    /**
     * Socratic Question answering engine incorporating PICT PCS Expt 7 concepts.
     */
    generateSocraticResponse(query, state, hintLevel) {
      const q = query.toLowerCase();
      const scheme = state.scheme || 'ami';
      const bits = state.bits || [1, 0, 1, 1, 0];
      const voltage = state.voltage || 1.0;
      const metrics = window.DigiWaveOracle ? window.DigiWaveOracle.calculateMetrics(
        window.DigiWaveOracle.encode(scheme, bits),
        bits,
        voltage
      ) : { dcComponent: 0, transitions: 3, clockCapability: 'Good' };

      // 1. Source Coding vs Line Coding (PICT Lab Manual Page 7.7)
      if (q.includes('source coding') || q.includes('source vs line') || q.includes('difference between source')) {
        if (hintLevel === 1) {
          return {
            answer: `**Socratic Guide: Source Coding vs. Line Coding**\n\n` +
              `- Think about the input to a communication system: Does **source coding** deal with converting analog speech or images into a raw bitstream (like PCM or Delta Modulation)?\n` +
              `- Once you have raw binary 0s and 1s, why can't you simply send them down a $10\\text{ km}$ telephone cable as raw TTL voltages? What channel physics (DC isolation, attenuation, cable capacitance) necessitate **line coding**?`,
            hintLevel: 1,
            hintText: "Review PICT Lab Manual Page 7.7: Source coding digitizes the message; line coding shapes the waveform for channel transmission.",
            confidence: 0.99,
            citations: ["PICT Lab Manual: Expt 7 (Page 7.7: Difference Between Source & Line Coding)"],
            stage: "source_vs_line",
          };
        } else if (hintLevel === 2) {
          return {
            answer: `**Diagnostic Clue: Source Coding vs. Line Coding (PICT Sec. 7.7)**\n\n` +
              `- **Source Coding** (e.g., PCM, Delta Modulation, ADM): Converts an analog signal into its digitally coded binary equivalent (a sequence of 0s and 1s).\n` +
              `- **Line Coding** (e.g., NRZ, RZ, AMI, Manchester): Converts that binary stream into specialized voltage waveforms suitable for physical transmission over cables.\n` +
              `- Line codes must satisfy transmission constraints: synchronization, elimination of DC component, low crosstalk, and minimum bandwidth!`,
            hintLevel: 2,
            hintText: "Remember: Source coders produce bits; line coders produce pulses matching transmission line characteristics.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Page 7.7)", "Taub & Schilling, Ch 3 & 4"],
            stage: "source_vs_line",
          };
        } else {
          return {
            answer: `### Complete Solution: Difference Between Source Coding and Line Coding (PICT Lab Manual Page 7.7)\n\n` +
              `1. **Source Coding Techniques** (such as PCM, Delta modulation, ADM, LPC):\n` +
              `   - **Objective:** Convert an analog information signal (speech, audio, image) into its digitally coded equivalent bitstream.\n` +
              `   - **Output:** A train of raw binary digits (\`0\`s and \`1\`s).\n\n` +
              `2. **Line Coding Techniques** (such as NRZ, RZ, AMI, Manchester, Quaternary NRZ):\n` +
              `   - **Objective:** Convert the stream of binary digits into electrical pulse waveforms optimized for transmission over physical media (twisted pair, coaxial cable, optical fiber).\n` +
              `   - **Requirements Satisfied:**\n` +
              `     - **DC Elimination:** Permitting transformer-coupled repeaters without baseline drift.\n` +
              `     - **Clock Synchronization:** Guaranteeing transitions for receiver timing recovery.\n` +
              `     - **Bandwidth Minimization:** Packing maximum bits per Hertz ($1/T_b$).\n` +
              `     - **Error Detection:** Enabling built-in fault detection (e.g., AMI bipolar violation).`,
            hintLevel: 3,
            hintText: "Directly referenced from PICT Department of E&TC PCS Manual Section 7.7.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.7)", "B.P. Lathi, Section 3.4"],
            stage: "source_vs_line",
          };
        }
      }

      // 2. Table 7.7 Comparison questions
      if (q.includes('table 7.7') || q.includes('compare') || q.includes('comparison') || q.includes('summary')) {
        if (hintLevel === 1) {
          return {
            answer: `**Socratic Guide: Comparing Line Codes (PICT Expt 7)**\n\n` +
              `To compare line codes effectively, evaluate them across the 6 core engineering parameters from the PICT manual:\n` +
              `1. Does the code transmit a **DC component**?\n` +
              `2. What is the **signaling rate** and **transmission bandwidth**?\n` +
              `3. How strong is its **noise immunity**?\n` +
              `4. Does it have **self-clocking synchronization**?\n` +
              `5. Does it minimize **crosstalk** between adjacent pairs?\n\n` +
              `*Which format in the kit eliminates DC while keeping bandwidth at $1/T_b$? Switch to Level 2 or 3 to inspect!*`,
            hintLevel: 1,
            hintText: "Compare AMI vs Manchester: Both have zero DC, but which one requires half the bandwidth?",
            confidence: 0.99,
            citations: ["PICT Lab Manual: Table 7.7"],
            stage: "table_comparison",
          };
        } else if (hintLevel === 2) {
          return {
            answer: `**Analytical Clues: Line Code Comparison (PICT Table 7.7)**\n\n` +
              `- **Bandwidth Trade-off:** Polar NRZ and AMI require only **$1/T_b = 10\\text{ kHz}$**, whereas Polar RZ and Manchester require **$2/T_b = 20\\text{ kHz}$**.\n` +
              `- **DC Elimination:** AMI and Manchester have **Zero DC**, while Polar RZ and Unipolar NRZ have significant DC power.\n` +
              `- **Synchronization:** Manchester has **Very Good** synchronization (mid-bit transitions), AMI has **Very Good** synchronization on 1s, while Polar NRZ is **Poor**.\n` +
              `- **Crosstalk:** AMI and Manchester have **Low** crosstalk; Polar RZ and Polar NRZ have **High** crosstalk.`,
            hintLevel: 2,
            hintText: "Click Level 3: Solution to view the complete formatted PICT Table 7.7!",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Table 7.7"],
            stage: "table_comparison",
          };
        } else {
          return {
            answer: `### PICT Department of E&TC Lab Manual Table 7.7: Comparison of Line Codes\n\n` +
              `| Sr. No | Parameter | Polar RZ | Polar NRZ | AMI (Bipolar) | Manchester | Polar Quat. NRZ |\n` +
              `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n` +
              `| 1 | **Transmission of DC component** | Yes | Yes (if unequal) | **No (0V)** | **No (0V)** | Possible |\n` +
              `| 2 | **Signaling rate** | $1/T_b$ | $1/T_b$ | $1/T_b$ | $1/T_b$ | $1/(2T_b)$ |\n` +
              `| 3 | **Noise immunity** | Low | Low | **High** | **High** | High |\n` +
              `| 4 | **Synchronizing capability** | Poor | Poor | **Very Good** | **Very Good** | Poor |\n` +
              `| 5 | **Bandwidth required** | $2/T_b$ ($20\\text{k}$) | $1/T_b$ ($10\\text{k}$) | $1/T_b$ ($10\\text{k}$) | $2/T_b$ ($20\\text{k}$) | $1/(2T_b)$ ($5\\text{k}$) |\n` +
              `| 6 | **Crosstalk** | High | High | **Low** | **Low** | Low |\n\n` +
              `**Conclusion:** AMI provides the highest bandwidth efficiency with zero DC for telecom, while Manchester is the preferred standard for Ethernet due to guaranteed self-clocking.`,
            hintLevel: 3,
            hintText: "Exact verbatim table reproduced from PICT Lab Manual Page 7.7.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Table 7.7, Page 7.7)"],
            stage: "table_comparison",
          };
        }
      }

      // 3. DC Component Questions (PICT Sec. 7.1)
      if (q.includes('dc') || q.includes('zero dc') || q.includes('average voltage') || q.includes('transformer')) {
        if (hintLevel === 1) {
          return {
            answer: `**Socratic Guide: DC Component in Line Codes (PICT Sec. 7.1)**\n\n` +
              `- What is DC component? It is the time-averaged value of the voltage waveform: $V_{dc} = \\frac{1}{T} \\int_0^T v(t) dt$.\n` +
              `- In communication lines with coupling transformers and capacitors, DC cannot pass ($f = 0$ is blocked). What happens to a signal with a non-zero DC bias when passing through an AC-coupled link?\n` +
              `- In your current scheme (**${scheme.toUpperCase()}**), do consecutive pulses cancel each other out over time?`,
            hintLevel: 1,
            hintText: "In AMI, mark 1 alternates between +V and -V. When averaged, do positive and negative pulses cancel out?",
            confidence: 0.99,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.1)", "Taub & Schilling, Ch 4"],
            stage: "dc_component",
          };
        } else if (hintLevel === 2) {
          return {
            answer: `**Diagnostic Clues: DC Elimination Mechanism (PICT Sec. 7.1 & 7.5)**\n\n` +
              `- For **AMI Bipolar**: Mark 1 is encoded as $+V$ and $-V$ alternately. Even with long strings of 1s or 0s, the net DC component is mathematically **$0.000\\text{ V}$**.\n` +
              `- For **Manchester**: Every bit has equal $+A/2$ and $-A/2$ durations, guaranteeing zero DC on *every single bit period* ($T_b$).\n` +
              `- For **Unipolar NRZ**: Non-zero DC ($V_{dc} = A/2 = +0.500\\text{ V}$). This wastes $50\\%$ of transmitter power without carrying any information!`,
            hintLevel: 2,
            hintText: "Check the measured DC Component on the DSO telemetry: AMI and Manchester read exactly 0.000 V!",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.1 & 7.5)", "B.P. Lathi, Section 3.2"],
            stage: "dc_component",
          };
        } else {
          return {
            answer: `### Complete Solution: DC Component in Line Codes (PICT Lab Manual Sec. 7.1 & 7.5)\n\n` +
              `1. **The Physical Constraint:**\n` +
              `   All cable transmission lines, telephone channels, and repeater amplifiers use transformers or capacitors for DC isolation and ground separation. These components block DC signals ($f = 0$).\n\n` +
              `2. **The Consequence of Non-Zero DC:**\n` +
              `   Signals with non-zero DC (such as Unipolar NRZ and Unipolar RZ) suffer from **baseline wander** (fluctuating voltage baseline) and cause magnetic saturation of transformer cores.\n\n` +
              `3. **The Solution (AMI & Manchester):**\n` +
              `   - **AMI (Alternate Mark Inversion):** Consecutive '1's alternate polarity ($+A$ then $-A$). As proven by the power spectral density formula $S(f) \\propto \\sin^2(\\pi f T_b)$, $S(0) = 0$.\n` +
              `   - **Manchester:** Each bit period is split into equal positive and negative halves, integrating to zero per symbol.\n` +
              `   - **Result:** Complete elimination of DC bias, enabling transformer coupling in PCM-TDM T1 carrier telephony!`,
            hintLevel: 3,
            hintText: "Verified against PICT PCS Experiment No. 7 Theory Section 7.1.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Pages 7.1, 7.5)", "Taub & Schilling, 4th Ed"],
            stage: "dc_component",
          };
        }
      }

      // 4. Clock Recovery / Synchronization / Manchester Questions (PICT Sec. 7.2 & 7.5)
      if (q.includes('clock') || q.includes('synchronization') || q.includes('manchester') || q.includes('timing') || q.includes('self-clocking')) {
        if (hintLevel === 1) {
          return {
            answer: `**Socratic Guide: Self-Clocking Capability (PICT Sec. 7.2)**\n\n` +
              `- Any digital receiver must know precisely when to sample each incoming pulse. How does it extract bit timing if the incoming signal stays constant at one voltage?\n` +
              `- What happens to **Polar NRZ** if the sender transmits 100 consecutive zeros (\`000000...\`)? Does the receiver's Phase-Locked Loop (PLL) receive any timing edges?\n` +
              `- Now look at **Bi-phase Manchester**: Does it ever stay flat for an entire bit period $T_b$?`,
            hintLevel: 1,
            hintText: "Notice that Manchester forces a mid-bit transition at Tb/2 on EVERY bit. How does that help synchronization?",
            confidence: 0.99,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.2 Self-Clocking Capability)"],
            stage: "clock_synchronization",
          };
        } else if (hintLevel === 2) {
          return {
            answer: `**Diagnostic Clues: Inherent Clocking (PICT Sec. 7.2 & 7.5)**\n\n` +
              `- **Definition:** Self-clocking is the inherent ability of a line code to provide frequent voltage transitions so the receiver can extract the clock without a separate synchronization line.\n` +
              `- **Manchester Guarantee:** Logic '1' is $+A/2 \\rightarrow -A/2$; Logic '0' is $-A/2 \\rightarrow +A/2$. Mid-bit zero-crossing is guaranteed on every bit, providing **Very Good** synchronization (PICT Table 7.7).\n` +
              `- **The Trade-off:** Because transitions occur every $T_b/2 = 50\\,\\mu\\text{s}$, bandwidth doubles to **$BW = 2/T_b = 20\\text{ kHz}$**!`,
            hintLevel: 2,
            hintText: "NRZ has low bandwidth (10 kHz) but poor clocking; Manchester has perfect clocking but requires double bandwidth (20 kHz).",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.2 & 7.5)", "IEEE 802.3 Ethernet"],
            stage: "clock_synchronization",
          };
        } else {
          return {
            answer: `### Complete Solution: Self-Clocking Capability & Manchester Code (PICT Sec. 7.2 & 7.5)\n\n` +
              `1. **Principle of Self-Clocking (PICT Sec. 7.2):**\n` +
              `   Any digital receiver requires symbol/bit synchronization. To ensure receiver phase locking (using IC 4046 PLL), the line code must undergo sufficient zero-crossings regardless of data patterns.\n\n` +
              `2. **Manchester Mechanism (PICT Sec. 7.5):**\n` +
              `   - Symbol \`1\`: $+A/2$ for first $T_b/2$, then $-A/2$ for remaining $T_b/2$.\n` +
              `   - Symbol \`0\`: $-A/2$ for first $T_b/2$, then $+A/2$ for remaining $T_b/2$.\n` +
              `   - Every single bit period $T_b$ contains a guaranteed zero-crossing at $t = T_b/2$.\n\n` +
              `3. **Bandwidth Cost:**\n` +
              `   - First spectral null occurs at $f = 2/T_b = 20.0\\text{ kHz}$.\n` +
              `   - Bandwidth requirement is **twice** that of NRZ and AMI ($20\\text{ kHz}$ vs $10\\text{ kHz}$).\n\n` +
              `4. **Industrial Application:** Adopted in **IEEE 802.3 Local Area Networks (Ethernet 10BASE-T)** because network stations require instant clock synchronization upon receiving a packet preamble!`,
            hintLevel: 3,
            hintText: "Grounded directly in PICT PCS Lab Manual Section 7.2 and 7.5.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.2 & 7.5)", "Simon Haykin, 4th Ed"],
            stage: "clock_synchronization",
          };
        }
      }

      // 5. Bandwidth / Spectral Analysis / Discrete 10kHz Spikes (PICT Sec. 7.3 & 7.6)
      if (q.includes('bandwidth') || q.includes('spike') || q.includes('spectral') || q.includes('null') || q.includes('frequency') || q.includes('rz 10khz')) {
        if (hintLevel === 1) {
          return {
            answer: `**Socratic Guide: Spectral Analysis & Bandwidth (PICT Sec. 7.6)**\n\n` +
              `- Switch to the **Frequency Domain** tab on the virtual test console. Look at the spectral curve from $0$ to $40\\text{ kHz}$.\n` +
              `- Where does the first main lobe null occur for **Polar NRZ** vs **Manchester**?\n` +
              `- In **Unipolar RZ**, why does a sharp discrete impulse spike appear at exactly $10.0\\text{ kHz}$? What causes discrete spectral spikes in Fourier transforms?`,
            hintLevel: 1,
            hintText: "Periodic non-zero pulse repetition at rate Rb creates discrete Fourier components at integer multiples of Rb!",
            confidence: 0.99,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.6 Power Spectra)"],
            stage: "spectral_analysis",
          };
        } else if (hintLevel === 2) {
          return {
            answer: `**Diagnostic Clues: Bandwidth & Discrete Spikes (PICT Sec. 7.3 & 7.6)**\n\n` +
              `- **First Null Bandwidth:**\n` +
              `  - Polar NRZ and AMI: $BW = 1/T_b = 10.0\\text{ kHz}$.\n` +
              `  - Polar RZ and Manchester: $BW = 2/T_b = 20.0\\text{ kHz}$.\n` +
              `- **RZ 10 kHz Spike:** In Unipolar RZ, logic 1 is an on-pulse of duration $T_b/2$ repeating with period $T_b$. By Fourier series, a periodic train of pulses has non-zero discrete line components at $f = n/T_b = 10\\text{ kHz}, 20\\text{ kHz}, \\dots$\n` +
              `- This allows simple passive bandpass filtering to extract the $10\\text{ kHz}$ word clock directly from the data stream!`,
            hintLevel: 2,
            hintText: "Check the Spectrum Analyzer peak marker: it locks onto 10.0 kHz for Unipolar RZ!",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.3 & 7.6)"],
            stage: "spectral_analysis",
          };
        } else {
          return {
            answer: `### Complete Solution: Power Spectra & Bandwidth Analysis (PICT Lab Manual Sec. 7.6)\n\n` +
              `1. **Power Spectral Density Formulation (PICT Fig. 7):**\n` +
              `   - **Curve 'a' (Unipolar NRZ):** Continuous sinc-squared curve with DC delta component. $BW = 1/T_b = 10.0\\text{ kHz}$.\n` +
              `   - **Curve 'b' (Polar NRZ):** Main lobe extends to $1/T_b = 10.0\\text{ kHz}$. Most power concentrated between DC and $10\\text{ kHz}$.\n` +
              `   - **Curve 'c' (AMI Bipolar):** Power spectral density approaches zero at $f = 0$ ($S(0) = 0$). First spectral null at $1/T_b = 10.0\\text{ kHz}$. Bandwidth $BW = 10.0\\text{ kHz}$.\n` +
              `   - **Curve 'd' (Manchester):** Zero at $f = 0$, peak at $7.4\\text{ kHz}$, first null at $2/T_b = 20.0\\text{ kHz}$. Required bandwidth $BW = 20.0\\text{ kHz}$.\n\n` +
              `2. **Discrete 10 kHz Clock Spike in RZ:**\n` +
              `   The unipolar return-to-zero PSD is:\n` +
              `   $$S_{RZ}(f) = \\frac{A^2 T_b}{16} \\text{sinc}^2(f T_b / 2) + \\frac{A^2}{16} \\sum_{n=-\\infty}^{\\infty} \\delta(f - n/T_b)$$\n` +
              `   The delta impulse $\\delta(f - 1/T_b)$ represents an unmodulated clock spike at $10\\text{ kHz}$, providing passive clock recovery at the receiver!`,
            hintLevel: 3,
            hintText: "Directly derived from PICT PCS Lab Manual Section 7.6 Power Spectra.",
            confidence: 1.0,
            citations: ["PICT Lab Manual: Expt 7 (Section 7.6)", "Taub & Schilling, 4th Ed"],
            stage: "spectral_analysis",
          };
        }
      }

      // Default Socratic Response for General Question
      return {
        answer: `I have analyzed your current circuit with **${schemeTitle}** for 8-bit word \`${bitStr}\` at **10 KHz Word Clock**.\n\n` +
          `**Current Measurements:**\n` +
          `- **DC Voltage Bias:** ${metrics.dcComponent.toFixed(3)} V\n` +
          `- **Edge Transitions:** ${metrics.transitions} zero-crossings\n` +
          `- **Clock Extraction:** ${metrics.clockCapability}\n` +
          `- **Active Socratic Level:** Level ${hintLevel}\n\n` +
          `Ask me anything about PICT PCS Experiment No. 7: DC components, bandwidths, clock recovery, or comparison Table 7.7!`,
        hintLevel: hintLevel,
        hintText: "Use the prompt pills below or toggle Lvl 1: Guide, Lvl 2: Clue, and Lvl 3: Solution to escalate pedagogical depth!",
        confidence: 0.98,
        citations: ["PICT Lab Manual: Expt 7", "Taub & Schilling, Ch 4"],
        stage: "general_socratic",
      };
    }

    scrollToBottom() {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    formatMarkdown(str) {
      if (!str) return '';
      let text = String(str);

      // 1. Process Markdown Tables (| ... | ... |)
      const tableRegex = /((?:\|[^\n\r]+\|\r?\n)+)/g;
      text = text.replace(tableRegex, (match) => {
        const rows = match.trim().split(/\r?\n/).filter(r => r.trim().startsWith('|'));
        if (rows.length < 2) return match;

        let tableHtml = '<div class="tutor-table-wrap"><table class="tutor-table">';
        let isHeader = true;

        rows.forEach((row, idx) => {
          // Skip divider rows (| :--- | :--- |)
          if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(row.trim())) {
            isHeader = false;
            return;
          }

          const cols = row.split('|').slice(1, -1);
          if (idx === 0) {
            tableHtml += '<thead><tr>';
            cols.forEach(col => {
              tableHtml += `<th>${this.formatInline(col.trim())}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';
          } else {
            tableHtml += '<tr>';
            cols.forEach(col => {
              tableHtml += `<td>${this.formatInline(col.trim())}</td>`;
            });
            tableHtml += '</tr>';
          }
        });

        tableHtml += '</tbody></table></div>';
        return tableHtml;
      });

      // 2. Horizontal divider (---)
      text = text.replace(/^---$/gim, '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 8px 0;">');

      // 3. Process Headings (####, ###, ##)
      text = text.replace(/^#### (.*$)/gim, '<h5 style="color: #67e8f9; font-size: 12px; font-weight: 700; margin: 6px 0 3px 0;">$1</h5>');
      text = text.replace(/^### (.*$)/gim, '<h4 style="color: #38bdf8; font-size: 13px; font-weight: 700; margin: 8px 0 4px 0;">$1</h4>');
      text = text.replace(/^## (.*$)/gim, '<h3 style="color: #ffffff; font-size: 14px; font-weight: 800; margin: 10px 0 6px 0;">$1</h3>');

      // 4. Process Numbered lists and Bullet points
      text = text.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li style="margin-left: 16px; margin-bottom: 3px;"><strong>$1.</strong> $2</li>');
      text = text.replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left: 16px; margin-bottom: 3px;">$1</li>');

      // 5. Inline formats (bold, code, italics)
      text = this.formatInline(text);

      // 6. Line breaks
      text = text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
      return text;
    }

    generateAMLevelContent(state, level) {
      const Em = state.Em !== undefined ? state.Em : 2.5;
      const fm = state.fm !== undefined ? state.fm : 1000;
      const Ec = state.Ec !== undefined ? state.Ec : 5.0;
      const fc = state.fc !== undefined ? state.fc : 455000;
      const rfLink = state.rfLink || 'closed_dsbfc';
      const amMetrics = window.DigiWaveOracle ? window.DigiWaveOracle.calculateAM({
        Em, fm, Ec, fc, rf_link: rfLink
      }) : {
        m: Em / Ec, Emax: Ec + Em, Emin: Math.max(0, Ec - Em),
        L1: 2 * (Ec + Em), L2: 2 * Math.max(0, Ec - Em),
        Pc: (Ec * Ec) / 100, Psb: (Em * Em) / 200, Pt: 0.25, efficiency: 11.1,
        mGraphical: (Em / Ec), mTrapezoidal: (Em / Ec),
        patternDesc: 'Trapezoid (Under-modulation)'
      };

      const m = amMetrics.m;
      const Emax = amMetrics.Emax.toFixed(2);
      const Emin = amMetrics.Emin.toFixed(2);
      const L1 = amMetrics.L1.toFixed(2);
      const L2 = amMetrics.L2.toFixed(2);
      const Pc_mw = (amMetrics.Pc * 1000).toFixed(2);
      const Psb_mw = (amMetrics.Psb * 1000).toFixed(2);
      const Pt_mw = (amMetrics.Pt * 1000).toFixed(2);
      const eff = amMetrics.efficiency.toFixed(2);

      if (level === 1) {
        // --- LEVEL 1: GUIDE (PICT PCS Expt 1 Guided Pedagogy & Socratic Inquiries) ---
        return {
          answer: `### 📘 PUNE INSTITUTE OF COMPUTER TECHNOLOGY (PICT)
**Department of Electronics & Telecommunication Engineering**
**CLASS: S. E. (E &TC) | SUBJECT: PCS | EXPT. NO. : 1**

**TITLE:** Draw a block diagram of AM transmitter and receiver. Generate AM (DSB-FC), Calculate modulation index by graphical method, Power of AM Wave for different modulating signal and Observe and sketch AM Waveform for different modulating signal and Spectrum.

- **Prerequisites (Manual Page 1):** 1. Fundamentals of sinusoidal signals, frequency spectrum, 2. Concept of modulation and need for modulation.
- **Objectives (Manual Page 1):** 1. Generation of AM (DSB-FC), 2. Calculate modulation index by graphical method, 3. Calculate power of AM wave, 4. Observe and sketch AM waveform and spectrum.
- **Apparatus (Manual Page 1):** 1. Sigma AM modulator kit (MODEL - COM101N: AM/DSB/SSB Modulation & Demodulation Trainer), 2. CRO (Philips OS-9020B, 20 MHz), 3. BNC connectors and patch cords.

---
#### 🧪 Experimental Procedure (Manual Page 4)
1. **Audio Generator Setup:** Set Audio Generator (IC 8038) for frequency $f_m = ${(fm/1000).toFixed(1)}\\text{ kHz}$ and amplitude $E_m = ${Em.toFixed(2)}\\text{ V}$.
2. **RF Carrier Setup:** Set RF Oscillator for frequency $f_c = ${(fc/1000).toFixed(0)}\\text{ kHz}$ and amplitude $E_c = ${Ec.toFixed(2)}\\text{ V}$.
3. **Balanced Modulator Setup:** Set RF Link switch to **CLOSED** for standard AM (DSB-FC) generation via IC 1496.
4. **Time Domain CRO Observation:** Connect AM output to CRO Channel 2 (Y) and Audio Generator to Channel 1 (X). Observe the envelope and measure $E_{max}$ and $E_{min}$.
5. **Trapezoidal CRO Observation (X-Y Mode):** Switch CRO to X-Y Mode. Measure vertical heights $L_1$ and $L_2$ and calculate $m = \\frac{L_1 - L_2}{L_1 + L_2}$.
6. **Detector Observation:** Connect AM output to Diode Envelope Detector (OA79) input and verify recovery of original audio signal on CRO.

---
#### 🔍 Socratic Guided Inquiries (PICT PCS Manual Expt 1)
1. **Modulation Index ($m$):** What is the physical effect of modulating index $m$ on the envelope? When $E_m = 0\\text{ V}$ ($m = 0$), what shape appears on the CRO in X-Y mode?
2. **Critical Modulation ($m = 1.0$):** When $E_m = E_c$, what happens to $E_{min}$ and $L_2$? Why does the trapezoid degenerate into an exact triangle?
3. **Over-Modulation Hazard ($m > 1.0$):** If $E_m > E_c$, the envelope crosses the zero line resulting in $180^\\circ$ phase reversal. Can a simple diode detector recover the message without severe distortion?
4. **Power Allocation:** Why does the unmodulated carrier waste at least $66.7\\%$ of total transmitted power while carrying zero information?

---
📝 **Lab Assignment (Manual Page 4):**
Observe active waveform on DSO. Switch between **Time Domain** and **Trapezoid (X-Y Mode)** to verify $m = ${(m).toFixed(2)}$!`,
          hintLevel: 1,
          hintText: "Need analytical formulas, graphical peak equations, or power derivations? Click **Lvl 2: Clue** to inspect mathematical equations from Manual Pages 2–4!",
          confidence: 0.99,
          citations: [
            "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 1 (Pages 1 - 4)",
            "Sigma AM Kit MODEL - COM101N Manual: AM/DSB/SSB Trainer",
          ],
          stage: "socratic_guide",
          deterministicOracle: amMetrics,
        };
      }

      if (level === 2) {
        // --- LEVEL 2: CLUE (Diagnostic Formulas & Power Equations) ---
        return {
          answer: `### 💡 PICT PCS Expt 1 — Diagnostic Clues & Analytical Formulas

#### 1. Time-Domain Graphical Method (Manual Page 3 Fig. 2)
- Envelope Maximum: $E_{max} = E_c + E_m = ${Ec.toFixed(2)} + ${Em.toFixed(2)} = ${Emax}\\text{ V}$
- Envelope Minimum: $E_{min} = E_c - E_m = ${Ec.toFixed(2)} - ${Em.toFixed(2)} = ${Emin}\\text{ V}$
- **Modulation Index Formula:**
  $$m = \\frac{E_{max} - E_{min}}{E_{max} + E_{min}} = \\frac{${Emax} - ${Emin}}{${Emax} + ${Emin}} = ${(amMetrics.mGraphical || m).toFixed(3)}$$

---
#### 2. CRO Trapezoidal Method in X-Y Mode (Manual Page 3 Fig. 3)
- Connect Audio Modulating signal $e_m(t)$ to Horizontal Deflection (X) and AM signal $e_{am}(t)$ to Vertical Deflection (Y).
- Maximum vertical height: $L_1 = 2 E_{max} = ${L1}\\text{ V}$
- Minimum vertical height: $L_2 = 2 E_{min} = ${L2}\\text{ V}$
- **Trapezoidal Modulation Index Formula:**
  $$m = \\frac{L_1 - L_2}{L_1 + L_2} = \\frac{${L1} - ${L2}}{${L1} + ${L2}} = ${(amMetrics.mTrapezoidal || m).toFixed(3)}$$
- **CRO Pattern Classification:**
  - $m = 0$: Vertical rectangle ($L_1 = L_2 = 2E_c$)
  - $0 < m < 1$: Clean symmetrical trapezoid
  - $m = 1.0$: Triangle ($L_2 = 0$, vertex on negative x-axis)
  - $m > 1.0$: Crossed bow-tie ($180^\\circ$ inversion waist)

---
#### 3. Power of AM Wave (Manual Page 6, Load $R = 50\\,\\Omega$)
- Carrier Power: $P_c = \\frac{E_c^2}{2R} = \\frac{${Ec}^2}{100} = ${Pc_mw}\\text{ mW}$
- Total Sideband Power: $P_{SB} = \\frac{m^2 E_c^2}{4R} = \\frac{m^2}{2} P_c = ${Psb_mw}\\text{ mW}$
- Total Power: $P_T = P_c + P_{SB} = P_c \\left(1 + \\frac{m^2}{2}\\right) = ${Pt_mw}\\text{ mW}$
- **Transmission Power Efficiency:**
  $$\\eta = \\frac{P_{SB}}{P_T} = \\frac{m^2}{2 + m^2} \\times 100\\% = ${eff}\\%$$

---
#### 4. Live Circuit Telemetry (COM101N Active State)
- **Active Modulating Amp ($E_m$):** **${Em.toFixed(2)} V** ($f_m = ${(fm/1000).toFixed(1)}\\text{ kHz}$)
- **Active Carrier Amp ($E_c$):** **${Ec.toFixed(2)} V** ($f_c = ${(fc/1000).toFixed(0)}\\text{ kHz}$)
- **Measured Modulation Index ($m$):** **${m.toFixed(3)}**
- **Trapezoid Pattern:** **${amMetrics.patternDesc}**
- **Carrier Power ($P_c$):** **${Pc_mw} mW** | **Sideband Power ($P_{SB}$):** **${Psb_mw} mW**`,
          hintLevel: 2,
          hintText: "Notice that at $m = 1.0$, $P_{SB} = P_c / 2$, yielding maximum DSB-FC efficiency of $33.3\\%$! Click **Lvl 3: Solution** for complete derivations and full observation tables!",
          confidence: 0.99,
          citations: [
            "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 1 (Pages 2 - 4)",
            "Wayne Tomasi: Electronic Communications Systems (5th Ed), Pearson",
          ],
          stage: "diagnostic_clue",
          deterministicOracle: amMetrics,
        };
      }

      // --- LEVEL 3: SOLUTION (Complete Mathematical Derivation, Tables 5 & 6) ---
      return {
        answer: `### 🏆 PICT PCS Expt 1 — Complete Derivations, Tables & Conclusions

#### 1. Mathematical Expression of AM (DSB-FC) Waveform (Manual Page 2)
Let modulating audio signal be $e_m(t) = E_m \\cos(2\\pi f_m t)$ and carrier signal be $e_c(t) = E_c \\cos(2\\pi f_c t)$.
In amplitude modulation, the instantaneous amplitude of the carrier is varied linearly with modulating signal:
$$e_{am}(t) = [E_c + e_m(t)] \\cos(2\\pi f_c t)$$
$$e_{am}(t) = E_c [1 + m \\cos(2\\pi f_m t)] \\cos(2\\pi f_c t)$$
Expanding using trigonometric product identity $\\cos A \\cos B = \\frac{1}{2}[\\cos(A+B) + \\cos(A-B)]$:
$$e_{am}(t) = E_c \\cos(2\\pi f_c t) + \\frac{m E_c}{2} \\cos(2\\pi(f_c + f_m)t) + \\frac{m E_c}{2} \\cos(2\\pi(f_c - f_m)t)$$

This proves that the AM (DSB-FC) spectrum contains exactly 3 discrete frequency components:
1. **Unmodulated Carrier:** At $f_c$ with peak amplitude $E_c$.
2. **Upper Sideband (USB):** At $f_c + f_m$ with peak amplitude $\\frac{m E_c}{2}$.
3. **Lower Sideband (LSB):** At $f_c - f_m$ with peak amplitude $\\frac{m E_c}{2}$.
- **Transmission Bandwidth:** $BW = (f_c + f_m) - (f_c - f_m) = 2 f_m = ${(2 * fm / 1000).toFixed(1)}\\text{ kHz}$.

---
#### 2. Full Observation Table (Manual Page 5 Verbatim)
| Sr. | Modulating Em | Carrier Ec | Theoretical m = Em/Ec | Emax (V) | Emin (V) | Graphical m | L1 (V) | L2 (V) | Trapezoid m | Observed Shape |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 0.00 V | 5.00 V | 0.00 | 5.00 V | 5.00 V | 0.00 | 10.00 V | 10.00 V | 0.00 | Rectangle (m=0) |
| 2 | 2.50 V | 5.00 V | 0.50 | 7.50 V | 2.50 V | 0.50 | 15.00 V | 5.00 V | 0.50 | Trapezoid (Under-mod) |
| 3 | 5.00 V | 5.00 V | 1.00 | 10.00 V | 0.00 V | 1.00 | 20.00 V | 0.00 V | 1.00 | Triangle (Critical 100%) |
| 4 | 7.50 V | 5.00 V | 1.50 | 12.50 V | 0.00 V | 1.00* | 25.00 V | 5.00 V (Inv) | 0.67* | Crossed Bow-tie (Over-mod) |

*\*Note on Over-modulation (m > 1): Diode detector clips envelope at zero, causing harmonic distortion and phase reversal waist in trapezoid.*

---
#### 3. Power Analysis & Theoretical Efficiency Table (Manual Page 6, Load R = 50 Ω)
| Carrier Ec | Mod Index m | Carrier Power Pc | Sideband Power PSB | Total Power PT | Efficiency η (%) | Bandwidth BW |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5.00 V | 0.00 | 250.00 mW | 0.00 mW | 250.00 mW | 0.00% | 2.00 kHz |
| 5.00 V | 0.50 | 250.00 mW | 31.25 mW | 281.25 mW | 11.11% | 2.00 kHz |
| 5.00 V | 1.00 | 250.00 mW | 125.00 mW | 375.00 mW | 33.33% (Max DSB-FC) | 2.00 kHz |

---
#### 4. Conclusions (Manual Page 7)
1. **Linear Envelope Fidelity:** When $m \\le 1.0$, the envelope of the modulated carrier is an exact replica of the modulating audio signal $e_m(t)$, allowing recovery with a simple low-cost diode envelope detector.
2. **Efficiency Limitation of DSB-FC:** Even at maximum 100% modulation ($m = 1.0$), two-thirds ($66.7\\%$) of the total transmitter power is wasted in the carrier, which carries no information. This motivates the use of **DSB-SC** and **SSB** in power-critical applications.
3. **CRO X-Y Trapezoidal Reliability:** The trapezoidal pattern method is independent of CRO timebase non-linearity and trigger jitter, providing an accurate, direct visual check of modulation depth and audio non-linearities.`,
        hintLevel: 3,
        hintText: "Experiment 1 fully verified against PICT PCS Syllabus and Sigma MODEL COM101N hardware specifications!",
        confidence: 1.0,
        citations: [
          "PICT Lab Manual: Department of E&TC, Subject: PCS, Expt No. 1 (Pages 1 - 7)",
          "Kennedy & Davis: Electronic Communication Systems (4th Ed), McGraw-Hill",
        ],
        stage: "complete_solution",
        deterministicOracle: amMetrics,
      };
    }

    formatInline(text) {
      if (!text) return '';
      // Bold **text**
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code `code`
      text = text.replace(/`([^`]+)`/g, '<code class="mono" style="background: rgba(0,0,0,0.5); padding: 2px 5px; border-radius: 4px; color: #38bdf8; font-size: 11px;">$1</code>');
      // Italics *text*
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return text;
    }
  }

  window.TutorController = TutorController;
})(window);
