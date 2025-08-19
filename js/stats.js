// js/stats.js

/** Sliding-window stabilization index.
 *  Earliest 1-based t such that ALL of d[t..t+W-1] <= eps.
 *  Returns Infinity if no such window fits in [0..n-1].
 */
function stableIndexWindow(discrepancy, eps, W) {
    const n = discrepancy.length;
    if (W <= 0) return 1;
    if (W > n) return Infinity;

    let sum = 0;
    // sum of violations in first window [0..W-1]
    for (let i = 0; i < W; i++) sum += (discrepancy[i] > eps) ? 1 : 0;
    if (sum === 0) return 1; // window starts at t=1

    for (let t = 1; t + W - 1 < n; t++) {
        // slide window: remove old, add new
        if (discrepancy[t - 1] > eps) sum--;
        if (discrepancy[t + W - 1] > eps) sum++;
        if (sum === 0) return t + 1; // 1-based index
    }
    return Infinity;
}

function simulateDiscrepanciesFixedTotals({ nCases, nCoders, dist, params, seed }) {
    const rngA = mulberry32((seed >>> 0) || 0);                // for accuracies
    const rngS = mulberry32(((seed ^ 0x9e3779b9) >>> 0) || 0); // for sequences

    const accs = sampleAccuracies(dist, rngA, nCoders, params);
    const coders = new Array(nCoders);

    const seq = new Uint8Array(nCases);
    const cum = new Float32Array(nCases);

    for (let i = 0; i < nCoders; i++) {
        const pStar = accs[i];
        let k = Math.round(pStar * nCases);
        if (k < 0) k = 0; if (k > nCases) k = nCases;
        const pTrue = k / nCases;

        // build sequence of k ones then shuffle (Fisher-Yates using rngS)
        seq.fill(0);
        for (let j = 0; j < k; j++) seq[j] = 1;
        for (let j = nCases - 1; j > 0; j--) {
            const u = rngS();
            const r = Math.floor(u * (j + 1));
            const tmp = seq[j]; seq[j] = seq[r]; seq[r] = tmp;
        }

        // running mean - true => discrepancy
        let correct = 0;
        const disc = new Float32Array(nCases);
        for (let t = 0; t < nCases; t++) {
            correct += seq[t];
            const running = correct / (t + 1);
            disc[t] = Math.abs(running - pTrue);
            cum[t] = running;
        }

        coders[i] = { pTrue, discrepancies: disc };
    }
    return { coders, nCases };
}

/** Compute stabilization indices + aggregates for multiple eps values. */
function computeAllStabilization(discrepancyList, epsList, W, horizon) {
    const out = {};
    const n = discrepancyList.length;

    for (const eps of epsList) {
        const idxs = new Int32Array(n);
        const mask = new Uint8Array(n);
        let sumIdx = 0, countIdx = 0;

        for (let i = 0; i < n; i++) {
            const d = discrepancyList[i];
            const t = stableIndexWindow(d, eps, W);
            const stabilized = Number.isFinite(t) && (t + W - 1) <= horizon;
            idxs[i] = stabilized ? t : -1;
            mask[i] = stabilized ? 1 : 0;
            if (stabilized) { sumIdx += t; countIdx++; }
        }

        // quantiles among stabilized only
        const stabIdxs = [];
        for (let i = 0; i < n; i++) if (mask[i]) stabIdxs.push(idxs[i]);
        stabIdxs.sort((a,b)=>a-b);

        function q(p) {
            if (stabIdxs.length === 0) return undefined;
            const pos = (stabIdxs.length - 1) * p;
            const lo = Math.floor(pos), hi = Math.ceil(pos);
            if (lo === hi) return stabIdxs[lo];
            return Math.round(stabIdxs[lo] + (stabIdxs[hi] - stabIdxs[lo]) * (pos - lo));
        }

        out[eps] = {
            indices: idxs,
            mask,
            stabilizedPct: (mask.reduce((a,b)=>a+b,0) / n) * 100,
            meanIdx: countIdx ? (sumIdx / countIdx) : undefined,
            quantiles: {
                p50: q(0.5),
                p75: q(0.75),
                p90: q(0.9),
                p95: q(0.95),
            }
        };
    }
    return out;
}

window.stableIndexWindow = stableIndexWindow;
window.simulateDiscrepanciesFixedTotals = simulateDiscrepanciesFixedTotals;
window.computeAllStabilization = computeAllStabilization;
window.timeForTargetFraction = timeForTargetFraction;
