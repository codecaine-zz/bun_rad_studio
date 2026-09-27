"use strict";

const unit = (name, symbol, factor) => ({ name, symbol, factor });

const CATEGORIES = {
    length: {
        label: "Length",
        units: [
            unit("Meter", "m", 1), unit("Kilometer", "km", 1000),
            unit("Centimeter", "cm", 0.01), unit("Millimeter", "mm", 0.001),
            unit("Micrometer", "um", 1e-6), unit("Nanometer", "nm", 1e-9),
            unit("Mile", "mi", 1609.344), unit("Yard", "yd", 0.9144),
            unit("Foot", "ft", 0.3048), unit("Inch", "in", 0.0254),
            unit("Nautical mile", "nmi", 1852), unit("Light year", "ly", 9.4607304725808e15)
        ],
        defaults: [0, 1]
    },
    currency: {
        label: "Currency",
        units: [
            unit("US Dollar", "USD", 1), unit("Euro", "EUR", 1.08),
            unit("British Pound", "GBP", 1.29), unit("Japanese Yen", "JPY", 0.0067),
            unit("Canadian Dollar", "CAD", 0.74), unit("Australian Dollar", "AUD", 0.66),
            unit("Swiss Franc", "CHF", 1.14), unit("Chinese Yuan", "CNY", 0.14),
            unit("Indian Rupee", "INR", 0.012), unit("Brazilian Real", "BRL", 0.18),
            unit("Mexican Peso", "MXN", 0.051), unit("South Korean Won", "KRW", 0.00075),
            unit("Singapore Dollar", "SGD", 0.76), unit("Bitcoin", "BTC", 65000),
            unit("Ethereum", "ETH", 3400), unit("Solana", "SOL", 145)
        ],
        defaults: [0, 1]
    },
    temperature: {
        label: "Temperature",
        units: [
            { name: "Celsius", symbol: "°C", toBase: value => value + 273.15, fromBase: value => value - 273.15 },
            { name: "Fahrenheit", symbol: "°F", toBase: value => (value - 32) * 5 / 9 + 273.15, fromBase: value => (value - 273.15) * 9 / 5 + 32 },
            { name: "Kelvin", symbol: "K", toBase: value => value, fromBase: value => value },
            { name: "Rankine", symbol: "°R", toBase: value => value * 5 / 9, fromBase: value => value * 9 / 5 }
        ],
        defaults: [0, 1]
    },
    area: {
        label: "Area",
        units: [
            unit("Square meter", "m²", 1), unit("Square kilometer", "km²", 1e6),
            unit("Square centimeter", "cm²", 1e-4), unit("Square millimeter", "mm²", 1e-6),
            unit("Hectare", "ha", 10000), unit("Acre", "ac", 4046.8564224),
            unit("Square mile", "mi²", 2589988.110336), unit("Square yard", "yd²", 0.83612736),
            unit("Square foot", "ft²", 0.09290304), unit("Square inch", "in²", 0.00064516)
        ],
        defaults: [0, 5]
    },
    volume: {
        label: "Volume",
        units: [
            unit("Liter", "L", 1), unit("Milliliter", "mL", 0.001),
            unit("Cubic meter", "m³", 1000), unit("Cubic centimeter", "cm³", 0.001),
            unit("US gallon", "gal", 3.785411784), unit("US quart", "qt", 0.946352946),
            unit("US pint", "pt", 0.473176473), unit("US cup", "cup", 0.2365882365),
            unit("US fluid ounce", "fl oz", 0.0295735295625), unit("US tablespoon", "tbsp", 0.01478676478125),
            unit("US teaspoon", "tsp", 0.00492892159375), unit("Imperial gallon", "imp gal", 4.54609),
            unit("Cubic foot", "ft³", 28.316846592), unit("Cubic inch", "in³", 0.016387064)
        ],
        defaults: [0, 4]
    },
    mass: {
        label: "Weight",
        units: [
            unit("Kilogram", "kg", 1), unit("Gram", "g", 0.001),
            unit("Milligram", "mg", 1e-6), unit("Metric ton", "t", 1000),
            unit("Pound", "lb", 0.45359237), unit("Ounce", "oz", 0.028349523125),
            unit("Stone", "st", 6.35029318), unit("US ton", "short ton", 907.18474),
            unit("Imperial ton", "long ton", 1016.0469088), unit("Carat", "ct", 0.0002)
        ],
        defaults: [0, 4]
    },
    time: {
        label: "Time",
        units: [
            unit("Second", "s", 1), unit("Millisecond", "ms", 0.001),
            unit("Microsecond", "us", 1e-6), unit("Minute", "min", 60),
            unit("Hour", "hr", 3600), unit("Day", "day", 86400),
            unit("Week", "wk", 604800), unit("Month (average)", "mo", 2629800),
            unit("Year (average)", "yr", 31557600), unit("Decade", "decade", 315576000)
        ],
        defaults: [4, 3]
    },
    speed: {
        label: "Speed",
        units: [
            unit("Meter per second", "m/s", 1), unit("Kilometer per hour", "km/h", 0.27777777777778),
            unit("Mile per hour", "mph", 0.44704), unit("Foot per second", "ft/s", 0.3048),
            unit("Knot", "kn", 0.51444444444444), unit("Mach", "Mach", 343)
        ],
        defaults: [1, 2]
    },
    pressure: {
        label: "Pressure",
        units: [
            unit("Pascal", "Pa", 1), unit("Kilopascal", "kPa", 1000),
            unit("Megapascal", "MPa", 1e6), unit("Bar", "bar", 100000),
            unit("Atmosphere", "atm", 101325), unit("Pounds per square inch", "psi", 6894.757293168),
            unit("Torr", "Torr", 133.3223684211), unit("Millimeter of mercury", "mmHg", 133.322387415)
        ],
        defaults: [4, 5]
    },
    energy: {
        label: "Energy",
        units: [
            unit("Joule", "J", 1), unit("Kilojoule", "kJ", 1000),
            unit("Calorie", "cal", 4.184), unit("Kilocalorie", "kcal", 4184),
            unit("Watt-hour", "Wh", 3600), unit("Kilowatt-hour", "kWh", 3.6e6),
            unit("British thermal unit", "BTU", 1055.05585262), unit("Foot-pound", "ft-lb", 1.3558179483314),
            unit("Electronvolt", "eV", 1.602176634e-19)
        ],
        defaults: [5, 6]
    },
    power: {
        label: "Power",
        units: [
            unit("Watt", "W", 1), unit("Kilowatt", "kW", 1000),
            unit("Megawatt", "MW", 1e6), unit("Horsepower (mechanical)", "hp", 745.69987158227),
            unit("Horsepower (metric)", "PS", 735.49875), unit("BTU per hour", "BTU/h", 0.29307107017222)
        ],
        defaults: [1, 3]
    },
    data: {
        label: "Data",
        units: [
            unit("Bit", "bit", 0.125), unit("Byte", "B", 1),
            unit("Kilobyte", "KB", 1000), unit("Megabyte", "MB", 1e6),
            unit("Gigabyte", "GB", 1e9), unit("Terabyte", "TB", 1e12),
            unit("Kibibyte", "KiB", 1024), unit("Mebibyte", "MiB", 1048576),
            unit("Gibibyte", "GiB", 1073741824), unit("Tebibyte", "TiB", 1099511627776)
        ],
        defaults: [4, 5]
    },
    character: {
        label: "Character & ASCII",
        isTextCategory: true,
        units: [
            {
                name: "Character (Glyph)",
                symbol: "char",
                toBase: v => typeof v === "string" ? (v.codePointAt(0) || 0) : (Number(v) || 0),
                fromBase: v => String.fromCodePoint(Math.max(0, Math.min(0x10FFFF, Math.round(Number(v) || 0))))
            },
            {
                name: "ASCII / Unicode (Decimal)",
                symbol: "dec",
                toBase: v => parseInt(String(v).trim(), 10) || 0,
                fromBase: v => String(Math.max(0, Math.round(Number(v) || 0)))
            },
            {
                name: "Hexadecimal Code (0x/U+)",
                symbol: "hex",
                toBase: v => {
                    const s = String(v).trim().replace(/^U\+/i, "").replace(/^0x/i, "");
                    return parseInt(s, 16) || 0;
                },
                fromBase: v => "0x" + Math.max(0, Math.round(Number(v) || 0)).toString(16).toUpperCase().padStart(2, "0")
            },
            {
                name: "Binary Byte (8/16-bit)",
                symbol: "bin",
                toBase: v => {
                    const s = String(v).trim().replace(/^0b/i, "").replace(/\s+/g, "");
                    return parseInt(s, 2) || 0;
                },
                fromBase: v => Math.max(0, Math.round(Number(v) || 0)).toString(2).padStart(8, "0")
            },
            {
                name: "Octal Code (0o)",
                symbol: "oct",
                toBase: v => {
                    const s = String(v).trim().replace(/^0o/i, "");
                    return parseInt(s, 8) || 0;
                },
                fromBase: v => "0o" + Math.max(0, Math.round(Number(v) || 0)).toString(8)
            },
            {
                name: "HTML Entity",
                symbol: "&#...;",
                toBase: v => {
                    const m = String(v).trim().match(/&#(x?)([0-9a-fA-F]+);?/);
                    if (m) return m[1] ? parseInt(m[2], 16) : parseInt(m[2], 10);
                    return parseInt(v, 10) || 0;
                },
                fromBase: v => `&#${Math.max(0, Math.round(Number(v) || 0))};`
            },
            {
                name: "URL Percent-Encoded",
                symbol: "%XX",
                toBase: v => {
                    try {
                        return decodeURIComponent(String(v).trim()).codePointAt(0) || 0;
                    } catch {
                        return 0;
                    }
                },
                fromBase: v => encodeURIComponent(String.fromCodePoint(Math.max(0, Math.min(0x10FFFF, Math.round(Number(v) || 0)))))
            }
        ],
        defaults: [0, 1]
    },
    angles: {
        label: "Angle",
        units: [
            unit("Degree", "deg", 1), unit("Radian", "rad", 180 / Math.PI),
            unit("Gradian", "grad", 0.9), unit("Arcminute", "arcmin", 1 / 60),
            unit("Arcsecond", "arcsec", 1 / 3600)
        ],
        defaults: [0, 1]
    },
    frequency: {
        label: "Frequency",
        units: [
            unit("Hertz", "Hz", 1), unit("Kilohertz", "kHz", 1000),
            unit("Megahertz", "MHz", 1e6), unit("Gigahertz", "GHz", 1e9),
            unit("Revolutions per minute", "rpm", 1 / 60)
        ],
        defaults: [0, 1]
    },
    force: {
        label: "Force",
        units: [
            unit("Newton", "N", 1), unit("Kilonewton", "kN", 1000),
            unit("Pound-force", "lbf", 4.4482216152605), unit("Dyne", "dyn", 1e-5),
            unit("Kilogram-force", "kgf", 9.80665)
        ],
        defaults: [0, 2]
    },
    torque: {
        label: "Torque",
        units: [
            unit("Newton-meter", "N·m", 1), unit("Kilonewton-meter", "kN·m", 1000),
            unit("Pound-foot", "lb-ft", 1.3558179483314), unit("Pound-inch", "lb-in", 0.11298482902762),
            unit("Kilogram-force meter", "kgf·m", 9.80665)
        ],
        defaults: [0, 2]
    },
    fuel: {
        label: "Fuel economy",
        units: [
            { name: "Liters per 100 km", symbol: "L/100km", toBase: value => value, fromBase: value => value },
            { name: "Miles per US gallon", symbol: "mpg US", toBase: value => 235.214583 / value, fromBase: value => 235.214583 / value },
            { name: "Miles per Imperial gallon", symbol: "mpg UK", toBase: value => 282.480936 / value, fromBase: value => 282.480936 / value },
            { name: "Kilometers per liter", symbol: "km/L", toBase: value => 100 / value, fromBase: value => 100 / value }
        ],
        defaults: [0, 1]
    }
};

// ============================================================================
// PRESET DATASETS FOR TIME-SERIES & ARRAY OF DAYS
// ============================================================================
const CHART_PRESETS = {
    "7days": {
        category: "HEALTH & ACTIVITY",
        title: "7-Day Step Count & Physical Activity",
        unit: "steps",
        data: [
            { day: "Mon", value: 8420 },
            { day: "Tue", value: 10540 },
            { day: "Wed", value: 7200 },
            { day: "Thu", value: 9890 },
            { day: "Fri", value: 11300 },
            { day: "Sat", value: 14200 },
            { day: "Sun", value: 12650 }
        ]
    },
    "30days": {
        category: "FINANCIAL METRICS",
        title: "30-Day Daily Net Revenue",
        unit: "$",
        data: [
            { day: "Oct 01", value: 2450 }, { day: "Oct 02", value: 2890 }, { day: "Oct 03", value: 3120 },
            { day: "Oct 04", value: 2780 }, { day: "Oct 05", value: 3600 }, { day: "Oct 06", value: 4100 },
            { day: "Oct 07", value: 3950 }, { day: "Oct 08", value: 3200 }, { day: "Oct 09", value: 3450 },
            { day: "Oct 10", value: 4200 }, { day: "Oct 11", value: 4680 }, { day: "Oct 12", value: 4320 },
            { day: "Oct 13", value: 3900 }, { day: "Oct 14", value: 4500 }, { day: "Oct 15", value: 5120 },
            { day: "Oct 16", value: 4890 }, { day: "Oct 17", value: 5340 }, { day: "Oct 18", value: 5670 },
            { day: "Oct 19", value: 5210 }, { day: "Oct 20", value: 4980 }, { day: "Oct 21", value: 5430 },
            { day: "Oct 22", value: 6100 }, { day: "Oct 23", value: 5890 }, { day: "Oct 24", value: 6250 },
            { day: "Oct 25", value: 6800 }, { day: "Oct 26", value: 6420 }, { day: "Oct 27", value: 6150 },
            { day: "Oct 28", value: 6700 }, { day: "Oct 29", value: 7200 }, { day: "Oct 30", value: 7540 }
        ]
    },
    "90days": {
        category: "MARKET INTELLIGENCE",
        title: "90-Day Asset Growth & Price Index",
        unit: "pts",
        data: Array.from({ length: 90 }, (_, i) => {
            const date = new Date(2026, 6, 1);
            date.setDate(date.getDate() + i);
            const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const trend = 100 + i * 0.85;
            const wave = Math.sin(i * 0.35) * 12 + Math.cos(i * 0.18) * 8;
            const noise = ((i * 17) % 7) - 3;
            return { day: label, value: Math.round((trend + wave + noise) * 10) / 10 };
        })
    }
};

const PHYSICAL_CONSTANTS = [
    { symbol: "c", name: "Speed of Light in Vacuum", value: "299792458", unit: "m/s" },
    { symbol: "h", name: "Planck's Constant", value: "6.62607015e-34", unit: "J·s" },
    { symbol: "ħ", name: "Reduced Planck Constant", value: "1.054571817e-34", unit: "J·s" },
    { symbol: "G", name: "Newtonian Gravitational Constant", value: "6.67430e-11", unit: "m³/(kg·s²)" },
    { symbol: "kB", name: "Boltzmann Constant", value: "1.380649e-23", unit: "J/K" },
    { symbol: "NA", name: "Avogadro Constant", value: "6.02214076e23", unit: "mol⁻¹" },
    { symbol: "e", name: "Elementary Charge", value: "1.602176634e-19", unit: "C" },
    { symbol: "me", name: "Electron Rest Mass", value: "9.1093837e-31", unit: "kg" },
    { symbol: "mp", name: "Proton Rest Mass", value: "1.67262192e-27", unit: "kg" },
    { symbol: "ε₀", name: "Vacuum Electric Permittivity", value: "8.8541878128e-12", unit: "F/m" },
    { symbol: "μ₀", name: "Vacuum Magnetic Permeability", value: "1.25663706212e-6", unit: "N/A²" },
    { symbol: "R", name: "Molar Gas Constant", value: "8.314462618", unit: "J/(mol·K)" },
    { symbol: "g", name: "Standard Acceleration of Gravity", value: "9.80665", unit: "m/s²" }
];

const state = {
    category: "length",
    angleMode: "deg",
    expression: "",
    justSolved: false,
    calcMemory: 0,
    soundProfile: "cupertino",
    history: loadHistory(),
    chartPreset: "7days",
    chartType: "area",
    chartPalette: "green",
    chartData: JSON.parse(JSON.stringify(CHART_PRESETS["7days"].data)),
    chartUnit: CHART_PRESETS["7days"].unit,
    chartScrubIndex: null,
    showMovingAvg: false,
    showTrendline: false,
    graphEquation: "sin(x)",
    graphZoom: 1,
    graphOffset: { x: 0, y: 0 },
    // Programmer lab state
    progValue: 10812n,
    progBits: 64,
    progEndian: "little",
    progActiveOp: null,
    floatPrec: 32,
    cidrPrefix: 24,
    codegenLang: "vlang",
    // Matrix lab state
    matrixDim: 2,
    matrixA: [[2, 1], [3, 4]],
    matrixB: [[1, 0], [0, 1]],
    // Calculus state
    calcEquation: "x^3 - 3*x",
    calcZoom: 1
};

const elements = {
    categoryList: document.querySelector("#categoryList"),
    categorySearch: document.querySelector("#categorySearch"),
    fromValue: document.querySelector("#fromValue"),
    toValue: document.querySelector("#toValue"),
    fromUnit: document.querySelector("#fromUnit"),
    toUnit: document.querySelector("#toUnit"),
    fromSymbol: document.querySelector("#fromSymbol"),
    toSymbol: document.querySelector("#toSymbol"),
    equation: document.querySelector("#conversionEquation"),
    precision: document.querySelector("#conversionPrecision"),
    formulaDisplay: document.querySelector("#formulaDisplay"),
    formulaExplanation: document.querySelector("#formulaExplanation"),
    referenceGrid: document.querySelector("#referenceGrid"),
    referenceLabel: document.querySelector("#referenceLabel"),
    expression: document.querySelector("#expressionDisplay"),
    result: document.querySelector("#calculationResult"),
    calcMemoryIndicator: document.querySelector("#calcMemoryIndicator"),
    historyList: document.querySelector("#historyList"),
    historyCount: document.querySelector("#historyCount"),
    toast: document.querySelector("#toast"),
    soundProfileSelect: document.querySelector("#soundProfileSelect"),
    dataChartCanvas: document.querySelector("#dataChartCanvas"),
    appleChartTooltip: document.querySelector("#appleChartTooltip"),
    daysTableBody: document.querySelector("#daysTableBody"),
    rawJsonInput: document.querySelector("#rawJsonInput"),
    jsonValidationBadge: document.querySelector("#jsonValidationBadge"),
    jsonPointsCount: document.querySelector("#jsonPointsCount"),
    // Programmer elements
    progHexInput: document.querySelector("#progHexInput"),
    progDecInput: document.querySelector("#progDecInput"),
    progOctInput: document.querySelector("#progOctInput"),
    progBinInput: document.querySelector("#progBinInput"),
    progCharInput: document.querySelector("#progCharInput"),
    bitMatrixGrid: document.querySelector("#bitMatrixGrid"),
    asciiCharDisplay: document.querySelector("#asciiCharDisplay"),
    progOpHud: document.querySelector("#progOpHud"),
    progOpBadge: document.querySelector("#progOpBadge"),
    progOpPrompt: document.querySelector("#progOpPrompt"),
    progOperandInput: document.querySelector("#progOperandInput"),
    progApplyOpBtn: document.querySelector("#progApplyOpBtn"),
    progCancelOpBtn: document.querySelector("#progCancelOpBtn"),
    // Advanced Programmer Lab Elements
    aluPopcount: document.querySelector("#aluPopcount"),
    aluClz: document.querySelector("#aluClz"),
    aluCtz: document.querySelector("#aluCtz"),
    aluPow2: document.querySelector("#aluPow2"),
    aluSignedDec: document.querySelector("#aluSignedDec"),
    aluOnesComp: document.querySelector("#aluOnesComp"),
    progParityBadge: document.querySelector("#progParityBadge"),
    floatSignBit: document.querySelector("#floatSignBit"),
    floatExpTitle: document.querySelector("#floatExpTitle"),
    floatExpBits: document.querySelector("#floatExpBits"),
    floatExpCalc: document.querySelector("#floatExpCalc"),
    floatMantTitle: document.querySelector("#floatMantTitle"),
    floatMantBits: document.querySelector("#floatMantBits"),
    floatMantCalc: document.querySelector("#floatMantCalc"),
    floatDecimalInput: document.querySelector("#floatDecimalInput"),
    floatEvalDisplay: document.querySelector("#floatEvalDisplay"),
    floatStatusBadge: document.querySelector("#floatStatusBadge"),
    ipv4ClassBadge: document.querySelector("#ipv4ClassBadge"),
    ipDottedDisplay: document.querySelector("#ipDottedDisplay"),
    cidrRange: document.querySelector("#cidrRange"),
    cidrLabel: document.querySelector("#cidrLabel"),
    ipSubnetMask: document.querySelector("#ipSubnetMask"),
    ipNetworkId: document.querySelector("#ipNetworkId"),
    ipBroadcast: document.querySelector("#ipBroadcast"),
    ipHostRange: document.querySelector("#ipHostRange"),
    colorSwatchPill: document.querySelector("#colorSwatchPill"),
    colorPickerInput: document.querySelector("#colorPickerInput"),
    colorChanR: document.querySelector("#colorChanR"),
    colorChanG: document.querySelector("#colorChanG"),
    colorChanB: document.querySelector("#colorChanB"),
    colorChanA: document.querySelector("#colorChanA"),
    colorCssDisplay: document.querySelector("#colorCssDisplay"),
    hashCrc32: document.querySelector("#hashCrc32"),
    hashAdler32: document.querySelector("#hashAdler32"),
    codegenDisplay: document.querySelector("#codegenDisplay")
};

// ============================================================================
// ADVANCED SOUND SYNTHESIS ENGINE (Web Audio API)
// ============================================================================
let audioCtx = null;
let oscAnimFrame = null;

function triggerOscilloscopePulse(pitch = 1000) {
    const canvas = document.querySelector("#audioOscilloscope");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    let t = 0;
    if (oscAnimFrame) cancelAnimationFrame(oscAnimFrame);

    function step() {
        ctx.clearRect(0, 0, w, h);
        const col = state.soundProfile === "synth" ? "#bf5af2" : (state.soundProfile === "mechanical" ? "#ff9f0a" : "#30d158");
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const decay = Math.max(0, 1 - t / 14);
        for (let x = 0; x < w; x++) {
            const y = h / 2 + Math.sin((x / 5) + t * 0.75) * (h * 0.4) * decay;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        t++;
        if (t <= 14) {
            oscAnimFrame = requestAnimationFrame(step);
        } else {
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(3, h / 2);
            ctx.lineTo(w - 3, h / 2);
            ctx.stroke();
        }
    }
    step();
}

function playSoundFeedback(type = "key") {
    if (state.soundProfile === "none") return;
    triggerOscilloscopePulse();
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;

        if (state.soundProfile === "cupertino") {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sine";
            const pitch = type === "enter" ? 1400 : (type === "clear" ? 600 : 1100);
            osc.frequency.setValueAtTime(pitch, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.015);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.015);
        } else if (state.soundProfile === "mechanical") {
            // Mechanical cherry switch click + thock
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc1.type = "triangle";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(type === "enter" ? 340 : 260, now);
            osc2.frequency.setValueAtTime(140, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);
            osc1.start();
            osc2.start();
            osc1.stop(now + 0.028);
            osc2.stop(now + 0.028);
        } else if (state.soundProfile === "synth") {
            // Retro arcade frequency chirp
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(1600, now + 0.035);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.035);
        }
    } catch {}
}

// ============================================================================
// HISTORY & STORAGE
// ============================================================================
function loadHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem("orbit-calculator-history") || "[]");
        return Array.isArray(saved) ? saved.slice(0, 50) : [];
    } catch {
        return [];
    }
}

function saveHistory() {
    localStorage.setItem("orbit-calculator-history", JSON.stringify(state.history.slice(0, 50)));
    renderHistory();
}

function addHistory(type, expression, result) {
    const latest = state.history[0];
    if (latest && latest.expression === expression && latest.result === result) return;
    state.history.unshift({ type, expression, result, note: "", timestamp: Date.now() });
    saveHistory();
}

function renderHistory() {
    if (!elements.historyList) return;
    elements.historyList.innerHTML = "";
    if (elements.historyCount) elements.historyCount.textContent = String(state.history.length);

    if (!state.history.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = "No saved calculations on the roll yet.";
        elements.historyList.append(empty);
        return;
    }

    state.history.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "history-item";
        card.dataset.copy = item.result;

        const left = document.createElement("div");
        const type = document.createElement("span");
        type.className = "history-type";
        const dateStr = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        type.textContent = `${item.type} · ${dateStr}`;

        const expr = document.createElement("div");
        expr.className = "history-expression";
        expr.textContent = item.expression;

        if (item.note) {
            const noteEl = document.createElement("div");
            noteEl.style.fontSize = "11px";
            noteEl.style.color = "var(--accent)";
            noteEl.style.marginTop = "2px";
            noteEl.textContent = `🏷 ${item.note}`;
            left.append(type, expr, noteEl);
        } else {
            left.append(type, expr);
        }

        const res = document.createElement("div");
        res.className = "history-result";
        res.textContent = item.result;

        card.append(left, res);
        elements.historyList.append(card);
    });
}

// ============================================================================
// MATH & PARSING UTILITIES
// ============================================================================
function parseNumber(value) {
    const normalized = String(value).trim().replace(/,/g, "");
    if (normalized === "" || normalized === "-" || normalized === ".") return null;

    const numericLiteral = Number(normalized);
    if (Number.isFinite(numericLiteral) && !/[a-z()+\-*/^]/i.test(normalized)) {
        return numericLiteral;
    }

    try {
        const evaluated = evaluateExpression(normalized);
        return Number.isFinite(evaluated) ? evaluated : null;
    } catch {
        return null;
    }
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return "Undefined";
    if (value === 0) return "0";
    const absolute = Math.abs(value);
    if (absolute >= 1e12 || absolute < 1e-8) {
        return value.toExponential(8).replace(/\.?0+e/, "e");
    }
    return new Intl.NumberFormat("en-US", {
        maximumSignificantDigits: 10,
        useGrouping: absolute >= 10000
    }).format(value);
}

function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function roundNumber(value, decimals = 4) {
    return Number(value.toFixed(decimals));
}

// ============================================================================
// UNIT CONVERTER LOGIC & VISUAL COMPARISON BAR
// ============================================================================
function convertValue(value, from, to) {
    const baseValue = from.toBase ? from.toBase(value) : value * from.factor;
    return to.fromBase ? to.fromBase(baseValue) : baseValue / to.factor;
}

function unitLabel(unitValue) {
    return unitValue.name.toLowerCase();
}

function renderCategories() {
    if (!elements.categoryList) return;
    const query = (elements.categorySearch?.value || "").trim().toLowerCase();
    const categoryEntries = Object.entries(CATEGORIES).filter(([key, category]) => {
        if (!query) return true;
        const categoryText = `${key} ${category.label} ${category.units.map(item => `${item.name} ${item.symbol}`).join(" ")}`.toLowerCase();
        return categoryText.includes(query);
    });

    elements.categoryList.innerHTML = "";
    if (!categoryEntries.length) {
        const empty = document.createElement("div");
        empty.className = "category-empty";
        empty.textContent = "No matching conversions";
        elements.categoryList.append(empty);
        return;
    }

    categoryEntries.forEach(([key, category]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `category-button${key === state.category ? " active" : ""}`;
        button.textContent = category.label;
        button.dataset.category = key;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", key === state.category ? "true" : "false");
        elements.categoryList.append(button);
    });
}

function fillUnitSelect(select, units, selectedIndex) {
    select.innerHTML = "";
    units.forEach((item, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${item.name} (${item.symbol})`;
        option.selected = index === selectedIndex;
        select.append(option);
    });
}

function setCategory(categoryKey) {
    const category = CATEGORIES[categoryKey];
    if (!category) return;
    state.category = categoryKey;
    fillUnitSelect(elements.fromUnit, category.units, category.defaults[0]);
    fillUnitSelect(elements.toUnit, category.units, category.defaults[1]);

    if (category.isTextCategory) {
        if (elements.fromValue) {
            elements.fromValue.setAttribute("inputmode", "text");
            elements.fromValue.setAttribute("placeholder", "Enter a character or code e.g. A, €, 65");
            if (!elements.fromValue.value || elements.fromValue.value === "0" || elements.fromValue.value === "1") {
                elements.fromValue.value = "A";
            }
        }
    } else {
        if (elements.fromValue) {
            elements.fromValue.setAttribute("inputmode", "decimal");
            elements.fromValue.setAttribute("placeholder", "Enter number...");
            if (elements.fromValue.value === "A") {
                elements.fromValue.value = "1";
            }
        }
    }

    renderCategories();
    updateConversion();
    document.querySelector(".category-button.active")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function getSelectedUnits() {
    const units = CATEGORIES[state.category].units;
    return {
        from: units[Number(elements.fromUnit.value)],
        to: units[Number(elements.toUnit.value)]
    };
}

function updateVisualScale(val, from, to, converted) {
    const badge = document.querySelector("#unitRatioBadge");
    const barFromLabel = document.querySelector("#barFromLabel");
    const barToLabel = document.querySelector("#barToLabel");
    const barFromPct = document.querySelector("#barFromPct");
    const barToPct = document.querySelector("#barToPct");
    const barFromFill = document.querySelector("#barFromFill");
    const barToFill = document.querySelector("#barToFill");

    if (!badge || !barFromFill || !barToFill) return;

    if (CATEGORIES[state.category]?.isTextCategory) {
        const code = from.toBase ? from.toBase(val) : 65;
        const charGlyph = (code >= 32 && code <= 126) || code > 160
            ? String.fromCodePoint(Math.max(0, Math.min(0x10FFFF, Math.round(Number(code) || 0))))
            : "·";
        badge.textContent = `'${charGlyph}' → U+${code.toString(16).toUpperCase().padStart(4, "0")} (${code})`;
        barFromLabel.textContent = `${from.name}`;
        barToLabel.textContent = `${to.name}`;
        barFromFill.style.width = "50%";
        barToFill.style.width = "50%";
        barFromPct.textContent = "CHAR";
        barToPct.textContent = "CODE";
        return;
    }

    if (val === null || !Number.isFinite(converted) || val <= 0 || converted <= 0) {
        badge.textContent = `1 ${from.symbol} = ${formatNumber(convertValue(1, from, to))} ${to.symbol}`;
        barFromLabel.textContent = `1 ${from.name}`;
        barToLabel.textContent = `${formatNumber(convertValue(1, from, to))} ${to.name}`;
        barFromFill.style.width = "50%";
        barToFill.style.width = "50%";
        barFromPct.textContent = "1:1";
        barToPct.textContent = "1:1";
        return;
    }

    badge.textContent = `${formatNumber(val)} ${from.symbol} = ${formatNumber(converted)} ${to.symbol}`;
    barFromLabel.textContent = `${formatNumber(val)} ${from.name}`;
    barToLabel.textContent = `${formatNumber(converted)} ${to.name}`;

    const maxVal = Math.max(val, converted);
    const fromPct = Math.max(5, Math.min(100, Math.round((val / maxVal) * 100)));
    const toPct = Math.max(5, Math.min(100, Math.round((converted / maxVal) * 100)));

    barFromFill.style.width = `${fromPct}%`;
    barToFill.style.width = `${toPct}%`;
    barFromPct.textContent = `${fromPct}%`;
    barToPct.textContent = `${toPct}%`;
}

function describeConversionFormula(value, from, to) {
    if (CATEGORIES[state.category]?.isTextCategory) {
        const code = from.toBase ? from.toBase(value) : 0;
        const res = to.fromBase ? to.fromBase(code) : code;
        const charGlyph = (code >= 32 && code <= 126) || code > 160
            ? String.fromCodePoint(Math.max(0, Math.min(0x10FFFF, Math.round(Number(code) || 0))))
            : "·";
        return {
            line: `'${charGlyph}' (Unicode Code Point: U+${code.toString(16).toUpperCase().padStart(4, "0")} / ${code})`,
            explanation: `Translated '${charGlyph}' to ${to.name}: ${res}`
        };
    }

    const sameUnit = from.name === to.name;
    if (sameUnit) {
        return {
            line: `${formatNumber(value)} × 1 = ${formatNumber(value)}`,
            explanation: `Both units are identical. This is a direct 1:1 scale.`
        };
    }

    if (from.factor && to.factor) {
        const ratio = from.factor / to.factor;
        const result = value * ratio;
        const line = `${formatNumber(value)} × (${formatNumber(from.factor)} ÷ ${formatNumber(to.factor)}) = ${formatNumber(result)}`;
        const explanation = `${from.name} is ${formatNumber(from.factor)} base units and ${to.name} is ${formatNumber(to.factor)} base units. ${formatNumber(value)} ${from.symbol} becomes ${formatNumber(result)} ${to.symbol}.`;
        return { line, explanation };
    }

    const baseValue = from.toBase ? from.toBase(value) : value;
    const result = to.fromBase ? to.fromBase(baseValue) : baseValue;
    return {
        line: `${formatNumber(value)} ${from.symbol} → ${formatNumber(baseValue)} base units → ${formatNumber(result)} ${to.symbol}`,
        explanation: `Converted via standard base unit reference.`
    };
}

function updateConversion(options = {}) {
    const category = CATEGORIES[state.category];
    const isText = category?.isTextCategory;
    const { from, to } = getSelectedUnits();
    elements.fromSymbol.textContent = from.symbol;
    elements.toSymbol.textContent = to.symbol;

    let value = null;
    if (isText) {
        const raw = elements.fromValue.value;
        if (raw && raw.length > 0) {
            value = raw;
        }
    } else {
        value = parseNumber(elements.fromValue.value);
    }

    if (value === null) {
        elements.toValue.value = "";
        elements.equation.textContent = isText ? "Enter a character or code to convert" : "Enter a valid number to convert";
        elements.precision.textContent = "Waiting for input";
        elements.formulaDisplay.textContent = "—";
        elements.formulaExplanation.textContent = isText ? "Type a character or code to see representations." : "Type in a value to see formula.";
        renderReference(null, from);
        updateVisualScale(null, from, to, null);
        return;
    }

    const converted = convertValue(value, from, to);
    const formatted = typeof converted === "string" ? converted : formatNumber(converted);
    const formula = describeConversionFormula(value, from, to);
    elements.toValue.value = formatted;
    elements.equation.textContent = isText
        ? `'${value}' (${from.symbol}) = ${formatted} (${to.symbol})`
        : `${formatNumber(value)} ${unitLabel(from)} = ${formatted} ${unitLabel(to)}`;
    elements.precision.textContent = isText
        ? "Exact Unicode Code Point / Character Encoding"
        : (Number.isFinite(converted) ? "High precision (up to 12 sig digits)" : "Result undefined");
    elements.formulaDisplay.textContent = formula.line;
    elements.formulaExplanation.textContent = formula.explanation;
    renderReference(value, from);
    updateVisualScale(value, from, to, converted);

    if (options.save && (isText || Number.isFinite(converted))) {
        addHistory("Conversion", `${value} ${from.symbol} → ${to.symbol}`, `${formatted} ${to.symbol}`);
    }
}

function renderReference(value, from) {
    const category = CATEGORIES[state.category];
    elements.referenceGrid.innerHTML = "";
    elements.referenceLabel.textContent = value === null
        ? `Based on ${from.name.toLowerCase()}`
        : (category.isTextCategory ? `All Encodings for '${value}'` : `Based on ${formatNumber(value)} ${unitLabel(from)}`);

    category.units
        .filter(item => item !== from)
        .slice(0, 8)
        .forEach(item => {
            const card = document.createElement("div");
            card.className = "reference-item";
            const label = document.createElement("span");
            const result = document.createElement("strong");
            label.textContent = item.name;
            if (category.isTextCategory) {
                result.textContent = value === null ? "—" : `${convertValue(value, from, item)}`;
            } else {
                result.textContent = value === null ? "—" : `${formatNumber(convertValue(value, from, item))} ${item.symbol}`;
            }
            card.append(label, result);
            elements.referenceGrid.append(card);
        });
}

function swapUnits() {
    playSoundFeedback("key");
    const oldFrom = elements.fromUnit.value;
    elements.fromUnit.value = elements.toUnit.value;
    elements.toUnit.value = oldFrom;
    if (CATEGORIES[state.category]?.isTextCategory) {
        elements.fromValue.value = elements.toValue.value;
    } else {
        const output = parseNumber(elements.toValue.value);
        if (output !== null) elements.fromValue.value = formatNumber(output);
    }
    updateConversion({ save: true });
}

// ============================================================================
// SCIENTIFIC CALCULATOR & EXPRESSION ENGINE
// ============================================================================
function tokenize(expression) {
    const tokens = [];
    const source = expression.replace(/\s+/g, "");
    let index = 0;

    while (index < source.length) {
        const rest = source.slice(index);
        const numberMatch = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
        const nameMatch = rest.match(/^[a-z]+/i);
        if (numberMatch) {
            tokens.push({ type: "number", value: Number(numberMatch[0]) });
            index += numberMatch[0].length;
        } else if (nameMatch) {
            const name = nameMatch[0].toLowerCase();
            if (name === "pi") tokens.push({ type: "number", value: Math.PI });
            else if (name === "e") tokens.push({ type: "number", value: Math.E });
            else if (["sin", "cos", "tan", "sqrt", "ln", "log", "abs"].includes(name)) {
                tokens.push({ type: "function", value: name });
            } else {
                throw new Error(`Unknown function "${name}"`);
            }
            index += nameMatch[0].length;
        } else if ("+-*/^()".includes(source[index])) {
            tokens.push({ type: source[index] === "(" || source[index] === ")" ? "paren" : "operator", value: source[index] });
            index += 1;
        } else {
            throw new Error(`Unsupported character "${source[index]}"`);
        }
    }
    return tokens;
}

function toRpn(tokens) {
    const output = [];
    const operators = [];
    const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
    const rightAssociative = { "^": true };

    tokens.forEach((token, index) => {
        if (token.type === "number") {
            output.push(token);
        } else if (token.type === "function") {
            operators.push(token);
        } else if (token.type === "operator") {
            const isUnary = (token.value === "+" || token.value === "-") && (
                index === 0 ||
                tokens[index - 1].type === "operator" ||
                (tokens[index - 1].type === "paren" && tokens[index - 1].value === "(")
            );

            if (isUnary && token.value === "-") {
                operators.push({ type: "unary", value: "u-" });
                return;
            }

            while (operators.length) {
                const top = operators[operators.length - 1];
                if (top.type === "operator") {
                    const topPrec = precedence[top.value];
                    const currentPrec = precedence[token.value];
                    if ((!rightAssociative[token.value] && currentPrec <= topPrec) || (rightAssociative[token.value] && currentPrec < topPrec)) {
                        output.push(operators.pop());
                        continue;
                    }
                } else if (top.type === "unary" || top.type === "function") {
                    output.push(operators.pop());
                    continue;
                }
                break;
            }
            operators.push(token);
        } else if (token.type === "paren" && token.value === "(") {
            operators.push(token);
        } else if (token.type === "paren" && token.value === ")") {
            let matched = false;
            while (operators.length) {
                const popped = operators.pop();
                if (popped.type === "paren" && popped.value === "(") {
                    matched = true;
                    break;
                }
                output.push(popped);
            }
            if (!matched) throw new Error("Mismatched parentheses");
            if (operators.length && operators[operators.length - 1].type === "function") {
                output.push(operators.pop());
            }
        }
    });

    while (operators.length) {
        const popped = operators.pop();
        if (popped.type === "paren") throw new Error("Mismatched parentheses");
        output.push(popped);
    }
    return output;
}

function evaluateRpn(rpn) {
    const stack = [];
    rpn.forEach(token => {
        if (token.type === "number") {
            stack.push(token.value);
            return;
        }
        if (token.type === "unary" && token.value === "u-") {
            const operand = stack.pop();
            stack.push(-operand);
            return;
        }
        if (token.type === "function") {
            const operand = stack.pop();
            const angleVal = state.angleMode === "deg" ? operand * (Math.PI / 180) : operand;
            switch (token.value) {
                case "sin": stack.push(Math.sin(angleVal)); break;
                case "cos": stack.push(Math.cos(angleVal)); break;
                case "tan": stack.push(Math.tan(angleVal)); break;
                case "sqrt": stack.push(Math.sqrt(operand)); break;
                case "ln": stack.push(Math.log(operand)); break;
                case "log": stack.push(Math.log10(operand)); break;
                case "abs": stack.push(Math.abs(operand)); break;
                default: throw new Error(`Unknown function ${token.value}`);
            }
            return;
        }
        if (token.type === "operator") {
            const b = stack.pop();
            const a = stack.pop();
            switch (token.value) {
                case "+": stack.push(a + b); break;
                case "-": stack.push(a - b); break;
                case "*": stack.push(a * b); break;
                case "/": stack.push(b === 0 ? Infinity : a / b); break;
                case "^": stack.push(a ** b); break;
            }
        }
    });
    return stack[0] ?? 0;
}

function evaluateExpression(expression) {
    const tokens = tokenize(expression);
    const rpn = toRpn(tokens);
    return evaluateRpn(rpn);
}

function updateCalculatorPreview() {
    elements.expression.textContent = state.expression || "0";
    try {
        const preview = state.expression ? evaluateExpression(state.expression) : 0;
        elements.result.textContent = formatNumber(preview);
    } catch {
        elements.result.textContent = state.expression ? "..." : "0";
    }
}

function appendCalculatorKey(key) {
    playSoundFeedback("key");
    if (state.justSolved && /[0-9.]/.test(key)) {
        state.expression = "";
    }
    state.justSolved = false;
    state.expression += key;
    updateCalculatorPreview();
}

function solveExpression() {
    playSoundFeedback("enter");
    if (!state.expression) return;
    try {
        const result = evaluateExpression(state.expression);
        const formatted = formatNumber(result);
        addHistory("Calculation", state.expression, formatted);
        elements.result.textContent = formatted;
        state.expression = formatted;
        state.justSolved = true;
    } catch (err) {
        elements.result.textContent = "Error";
    }
}

function updateMemoryIndicator() {
    if (!elements.calcMemoryIndicator) return;
    elements.calcMemoryIndicator.textContent = `M = ${formatNumber(state.calcMemory)}`;
    elements.calcMemoryIndicator.classList.toggle("active", state.calcMemory !== 0);
}

// ============================================================================
// PROGRAMMER & BITWISE LABORATORY ENGINE
// ============================================================================
function getProgMask() {
    return (1n << BigInt(state.progBits)) - 1n;
}

function parseBigIntFlex(raw) {
    if (raw === null || raw === undefined) return 0n;
    let s = String(raw).trim().replace(/,/g, "").replace(/\s+/g, "");
    if (!s) return 0n;
    if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
    if (s.startsWith("0b") || s.startsWith("0B")) return BigInt(s);
    if (s.startsWith("0o") || s.startsWith("0O")) return BigInt(s);
    if (/^[0-9a-fA-F]+$/i.test(s) && /[a-fA-F]/.test(s)) {
        return BigInt("0x" + s);
    }
    return BigInt(s);
}

function openProgBitOp(op) {
    const hud = elements.progOpHud;
    const badge = elements.progOpBadge;
    const prompt = elements.progOpPrompt;
    const input = elements.progOperandInput;
    if (!hud || !badge || !input) return;

    if (state.progActiveOp === op && !hud.hidden) {
        closeProgBitOp();
        return;
    }

    state.progActiveOp = op;
    hud.hidden = false;

    document.querySelector("#bitOpAnd")?.classList.toggle("active-op", op === "AND");
    document.querySelector("#bitOpOr")?.classList.toggle("active-op", op === "OR");
    document.querySelector("#bitOpXor")?.classList.toggle("active-op", op === "XOR");

    const symbols = { AND: "AND (&)", OR: "OR (|)", XOR: "XOR (^)" };
    badge.textContent = symbols[op] || op;
    if (prompt) {
        prompt.textContent = `Apply Bitwise ${op} to current value:`;
    }

    playSoundFeedback("key");
    input.focus();
    input.select();
}

function closeProgBitOp() {
    state.progActiveOp = null;
    if (elements.progOpHud) elements.progOpHud.hidden = true;
    document.querySelector("#bitOpAnd")?.classList.remove("active-op");
    document.querySelector("#bitOpOr")?.classList.remove("active-op");
    document.querySelector("#bitOpXor")?.classList.remove("active-op");
}

function applyProgBitOp(customOperand = null) {
    if (!state.progActiveOp) return;
    const input = elements.progOperandInput;
    const rawVal = customOperand !== null ? customOperand : (input ? input.value : "");

    let operand = 0n;
    try {
        operand = parseBigIntFlex(rawVal);
    } catch (err) {
        showToast("Invalid number format. Use Dec, 0xHex, or 0bBin.");
        return;
    }

    const mask = getProgMask();
    const prev = state.progValue & mask;
    let result = 0n;

    if (state.progActiveOp === "AND") {
        result = (prev & operand) & mask;
    } else if (state.progActiveOp === "OR") {
        result = (prev | operand) & mask;
    } else if (state.progActiveOp === "XOR") {
        result = (prev ^ operand) & mask;
    }

    state.progValue = result;
    playSoundFeedback("enter");
    updateProgrammerDisplays();

    const opSymbol = state.progActiveOp === "AND" ? "&" : (state.progActiveOp === "OR" ? "|" : "^");
    const hexFormatted = "0x" + (operand & mask).toString(16).toUpperCase();
    showToast(`Bitwise ${state.progActiveOp}: (${prev.toString(10)} ${opSymbol} ${hexFormatted}) applied`);
}

// CRC-32 & Adler-32 Checksums
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function computeCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function computeAdler32(bytes) {
    const MOD_ADLER = 65521;
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % MOD_ADLER;
        b = (b + a) % MOD_ADLER;
    }
    return ((b << 16) | a) >>> 0;
}

function getProgBytes(val, numBytes) {
    const arr = [];
    for (let i = 0; i < numBytes; i++) {
        arr.push(Number((val >> BigInt(i * 8)) & 0xFFn));
    }
    return arr;
}

function updateAluDiagnostics(val, mask) {
    const numBits = state.progBits;
    const B = BigInt(numBits);

    // Popcount
    let count = 0;
    let temp = val;
    while (temp > 0n) {
        count += Number(temp & 1n);
        temp >>= 1n;
    }
    if (elements.aluPopcount) elements.aluPopcount.textContent = count;

    // Binary string
    const binStr = val.toString(2).padStart(numBits, "0");

    // CLZ
    let clz = 0;
    for (let i = 0; i < numBits; i++) {
        if (binStr[i] === "1") break;
        clz++;
    }
    if (elements.aluClz) elements.aluClz.textContent = clz;

    // CTZ
    let ctz = 0;
    if (val === 0n) {
        ctz = numBits;
    } else {
        for (let i = numBits - 1; i >= 0; i--) {
            if (binStr[i] === "1") break;
            ctz++;
        }
    }
    if (elements.aluCtz) elements.aluCtz.textContent = ctz;

    // Parity
    const isEven = count % 2 === 0;
    if (elements.progParityBadge) {
        elements.progParityBadge.textContent = isEven ? "Even Parity" : "Odd Parity";
    }

    // Power of 2
    const isPow2 = val > 0n && (val & (val - 1n)) === 0n;
    if (elements.aluPow2) elements.aluPow2.textContent = isPow2 ? `Yes (2^${ctz})` : "No";

    // Signed 2's Complement
    const msbSet = (val >> (B - 1n)) & 1n;
    let signedVal = val;
    if (msbSet === 1n) {
        signedVal = val - (1n << B);
    }
    if (elements.aluSignedDec) {
        elements.aluSignedDec.textContent = (signedVal >= 0n ? "+" : "") + signedVal.toString(10);
    }

    // 1's Complement
    const onesComp = (~val) & mask;
    if (elements.aluOnesComp) {
        elements.aluOnesComp.textContent = "0x" + onesComp.toString(16).toUpperCase();
    }
}

function updateFloatDissector(val) {
    const is32 = state.floatPrec === 32;

    if (is32) {
        const u32 = Number(val & 0xFFFFFFFFn);
        const buf = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setUint32(0, u32, false);
        const f32 = view.getFloat32(0, false);

        const sign = (u32 >>> 31) & 1;
        const exp = (u32 >>> 23) & 0xFF;
        const mant = u32 & 0x7FFFFF;

        if (elements.floatSignBit) elements.floatSignBit.textContent = `${sign} (${sign === 1 ? "-" : "+"})`;
        if (elements.floatExpTitle) elements.floatExpTitle.textContent = "EXPONENT (8b)";
        if (elements.floatExpBits) elements.floatExpBits.textContent = exp.toString(2).padStart(8, "0");
        if (elements.floatExpCalc) elements.floatExpCalc.textContent = `e = ${exp} (bias 127: ${exp - 127})`;

        if (elements.floatMantTitle) elements.floatMantTitle.textContent = "MANTISSA / FRACTION (23b)";
        if (elements.floatMantBits) elements.floatMantBits.textContent = mant.toString(2).padStart(23, "0");
        const mantFrac = 1 + (mant / 0x800000);
        if (elements.floatMantCalc) elements.floatMantCalc.textContent = exp === 0 ? `Subnormal` : mantFrac.toFixed(6);

        let status = "Normalized";
        if (exp === 0 && mant === 0) status = sign === 1 ? "-0.0 (Zero)" : "+0.0 (Zero)";
        else if (exp === 0) status = "Subnormal / Denormal";
        else if (exp === 0xFF && mant === 0) status = sign === 1 ? "-Infinity" : "+Infinity";
        else if (exp === 0xFF) status = "NaN (Not-a-Number)";

        if (elements.floatStatusBadge) elements.floatStatusBadge.textContent = status;
        if (elements.floatEvalDisplay) elements.floatEvalDisplay.textContent = Number.isNaN(f32) ? "NaN" : f32.toPrecision(7);
        if (elements.floatDecimalInput && document.activeElement !== elements.floatDecimalInput) {
            elements.floatDecimalInput.value = Number.isNaN(f32) ? "NaN" : f32.toString();
        }
    } else {
        const u64 = val & 0xFFFFFFFFFFFFFFFFn;
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setBigUint64(0, u64, false);
        const f64 = view.getFloat64(0, false);

        const sign = Number((u64 >> 63n) & 1n);
        const exp = Number((u64 >> 52n) & 0x7FFn);
        const mant = u64 & 0xFFFFFFFFFFFFFn;

        if (elements.floatSignBit) elements.floatSignBit.textContent = `${sign} (${sign === 1 ? "-" : "+"})`;
        if (elements.floatExpTitle) elements.floatExpTitle.textContent = "EXPONENT (11b)";
        if (elements.floatExpBits) elements.floatExpBits.textContent = exp.toString(2).padStart(11, "0");
        if (elements.floatExpCalc) elements.floatExpCalc.textContent = `e = ${exp} (bias 1023: ${exp - 1023})`;

        if (elements.floatMantTitle) elements.floatMantTitle.textContent = "MANTISSA / FRACTION (52b)";
        if (elements.floatMantBits) elements.floatMantBits.textContent = mant.toString(2).padStart(52, "0");
        if (elements.floatMantCalc) elements.floatMantCalc.textContent = exp === 0 ? "Subnormal" : (1 + (Number(mant) / Math.pow(2, 52))).toFixed(9);

        let status = "Normalized";
        if (exp === 0 && mant === 0n) status = sign === 1 ? "-0.0 (Zero)" : "+0.0 (Zero)";
        else if (exp === 0) status = "Subnormal";
        else if (exp === 0x7FF && mant === 0n) status = sign === 1 ? "-Infinity" : "+Infinity";
        else if (exp === 0x7FF) status = "NaN";

        if (elements.floatStatusBadge) elements.floatStatusBadge.textContent = status;
        if (elements.floatEvalDisplay) elements.floatEvalDisplay.textContent = Number.isNaN(f64) ? "NaN" : f64.toPrecision(14);
        if (elements.floatDecimalInput && document.activeElement !== elements.floatDecimalInput) {
            elements.floatDecimalInput.value = Number.isNaN(f64) ? "NaN" : f64.toString();
        }
    }
}

function updateNetworkInspector(val) {
    const ip32 = Number(val & 0xFFFFFFFFn);
    const b3 = (ip32 >>> 24) & 255;
    const b2 = (ip32 >>> 16) & 255;
    const b1 = (ip32 >>> 8) & 255;
    const b0 = ip32 & 255;

    const dotted = `${b3}.${b2}.${b1}.${b0}`;
    if (elements.ipDottedDisplay) {
        if (elements.ipDottedDisplay.tagName === "INPUT") {
            if (document.activeElement !== elements.ipDottedDisplay) {
                elements.ipDottedDisplay.value = dotted;
            }
        } else {
            elements.ipDottedDisplay.textContent = dotted;
        }
    }

    // IPv4 Class
    let ipClass = "Class A";
    if (b3 >= 128 && b3 <= 191) ipClass = "Class B";
    else if (b3 >= 192 && b3 <= 223) ipClass = "Class C";
    else if (b3 >= 224 && b3 <= 239) ipClass = "Class D (Multicast)";
    else if (b3 >= 240) ipClass = "Class E (Reserved)";
    if (elements.ipv4ClassBadge) elements.ipv4ClassBadge.textContent = ipClass;

    const p = state.cidrPrefix;
    const mask32 = p === 0 ? 0 : (~0 << (32 - p)) >>> 0;
    const net32 = (ip32 & mask32) >>> 0;
    const bcast32 = (net32 | (~mask32 >>> 0)) >>> 0;

    const toDotted = num => `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;

    if (elements.ipSubnetMask) elements.ipSubnetMask.textContent = toDotted(mask32);
    if (elements.ipNetworkId) elements.ipNetworkId.textContent = toDotted(net32);
    if (elements.ipBroadcast) elements.ipBroadcast.textContent = toDotted(bcast32);

    if (elements.ipHostRange) {
        if (p >= 31) {
            elements.ipHostRange.textContent = "Point-to-Point (No host pool)";
        } else {
            const firstHost = (net32 + 1) >>> 0;
            const lastHost = (bcast32 - 1) >>> 0;
            elements.ipHostRange.textContent = `${toDotted(firstHost)} - ${toDotted(lastHost)}`;
        }
    }
}

function updateColorAndHashes(val) {
    const r = Number((val >> 16n) & 0xFFn);
    const g = Number((val >> 8n) & 0xFFn);
    const b = Number(val & 0xFFn);
    const a = state.progBits >= 32 ? Number((val >> 24n) & 0xFFn) : 255;

    if (elements.colorChanR) {
        if (elements.colorChanR.tagName === "INPUT") {
            if (document.activeElement !== elements.colorChanR) elements.colorChanR.value = r;
        } else {
            elements.colorChanR.textContent = r;
        }
    }
    if (elements.colorChanG) {
        if (elements.colorChanG.tagName === "INPUT") {
            if (document.activeElement !== elements.colorChanG) elements.colorChanG.value = g;
        } else {
            elements.colorChanG.textContent = g;
        }
    }
    if (elements.colorChanB) {
        if (elements.colorChanB.tagName === "INPUT") {
            if (document.activeElement !== elements.colorChanB) elements.colorChanB.value = b;
        } else {
            elements.colorChanB.textContent = b;
        }
    }
    if (elements.colorChanA) {
        if (elements.colorChanA.tagName === "INPUT") {
            if (document.activeElement !== elements.colorChanA) elements.colorChanA.value = a;
        } else {
            elements.colorChanA.textContent = a;
        }
    }

    const cssColor = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
    if (elements.colorSwatchPill) elements.colorSwatchPill.style.backgroundColor = cssColor;
    if (elements.colorCssDisplay) elements.colorCssDisplay.textContent = cssColor;

    const hexColor = "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
    if (elements.colorPickerInput && document.activeElement !== elements.colorPickerInput) {
        elements.colorPickerInput.value = hexColor;
    }

    // Checksums
    const bytes = getProgBytes(val, state.progBits / 8);
    const crc = computeCrc32(bytes);
    const adler = computeAdler32(bytes);

    if (elements.hashCrc32) elements.hashCrc32.textContent = "0x" + crc.toString(16).toUpperCase().padStart(8, "0");
    if (elements.hashAdler32) elements.hashAdler32.textContent = "0x" + adler.toString(16).toUpperCase().padStart(8, "0");
}

function updateCodegenSnippet(val) {
    if (!elements.codegenDisplay) return;
    const numBits = state.progBits;
    const hexChars = numBits / 4;
    const hex = (val & getProgMask()).toString(16).toUpperCase().padStart(hexChars, "0");
    const dec = (val & getProgMask()).toString(10);
    const lang = state.codegenLang;

    let code = "";
    switch (lang) {
        case "vlang":
            code = `// V (Vlang)
const mask = u${numBits}(0x${hex})

fn main() {
    val := u${numBits}(0x${hex})
    println('Hex: 0x\${val:0${hexChars}x}')
    println('Dec: \${val}')
}`;
            break;
        case "c":
            code = `// C / C++
#include <stdint.h>
#include <stdio.h>

const uint${numBits}_t MASK = 0x${hex}ULL;

int main() {
    uint${numBits}_t val = 0x${hex}ULL;
    printf("Hex: 0x%0${hexChars}llX, Dec: %llu\\n", (unsigned long long)val, (unsigned long long)val);
    return 0;
}`;
            break;
        case "rust":
            code = `// Rust
const MASK: u${numBits} = 0x${hex};

fn main() {
    let val: u${numBits} = 0x${hex};
    println!("Hex: {:#0${hexChars + 2}X}, Dec: {}", val, val);
}`;
            break;
        case "go":
            code = `// Go
package main
import "fmt"

const Mask uint${numBits} = 0x${hex}

func main() {
    val := uint${numBits}(0x${hex})
    fmt.Printf("Hex: 0x%0${hexChars}X, Dec: %d\\n", val, val)
}`;
            break;
        case "python":
            code = `# Python
MASK = 0x${hex}
val = ${dec}
print(f"Hex: {val:#0${hexChars + 2}x}, Dec: {val}")`;
            break;
        case "typescript":
            code = `// TypeScript
const MASK: bigint = 0x${hex}n;
const val: bigint = ${dec}n;
console.log(\`Hex: 0x\${val.toString(16).toUpperCase().padStart(${hexChars}, "0")}, Dec: \${val}\`);`;
            break;
        case "asm":
            code = `; x86_64 NASM Assembly
section .data
    mask dq 0x${hex}

section .text
    global _start
_start:
    mov rax, 0x${hex}
    ret`;
            break;
        case "verilog":
            code = `// Verilog
localparam [${numBits - 1}:0] MASK = ${numBits}'h${hex};
wire [${numBits - 1}:0] reg_val = ${numBits}'h${hex};`;
            break;
        default:
            code = `0x${hex}`;
    }

    elements.codegenDisplay.textContent = code;
}

function updateProgrammerDisplays() {
    const mask = getProgMask();
    const val = state.progValue & mask;

    // Hex
    const hexChars = state.progBits / 4;
    const hexStr = "0x" + val.toString(16).toUpperCase().padStart(hexChars, "0");
    if (elements.progHexInput) elements.progHexInput.value = hexStr;

    // Dec
    if (elements.progDecInput) elements.progDecInput.value = val.toString(10);

    // Oct
    if (elements.progOctInput) elements.progOctInput.value = "0o" + val.toString(8);

    // Bin
    const binStr = val.toString(2).padStart(state.progBits, "0");
    if (elements.progBinInput) elements.progBinInput.value = binStr;

    // Char
    if (elements.progCharInput && document.activeElement !== elements.progCharInput) {
        const charCode = Number(val & 0x10FFFFn);
        const charGlyph = (charCode >= 32 && charCode <= 126) || charCode > 160
            ? String.fromCodePoint(charCode)
            : "·";
        elements.progCharInput.value = `'${charGlyph}' (${charCode} / 0x${charCode.toString(16).toUpperCase()})`;
    }

    // ASCII preview of lowest byte
    const lowestByte = Number(val & 0xFFn);
    const asciiChar = lowestByte >= 32 && lowestByte <= 126 ? String.fromCharCode(lowestByte) : "·";
    if (elements.asciiCharDisplay) elements.asciiCharDisplay.textContent = `'${asciiChar}' (${lowestByte})`;

    renderBitMatrix(binStr);

    // Advanced extensions
    updateAluDiagnostics(val, mask);
    updateFloatDissector(val);
    updateNetworkInspector(val);
    updateColorAndHashes(val);
    updateCodegenSnippet(val);
}

function renderBitMatrix(binStr) {
    const grid = elements.bitMatrixGrid;
    if (!grid) return;
    grid.innerHTML = "";

    const totalBytes = state.progBits / 8;
    for (let b = 0; b < totalBytes; b++) {
        const byteGroup = document.createElement("div");
        byteGroup.className = "bit-byte-group";

        const byteStart = (totalBytes - 1 - b) * 8 + 7;
        const byteEnd = (totalBytes - 1 - b) * 8;

        const label = document.createElement("span");
        label.className = "bit-byte-label";
        label.textContent = `${byteStart}..${byteEnd}`;

        const pillsRow = document.createElement("div");
        pillsRow.className = "bit-pills-row";

        for (let bit = 7; bit >= 0; bit--) {
            const globalBitIdx = (totalBytes - 1 - b) * 8 + bit;
            const charIdx = state.progBits - 1 - globalBitIdx;
            const isSet = binStr[charIdx] === "1";

            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = `bit-pill ${isSet ? "active" : ""}`;
            pill.textContent = isSet ? "1" : "0";
            pill.title = `Bit ${globalBitIdx} (2^${globalBitIdx})`;

            pill.addEventListener("click", () => {
                playSoundFeedback("key");
                state.progValue ^= (1n << BigInt(globalBitIdx));
                updateProgrammerDisplays();
            });

            pillsRow.append(pill);
        }

        byteGroup.append(label, pillsRow);
        grid.append(byteGroup);
    }
}

// ============================================================================
// APPLE GRAPHIC CHARTS & TIME-SERIES STUDIO
// ============================================================================
function getPaletteColors(paletteName) {
    switch (paletteName) {
        case "blue":
            return { stroke: "#0071e3", fillTop: "rgba(0, 113, 227, 0.45)", fillBottom: "rgba(0, 113, 227, 0.02)", highlight: "#64d2ff" };
        case "orange":
            return { stroke: "#ff9f0a", fillTop: "rgba(255, 159, 10, 0.45)", fillBottom: "rgba(255, 159, 10, 0.02)", highlight: "#ffd60a" };
        case "purple":
            return { stroke: "#bf5af2", fillTop: "rgba(191, 90, 242, 0.45)", fillBottom: "rgba(191, 90, 242, 0.02)", highlight: "#da8fff" };
        case "green":
        default:
            return { stroke: "#30d158", fillTop: "rgba(48, 209, 88, 0.45)", fillBottom: "rgba(48, 209, 88, 0.02)", highlight: "#86efac" };
    }
}

function computeStats(points) {
    if (!points || !points.length) return null;
    const values = points.map(p => p.value).filter(Number.isFinite);
    if (!values.length) return null;

    const count = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / count;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const minPoint = points.find(p => p.value === min) || points[0];
    const maxPoint = points.find(p => p.value === max) || points[points.length - 1];

    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);

    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    const trendPct = firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100 : 0;

    return { count, sum, mean, median, min, max, minPoint, maxPoint, stdDev, trendPct, firstVal, lastVal };
}

function updateBentoHud(stats) {
    const hudCategoryTag = document.querySelector("#hudCategoryTag");
    const hudChartTitle = document.querySelector("#hudChartTitle");
    const hudHighlightValue = document.querySelector("#hudHighlightValue");
    const hudTrendBadge = document.querySelector("#hudTrendBadge");

    const bentoAvg = document.querySelector("#bentoAvg");
    const bentoTotal = document.querySelector("#bentoTotal");
    const bentoMax = document.querySelector("#bentoMax");
    const bentoMin = document.querySelector("#bentoMin");
    const bentoTrend = document.querySelector("#bentoTrend");
    const bentoStdDev = document.querySelector("#bentoStdDev");

    if (!stats) return;

    const presetInfo = CHART_PRESETS[state.chartPreset] || { category: "CUSTOM DATASET", title: "Time-Series Array & JSON View" };
    if (hudCategoryTag) hudCategoryTag.textContent = presetInfo.category;
    if (hudChartTitle) hudChartTitle.textContent = presetInfo.title;

    const unitStr = state.chartUnit === "$" ? "$" : "";
    const suffixStr = state.chartUnit && state.chartUnit !== "$" ? ` ${state.chartUnit}` : "";

    if (hudHighlightValue) {
        hudHighlightValue.innerHTML = `${unitStr}${formatNumber(roundNumber(stats.mean, 1))}${suffixStr} <small>avg/day</small>`;
    }
    if (hudTrendBadge) {
        const sign = stats.trendPct >= 0 ? "▲ +" : "▼ ";
        hudTrendBadge.textContent = `${sign}${formatNumber(roundNumber(stats.trendPct, 1))}% trend`;
        hudTrendBadge.className = `pill-badge ${stats.trendPct >= 0 ? "positive" : "negative"}`;
    }

    if (bentoAvg) bentoAvg.textContent = `${unitStr}${formatNumber(roundNumber(stats.mean, 2))}${suffixStr}`;
    if (bentoTotal) bentoTotal.textContent = `${unitStr}${formatNumber(roundNumber(stats.sum, 1))}${suffixStr}`;
    if (bentoMax) bentoMax.textContent = `${unitStr}${formatNumber(stats.max)} (${stats.maxPoint.day})`;
    if (bentoMin) bentoMin.textContent = `${unitStr}${formatNumber(stats.min)} (${stats.minPoint.day})`;
    if (bentoTrend) {
        const tSign = stats.trendPct >= 0 ? "+" : "";
        bentoTrend.textContent = `${tSign}${formatNumber(roundNumber(stats.trendPct, 1))}%`;
        bentoTrend.style.color = stats.trendPct >= 0 ? "#30d158" : "#ff453a";
    }
    if (bentoStdDev) bentoStdDev.textContent = `±${formatNumber(roundNumber(stats.stdDev, 2))}`;
}

function renderDataChart() {
    const canvas = elements.dataChartCanvas;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1000;
    const height = 380;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const points = state.chartData;
    if (!points || !points.length) {
        ctx.fillStyle = isLight ? "#86868b" : "#8e9bb0";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No data points available. Enter points in table or JSON.", width / 2, height / 2);
        return;
    }

    const stats = computeStats(points);
    updateBentoHud(stats);

    const padding = { top: 40, bottom: 45, left: 60, right: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const palette = getPaletteColors(state.chartPalette);

    if (state.chartType === "ring") {
        renderActivityRings(ctx, points, width, height, palette, isLight);
        return;
    }

    const minVal = Math.min(0, stats.min);
    const maxVal = Math.max(1, stats.max * 1.15);
    const valRange = maxVal - minVal || 1;

    const getX = i => padding.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const getY = val => padding.top + chartH - ((val - minVal) / valRange) * chartH;

    // Horizontal Gridlines
    const gridSteps = 4;
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)";
    ctx.fillStyle = isLight ? "#86868b" : "#6e6e78";
    ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;

    for (let s = 0; s <= gridSteps; s++) {
        const val = minVal + (valRange / gridSteps) * s;
        const y = getY(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(formatNumber(roundNumber(val, 0)), padding.left - 10, y + 4);
    }

    // Average Dotted Line
    const avgY = getY(stats.mean);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(padding.left, avgY);
    ctx.lineTo(width - padding.right, avgY);
    ctx.stroke();
    ctx.restore();

    // Chart Type: Pill Bar Chart
    if (state.chartType === "bar") {
        const barSlot = chartW / points.length;
        const barWidth = Math.min(42, Math.max(8, barSlot * 0.55));

        points.forEach((p, i) => {
            const x = padding.left + i * barSlot + (barSlot - barWidth) / 2;
            const y = getY(p.value);
            const base = getY(0);
            const barH = Math.max(4, base - y);

            const isHovered = state.chartScrubIndex === i;

            const barGrad = ctx.createLinearGradient(0, y, 0, base);
            barGrad.addColorStop(0, isHovered ? palette.highlight : palette.stroke);
            barGrad.addColorStop(1, isHovered ? "rgba(255,255,255,0.2)" : palette.fillTop);

            ctx.fillStyle = barGrad;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barH, [barWidth / 2, barWidth / 2, 4, 4]);
            ctx.fill();

            // X-axis label
            if (points.length <= 15 || i % Math.ceil(points.length / 12) === 0) {
                ctx.fillStyle = isHovered ? (isLight ? "#000" : "#fff") : (isLight ? "#86868b" : "#6e6e78");
                ctx.font = isHovered ? "bold 11px -apple-system, sans-serif" : "11px -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(p.day, x + barWidth / 2, height - padding.bottom + 18);
            }
        });
        return;
    }

    // Chart Type: Stepped Cumulative
    if (state.chartType === "stepped") {
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = 3;
        ctx.beginPath();
        points.forEach((p, i) => {
            const x = getX(i);
            const y = getY(p.value);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, getY(points[i - 1].value));
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        renderXLabels(ctx, points, getX, height, padding, isLight);
        return;
    }

    // Default: AREA SPLINE (Apple Health / Stocks style)
    const curvePoints = points.map((p, i) => ({ x: getX(i), y: getY(p.value) }));

    // Area Gradient Fill
    const fillGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    fillGrad.addColorStop(0, palette.fillTop);
    fillGrad.addColorStop(1, palette.fillBottom);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(curvePoints[0].x, padding.top + chartH);
    ctx.lineTo(curvePoints[0].x, curvePoints[0].y);

    for (let i = 0; i < curvePoints.length - 1; i++) {
        const p0 = curvePoints[i];
        const p1 = curvePoints[i + 1];
        const cpx1 = p0.x + (p1.x - p0.x) / 2;
        const cpy1 = p0.y;
        const cpx2 = p0.x + (p1.x - p0.x) / 2;
        const cpy2 = p1.y;
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, p1.x, p1.y);
    }

    ctx.lineTo(curvePoints[curvePoints.length - 1].x, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.restore();

    // Spline Stroke
    ctx.save();
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(curvePoints[0].x, curvePoints[0].y);

    for (let i = 0; i < curvePoints.length - 1; i++) {
        const p0 = curvePoints[i];
        const p1 = curvePoints[i + 1];
        const cpx1 = p0.x + (p1.x - p0.x) / 2;
        const cpy1 = p0.y;
        const cpx2 = p0.x + (p1.x - p0.x) / 2;
        const cpy2 = p1.y;
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, p1.x, p1.y);
    }
    ctx.stroke();
    ctx.restore();

    // Optional 7d Moving Average (Gold)
    if (state.showMovingAvg && points.length >= 3) {
        ctx.save();
        ctx.strokeStyle = "#ffd60a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const k = Math.min(7, points.length);
        for (let i = 0; i < points.length; i++) {
            const start = Math.max(0, i - k + 1);
            const slice = points.slice(start, i + 1);
            const ma = slice.reduce((acc, p) => acc + p.value, 0) / slice.length;
            const x = getX(i);
            const y = getY(ma);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Optional Linear Regression Trendline (Cyan)
    if (state.showTrendline && points.length >= 2) {
        ctx.save();
        ctx.strokeStyle = "#64d2ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        points.forEach((p, i) => {
            sumX += i;
            sumY += p.value;
            sumXY += i * p.value;
            sumXX += i * i;
        });
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const y0 = getY(intercept);
        const yN = getY(slope * (n - 1) + intercept);

        ctx.beginPath();
        ctx.moveTo(getX(0), y0);
        ctx.lineTo(getX(n - 1), yN);
        ctx.stroke();
        ctx.restore();
    }

    // Statistical Regression Fit Models (Linear, Exponential, Quadratic)
    const regSelect = document.querySelector("#chartRegressionModel");
    const regModel = regSelect ? regSelect.value : "none";
    const regHud = document.querySelector("#regressionHudRow");

    if (regModel !== "none" && points.length >= 2) {
        const n = points.length;
        const meanY = stats.mean;
        let ssTot = 0, ssRes = 0;
        let fnFit = null;
        let formulaStr = "";
        let modelName = "";

        if (regModel === "linear") {
            modelName = "Linear (y = mx + b)";
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            points.forEach((p, i) => {
                sumX += i;
                sumY += p.value;
                sumXY += i * p.value;
                sumXX += i * i;
            });
            const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
            const b = (sumY - m * sumX) / n;
            fnFit = x => m * x + b;
            formulaStr = `y = ${m >= 0 ? "" : "-"}${Math.abs(m).toFixed(2)}x ${b >= 0 ? "+" : "-"} ${Math.abs(b).toFixed(1)}`;
        } else if (regModel === "exponential") {
            modelName = "Exponential (y = a·eᵇˣ)";
            let sumX = 0, sumLny = 0, sumXLny = 0, sumXX = 0;
            let valid = true;
            points.forEach((p, i) => {
                if (p.value <= 0) valid = false;
                const ly = Math.log(Math.max(0.001, p.value));
                sumX += i;
                sumLny += ly;
                sumXLny += i * ly;
                sumXX += i * i;
            });
            if (valid) {
                const b = (n * sumXLny - sumX * sumLny) / (n * sumXX - sumX * sumX || 1);
                const lna = (sumLny - b * sumX) / n;
                const a = Math.exp(lna);
                fnFit = x => a * Math.exp(b * x);
                formulaStr = `y = ${a.toFixed(1)} · e^(${b >= 0 ? "+" : ""}${b.toFixed(3)}x)`;
            }
        } else if (regModel === "quadratic" && points.length >= 3) {
            modelName = "Quadratic 2° (ax² + bx + c)";
            let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
            let t0 = 0, t1 = 0, t2 = 0;
            points.forEach((p, i) => {
                const x = i, y = p.value;
                s1 += x; s2 += x*x; s3 += x*x*x; s4 += x*x*x*x;
                t0 += y; t1 += x*y; t2 += x*x*y;
            });
            const A = [
                [s4, s3, s2],
                [s3, s2, s1],
                [s2, s1, s0]
            ];
            const B = [t2, t1, t0];
            const detA = A[0][0]*(A[1][1]*A[2][2] - A[1][2]*A[2][1]) -
                         A[0][1]*(A[1][0]*A[2][2] - A[1][2]*A[2][0]) +
                         A[0][2]*(A[1][0]*A[2][1] - A[1][1]*A[2][0]);
            if (Math.abs(detA) > 1e-12) {
                function detCol(cIdx) {
                    const M = [
                        [cIdx === 0 ? B[0] : A[0][0], cIdx === 1 ? B[0] : A[0][1], cIdx === 2 ? B[0] : A[0][2]],
                        [cIdx === 0 ? B[1] : A[1][0], cIdx === 1 ? B[1] : A[1][1], cIdx === 2 ? B[1] : A[1][2]],
                        [cIdx === 0 ? B[2] : A[2][0], cIdx === 1 ? B[2] : A[2][1], cIdx === 2 ? B[2] : A[2][2]]
                    ];
                    return M[0][0]*(M[1][1]*M[2][2] - M[1][2]*M[2][1]) -
                           M[0][1]*(M[1][0]*M[2][2] - M[1][2]*M[2][0]) +
                           M[0][2]*(M[1][0]*M[2][1] - M[1][1]*M[2][0]);
                }
                const a = detCol(0) / detA;
                const b = detCol(1) / detA;
                const c = detCol(2) / detA;
                fnFit = x => a * x * x + b * x + c;
                formulaStr = `y = ${a.toFixed(2)}x² ${b >= 0 ? "+" : "-"} ${Math.abs(b).toFixed(2)}x ${c >= 0 ? "+" : "-"} ${Math.abs(c).toFixed(1)}`;
            }
        }

        if (fnFit) {
            points.forEach((p, i) => {
                const yPred = fnFit(i);
                ssTot += (p.value - meanY) ** 2;
                ssRes += (p.value - yPred) ** 2;
            });
            const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

            if (regHud) {
                regHud.hidden = false;
                const mEl = document.querySelector("#hudRegModelName");
                const fEl = document.querySelector("#hudRegEquation");
                const rEl = document.querySelector("#hudRegR2");
                if (mEl) mEl.textContent = modelName;
                if (fEl) fEl.textContent = formulaStr;
                if (rEl) rEl.textContent = r2.toFixed(4);
            }

            // Draw Fitted Regression Curve
            ctx.save();
            ctx.strokeStyle = "#bf5af2";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            const steps = 100;
            for (let step = 0; step <= steps; step++) {
                const iFloat = (step / steps) * (points.length - 1);
                const xCanvas = padding.left + (iFloat / (points.length - 1)) * chartW;
                const yVal = fnFit(iFloat);
                const yCanvas = getY(yVal);
                if (step === 0) ctx.moveTo(xCanvas, yCanvas);
                else ctx.lineTo(xCanvas, yCanvas);
            }
            ctx.stroke();
            ctx.restore();
        }
    } else if (regHud) {
        regHud.hidden = true;
    }

    renderXLabels(ctx, points, getX, height, padding, isLight);

    // Scrubber Hover Marker
    if (state.chartScrubIndex !== null && curvePoints[state.chartScrubIndex]) {
        const activePoint = curvePoints[state.chartScrubIndex];

        ctx.save();
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(activePoint.x, padding.top);
        ctx.lineTo(activePoint.x, padding.top + chartH);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = palette.stroke;
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(activePoint.x, activePoint.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.stroke;
        ctx.stroke();
        ctx.restore();
    }
}

function renderXLabels(ctx, points, getX, height, padding, isLight) {
    const step = Math.max(1, Math.ceil(points.length / 10));
    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillStyle = isLight ? "#86868b" : "#6e6e78";
    ctx.textAlign = "center";

    points.forEach((p, i) => {
        if (i % step === 0 || i === points.length - 1) {
            ctx.fillText(p.day, getX(i), height - padding.bottom + 20);
        }
    });
}

function renderActivityRings(ctx, points, width, height, palette, isLight) {
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(cx, cy) - 30;
    const ringCount = Math.min(5, points.length);
    const ringWidth = Math.max(10, Math.floor(maxRadius / (ringCount * 1.6)));

    const maxVal = Math.max(...points.map(p => p.value)) || 1;

    for (let i = 0; i < ringCount; i++) {
        const r = maxRadius - i * (ringWidth + 8);
        const p = points[i];
        const fraction = Math.min(1.25, Math.max(0.05, p.value / maxVal));

        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
        ctx.lineWidth = ringWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = i === 0 ? palette.stroke : (i === 1 ? "#0071e3" : (i === 2 ? "#ff9f0a" : "#bf5af2"));
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        ctx.stroke();
    }

    ctx.fillStyle = isLight ? "#1d1d1f" : "#f5f5f7";
    ctx.font = "bold 20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${points.length} Days`, cx, cy - 4);
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillStyle = isLight ? "#86868b" : "#8e9bb0";
    ctx.fillText("Active Overview", cx, cy + 16);
}

function handleChartScrubber(clientX, clientY) {
    const canvas = elements.dataChartCanvas;
    if (!canvas || !state.chartData.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = { left: 60, right: 35 };
    const chartW = rect.width - padding.left - padding.right;

    const relX = Math.max(0, Math.min(chartW, x - padding.left));
    const count = state.chartData.length;
    const closestIdx = Math.max(0, Math.min(count - 1, Math.round((relX / chartW) * (count - 1))));

    if (state.chartScrubIndex !== closestIdx) {
        state.chartScrubIndex = closestIdx;
        playSoundFeedback("key");
        renderDataChart();
    }

    const tooltip = elements.appleChartTooltip;
    if (!tooltip) return;

    const p = state.chartData[closestIdx];
    const prev = closestIdx > 0 ? state.chartData[closestIdx - 1] : null;
    const stats = computeStats(state.chartData);

    const ttDayLabel = document.querySelector("#ttDayLabel");
    const ttMainVal = document.querySelector("#ttMainVal");
    const ttDeltaVal = document.querySelector("#ttDeltaVal");
    const ttAvgDiff = document.querySelector("#ttAvgDiff");

    if (ttDayLabel) ttDayLabel.textContent = p.day;
    if (ttMainVal) ttMainVal.textContent = `${state.chartUnit === "$" ? "$" : ""}${formatNumber(p.value)}${state.chartUnit && state.chartUnit !== "$" ? ` ${state.chartUnit}` : ""}`;

    if (ttDeltaVal) {
        if (prev && prev.value > 0) {
            const deltaPct = ((p.value - prev.value) / prev.value) * 100;
            const sign = deltaPct >= 0 ? "▲ +" : "▼ ";
            ttDeltaVal.textContent = `${sign}${formatNumber(roundNumber(deltaPct, 1))}% vs prev`;
            ttDeltaVal.className = `tt-delta ${deltaPct >= 0 ? "positive" : "negative"}`;
        } else {
            ttDeltaVal.textContent = "Day 1 baseline";
            ttDeltaVal.className = "tt-delta";
        }
    }

    if (ttAvgDiff && stats) {
        const diffPct = stats.mean > 0 ? ((p.value - stats.mean) / stats.mean) * 100 : 0;
        const sign = diffPct >= 0 ? "+" : "";
        ttAvgDiff.textContent = `${sign}${formatNumber(roundNumber(diffPct, 1))}% vs dataset average`;
    }

    tooltip.hidden = false;
    const tooltipX = Math.max(10, Math.min(rect.width - 200, x - 100));
    tooltip.style.transform = `translate(${tooltipX}px, 15px)`;
}

// ============================================================================
// DATA STUDIO: INTERACTIVE TABLE & RAW JSON PARSER
// ============================================================================
function renderDaysTable() {
    if (!elements.daysTableBody) return;
    elements.daysTableBody.innerHTML = "";

    const maxVal = Math.max(...state.chartData.map(p => p.value), 1);

    state.chartData.forEach((point, index) => {
        const tr = document.createElement("tr");

        const tdIdx = document.createElement("td");
        tdIdx.textContent = String(index + 1);
        tdIdx.style.color = "var(--muted)";

        const tdDay = document.createElement("td");
        const inDay = document.createElement("input");
        inDay.type = "text";
        inDay.value = point.day;
        inDay.addEventListener("input", e => {
            point.day = e.target.value;
            syncJsonFromTable();
            renderDataChart();
        });
        tdDay.append(inDay);

        const tdVal = document.createElement("td");
        const inVal = document.createElement("input");
        inVal.type = "number";
        inVal.value = point.value;
        inVal.addEventListener("input", e => {
            point.value = Number(e.target.value) || 0;
            syncJsonFromTable();
            renderDataChart();
        });
        tdVal.append(inVal);

        const tdShare = document.createElement("td");
        const barWrap = document.createElement("div");
        barWrap.className = "day-share-bar";
        const barFill = document.createElement("div");
        barFill.className = "day-share-fill";
        barFill.style.width = `${Math.max(5, Math.min(100, Math.round((point.value / maxVal) * 100)))}%`;
        barWrap.append(barFill);
        tdShare.append(barWrap);

        const tdAct = document.createElement("td");
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "row-del-btn";
        btnDel.textContent = "✕";
        btnDel.title = "Remove day";
        btnDel.addEventListener("click", () => {
            if (state.chartData.length <= 1) return;
            state.chartData.splice(index, 1);
            renderDaysTable();
            syncJsonFromTable();
            renderDataChart();
        });
        tdAct.append(btnDel);

        tr.append(tdIdx, tdDay, tdVal, tdShare, tdAct);
        elements.daysTableBody.append(tr);
    });
}

function syncJsonFromTable() {
    if (!elements.rawJsonInput) return;
    elements.rawJsonInput.value = JSON.stringify(state.chartData, null, 2);
    updateJsonValidationStatus(true, state.chartData.length);
}

function updateJsonValidationStatus(isValid, count) {
    if (elements.jsonValidationBadge) {
        elements.jsonValidationBadge.textContent = isValid ? "✓ Valid Dataset" : "⚠ Parse Error";
        elements.jsonValidationBadge.className = `json-validation-badge ${isValid ? "valid" : "invalid"}`;
    }
    if (elements.jsonPointsCount) {
        elements.jsonPointsCount.textContent = `${count} points`;
    }
}

function parseAndLoadCustomData(rawText) {
    if (!rawText.trim()) return false;
    let parsed = null;

    try {
        parsed = JSON.parse(rawText);
    } catch {
        const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) {
            parsed = lines.map((line, idx) => {
                const parts = line.split(/[,\t]/).map(p => p.trim());
                if (parts.length >= 2 && !isNaN(Number(parts[1]))) {
                    return { day: parts[0], value: Number(parts[1]) };
                }
                const num = Number(parts[0]);
                return { day: `Day ${idx + 1}`, value: isNaN(num) ? 0 : num };
            });
        }
    }

    if (!parsed) return false;

    let normalized = [];
    if (Array.isArray(parsed)) {
        normalized = parsed.map((item, i) => {
            if (typeof item === "number") {
                return { day: `Day ${i + 1}`, value: item };
            }
            if (item && typeof item === "object") {
                const dayKey = Object.keys(item).find(k => /day|date|time|label|name/i.test(k)) || Object.keys(item)[0];
                const valKey = Object.keys(item).find(k => /val|step|count|sale|rev|amount|price/i.test(k)) || Object.keys(item).find(k => typeof item[k] === "number") || Object.keys(item)[1];
                return {
                    day: String(item[dayKey] ?? `Day ${i + 1}`),
                    value: Number(item[valKey]) || 0
                };
            }
            return { day: `Day ${i + 1}`, value: 0 };
        });
    } else if (typeof parsed === "object") {
        normalized = Object.entries(parsed).map(([key, val]) => ({
            day: key,
            value: Number(val) || 0
        }));
    }

    if (normalized.length > 0) {
        state.chartData = normalized;
        state.chartPreset = "custom";
        renderDaysTable();
        renderDataChart();
        updateJsonValidationStatus(true, normalized.length);
        return true;
    }
    return false;
}

// ============================================================================
// CALCULUS & EQUATION ANALYSIS STUDIO
// ============================================================================
function safeEvalGraphExpression(expression, x) {
    let sanitized = expression
        .replace(/\s+/g, "")
        .replace(/(\d+)([a-zA-Z(])/g, "$1*$2")
        .replace(/\)([\d(a-zA-Z])/g, ")*$1")
        .replace(/\^/g, "**")
        .replace(/pi/gi, "Math.PI")
        .replace(/e\^/gi, "Math.exp")
        .replace(/\be\b/gi, "Math.E")
        .replace(/sin\(/gi, "Math.sin(")
        .replace(/cos\(/gi, "Math.cos(")
        .replace(/tan\(/gi, "Math.tan(")
        .replace(/asin\(/gi, "Math.asin(")
        .replace(/acos\(/gi, "Math.acos(")
        .replace(/atan\(/gi, "Math.atan(")
        .replace(/sqrt\(/gi, "Math.sqrt(")
        .replace(/cbrt\(/gi, "Math.cbrt(")
        .replace(/ln\(/gi, "Math.log(")
        .replace(/log\(/gi, "Math.log10(")
        .replace(/abs\(/gi, "Math.abs(")
        .replace(/exp\(/gi, "Math.exp(")
        .replace(/floor\(/gi, "Math.floor(")
        .replace(/ceil\(/gi, "Math.ceil(")
        .replace(/round\(/gi, "Math.round(");

    const fn = new Function("x", `"use strict"; return (${sanitized});`);
    return fn(x);
}

function drawCalculusStudio() {
    const canvas = document.querySelector("#calculusCanvas");
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 900;
    const height = 400;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = isLight ? "#fbfcfd" : "#0c101a";
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 40 * state.calcZoom;

    // Grid
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = centerX % scale; x <= width; x += scale) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = centerY % scale; y <= height; y += scale) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.stroke();

    const gmode = state.graphMode || "cartesian";

    if (gmode === "cartesian") {
        const eqn = state.calcEquation;
        const a = Number(document.querySelector("#integralA")?.value ?? -1);
        const b = Number(document.querySelector("#integralB")?.value ?? 2);

        // Shaded Area for Definite Integral
        ctx.fillStyle = "rgba(48, 209, 88, 0.22)";
        ctx.beginPath();
        const pxA = centerX + a * scale;
        const pxB = centerX + b * scale;
        ctx.moveTo(pxA, centerY);

        for (let px = pxA; px <= pxB; px += 2) {
            const gx = (px - centerX) / scale;
            try {
                const gy = safeEvalGraphExpression(eqn, gx);
                if (Number.isFinite(gy)) ctx.lineTo(px, centerY - gy * scale);
            } catch {}
        }
        ctx.lineTo(pxB, centerY);
        ctx.closePath();
        ctx.fill();

        // Plot Function Curve
        ctx.strokeStyle = "#30d158";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;

        for (let px = 0; px <= width; px += 2) {
            const gx = (px - centerX) / scale;
            let gy;
            try {
                gy = safeEvalGraphExpression(eqn, gx);
            } catch {
                started = false; continue;
            }
            if (!Number.isFinite(gy)) { started = false; continue; }
            const py = centerY - gy * scale;
            if (!started) { ctx.moveTo(px, py); started = true; }
            else { ctx.lineTo(px, py); }
        }
        ctx.stroke();

        // Tangent Line at x0
        const x0 = Number(document.querySelector("#derivX0")?.value ?? 1.5);
        try {
            const y0 = safeEvalGraphExpression(eqn, x0);
            const h = 0.0001;
            const slope = (safeEvalGraphExpression(eqn, x0 + h) - safeEvalGraphExpression(eqn, x0 - h)) / (2 * h);

            const ptX = centerX + x0 * scale;
            const ptY = centerY - y0 * scale;

            // Tangent Line
            ctx.strokeStyle = "#0071e3";
            ctx.lineWidth = 2;
            ctx.beginPath();
            const tanX1 = ptX - 120;
            const tanY1 = ptY + (120 / scale) * slope * scale;
            const tanX2 = ptX + 120;
            const tanY2 = ptY - (120 / scale) * slope * scale;
            ctx.moveTo(tanX1, tanY1);
            ctx.lineTo(tanX2, tanY2);
            ctx.stroke();

            // Tangent Point Bead
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(ptX, ptY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#0071e3";
            ctx.stroke();
        } catch {}
    } else if (gmode === "dual") {
        const fEqn = state.calcEquation || "x^3 - 3*x";
        const gEqn = document.querySelector("#calcEqnInputG")?.value.trim() || "2*x - 1";

        // Plot f(x) (Mint)
        ctx.strokeStyle = "#30d158";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;
        for (let px = 0; px <= width; px += 2) {
            const gx = (px - centerX) / scale;
            try {
                const gy = safeEvalGraphExpression(fEqn, gx);
                if (Number.isFinite(gy)) {
                    const py = centerY - gy * scale;
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                } else started = false;
            } catch { started = false; }
        }
        ctx.stroke();

        // Plot g(x) (Orange)
        ctx.strokeStyle = "#ff9f0a";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        started = false;
        for (let px = 0; px <= width; px += 2) {
            const gx = (px - centerX) / scale;
            try {
                const gy = safeEvalGraphExpression(gEqn, gx);
                if (Number.isFinite(gy)) {
                    const py = centerY - gy * scale;
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                } else started = false;
            } catch { started = false; }
        }
        ctx.stroke();

        // Find and mark intersection points f(x) ≈ g(x)
        const intersects = [];
        let prevDiff = null;
        for (let gx = -10; gx <= 10; gx += 0.05) {
            try {
                const fy = safeEvalGraphExpression(fEqn, gx);
                const gy = safeEvalGraphExpression(gEqn, gx);
                const diff = fy - gy;
                if (prevDiff !== null && Math.sign(diff) !== Math.sign(prevDiff) && Math.abs(diff) < 20) {
                    const intX = roundNumber(gx, 2);
                    const intY = roundNumber(fy, 2);
                    intersects.push({ x: intX, y: intY });

                    // Draw intersection bead
                    const ix = centerX + intX * scale;
                    const iy = centerY - intY * scale;
                    ctx.save();
                    ctx.shadowColor = "#bf5af2";
                    ctx.shadowBlur = 10;
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(ix, iy, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#bf5af2";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.restore();
                }
                prevDiff = diff;
            } catch {}
        }
        const intEl = document.querySelector("#dualIntersectsResult");
        if (intEl) {
            intEl.textContent = intersects.length ?
                `Intersections (${intersects.length}): ${intersects.map(p => `(${p.x}, ${p.y})`).join(" · ")}` :
                "No intersection points found in domain [-10, 10]";
        }
    } else if (gmode === "polar") {
        const polarEqn = document.querySelector("#calcEqnInputPolar")?.value.trim() || "1 - cos(theta)";
        ctx.strokeStyle = "#bf5af2";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;
        const maxTheta = Math.PI * 4;

        for (let th = 0; th <= maxTheta; th += 0.015) {
            try {
                const r = safeEvalGraphExpression(polarEqn.replace(/theta/gi, "x"), th);
                if (Number.isFinite(r)) {
                    const gx = r * Math.cos(th);
                    const gy = r * Math.sin(th);
                    const px = centerX + gx * scale;
                    const py = centerY - gy * scale;
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                } else started = false;
            } catch { started = false; }
        }
        ctx.stroke();
    } else if (gmode === "parametric") {
        const xEqn = document.querySelector("#calcParamX")?.value.trim() || "cos(3*t)";
        const yEqn = document.querySelector("#calcParamY")?.value.trim() || "sin(2*t)";
        ctx.strokeStyle = "#0071e3";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;
        const maxT = Math.PI * 2;

        for (let t = 0; t <= maxT; t += 0.015) {
            try {
                const gx = safeEvalGraphExpression(xEqn.replace(/t/gi, "x"), t);
                const gy = safeEvalGraphExpression(yEqn.replace(/t/gi, "x"), t);
                if (Number.isFinite(gx) && Number.isFinite(gy)) {
                    const px = centerX + gx * scale;
                    const py = centerY - gy * scale;
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                } else started = false;
            } catch { started = false; }
        }
        ctx.stroke();
    }
}

function calculateDefiniteIntegral() {
    const eqn = state.calcEquation;
    const a = Number(document.querySelector("#integralA")?.value ?? -1);
    const b = Number(document.querySelector("#integralB")?.value ?? 2);
    const n = 1000;
    const h = (b - a) / n;

    let sum = safeEvalGraphExpression(eqn, a) + safeEvalGraphExpression(eqn, b);
    for (let i = 1; i < n; i++) {
        const x = a + i * h;
        const val = safeEvalGraphExpression(eqn, x);
        sum += i % 2 === 0 ? 2 * val : 4 * val;
    }
    const result = (h / 3) * sum;

    const resEl = document.querySelector("#integralResult");
    if (resEl) resEl.textContent = `∫ [${a}, ${b}] f(x)dx = ${formatNumber(roundNumber(result, 4))}`;
    drawCalculusStudio();
}

function calculateDerivativeAtPoint() {
    const eqn = state.calcEquation;
    const x0 = Number(document.querySelector("#derivX0")?.value ?? 1.5);
    const h = 0.0001;
    const y0 = safeEvalGraphExpression(eqn, x0);
    const slope = (safeEvalGraphExpression(eqn, x0 + h) - safeEvalGraphExpression(eqn, x0 - h)) / (2 * h);
    const intercept = y0 - slope * x0;

    const dRes = document.querySelector("#derivResult");
    const dTan = document.querySelector("#derivTangentLine");
    if (dRes) dRes.textContent = `f'(${x0}) = ${formatNumber(roundNumber(slope, 4))} · Slope m = ${formatNumber(roundNumber(slope, 3))}`;
    if (dTan) dTan.textContent = `Tangent line: y = ${roundNumber(slope, 2)}x ${intercept >= 0 ? "+" : "−"} ${roundNumber(Math.abs(intercept), 2)}`;

    drawCalculusStudio();
}

function findEquationRoot() {
    const eqn = state.calcEquation;
    let x = Number(document.querySelector("#rootGuess")?.value ?? 1.8);
    const h = 0.0001;

    for (let iter = 0; iter < 100; iter++) {
        const y = safeEvalGraphExpression(eqn, x);
        if (Math.abs(y) < 1e-8) break;
        const dy = (safeEvalGraphExpression(eqn, x + h) - safeEvalGraphExpression(eqn, x - h)) / (2 * h);
        if (Math.abs(dy) < 1e-12) break;
        x = x - y / dy;
    }

    const yFinal = safeEvalGraphExpression(eqn, x);
    const rootEl = document.querySelector("#rootResult");
    if (rootEl) {
        rootEl.textContent = `Root: x = ${formatNumber(roundNumber(x, 4))} · f(x) ≈ ${formatNumber(roundNumber(yFinal, 5))}`;
    }
}

// ============================================================================
// MATRIX & LINEAR ALGEBRA LABORATORY
// ============================================================================
function renderMatrixInputs() {
    const gridA = document.querySelector("#matrixAGrid");
    const gridB = document.querySelector("#matrixBGrid");
    if (!gridA || !gridB) return;

    const n = state.matrixDim;
    gridA.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    gridB.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    gridA.innerHTML = "";
    gridB.innerHTML = "";

    // Adjust data array dimensions
    state.matrixA = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => state.matrixA[r]?.[c] ?? (r === c ? 1 : 0)));
    state.matrixB = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => state.matrixB[r]?.[c] ?? (r === c ? 1 : 0)));

    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const inA = document.createElement("input");
            inA.type = "number";
            inA.className = "matrix-cell-input";
            inA.value = state.matrixA[r][c];
            inA.addEventListener("input", e => state.matrixA[r][c] = Number(e.target.value) || 0);
            gridA.append(inA);

            const inB = document.createElement("input");
            inB.type = "number";
            inB.className = "matrix-cell-input";
            inB.value = state.matrixB[r][c];
            inB.addEventListener("input", e => state.matrixB[r][c] = Number(e.target.value) || 0);
            gridB.append(inB);
        }
    }
}

function matrixDeterminant(M) {
    const n = M.length;
    if (n === 1) return M[0][0];
    if (n === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];

    let det = 0;
    for (let c = 0; c < n; c++) {
        const sub = M.slice(1).map(row => row.filter((_, colIdx) => colIdx !== c));
        det += (c % 2 === 0 ? 1 : -1) * M[0][c] * matrixDeterminant(sub);
    }
    return det;
}

function displayMatrixResult(text) {
    const out = document.querySelector("#matrixResultDisplay");
    if (out) out.innerHTML = text;
}

function formatMatrixHTML(M, label = "Result") {
    let html = `<div style="margin-bottom:6px;"><strong>${label}:</strong></div>`;
    html += '<table style="border-collapse:collapse; margin:4px 0;">';
    M.forEach(row => {
        html += "<tr>";
        row.forEach(val => {
            html += `<td style="padding:4px 12px; border:1px solid var(--line); text-align:center;">${roundNumber(val, 3)}</td>`;
        });
        html += "</tr>";
    });
    html += "</table>";
    return html;
}

function solveLinearSystem() {
    const A = state.matrixA.map(r => [...r]);
    const n = state.matrixDim;
    const bRaw = (document.querySelector("#vectorBInput")?.value || "").split(",").map(v => Number(v.trim())).filter(Number.isFinite);

    const resEl = document.querySelector("#linearSystemResult");
    if (bRaw.length !== n) {
        if (resEl) resEl.textContent = `Target vector b must have exactly ${n} values (matching matrix dimension).`;
        return;
    }

    const b = [...bRaw];

    // Gaussian Elimination with Partial Pivoting
    for (let p = 0; p < n; p++) {
        let maxRow = p;
        for (let i = p + 1; i < n; i++) {
            if (Math.abs(A[i][p]) > Math.abs(A[maxRow][p])) maxRow = i;
        }
        [A[p], A[maxRow]] = [A[maxRow], A[p]];
        [b[p], b[maxRow]] = [b[maxRow], b[p]];

        if (Math.abs(A[p][p]) < 1e-12) {
            if (resEl) resEl.textContent = "Singular matrix: System has no unique solution.";
            return;
        }

        for (let i = p + 1; i < n; i++) {
            const alpha = A[i][p] / A[p][p];
            b[i] -= alpha * b[p];
            for (let j = p; j < n; j++) {
                A[i][j] -= alpha * A[p][j];
            }
        }
    }

    // Back-substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += A[i][j] * x[j];
        x[i] = (b[i] - sum) / A[i][i];
    }

    if (resEl) {
        resEl.innerHTML = `<strong>Solution Vector x:</strong> [ ${x.map(v => roundNumber(v, 4)).join(", ")} ]`;
    }
}

// ============================================================================
// WEALTH & FINANCIAL INTELLIGENCE ENGINE
// ============================================================================
function calculateRetirementTrajectory() {
    const curAge = Number(document.querySelector("#retCurrentAge")?.value || 28);
    const targetAge = Number(document.querySelector("#retTargetAge")?.value || 60);
    const initial = Number(document.querySelector("#retCurrentSavings")?.value || 45000);
    const monthly = Number(document.querySelector("#retMonthlySavings")?.value || 1200);
    const retReturn = Number(document.querySelector("#retExpectedReturn")?.value || 8) / 100;
    const annualSpend = Number(document.querySelector("#retAnnualSpend")?.value || 70000);

    const years = Math.max(1, targetAge - curAge);
    const monthlyRate = retReturn / 12;

    const dataPoints = [];
    let balance = initial;
    let fireAge = null;
    const fireTarget = annualSpend * 25; // 4% rule

    for (let y = 0; y <= years; y++) {
        const age = curAge + y;
        dataPoints.push({ age, balance });
        if (balance >= fireTarget && fireAge === null) fireAge = age;

        for (let m = 0; m < 12; m++) {
            balance = balance * (1 + monthlyRate) + monthly;
        }
    }

    const retRes = document.querySelector("#retirementResult");
    const fireRes = document.querySelector("#fireMilestoneResult");

    if (retRes) retRes.textContent = `Projected nest egg at age ${targetAge}: ${formatCurrency(balance)}`;
    if (fireRes) {
        const fStr = fireAge ? `Milestone reached at Age ${fireAge}` : "Milestone reached after retirement age";
        fireRes.textContent = `FIRE Target (4% rule): ${formatCurrency(fireTarget)} · ${fStr}`;
    }

    drawRetirementCanvas(dataPoints, fireTarget);
}

function drawRetirementCanvas(data, fireTarget) {
    const canvas = document.querySelector("#retirementGrowthCanvas");
    if (!canvas || !data.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 900;
    const height = 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...data.map(d => d.balance), fireTarget * 1.1);
    const padding = { top: 25, bottom: 30, left: 60, right: 25 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = i => padding.left + (i / (data.length - 1)) * chartW;
    const getY = val => padding.top + chartH - (val / maxVal) * chartH;

    // FIRE Target Line (Gold Dotted)
    const fireY = getY(fireTarget);
    ctx.save();
    ctx.strokeStyle = "#ffd60a";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, fireY);
    ctx.lineTo(width - padding.right, fireY);
    ctx.stroke();
    ctx.fillStyle = "#ffd60a";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("FIRE Target (4% Rule)", padding.left + 8, fireY - 6);
    ctx.restore();

    // Area Fill
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, "rgba(48, 209, 88, 0.4)");
    grad.addColorStop(1, "rgba(48, 209, 88, 0.02)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(getX(0), padding.top + chartH);
    data.forEach((d, i) => ctx.lineTo(getX(i), getY(d.balance)));
    ctx.lineTo(getX(data.length - 1), padding.top + chartH);
    ctx.closePath();
    ctx.fill();

    // Curve Stroke
    ctx.strokeStyle = "#30d158";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.balance)) : ctx.lineTo(getX(i), getY(d.balance)));
    ctx.stroke();

    // Age Labels
    ctx.fillStyle = isLight ? "#86868b" : "#6e6e78";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Age ${data[0].age}`, getX(0), height - 8);
    ctx.fillText(`Age ${data[data.length - 1].age}`, getX(data.length - 1), height - 8);
}

function calculatePaycheckDonut() {
    const gross = Number(document.querySelector("#grossSalary")?.value || 115000);
    const stateTaxRate = Number(document.querySelector("#stateTaxRate")?.value || 5) / 100;
    const preTax401kRate = Number(document.querySelector("#preTax401k")?.value || 6) / 100;

    const preTax401k = gross * preTax401kRate;
    const taxableGross = gross - preTax401k;

    // Federal Income Tax estimate (progressive)
    const fedTax = taxableGross * 0.16;
    // FICA
    const socialSecurity = Math.min(gross, 168600) * 0.062;
    const medicare = gross * 0.0145;
    const stateTax = taxableGross * stateTaxRate;

    const totalDeductions = preTax401k + fedTax + socialSecurity + medicare + stateTax;
    const netAnnual = gross - totalDeductions;
    const netMonthly = netAnnual / 12;
    const netBiWeekly = netAnnual / 26;

    const pRes = document.querySelector("#paycheckResult");
    if (pRes) pRes.textContent = `Net take-home: ${formatCurrency(netMonthly)} / month (${formatCurrency(netBiWeekly)} bi-weekly)`;

    // Draw Donut
    const slices = [
        { label: "Net Take-Home", value: netAnnual, color: "#30d158" },
        { label: "Federal Tax", value: fedTax, color: "#0071e3" },
        { label: "State Tax", value: stateTax, color: "#ff9f0a" },
        { label: "FICA (SS & Med)", value: socialSecurity + medicare, color: "#ff453a" },
        { label: "401(k) Pre-tax", value: preTax401k, color: "#bf5af2" }
    ];

    drawPaycheckDonut(slices);
}

function drawPaycheckDonut(slices) {
    const canvas = document.querySelector("#paycheckDonutCanvas");
    const list = document.querySelector("#paycheckBreakdownList");
    if (!canvas || !list) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 180 * dpr;
    canvas.height = 180 * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const cx = 90;
    const cy = 90;
    const radius = 75;
    const innerRadius = 45;

    const total = slices.reduce((acc, s) => acc + s.value, 0);
    let currentAngle = -Math.PI / 2;

    list.innerHTML = "";

    slices.forEach(slice => {
        const sliceAngle = (slice.value / total) * Math.PI * 2;

        ctx.fillStyle = slice.color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, currentAngle, currentAngle + sliceAngle);
        ctx.arc(cx, cy, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fill();

        currentAngle += sliceAngle;

        // List item
        const item = document.createElement("div");
        item.className = "paycheck-item";
        item.innerHTML = `<span><span class="paycheck-dot" style="background:${slice.color}"></span>${slice.label}</span><span>${formatCurrency(slice.value)}</span>`;
        list.append(item);
    });
}

// ============================================================================
// PHYSICS CONSTANTS & SOLVERS
// ============================================================================
function renderPhysicalConstantsTable() {
    const tbody = document.querySelector("#constantsTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    PHYSICAL_CONSTANTS.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${c.symbol}</strong></td>
            <td>${c.name}</td>
            <td>${c.value} <span style="opacity: 0.65; font-size: 11px;">${c.unit}</span></td>
            <td>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button type="button" class="insert-const-btn copy-const-btn" title="Copy ${c.symbol} numerical value to clipboard">📋 Copy</button>
                    <button type="button" class="insert-const-btn calc-const-btn" title="Send ${c.symbol} to Scientific Calculator">ƒx Calc</button>
                </div>
            </td>
        `;

        tr.querySelector(".copy-const-btn")?.addEventListener("click", () => {
            playSoundFeedback("key");
            copyText(c.value);
        });

        tr.querySelector(".calc-const-btn")?.addEventListener("click", () => {
            playSoundFeedback("key");
            state.expression += c.value;
            updateCalculatorPreview();
            showMode("calculator");
            showToast(`Loaded ${c.symbol} (${c.value}) into Calculator`);
        });

        tbody.append(tr);
    });
}

function calculateProjectileMotion() {
    const v0 = Number(document.querySelector("#projVelocity")?.value || 45);
    const thetaDeg = Number(document.querySelector("#projAngle")?.value || 45);
    const h0 = Number(document.querySelector("#projHeight")?.value || 2);
    const g = 9.80665;

    const theta = (thetaDeg * Math.PI) / 180;
    const vx = v0 * Math.cos(theta);
    const vy = v0 * Math.sin(theta);

    // Quadratic equation for flight time: -0.5*g*t^2 + vy*t + h0 = 0
    const flightTime = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
    const range = vx * flightTime;
    const maxH = h0 + (vy * vy) / (2 * g);

    const resEl = document.querySelector("#projectileResult");
    if (resEl) {
        resEl.textContent = `Max Height: ${roundNumber(maxH, 1)}m · Range: ${roundNumber(range, 1)}m · Flight Time: ${roundNumber(flightTime, 2)}s`;
    }

    drawProjectileCanvas(v0, theta, h0, g, flightTime, range, maxH);
}

function drawProjectileCanvas(v0, theta, h0, g, flightTime, range, maxH) {
    const canvas = document.querySelector("#projectileCanvas");
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 600;
    const height = 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, bottom: 25, left: 35, right: 25 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = x => padding.left + (x / (range || 1)) * chartW;
    const getY = y => padding.top + chartH - (y / (maxH * 1.15 || 1)) * chartH;

    // Ground line
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    ctx.lineTo(width - padding.right, padding.top + chartH);
    ctx.stroke();

    // Parabolic Trajectory
    ctx.strokeStyle = "#ff9f0a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const steps = 100;
    for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * flightTime;
        const x = v0 * Math.cos(theta) * t;
        const y = h0 + v0 * Math.sin(theta) * t - 0.5 * g * t * t;
        s === 0 ? ctx.moveTo(getX(x), getY(y)) : ctx.lineTo(getX(x), getY(y));
    }
    ctx.stroke();
}

function calculateOhmPower() {
    const v = Number(document.querySelector("#ohmVoltage")?.value || 0);
    const i = Number(document.querySelector("#ohmCurrent")?.value || 0);
    const resEl = document.querySelector("#ohmResult");
    if (!i) {
        if (resEl) resEl.textContent = "Current cannot be 0.";
        return;
    }
    const r = v / i;
    const p = v * i;
    if (resEl) resEl.textContent = `Resistance R: ${formatNumber(roundNumber(r, 2))} Ω · Power P: ${formatNumber(roundNumber(p, 2))} W`;
}

function calculateRelativityDilation() {
    const vFrac = Math.min(0.9999, Math.max(0, Number(document.querySelector("#relVelocity")?.value || 0)));
    const t0 = Number(document.querySelector("#relTime")?.value || 1);
    const gamma = 1 / Math.sqrt(1 - vFrac * vFrac);
    const dilated = t0 * gamma;

    const relEl = document.querySelector("#relativityResult");
    if (relEl) {
        relEl.textContent = `Lorentz Factor γ: ${formatNumber(roundNumber(gamma, 4))} · Dilated Time: ${formatNumber(roundNumber(dilated, 3))} s`;
    }
}

// ============================================================================
// EVERYDAY SMART UTILITIES (Live Listeners)
// ============================================================================
function calculateCompoundGrowth() {
    const initial = Number(document.querySelector("#compoundInitial")?.value || 0);
    const monthlyContribution = Number(document.querySelector("#compoundMonthly")?.value || 0);
    const rate = Number(document.querySelector("#compoundRate")?.value || 0) / 100;
    const years = Math.max(1, Number(document.querySelector("#compoundYears")?.value || 1));
    const frequency = Number(document.querySelector("#compoundFrequency")?.value || 12);

    let currentTotal = initial;
    let totalDeposited = initial;
    const totalMonths = years * 12;
    const monthlyRate = rate / 12;
    const yearlyData = [{ year: 0, principal: initial, interest: 0, total: initial }];

    for (let m = 1; m <= totalMonths; m++) {
        currentTotal = currentTotal * (1 + monthlyRate) + monthlyContribution;
        totalDeposited += monthlyContribution;
        if (m % 12 === 0) {
            const yr = m / 12;
            const interest = Math.max(0, currentTotal - totalDeposited);
            yearlyData.push({ year: yr, principal: totalDeposited, interest, total: currentTotal });
        }
    }

    const cResult = document.querySelector("#compoundResult");
    const cSummary = document.querySelector("#compoundSummary");
    if (cResult) cResult.textContent = `Future value: ${formatCurrency(currentTotal)}`;
    if (cSummary) cSummary.textContent = `Total principal: ${formatCurrency(totalDeposited)} · Interest earned: ${formatCurrency(Math.max(0, currentTotal - totalDeposited))}`;

    drawCompoundChart(yearlyData);
}

function drawCompoundChart(yearlyData) {
    const canvas = document.querySelector("#compoundGrowthCanvas");
    if (!canvas || !yearlyData || !yearlyData.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 600;
    const height = 180;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...yearlyData.map(d => d.total), 1);
    const padding = { top: 20, bottom: 25, left: 50, right: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = i => padding.left + (i / (yearlyData.length - 1)) * chartW;
    const getY = val => padding.top + chartH - (val / maxVal) * chartH;

    ctx.fillStyle = "rgba(0, 113, 227, 0.35)";
    ctx.beginPath();
    ctx.moveTo(getX(0), padding.top + chartH);
    yearlyData.forEach((d, i) => ctx.lineTo(getX(i), getY(d.principal)));
    ctx.lineTo(getX(yearlyData.length - 1), padding.top + chartH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(48, 209, 88, 0.35)";
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(yearlyData[0].principal));
    yearlyData.forEach((d, i) => ctx.lineTo(getX(i), getY(d.total)));
    for (let i = yearlyData.length - 1; i >= 0; i--) {
        ctx.lineTo(getX(i), getY(yearlyData[i]?.principal ?? 0));
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#0071e3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    yearlyData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.principal)) : ctx.lineTo(getX(i), getY(d.principal)));
    ctx.stroke();

    ctx.strokeStyle = "#30d158";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    yearlyData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.total)) : ctx.lineTo(getX(i), getY(d.total)));
    ctx.stroke();
}

function calculateMortgage() {
    const principal = Number(document.querySelector("#pmtPrincipal")?.value || 0);
    const annualRate = Number(document.querySelector("#pmtRate")?.value || 0) / 100;
    const years = Math.max(1, Number(document.querySelector("#pmtYears")?.value || 1));
    const monthlyRate = annualRate / 12;
    const months = years * 12;

    const monthlyPayment = monthlyRate > 0
        ? principal * (monthlyRate * (1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1)
        : principal / months;

    const totalPaid = monthlyPayment * months;
    const totalInterest = Math.max(0, totalPaid - principal);

    const mResult = document.querySelector("#mortgageResult");
    if (mResult) {
        mResult.textContent = `Monthly payment: ${formatCurrency(monthlyPayment)} · Total interest: ${formatCurrency(totalInterest)}`;
    }

    const barPrincipal = document.querySelector("#loanBarPrincipal");
    const barInterest = document.querySelector("#loanBarInterest");
    if (barPrincipal && barInterest && totalPaid > 0) {
        const principalPct = Math.round((principal / totalPaid) * 100);
        const interestPct = 100 - principalPct;
        barPrincipal.style.width = `${principalPct}%`;
        barInterest.style.width = `${interestPct}%`;
        barPrincipal.title = `Principal: ${principalPct}% (${formatCurrency(principal)})`;
        barInterest.title = `Interest: ${interestPct}% (${formatCurrency(totalInterest)})`;
    }
}

function calculateLoanPayment() {
    const principal = Number(document.querySelector("#loanPrincipal")?.value || 0);
    const apr = Number(document.querySelector("#loanRate")?.value || 0) / 100;
    const years = Math.max(1, Number(document.querySelector("#loanYears")?.value || 1));
    const monthlyRate = apr / 12;
    const months = years * 12;
    const payment = monthlyRate > 0
        ? principal * (monthlyRate * (1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1)
        : principal / months;
    const totalPaid = payment * months;
    const interest = Math.max(0, totalPaid - principal);

    const lResult = document.querySelector("#loanResult");
    if (lResult) {
        lResult.textContent = `Monthly payment: ${formatCurrency(payment)} · Total interest: ${formatCurrency(interest)}`;
    }
}

function calculateBmi() {
    const weight = Number(document.querySelector("#bmiWeight")?.value || 0);
    const heightCm = Number(document.querySelector("#bmiHeight")?.value || 0);
    const bmiResult = document.querySelector("#bmiResult");
    const pointer = document.querySelector("#bmiPointer");

    if (!weight || !heightCm) {
        if (bmiResult) bmiResult.textContent = "BMI: enter valid weight & height";
        return;
    }

    const bmi = weight / ((heightCm / 100) ** 2);
    let category = "Healthy range";
    if (bmi < 18.5) category = "Underweight";
    else if (bmi < 25) category = "Healthy weight range";
    else if (bmi < 30) category = "Overweight";
    else category = "Obesity";

    if (bmiResult) {
        bmiResult.textContent = `BMI: ${formatNumber(roundNumber(bmi, 2))} · ${category}`;
    }

    if (pointer) {
        const gaugePct = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
        pointer.style.left = `${gaugePct}%`;
    }
}

function calculateDateDifference() {
    const start = document.querySelector("#dateStart")?.value;
    const end = document.querySelector("#dateEnd")?.value || new Date().toISOString().slice(0, 10);
    const res = document.querySelector("#dateDiffResult");
    const sub = document.querySelector("#dateDiffSub");

    if (!start) {
        if (res) res.textContent = "Select a start date";
        return;
    }

    const d1 = new Date(start + "T00:00:00");
    const d2 = new Date(end + "T00:00:00");
    const diffMs = Math.abs(d2 - d1);
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const earlier = d1 < d2 ? d1 : d2;
    const later = d1 < d2 ? d2 : d1;

    let years = later.getFullYear() - earlier.getFullYear();
    let months = later.getMonth() - earlier.getMonth();
    let days = later.getDate() - earlier.getDate();

    if (days < 0) {
        months -= 1;
        const prevMonth = new Date(later.getFullYear(), later.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    let bizDays = 0;
    const cur = new Date(earlier);
    while (cur < later) {
        const dayOfWeek = cur.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) bizDays++;
        cur.setDate(cur.getDate() + 1);
    }

    const totalWeeks = Math.floor(totalDays / 7);
    const remDays = totalDays % 7;

    if (res) {
        res.textContent = `${formatNumber(totalDays)} days · ${years}y ${months}m ${days}d`;
    }
    if (sub) {
        sub.textContent = `${totalWeeks} weeks ${remDays}d · ${formatNumber(bizDays)} business days`;
    }
}

function calculateGpa() {
    const gradesText = document.querySelector("#gpaGrades")?.value || "";
    const creditsText = document.querySelector("#gpaCredits")?.value || "";
    const gpaResult = document.querySelector("#gpaResult");

    const letterScale = {
        "A+": 4.0, "A": 4.0, "A-": 3.7,
        "B+": 3.3, "B": 3.0, "B-": 2.7,
        "C+": 2.3, "C": 2.0, "C-": 1.7,
        "D+": 1.3, "D": 1.0, "F": 0.0
    };

    const grades = gradesText.split(",").map(item => {
        const trimmed = item.trim().toUpperCase();
        if (letterScale[trimmed] !== undefined) return letterScale[trimmed];
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : NaN;
    }).filter(Number.isFinite);

    const credits = creditsText.split(",").map(item => Number(item.trim())).filter(Number.isFinite);

    if (!grades.length || !credits.length || grades.length !== credits.length) {
        if (gpaResult) gpaResult.textContent = "GPA: enter matching grades and credits";
        return;
    }

    const totalWeighted = grades.reduce((sum, g, i) => sum + g * credits[i], 0);
    const totalCredits = credits.reduce((sum, c) => sum + c, 0);
    const gpa = totalCredits ? totalWeighted / totalCredits : 0;

    let honor = "Good Standing";
    if (gpa >= 3.9) honor = "Summa Cum Laude";
    else if (gpa >= 3.75) honor = "Magna Cum Laude";
    else if (gpa >= 3.5) honor = "Dean's List";

    if (gpaResult) {
        gpaResult.textContent = `GPA: ${formatNumber(roundNumber(gpa, 2))} · ${honor}`;
    }
}

function calculateStats() {
    const raw = document.querySelector("#statsInput")?.value || "";
    const values = raw.split(/[\s,]+/).map(v => Number(v.trim())).filter(Number.isFinite);
    const statsResult = document.querySelector("#statsResult");
    const statsDetailResult = document.querySelector("#statsDetailResult");

    if (!values.length) {
        if (statsResult) statsResult.textContent = "Mean: 0 · Median: 0 · SD: 0";
        return;
    }

    const n = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;

    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    if (statsResult) {
        statsResult.textContent = `Mean: ${formatNumber(roundNumber(mean, 2))} · Median: ${formatNumber(roundNumber(median, 2))} · SD: ${formatNumber(roundNumber(stdDev, 2))}`;
    }
    if (statsDetailResult) {
        statsDetailResult.textContent = `Min: ${min} · Max: ${max} · Range: ${range} · Sum: ${formatNumber(sum)} · IQR: ${formatNumber(iqr)}`;
    }

    drawStatsHistogram(values, min, max);
    renderStatsBoxPlot(sorted, q1, median, q3, min, max);
}

function drawStatsHistogram(values, min, max) {
    const canvas = document.querySelector("#statsHistogramCanvas");
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 360;
    const height = 85;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const binCount = Math.min(8, Math.max(4, Math.floor(Math.sqrt(values.length))));
    const binSize = (max - min) / binCount || 1;
    const bins = new Array(binCount).fill(0);

    values.forEach(v => {
        const binIdx = Math.min(binCount - 1, Math.floor((v - min) / binSize));
        bins[binIdx]++;
    });

    const maxFreq = Math.max(...bins, 1);
    const barW = (width - 20) / binCount;

    bins.forEach((freq, i) => {
        const barH = (freq / maxFreq) * (height - 20);
        const x = 10 + i * barW;
        const y = height - barH - 4;

        ctx.fillStyle = isLight ? "rgba(0, 113, 227, 0.75)" : "rgba(48, 209, 88, 0.75)";
        ctx.beginPath();
        ctx.roundRect(x + 2, y, barW - 4, barH, [4, 4, 0, 0]);
        ctx.fill();
    });
}

function calculatePercentage() {
    const value = Number(document.querySelector("#percentValue")?.value || 0);
    const rate = Number(document.querySelector("#percentRate")?.value || 0) / 100;
    const result = value * rate;
    const pResult = document.querySelector("#percentResult");
    if (pResult) pResult.textContent = `${formatNumber(result)} (${roundNumber(rate * 100, 1)}% of ${formatNumber(value)})`;
}

function calculateTipSplit() {
    const bill = Number(document.querySelector("#tipBill")?.value || 0);
    const tipPercent = Number(document.querySelector("#tipPercent")?.value || 0) / 100;
    const people = Math.max(1, Number(document.querySelector("#tipPeople")?.value || 1));
    const tipAmount = bill * tipPercent;
    const total = bill + tipAmount;
    const each = total / people;
    const tResult = document.querySelector("#tipResult");
    if (tResult) tResult.textContent = `Total: ${formatCurrency(total)} · Each: ${formatCurrency(each)}`;
}

function calculateDiscount() {
    const original = Number(document.querySelector("#discountPrice")?.value || 0);
    const discountPercent = Number(document.querySelector("#discountPercent")?.value || 0) / 100;
    const taxPercent = Number(document.querySelector("#taxPercent")?.value || 0) / 100;
    const savings = original * discountPercent;
    const discounted = original - savings;
    const tax = discounted * taxPercent;
    const finalPrice = discounted + tax;
    const dResult = document.querySelector("#discountResult");
    if (dResult) {
        dResult.textContent = `Final price: ${formatCurrency(finalPrice)} · Saved: ${formatCurrency(savings)}`;
    }
}

function calculateRoi() {
    const initial = Number(document.querySelector("#roiInitial")?.value || 0);
    const finalVal = Number(document.querySelector("#roiFinal")?.value || 0);
    const profit = finalVal - initial;
    const roi = initial ? (profit / initial) * 100 : 0;
    const rResult = document.querySelector("#roiResult");
    if (rResult) {
        const sign = roi >= 0 ? "+" : "";
        rResult.textContent = `ROI: ${sign}${formatNumber(roundNumber(roi, 2))}% · Profit: ${formatCurrency(profit)}`;
    }
}

function calculateAge() {
    const birthDate = document.querySelector("#ageBirth")?.value;
    const targetDateValue = document.querySelector("#ageTarget")?.value || new Date().toISOString().slice(0, 10);
    const aResult = document.querySelector("#ageResult");
    if (!birthDate) {
        if (aResult) aResult.textContent = "Age: enter a birth date";
        return;
    }
    const birth = new Date(birthDate + "T00:00:00");
    const target = new Date(targetDateValue + "T00:00:00");
    let years = target.getFullYear() - birth.getFullYear();
    let months = target.getMonth() - birth.getMonth();
    let days = target.getDate() - birth.getDate();

    if (days < 0) {
        months -= 1;
        const priorMonth = new Date(target.getFullYear(), target.getMonth(), 0);
        days += priorMonth.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    if (aResult) {
        aResult.textContent = `Age: ${years} years, ${months} months, ${days} days`;
    }
}

// ============================================================================
// UI NAVIGATION & THEME CONTROLLER
// ============================================================================
function showMode(mode) {
    playSoundFeedback("key");
    document.querySelectorAll(".mode-button").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === mode);
    });
    document.querySelectorAll(".tool-panel").forEach(panel => {
        const active = panel.dataset.panel === mode;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
    });

    if (mode === "charts") {
        setTimeout(() => {
            renderDaysTable();
            renderDataChart();
        }, 30);
    } else if (mode === "programmer") {
        setTimeout(updateProgrammerDisplays, 30);
    } else if (mode === "calculus") {
        setTimeout(drawCalculusStudio, 30);
    } else if (mode === "matrix") {
        setTimeout(renderMatrixInputs, 30);
    } else if (mode === "geometry") {
        const renderGeom = () => {
            calculateTriangleProperties();
            calculateCircleProperties();
            calculateSolidProperties();
        };
        renderGeom();
        setTimeout(renderGeom, 50);
        setTimeout(renderGeom, 150);
    } else if (mode === "finance") {
        setTimeout(() => {
            calculateRetirementTrajectory();
            calculatePaycheckDonut();
            calculateInflation();
            calculateDrip();
        }, 30);
    } else if (mode === "physics") {
        setTimeout(() => {
            renderPhysicalConstantsTable();
            calculateProjectileMotion();
        }, 30);
    } else if (mode === "circuits") {
        const renderCircuits = () => {
            calculateResistorFromBands();
            calculateCircuitResonance();
            calculateVoltageDivider();
        };
        renderCircuits();
        setTimeout(renderCircuits, 50);
        setTimeout(renderCircuits, 150);
    } else if (mode === "advanced") {
        setTimeout(() => {
            calculateCompoundGrowth();
            calculateMortgage();
            calculateBmi();
            calculateStats();
            calculateColorContrast();
        }, 30);
    }
}

function initializeTheme() {
    const saved = localStorage.getItem("orbit-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.querySelector(".theme-icon");
    if (themeIcon) {
        themeIcon.textContent = theme === "dark" ? "Sun" : "Moon";
    }
}

function toggleTheme() {
    playSoundFeedback("key");
    const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = current;
    localStorage.setItem("orbit-theme", current);
    updateThemeIcon(current);
    renderDataChart();
    drawCalculusStudio();
    calculateCompoundGrowth();
    calculateStats();
    calculateRetirementTrajectory();
    calculatePaycheckDonut();
    calculateProjectileMotion();
}

function showToast(message) {
    const toast = elements.toast;
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 2000);
}

function copyText(text) {
    playSoundFeedback("enter");
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied: ${text}`);
    }).catch(() => {
        showToast("Copied to clipboard");
    });
}

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================
document.querySelectorAll(".mode-button").forEach(button => {
    button.addEventListener("click", () => showMode(button.dataset.mode));
});

// Category Click & Search
elements.categoryList?.addEventListener("click", event => {
    const button = event.target.closest(".category-button");
    if (button) setCategory(button.dataset.category);
});

elements.categorySearch?.addEventListener("input", renderCategories);

// Converter Inputs
elements.fromValue?.addEventListener("input", () => updateConversion());
elements.fromUnit?.addEventListener("change", () => updateConversion({ save: true }));
elements.toUnit?.addEventListener("change", () => updateConversion({ save: true }));
document.querySelector("#swapUnits")?.addEventListener("click", swapUnits);
document.querySelector("#clearConverter")?.addEventListener("click", () => {
    playSoundFeedback("clear");
    elements.fromValue.value = "0";
    updateConversion();
});
document.querySelector("#copyResult")?.addEventListener("click", () => {
    copyText(elements.toValue.value);
});

// Converter Numpad
document.querySelectorAll(".converter-numpad [data-numpad]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        if (elements.fromValue.value === "0" && btn.dataset.numpad !== ".") {
            elements.fromValue.value = btn.dataset.numpad;
        } else {
            elements.fromValue.value += btn.dataset.numpad;
        }
        updateConversion();
    });
});

document.querySelectorAll(".converter-numpad [data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "clear") {
            elements.fromValue.value = "0";
            updateConversion();
        } else if (action === "backspace") {
            elements.fromValue.value = elements.fromValue.value.slice(0, -1) || "0";
            updateConversion();
        } else if (action === "sign") {
            const num = parseNumber(elements.fromValue.value);
            if (num !== null) elements.fromValue.value = formatNumber(-num);
            updateConversion();
        } else if (action === "copy-source") {
            copyText(elements.fromValue.value);
        } else if (action === "copy-result") {
            copyText(elements.toValue.value);
        }
    });
});

// Calculator Keypad
document.querySelector("#keypad")?.addEventListener("click", event => {
    const keyBtn = event.target.closest(".key");
    if (!keyBtn) return;

    if (keyBtn.dataset.key) {
        appendCalculatorKey(keyBtn.dataset.key);
    } else if (keyBtn.dataset.action) {
        const act = keyBtn.dataset.action;
        if (act === "clear") {
            playSoundFeedback("clear");
            state.expression = "";
            updateCalculatorPreview();
        } else if (act === "backspace") {
            playSoundFeedback("key");
            state.expression = state.expression.slice(0, -1);
            updateCalculatorPreview();
        } else if (act === "equals") {
            solveExpression();
        } else if (act === "sign") {
            playSoundFeedback("key");
            try {
                const current = evaluateExpression(state.expression || "0");
                state.expression = formatNumber(-current);
                updateCalculatorPreview();
            } catch {}
        } else if (act === "memory-clear") {
            playSoundFeedback("clear");
            state.calcMemory = 0;
            updateMemoryIndicator();
            showToast("Memory cleared");
        } else if (act === "memory-add") {
            playSoundFeedback("enter");
            try {
                const val = evaluateExpression(state.expression || "0");
                state.calcMemory += val;
                updateMemoryIndicator();
                showToast(`M = ${formatNumber(state.calcMemory)}`);
            } catch {}
        } else if (act === "memory-subtract") {
            playSoundFeedback("key");
            try {
                const val = evaluateExpression(state.expression || "0");
                state.calcMemory -= val;
                updateMemoryIndicator();
                showToast(`M = ${formatNumber(state.calcMemory)}`);
            } catch {}
        } else if (act === "memory-recall") {
            playSoundFeedback("key");
            state.expression += formatNumber(state.calcMemory);
            updateCalculatorPreview();
        }
    }
});

// Physical Constants Bar in Calculator
document.querySelectorAll(".constants-quick-bar [data-const]").forEach(chip => {
    chip.addEventListener("click", () => {
        playSoundFeedback("key");
        state.expression += chip.dataset.const;
        updateCalculatorPreview();
        showToast(`Inserted constant ${chip.textContent}`);
    });
});

// DEG / RAD Toggle
document.querySelectorAll("[data-angle]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.angleMode = btn.dataset.angle;
        document.querySelectorAll("[data-angle]").forEach(b => b.classList.toggle("active", b === btn));
        updateCalculatorPreview();
    });
});

// Sound Profile Selector
elements.soundProfileSelect?.addEventListener("change", e => {
    state.soundProfile = e.target.value;
    playSoundFeedback("enter");
    showToast(`Audio: ${e.target.options[e.target.selectedIndex].text}`);
});

// Zen Fullscreen Mode Toggle
document.querySelector("#zenToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("zen-mode");
    playSoundFeedback("enter");
    showToast(document.body.classList.contains("zen-mode") ? "Zen Mode enabled (Press Esc to exit)" : "Zen Mode exited");
});

// Keyboard Shortcuts Modal Toggle
document.querySelector("#shortcutsToggle")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const modal = document.querySelector("#shortcutsModal");
    if (modal) modal.hidden = false;
});
document.querySelector("#closeShortcutsBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const modal = document.querySelector("#shortcutsModal");
    if (modal) modal.hidden = true;
});

// Theme Toggle
document.querySelector("#themeToggle")?.addEventListener("click", toggleTheme);

// ============================================================================
// PROGRAMMER LAB LISTENERS
// ============================================================================
document.querySelectorAll("#progWordSize [data-bits]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.progBits = Number(btn.dataset.bits);
        document.querySelectorAll("#progWordSize [data-bits]").forEach(b => b.classList.toggle("active", b === btn));
        updateProgrammerDisplays();
    });
});

document.querySelectorAll("#progEndianSelect [data-endian]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.progEndian = btn.dataset.endian;
        document.querySelectorAll("#progEndianSelect [data-endian]").forEach(b => b.classList.toggle("active", b === btn));
        updateProgrammerDisplays();
    });
});

elements.progDecInput?.addEventListener("input", e => {
    try {
        state.progValue = BigInt(e.target.value.replace(/,/g, "") || "0");
        updateProgrammerDisplays();
    } catch {}
});
elements.progHexInput?.addEventListener("input", e => {
    try {
        state.progValue = BigInt(e.target.value.trim());
        updateProgrammerDisplays();
    } catch {}
});
elements.progOctInput?.addEventListener("input", e => {
    try {
        let raw = e.target.value.trim();
        if (!raw) raw = "0";
        if (!raw.startsWith("0o") && !raw.startsWith("0O")) raw = "0o" + raw;
        state.progValue = BigInt(raw);
        updateProgrammerDisplays();
    } catch {}
});
elements.progBinInput?.addEventListener("input", e => {
    try {
        state.progValue = BigInt("0b" + e.target.value.replace(/\s+/g, ""));
        updateProgrammerDisplays();
    } catch {}
});
elements.progCharInput?.addEventListener("input", e => {
    try {
        const raw = e.target.value.trim();
        if (!raw) return;
        const clean = raw.replace(/^'/, "").replace(/'$/, "");
        if (clean.length > 0) {
            state.progValue = BigInt(clean.codePointAt(0) || 0);
            updateProgrammerDisplays();
        }
    } catch {}
});

// Focus styling on radix rows
document.querySelectorAll(".prog-radix-card .radix-input").forEach(input => {
    input.addEventListener("focus", () => {
        document.querySelectorAll(".prog-radix-card .radix-row").forEach(row => row.classList.remove("active-radix"));
        input.closest(".radix-row")?.classList.add("active-radix");
    });
});

document.querySelector("#progClearBtn")?.addEventListener("click", () => {
    playSoundFeedback("clear");
    state.progValue = 0n;
    updateProgrammerDisplays();
});
document.querySelector("#progInvertBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    state.progValue = (~state.progValue) & getProgMask();
    updateProgrammerDisplays();
});

// Binary Bitwise operations (AND, OR, XOR) with interactive HUD
document.querySelector("#bitOpAnd")?.addEventListener("click", () => openProgBitOp("AND"));
document.querySelector("#bitOpOr")?.addEventListener("click", () => openProgBitOp("OR"));
document.querySelector("#bitOpXor")?.addEventListener("click", () => openProgBitOp("XOR"));

// Unary Bitwise NOT
document.querySelector("#bitOpNot")?.addEventListener("click", () => {
    playSoundFeedback("key");
    state.progValue = (~state.progValue) & getProgMask();
    updateProgrammerDisplays();
    showToast("Bitwise NOT (~) applied");
});

// Shifts (LSH, RSH)
document.querySelector("#bitShiftLeft")?.addEventListener("click", () => {
    playSoundFeedback("key");
    state.progValue = (state.progValue << 1n) & getProgMask();
    updateProgrammerDisplays();
    showToast("Shifted Left (LSH 1)");
});
document.querySelector("#bitShiftRight")?.addEventListener("click", () => {
    playSoundFeedback("key");
    state.progValue = (state.progValue >> 1n) & getProgMask();
    updateProgrammerDisplays();
    showToast("Shifted Right (RSH 1)");
});

// Rotations (ROL, ROR)
document.querySelector("#bitRotateLeft")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const B = BigInt(state.progBits);
    const val = state.progValue & mask;
    const topBit = (val >> (B - 1n)) & 1n;
    state.progValue = ((val << 1n) | topBit) & mask;
    updateProgrammerDisplays();
    showToast("Rotated Left (ROL 1)");
});
document.querySelector("#bitRotateRight")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const B = BigInt(state.progBits);
    const val = state.progValue & mask;
    const bottomBit = val & 1n;
    state.progValue = ((val >> 1n) | (bottomBit << (B - 1n))) & mask;
    updateProgrammerDisplays();
    showToast("Rotated Right (ROR 1)");
});

// Endianness Byte Swap
document.querySelector("#bitByteSwap")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    let val = state.progValue & getProgMask();
    let swapped = 0n;
    const bytes = state.progBits / 8;
    for (let i = 0; i < bytes; i++) {
        const b = (val >> BigInt(i * 8)) & 0xFFn;
        swapped |= b << BigInt((bytes - 1 - i) * 8);
    }
    state.progValue = swapped;
    updateProgrammerDisplays();
    showToast("Byte order swapped");
});

// HUD Apply & Cancel Controls
elements.progApplyOpBtn?.addEventListener("click", () => {
    applyProgBitOp();
});
elements.progCancelOpBtn?.addEventListener("click", () => {
    playSoundFeedback("key");
    closeProgBitOp();
});
elements.progOperandInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        applyProgBitOp();
    } else if (e.key === "Escape") {
        closeProgBitOp();
    }
});

// Quick Mask Preset Chips
document.querySelectorAll(".prog-quick-masks .mask-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        const maskVal = chip.dataset.mask;
        if (elements.progOperandInput) elements.progOperandInput.value = maskVal;
        applyProgBitOp(maskVal);
    });
});

// Copy Buttons for Radix rows
document.querySelectorAll("[data-copy-target]").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = document.querySelector("#" + btn.dataset.copyTarget);
        if (target) copyText(target.value);
    });
});

// Bit-Twiddling Hacks
document.querySelector("#hackIsolateLowest")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const val = state.progValue & mask;
    // x & (-x) modulo 2^N
    state.progValue = (val & ((~val + 1n) & mask));
    updateProgrammerDisplays();
    showToast("Isolated lowest set bit: x & (-x)");
});

document.querySelector("#hackClearLowest")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const val = state.progValue & mask;
    if (val > 0n) {
        state.progValue = (val & (val - 1n)) & mask;
    }
    updateProgrammerDisplays();
    showToast("Cleared lowest set bit: x & (x - 1)");
});

document.querySelector("#hackReverseBits")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const val = state.progValue & mask;
    let rev = 0n;
    const B = BigInt(state.progBits);
    for (let i = 0n; i < B; i++) {
        if ((val >> i) & 1n) {
            rev |= 1n << (B - 1n - i);
        }
    }
    state.progValue = rev & mask;
    updateProgrammerDisplays();
    showToast("Reversed all bits");
});

document.querySelector("#hackGrayCode")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    const val = state.progValue & mask;
    state.progValue = (val ^ (val >> 1n)) & mask;
    updateProgrammerDisplays();
    showToast("Converted to Gray Code: x ^ (x >> 1)");
});

document.querySelector("#hackNextPow2")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const mask = getProgMask();
    let val = state.progValue & mask;
    if (val <= 1n) {
        state.progValue = 1n;
    } else {
        let p = 1n;
        const maxBits = BigInt(state.progBits);
        while (p < val && p < (1n << maxBits)) {
            p <<= 1n;
        }
        state.progValue = p & mask;
    }
    updateProgrammerDisplays();
    showToast("Rounded up to next power of 2");
});

// IEEE-754 Precision Toggle
document.querySelectorAll("#floatPrecisionSelect [data-prec]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.floatPrec = Number(btn.dataset.prec);
        document.querySelectorAll("#floatPrecisionSelect [data-prec]").forEach(b => b.classList.toggle("active", b === btn));
        updateProgrammerDisplays();
    });
});

// Float Decimal Input (Live parsing into IEEE-754 binary representation)
elements.floatDecimalInput?.addEventListener("input", e => {
    const txt = e.target.value.trim();
    if (!txt) return;
    const num = parseFloat(txt);
    if (isNaN(num)) return;
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    if (state.floatPrec === 32) {
        view.setFloat32(0, num, false);
        state.progValue = BigInt(view.getUint32(0, false));
    } else {
        view.setFloat64(0, num, false);
        state.progValue = view.getBigUint64(0, false);
    }
    updateProgrammerDisplays();
});

// IPv4 CIDR Slider
elements.cidrRange?.addEventListener("input", e => {
    state.cidrPrefix = Number(e.target.value);
    if (elements.cidrLabel) elements.cidrLabel.textContent = `/${state.cidrPrefix}`;
    updateNetworkInspector(state.progValue & getProgMask());
});

// IPv4 Dotted Input
elements.ipDottedDisplay?.addEventListener("input", e => {
    const raw = e.target.value.trim();
    const parts = raw.split(".");
    if (parts.length === 4 && parts.every(p => p !== "")) {
        const nums = parts.map(p => parseInt(p, 10));
        if (nums.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
            if (state.progBits < 32) {
                state.progBits = 32;
                document.querySelectorAll("#progWordSize [data-bits]").forEach(b => b.classList.toggle("active", b.dataset.bits === "32"));
            }
            const ipVal = (BigInt(nums[0]) << 24n) | (BigInt(nums[1]) << 16n) | (BigInt(nums[2]) << 8n) | BigInt(nums[3]);
            if (state.progBits > 32) {
                const upper = state.progValue & (~0xFFFFFFFFn);
                state.progValue = upper | ipVal;
            } else {
                state.progValue = ipVal;
            }
            updateProgrammerDisplays();
        }
    }
});

// Color Picker (native swatch click/change)
elements.colorPickerInput?.addEventListener("input", e => {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const a = Math.min(255, Math.max(0, parseInt(elements.colorChanA?.value, 10) || 255));
        if (state.progBits < 32) {
            state.progBits = 32;
            document.querySelectorAll("#progWordSize [data-bits]").forEach(b => b.classList.toggle("active", b.dataset.bits === "32"));
        }
        const colVal = (BigInt(a) << 24n) | (BigInt(r) << 16n) | (BigInt(g) << 8n) | BigInt(b);
        if (state.progBits > 32) {
            const upper = state.progValue & (~0xFFFFFFFFn);
            state.progValue = upper | colVal;
        } else {
            state.progValue = colVal;
        }
        updateProgrammerDisplays();
    }
});

// RGBA Channel Inputs
function syncFromColorChannels() {
    const r = Math.min(255, Math.max(0, parseInt(elements.colorChanR?.value, 10) || 0));
    const g = Math.min(255, Math.max(0, parseInt(elements.colorChanG?.value, 10) || 0));
    const b = Math.min(255, Math.max(0, parseInt(elements.colorChanB?.value, 10) || 0));
    const a = Math.min(255, Math.max(0, parseInt(elements.colorChanA?.value, 10) || 255));
    if (state.progBits < 32) {
        state.progBits = 32;
        document.querySelectorAll("#progWordSize [data-bits]").forEach(b => b.classList.toggle("active", b.dataset.bits === "32"));
    }
    const colVal = (BigInt(a) << 24n) | (BigInt(r) << 16n) | (BigInt(g) << 8n) | BigInt(b);
    if (state.progBits > 32) {
        const upper = state.progValue & (~0xFFFFFFFFn);
        state.progValue = upper | colVal;
    } else {
        state.progValue = colVal;
    }
    updateProgrammerDisplays();
}

[elements.colorChanR, elements.colorChanG, elements.colorChanB, elements.colorChanA].forEach(inp => {
    inp?.addEventListener("input", syncFromColorChannels);
});

// Multi-Language Codegen Tabs (Vlang, C, Rust, Go, Python, TS, Asm, Verilog)
document.querySelectorAll("#codegenLangsTabs .lang-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        playSoundFeedback("key");
        state.codegenLang = tab.dataset.lang;
        document.querySelectorAll("#codegenLangsTabs .lang-tab").forEach(t => t.classList.toggle("active", t === tab));
        updateCodegenSnippet(state.progValue & getProgMask());
    });
});

// Code Snippet & Inspector Copy Buttons
document.querySelector("#copySnippetBtn")?.addEventListener("click", () => {
    if (elements.codegenDisplay) copyText(elements.codegenDisplay.textContent);
});
document.querySelector("#copyCssColor")?.addEventListener("click", () => {
    if (elements.colorCssDisplay) copyText(elements.colorCssDisplay.textContent);
});
document.querySelector("#copyCrc32")?.addEventListener("click", () => {
    if (elements.hashCrc32) copyText(elements.hashCrc32.textContent);
});
document.querySelector("#copyAdler32")?.addEventListener("click", () => {
    if (elements.hashAdler32) copyText(elements.hashAdler32.textContent);
});


// ============================================================================
// CHARTS & DATA STUDIO LISTENERS
// ============================================================================
document.querySelectorAll("#chartPresetSelect [data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        const preset = btn.dataset.preset;
        state.chartPreset = preset;
        document.querySelectorAll("#chartPresetSelect [data-preset]").forEach(b => b.classList.toggle("active", b === btn));

        if (CHART_PRESETS[preset]) {
            state.chartData = JSON.parse(JSON.stringify(CHART_PRESETS[preset].data));
            state.chartUnit = CHART_PRESETS[preset].unit;
        }
        renderDaysTable();
        syncJsonFromTable();
        renderDataChart();
    });
});

document.querySelectorAll("#chartTypeSelect [data-chart-type]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.chartType = btn.dataset.chartType;
        document.querySelectorAll("#chartTypeSelect [data-chart-type]").forEach(b => b.classList.toggle("active", b === btn));
        renderDataChart();
    });
});

document.querySelectorAll(".chart-theme-picker [data-palette]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.chartPalette = btn.dataset.palette;
        document.querySelectorAll(".chart-theme-picker [data-palette]").forEach(b => b.classList.toggle("active", b === btn));
        renderDataChart();
    });
});

document.querySelector("#toggleMovingAvg")?.addEventListener("change", e => {
    state.showMovingAvg = e.target.checked;
    renderDataChart();
});
document.querySelector("#toggleTrendline")?.addEventListener("change", e => {
    state.showTrendline = e.target.checked;
    renderDataChart();
});

elements.dataChartCanvas?.addEventListener("mousemove", e => handleChartScrubber(e.clientX, e.clientY));
elements.dataChartCanvas?.addEventListener("mouseleave", () => {
    state.chartScrubIndex = null;
    if (elements.appleChartTooltip) elements.appleChartTooltip.hidden = true;
    renderDataChart();
});
elements.dataChartCanvas?.addEventListener("touchmove", e => {
    if (e.touches && e.touches[0]) handleChartScrubber(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

document.querySelectorAll("#dataTabToggle [data-studio-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        const tab = btn.dataset.studioTab;
        document.querySelectorAll("#dataTabToggle [data-studio-tab]").forEach(b => b.classList.toggle("active", b === btn));
        document.querySelector("#tabDaysTable").hidden = tab !== "table";
        document.querySelector("#tabRawJson").hidden = tab !== "json";
    });
});

document.querySelector("#addDayRowBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const nextIdx = state.chartData.length + 1;
    state.chartData.push({ day: `Day ${nextIdx}`, value: Math.round(state.chartData[state.chartData.length - 1]?.value || 100) });
    renderDaysTable();
    syncJsonFromTable();
    renderDataChart();
});

document.querySelector("#generateRandomDataBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    state.chartData = Array.from({ length: 14 }, (_, i) => {
        const val = Math.round(1000 + Math.sin(i * 0.5) * 500 + Math.random() * 800);
        return { day: `Day ${i + 1}`, value: val };
    });
    renderDaysTable();
    syncJsonFromTable();
    renderDataChart();
    showToast("Generated 14-day synthetic series");
});

document.querySelector("#formatJsonBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    try {
        const parsed = JSON.parse(elements.rawJsonInput.value);
        elements.rawJsonInput.value = JSON.stringify(parsed, null, 2);
        parseAndLoadCustomData(elements.rawJsonInput.value);
        showToast("JSON formatted");
    } catch {
        showToast("Invalid JSON syntax");
    }
});

document.querySelector("#clearDataBtn")?.addEventListener("click", () => {
    state.chartData = JSON.parse(JSON.stringify(CHART_PRESETS["7days"].data));
    state.chartPreset = "7days";
    document.querySelectorAll("#chartPresetSelect [data-preset]").forEach(b => b.classList.toggle("active", b.dataset.preset === "7days"));
    renderDaysTable();
    syncJsonFromTable();
    renderDataChart();
    showToast("Reset to 7-Day preset");
});

elements.rawJsonInput?.addEventListener("input", e => parseAndLoadCustomData(e.target.value));

document.querySelector("#loadChartSample")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const presets = ["7days", "30days", "90days"];
    const next = presets[(presets.indexOf(state.chartPreset) + 1) % presets.length];
    state.chartPreset = next;
    document.querySelectorAll("#chartPresetSelect [data-preset]").forEach(b => b.classList.toggle("active", b.dataset.preset === next));
    state.chartData = JSON.parse(JSON.stringify(CHART_PRESETS[next].data));
    state.chartUnit = CHART_PRESETS[next].unit;
    renderDaysTable();
    syncJsonFromTable();
    renderDataChart();
    showToast(`Loaded ${next} preset`);
});

document.querySelector("#exportChartPng")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const canvas = elements.dataChartCanvas;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `orbit-chart-${state.chartPreset}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Chart exported as PNG");
});

document.querySelector("#exportChartCsv")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    let csv = "Day,Value\n";
    state.chartData.forEach(p => csv += `"${p.day}",${p.value}\n`);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.download = `orbit-data-${state.chartPreset}-${Date.now()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    showToast("Exported CSV dataset");
});

// ============================================================================
// CALCULUS STUDIO LISTENERS
// ============================================================================
document.querySelector("#calcPlotBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    state.calcEquation = document.querySelector("#calcEqnInput")?.value || "x^3 - 3*x";
    drawCalculusStudio();
    calculateDefiniteIntegral();
    calculateDerivativeAtPoint();
});

document.querySelectorAll("#calcPresets [data-calceqn]").forEach(chip => {
    chip.addEventListener("click", () => {
        playSoundFeedback("key");
        const eqn = chip.dataset.calceqn;
        const input = document.querySelector("#calcEqnInput");
        if (input) input.value = eqn;
        state.calcEquation = eqn;
        document.querySelectorAll("#calcPresets [data-calceqn]").forEach(c => c.classList.toggle("active", c === chip));
        drawCalculusStudio();
        calculateDefiniteIntegral();
        calculateDerivativeAtPoint();
    });
});

document.querySelector("#calcIntegralBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    calculateDefiniteIntegral();
});
document.querySelector("#calcDerivBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    calculateDerivativeAtPoint();
});
document.querySelector("#calcRootBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    findEquationRoot();
});

document.querySelector("#calcZoomIn")?.addEventListener("click", () => {
    state.calcZoom = Math.min(5, state.calcZoom * 1.3);
    drawCalculusStudio();
});
document.querySelector("#calcZoomOut")?.addEventListener("click", () => {
    state.calcZoom = Math.max(0.2, state.calcZoom / 1.3);
    drawCalculusStudio();
});
document.querySelector("#calcResetZoom")?.addEventListener("click", () => {
    state.calcZoom = 1;
    drawCalculusStudio();
});

// ============================================================================
// MATRIX LAB LISTENERS
// ============================================================================
document.querySelectorAll("#matrixDimSelect [data-dim]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.matrixDim = Number(btn.dataset.dim);
        document.querySelectorAll("#matrixDimSelect [data-dim]").forEach(b => b.classList.toggle("active", b === btn));
        renderMatrixInputs();
    });
});

document.querySelector("#matrixARandomBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const n = state.matrixDim;
    state.matrixA = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(Math.random() * 9) - 4));
    renderMatrixInputs();
});
document.querySelector("#matrixBRandomBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const n = state.matrixDim;
    state.matrixB = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(Math.random() * 9) - 4));
    renderMatrixInputs();
});

document.querySelector("#matOpAdd")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const n = state.matrixDim;
    const res = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => state.matrixA[r][c] + state.matrixB[r][c]));
    displayMatrixResult(formatMatrixHTML(res, "A + B"));
});
document.querySelector("#matOpSub")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const n = state.matrixDim;
    const res = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => state.matrixA[r][c] - state.matrixB[r][c]));
    displayMatrixResult(formatMatrixHTML(res, "A − B"));
});
document.querySelector("#matOpMul")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const n = state.matrixDim;
    const res = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            for (let k = 0; k < n; k++) {
                res[r][c] += state.matrixA[r][k] * state.matrixB[k][c];
            }
        }
    }
    displayMatrixResult(formatMatrixHTML(res, "A × B"));
});
document.querySelector("#matOpTransposeA")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const n = state.matrixDim;
    const res = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => state.matrixA[c][r]));
    displayMatrixResult(formatMatrixHTML(res, "Transpose Aᵀ"));
});
document.querySelector("#matOpDetA")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const det = matrixDeterminant(state.matrixA);
    displayMatrixResult(`<strong>Determinant det(A):</strong> ${formatNumber(roundNumber(det, 4))}`);
});
document.querySelector("#matOpTraceA")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const tr = state.matrixA.reduce((acc, row, idx) => acc + row[idx], 0);
    displayMatrixResult(`<strong>Trace Tr(A):</strong> ${formatNumber(roundNumber(tr, 4))}`);
});
document.querySelector("#solveLinearSystemBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    solveLinearSystem();
});

// ============================================================================
// FINANCE & WEALTH LISTENERS
// ============================================================================
["#retCurrentAge", "#retTargetAge", "#retCurrentSavings", "#retMonthlySavings", "#retExpectedReturn", "#retAnnualSpend"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("input", calculateRetirementTrajectory);
});
["#grossSalary", "#stateTaxRate", "#preTax401k"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("input", calculatePaycheckDonut);
});

// ============================================================================
// PHYSICS LISTENERS
// ============================================================================
["#projVelocity", "#projAngle", "#projHeight"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("input", calculateProjectileMotion);
});
document.querySelector("#calculateOhmBtn")?.addEventListener("click", calculateOhmPower);
document.querySelector("#calculateRelativityBtn")?.addEventListener("click", calculateRelativityDilation);

// ============================================================================
// SMART UTILITIES (Live Listeners)
// ============================================================================
["#compoundInitial", "#compoundMonthly", "#compoundRate", "#compoundYears", "#compoundFrequency"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateCompoundGrowth);
});
document.querySelector("#calculateCompound")?.addEventListener("click", calculateCompoundGrowth);

["#pmtPrincipal", "#pmtRate", "#pmtYears"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateMortgage);
});
document.querySelector("#calculateMortgage")?.addEventListener("click", calculateMortgage);

["#loanPrincipal", "#loanRate", "#loanYears"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateLoanPayment);
});
document.querySelector("#calculateLoan")?.addEventListener("click", calculateLoanPayment);

["#bmiWeight", "#bmiHeight"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateBmi);
});
document.querySelector("#calculateBmi")?.addEventListener("click", calculateBmi);

["#dateStart", "#dateEnd"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateDateDifference);
});
document.querySelector("#calculateDateDiff")?.addEventListener("click", calculateDateDifference);

["#gpaGrades", "#gpaCredits"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateGpa);
});
document.querySelector("#calculateGpa")?.addEventListener("click", calculateGpa);

document.querySelector("#statsInput")?.addEventListener("input", calculateStats);
document.querySelector("#calculateStats")?.addEventListener("click", calculateStats);

["#percentValue", "#percentRate"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculatePercentage);
});
document.querySelector("#calculatePercent")?.addEventListener("click", calculatePercentage);

["#tipBill", "#tipPercent", "#tipPeople"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateTipSplit);
});
document.querySelector("#calculateTip")?.addEventListener("click", calculateTipSplit);

["#discountPrice", "#discountPercent", "#taxPercent"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateDiscount);
});
document.querySelector("#calculateDiscount")?.addEventListener("click", calculateDiscount);

["#roiInitial", "#roiFinal"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateRoi);
});
document.querySelector("#calculateRoi")?.addEventListener("click", calculateRoi);

["#ageBirth", "#ageTarget"].forEach(s => {
    document.querySelector(s)?.addEventListener("input", calculateAge);
});
document.querySelector("#calculateAge")?.addEventListener("click", calculateAge);

// History Export TXT Paper Tape
document.querySelector("#exportHistoryTxt")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    let txt = "ORBIT COMPUTING SUITE — PAPER TAPE AUDIT ROLL\n";
    txt += "===============================================\n\n";
    state.history.forEach((h, idx) => {
        const d = new Date(h.timestamp || Date.now()).toLocaleString();
        txt += `[#${idx + 1}] ${d} | ${h.type}\n`;
        txt += `EXPRESSION: ${h.expression}\n`;
        txt += `RESULT:     ${h.result}\n`;
        if (h.note) txt += `NOTE:       ${h.note}\n`;
        txt += "-----------------------------------------------\n";
    });
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8;" });
    const link = document.createElement("a");
    link.download = `orbit-papertape-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    showToast("Paper tape exported");
});

document.querySelector("#clearHistory")?.addEventListener("click", () => {
    playSoundFeedback("clear");
    state.history = [];
    saveHistory();
    showToast("Audit history cleared");
});

elements.historyList?.addEventListener("click", event => {
    const item = event.target.closest("[data-copy]");
    if (item) copyText(item.dataset.copy);
});

// ============================================================================
// BEAST MODE: GEOMETRY & TRIGONOMETRY STUDIO
// ============================================================================
let currentTriMode = "sss";

document.querySelectorAll("#triInputModeSelect [data-trimode]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        currentTriMode = btn.dataset.trimode;
        document.querySelectorAll("#triInputModeSelect .segmented-item").forEach(b => b.classList.toggle("active", b === btn));

        const lA = document.querySelector("#triLabelA");
        const lB = document.querySelector("#triLabelB");
        const lC = document.querySelector("#triLabelC");

        if (currentTriMode === "sss") {
            if (lA) lA.textContent = "Side a";
            if (lB) lB.textContent = "Side b";
            if (lC) lC.textContent = "Side c";
        } else if (currentTriMode === "sas") {
            if (lA) lA.textContent = "Side a";
            if (lB) lB.textContent = "Side b";
            if (lC) lC.textContent = "Angle C (°)";
        } else if (currentTriMode === "asa") {
            if (lA) lA.textContent = "Angle A (°)";
            if (lB) lB.textContent = "Side c";
            if (lC) lC.textContent = "Angle B (°)";
        }
        calculateTriangleProperties();
    });
});

["#triInputA", "#triInputB", "#triInputC"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateTriangleProperties);
});

function calculateTriangleProperties() {
    const vA = Number(document.querySelector("#triInputA")?.value || 7);
    const vB = Number(document.querySelector("#triInputB")?.value || 8);
    const vC = Number(document.querySelector("#triInputC")?.value || 9);

    let a, b, c, alpha, beta, gamma;

    if (currentTriMode === "sss") {
        a = vA; b = vB; c = vC;
        if (a + b <= c || a + c <= b || b + c <= a) {
            document.querySelector("#triangleResult").textContent = "Invalid triangle: Sum of two sides must exceed third side.";
            return;
        }
        // Law of Cosines
        alpha = Math.acos(Math.max(-1, Math.min(1, (b*b + c*c - a*a) / (2*b*c))));
        beta = Math.acos(Math.max(-1, Math.min(1, (a*a + c*c - b*b) / (2*a*c))));
        gamma = Math.PI - alpha - beta;
    } else if (currentTriMode === "sas") {
        a = vA; b = vB;
        gamma = (vC * Math.PI) / 180;
        if (vC <= 0 || vC >= 180) return;
        c = Math.sqrt(Math.max(0.0001, a*a + b*b - 2*a*b*Math.cos(gamma)));
        alpha = Math.acos(Math.max(-1, Math.min(1, (b*b + c*c - a*a) / (2*b*c))));
        beta = Math.PI - alpha - gamma;
    } else { // ASA
        const angA = (vA * Math.PI) / 180;
        const angB = (vC * Math.PI) / 180;
        c = vB;
        if (vA + vC >= 180 || vA <= 0 || vC <= 0) return;
        gamma = Math.PI - angA - angB;
        alpha = angA;
        beta = angB;
        // Law of Sines
        a = (c * Math.sin(alpha)) / Math.sin(gamma);
        b = (c * Math.sin(beta)) / Math.sin(gamma);
    }

    const perimeter = a + b + c;
    const s = perimeter / 2;
    const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
    const inradius = s > 0 ? area / s : 0;
    const circumradius = area > 0 ? (a * b * c) / (4 * area) : 0;

    const degA = roundNumber((alpha * 180) / Math.PI, 2);
    const degB = roundNumber((beta * 180) / Math.PI, 2);
    const degC = roundNumber((gamma * 180) / Math.PI, 2);

    const resEl = document.querySelector("#triangleResult");
    if (resEl) resEl.textContent = `Area: ${roundNumber(area, 2)} · Perimeter: ${roundNumber(perimeter, 2)} · Inradius r: ${roundNumber(inradius, 2)}`;
    const subEl = document.querySelector("#triangleAnglesResult");
    if (subEl) subEl.textContent = `Angles: α = ${degA}° · β = ${degB}° · γ = ${degC}° (Circumradius R: ${roundNumber(circumradius, 2)})`;

    drawTriangleCanvas(a, b, c, alpha, beta, gamma, area, inradius);
}

function drawTriangleCanvas(a, b, c, alpha, beta, gamma, area, inradius) {
    const canvas = document.querySelector("#triangleCanvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width || canvas.clientWidth || 800);
    const height = Math.max(200, rect.height || canvas.clientHeight || 300);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    // Background card fill
    ctx.fillStyle = isLight ? "#fbfcfd" : "#0c101a";
    ctx.fillRect(0, 0, width, height);

    // Subtle background grid
    ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 30; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 30; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Mathematical coordinate system:
    // A at (0, 0), B at (c, 0), C at (b * cos(alpha), b * sin(alpha))
    const Ax = 0, Ay = 0;
    const Bx = c, By = 0;
    const Cx = b * Math.cos(alpha);
    const Cy = b * Math.sin(alpha);

    const minX = Math.min(Ax, Bx, Cx);
    const maxX = Math.max(Ax, Bx, Cx);
    const minY = 0;
    const maxY = Math.max(0.001, Cy);

    const triW = maxX - minX || 1;
    const triH = maxY - minY || 1;

    const padX = 65;
    const padY = 55;
    const availW = Math.max(100, width - padX * 2);
    const availH = Math.max(100, height - padY * 2);

    const scale = Math.min(availW / triW, availH / triH);

    const mapX = (x) => padX + (availW - triW * scale) / 2 + (x - minX) * scale;
    const mapY = (y) => height - padY - (availH - triH * scale) / 2 - (y - minY) * scale;

    const pA = { x: mapX(Ax), y: mapY(Ay) };
    const pB = { x: mapX(Bx), y: mapY(By) };
    const pC = { x: mapX(Cx), y: mapY(Cy) };

    // Incircle center in math coordinates:
    // Ix = (b*c + c*Cx) / (a+b+c), Iy = (c*Cy) / (a+b+c)
    const perim = a + b + c;
    const inX = perim > 0 ? (b * Bx + c * Cx) / perim : 0;
    const inY = perim > 0 ? (c * Cy) / perim : 0;
    const pIn = { x: mapX(inX), y: mapY(inY) };
    const rInCanvas = inradius * scale;

    // Draw Incircle (subtle dashed emerald)
    if (rInCanvas > 3 && isFinite(rInCanvas)) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(48, 209, 88, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.fillStyle = "rgba(48, 209, 88, 0.06)";
        ctx.beginPath();
        ctx.arc(pIn.x, pIn.y, rInCanvas, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Incenter point
        ctx.fillStyle = "#30d158";
        ctx.beginPath();
        ctx.arc(pIn.x, pIn.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Altitude from C perpendicular to AB base
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pC.x, pC.y);
    ctx.lineTo(pC.x, pA.y);
    ctx.stroke();

    // Right angle indicator at altitude foot if within base
    if (pC.x >= Math.min(pA.x, pB.x) && pC.x <= Math.max(pA.x, pB.x)) {
        const sqSize = 8;
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.strokeRect(pC.x - sqSize, pA.y - sqSize, sqSize, sqSize);
    }
    ctx.restore();

    // Filled Triangle Gradient
    ctx.save();
    const grad = ctx.createLinearGradient(pA.x, pA.y, pC.x, pC.y);
    grad.addColorStop(0, "rgba(48, 209, 88, 0.25)");
    grad.addColorStop(0.5, "rgba(0, 113, 227, 0.2)");
    grad.addColorStop(1, "rgba(94, 92, 230, 0.25)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.lineTo(pC.x, pC.y);
    ctx.closePath();
    ctx.fill();

    // Triangle Outer Stroke
    ctx.strokeStyle = "#30d158";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();

    // Helper to draw pill badge on canvas
    function drawCanvasPill(text, x, y, bgCol, textCol) {
        ctx.save();
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
        const metrics = ctx.measureText(text);
        const pw = metrics.width + 14;
        const ph = 20;
        const px = x - pw / 2;
        const py = y - ph / 2;
        ctx.fillStyle = bgCol;
        drawSmoothRoundedRect(ctx, px, py, pw, ph, 10);
        ctx.fill();
        ctx.fillStyle = textCol;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // Side measurement badges
    const pillBg = isLight ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)";
    const pillTxt = isLight ? "#ffffff" : "#0c101a";

    drawCanvasPill(`c = ${roundNumber(c, 1)}`, (pA.x + pB.x) / 2, pA.y + 20, pillBg, pillTxt);
    drawCanvasPill(`b = ${roundNumber(b, 1)}`, (pA.x + pC.x) / 2 - 24, (pA.y + pC.y) / 2, pillBg, pillTxt);
    drawCanvasPill(`a = ${roundNumber(a, 1)}`, (pB.x + pC.x) / 2 + 24, (pB.y + pC.y) / 2, pillBg, pillTxt);

    // Angle arcs & labels
    function drawAngleArc(pt, v1, v2, label, color) {
        const ang1 = Math.atan2(v1.y - pt.y, v1.x - pt.x);
        const ang2 = Math.atan2(v2.y - pt.y, v2.x - pt.x);
        let diff = ang2 - ang1;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const start = ang1;
        const end = ang1 + diff;
        const r = 24;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, diff >= 0 ? start : end, diff >= 0 ? end : start);
        ctx.stroke();

        const mid = (start + end) / 2;
        const lx = pt.x + Math.cos(mid) * (r + 14);
        const ly = pt.y + Math.sin(mid) * (r + 14);
        ctx.font = "bold 10px -apple-system, sans-serif";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx, ly);
        ctx.restore();
    }

    const degA = roundNumber((alpha * 180) / Math.PI, 1);
    const degB = roundNumber((beta * 180) / Math.PI, 1);
    const degC = roundNumber((gamma * 180) / Math.PI, 1);

    drawAngleArc(pA, pB, pC, `${degA}°`, "#30d158");
    drawAngleArc(pB, pC, pA, `${degB}°`, "#0071e3");
    drawAngleArc(pC, pA, pB, `${degC}°`, "#ff9f0a");

    // Vertices Beads & High-Contrast Badges
    const vertices = [
        { pt: pA, name: "A", color: "#30d158" },
        { pt: pB, name: "B", color: "#0071e3" },
        { pt: pC, name: "C", color: "#ff9f0a" }
    ];

    vertices.forEach(v => {
        // Outer halo
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.arc(v.pt.x, v.pt.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Inner white core
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(v.pt.x, v.pt.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Vertex Name Badge
        const vx = v.pt.x + (v.name === "A" ? -22 : v.name === "B" ? 22 : 0);
        const vy = v.pt.y + (v.name === "C" ? -24 : 18);
        drawCanvasPill(v.name, vx, vy, v.color, "#ffffff");
    });
}

// Circle & Arc Solver
document.querySelector("#calculateCircleBtn")?.addEventListener("click", calculateCircleProperties);
["#circleRadius", "#circleAngle"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateCircleProperties);
});

function calculateCircleProperties() {
    const r = Math.max(0.001, Number(document.querySelector("#circleRadius")?.value || 10));
    const deg = Math.max(0.001, Math.min(360, Number(document.querySelector("#circleAngle")?.value || 60)));
    const rad = (deg * Math.PI) / 180;

    const arcLength = r * rad;
    const chord = 2 * r * Math.sin(rad / 2);
    const sagitta = r * (1 - Math.cos(rad / 2));
    const circleArea = Math.PI * r * r;
    const sectorArea = 0.5 * r * r * rad;
    const segmentArea = 0.5 * r * r * (rad - Math.sin(rad));

    const resEl = document.querySelector("#circleResult");
    if (resEl) resEl.textContent = `Arc Length: ${roundNumber(arcLength, 2)} · Chord: ${roundNumber(chord, 2)} · Sector Area: ${roundNumber(sectorArea, 2)}`;
    const subEl = document.querySelector("#circleSub");
    if (subEl) subEl.textContent = `Circle Area: ${roundNumber(circleArea, 2)} · Segment Area: ${roundNumber(segmentArea, 2)} · Sagitta: ${roundNumber(sagitta, 2)}`;
}

// 3D Solids Volume & Area
document.querySelector("#calculateSolidBtn")?.addEventListener("click", calculateSolidProperties);
document.querySelector("#solidShapeSelect")?.addEventListener("change", e => {
    const shape = e.target.value;
    const d1L = document.querySelector("#solidDim1Label");
    const d2L = document.querySelector("#solidDim2Label");
    const d2Wrap = document.querySelector("#solidDim2Wrap");

    if (shape === "sphere") {
        if (d1L) d1L.textContent = "Radius r";
        if (d2Wrap) d2Wrap.hidden = true;
    } else if (shape === "cylinder" || shape === "cone") {
        if (d1L) d1L.textContent = "Radius r";
        if (d2L) d2L.textContent = "Height h";
        if (d2Wrap) d2Wrap.hidden = false;
    } else if (shape === "torus") {
        if (d1L) d1L.textContent = "Major Radius R";
        if (d2L) d2L.textContent = "Minor Radius r";
        if (d2Wrap) d2Wrap.hidden = false;
    } else if (shape === "box") {
        if (d1L) d1L.textContent = "Base Edge a";
        if (d2L) d2L.textContent = "Height h";
        if (d2Wrap) d2Wrap.hidden = false;
    }
    calculateSolidProperties();
});
["#solidDim1", "#solidDim2"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateSolidProperties);
});

function calculateSolidProperties() {
    const shape = document.querySelector("#solidShapeSelect")?.value || "cylinder";
    const d1 = Math.max(0.001, Number(document.querySelector("#solidDim1")?.value || 5));
    const d2 = Math.max(0.001, Number(document.querySelector("#solidDim2")?.value || 12));

    let volume = 0, surface = 0, lateral = 0;

    if (shape === "sphere") {
        volume = (4 / 3) * Math.PI * Math.pow(d1, 3);
        surface = 4 * Math.PI * d1 * d1;
        lateral = surface;
    } else if (shape === "cylinder") {
        volume = Math.PI * d1 * d1 * d2;
        lateral = 2 * Math.PI * d1 * d2;
        surface = lateral + 2 * Math.PI * d1 * d1;
    } else if (shape === "cone") {
        volume = (1 / 3) * Math.PI * d1 * d1 * d2;
        const slant = Math.sqrt(d1 * d1 + d2 * d2);
        lateral = Math.PI * d1 * slant;
        surface = lateral + Math.PI * d1 * d1;
    } else if (shape === "torus") {
        const R = Math.max(d1, d2);
        const r = Math.min(d1, d2);
        volume = 2 * Math.PI * Math.PI * R * r * r;
        surface = 4 * Math.PI * Math.PI * R * r;
        lateral = surface;
    } else if (shape === "box") {
        volume = d1 * d1 * d2;
        lateral = 4 * d1 * d2;
        surface = lateral + 2 * d1 * d1;
    }

    const resEl = document.querySelector("#solidResult");
    if (resEl) resEl.textContent = `Volume V: ${roundNumber(volume, 2)} · Total Surface Area: ${roundNumber(surface, 2)}`;
    const subEl = document.querySelector("#solidSub");
    if (subEl) subEl.textContent = `Lateral Area: ${roundNumber(lateral, 2)} · Cross-Section/Base: ${roundNumber(volume / (d2 || 1), 2)}`;
}

// ============================================================================
// BEAST MODE: ELECTRONICS & CIRCUITS STUDIO
// ============================================================================
let currentResistorBands = 4;

document.querySelectorAll("#resistorBandModeSelect [data-bands]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        currentResistorBands = Number(btn.dataset.bands);
        document.querySelectorAll("#resistorBandModeSelect .segmented-item").forEach(b => b.classList.toggle("active", b === btn));
        const b3Wrap = document.querySelector("#resBand3Wrap");
        if (b3Wrap) b3Wrap.hidden = currentResistorBands !== 5;
        calculateResistorFromBands();
    });
});

["#resBand1", "#resBand2", "#resBand3", "#resMultiplier", "#resTolerance"].forEach(id => {
    document.querySelector(id)?.addEventListener("change", calculateResistorFromBands);
});

const RESISTOR_COLOR_MAP = {
    0: { name: "Black", color: "#1c1c1e" },
    1: { name: "Brown", color: "#8B4513" },
    2: { name: "Red", color: "#ff3b30" },
    3: { name: "Orange", color: "#ff9500" },
    4: { name: "Yellow", color: "#ffd60a" },
    5: { name: "Green", color: "#30d158" },
    6: { name: "Blue", color: "#0071e3" },
    7: { name: "Violet", color: "#bf5af2" },
    8: { name: "Gray", color: "#8e8e93" },
    9: { name: "White", color: "#f2f2f7" },
    0.01: { name: "Silver", color: "#c0c0c0" },
    0.1: { name: "Gold", color: "#d4af37" },
    0.05: { name: "Gray", color: "#8e8e93" },
    0.25: { name: "Blue", color: "#0071e3" },
    0.5: { name: "Green", color: "#30d158" },
    5: { name: "Gold", color: "#d4af37" },
    10: { name: "Silver", color: "#c0c0c0" },
    100: { name: "Red", color: "#ff3b30" },
    1000: { name: "Orange", color: "#ff9500" },
    10000: { name: "Yellow", color: "#ffd60a" },
    100000: { name: "Green", color: "#30d158" },
    1000000: { name: "Blue", color: "#0071e3" }
};

function calculateResistorFromBands() {
    const b1 = Number(document.querySelector("#resBand1")?.value || 4);
    const b2 = Number(document.querySelector("#resBand2")?.value || 7);
    const b3 = Number(document.querySelector("#resBand3")?.value || 0);
    const mult = Number(document.querySelector("#resMultiplier")?.value || 100);
    const tol = Number(document.querySelector("#resTolerance")?.value || 5);

    let baseVal = 0;
    let bandsToDraw = [];

    if (currentResistorBands === 4) {
        baseVal = b1 * 10 + b2;
        bandsToDraw = [
            RESISTOR_COLOR_MAP[b1]?.color || "#8B4513",
            RESISTOR_COLOR_MAP[b2]?.color || "#ff3b30",
            RESISTOR_COLOR_MAP[mult]?.color || "#ff9500",
            RESISTOR_COLOR_MAP[tol]?.color || "#d4af37"
        ];
    } else {
        baseVal = b1 * 100 + b2 * 10 + b3;
        bandsToDraw = [
            RESISTOR_COLOR_MAP[b1]?.color || "#8B4513",
            RESISTOR_COLOR_MAP[b2]?.color || "#ff3b30",
            RESISTOR_COLOR_MAP[b3]?.color || "#1c1c1e",
            RESISTOR_COLOR_MAP[mult]?.color || "#ff9500",
            RESISTOR_COLOR_MAP[tol]?.color || "#d4af37"
        ];
    }

    const ohms = baseVal * mult;
    let formattedResistance = "";
    if (ohms >= 1e6) formattedResistance = `${roundNumber(ohms / 1e6, 2)} MΩ`;
    else if (ohms >= 1e3) formattedResistance = `${roundNumber(ohms / 1e3, 2)} kΩ`;
    else formattedResistance = `${roundNumber(ohms, 2)} Ω`;

    const minOhms = ohms * (1 - tol / 100);
    const maxOhms = ohms * (1 + tol / 100);

    const resEl = document.querySelector("#resistorResult");
    if (resEl) resEl.textContent = `Resistance: ${formattedResistance} ± ${tol}%`;
    const limEl = document.querySelector("#resistorLimits");
    if (limEl) limEl.textContent = `Range: ${formatResistanceUnit(minOhms)} to ${formatResistanceUnit(maxOhms)}`;

    drawResistorCanvas(bandsToDraw);
}

function formatResistanceUnit(r) {
    if (r >= 1e6) return `${roundNumber(r / 1e6, 2)} MΩ`;
    if (r >= 1e3) return `${roundNumber(r / 1e3, 2)} kΩ`;
    return `${roundNumber(r, 2)} Ω`;
}

function drawSmoothRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === "function") {
        try {
            ctx.roundRect(x, y, width, height, radius);
            return;
        } catch (e) {}
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawResistorCanvas(bandColors) {
    const canvas = document.querySelector("#resistorCanvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width || canvas.clientWidth || 800);
    const height = Math.max(140, rect.height || canvas.clientHeight || 170);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = isLight ? "#fbfcfd" : "#0c101a";
    ctx.fillRect(0, 0, width, height);

    const cy = height * 0.44;
    const bodyW = Math.min(380, width * 0.65);
    const bodyH = 72;
    const bodyX = (width - bodyW) / 2;
    const bodyY = cy - bodyH / 2;

    // Metallic Wire Leads (running horizontally across the card)
    const leadGrad = ctx.createLinearGradient(0, cy - 4, 0, cy + 4);
    leadGrad.addColorStop(0, isLight ? "#94a3b8" : "#475569");
    leadGrad.addColorStop(0.5, isLight ? "#f8fafc" : "#cbd5e1");
    leadGrad.addColorStop(1, isLight ? "#64748b" : "#334155");

    ctx.strokeStyle = leadGrad;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";

    // Left Lead
    ctx.beginPath();
    ctx.moveTo(15, cy);
    ctx.lineTo(bodyX + 8, cy);
    ctx.stroke();

    // Right Lead
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW - 8, cy);
    ctx.lineTo(width - 15, cy);
    ctx.stroke();

    // Soft Drop Shadow Under Resistor Body
    ctx.save();
    ctx.shadowColor = isLight ? "rgba(0, 0, 0, 0.16)" : "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;

    // Ceramic Resistor Body (Realistic cylinder with rounded edges)
    const bodyGrad = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
    bodyGrad.addColorStop(0, isLight ? "#dfc39b" : "#bfa076");
    bodyGrad.addColorStop(0.18, isLight ? "#f8e7d0" : "#dec29c");
    bodyGrad.addColorStop(0.5, isLight ? "#ebd1ae" : "#caa477");
    bodyGrad.addColorStop(0.85, isLight ? "#d1b084" : "#a88154");
    bodyGrad.addColorStop(1, isLight ? "#b89364" : "#87633c");

    ctx.fillStyle = bodyGrad;
    drawSmoothRoundedRect(ctx, bodyX, bodyY, bodyW, bodyH, 22);
    ctx.fill();
    ctx.restore();

    // Outer subtle contour stroke
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    drawSmoothRoundedRect(ctx, bodyX, bodyY, bodyW, bodyH, 22);
    ctx.stroke();

    // Specular Highlight Line
    ctx.save();
    const specGrad = ctx.createLinearGradient(0, bodyY + 6, 0, bodyY + 16);
    specGrad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    specGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = specGrad;
    ctx.fillRect(bodyX + 12, bodyY + 5, bodyW - 24, 10);
    ctx.restore();

    // Color Bands Layout
    const numBands = bandColors.length;
    const bandW = 16;
    const startX = bodyX + 40;
    const innerW = bodyW - 80;
    const bandPositions = [];

    if (numBands === 4) {
        bandPositions.push(startX);
        bandPositions.push(startX + innerW * 0.28);
        bandPositions.push(startX + innerW * 0.56);
        bandPositions.push(startX + innerW * 0.92);
    } else {
        bandPositions.push(startX);
        bandPositions.push(startX + innerW * 0.22);
        bandPositions.push(startX + innerW * 0.44);
        bandPositions.push(startX + innerW * 0.66);
        bandPositions.push(startX + innerW * 0.92);
    }

    const roleLabels = numBands === 4 
        ? ["1st Digit", "2nd Digit", "Multiplier", "Tolerance"] 
        : ["1st Digit", "2nd Digit", "3rd Digit", "Multiplier", "Tolerance"];

    bandColors.forEach((color, idx) => {
        const bx = bandPositions[idx] || (startX + idx * 30);

        // Draw band stripe
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(bx, bodyY, bandW, bodyH);

        // Cylindrical 3D lighting gradient over band
        const bandGrad = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
        bandGrad.addColorStop(0, "rgba(0, 0, 0, 0.25)");
        bandGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.45)");
        bandGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.0)");
        bandGrad.addColorStop(1, "rgba(0, 0, 0, 0.4)");
        ctx.fillStyle = bandGrad;
        ctx.fillRect(bx, bodyY, bandW, bodyH);

        // Band edge definition
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, bodyY, bandW, bodyH);
        ctx.restore();

        // Floating Band Tag below resistor
        ctx.save();
        const tagY = bodyY + bodyH + 18;
        const tagX = bx + bandW / 2;

        // Small indicator dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tagX, tagY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text Role label
        ctx.font = "600 10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText(roleLabels[idx] || "", tagX, tagY + 14);
        ctx.restore();
    });
}

// LC & RC Circuit Solvers
document.querySelector("#calculateCircuitBtn")?.addEventListener("click", calculateCircuitResonance);
["#circuitL", "#circuitC", "#circuitR"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateCircuitResonance);
});

function calculateCircuitResonance() {
    const lMh = Number(document.querySelector("#circuitL")?.value || 10);
    const cNf = Number(document.querySelector("#circuitC")?.value || 47);
    const rOhm = Number(document.querySelector("#circuitR")?.value || 1000);

    const L = lMh * 1e-3;
    const C = cNf * 1e-9;

    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const period = 1 / f0;
    const z0 = Math.sqrt(L / C);
    const fc = 1 / (2 * Math.PI * rOhm * C);

    const resEl = document.querySelector("#circuitResult");
    if (resEl) resEl.textContent = `Resonant Frequency f₀: ${roundNumber(f0 / 1e3, 2)} kHz (T = ${roundNumber(period * 1e6, 1)} µs)`;
    const subEl = document.querySelector("#circuitSub");
    if (subEl) subEl.textContent = `RC Cutoff fc: ${roundNumber(fc / 1e3, 2)} kHz · Characteristic Z₀: ${roundNumber(z0, 2)} Ω`;
}

// Voltage Divider & SMD Decoder
document.querySelector("#calculateVdivBtn")?.addEventListener("click", calculateVoltageDivider);
["#vdivVin", "#vdivR1", "#vdivR2", "#smdInput"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateVoltageDivider);
});

function calculateVoltageDivider() {
    const vin = Number(document.querySelector("#vdivVin")?.value || 5);
    const r1 = Math.max(0.01, Number(document.querySelector("#vdivR1")?.value || 10000));
    const r2 = Math.max(0.01, Number(document.querySelector("#vdivR2")?.value || 10000));
    const smdStr = document.querySelector("#smdInput")?.value.trim() || "472";

    const vout = vin * (r2 / (r1 + r2));
    const currentMa = (vin / (r1 + r2)) * 1e3;

    const vdivEl = document.querySelector("#vdivResult");
    if (vdivEl) vdivEl.textContent = `Output Vout: ${roundNumber(vout, 2)} V · Current: ${roundNumber(currentMa, 3)} mA`;

    // SMD Decoder
    let smdVal = "--";
    if (/^\d{3}$/.test(smdStr)) {
        const d1 = Number(smdStr[0]), d2 = Number(smdStr[1]), exp = Number(smdStr[2]);
        smdVal = formatResistanceUnit((d1 * 10 + d2) * Math.pow(10, exp));
    } else if (/^\d{4}$/.test(smdStr)) {
        const d1 = Number(smdStr[0]), d2 = Number(smdStr[1]), d3 = Number(smdStr[2]), exp = Number(smdStr[3]);
        smdVal = formatResistanceUnit((d1 * 100 + d2 * 10 + d3) * Math.pow(10, exp));
    } else if (/^\d{1,2}R\d{1,2}$/i.test(smdStr)) {
        smdVal = `${smdStr.toUpperCase().replace("R", ".")} Ω`;
    }

    const smdEl = document.querySelector("#smdResult");
    if (smdEl) smdEl.textContent = `SMD Code '${smdStr}' = ${smdVal}`;
}

// ============================================================================
// BEAST MODE: INFLATION TIME MACHINE (US CPI 1913-2026) & DRIP
// ============================================================================
const CPI_TABLE = {
    1913: 9.9, 1915: 10.1, 1920: 20.0, 1925: 17.5, 1930: 16.7, 1935: 13.7, 1940: 14.0,
    1945: 18.0, 1950: 24.1, 1955: 26.8, 1960: 29.6, 1965: 31.5, 1970: 38.8, 1975: 53.8,
    1980: 82.4, 1985: 107.6, 1990: 130.7, 1995: 152.4, 2000: 172.2, 2005: 195.3, 2010: 218.056,
    2015: 237.017, 2020: 258.811, 2022: 292.655, 2024: 314.175, 2026: 324.50
};

function getCpiForYear(yr) {
    if (CPI_TABLE[yr]) return CPI_TABLE[yr];
    const years = Object.keys(CPI_TABLE).map(Number).sort((a,b)=>a-b);
    if (yr <= years[0]) return CPI_TABLE[years[0]];
    if (yr >= years[years.length - 1]) return CPI_TABLE[years[years.length - 1]];
    for (let i = 0; i < years.length - 1; i++) {
        if (yr >= years[i] && yr <= years[i+1]) {
            const frac = (yr - years[i]) / (years[i+1] - years[i]);
            return CPI_TABLE[years[i]] + frac * (CPI_TABLE[years[i+1]] - CPI_TABLE[years[i]]);
        }
    }
    return 100;
}

document.querySelector("#calculateInflationBtn")?.addEventListener("click", calculateInflation);
["#inflationAmount", "#inflationYearStart", "#inflationYearEnd"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateInflation);
});

function calculateInflation() {
    const amt = Number(document.querySelector("#inflationAmount")?.value || 100);
    const yStart = Number(document.querySelector("#inflationYearStart")?.value || 1980);
    const yEnd = Number(document.querySelector("#inflationYearEnd")?.value || 2026);

    const cpiStart = getCpiForYear(yStart);
    const cpiEnd = getCpiForYear(yEnd);

    const adjAmt = amt * (cpiEnd / cpiStart);
    const cumChange = ((cpiEnd - cpiStart) / cpiStart) * 100;
    const yearsDiff = Math.abs(yEnd - yStart) || 1;
    const annualized = (Math.pow(cpiEnd / cpiStart, 1 / yearsDiff) - 1) * 100;

    const resEl = document.querySelector("#inflationResult");
    if (resEl) resEl.textContent = `$${formatNumber(roundNumber(amt, 2))} in ${yStart} has the purchasing power of $${formatNumber(roundNumber(adjAmt, 2))} in ${yEnd}`;
    const subEl = document.querySelector("#inflationSub");
    if (subEl) subEl.textContent = `${cumChange >= 0 ? "+" : ""}${roundNumber(cumChange, 1)}% cumulative inflation · ${roundNumber(annualized, 2)}% annualized rate`;
}

// DRIP Compounding Visualizer
document.querySelector("#calculateDripBtn")?.addEventListener("click", calculateDrip);
["#dripInitial", "#dripAnnualAdd", "#dripYield", "#dripGrowth", "#dripApprec", "#dripYears"].forEach(id => {
    document.querySelector(id)?.addEventListener("input", calculateDrip);
});

function calculateDrip() {
    const init = Number(document.querySelector("#dripInitial")?.value || 25000);
    const annualAdd = Number(document.querySelector("#dripAnnualAdd")?.value || 6000);
    const yieldPct = Number(document.querySelector("#dripYield")?.value || 3.8) / 100;
    const divGrowth = Number(document.querySelector("#dripGrowth")?.value || 6.0) / 100;
    const apprec = Number(document.querySelector("#dripApprec")?.value || 4.5) / 100;
    const years = Number(document.querySelector("#dripYears")?.value || 20);

    let portfolio = init;
    let currentYield = yieldPct;
    let totalInvested = init;

    for (let yr = 1; yr <= years; yr++) {
        const divEarned = portfolio * currentYield;
        portfolio = (portfolio + divEarned + annualAdd) * (1 + apprec);
        currentYield *= (1 + divGrowth);
        totalInvested += annualAdd;
    }

    const annualIncome = portfolio * currentYield;
    const compoundGain = portfolio - totalInvested;
    const compPct = (compoundGain / portfolio) * 100;

    const resEl = document.querySelector("#dripResult");
    if (resEl) resEl.textContent = `Final portfolio: $${formatNumber(roundNumber(portfolio, 0))} · Annual dividend income: $${formatNumber(roundNumber(annualIncome, 0))}/yr`;
    const subEl = document.querySelector("#dripSub");
    if (subEl) subEl.textContent = `Total invested: $${formatNumber(roundNumber(totalInvested, 0))} · Compound gain: $${formatNumber(roundNumber(compoundGain, 0))} (${roundNumber(compPct, 1)}% from compounding)`;
}

// ============================================================================
// BEAST MODE: COLOR SCIENCE & WCAG CONTRAST RATIO STUDIO
// ============================================================================
document.querySelector("#colorFgPicker")?.addEventListener("input", e => {
    const txt = document.querySelector("#colorFgText");
    if (txt) txt.value = e.target.value.toUpperCase();
    calculateColorContrast();
});
document.querySelector("#colorFgText")?.addEventListener("input", e => {
    if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
        const p = document.querySelector("#colorFgPicker");
        if (p) p.value = e.target.value;
        calculateColorContrast();
    }
});
document.querySelector("#colorBgPicker")?.addEventListener("input", e => {
    const txt = document.querySelector("#colorBgText");
    if (txt) txt.value = e.target.value.toUpperCase();
    calculateColorContrast();
});
document.querySelector("#colorBgText")?.addEventListener("input", e => {
    if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
        const p = document.querySelector("#colorBgPicker");
        if (p) p.value = e.target.value;
        calculateColorContrast();
    }
});

function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function calculateColorContrast() {
    const fgHex = document.querySelector("#colorFgText")?.value.trim() || "#ffffff";
    const bgHex = document.querySelector("#colorBgText")?.value.trim() || "#0071e3";

    if (!/^#[0-9a-f]{6}$/i.test(fgHex) || !/^#[0-9a-f]{6}$/i.test(bgHex)) return;

    const rgbFg = hexToRgb(fgHex);
    const rgbBg = hexToRgb(bgHex);

    const lumFg = getLuminance(rgbFg.r, rgbFg.g, rgbFg.b);
    const lumBg = getLuminance(rgbBg.r, rgbBg.g, rgbBg.b);

    const brightest = Math.max(lumFg, lumBg);
    const darkest = Math.min(lumFg, lumBg);
    const ratio = (brightest + 0.05) / (darkest + 0.05);

    // Update live preview card
    const card = document.querySelector("#colorPreviewCard");
    if (card) {
        card.style.backgroundColor = bgHex;
        card.style.color = fgHex;
    }

    const bNormal = document.querySelector("#wcagBadgeNormal");
    const bLarge = document.querySelector("#wcagBadgeLarge");

    const passAAA = ratio >= 7;
    const passAA = ratio >= 4.5;
    const passAALarge = ratio >= 3;

    if (bNormal) {
        bNormal.className = `wcag-badge ${passAAA ? "pass" : (passAA ? "pass" : "fail")}`;
        bNormal.textContent = `Normal: ${passAAA ? "AAA Pass" : (passAA ? "AA Pass" : "Fail")}`;
    }
    if (bLarge) {
        bLarge.className = `wcag-badge ${passAAA || passAA || passAALarge ? "pass" : "fail"}`;
        bLarge.textContent = `Large Text: ${passAAA || passAA ? "AAA Pass" : (passAALarge ? "AA Pass" : "Fail")}`;
    }

    const resEl = document.querySelector("#colorContrastResult");
    if (resEl) resEl.textContent = `Contrast Ratio: ${roundNumber(ratio, 2)}:1 · ${passAAA ? "WCAG AAA Compliant" : (passAA ? "WCAG AA Compliant" : "Low Contrast")}`;

    // HSL & CMYK of Foreground
    const rN = rgbBg.r / 255, gN = rgbBg.g / 255, bN = rgbBg.b / 255;
    const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
            case gN: h = (bN - rN) / d + 2; break;
            case bN: h = (rN - gN) / d + 4; break;
        }
        h /= 6;
    }
    const k = 1 - Math.max(rN, gN, bN);
    const cmykC = k === 1 ? 0 : Math.round(((1 - rN - k) / (1 - k)) * 100);
    const cmykM = k === 1 ? 0 : Math.round(((1 - gN - k) / (1 - k)) * 100);
    const cmykY = k === 1 ? 0 : Math.round(((1 - bN - k) / (1 - k)) * 100);
    const cmykK = Math.round(k * 100);

    const convEl = document.querySelector("#colorConversionResult");
    if (convEl) convEl.textContent = `RGB(${rgbBg.r}, ${rgbBg.g}, ${rgbBg.b}) · HSL(${Math.round(h*360)}°, ${Math.round(s*100)}%, ${Math.round(l*100)}%) · CMYK(${cmykC}%, ${cmykM}%, ${cmykY}%, ${cmykK}%)`;
}

// Box-and-Whisker Plot for Statistics Engine
function renderStatsBoxPlot(numbers, q1, median, q3, min, max) {
    const canvas = document.querySelector("#statsBoxPlotCanvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 360;
    const height = 55;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.dataset.theme === "light";
    ctx.clearRect(0, 0, width, height);

    const range = max - min || 1;
    const pad = 24;
    const plotW = width - pad * 2;
    const getX = v => pad + ((v - min) / range) * plotW;
    const cy = height / 2;
    const boxH = 22;

    // Whisker Line
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(getX(min), cy);
    ctx.lineTo(getX(q1), cy);
    ctx.moveTo(getX(q3), cy);
    ctx.lineTo(getX(max), cy);
    ctx.stroke();

    // Min & Max End Ticks
    ctx.beginPath();
    ctx.moveTo(getX(min), cy - 8); ctx.lineTo(getX(min), cy + 8);
    ctx.moveTo(getX(max), cy - 8); ctx.lineTo(getX(max), cy + 8);
    ctx.stroke();

    // Interquartile Box
    const bX = getX(q1);
    const bW = getX(q3) - bX;
    ctx.fillStyle = isLight ? "rgba(0, 113, 227, 0.15)" : "rgba(48, 209, 88, 0.18)";
    ctx.strokeStyle = isLight ? "#0071e3" : "#30d158";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bX, cy - boxH / 2, bW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    // Median Vertical Line
    const mX = getX(median);
    ctx.strokeStyle = "#ff9f0a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mX, cy - boxH / 2);
    ctx.lineTo(mX, cy + boxH / 2);
    ctx.stroke();

    // Numbers labels
    ctx.fillStyle = isLight ? "#6e6e73" : "#8e9bb0";
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(min), getX(min), cy + 18);
    ctx.fillText(String(max), getX(max), cy + 18);
    ctx.fillText(`M:${median}`, mX, cy - 14);
}

// ============================================================================
// BEAST MODE: SPOTLIGHT OMNI COMMAND PALETTE MODAL (⌘K / /)
// ============================================================================
const OMNI_ITEMS = [
    { title: "Unit & Currency Converter", desc: "17 measurement categories, mass, length, currency", icon: "⇄", mode: "converter", badge: "Workspace" },
    { title: "Scientific Calculator Studio", desc: "Trigonometric, logarithmic, powers & memory", icon: "ƒx", mode: "calculator", badge: "Workspace" },
    { title: "Programmer Bitwise Lab", desc: "64-bit tactile bit-flipper, Hex, Dec, Oct, Bin", icon: "01", mode: "programmer", badge: "Workspace" },
    { title: "Graphic Charts & Forecasting", desc: "Time-series days array, custom JSON, regression", icon: "📈", mode: "charts", badge: "Workspace" },
    { title: "Calculus & Multi-Mode Grapher", desc: "Cartesian, Dual intersections, Polar, Parametric", icon: "∫", mode: "calculus", badge: "Workspace" },
    { title: "Matrix & Linear Algebra Lab", desc: "2×2 to 4×4 operations, Ax = b Gaussian solver", icon: "⊞", mode: "matrix", badge: "Workspace" },
    { title: "Geometry & Triangles Studio", desc: "SSS/SAS/ASA triangle solver, circles & 3D solids", icon: "△", mode: "geometry", badge: "Workspace" },
    { title: "Wealth & FIRE Planner", desc: "Retirement nest egg, inflation time machine, paycheck donut", icon: "💎", mode: "finance", badge: "Workspace" },
    { title: "Physical Constants & Kinematics", desc: "Speed of light, Planck constant, projectile simulator", icon: "⚡", mode: "physics", badge: "Workspace" },
    { title: "Electronics & Circuits Lab", desc: "Resistor color bands decoder, LC resonance, SMD codes", icon: "🎛", mode: "circuits", badge: "Workspace" },
    { title: "Smart Everyday Utilities", desc: "BMI gauge, GPA letter grades, WCAG contrast, date difference", icon: "◎", mode: "advanced", badge: "Workspace" },
    { title: "Paper Tape Journal", desc: "Continuous calculation audit roll and receipt", icon: "↺", mode: "history", badge: "Workspace" },
    { title: "Speed of Light (c)", desc: "299,792,458 m/s · Insert into Scientific", icon: "⚡", action: "const_c", badge: "Constant" },
    { title: "Planck Constant (h)", desc: "6.62607015 × 10⁻³⁴ J·s · Insert into Scientific", icon: "⚡", action: "const_h", badge: "Constant" },
    { title: "Gravitational Constant (G)", desc: "6.67430 × 10⁻¹¹ N·m²/kg² · Insert into Scientific", icon: "⚡", action: "const_G", badge: "Constant" },
    { title: "Avogadro Number (N_A)", desc: "6.02214076 × 10²³ mol⁻¹ · Insert into Scientific", icon: "⚡", action: "const_Na", badge: "Constant" },
    { title: "Toggle Zen Mode", desc: "Expand to distraction-free fullscreen view", icon: "⛶", action: "zen", badge: "Action" },
    { title: "Toggle Dark / Light Theme", desc: "Switch between Cupertino dark and light modes", icon: "🌗", action: "theme", badge: "Action" },
    { title: "Backup Workspace Session State", desc: "Export full state and audit journal to JSON file", icon: "💾", action: "backup", badge: "Action" }
];

let omniSelectedIndex = 0;
let currentFilteredOmni = [...OMNI_ITEMS];

function openOmniPalette() {
    playSoundFeedback("key");
    const modal = document.querySelector("#omniModal");
    if (!modal) return;
    modal.hidden = false;
    const input = document.querySelector("#omniSearchInput");
    if (input) {
        input.value = "";
        input.focus();
    }
    filterOmniItems("");
}

function closeOmniPalette() {
    playSoundFeedback("key");
    const modal = document.querySelector("#omniModal");
    if (modal) modal.hidden = true;
}

function filterOmniItems(query) {
    const q = query.toLowerCase().trim();
    const evalCard = document.querySelector("#omniEvalCard");
    const evalVal = document.querySelector("#omniEvalValue");

    // Live Inline Math Calculation
    if (q && /^[0-9+\-*/^().pi e\s]+$/i.test(q) && /[+\-*/^]/.test(q)) {
        try {
            const res = safeEvalGraphExpression(q, 0);
            if (Number.isFinite(res)) {
                if (evalCard) evalCard.hidden = false;
                if (evalVal) evalVal.textContent = `= ${formatNumber(roundNumber(res, 6))}`;
            } else if (evalCard) evalCard.hidden = true;
        } catch {
            if (evalCard) evalCard.hidden = true;
        }
    } else if (evalCard) {
        evalCard.hidden = true;
    }

    if (!q) {
        currentFilteredOmni = [...OMNI_ITEMS];
    } else {
        currentFilteredOmni = OMNI_ITEMS.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            (item.badge && item.badge.toLowerCase().includes(q))
        );
    }

    omniSelectedIndex = 0;
    renderOmniResults();
}

function renderOmniResults() {
    const list = document.querySelector("#omniResultsList");
    if (!list) return;
    list.innerHTML = "";

    if (!currentFilteredOmni.length) {
        const empty = document.createElement("div");
        empty.style.padding = "20px";
        empty.style.textAlign = "center";
        empty.style.color = "var(--muted)";
        empty.textContent = "No matching commands or tools found.";
        list.appendChild(empty);
        return;
    }

    currentFilteredOmni.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = `omni-result-item ${idx === omniSelectedIndex ? "selected" : ""}`;
        row.innerHTML = `
            <div class="omni-item-left">
                <span class="omni-item-icon">${item.icon}</span>
                <div>
                    <div class="omni-item-title">${item.title}</div>
                    <div class="omni-item-desc">${item.desc}</div>
                </div>
            </div>
            <span class="omni-item-badge">${item.badge || "Command"}</span>
        `;
        row.addEventListener("click", () => executeOmniItem(item));
        list.appendChild(row);
    });
}

function executeOmniItem(item) {
    closeOmniPalette();
    if (item.mode) {
        showMode(item.mode);
    } else if (item.action === "zen") {
        document.body.classList.toggle("zen-mode");
    } else if (item.action === "theme") {
        toggleTheme();
    } else if (item.action === "backup") {
        const modal = document.querySelector("#backupModal");
        if (modal) modal.hidden = false;
    } else if (item.action && item.action.startsWith("const_")) {
        const code = item.action.replace("const_", "");
        const constVal = code === "c" ? "299792458" : (code === "h" ? "6.62607015e-34" : (code === "G" ? "6.6743e-11" : "6.02214076e23"));
        showMode("calculator");
        appendCalculatorKey(constVal);
        showToast(`Inserted constant into Scientific Studio`);
    }
}

document.querySelector("#omniTrigger")?.addEventListener("click", openOmniPalette);
document.querySelector("#closeOmniBadge")?.addEventListener("click", closeOmniPalette);
document.querySelector("#omniSearchInput")?.addEventListener("input", e => filterOmniItems(e.target.value));

document.querySelector("#omniCopyEvalBtn")?.addEventListener("click", () => {
    const txt = document.querySelector("#omniEvalValue")?.textContent.replace(/^=\s*/, "");
    if (txt) {
        copyText(txt);
        closeOmniPalette();
    }
});

document.querySelector("#omniSendToSciBtn")?.addEventListener("click", () => {
    const txt = document.querySelector("#omniEvalValue")?.textContent.replace(/^=\s*/, "");
    if (txt) {
        showMode("calculator");
        state.expression = txt;
        updateCalculatorPreview();
        closeOmniPalette();
        showToast(`Sent ${txt} to Scientific Studio`);
    }
});

// ============================================================================
// BEAST MODE: WORKSPACE STATE BACKUP & RESTORE
// ============================================================================
document.querySelector("#workspaceBackupBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const modal = document.querySelector("#backupModal");
    if (modal) modal.hidden = false;
});
document.querySelector("#closeBackupBtn")?.addEventListener("click", () => {
    playSoundFeedback("key");
    const modal = document.querySelector("#backupModal");
    if (modal) modal.hidden = true;
});

document.querySelector("#exportSessionJsonBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    const orbitState = {
        version: "2.0.0",
        savedAt: new Date().toISOString(),
        theme: document.documentElement.dataset.theme,
        soundProfile: state.soundProfile,
        history: state.history,
        chartData: state.chartData,
        matrixA: state.matrixA,
        matrixB: state.matrixB
    };
    const blob = new Blob([JSON.stringify(orbitState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit_workspace_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Workspace state downloaded as JSON");
});

document.querySelector("#importSessionFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.history) state.history = data.history;
            if (data.chartData) state.chartData = data.chartData;
            if (data.soundProfile) {
                state.soundProfile = data.soundProfile;
                if (elements.soundProfileSelect) elements.soundProfileSelect.value = data.soundProfile;
            }
            saveHistory();
            renderHistory();
            renderDaysTable();
            renderDataChart();
            showToast("Workspace session restored successfully!");
            const modal = document.querySelector("#backupModal");
            if (modal) modal.hidden = true;
        } catch {
            showToast("Failed to parse JSON file");
        }
    };
    reader.readAsText(file);
});

document.querySelector("#loadEngineeringPresetBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    state.calcEquation = "x^3 - 3*x";
    if (document.querySelector("#calcEqnInput")) document.querySelector("#calcEqnInput").value = "x^3 - 3*x";
    if (document.querySelector("#triInputA")) document.querySelector("#triInputA").value = 5;
    if (document.querySelector("#triInputB")) document.querySelector("#triInputB").value = 12;
    if (document.querySelector("#triInputC")) document.querySelector("#triInputC").value = 13;
    calculateTriangleProperties();
    showToast("Loaded Engineering Preset (Right Triangle, Circuits)");
    const modal = document.querySelector("#backupModal");
    if (modal) modal.hidden = true;
});

document.querySelector("#loadFinancePresetBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    if (document.querySelector("#retCurrentSavings")) document.querySelector("#retCurrentSavings").value = 75000;
    if (document.querySelector("#retMonthlySavings")) document.querySelector("#retMonthlySavings").value = 2000;
    if (document.querySelector("#retExpectedReturn")) document.querySelector("#retExpectedReturn").value = 8.5;
    calculateRetirementTrajectory();
    calculateInflation();
    calculateDrip();
    showToast("Loaded Wealth & FIRE Preset");
    const modal = document.querySelector("#backupModal");
    if (modal) modal.hidden = true;
});

document.querySelector("#resetWorkspaceBtn")?.addEventListener("click", () => {
    if (confirm("Reset entire workspace and clear history to defaults?")) {
        playSoundFeedback("clear");
        localStorage.clear();
        location.reload();
    }
});

// Mode Selector for Calculus Graphing
document.querySelectorAll("#graphModeSelect [data-gmode]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        state.graphMode = btn.dataset.gmode;
        document.querySelectorAll("#graphModeSelect .segmented-item").forEach(b => b.classList.toggle("active", b === btn));

        const ctrlCart = document.querySelector("#ctrlCartesian");
        const ctrlDual = document.querySelector("#ctrlDual");
        const ctrlPolar = document.querySelector("#ctrlPolar");
        const ctrlParam = document.querySelector("#ctrlParametric");

        if (ctrlCart) ctrlCart.hidden = state.graphMode !== "cartesian";
        if (ctrlDual) ctrlDual.hidden = state.graphMode !== "dual";
        if (ctrlPolar) ctrlPolar.hidden = state.graphMode !== "polar";
        if (ctrlParam) ctrlParam.hidden = state.graphMode !== "parametric";

        drawCalculusStudio();
    });
});

document.querySelector("#calcIntersectBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    drawCalculusStudio();
});
document.querySelector("#calcPolarPlotBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    drawCalculusStudio();
});
document.querySelector("#calcParamPlotBtn")?.addEventListener("click", () => {
    playSoundFeedback("enter");
    drawCalculusStudio();
});

// Polar Presets
document.querySelectorAll("#polarPresets [data-polareqn]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        const inp = document.querySelector("#calcEqnInputPolar");
        if (inp) inp.value = btn.dataset.polareqn;
        document.querySelectorAll("#polarPresets .preset-chip").forEach(b => b.classList.toggle("active", b === btn));
        drawCalculusStudio();
    });
});

// Parametric Presets
document.querySelectorAll("#paramPresets [data-paramx]").forEach(btn => {
    btn.addEventListener("click", () => {
        playSoundFeedback("key");
        const xInp = document.querySelector("#calcParamX");
        const yInp = document.querySelector("#calcParamY");
        if (xInp) xInp.value = btn.dataset.paramx;
        if (yInp) yInp.value = btn.dataset.paramy;
        document.querySelectorAll("#paramPresets .preset-chip").forEach(b => b.classList.toggle("active", b === btn));
        drawCalculusStudio();
    });
});

// Regression Model Change Listener
document.querySelector("#chartRegressionModel")?.addEventListener("change", () => {
    playSoundFeedback("key");
    renderDataChart();
});

// Global Keyboard Handler (Enhanced for ⌘K, /, Arrow Navigation)
document.addEventListener("keydown", event => {
    // Spotlight ⌘K or Ctrl+K
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const omni = document.querySelector("#omniModal");
        if (omni && !omni.hidden) closeOmniPalette();
        else openOmniPalette();
        return;
    }

    // '/' to search (if not typing in an input)
    if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        openOmniPalette();
        return;
    }

    // Omni Navigation
    const omni = document.querySelector("#omniModal");
    if (omni && !omni.hidden) {
        if (event.key === "Escape") {
            closeOmniPalette();
            return;
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            omniSelectedIndex = (omniSelectedIndex + 1) % (currentFilteredOmni.length || 1);
            renderOmniResults();
            return;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            omniSelectedIndex = (omniSelectedIndex - 1 + currentFilteredOmni.length) % (currentFilteredOmni.length || 1);
            renderOmniResults();
            return;
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (currentFilteredOmni[omniSelectedIndex]) {
                executeOmniItem(currentFilteredOmni[omniSelectedIndex]);
            }
            return;
        }
    }

    if (event.key === "Escape") {
        if (document.body.classList.contains("zen-mode")) {
            document.body.classList.remove("zen-mode");
            showToast("Exited Zen Mode");
        }
        const sModal = document.querySelector("#shortcutsModal");
        if (sModal && !sModal.hidden) sModal.hidden = true;
        const bModal = document.querySelector("#backupModal");
        if (bModal && !bModal.hidden) bModal.hidden = true;
    }

    if (event.key === "?" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        const modal = document.querySelector("#shortcutsModal");
        if (modal) modal.hidden = !modal.hidden;
        return;
    }

    if (document.querySelector("#calculatorPanel").hidden) return;

    if (/^[0-9.+\-*/^()]$/.test(event.key)) {
        event.preventDefault();
        appendCalculatorKey(event.key);
    } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        solveExpression();
    } else if (event.key === "Backspace") {
        event.preventDefault();
        state.expression = state.expression.slice(0, -1);
        updateCalculatorPreview();
    } else if (event.key === "Escape") {
        state.expression = "";
        updateCalculatorPreview();
    }
});

// Window Resize Handling
window.addEventListener("resize", () => {
    if (!document.querySelector("#chartsPanel").hidden) renderDataChart();
    if (!document.querySelector("#calculusPanel").hidden) drawCalculusStudio();
    if (!document.querySelector("#geometryPanel").hidden) calculateTriangleProperties();
    if (!document.querySelector("#circuitsPanel").hidden) calculateResistorFromBands();
    if (!document.querySelector("#financePanel").hidden) {
        calculateRetirementTrajectory();
        calculatePaycheckDonut();
    }
    if (!document.querySelector("#physicsPanel").hidden) calculateProjectileMotion();
    if (!document.querySelector("#advancedPanel").hidden) {
        calculateCompoundGrowth();
        calculateStats();
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================
function initOrbitSuite() {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const ageTarget = document.querySelector("#ageTarget");
        if (ageTarget) ageTarget.value = todayStr;
        const dateEnd = document.querySelector("#dateEnd");
        if (dateEnd) dateEnd.value = todayStr;

        initializeTheme();
        renderCategories();
        setCategory("length");
        renderHistory();
        updateCalculatorPreview();
        updateMemoryIndicator();
        syncJsonFromTable();
        renderDaysTable();
        updateProgrammerDisplays();
        renderMatrixInputs();
        renderPhysicalConstantsTable();

        const safeRun = fn => {
            try { fn(); } catch (err) { console.warn("Init warn:", err); }
        };

        // Initialize all smart tools & beast mode features
        safeRun(calculateCompoundGrowth);
        safeRun(calculateMortgage);
        safeRun(calculateLoanPayment);
        safeRun(calculateBmi);
        safeRun(calculateDateDifference);
        safeRun(calculateGpa);
        safeRun(calculateStats);
        safeRun(calculatePercentage);
        safeRun(calculateTipSplit);
        safeRun(calculateDiscount);
        safeRun(calculateRoi);
        safeRun(calculateAge);
        safeRun(calculateRetirementTrajectory);
        safeRun(calculatePaycheckDonut);
        safeRun(calculateProjectileMotion);
        safeRun(calculateDefiniteIntegral);
        safeRun(calculateDerivativeAtPoint);
        safeRun(calculateTriangleProperties);
        safeRun(calculateCircleProperties);
        safeRun(calculateSolidProperties);
        safeRun(calculateResistorFromBands);
        safeRun(calculateCircuitResonance);
        safeRun(calculateVoltageDivider);
        safeRun(calculateInflation);
        safeRun(calculateDrip);
        safeRun(calculateColorContrast);
        safeRun(triggerOscilloscopePulse);
    } catch (err) {
        console.error("Orbit Suite initialization error:", err);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOrbitSuite);
} else {
    initOrbitSuite();
}


