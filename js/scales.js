// scales.js — Hybrid x-scale: linear up to pivot, log after
function hybridLinearLogScale(domainMin, pivot, domainMax, rangeMin, rangeMax, linearPortion = 0.6) {
    domainMin = Math.max(1, +domainMin || 1);
    pivot = Math.max(domainMin+1, +pivot || 300);
    domainMax = Math.max(pivot, +domainMax || pivot+1);

    const width = rangeMax - rangeMin;
    const split = rangeMin + width * Math.min(0.9, Math.max(0.1, linearPortion));

    const sLin = d3.scaleLinear().domain([domainMin, pivot]).range([rangeMin, split]);
    const sLog = d3.scaleLog().domain([pivot, domainMax]).range([split, rangeMax]).nice();

    function scale(x) {
        const xx = +x;
        if (xx <= pivot) return sLin(xx);
        return sLog(Math.max(pivot, xx));
    }

    scale.domain = () => [domainMin, domainMax];
    scale.range = () => [rangeMin, rangeMax];
    scale.copy = () => hybridLinearLogScale(domainMin, pivot, domainMax, rangeMin, rangeMax, linearPortion);

    scale.invert = function(px) {
        const p = +px;
        if (p <= split) return sLin.invert(p);
        return sLog.invert(p);
    };

    scale.ticks = function(count = 10) {
        const linCount = Math.max(3, Math.round(count * linearPortion));
        const logCount = Math.max(3, Math.round(count * (1 - linearPortion)));
        const tLin = d3.ticks(domainMin, pivot, linCount);
        const tLog = sLog.ticks(logCount).filter(v => v > pivot && v <= domainMax);
        return [...tLin.filter(v => v < pivot), pivot, ...tLog];
    };

    scale.tickFormat = function(count, spec) {
        const fmtLin = d3.format(",d");
        const fmtLog = d3.format(spec || "~s");
        return d => (d <= pivot ? fmtLin(d) : fmtLog(d));
    };

    return scale;
}

window.hybridLinearLogScale = hybridLinearLogScale;
