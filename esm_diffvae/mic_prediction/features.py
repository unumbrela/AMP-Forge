"""Physicochemical feature extraction for antimicrobial peptides."""

import numpy as np


# Amino acid property tables
_HYDROPHOBICITY_KD = {
    'A': 1.8, 'R': -4.5, 'N': -3.5, 'D': -3.5, 'C': 2.5,
    'Q': -3.5, 'E': -3.5, 'G': -0.4, 'H': -3.2, 'I': 4.5,
    'L': 3.8, 'K': -3.9, 'M': 1.9, 'F': 2.8, 'P': -1.6,
    'S': -0.8, 'T': -0.7, 'W': -0.9, 'Y': -1.3, 'V': 4.2,
}

_CHARGE = {
    'A': 0, 'R': 1, 'N': 0, 'D': -1, 'C': 0,
    'Q': 0, 'E': -1, 'G': 0, 'H': 0.5, 'I': 0,
    'L': 0, 'K': 1, 'M': 0, 'F': 0, 'P': 0,
    'S': 0, 'T': 0, 'W': 0, 'Y': 0, 'V': 0,
}

_MW = {
    'A': 89.1, 'R': 174.2, 'N': 132.1, 'D': 133.1, 'C': 121.2,
    'Q': 146.2, 'E': 147.1, 'G': 75.0, 'H': 155.2, 'I': 131.2,
    'L': 131.2, 'K': 146.2, 'M': 149.2, 'F': 165.2, 'P': 115.1,
    'S': 105.1, 'T': 119.1, 'W': 204.2, 'Y': 181.2, 'V': 117.1,
}

_AROMATIC = set('FWY')
_POSITIVE = set('RKH')
_NEGATIVE = set('DE')
_POLAR = set('STNQCHRKED')
_HELIX = set('AELM')
_SHEET = set('VIY')
_TURN = set('GNPS')


def compute_physicochemical_features(sequence: str) -> np.ndarray:
    """Compute 11 physicochemical descriptors for a peptide sequence.

    Returns:
        numpy array of shape (11,) with features:
        [net_charge, mean_hydrophobicity, molecular_weight, aromaticity_fraction,
         positive_fraction, negative_fraction, polar_fraction,
         helix_propensity, sheet_propensity, turn_propensity, amphipathicity]
    """
    seq = sequence.upper().strip()
    n = len(seq)
    if n == 0:
        return np.zeros(11, dtype=np.float32)

    # Net charge at pH 7
    net_charge = sum(_CHARGE.get(aa, 0) for aa in seq)

    # Mean hydrophobicity (Kyte-Doolittle)
    mean_hydro = np.mean([_HYDROPHOBICITY_KD.get(aa, 0) for aa in seq])

    # Molecular weight (approximate)
    mw = sum(_MW.get(aa, 110) for aa in seq) - (n - 1) * 18.015
    mw_normalized = mw / 1000.0  # normalize to kDa

    # Amino acid composition fractions
    aromatic_frac = sum(1 for aa in seq if aa in _AROMATIC) / n
    positive_frac = sum(1 for aa in seq if aa in _POSITIVE) / n
    negative_frac = sum(1 for aa in seq if aa in _NEGATIVE) / n
    polar_frac = sum(1 for aa in seq if aa in _POLAR) / n

    # Secondary structure propensity fractions
    helix_prop = sum(1 for aa in seq if aa in _HELIX) / n
    sheet_prop = sum(1 for aa in seq if aa in _SHEET) / n
    turn_prop = sum(1 for aa in seq if aa in _TURN) / n

    # Amphipathicity: std of hydrophobicity across a helical wheel (i, i+3, i+4 pattern)
    hydro_values = [_HYDROPHOBICITY_KD.get(aa, 0) for aa in seq]
    if n >= 5:
        # Simple amphipathicity measure: variance of hydrophobicity in sliding window
        window = 5
        local_means = [
            np.mean(hydro_values[i:i + window])
            for i in range(n - window + 1)
        ]
        amphipathicity = np.std(local_means) if local_means else 0.0
    else:
        amphipathicity = np.std(hydro_values)

    features = np.array([
        net_charge / n,        # charge density
        mean_hydro,
        mw_normalized,
        aromatic_frac,
        positive_frac,
        negative_frac,
        polar_frac,
        helix_prop,
        sheet_prop,
        turn_prop,
        amphipathicity,
    ], dtype=np.float32)

    return features
