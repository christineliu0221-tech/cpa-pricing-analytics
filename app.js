/* ============================================================
   CPA Pricing Analytics — Portfolio Edition  |  app.js
   ============================================================ */

'use strict';

// ──────────────────────────────────────────────
// 1. SCHEMA DEFINITIONS
// ──────────────────────────────────────────────

const INDUSTRIES = {
    1: 'Services', 2: 'Wholesale & retail', 3: 'Manufacturing',
    4: 'Construction', 5: 'Financial services', 6: 'Other', 7: 'Holding company', 8: 'Investment advisory'
};

const REVENUE_LEVELS = {
    1: 'Under NT$0.5M', 2: 'NT$0.5M–2M', 3: 'NT$2M–5M',
    4: 'NT$5M–100M', 5: 'Over NT$100M'
};

// Minimum fee per service (NT$)
const MIN_PRICE = { bookkeeping: 2000, audit: 30000 };

const AUDIT_RISK = { 1: 'Low', 2: 'Medium', 3: 'High' };

const QUALITY_LABELS = {
    10: 'A+', 9: 'A', 8: 'A-', 7: 'B+', 6: 'B',
    5: 'B-', 4: 'C+', 3: 'C', 2: 'C-', 1: 'D'
};

const QUALITY_COLORS = {
    10: 'qb-10', 9: 'qb-9', 8: 'qb-8', 7: 'qb-7',
    6: 'qb-6', 5: 'qb-5', 4: 'qb-4', 3: 'qb-3',
    2: 'qb-2', 1: 'qb-1'
};

// Field schemas per service type
const SCHEMAS = {
    bookkeeping: {
        label: 'Monthly bookkeeping',
        priceUnit: 'NT$ / month',
        fields: [
            { key: 'company', label: 'Client name', type: 'text', required: true },
            { key: 'date', label: 'Engagement month', type: 'month', required: true },
            { key: 'monthly_vouchers', label: 'Vouchers per month', type: 'number', required: true, min: 0 },
            { key: 'revenue_level', label: 'Monthly revenue band', type: 'select', required: true, options: REVENUE_LEVELS },
            { key: 'employee_count', label: 'Headcount', type: 'number', required: true, min: 0 },
            { key: 'industry', label: 'Industry', type: 'select', required: true, options: INDUSTRIES },
            { key: 'add_tax_vat', label: 'Business tax (VAT) filing', type: 'bool', required: false },
            { key: 'add_tax_withholding', label: 'Withholding tax filing', type: 'bool', required: false },
            { key: 'add_invoice', label: 'Invoice issuance', type: 'bool', required: false },
            { key: 'add_payroll', label: 'Payroll processing', type: 'bool', required: false },
            { key: 'staff_quality', label: 'Accounting staff quality', type: 'quality', required: true },
            { key: 'major_tax_issue', label: 'Major tax adjustment', type: 'bool', required: false },
            { key: 'price', label: 'Monthly fee (NT$)', type: 'number', required: true, min: 0 },
        ],
        // Fields used in regression (exclude identifiers)
        // Fields with too little variation are dropped automatically at analysis time (see MIN_VARIATION)
        regressionFeatures: [
            'monthly_vouchers', 'revenue_level', 'employee_count', 'industry',
            'add_tax_vat', 'add_tax_withholding', 'add_invoice', 'add_payroll', 'staff_quality', 'major_tax_issue'
        ],
        // Log model: ln(price) = b0 + b·x; counts enter as ln(1 + x)
        logModel: true,
        logFeatures: ['monthly_vouchers', 'employee_count'],
        // Holding and investment-advisory clients price differently; other industries differ little at the same size
        industryEncoding: 'holding',
        featureLabels: {
            monthly_vouchers: 'Monthly vouchers', revenue_level: 'Revenue band',
            employee_count: 'Headcount', industry: 'Holding / investment advisory',
            add_tax_vat: 'VAT filing', add_tax_withholding: 'Withholding filing',
            add_invoice: 'Invoice issuance',
            add_payroll: 'Payroll processing', staff_quality: 'Staff quality (inverted)',
            major_tax_issue: 'Major tax adjustment'
        }
    },
    audit: {
        label: 'Annual tax attestation',
        priceUnit: 'NT$ / year',
        fields: [
            { key: 'company', label: 'Client name', type: 'text', required: true },
            { key: 'date', label: 'Engagement month', type: 'month', required: true },
            { key: 'total_assets', label: 'Total assets (NT$10k)', type: 'number', required: true, min: 0, hint: 'wan' },
            { key: 'annual_revenue', label: 'Annual revenue (NT$10k)', type: 'number', required: true, min: 0, hint: 'wan' },
            { key: 'industry', label: 'Industry', type: 'select', required: true, options: INDUSTRIES },
            { key: 'first_audit', label: 'First-year engagement', type: 'bool', required: false },
            { key: 'staff_quality', label: 'Accounting staff quality', type: 'quality', required: true },
            { key: 'major_tax_issue', label: 'Major tax adjustment', type: 'bool', required: false },
            { key: 'financial_audit', label: 'Financial statement audit', type: 'bool', required: false },
            { key: 'audit_risk', label: 'Tax audit risk', type: 'select', required: true, options: AUDIT_RISK },
            { key: 'price', label: 'Annual fee (NT$)', type: 'number', required: true, min: 0 },
        ],
        // NOTE: first_audit & major_tax_issue temporarily excluded (near-zero coefficients with n=15)
        // Re-add when data reaches 25+ records
        // subsidiary_count removed (effect was small and its direction unstable)
        // industry & staff_quality removed (adding them did not improve cross-validation error)
        regressionFeatures: [
            'total_assets', 'annual_revenue', 'financial_audit', 'audit_risk'
        ],
        // Log model: ln(price) = b0 + b·x; size features enter as ln(1 + x)
        // so a few very large clients don't dominate the fit
        logModel: true,
        logFeatures: ['total_assets', 'annual_revenue'],
        featureLabels: {
            total_assets: 'Total assets', annual_revenue: 'Annual revenue',
            industry: 'Industry weight',
            first_audit: 'First-year engagement', staff_quality: 'Staff quality (inverted)',
            major_tax_issue: 'Major tax adjustment', financial_audit: 'Financial statement audit',
            audit_risk: 'Tax audit risk'
        }
    }
};

// ──────────────────────────────────────────────
// 2. STATE
// ──────────────────────────────────────────────

const state = {
    activeTab: 'data',
    activeService: { data: 'bookkeeping', analysis: 'bookkeeping', calculator: 'bookkeeping' },
    data: { bookkeeping: [], audit: [] },
    models: { bookkeeping: null, audit: null },
    editingId: null,
    chart: null,
};

// ──────────────────────────────────────────────
// 3. LOCAL STORAGE
// ──────────────────────────────────────────────

const LS_KEY = 'cpa_pricing_analytics_portfolio_v1';

function saveData() {
    localStorage.setItem(LS_KEY, JSON.stringify(state.data));
}

function loadData() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            state.data.bookkeeping = parsed.bookkeeping || [];
            state.data.audit = parsed.audit || [];
        } else {
            // First visit: preload the synthetic demo dataset so reviewers can explore immediately.
            state.data.bookkeeping = DEMO_DATA.bookkeeping.map(r => ({ ...r, id: uid() }));
            state.data.audit = DEMO_DATA.audit.map(r => ({ ...r, id: uid() }));
        }
    } catch (e) { console.warn('Failed to load saved data', e); }
}

// ──────────────────────────────────────────────
// 4. REGRESSION ENGINE (Multiple Linear Regression)
// ──────────────────────────────────────────────

/**
 * Solve Ax = b using Gaussian elimination (works for overdetermined via normal equations)
 * Normal equations: (X^T X) b = X^T y
 */
function matMul(A, B) {
    const n = A.length, m = B[0].length, k = B.length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++)
            for (let l = 0; l < k; l++) C[i][j] += A[i][l] * B[l][j];
    return C;
}

function transpose(A) {
    return A[0].map((_, j) => A.map(row => row[j]));
}

function gaussianElimination(A, b) {
    const n = A.length;
    // Augment matrix
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        // Find pivot
        let maxRow = col;
        for (let row = col + 1; row < n; row++)
            if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
        [M[col], M[maxRow]] = [M[maxRow], M[col]];
        if (Math.abs(M[col][col]) < 1e-10) continue; // singular
        for (let row = 0; row < n; row++) {
            if (row === col) continue;
            const factor = M[row][col] / M[col][col];
            for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
        }
    }
    return M.map((row, i) => (Math.abs(M[i][i]) < 1e-10 ? 0 : row[n] / M[i][i]));
}

/**
 * Perform OLS multiple linear regression.
 * Returns { coefficients, intercept, rSquared, adjustedRSquared, predictions, residuals }
 */
function multipleLinearRegression(X_raw, y) {
    const n = X_raw.length;
    const p = X_raw[0].length;

    // Add intercept column
    const X = X_raw.map(row => [1, ...row]);
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const Xty = matMul(Xt, y.map(v => [v])).map(r => r[0]);

    let beta;
    try {
        beta = gaussianElimination(XtX, Xty);
    } catch (e) {
        return null;
    }

    const intercept = beta[0];
    const coefficients = beta.slice(1);

    // Predictions
    const predictions = X_raw.map(row => intercept + row.reduce((s, v, i) => s + v * coefficients[i], 0));
    const residuals = y.map((v, i) => v - predictions[i]);

    // R²
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const ssRes = residuals.reduce((s, v) => s + v ** 2, 0);
    const rSquared = 1 - ssRes / ssTot;
    // Guard: when n - p - 1 <= 0 (too few data points vs predictors), Adj R² is undefined
    const dof = n - p - 1;
    const adjustedRSquared = dof > 0 ? 1 - (1 - rSquared) * (n - 1) / dof : null;

    // RMSE
    const rmse = Math.sqrt(ssRes / n);

    return { coefficients, intercept, rSquared, adjustedRSquared, predictions, residuals, rmse };
}

/**
 * Encode one feature value for regression.
 * Industry is treated as a numeric "complexity weight" (3 = manufacturing, etc.),
 * or as a 0/1 flag for holding / investment-advisory clients when schema.industryEncoding === 'holding'
 * Staff quality is inverted: lower quality = more effort = higher price
 * Features listed in schema.logFeatures are transformed to ln(1 + x)
 */
function encodeValue(key, v, schema) {
    const INDUSTRY_WEIGHT = { 1: 1, 2: 1.5, 3: 2.5, 4: 2, 5: 3, 6: 1, 7: 2, 8: 2.5 };
    if (key === 'industry') {
        if (schema.industryEncoding === 'holding') return (v === 7 || v === 8) ? 1 : 0;
        return INDUSTRY_WEIGHT[v] || 1;
    }
    if (key === 'staff_quality') return (11 - v); // invert: lower quality → higher number → positive coefficient
    if ((schema.logFeatures || []).includes(key)) return Math.log1p(Math.max(0, v));
    return v;
}

function encodeFeatures(record, features, schema) {
    return features.map(key => encodeValue(key, parseFloat(record[key]) || 0, schema));
}

// A feature needs at least this many records that differ from its most common value
// to be estimated; otherwise it is left out (e.g. VAT filing when every client has it)
const MIN_VARIATION = 5;

function hasEnoughVariation(values) {
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const modeCount = Math.max(...Object.values(counts));
    return values.length - modeCount >= MIN_VARIATION;
}

/**
 * Leave-one-out cross validation: refit without each record, predict it,
 * and report the median % error and the share of records within ±25%.
 */
function crossValidate(X, price, logModel) {
    const y = logModel ? price.map(Math.log) : price;
    const errors = [];
    for (let i = 0; i < X.length; i++) {
        const fit = multipleLinearRegression(X.filter((_, j) => j !== i), y.filter((_, j) => j !== i));
        if (!fit) return null;
        const linear = fit.intercept + X[i].reduce((s, v, k) => s + v * fit.coefficients[k], 0);
        const predicted = logModel ? Math.exp(linear) : linear;
        errors.push(Math.abs(predicted - price[i]) / price[i]);
    }
    const sorted = [...errors].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { medianError: median, within25: errors.filter(e => e <= 0.25).length / errors.length };
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function runRegression(svcType) {
    const schema = SCHEMAS[svcType];
    const records = state.data[svcType];

    if (records.length < 3) return null;

    const features = schema.regressionFeatures.filter(key =>
        hasEnoughVariation(records.map(r => encodeValue(key, parseFloat(r[key]) || 0, schema))));
    const droppedFeatures = schema.regressionFeatures.filter(key => !features.includes(key));
    if (features.length === 0) return null;

    const X = records.map(r => encodeFeatures(r, features, schema));
    const price = records.map(r => parseFloat(r.price));
    const logModel = !!schema.logModel;
    if (price.some(v => !(v > 0))) return null;
    const y = logModel ? price.map(Math.log) : price;

    const result = multipleLinearRegression(X, y);
    if (!result) return null;
    result.cv = records.length >= 10 ? crossValidate(X, price, logModel) : null;
    // Median client profile (encoded), used as the reference point in the calculator breakdown
    result.reference = features.map((_, k) => median(X.map(row => row[k])));

    // Historical values of each numeric input, to warn when a quote is outside well-covered data
    result.featureValues = {};
    features.forEach(key => {
        const field = schema.fields.find(f => f.key === key);
        if (!field || field.type !== 'number') return;
        result.featureValues[key] = records.map(r => parseFloat(r[key]) || 0);
    });

    if (logModel) {
        // Keep the log-scale spread for the price range, then report fit stats in NT$
        result.logRmse = result.rmse;
        result.predictions = result.predictions.map(Math.exp);
        const n = price.length, p = features.length;
        const mean = price.reduce((a, b) => a + b, 0) / n;
        const ssTot = price.reduce((s, v) => s + (v - mean) ** 2, 0);
        const ssRes = price.reduce((s, v, i) => s + (v - result.predictions[i]) ** 2, 0);
        result.rSquared = 1 - ssRes / ssTot;
        const dof = n - p - 1;
        result.adjustedRSquared = dof > 0 ? 1 - (1 - result.rSquared) * (n - 1) / dof : null;
        result.rmse = Math.sqrt(ssRes / n);
        result.residuals = price.map((v, i) => v - result.predictions[i]);
    }
    // Snapshot of the fitted rows, so the gap export matches the analysis even if data changes later
    result.records = records.map(r => ({ company: r.company, date: r.date, price: parseFloat(r.price) }));
    result.logModel = logModel;
    result.features = features;
    result.droppedFeatures = droppedFeatures;
    result.featureLabels = schema.featureLabels;
    return result;
}

// ──────────────────────────────────────────────
// 5. DEMO DATA
// ──────────────────────────────────────────────

const DEMO_DATA = {
    // All company names and figures below are synthetic portfolio data.
    bookkeeping: [
        { id: uid(), company: 'Aurora Bistro (Demo)', date: '2023-03', monthly_vouchers: 150, revenue_level: 2, employee_count: 8, industry: 1, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 0, add_payroll: 1, staff_quality: 7, major_tax_issue: 0, price: 9000 },
        { id: uid(), company: 'Bluebird Digital (Demo)', date: '2023-04', monthly_vouchers: 300, revenue_level: 3, employee_count: 25, industry: 1, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 1, add_payroll: 1, staff_quality: 5, major_tax_issue: 1, price: 18000 },
        { id: uid(), company: 'Cedar Construction (Demo)', date: '2023-05', monthly_vouchers: 500, revenue_level: 4, employee_count: 50, industry: 4, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 0, add_payroll: 1, staff_quality: 3, major_tax_issue: 1, price: 35000 },
        { id: uid(), company: 'Dawn Produce (Demo)', date: '2023-06', monthly_vouchers: 80, revenue_level: 1, employee_count: 3, industry: 2, add_tax_vat: 0, add_tax_withholding: 0, add_invoice: 0, add_payroll: 0, staff_quality: 9, major_tax_issue: 0, price: 4500 },
        { id: uid(), company: 'Evergreen Apparel (Demo)', date: '2023-07', monthly_vouchers: 220, revenue_level: 3, employee_count: 12, industry: 2, add_tax_vat: 1, add_tax_withholding: 0, add_invoice: 1, add_payroll: 0, staff_quality: 6, major_tax_issue: 0, price: 12000 },
        { id: uid(), company: 'Firefly Machinery (Demo)', date: '2023-08', monthly_vouchers: 650, revenue_level: 4, employee_count: 80, industry: 3, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 0, add_payroll: 1, staff_quality: 4, major_tax_issue: 1, price: 45000 },
        { id: uid(), company: 'Golden Grain Foods (Demo)', date: '2023-09', monthly_vouchers: 180, revenue_level: 2, employee_count: 15, industry: 3, add_tax_vat: 1, add_tax_withholding: 0, add_invoice: 0, add_payroll: 1, staff_quality: 8, major_tax_issue: 0, price: 11000 },
        { id: uid(), company: 'Harbor Consulting (Demo)', date: '2023-10', monthly_vouchers: 120, revenue_level: 3, employee_count: 20, industry: 1, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 0, add_payroll: 1, staff_quality: 9, major_tax_issue: 0, price: 10000 },
        { id: uid(), company: 'Indigo Logistics (Demo)', date: '2023-11', monthly_vouchers: 400, revenue_level: 3, employee_count: 35, industry: 2, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 1, add_payroll: 1, staff_quality: 5, major_tax_issue: 0, price: 22000 },
        { id: uid(), company: 'Juniper Development (Demo)', date: '2024-01', monthly_vouchers: 280, revenue_level: 4, employee_count: 40, industry: 4, add_tax_vat: 1, add_tax_withholding: 0, add_invoice: 0, add_payroll: 1, staff_quality: 6, major_tax_issue: 1, price: 28000 },
        { id: uid(), company: 'Kite Textile (Demo)', date: '2024-02', monthly_vouchers: 580, revenue_level: 4, employee_count: 65, industry: 3, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 1, add_payroll: 1, staff_quality: 3, major_tax_issue: 1, price: 40000 },
        { id: uid(), company: 'Lantern Hospitality (Demo)', date: '2024-03', monthly_vouchers: 350, revenue_level: 3, employee_count: 45, industry: 1, add_tax_vat: 1, add_tax_withholding: 1, add_invoice: 1, add_payroll: 1, staff_quality: 4, major_tax_issue: 0, price: 25000 },
    ],
    audit: [
        { id: uid(), company: 'Maple Technology (Demo)', date: '2022-12', total_assets: 8000, annual_revenue: 15000, industry: 1, first_audit: 0, staff_quality: 8, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 60000 },
        { id: uid(), company: 'Northstar Manufacturing (Demo)', date: '2022-12', total_assets: 20000, annual_revenue: 30000, industry: 3, first_audit: 0, staff_quality: 6, major_tax_issue: 1, financial_audit: 0, audit_risk: 2, price: 120000 },
        { id: uid(), company: 'Orchid Construction (Demo)', date: '2023-01', total_assets: 50000, annual_revenue: 20000, industry: 4, first_audit: 1, staff_quality: 4, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 200000 },
        { id: uid(), company: 'Pine Retail Group (Demo)', date: '2023-02', total_assets: 5000, annual_revenue: 12000, industry: 2, first_audit: 0, staff_quality: 7, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 50000 },
        { id: uid(), company: 'Quartz Financial (Demo)', date: '2023-03', total_assets: 200000, annual_revenue: 50000, industry: 5, first_audit: 0, staff_quality: 9, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 350000 },
        { id: uid(), company: 'Riverstone Foods (Demo)', date: '2023-04', total_assets: 12000, annual_revenue: 18000, industry: 3, first_audit: 1, staff_quality: 5, major_tax_issue: 0, financial_audit: 0, audit_risk: 2, price: 90000 },
        { id: uid(), company: 'Silverline Electronics (Demo)', date: '2023-05', total_assets: 30000, annual_revenue: 40000, industry: 1, first_audit: 0, staff_quality: 7, major_tax_issue: 1, financial_audit: 0, audit_risk: 2, price: 150000 },
        { id: uid(), company: 'Tideway Properties (Demo)', date: '2023-06', total_assets: 80000, annual_revenue: 25000, industry: 4, first_audit: 0, staff_quality: 3, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 280000 },
        { id: uid(), company: 'Umbra Commerce (Demo)', date: '2023-07', total_assets: 9000, annual_revenue: 22000, industry: 2, first_audit: 0, staff_quality: 8, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 55000 },
        { id: uid(), company: 'Valley Forge Machinery (Demo)', date: '2023-08', total_assets: 45000, annual_revenue: 60000, industry: 3, first_audit: 1, staff_quality: 6, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 230000 },
        { id: uid(), company: 'Willow Engineering (Demo)', date: '2023-09', total_assets: 15000, annual_revenue: 10000, industry: 1, first_audit: 1, staff_quality: 7, major_tax_issue: 0, financial_audit: 0, audit_risk: 2, price: 70000 },
        { id: uid(), company: 'Zenith Development (Demo)', date: '2023-10', total_assets: 100000, annual_revenue: 35000, industry: 4, first_audit: 0, staff_quality: 5, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 310000 },
    ]
};

function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Live conversion of NT$10k units into a readable amount
function formatWan(wan) {
    const n = parseFloat(wan);
    if (!n || isNaN(n) || n <= 0) return '';
    const ntd = n * 10000;
    if (ntd >= 1e9) return `≈ NT$${(ntd / 1e9).toFixed(2)} billion`;
    if (ntd >= 1e6) return `≈ NT$${(ntd / 1e6).toFixed(1)} million`;
    return `≈ NT$${ntd.toLocaleString()}`;
}

// ──────────────────────────────────────────────
// 6. TOAST
// ──────────────────────────────────────────────

let toastTimer;
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// ──────────────────────────────────────────────
// 7. TABLE RENDERING
// ──────────────────────────────────────────────

const TABLE_COLUMNS_BOOKKEEPING = [
    { key: 'company', label: 'Client' },
    { key: 'date', label: 'Month' },
    { key: 'monthly_vouchers', label: 'Vouchers' },
    { key: 'revenue_level', label: 'Revenue band', render: v => REVENUE_LEVELS[v] || v },
    { key: 'employee_count', label: 'Headcount' },
    { key: 'industry', label: 'Industry', render: v => INDUSTRIES[v] || v },
    { key: 'staff_quality', label: 'Staff quality', render: v => renderQuality(v) },
    { key: 'major_tax_issue', label: 'Tax issue', render: v => v == 1 ? 'Yes' : '—' },
    { key: 'add_tax_vat', label: 'VAT', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_tax_withholding', label: 'Withholding', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_invoice', label: 'Invoicing', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_payroll', label: 'Payroll', render: v => v == 1 ? '✓' : '—' },
    { key: 'price', label: 'Fee (NT$/mo)', render: v => `<span class="price-cell">${Number(v).toLocaleString()}</span>` },
];

const TABLE_COLUMNS_AUDIT = [
    { key: 'company', label: 'Client' },
    { key: 'date', label: 'Month' },
    { key: 'total_assets', label: 'Assets (NT$10k)', render: v => Number(v).toLocaleString() },
    { key: 'annual_revenue', label: 'Revenue (NT$10k)', render: v => Number(v).toLocaleString() },
    { key: 'industry', label: 'Industry', render: v => INDUSTRIES[v] || v },
    { key: 'first_audit', label: 'First year', render: v => v == 1 ? 'Yes' : '—' },
    { key: 'staff_quality', label: 'Staff quality', render: v => renderQuality(v) },
    { key: 'major_tax_issue', label: 'Tax issue', render: v => v == 1 ? 'Yes' : '—' },
    { key: 'financial_audit', label: 'FS audit', render: v => v == 1 ? '✓' : '—' },
    { key: 'audit_risk', label: 'Audit risk', render: v => AUDIT_RISK[v] || v },
    { key: 'price', label: 'Fee (NT$/yr)', render: v => `<span class="price-cell">${Number(v).toLocaleString()}</span>` },
];

function renderQuality(v) {
    const lbl = QUALITY_LABELS[v] || v;
    const cls = QUALITY_COLORS[v] || 'qb-5';
    return `<span class="quality-badge ${cls}">${lbl}</span>`;
}

function renderTable(svcType) {
    const cols = svcType === 'bookkeeping' ? TABLE_COLUMNS_BOOKKEEPING : TABLE_COLUMNS_AUDIT;
    const records = state.data[svcType];

    const thead = document.getElementById('table-head');
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const countEl = document.getElementById('record-count');

    thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr>`;

    if (records.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'flex';
        countEl.textContent = '0 records';
        return;
    }

    emptyState.style.display = 'none';
    countEl.textContent = `${records.length} record${records.length === 1 ? '' : 's'}`;

    tbody.innerHTML = records.map(record => {
        const cells = cols.map(col => {
            const raw = record[col.key];
            const rendered = col.render ? col.render(raw) : (raw ?? '—');
            return `<td>${rendered}</td>`;
        }).join('');
        return `<tr>
      ${cells}
      <td>
        <div class="table-actions">
          <button class="btn-icon" onclick="openEditModal('${record.id}','${svcType}')" title="Edit">Edit</button>
          <button class="btn-icon delete" onclick="deleteRecord('${record.id}','${svcType}')" title="Delete">Delete</button>
        </div>
      </td>
    </tr>`;
    }).join('');
}

// ──────────────────────────────────────────────
// 8. MODAL — ADD / EDIT
// ──────────────────────────────────────────────

function buildFormFields(svcType, record = {}) {
    const schema = SCHEMAS[svcType];
    return schema.fields.map(field => {
        const val = record[field.key] ?? '';
        const isFullWidth = ['company'].includes(field.key);
        let input = '';
        if (field.type === 'text') {
            input = `<input class="form-input" type="text" id="field-${field.key}" name="${field.key}" value="${val}" ${field.required ? 'required' : ''} />`;
        } else if (field.type === 'month') {
            input = `<input class="form-input" type="month" id="field-${field.key}" name="${field.key}" value="${val}" ${field.required ? 'required' : ''} />`;
        } else if (field.type === 'number') {
            const onInput = field.hint === 'wan'
                ? `oninput="document.getElementById('wan-hint-${field.key}').textContent=formatWan(this.value)"`
                : '';
            const wanHint = field.hint === 'wan'
                ? `<div id="wan-hint-${field.key}" class="wan-hint">${val ? formatWan(val) : ''}</div>`
                : '';
            input = `<input class="form-input" type="number" id="field-${field.key}" name="${field.key}" value="${val}" min="${field.min ?? 0}" step="any" ${field.required ? 'required' : ''} ${onInput} />${wanHint}`;
        } else if (field.type === 'select') {
            const options = Object.entries(field.options).map(([k, v]) =>
                `<option value="${k}" ${val == k ? 'selected' : ''}>${v}</option>`
            ).join('');
            input = `<select class="form-select" id="field-${field.key}" name="${field.key}" ${field.required ? 'required' : ''}><option value="">Select…</option>${options}</select>`;
        } else if (field.type === 'quality') {
            const qOptions = Array.from({ length: 10 }, (_, i) => {
                const score = 10 - i;
                return `<option value="${score}" ${val == score ? 'selected' : ''}>${QUALITY_LABELS[score]} (${score})</option>`;
            }).join('');
            input = `<select class="form-select" id="field-${field.key}" name="${field.key}" ${field.required ? 'required' : ''}><option value="">Select…</option>${qOptions}</select>`;
        } else if (field.type === 'bool') {
            const checked = val == 1 ? 'checked' : '';
            input = `
        <label class="checkbox-item" style="margin-top:4px">
          <input type="checkbox" id="field-${field.key}" name="${field.key}" value="1" ${checked} />
          ${field.label}
        </label>`;
            return `<div class="form-group${isFullWidth ? ' full' : ''}">${input}</div>`;
        }
        return `<div class="form-group${isFullWidth ? ' full' : ''}">
      <label class="form-label" for="field-${field.key}">${field.label}</label>
      ${input}
    </div>`;
    }).join('');
}

function openAddModal(svcType) {
    state.editingId = null;
    document.getElementById('modal-title').textContent = `Add engagement — ${SCHEMAS[svcType].label}`;
    document.getElementById('record-form').innerHTML = buildFormFields(svcType);
    document.getElementById('modal-overlay').classList.add('open');
}

function openEditModal(id, svcType) {
    const record = state.data[svcType].find(r => r.id === id);
    if (!record) return;
    state.editingId = id;
    document.getElementById('modal-title').textContent = `Edit engagement — ${record.company}`;
    document.getElementById('record-form').innerHTML = buildFormFields(svcType, record);
    document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    state.editingId = null;
}

function saveRecord() {
    const svcType = state.activeService.data;
    const schema = SCHEMAS[svcType];
    const form = document.getElementById('record-form');
    const data = {};

    for (const field of schema.fields) {
        if (field.type === 'bool') {
            const el = form.querySelector(`[name="${field.key}"]`);
            data[field.key] = el && el.checked ? 1 : 0;
        } else {
            const el = form.querySelector(`[name="${field.key}"]`);
            if (!el) continue;
            if (field.required && !el.value.trim()) {
                showToast(`Please fill in "${field.label}"`, 'error');
                el.focus();
                return;
            }
            data[field.key] = field.type === 'number' ? parseFloat(el.value) || 0 : el.value;
        }
    }

    if (state.editingId) {
        const idx = state.data[svcType].findIndex(r => r.id === state.editingId);
        state.data[svcType][idx] = { ...data, id: state.editingId };
        showToast('Engagement updated');
    } else {
        state.data[svcType].push({ ...data, id: uid() });
        showToast('Engagement added');
    }

    saveData();
    closeModal();
    renderTable(svcType);
}

function deleteRecord(id, svcType) {
    if (!confirm('Delete this engagement?')) return;
    state.data[svcType] = state.data[svcType].filter(r => r.id !== id);
    saveData();
    renderTable(svcType);
    showToast('Engagement deleted', 'info');
}

// ──────────────────────────────────────────────
// 9. CSV IMPORT / EXPORT
// ──────────────────────────────────────────────

function parseImportedRows(rows, svcType) {
    const schema = SCHEMAS[svcType];
    return rows.map(row => {
        const record = { id: uid() };
        for (const field of schema.fields) {
            const raw = row[field.key];
            if (field.type === 'number' || field.type === 'select' || field.type === 'quality') {
                record[field.key] = parseFloat(raw) || 0;
            } else if (field.type === 'bool') {
                record[field.key] = (raw === '1' || raw === 'true' || raw === 'yes' || raw === '是') ? 1 : 0;
            } else {
                record[field.key] = raw || '';
            }
        }
        return record;
    });
}

// When data already exists, ask whether to replace or append so re-imports don't duplicate rows
function applyImport(svcType, imported, sourceLabel) {
    const label = SCHEMAS[svcType].label;
    const commit = (mode) => {
        if (mode === 'replace') {
            state.data[svcType] = imported;
            state.models[svcType] = null;
        } else {
            state.data[svcType].push(...imported);
        }
        saveData();
        renderTable(svcType);
        const verb = mode === 'replace' ? 'Replaced data with' : 'Imported';
        showToast(`${verb} ${imported.length} ${label.toLowerCase()} records${sourceLabel}`);
    };
    const existing = state.data[svcType].length;
    if (existing === 0) { commit('append'); return; }

    document.getElementById('import-choice-text').innerHTML =
        `You already have <strong>${existing}</strong> ${label.toLowerCase()} records and this file has <strong>${imported.length}</strong>.<br>` +
        `If you are re-importing the same file, choose <strong>Replace existing data</strong> to avoid duplicates.`;
    const overlay = document.getElementById('import-choice-overlay');
    overlay.classList.add('open');
    const close = () => {
        overlay.classList.remove('open');
        overlay.onclick = null;
    };
    document.getElementById('btn-import-replace').onclick = () => { close(); commit('replace'); };
    document.getElementById('btn-import-append').onclick = () => { close(); commit('append'); };
    document.getElementById('btn-import-cancel').onclick = () => { close(); showToast('Import cancelled', 'info'); };
    overlay.onclick = e => { if (e.target === overlay) { close(); showToast('Import cancelled', 'info'); } };
}

function clearData(svcType) {
    const label = SCHEMAS[svcType].label;
    const n = state.data[svcType].length;
    if (n === 0) { showToast(`There is no ${label.toLowerCase()} data to clear`, 'info'); return; }
    if (!confirm(`Clear all ${n} ${label.toLowerCase()} records?\nThis cannot be undone. Use Export CSV first if you need a backup.`)) return;
    state.data[svcType] = [];
    state.models[svcType] = null;
    saveData();
    renderTable(svcType);
    showToast(`${label} data cleared`);
}

function importCSV(file, svcType) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const imported = parseImportedRows(results.data, svcType);
            applyImport(svcType, imported, ' from CSV');
        },
        error: () => showToast('Could not parse the CSV. Check the file format.', 'error')
    });
}

function exportCSV(svcType) {
    const schema = SCHEMAS[svcType];
    const records = state.data[svcType];
    if (records.length === 0) { showToast('No data to export', 'info'); return; }
    const headers = schema.fields.map(f => f.key).join(',');
    const rows = records.map(r => schema.fields.map(f => {
        const v = r[f.key] ?? '';
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpa_pricing_${svcType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
}

function csvCell(v) {
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Actual fee vs. model estimate per client, sorted by gap % (most underpriced first)
function exportGapCSV() {
    const svcType = state.activeService.analysis;
    const model = state.models[svcType];
    if (!model) { showToast('Run the regression first, then export the gap report', 'info'); return; }
    const schema = SCHEMAS[svcType];
    const spread = model.logModel ? Math.exp(1.5 * model.logRmse) : null;
    const rows = model.records.map((r, i) => {
        const pred = model.predictions[i];
        const low = model.logModel ? pred / spread : pred - 1.5 * model.rmse;
        const high = model.logModel ? pred * spread : pred + 1.5 * model.rmse;
        const gap = r.price - pred;
        const status = r.price < low ? 'Below range' : r.price > high ? 'Above range' : 'Within range';
        return { ...r, pred, low, high, gap, gapPct: gap / pred, status };
    }).sort((a, b) => a.gapPct - b.gapPct);

    const headers = ['Client', 'Month', 'Actual fee', 'Model estimate', 'Range low', 'Range high', 'Gap (actual - estimate)', 'Gap %', 'Flag'];
    const lines = rows.map(r => [
        r.company, r.date, Math.round(r.price), Math.round(r.pred),
        Math.round(Math.max(0, r.low)), Math.round(r.high), Math.round(r.gap),
        (r.gapPct * 100).toFixed(1) + '%', r.status
    ].map(csvCell).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee_gap_${svcType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const low = rows.filter(r => r.status === 'Below range').length;
    const high = rows.filter(r => r.status === 'Above range').length;
    showToast(`Exported ${rows.length} clients (${low} below range, ${high} above range)`);
}

// ──────────────────────────────────────────────
// 9b. GOOGLE SHEETS IMPORT
// ──────────────────────────────────────────────

function openGsPanel() {
    document.getElementById('gs-panel').classList.add('open');
    document.getElementById('btn-gs-open').classList.add('active');
    document.getElementById('gs-url').focus();
}

function closeGsPanel() {
    document.getElementById('gs-panel').classList.remove('open');
    document.getElementById('btn-gs-open').classList.remove('active');
    document.getElementById('gs-url').value = '';
}

async function importFromGoogleSheets() {
    const svcType = state.activeService.data;
    let url = document.getElementById('gs-url').value.trim();
    if (!url) { showToast('Paste a Google Sheets link first', 'error'); return; }

    // Auto-convert edit URL → publish CSV URL
    if (!url.includes('/pub') && !url.includes('output=csv')) {
        const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch) {
            url = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/pub?output=csv`;
        } else {
            showToast('That does not look like a Google Sheets link', 'error');
            return;
        }
    }

    showToast('Fetching data from Google Sheets…', 'info');
    const btn = document.getElementById('btn-gs-confirm');
    btn.disabled = true;
    btn.textContent = 'Fetching…';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();

        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const imported = parseImportedRows(results.data, svcType);
                closeGsPanel();
                applyImport(svcType, imported, ' from Google Sheets');
            }
        });
    } catch (err) {
        showToast('Import failed. Make sure the sheet is published to the web and the link is correct.', 'error');
        console.error('[GS Import Error]', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Import';
    }
}

function downloadTemplate(svcType) {
    const schema = SCHEMAS[svcType];
    const headers = schema.fields.map(f => f.key).join(',');
    const sampleRow = schema.fields.map(f => {
        if (f.type === 'text') return f.key === 'company' ? 'Sample Client Ltd.' : '';
        if (f.type === 'date') return '2024-01-01';
        if (f.type === 'bool') return '0';
        if (f.type === 'quality') return '7';
        if (f.type === 'select') return Object.keys(f.options)[0];
        if (f.key === 'price') return svcType === 'bookkeeping' ? '10000' : '80000';
        return '0';
    }).join(',');
    const csv = [headers, sampleRow].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${svcType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${SCHEMAS[svcType].label} template downloaded`);
}

// ──────────────────────────────────────────────
// 10. ANALYSIS RENDERING
// ──────────────────────────────────────────────

function runAnalysis() {
    const svcType = state.activeService.analysis;
    const records = state.data[svcType];
    if (records.length < 5) {
        showToast(`At least 5 ${SCHEMAS[svcType].label.toLowerCase()} records are needed`, 'error');
        return;
    }
    const model = runRegression(svcType);
    if (!model) { showToast('Regression failed. Check the data format.', 'error'); return; }
    state.models[svcType] = model;
    renderModelSummary(model, svcType);
    renderCoefficients(model, svcType);
    renderFormula(model, svcType);
    renderAnalysisChart(model, records, svcType);
    // The calculator only asks for factors the fitted model uses
    if (state.activeService.calculator === svcType) buildCalculatorForm(svcType);
    showToast('Regression complete', 'success');
}

function renderModelSummary(model, svcType) {
    const r2 = (model.rSquared * 100).toFixed(1);
    const adjR2 = model.adjustedRSquared !== null
        ? (model.adjustedRSquared * 100).toFixed(1) + '%'
        : '<span style="font-size:13px;color:var(--negative)" title="Too few records for this statistic (need at least factors + 2)">N/A</span>';
    const rmse = Math.round(model.rmse).toLocaleString();
    const n = state.data[svcType].length;
    const schema = SCHEMAS[svcType];
    const cvStats = model.cv ? `
      <div class="stat-item" title="Leave-one-out: each client is predicted by a model fitted without it. A more honest accuracy measure than R²."><div class="stat-label">CV error (median)</div><div class="stat-value">${(model.cv.medianError * 100).toFixed(1)}%</div></div>
      <div class="stat-item" title="Share of clients whose cross-validated estimate is within ±25% of the actual fee"><div class="stat-label">Within ±25%</div><div class="stat-value">${Math.round(model.cv.within25 * 100)}%</div></div>` : '';
    const dropped = model.droppedFeatures.length > 0
        ? `<div class="model-note">Left out for too little variation (fewer than ${MIN_VARIATION} records differ): ${model.droppedFeatures.map(k => schema.featureLabels[k] || k).join(', ')}</div>`
        : '';
    document.getElementById('model-summary-content').innerHTML = `
    <div class="model-stats">
      <div class="stat-item"><div class="stat-label">Records</div><div class="stat-value">${n}</div></div>
      <div class="stat-item"><div class="stat-label">Adj. R²</div><div class="stat-value">${adjR2}</div></div>
      <div class="stat-item"><div class="stat-label">RMSE</div><div class="stat-value">${rmse}</div></div>
      <div class="stat-item"><div class="stat-label">R²</div><div class="stat-value">${r2}%</div></div>${cvStats}
    </div>
    ${dropped}
    <div class="r2-bar-wrap">
      <div class="r2-bar-label"><span>Variance explained (R²)</span><span>${r2}%</span></div>
      <div class="r2-bar"><div class="r2-bar-fill" style="width:0%" id="r2-fill"></div></div>
    </div>`;
    setTimeout(() => {
        const fill = document.getElementById('r2-fill');
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, model.rSquared * 100))}%`;
    }, 50);
}

/**
 * Log model: express a coefficient as a % price effect.
 * Log features → effect when the value doubles; others → effect per +1.
 */
function logEffectPct(key, coef, schema) {
    const isLogFeature = (schema.logFeatures || []).includes(key);
    return ((isLogFeature ? Math.pow(2, coef) : Math.exp(coef)) - 1) * 100;
}

function renderCoefficients(model, svcType) {
    const schema = SCHEMAS[svcType];
    const shown = model.features.map((key, i) => model.logModel
        ? logEffectPct(key, model.coefficients[i], schema)
        : model.coefficients[i]);
    const maxAbs = Math.max(...shown.map(Math.abs), 1);
    const items = model.features.map((key, i) => {
        const coef = shown[i];
        const pct = Math.abs(coef) / maxAbs * 100;
        const isPos = coef >= 0;
        const bar = isPos
            ? `<div class="coef-bar-pos" style="width:${pct}%"></div>`
            : `<div class="coef-bar-neg" style="width:${pct}%"></div>`;
        const label = schema.featureLabels[key] || key;
        const name = model.logModel && (schema.logFeatures || []).includes(key) ? `${label} (×2)` : label;
        const value = model.logModel ? `${coef.toFixed(1)}%` : coef.toFixed(1);
        return `<div class="coef-item">
      <span class="coef-name">${name}</span>
      <div class="coef-bar-wrap">${bar}</div>
      <span class="coef-value ${isPos ? 'positive' : 'negative'}">${isPos ? '+' : ''}${value}</span>
    </div>`;
    }).join('');
    const base = model.logModel
        ? `<div class="coef-item">
        <span class="coef-name">Intercept, ln(fee)</span>
        <div class="coef-bar-wrap"><div class="coef-bar-pos" style="width:30%"></div></div>
        <span class="coef-value contribution-base">${model.intercept.toFixed(3)}</span>
      </div>`
        : `<div class="coef-item">
        <span class="coef-name">Base fee (intercept)</span>
        <div class="coef-bar-wrap"><div class="coef-bar-pos" style="width:30%"></div></div>
        <span class="coef-value contribution-base">${Math.round(model.intercept).toLocaleString()}</span>
      </div>`;
    document.getElementById('coefficients-content').innerHTML = `
    <div class="coef-list">
      ${base}
      ${items}
    </div>`;
}

function renderFormula(model, svcType) {
    const schema = SCHEMAS[svcType];
    const unit = schema.priceUnit;
    const terms = model.features.map((key, i) => {
        const coef = model.coefficients[i];
        const sign = coef >= 0 ? '+' : '-';
        const label = schema.featureLabels[key] || key;
        const term = model.logModel && (schema.logFeatures || []).includes(key) ? `ln(1 + ${label})` : label;
        return `  ${sign} ${Math.abs(coef).toFixed(model.logModel ? 4 : 2)} × [${term}]`;
    }).join('\n');
    const lhs = model.logModel ? `ln(fee, ${unit})` : `fee (${unit})`;
    const base = model.logModel ? model.intercept.toFixed(4) : Math.round(model.intercept).toLocaleString();
    document.getElementById('formula-box').innerHTML = `
    <pre style="white-space:pre-wrap;font-size:13px;line-height:1.9;color:var(--navy)">${lhs} =
  ${base}  (intercept)
${terms}</pre>`;
}

function renderAnalysisChart(model, records, svcType) {
    const actual = records.map(r => parseFloat(r.price));
    const predicted = model.predictions;
    const labels = records.map(r => r.company.replace(/\s*\(Demo\)$/, ''));

    if (state.chart) { state.chart.destroy(); }

    const ctx = document.getElementById('analysis-chart').getContext('2d');
    state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Actual fee',
                    data: actual,
                    backgroundColor: '#1f3a5f',
                    borderWidth: 0,
                    borderRadius: 2,
                },
                {
                    label: 'Model estimate',
                    data: predicted,
                    backgroundColor: '#5fb3a9',
                    borderWidth: 0,
                    borderRadius: 2,
                    type: 'bar',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', align: 'end', labels: { color: '#4b5563', boxWidth: 12, boxHeight: 12, font: { family: 'Inter', size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: NT$${Number(ctx.raw).toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#6b7280', maxRotation: 45, font: { family: 'Inter', size: 11 } }, grid: { display: false } },
                y: {
                    ticks: {
                        color: '#6b7280',
                        font: { family: 'Inter', size: 11 },
                        callback: v => `NT$${(v / 1000).toFixed(0)}k`
                    },
                    grid: { color: '#e5e7eb' },
                    border: { display: false }
                }
            }
        }
    });
}

// ──────────────────────────────────────────────
// 11. PRICING CALCULATOR
// ──────────────────────────────────────────────

function buildCalculatorForm(svcType) {
    const schema = SCHEMAS[svcType];
    // Only ask for the factors the model actually uses
    const used = state.models[svcType] ? state.models[svcType].features : schema.regressionFeatures;
    const fields = schema.fields.filter(f => used.includes(f.key));
    const boolFields = fields.filter(f => f.type === 'bool');
    const otherFields = fields.filter(f => f.type !== 'bool');

    const otherInputs = otherFields.map(field => {
        let input = '';
        if (field.type === 'number') {
            input = `<input class="form-input" type="number" id="calc-${field.key}" min="0" step="any" placeholder="Enter a value" />`;
        } else if (field.type === 'select') {
            const opts = Object.entries(field.options).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
            input = `<select class="form-select" id="calc-${field.key}"><option value="">Select…</option>${opts}</select>`;
        } else if (field.type === 'quality') {
            const opts = Array.from({ length: 10 }, (_, i) => {
                const s = 10 - i;
                return `<option value="${s}">${QUALITY_LABELS[s]} (${s})</option>`;
            }).join('');
            input = `<select class="form-select" id="calc-${field.key}"><option value="">Select…</option>${opts}</select>`;
        }
        return `<div class="form-group">
      <label class="form-label" for="calc-${field.key}">${field.label}</label>
      ${input}
    </div>`;
    }).join('');

    const boolGrid = boolFields.length > 0 ? `
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Engagement characteristics</label>
      <div class="checkbox-group">
        ${boolFields.map(f => `
          <label class="checkbox-item">
            <input type="checkbox" id="calc-${f.key}" value="1" />
            ${f.label}
          </label>`).join('')}
      </div>
    </div>` : '';

    document.getElementById('calc-form').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${otherInputs}
      ${boolGrid}
    </div>`;
}

function calculatePrice() {
    const svcType = state.activeService.calculator;
    const model = state.models[svcType];
    if (!model) {
        showToast('Run the regression on the Model Analysis tab first', 'error');
        return;
    }
    const schema = SCHEMAS[svcType];
    const features = model.features;

    const encoded = features.map(key => {
        const field = schema.fields.find(f => f.key === key);
        if (!field) return 0;
        let val;
        if (field.type === 'bool') {
            const el = document.getElementById(`calc-${key}`);
            val = el && el.checked ? 1 : 0;
        } else {
            const el = document.getElementById(`calc-${key}`);
            val = el ? parseFloat(el.value) || 0 : 0;
        }
        return encodeValue(key, val, schema);
    });

    const linear = model.intercept + encoded.reduce((s, v, i) => s + v * model.coefficients[i], 0);
    const minPrice = MIN_PRICE[svcType] || 0;
    let predicted, low, high, contributions, baseText;
    if (model.logModel) {
        // ln(price) model: range = ±1.5σ in log scale, i.e. a proportional band
        predicted = Math.exp(linear);
        const s = model.logRmse;
        low = Math.max(minPrice, Math.round(predicted * Math.exp(-1.5 * s)));
        high = Math.round(predicted * Math.exp(1.5 * s));
        // Start from the median client and show each factor's multiplier relative to it
        const ref = model.reference;
        const refLinear = model.intercept + ref.reduce((s, v, i) => s + v * model.coefficients[i], 0);
        baseText = `NT$${Math.round(Math.exp(refLinear)).toLocaleString()}`;
        contributions = features.map((key, i) => {
            const mult = Math.exp((encoded[i] - ref[i]) * model.coefficients[i]);
            return { label: schema.featureLabels[key] || key, positive: mult >= 1, text: `×${mult.toFixed(2)}` };
        });
    } else {
        predicted = linear;
        low = Math.max(minPrice, Math.round(predicted - 1.5 * model.rmse));
        high = Math.round(predicted + 1.5 * model.rmse);
        baseText = `+${Math.round(model.intercept).toLocaleString()}`;
        contributions = features.map((key, i) => {
            const value = Math.round(encoded[i] * model.coefficients[i]);
            return { label: schema.featureLabels[key] || key, positive: value >= 0, text: `${value >= 0 ? '+' : ''}${value.toLocaleString()}` };
        });
    }
    const price = Math.max(minPrice, Math.round(predicted));
    // When the minimum price kicks in, keep the range from inverting (low > high)
    high = Math.max(high, price);

    // Fewer than MIN_COMPARABLE past clients at least this large (or small) → the model has little to go on
    const MIN_COMPARABLE = 3;
    const rangeWarnings = features.filter(key => model.featureValues[key]).map(key => {
        const el = document.getElementById(`calc-${key}`);
        const val = el ? parseFloat(el.value) || 0 : 0;
        const history = model.featureValues[key];
        const label = schema.featureLabels[key] || key;
        const atLeast = history.filter(v => v >= val).length;
        const atMost = history.filter(v => v <= val).length;
        if (atLeast < MIN_COMPARABLE) return `${label} ${val.toLocaleString()}: only ${atLeast} past client${atLeast === 1 ? ' is' : 's are'} this large (max ${Math.max(...history).toLocaleString()})`;
        if (atMost < MIN_COMPARABLE) return `${label} ${val.toLocaleString()}: only ${atMost} past client${atMost === 1 ? ' is' : 's are'} this small (min ${Math.min(...history).toLocaleString()})`;
        return null;
    }).filter(Boolean);
    const warningHtml = rangeWarnings.length > 0 ? `
      <div class="price-warning">
        <div class="price-warning-title">Outside the range of the historical data — treat this estimate as indicative and review it individually</div>
        ${rangeWarnings.map(w => `<div>${w}</div>`).join('')}
      </div>` : '';

    document.getElementById('calc-result').innerHTML = `
    <div class="calc-result-main">
      <div class="price-display">
        <div class="price-label">${SCHEMAS[svcType].label} — indicative fee</div>
        <div class="price-amount">NT$${price.toLocaleString()}</div>
        <div class="price-unit">${SCHEMAS[svcType].priceUnit}</div>
      </div>
      ${warningHtml}
      <div class="price-range" style="width:100%">
        <div class="price-range-label">Suggested range (±1.5σ)</div>
        <div class="price-range-value">NT$${low.toLocaleString()} – NT$${high.toLocaleString()}</div>
      </div>
      <div class="factor-breakdown" style="width:100%">
        <div class="factor-breakdown-title">Contribution by factor${model.logModel ? ' (vs. the median client)' : ''}</div>
        <div class="factor-breakdown-list">
          <div class="factor-row">
            <span class="factor-row-name">${model.logModel ? 'Median client fee' : 'Base fee'}</span>
            <span class="factor-row-contribution contribution-base">${baseText}</span>
          </div>
          ${contributions.map(c => {
        const cls = c.positive ? 'contribution-pos' : 'contribution-neg';
        return `<div class="factor-row">
              <span class="factor-row-name">${c.label}</span>
              <span class="factor-row-contribution ${cls}">${c.text}</span>
            </div>`;
    }).join('')}
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// 12. TAB & SERVICE SWITCHING
// ──────────────────────────────────────────────

function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.toggle('active', el.id === `panel-${tab}`));
}

function switchService(panel, svc) {
    state.activeService[panel] = svc;
    const prefix = panel === 'data' ? '' : panel === 'analysis' ? 'analysis-' : 'calc-';
    document.querySelectorAll(`#${panel === 'data' ? 'panel-data' : panel === 'analysis' ? 'panel-analysis' : 'panel-calculator'} .svc-btn`)
        .forEach(el => el.classList.toggle('active', el.dataset.svc === svc));

    if (panel === 'data') renderTable(svc);
    if (panel === 'analysis') { /* user will re-press run */ }
    if (panel === 'calculator') buildCalculatorForm(svc);
}

// ──────────────────────────────────────────────
// 13. INIT
// ──────────────────────────────────────────────

function init() {
    loadData();
    renderTable('bookkeeping');
    buildCalculatorForm('bookkeeping');

    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Service toggles — data panel
    document.getElementById('svc-bookkeeping').addEventListener('click', () => switchService('data', 'bookkeeping'));
    document.getElementById('svc-audit').addEventListener('click', () => switchService('data', 'audit'));

    // Service toggles — analysis panel
    document.getElementById('analysis-svc-bookkeeping').addEventListener('click', () => switchService('analysis', 'bookkeeping'));
    document.getElementById('analysis-svc-audit').addEventListener('click', () => switchService('analysis', 'audit'));

    // Service toggles — calculator panel
    document.getElementById('calc-svc-bookkeeping').addEventListener('click', () => switchService('calculator', 'bookkeeping'));
    document.getElementById('calc-svc-audit').addEventListener('click', () => switchService('calculator', 'audit'));

    // Add record
    document.getElementById('btn-add-record').addEventListener('click', () => openAddModal(state.activeService.data));
    document.getElementById('btn-add-record-empty').addEventListener('click', () => openAddModal(state.activeService.data));

    // Modal
    document.getElementById('btn-modal-save').addEventListener('click', saveRecord);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) closeModal();
    });

    // CSV Import
    document.getElementById('csv-import').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) { importCSV(file, state.activeService.data); e.target.value = ''; }
    });

    // Export / Download
    document.getElementById('btn-export-csv').addEventListener('click', () => exportCSV(state.activeService.data));
    document.getElementById('btn-dl-bookkeeping-template').addEventListener('click', () => downloadTemplate('bookkeeping'));
    document.getElementById('btn-dl-audit-template').addEventListener('click', () => downloadTemplate('audit'));

    // Demo data
    document.getElementById('btn-load-demo').addEventListener('click', () => {
        const svc = state.activeService.data;
        if (state.data[svc].length > 0 && !confirm(`Add ${DEMO_DATA[svc].length} sample records to the existing data?`)) return;
        state.data[svc] = [...state.data[svc], ...DEMO_DATA[svc].map(r => ({ ...r, id: uid() }))];
        saveData();
        renderTable(svc);
        showToast(`Loaded ${DEMO_DATA[svc].length} sample records`);
    });

    // Clear data
    document.getElementById('btn-clear-data').addEventListener('click', () => clearData(state.activeService.data));

    // Run analysis
    document.getElementById('btn-run-analysis').addEventListener('click', runAnalysis);
    document.getElementById('btn-export-gap').addEventListener('click', exportGapCSV);

    // Calculate price
    document.getElementById('btn-calculate').addEventListener('click', calculatePrice);

    // Google Sheets import
    document.getElementById('btn-gs-open').addEventListener('click', () => {
        const panel = document.getElementById('gs-panel');
        panel.classList.contains('open') ? closeGsPanel() : openGsPanel();
    });
    document.getElementById('btn-gs-cancel').addEventListener('click', closeGsPanel);
    document.getElementById('btn-gs-confirm').addEventListener('click', importFromGoogleSheets);
    document.getElementById('gs-url').addEventListener('keydown', e => {
        if (e.key === 'Enter') importFromGoogleSheets();
        if (e.key === 'Escape') closeGsPanel();
    });
}

document.addEventListener('DOMContentLoaded', init);
