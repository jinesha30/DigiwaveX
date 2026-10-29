/**
 * DigiWave X — Student Misconceptions & Fault Injection Sandbox
 * Implements curated hardware faults and pedagogical misconception detection.
 */

(function (window) {
  'use strict';

  const MISCONCEPTIONS = [
    {
      id: 'ami_polarity_reset',
      name: 'AMI Polarity Reset after Zeros',
      tag: 'AMI Polarity Hazard',
      description: 'Assuming a run of zeros resets mark polarity to +1. In true AMI, polarity alternates across the whole stream regardless of intervening zeros.',
      detect: 'ami_marks_not_alternating',
      action: (app) => {
        app.setBitstream([1, 0, 0, 1, 0, 1]);
        app.setScheme('ami');
        // Inject misconception waveform
        const trueWaveform = window.DigiWaveOracle.encode('ami', [1, 0, 0, 1, 0, 1]);
        const flawedWaveform = window.DigiWaveOracle.encode('ami', [1, 0, 0, 1, 0, 1], 2, { misconceptionResetZeros: true });
        
        app.oscilloscope.setWaveforms(flawedWaveform, [1, 0, 0, 1, 0, 1], 2, 1.0);
        
        // Flag AMI Code Violation
        const violations = window.DigiWaveOracle.checkAMIViolation(flawedWaveform, 2);
        
        app.tutor.addAIMessage({
          answer: `**FAULT DETECTED: AMI Code Violation (CV) at Bit Index ${violations.join(', ')}!**\n\nThe student model mistakenly reset the mark polarity back to +1 after the zeros (transmitting +1, 0, 0, +1 instead of +1, 0, 0, -1).\n\nIn standard Alternate Mark Inversion, polarity alternation is preserved *across the entire stream*. Intervening zeros must never reset the polarity sequence!`,
          hintLevel: 2,
          hintText: "Check the 4th bit: both Bit 0 and Bit 3 are at +1V! Consecutive marks of identical polarity create DC drift and violate bipolar coding rules.",
          confidence: 1.0,
          citations: ["AT&T Technical Journal: T1 Carrier Transmission System", "ITU-T Recommendation G.703"],
          stage: "diagnose_ami_violation",
        });
      }
    },
    {
      id: 'nrzl_vs_nrzi',
      name: 'NRZ-L vs NRZ-M Differential Confusion',
      tag: 'Level vs Transition',
      description: 'Treating NRZ-L as transition-based rather than level-based. NRZ-M differential encoding toggles state on mark (1) and holds on space (0).',
      detect: 'level_vs_transition_mismatch',
      action: (app) => {
        app.setBitstream([1, 0, 1, 1, 0]);
        app.setScheme('nrzm');
        app.tutor.addAIMessage({
          answer: `**Concept Demonstration: NRZ-M (Mark / Differential Encoding)**\n\nUnlike NRZ-L where bit 1 is simply +1V and bit 0 is -1V, in NRZ-M:\n- Every **1 (Mark)** causes an instantaneous transition (level flip).\n- Every **0 (Space)** causes NO transition (level holds constant).\n\nDifferential encoding eliminates polarity ambiguity in transmission channels!`,
          hintLevel: 1,
          hintText: "Observe the bits: wherever there is a '0', the voltage holds steady with zero transitions. Wherever there is a '1', the waveform toggles immediately.",
          confidence: 0.99,
          citations: ["Proakis: Digital Communications, Ch 4", "Sklar: Digital Communications Fundamentals"],
          stage: "nrzm_concept",
        });
      }
    },
    {
      id: 'manchester_convention',
      name: 'Manchester Convention Inversion (IEEE vs Thomas)',
      tag: 'Convention Flip',
      description: 'Using G.E. Thomas convention (1 = High-then-Low) where IEEE 802.3 standard (1 = Low-then-High) is expected.',
      detect: 'waveform_is_exact_inverse',
      action: (app) => {
        app.setBitstream([1, 0, 1, 1, 0]);
        app.setScheme('manchester');
        const thomasWaveform = window.DigiWaveOracle.encode('manchester', [1, 0, 1, 1, 0], 2, { convention: 'thomas' });
        app.oscilloscope.setWaveforms(thomasWaveform, [1, 0, 1, 1, 0], 2, 1.0);

        app.tutor.addAIMessage({
          answer: `**Convention Diagnostic: Inverted Manchester Trace Detected!**\n\nThe waveform currently displayed on the CRT oscilloscope follows the **G. E. Thomas (IEEE 802.4)** convention (Bit 1 = High &rarr; Low).\n\nHowever, the lab standard (**IEEE 802.3 Ethernet**) specifies that Bit 1 is **Low &rarr; High**. Both conventions exist in academic textbooks, which frequently causes student confusion during lab vivas!`,
          hintLevel: 2,
          hintText: "Look at the very first bit (1): it starts High and drops Low. In IEEE 802.3, it should start Low and rise High.",
          confidence: 0.99,
          citations: ["IEEE Standard 802.3 (Clause 7: 10BASE5 / 10BASE-T)", "G. E. Thomas: Digital Transmission Systems"],
          stage: "manchester_convention_diagnosis",
        });
      }
    },
    {
      id: 'wiring_disconnect',
      name: 'Oscilloscope Open Circuit Fault',
      tag: 'Hardware Fault',
      description: 'Simulates a student disconnecting the oscilloscope probe cable from the encoder output.',
      detect: 'missing_scope_wire',
      action: (app) => {
        // Disconnect encoder.out -> scope.in
        app.workbench.connections = [{ from: 'source.out', to: 'encoder.in' }];
        app.workbench.renderWires();
        app.workbench.notifyChange();

        // Scope shows zero flatline
        const flatline = new Array(10).fill(0.0);
        app.oscilloscope.setWaveforms(flatline, app.getState().bits, 2, 1.0);

        app.tutor.addAIMessage({
          answer: `**CRITICAL HARDWARE FAULT: Oscilloscope Channel 2 Input Open!**\n\nThe CRT display has flatlined at 0.0V. The connection **encoder.out &rarr; scope.in** is missing from the patch panel. In physical lab benches, floating inputs pick up 50Hz mains hum or register as high-impedance open circuits.`,
          hintLevel: 1,
          hintText: "Inspect the wiring panel: connect the yellow banana jack on the Line Encoder to the input port on the Oscilloscope.",
          confidence: 1.0,
          citations: ["Tektronix Oscilloscope Fundamentals Handbook"],
          stage: "open_circuit_diagnose",
        });
      }
    }
  ];

  window.DigiWaveMisconceptions = {
    list: MISCONCEPTIONS,
    trigger: (id, app) => {
      const item = MISCONCEPTIONS.find(m => m.id === id);
      if (item) item.action(app);
    }
  };
})(window);
