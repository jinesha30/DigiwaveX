/**
 * DigiWave X — API Client & Backend Synchronization Bridge
 * Connects to FastAPI (port 8000) for deterministic circuit evaluation, RAG, & LangGraph AI tutor.
 */

(function (window) {
  'use strict';

  class ApiClient {
    constructor(baseUrl = 'http://127.0.0.1:8000') {
      this.baseUrl = baseUrl;
      this.isOnline = false;
      this.geminiConfigured = false;
      this.onStatusChange = null;

      this.checkHealth();
      setInterval(() => this.checkHealth(), 5000);
    }

    async checkHealth() {
      try {
        const resp = await fetch(`${this.baseUrl}/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(2000),
        });

        if (resp.ok) {
          const data = await resp.json();
          this.isOnline = true;
          this.geminiConfigured = data.gemini_configured || false;
        } else {
          this.isOnline = false;
        }
      } catch (err) {
        this.isOnline = false;
      }

      if (this.onStatusChange) {
        this.onStatusChange({
          online: this.isOnline,
          gemini: this.geminiConfigured,
          baseUrl: this.baseUrl,
        });
      }
    }

    async postCircuitState(experimentId, blockInputs, connections) {
      if (!this.isOnline) return null;

      try {
        const payload = {
          experiment_id: experimentId,
          block_inputs: blockInputs,
          connections: connections.map(c => ({ from: c.from, to: c.to })),
        };

        const resp = await fetch(`${this.baseUrl}/circuit/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        console.warn('API circuit/state call failed, falling back to local oracle:', err);
        return null;
      }
    }

    async askTutor(experimentId, query, blockInputs, connections) {
      if (!this.isOnline) return null;

      try {
        const payload = {
          experiment_id: experimentId,
          student_query: query,
          block_inputs: blockInputs,
          connections: connections.map(c => ({ from: c.from, to: c.to })),
        };

        const resp = await fetch(`${this.baseUrl}/tutor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        console.warn('API tutor call failed, falling back to local Socratic engine:', err);
        return null;
      }
    }

    async postDSSS(bits, chipRate = 4, carrierFreq = 500.0, pnSeed = 0) {
      if (!this.isOnline) return null;

      try {
        const payload = {
          bits: bits,
          chip_rate: chipRate,
          carrier_freq: carrierFreq,
          pn_seed: pnSeed,
        };

        const resp = await fetch(`${this.baseUrl}/api/dsss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) return null;
        return await resp.json();
      } catch (err) {
        return null;
      }
    }

    async postAM(params = {}) {
      if (!this.isOnline) return null;

      try {
        const payload = {
          Em: params.Em !== undefined ? params.Em : 2.0,
          fm: params.fm !== undefined ? params.fm : 1000.0,
          Ec: params.Ec !== undefined ? params.Ec : 4.0,
          fc: params.fc !== undefined ? params.fc : 455000.0,
          rf_link: params.rf_link || 'closed_dsbfc',
          load_resistance: params.load_resistance || 50.0,
        };

        const resp = await fetch(`${this.baseUrl}/api/am`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) return null;
        return await resp.json();
      } catch (err) {
        return null;
      }
    }
  }

  window.ApiClient = ApiClient;
})(window);
