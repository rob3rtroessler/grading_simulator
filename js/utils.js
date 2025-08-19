// RNG
function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Samplers
function sampleUniform(rng, n, min=0, max=1) {
    const out = new Array(n);
    for (let i=0;i<n;i++) out[i] = Math.min(1, Math.max(0, min + (max-min)*rng()));
    return out;
}
function sampleNormalTrunc01(rng, n, mu=0.5, sigma=0.2) {
    const out = new Array(n);
    for (let i=0;i<n;i++) {
        const u1 = rng() || 1e-12, u2 = rng() || 1e-12;
        const z = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
        out[i] = Math.min(1, Math.max(0, mu + sigma*z));
    }
    return out;
}
function sampleLogitNormal(rng, n, mu=0, sigma=1) {
    const out = new Array(n);
    for (let i=0;i<n;i++) {
        const u1 = rng() || 1e-12, u2 = rng() || 1e-12;
        const z = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
        const y = mu + sigma*z;
        out[i] = 1 / (1 + Math.exp(-y));
    }
    return out;
}
// Gamma + Beta
function _gamma(k, rng) {
    if (k < 1) {
        const c = 1 / k;
        const d = (1 - k) * Math.pow(k, k/(1-k));
        while (true) {
            const u = rng(), v = rng();
            const z = -Math.log(u);
            const e = -Math.log(v);
            if (z + e >= d) return Math.pow(z, c);
        }
    }
    const d = k - 1/3, c = 1/Math.sqrt(9*d);
    while (true) {
        let x, v;
        do {
            const u = rng() || 1e-12, v0 = rng() || 1e-12;
            x = Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v0);
            v = 1 + c*x;
        } while (v <= 0);
        v = v*v*v;
        const u2 = rng();
        if (u2 < 1 - 0.0331 * (x*x)*(x*x)) return d*v;
        if (Math.log(u2) < 0.5*x*x + d*(1 - v + Math.log(v))) return d*v;
    }
}
function sampleBeta(rng, n, alpha=2, beta=2) {
    const out = new Array(n);
    for (let i=0;i<n;i++) {
        const g1 = _gamma(alpha, rng), g2 = _gamma(beta, rng);
        out[i] = g1 / (g1 + g2);
    }
    return out;
}

// Choose distribution by name
function sampleAccuracies(dist, rng, n, params) {
    switch (dist) {
        case 'uniform': {
            const min = Math.min(params.uMin ?? 0, params.uMax ?? 1);
            const max = Math.max(params.uMin ?? 0, params.uMax ?? 1);
            return sampleUniform(rng, n, min, max);
        }
        case 'beta': {
            const a = Math.max(0.1, +params.bAlpha || 2);
            const b = Math.max(0.1, +params.bBeta  || 2);
            return sampleBeta(rng, n, a, b);
        }
        case 'normal': {
            const mu = +params.nMu ?? 0.5;
            const s  = Math.max(0.01, +params.nSigma || 0.2);
            return sampleNormalTrunc01(rng, n, mu, s);
        }
        case 'logitnormal': {
            const mu = +params.lnMu ?? 0;
            const s  = Math.max(0.01, +params.lnSigma || 1);
            return sampleLogitNormal(rng, n, mu, s);
        }
        default: // fallback to uniform
            return sampleUniform(rng, n, 0, 1);
    }
}

// export
window.mulberry32 = mulberry32;
window.sampleAccuracies = sampleAccuracies;
