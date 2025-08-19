// SimulationLines.js — lines + markers + ECDF + pivot & tolerance guides

class SimulationLines {
    constructor({ el, pivot = 200, linearPortion = 0.58, margins = { top: 16, right: 16, bottom: 32, left: 50 } }) {
        this.el = el;
        this.svg = d3.select(el);
        this.pivot = Math.max(2, pivot);
        this.linearPortion = Math.min(0.9, Math.max(0.1, linearPortion));
        this.margins = margins;
        this.vis = this;
        this.initVis();
    }

    initVis() {
        const vis = this;
        const b = vis.el.getBoundingClientRect();
        vis.w = Math.max(400, b.width)  - vis.margins.left - vis.margins.right;
        vis.h = Math.max(260, b.height) - vis.margins.top  - vis.margins.bottom;

        vis.svg.selectAll("*").remove();

        vis.g = vis.svg.append("g").attr("transform", `translate(${vis.margins.left},${vis.margins.top})`);

        vis.gridG     = vis.g.append("g").attr("class","grid");
        vis.hGuidesG  = vis.g.append("g").attr("class","hguides");  // horizontal tolerance lines
        vis.pivotG    = vis.g.append("g").attr("class","pivot");    // vertical pivot line
        vis.pathsG    = vis.g.append("g").attr("class","paths");
        vis.ecdfG     = vis.g.append("g").attr("class","ecdf");
        vis.markersG  = vis.g.append("g").attr("class","markers");

        vis.axes = {
            x: vis.g.append("g").attr("class","axis").attr("transform", `translate(0,${vis.h})`),
            y: vis.g.append("g").attr("class","axis")
        };

        vis.y = d3.scaleLinear().domain([0, 1]).range([vis.h, 0]).nice();
        vis.axes.y.call(d3.axisLeft(vis.y).ticks(6).tickFormat(d3.format(".0%")));

        vis.lineGen = d3.line()
            .defined(d => Number.isFinite(d.x) && Number.isFinite(d.y))
            .x(d => vis.x(d.x))
            .y(d => vis.y(d.y))
            .curve(d3.curveLinear);

        vis.ecdfLine = d3.line()
            .x(d => vis.x(d.t))
            .y(d => vis.y(d.f))
            .curve(d3.curveStepAfter);
    }

    _buildHybridX(nCases) {
        const vis = this;
        const domainMin = 1;
        const pivot = Math.min(Math.max(domainMin + 1, vis.pivot), Math.max(vis.pivot, nCases));
        const domainMax = Math.max(pivot, nCases);
        const rangeMin = 0, rangeMax = vis.w;
        const split = rangeMin + (rangeMax - rangeMin) * vis.linearPortion;

        if (domainMax <= pivot) {
            const sLin = d3.scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax]).nice();
            const scale = (x) => sLin(x);
            scale.domain = () => [domainMin, domainMax];
            scale.range  = () => [rangeMin, rangeMax];
            scale.copy   = () => this._buildHybridX(domainMax);
            scale.invert = (px) => sLin.invert(px);
            scale.ticks  = (count = 10) => sLin.ticks(count);
            scale.tickFormat = (count = 10, spec) => sLin.tickFormat(count, spec);
            return scale;
        }

        const sLin = d3.scaleLinear().domain([domainMin, pivot]).range([rangeMin, split]);
        const sLog = d3.scaleLog().domain([pivot, domainMax]).range([split, rangeMax]).nice();

        const scale = (x) => (x <= pivot ? sLin(x) : sLog(Math.max(pivot, x)));
        scale.domain = () => [domainMin, domainMax];
        scale.range  = () => [rangeMin, rangeMax];
        scale.copy   = () => this._buildHybridX(domainMax);
        scale.invert = (px) => (px <= split ? sLin.invert(px) : sLog.invert(px));
        scale.ticks  = (count = 10) => {
            const linCount = Math.max(3, Math.round(count * vis.linearPortion));
            const logCount = Math.max(3, Math.round(count * (1 - vis.linearPortion)));
            const tLin = sLin.ticks(linCount).filter(t => t < pivot);
            const tLog = sLog.ticks(logCount).filter(t => t > pivot && t <= domainMax);
            return [...tLin, pivot, ...tLog];
        };
        scale.tickFormat = (count = 10) => {
            const fmtLin = d3.format(",d");
            const fmtLog = d3.format("~s");
            return d => (d <= pivot ? fmtLin(d) : fmtLog(d));
        };
        return scale;
    }

    wrangleData(simData) {
        const vis = this;
        vis.simData = simData;
        vis.x = vis._buildHybridX(simData.nCases);

        vis.axes.x.call(
            d3.axisBottom(vis.x)
                .tickValues(vis.x.ticks(10))
                .tickFormat(vis.x.tickFormat(10))
        );

        // grid
        vis.gridG.selectAll("line")
            .data(vis.y.ticks(6))
            .join("line")
            .attr("x1", 0).attr("x2", vis.w)
            .attr("y1", d => vis.y(d)).attr("y2", d => vis.y(d))
            .attr("stroke", "rgba(0,0,0,0.08)");
    }

    updateVis() {
        const vis = this;
        if (!vis.simData) return;

        const toPoints = (arr) => {
            const pts = new Array(arr.length);
            for (let i = 0; i < arr.length; i++) pts[i] = { x: i + 1, y: arr[i] };
            return pts;
        };

        const lineData = vis.simData.coders.map((d, i) => ({
            i,
            pts: toPoints(d.discrepancies)
        }));

        const sel = vis.pathsG.selectAll("path.sim-line").data(lineData, d => d.i);

        sel.join(
            enter => enter.append("path")
                .attr("class", "sim-line")
                .attr("fill", "none")
                .attr("d", d => vis.lineGen(d.pts))
                .on("mouseover", function(event, d) {
                    // 1) fade others + highlight this one
                    vis.pathsG.selectAll("path.sim-line").classed("faded", true).classed("highlight", false);
                    d3.select(this).classed("faded", false).classed("highlight", true);

                    // 2) bring this path to the top of pathsG so it’s never hidden
                    d3.select(this).raise();

                    // 3) bubble to external hover handler (for tooltip)
                    if (vis.onHover) vis.onHover(event, d);
                })
                // .on("mousemove", function(event, d) {
                //     if (vis.onHoverMove) vis.onHoverMove(event, d);
                // })
                .on("mouseleave", function(event, d) {
                    vis.pathsG.selectAll("path.sim-line").classed("faded", false).classed("highlight", false);
                    if (vis.onHoverEnd) vis.onHoverEnd(event, d);
                }),
            update => update.attr("d", d => vis.lineGen(d.pts)),
            exit   => exit.remove()
        );

    }

    /** Vertical markers; supports custom color */
    setMarkers(markers, color = "#ff7f0e") {
        const vis = this;
        const data = (markers || []).filter(m => Number.isFinite(m.t));

        const sel = vis.markersG.selectAll("g.marker").data(data, d => d.label);

        const gEnter = sel.enter().append("g").attr("class","marker");
        gEnter.append("line")
            .attr("y1", 0).attr("y2", vis.h)
            .attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4").attr("opacity", 0.85);
        gEnter.append("text")
            .attr("y", 12).attr("dy", "0.35em")
            .attr("font-size", 11).attr("text-anchor", "start");

        sel.merge(gEnter)
            .attr("transform", d => `translate(${vis.x(d.t)},0)`)
            .select("line").attr("stroke", color);

        sel.merge(gEnter).select("text")
            .attr("fill", color)
            .text(d => d.label);

        sel.exit().remove();
    }

    /** Multi-ECDF overlay: datasets = [{ key, color, points:[{t,f},...] }] */
    setEcdf(datasets) {
        const vis = this;
        const sel = vis.ecdfG.selectAll("path.ecdf-line").data(datasets || [], d => d.key);

        sel.join(
            enter => enter.append("path")
                .attr("class", "ecdf-line")
                .attr("fill", "none")
                .attr("stroke-width", 2)
                .attr("opacity", 0.95)
                .attr("d", d => vis.ecdfLine(d.points))
                .attr("stroke", d => d.color),
            update => update
                .attr("stroke", d => d.color)
                .attr("d", d => vis.ecdfLine(d.points)),
            exit => exit.remove()
        );
    }

    /** Draw/refresh the vertical pivot line at the hybrid switch */
    setPivot(pivotValue) {
        const vis = this;
        const data = (pivotValue && Number.isFinite(pivotValue)) ? [pivotValue] : [];
        const sel = vis.pivotG.selectAll("g.pivot-line").data(data);

        const gEnter = sel.enter().append("g").attr("class","pivot-line");
        gEnter.append("line")
            .attr("y1", 0).attr("y2", vis.h)
            .attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "2 3")
            .attr("opacity", 0.9);
        gEnter.append("text")
            .attr("y", 0).attr("dy", "-0.4em")
            .attr("font-size", 10).attr("fill", "#666")
            .attr("text-anchor", "middle")
            .text("log scale");

        sel.merge(gEnter)
            .attr("transform", d => `translate(${vis.x(d)},0)`)
            .select("text")
            .attr("x", 0);

        sel.exit().remove();
    }

    setHoverHandlers(onEnter, onMove, onLeave) {
        this.onHover = onEnter;
        this.onHoverMove = onMove;
        this.onHoverEnd = onLeave;
    }

    /** Draw/refresh horizontal tolerance guides for selected eps using colors */
    setToleranceGuides(epsArray = [], colorMap = {}) {
        const vis = this;
        const data = epsArray.filter(e => e > 0 && e <= 1);
        const sel = vis.hGuidesG.selectAll("g.hguide").data(data, d => d);

        const gEnter = sel.enter().append("g").attr("class","hguide");
        gEnter.append("line")
            .attr("x1", 0).attr("x2", vis.w)
            .attr("stroke-width", 1).attr("stroke-dasharray", "4 4").attr("opacity", 0.6);
        gEnter.append("text")
            .attr("x", vis.w).attr("dx", "-0.4em")
            .attr("font-size", 10).attr("text-anchor", "end");

        sel.merge(gEnter)
            .attr("transform", d => `translate(0,${vis.y(d)})`)
            .select("line").attr("stroke", d => colorMap[d] || "#999");

        sel.merge(gEnter).select("text")
            .attr("y", 0).attr("dy", "-0.3em")
            .attr("fill", d => colorMap[d] || "#999")
            .text(d => `${Math.round(d*100)}%`);

        sel.exit().remove();
    }

    resize() {
        this.initVis();
        if (this.simData) { this.wrangleData(this.simData); this.updateVis(); }
    }
}

window.SimulationLines = SimulationLines;
