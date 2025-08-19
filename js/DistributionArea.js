// DistributionArea — handles both the FRONT preview and BACK custom draw view with flip

class DistributionArea {
    constructor({ elFront, elBack, panelEl, legendEl, nBins=80 }) {
        this.elFront = elFront;
        this.elBack  = elBack;
        this.panelEl = panelEl;
        this.legendEl = legendEl ? d3.select(legendEl) : null;
        this.nBins = nBins;

        this.customWeights = new Array(this.nBins).fill(1);
        window._customWeights = this.customWeights.slice();

        this.initFront();
        this.initBack();
    }

    /* ---------- FRONT: preview histogram/area ---------- */
    initFront() {
        const svg = d3.select(this.elFront);
        svg.selectAll("*").remove();

        const m = {top:18,right:16,bottom:26,left:36};
        const b = this.elFront.getBoundingClientRect();
        this.fWidth  = Math.max(220, b.width)  - m.left - m.right;
        this.fHeight = Math.max(120, b.height) - m.top  - m.bottom;

        this.f = { m, svg, g: svg.append("g").attr("transform", `translate(${m.left},${m.top})`) };
        this.fx = d3.scaleLinear().domain([0,1]).range([0, this.fWidth]);
        this.fy = d3.scaleLinear().range([this.fHeight, 0]).nice();

        this.fArea = d3.area()
            .x(d => this.fx(d.x))
            .y0(this.fHeight)
            .y1(d => this.fy(d.y))
            .curve(d3.curveMonotoneX);

        this.f.xAxisG = this.f.g.append("g").attr("class","axis").attr("transform", `translate(0,${this.fHeight})`);
        this.f.yAxisG = this.f.g.append("g").attr("class","axis");
        this.f.gridG  = this.f.g.append("g").attr("class","grid");
        this.f.path   = this.f.g.append("path").attr("fill", "#cfe0ff").attr("opacity", 0.9);
    }

    wrangleFront(accs) {
        const bins = d3.bin().domain([0,1]).thresholds(30)(accs || []);
        this.frontData = bins.map(b => ({ x: (b.x0 + b.x1)/2, y: b.length }));
        const maxY = d3.max(this.frontData, d => d.y) || 1;
        this.fy.domain([0, maxY]).nice();
    }

    updateFront() {
        if (!this.frontData) return;
        this.f.path.datum(this.frontData).attr("d", this.fArea);
        this.f.xAxisG.call(d3.axisBottom(this.fx).ticks(5).tickFormat(d3.format(".0%")));
        this.f.yAxisG.call(d3.axisLeft(this.fy).ticks(3));
        this.f.gridG.selectAll("line").data(this.fy.ticks(3))
            .join("line")
            .attr("x1",0).attr("x2",this.fWidth)
            .attr("y1", d=>this.fy(d)).attr("y2", d=>this.fy(d));
    }

    /* ---------- BACK: custom draw with dotted reference curves ---------- */
    initBack() {
        const svg = d3.select(this.elBack);
        svg.selectAll("*").remove();

        const m = {top:18,right:16,bottom:26,left:36};
        const b = this.elBack.getBoundingClientRect();
        this.bWidth  = Math.max(220, b.width)  - m.left - m.right;
        this.bHeight = Math.max(120, b.height) - m.top  - m.bottom;

        this.b = { m, svg, g: svg.append("g").attr("transform", `translate(${m.left},${m.top})`) };
        this.bx = d3.scaleLinear().domain([0,1]).range([0, this.bWidth]);
        this.by = d3.scaleLinear().range([this.bHeight, 0]).nice();

        // Drawn density (area)
        this.bArea = d3.area()
            .x(d => this.bx(d.x))
            .y0(this.bHeight)
            .y1(d => this.by(d.y))
            .curve(d3.curveMonotoneX);

        // Dotted reference curves
        this.refPaths = {
            uniform: this.b.g.append("path").attr("class","ref-curve ref-uniform"),
            beta:    this.b.g.append("path").attr("class","ref-curve ref-beta"),
            normal:  this.b.g.append("path").attr("class","ref-curve ref-normal"),
            logit:   this.b.g.append("path").attr("class","ref-curve ref-logit"),
        };

        this.b.xAxisG = this.b.g.append("g").attr("class","axis").attr("transform", `translate(0,${this.bHeight})`);
        this.b.yAxisG = this.b.g.append("g").attr("class","axis");
        this.b.gridG  = this.b.g.append("g").attr("class","grid");
        this.b.path   = this.b.g.append("path").attr("fill", "#a7c4ff").attr("opacity", 0.85);

        // Transparent overlay to draw
        this.overlay = this.b.g.append("rect")
            .attr("x",0).attr("y",0).attr("width", this.bWidth).attr("height", this.bHeight)
            .attr("fill", "transparent").style("pointer-events","none");

        this._isDrawing = false; this._lastIdx = null;

        this.overlay
            .on("pointerdown", (e)=>this._startDraw(e))
            .on("pointermove", (e)=>this._moveDraw(e))
            .on("pointerup",   ()=>this._endDraw())
            .on("pointerleave",()=>this._endDraw());
    }

    setFlip(isCustom) {
        const card = d3.select("#flipCard");
        const inner = d3.select("#flipInner");
        if (isCustom) { card.classed("flipped", true); this.overlay.style('pointer-events','all').style('cursor','crosshair'); }
        else { card.classed("flipped", false); this.overlay.style('pointer-events','none').style('cursor','default'); }
        if (this.legendEl) {
            this.legendEl.text(isCustom
                ? "Custom: draw density (drag). Dotted: other distributions."
                : "Live preview — updates with parameters");
        }
    }

    // Update dotted reference curves (sampling-based)
    updateReferenceCurves(rng, params) {
        const m = this.nBins;
        const xMid = d3.range(m).map(i => (i+0.5)/m);

        const curveFromSamples = (samples) => {
            const bins = d3.bin().domain([0,1]).thresholds(m)(samples);
            const ys = bins.map(b => b.length);
            const maxY = d3.max(ys) || 1;
            return xMid.map((x, i) => ({ x, y: ys[i] / maxY })); // scale to [0,1] height
        };

        const nPreview = 10000;
        const refU = curveFromSamples(sampleAccuracies('uniform', rng, nPreview, params));
        const refB = curveFromSamples(sampleAccuracies('beta',    rng, nPreview, params));
        const refN = curveFromSamples(sampleAccuracies('normal',  rng, nPreview, params));
        const refL = curveFromSamples(sampleAccuracies('logitnormal', rng, nPreview, params));

        // y-domain to encompass both custom and refs
        const maxY = Math.max(
            d3.max(refU, d=>d.y)||1,
            d3.max(refB, d=>d.y)||1,
            d3.max(refN, d=>d.y)||1,
            d3.max(refL, d=>d.y)||1,
            d3.max(this.backData || [], d=>d.y)||1
        );
        this.by.domain([0, maxY]).nice();

        const line = d3.line().x(d=>this.bx(d.x)).y(d=>this.by(d.y)).curve(d3.curveMonotoneX);
        this.refPaths.uniform.datum(refU).attr("d", line);
        this.refPaths.beta.datum(refB).attr("d", line);
        this.refPaths.normal.datum(refN).attr("d", line);
        this.refPaths.logit.datum(refL).attr("d", line);
    }

    wrangleBackFromWeights() {
        const m = this.nBins;
        const pts = new Array(m);
        for (let i=0;i<m;i++) {
            pts[i] = { x: (i+0.5)/m, y: Math.max(0, this.customWeights[i]) };
        }
        const maxY = d3.max(pts, d=>d.y) || 1;
        this.by.domain([0, maxY]).nice();
        this.backData = pts;
    }

    updateBack() {
        if (!this.backData) return;
        this.b.path.datum(this.backData).attr("d", this.bArea);
        this.b.xAxisG.call(d3.axisBottom(this.bx).ticks(5).tickFormat(d3.format(".0%")));
        this.b.yAxisG.call(d3.axisLeft(this.by).ticks(3));
        this.b.gridG.selectAll("line").data(this.by.ticks(3))
            .join("line")
            .attr("x1",0).attr("x2",this.bWidth)
            .attr("y1", d=>this.by(d)).attr("y2", d=>this.by(d));
    }

    resetCustom() {
        this.customWeights = new Array(this.nBins).fill(1);
        window._customWeights = this.customWeights.slice();
        this.wrangleBackFromWeights();
        this.updateBack();
    }
    smoothCustom() {
        const w = this.customWeights, m = w.length, out = new Array(m);
        for (let i=0;i<m;i++) {
            const a = w[Math.max(0, i-1)], b = w[i], c = w[Math.min(m-1, i+1)];
            out[i] = (a + 2*b + c) / 4;
        }
        this.customWeights = out;
        window._customWeights = this.customWeights.slice();
        this.wrangleBackFromWeights();
        this.updateBack();
    }

    // Drawing handlers
    _startDraw(e){ this._isDrawing = true; this._lastIdx = null; this._applyDraw(e); }
    _moveDraw(e){ if (!this._isDrawing) return; this._applyDraw(e); }
    _endDraw(){ if (!this._isDrawing) return; this._isDrawing = false; this._lastIdx = null; window._customWeights = this.customWeights.slice(); }

    _applyDraw(event){
        const [mx, my] = d3.pointer(event, this.b.g.node());
        const x0 = Math.max(0, Math.min(this.bWidth, mx));
        const y0 = Math.max(0, Math.min(this.bHeight, my));
        const idx = Math.max(0, Math.min(this.nBins-1, Math.floor((x0 / this.bWidth) * this.nBins)));
        const val = Math.max(0, 1 - (y0 / this.bHeight));

        if (this._lastIdx != null && this._lastIdx !== idx) {
            const a = Math.min(this._lastIdx, idx), b = Math.max(this._lastIdx, idx);
            for (let i=a; i<=b; i++) {
                const t = (i - a) / Math.max(1, b - a);
                this.customWeights[i] = (1 - t) * this.customWeights[this._lastIdx] + t * val;
            }
        } else {
            this.customWeights[idx] = val;
        }
        this._lastIdx = idx;

        this.wrangleBackFromWeights();
        this.updateBack();
    }
}

window.DistributionArea = DistributionArea;
