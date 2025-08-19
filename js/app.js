// js/app.js
(function(){
    // ------- Elements
    const els = {
        coders: document.getElementById("coders"),
        cases:  document.getElementById("cases"),
        seed:   document.getElementById("seed"),
        dist:   document.getElementById("dist"),
        stabWindow: document.getElementById("stabWindow"),

        // new epsilon dropdown
        epsWrap: document.getElementById("epsDropdownWrap"),
        epsBtn: document.getElementById("epsDropdownBtn"),
        epsLabel: document.getElementById("epsDropdownLabel"),

        run:    document.getElementById("runBtn"),
        areaSvg: document.getElementById("areaSvg"),
        areaLegend: document.getElementById("areaLegend"),
        linesSvg: document.getElementById("linesSvg"),
    };

    // Right-tile param groups
    const groups = {
        uniform: document.getElementById("params-uniform"),
        beta: document.getElementById("params-beta"),
        normal: document.getElementById("params-normal"),
        logitnormal: document.getElementById("params-logitnormal"),
        custom: document.getElementById("params-custom"),
    };

    // Inputs in the distribution tile
    const p = {
        uMin: document.getElementById("uMin"),
        uMax: document.getElementById("uMax"),
        bAlpha: document.getElementById("bAlpha"),
        bBeta: document.getElementById("bBeta"),
        nMu: document.getElementById("nMu"),
        nSigma: document.getElementById("nSigma"),
        lnMu: document.getElementById("lnMu"),
        lnSigma: document.getElementById("lnSigma"),
    };

    // ------- Helpers
    function showParamGroup(dist) {
        Object.entries(groups).forEach(([k,node]) => node?.classList.toggle("d-none", k !== dist));
    }
    function currentParams(dist) {
        switch (dist) {
            case 'uniform':    return { uMin: +p.uMin.value, uMax: +p.uMax.value };
            case 'beta':       return { bAlpha: +p.bAlpha.value, bBeta: +p.bBeta.value };
            case 'normal':     return { nMu: +p.nMu.value, nSigma: +p.nSigma.value };
            case 'logitnormal':return { lnMu: +p.lnMu.value, lnSigma: +p.lnSigma.value };
            default:           return {};
        }
    }
    function updateLegend(dist, params) {
        const parts = Object.entries(params).map(([k,v]) => `${k}=${v}`);
        els.areaLegend.textContent = `${dist}${parts.length ? ' · ' + parts.join(' · ') : ''}`;
    }

    // --- epsilon utils (dropdown with checkboxes)
    function getSelectedEps() {
        const checks = els.epsWrap.querySelectorAll('.eps-check');
        const vals = [];
        checks.forEach(ch => { if (ch.checked) vals.push(parseFloat(ch.value)); });
        if (!vals.length) {
            // enforce at least 5%
            const first = els.epsWrap.querySelector('#eps05');
            if (first) first.checked = true;
            return [0.05];
        }
        // Keep sorted in ascending order
        vals.sort((a,b)=>a-b);
        return vals;
    }
    function updateEpsDropdownLabel() {
        const vals = getSelectedEps();
        els.epsLabel.textContent = vals.map(v => `${Math.round(v*100)}%`).join(', ');
    }

    // ------- Distribution preview
    const preview = new DistributionPreview(els.areaSvg);

    function updatePreview() {
        const dist = els.dist.value;
        showParamGroup(dist);
        const params = currentParams(dist);
        updateLegend(dist, params);

        preview.update({
            dist: dist === 'custom' ? 'uniform' : dist,
            params,
            seed: els.seed.value || 910,
            nPreview: 5000,
            bins: 60
        });
    }

    // ------- Main chart
    const lines = new SimulationLines({ el: els.linesSvg, pivot: 200, linearPortion: 0.58 });

// Create tooltip once (keep as you had)
    const linesBody = document.getElementById("linesBody");
    const tooltip = document.createElement("div");
    tooltip.id = "linesTooltip";
    tooltip.style.display = "none";
    linesBody.appendChild(tooltip);

// Position under HUD, right-aligned
    function positionTooltipUnderHud() {
        const hud = document.getElementById("linesHud");
        const top = (hud?.offsetTop || 0) + (hud?.offsetHeight || 0) + 8; // 8px gap below HUD
        tooltip.style.right = "8px";     // right anchor
        tooltip.style.left  = "auto";    // ensure left is not set
        tooltip.style.top   = `${top}px`;
    }
    window.addEventListener("resize", positionTooltipUnderHud);


    function buildCoderTooltip(i) {
        const W = Math.max(1, Math.min(+document.getElementById("stabWindow").value || 10, lastSim.nCases));
        const disc = lastSim.coders[i].discrepancies;
        const epsList = [0.03,0.04,0.05,0.06,0.07,0.08,0.09,0.10];  // now includes 3% & 4%

        const rows = epsList.map(eps => {
            const t = stableIndexWindow(disc, eps, W);
            const label = `${Math.round(eps*100)}%`;
            const val = Number.isFinite(t) && (t + W - 1) <= lastSim.nCases ? t : "—";
            return `<tr><td>${label}</td><td class="text-end">${val}</td></tr>`;
        }).join("");

        const pTrue = (lastSim.coders[i].pTrue !== undefined)
            ? ` · true=${(lastSim.coders[i].pTrue*100).toFixed(1)}%` : "";

        return `
    <div><strong>Coder #${i+1}</strong><span class="text-muted">${pTrue}</span></div>
    <div class="text-muted">Earliest t with clean window W=${W}</div>
    <table class="mt-1">${rows}</table>
  `;
    }


    lines.setHoverHandlers(
        (evt, d) => { // enter
            tooltip.innerHTML = buildCoderTooltip(d.i);
            tooltip.style.display = "block";
            positionTooltipUnderHud();
        },
        (evt, d) => { /* no-op: we don’t track the mouse anymore */ },
        () => { tooltip.style.display = "none"; }
    );



    // ------- State (cache)
    let lastSim = null;         // { coders, nCases }
    let lastStats = null;       // { [eps]: { indices, mask, stabilizedPct, meanIdx, quantiles } }
    const ALL_EPS = [0.03,0.04,0.05,0.06,0.07,0.08,0.09,0.10];

    const EPS_COLORS = {
        0.03: "#d62728", // red
        0.04: "#8c564b", // brown
        0.05: "#ff7f0e", // orange (primary default)
        0.06: "#2ca02c", // green
        0.07: "#9467bd", // purple
        0.08: "#1f77b4", // blue
        0.09: "#e377c2", // pink
        0.10: "#17becf"  // teal
    };


    // ------- Simulation (fixed totals)
    function runSimulation() {
        const nCoders = Math.max(1, Math.min(10000, +els.coders.value || 500));
        const nCases  = Math.max(10, Math.min(100000, +els.cases.value || 200));
        const seed    = Math.floor(+els.seed.value || 910);
        const dist    = els.dist.value;
        const params  = currentParams(dist);

        // simulate
        lastSim = simulateDiscrepanciesFixedTotals({
            nCases, nCoders, dist: (dist === 'custom' ? 'uniform' : dist), params, seed
        });

        // draw lines & axis
        lines.wrangleData(lastSim);
        lines.updateVis();

        // Pivot line at hybrid switch
        lines.setPivot(200);

        // compute stats for current W
        recomputeStatsAndRender();
    }

    // ------- Stats recomputation (cheap) + UI render
    function recomputeStatsAndRender() {
        if (!lastSim) return;

        const W = Math.max(1, Math.min(+els.stabWindow.value || 10, lastSim.nCases));
        const discrepancyList = lastSim.coders.map(c => c.discrepancies);
        lastStats = computeAllStabilization(discrepancyList, ALL_EPS, W, lastSim.nCases);

        renderHUDMarkersECDF();
    }

    function renderHUDMarkersECDF() {
        if (!lastSim || !lastStats) return;

        const epsSelected = getSelectedEps();
        const primary = epsSelected[0];
        const sel = lastStats[primary];

        // --- HUD (accent + numbers for primary ε)
        const hud = document.getElementById("linesHud");
        const accent = EPS_COLORS[primary] || "#ff7f0e";
        hud.style.setProperty("--hud-accent", accent);

        const setHud = (k, v) => {
            const el = hud.querySelector(`[data-hud="${k}"]`);
            if (el) el.textContent = v;
        };
        setHud("eps", `${Math.round(primary*100)}%`);
        setHud("W", `${els.stabWindow.value}`);
        setHud("stabPct", `${sel.stabilizedPct.toFixed(1)}%`);
        setHud("p50", sel.quantiles.p50 ?? "—");
        setHud("p75", sel.quantiles.p75 ?? "—");
        setHud("p90", sel.quantiles.p90 ?? "—");
        setHud("p95", sel.quantiles.p95 ?? "—");

        // --- Vertical quantile markers (primary ε only)
        const markers = [];
        if (sel.quantiles.p50) markers.push({ t: sel.quantiles.p50, label: 'median' });
        if (sel.quantiles.p75) markers.push({ t: sel.quantiles.p75, label: 'p75' });
        if (sel.quantiles.p90) markers.push({ t: sel.quantiles.p90, label: 'p90' });
        if (sel.quantiles.p95) markers.push({ t: sel.quantiles.p95, label: 'p95' });
        lines.setMarkers(markers, accent);

        // --- Horizontal tolerance guides for ALL selected eps
        const colorMap = {};
        epsSelected.forEach(e => { colorMap[e] = EPS_COLORS[e] || "#999"; });
        lines.setToleranceGuides(epsSelected, colorMap);

        // --- ECDF datasets for each selected ε
        const datasets = epsSelected.map(eps => {
            const st = lastStats[eps];
            const times = [];
            const N = st.indices.length;
            for (let i = 0; i < N; i++) if (st.mask[i]) times.push(st.indices[i]);
            times.sort((a,b)=>a-b);

            const pts = [];
            if (times.length > 0) {
                let cnt = 0, last = null;
                for (let i = 0; i < times.length; i++) {
                    cnt++;
                    const t = times[i];
                    if (t !== last) {
                        pts.push({ t, f: cnt / N }); // ECDF over ALL coders
                        last = t;
                    } else {
                        pts[pts.length - 1].f = cnt / N;
                    }
                }
            }
            return {
                key: String(eps),
                color: EPS_COLORS[eps] || "#999",
                points: pts
            };
        });
        lines.setEcdf(datasets);

        // Update dropdown label
        updateEpsDropdownLabel();
    }

    // ------- Events
    // Dist preview
    els.dist.addEventListener('change', updatePreview);
    els.seed.addEventListener('input', updatePreview);
    [p.uMin, p.uMax, p.bAlpha, p.bBeta, p.nMu, p.nSigma, p.lnMu, p.lnSigma].forEach(inp => {
        inp?.addEventListener('input', updatePreview);
        inp?.addEventListener('change', updatePreview);
    });

    // Epsilon dropdown (delegate change)
    els.epsWrap.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('eps-check')) {
            // ensure at least one remains selected
            const vals = getSelectedEps();
            if (!vals.length) {
                const first = els.epsWrap.querySelector('#eps05');
                if (first) first.checked = true;
            }
            renderHUDMarkersECDF();
        }
    });

    // Run + window change
    els.run.addEventListener('click', runSimulation);
    els.stabWindow.addEventListener('input', () => {
        // W change → recompute stats (cheap) and redraw
        recomputeStatsAndRender();
    });

    // Resize
    window.addEventListener('resize', () => {
        preview.resize(); updatePreview();
        lines.resize();
        // reposition overlays after axes recomputed
        lines.setPivot(200);
        renderHUDMarkersECDF();
    });

    // Init
    updatePreview();
    updateEpsDropdownLabel();
})();
