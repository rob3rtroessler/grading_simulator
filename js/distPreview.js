// Renders a live distribution preview into #areaSvg and updates on param changes
class DistributionPreview {
    constructor(svgEl) {
        this.svg = d3.select(svgEl);
        this.m = { top: 12, right: 12, bottom: 28, left: 36 };
        this._init();
    }

    _init() {
        const b = this.svg.node().getBoundingClientRect();
        this.w = Math.max(260, b.width)  - this.m.left - this.m.right;
        this.h = Math.max(120, b.height) - this.m.top  - this.m.bottom;

        this.svg.selectAll("*").remove();

        this.g = this.svg.append("g")
            .attr("transform", `translate(${this.m.left},${this.m.top})`);

        this.x = d3.scaleLinear().domain([0,1]).range([0, this.w]);
        this.y = d3.scaleLinear().range([this.h, 0]);

        this.gridG = this.g.append("g").attr("class","grid");
        this.xAxis = this.g.append("g").attr("class","axis")
            .attr("transform", `translate(0,${this.h})`);
        this.yAxis = this.g.append("g").attr("class","axis");

        this.areaGen = d3.area()
            .x(d => this.x(d.x))
            .y0(this.h)
            .y1(d => this.y(d.y))
            .curve(d3.curveMonotoneX);

        this.areaPath = this.g.append("path")
            .attr("fill", "#cfe0ff")
            .attr("opacity", 0.95);
    }

    update({ dist, params, seed, nPreview=4000, bins=60 }) {
        // sample
        const rng = mulberry32(Math.floor(+seed || 910));
        const samples = sampleAccuracies(dist, rng, nPreview, params);

        // histogram -> normalized height
        const binner = d3.bin().domain([0,1]).thresholds(bins);
        const binsData = binner(samples);
        const maxCount = d3.max(binsData, d => d.length) || 1;
        const points = binsData.map(b => ({
            x: (b.x0 + b.x1)/2,
            y: b.length / maxCount
        }));

        this.y.domain([0, 1]).nice();

        // grid
        this.gridG.selectAll("line")
            .data(this.y.ticks(3))
            .join("line")
            .attr("x1", 0).attr("x2", this.w)
            .attr("y1", d => this.y(d)).attr("y2", d => this.y(d))
            .attr("stroke", "rgba(0,0,0,0.08)");

        // axes
        this.xAxis.call(d3.axisBottom(this.x).ticks(6).tickFormat(d3.format(".0%")));
        this.yAxis.call(d3.axisLeft(this.y).ticks(3));

        // area
        this.areaPath.datum(points).attr("d", this.areaGen);
    }

    resize() { this._init(); }
}

window.DistributionPreview = DistributionPreview;
