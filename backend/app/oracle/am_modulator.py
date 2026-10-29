"""app/oracle/am_modulator.py — deterministic oracle for Experiment 1: AM (DSB-FC).

Calculates exact mathematical values directly grounded in the PICT PCS Expt 1 manual:
- Modulation index m = Em / Ec
- Graphical method m = (Emax - Emin) / (Emax + Emin)
- Trapezoidal method m = (L1 - L2) / (L1 + L2)
- Power in carrier Pc = Ec^2 / (2R)
- Power in sidebands PSB = m^2 * Ec^2 / (4R)
- Total power PT = Pc + PSB
- Spectrum sidebands (fc - fm, fc, fc + fm) and Bandwidth = 2*fm
"""

from __future__ import annotations

import math
from typing import Any


def calculate_am(
    Em: float,
    fm: float,
    Ec: float,
    fc: float,
    rf_link: str = "closed_dsbfc",
    load_resistance: float = 50.0,
    num_samples: int = 500,
) -> dict[str, Any]:
    """Calculate complete AM modulation metrics, waveforms, trapezoid, and power."""
    # Ensure non-negative amplitudes
    Em = max(0.0, float(Em))
    Ec = max(0.1, float(Ec))
    fm = max(100.0, float(fm))
    fc = max(fm * 2.0, float(fc))
    R = max(1.0, float(load_resistance))

    # Modulation index
    is_dsbfc = (rf_link == "closed_dsbfc")
    m = (Em / Ec) if is_dsbfc else float("inf")

    # Time-domain envelope peaks
    Emax = Ec + Em
    Emin = max(0.0, Ec - Em) if m <= 1.0 else 0.0
    envelope_inversion = max(0.0, Em - Ec)  # Negative peak crossing into opposite phase

    # Graphical method from time domain
    if Emax + Emin > 0:
        m_graphical = (Emax - Emin) / (Emax + Emin)
    else:
        m_graphical = 0.0

    # Trapezoid pattern dimensions (CRO X-Y mode)
    L1 = 2.0 * Emax
    L2 = 2.0 * max(0.0, Ec - Em)
    if L1 + L2 > 0:
        m_trapezoidal = (L1 - L2) / (L1 + L2)
    else:
        m_trapezoidal = 0.0

    # Pattern classification
    if m < 0.001:
        pattern_type = "rectangle"
        pattern_desc = "Rectangle (No Modulation, m = 0, Pure Carrier)"
    elif m < 0.999:
        pattern_type = "trapezoid"
        pattern_desc = f"Trapezoid (Under-modulation, m = {m:.2f} < 1, Clean Envelope)"
    elif abs(m - 1.0) <= 0.05:
        pattern_type = "triangle"
        pattern_desc = f"Triangle (Critical 100% Modulation, m = {m:.2f} ≈ 1, Envelope Touches Zero)"
    else:
        pattern_type = "bowtie"
        pattern_desc = f"Crossed Bow-tie (Over-modulation, m = {m:.2f} > 1, Severe Phase Distortion)"

    # Power calculations (with standard load R = 50 Ohms as per PICT manual Page 6)
    # Pc = Ec^2 / (2R)
    # PSB = m^2 * Ec^2 / (4R) = (m^2 / 2) * Pc
    Pc = (Ec ** 2) / (2.0 * R)
    Psb = ((m ** 2) * (Ec ** 2)) / (4.0 * R) if is_dsbfc else (Em ** 2) / (4.0 * R)
    Pusb = Psb / 2.0
    Plsb = Psb / 2.0
    Pt = Pc + Psb
    efficiency = (Psb / Pt * 100.0) if Pt > 0 else 0.0

    # Power in dBm (P_dBm = 10 * log10(P / 1mW))
    def to_dbm(p_watts: float) -> float:
        if p_watts <= 1e-9:
            return -90.0
        return 10.0 * math.log10(p_watts * 1000.0)

    # Spectrum components
    spectrum = {
        "carrier_freq_hz": fc,
        "modulating_freq_hz": fm,
        "lsb_freq_hz": fc - fm,
        "usb_freq_hz": fc + fm,
        "bandwidth_hz": 2.0 * fm,
        "carrier_voltage_peak": Ec if is_dsbfc else 0.0,
        "sideband_voltage_peak": (m * Ec / 2.0) if is_dsbfc else (Em / 2.0),
        "pc_watts": Pc,
        "psb_watts": Psb,
        "pt_watts": Pt,
        "pc_dbm": to_dbm(Pc),
        "pusb_dbm": to_dbm(Pusb),
        "plsb_dbm": to_dbm(Plsb),
        "pt_dbm": to_dbm(Pt),
    }

    # Sample time-domain waveform points for 2 cycles of modulating wave
    t_period = 2.0 / fm
    dt = t_period / num_samples
    time_pts = []
    mod_pts = []
    carrier_pts = []
    am_pts = []
    env_upper_pts = []
    env_lower_pts = []

    for i in range(num_samples):
        t = i * dt
        time_pts.append(t)
        em_t = Em * math.cos(2.0 * math.pi * fm * t)
        ec_t = Ec * math.cos(2.0 * math.pi * fc * t)
        mod_pts.append(em_t)
        carrier_pts.append(ec_t)

        if is_dsbfc:
            instantaneous_amp = Ec + em_t
            am_t = instantaneous_amp * math.cos(2.0 * math.pi * fc * t)
            env_upper = abs(instantaneous_amp) if m > 1.0 else instantaneous_amp
            env_lower = -env_upper
        else:
            # DSB-SC
            am_t = em_t * math.cos(2.0 * math.pi * fc * t)
            env_upper = abs(em_t)
            env_lower = -abs(em_t)

        am_pts.append(am_t)
        env_upper_pts.append(env_upper)
        env_lower_pts.append(env_lower)

    # Trapezoid vertices in X-Y space (CRO X-Y Mode)
    # X ranges from -Em to +Em
    # At X = +Em: vertical extent is +/- Emax (height L1 = 2*Emax)
    # At X = -Em: vertical extent is +/- Emin (height L2 = 2*Emin)
    trapezoid_geometry = {
        "x_left": -Em,
        "x_right": +Em,
        "y_left_top": max(0.0, Ec - Em),
        "y_left_bottom": -max(0.0, Ec - Em),
        "y_right_top": Ec + Em,
        "y_right_bottom": -(Ec + Em),
        "L1": L1,
        "L2": L2,
        "cross_over": m > 1.0,
        "cross_y_top": (Em - Ec) if m > 1.0 else 0.0,
    }

    return {
        "experiment": "am_modulation",
        "Em": Em,
        "fm": fm,
        "Ec": Ec,
        "fc": fc,
        "rf_link": rf_link,
        "load_resistance": R,
        "m": m,
        "m_graphical": m_graphical,
        "m_trapezoidal": m_trapezoidal,
        "Emax": Emax,
        "Emin": Emin,
        "L1": L1,
        "L2": L2,
        "pattern_type": pattern_type,
        "pattern_desc": pattern_desc,
        "Pc": Pc,
        "Psb": Psb,
        "Pusb": Pusb,
        "Plsb": Plsb,
        "Pt": Pt,
        "efficiency_percent": efficiency,
        "spectrum": spectrum,
        "trapezoid_geometry": trapezoid_geometry,
        "num_samples": num_samples,
        "time_waveform": {
            "t": time_pts,
            "modulating": mod_pts,
            "carrier": carrier_pts,
            "am_wave": am_pts,
            "env_upper": env_upper_pts,
            "env_lower": env_lower_pts,
        },
    }
