/* ============================================================
   CPA Pricing Analytics — Portfolio Edition  |  app.js
   ============================================================ */

'use strict';

// ──────────────────────────────────────────────
// 1. SCHEMA DEFINITIONS
// ──────────────────────────────────────────────

const INDUSTRIES = {
    1: '服務業', 2: '批發零售', 3: '製造業',
    4: '建設業', 5: '金融業', 6: '其他', 7: '控股投資公司', 8: '投資顧問業'
};

const REVENUE_LEVELS = {
    1: '50萬以下', 2: '50-200萬', 3: '200-500萬',
    4: '500萬-1億', 5: '1億以上'
};

// 最低起價設定
const MIN_PRICE = { bookkeeping: 2000, audit: 30000 };

const AUDIT_RISK = { 1: '低', 2: '中', 3: '高' };

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
        label: '每月記帳',
        priceUnit: '元/月',
        fields: [
            { key: 'company', label: '委任公司名稱', type: 'text', required: true },
            { key: 'date', label: '委任年月', type: 'month', required: true },
            { key: 'monthly_vouchers', label: '每月憑證數量（張）', type: 'number', required: true, min: 0 },
            { key: 'revenue_level', label: '月營業額等級', type: 'select', required: true, options: REVENUE_LEVELS },
            { key: 'employee_count', label: '員工人數', type: 'number', required: true, min: 0 },
            { key: 'industry', label: '行業類別', type: 'select', required: true, options: INDUSTRIES },
            { key: 'add_tax_vat', label: '附加稅務申報（營業稅）', type: 'bool', required: false },
            { key: 'add_tax_withholding', label: '附加稅務申報（各類所得扣繳）', type: 'bool', required: false },
            { key: 'add_invoice', label: '附加發票開立', type: 'bool', required: false },
            { key: 'add_payroll', label: '附加薪資代算', type: 'bool', required: false },
            { key: 'staff_quality', label: '會計人員素質', type: 'quality', required: true },
            { key: 'major_tax_issue', label: '重大稅務調整事項', type: 'bool', required: false },
            { key: 'price', label: '月費報價（元）', type: 'number', required: true, min: 0 },
        ],
        // Fields used in regression (exclude identifiers)
        regressionFeatures: [
            'monthly_vouchers', 'revenue_level', 'employee_count', 'industry',
            'add_tax_vat', 'add_tax_withholding', 'add_invoice', 'add_payroll', 'staff_quality', 'major_tax_issue'
        ],
        featureLabels: {
            monthly_vouchers: '月憑證數', revenue_level: '月營業額等級',
            employee_count: '員工人數', industry: '行業別加權',
            add_tax_vat: '附加稅務申報（營業稅）', add_tax_withholding: '附加稅務申報（扣繳）',
            add_invoice: '附加發票開立',
            add_payroll: '附加薪資代算', staff_quality: '會計素質（反向）',
            major_tax_issue: '重大稅務調整'
        }
    },
    audit: {
        label: '稅務簽證（年度）',
        priceUnit: '元/年',
        fields: [
            { key: 'company', label: '委任公司名稱', type: 'text', required: true },
            { key: 'date', label: '委任年月', type: 'month', required: true },
            { key: 'total_assets', label: '資產總額（萬元）', type: 'number', required: true, min: 0, hint: 'wan' },
            { key: 'annual_revenue', label: '年度營業額（萬元）', type: 'number', required: true, min: 0, hint: 'wan' },
            { key: 'industry', label: '行業類別', type: 'select', required: true, options: INDUSTRIES },
            { key: 'subsidiary_count', label: '子/關係公司數量', type: 'number', required: true, min: 0 },
            { key: 'first_audit', label: '是否首次查核', type: 'bool', required: false },
            { key: 'staff_quality', label: '會計人員素質', type: 'quality', required: true },
            { key: 'major_tax_issue', label: '重大稅務調整事項', type: 'bool', required: false },
            { key: 'financial_audit', label: '財務簽核（財報查核）', type: 'bool', required: false },
            { key: 'audit_risk', label: '查帳風險', type: 'select', required: true, options: AUDIT_RISK },
            { key: 'price', label: '年度報價（元）', type: 'number', required: true, min: 0 },
        ],
        // NOTE: first_audit & major_tax_issue temporarily excluded (near-zero coefficients with n=15)
        // Re-add when data reaches 25+ records
        regressionFeatures: [
            'total_assets', 'annual_revenue', 'industry', 'subsidiary_count',
            'staff_quality', 'financial_audit', 'audit_risk'
        ],
        featureLabels: {
            total_assets: '資產總額', annual_revenue: '年度營業額',
            industry: '行業別加權', subsidiary_count: '關係公司數',
            first_audit: '首次查核', staff_quality: '會計素質（反向）',
            major_tax_issue: '重大稅務調整', financial_audit: '財務簽核',
            audit_risk: '查帳風險'
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
 * Encode a record's features for regression.
 * Industry is treated as a numeric "complexity weight" (3=製造, etc.)
 * Staff quality is inverted: lower quality = more effort = higher price
 */
function encodeFeatures(record, features) {
    const INDUSTRY_WEIGHT = { 1: 1, 2: 1.5, 3: 2.5, 4: 2, 5: 3, 6: 1, 7: 2, 8: 2.5 };
    return features.map(key => {
        const v = parseFloat(record[key]) || 0;
        if (key === 'industry') return INDUSTRY_WEIGHT[v] || 1;
        if (key === 'staff_quality') return (11 - v); // invert: lower quality → higher number → positive coefficient
        return v;
    });
}

function runRegression(svcType) {
    const schema = SCHEMAS[svcType];
    const records = state.data[svcType];
    const features = schema.regressionFeatures;

    if (records.length < 3) return null;

    const X = records.map(r => encodeFeatures(r, features));
    const y = records.map(r => parseFloat(r.price));

    const result = multipleLinearRegression(X, y);
    if (!result) return null;
    result.features = features;
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
        { id: uid(), company: 'Maple Technology (Demo)', date: '2022-12', total_assets: 8000, annual_revenue: 15000, industry: 1, subsidiary_count: 0, first_audit: 0, staff_quality: 8, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 60000 },
        { id: uid(), company: 'Northstar Manufacturing (Demo)', date: '2022-12', total_assets: 20000, annual_revenue: 30000, industry: 3, subsidiary_count: 2, first_audit: 0, staff_quality: 6, major_tax_issue: 1, financial_audit: 0, audit_risk: 2, price: 120000 },
        { id: uid(), company: 'Orchid Construction (Demo)', date: '2023-01', total_assets: 50000, annual_revenue: 20000, industry: 4, subsidiary_count: 3, first_audit: 1, staff_quality: 4, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 200000 },
        { id: uid(), company: 'Pine Retail Group (Demo)', date: '2023-02', total_assets: 5000, annual_revenue: 12000, industry: 2, subsidiary_count: 1, first_audit: 0, staff_quality: 7, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 50000 },
        { id: uid(), company: 'Quartz Financial (Demo)', date: '2023-03', total_assets: 200000, annual_revenue: 50000, industry: 5, subsidiary_count: 5, first_audit: 0, staff_quality: 9, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 350000 },
        { id: uid(), company: 'Riverstone Foods (Demo)', date: '2023-04', total_assets: 12000, annual_revenue: 18000, industry: 3, subsidiary_count: 1, first_audit: 1, staff_quality: 5, major_tax_issue: 0, financial_audit: 0, audit_risk: 2, price: 90000 },
        { id: uid(), company: 'Silverline Electronics (Demo)', date: '2023-05', total_assets: 30000, annual_revenue: 40000, industry: 1, subsidiary_count: 2, first_audit: 0, staff_quality: 7, major_tax_issue: 1, financial_audit: 0, audit_risk: 2, price: 150000 },
        { id: uid(), company: 'Tideway Properties (Demo)', date: '2023-06', total_assets: 80000, annual_revenue: 25000, industry: 4, subsidiary_count: 4, first_audit: 0, staff_quality: 3, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 280000 },
        { id: uid(), company: 'Umbra Commerce (Demo)', date: '2023-07', total_assets: 9000, annual_revenue: 22000, industry: 2, subsidiary_count: 0, first_audit: 0, staff_quality: 8, major_tax_issue: 0, financial_audit: 0, audit_risk: 1, price: 55000 },
        { id: uid(), company: 'Valley Forge Machinery (Demo)', date: '2023-08', total_assets: 45000, annual_revenue: 60000, industry: 3, subsidiary_count: 3, first_audit: 1, staff_quality: 6, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 230000 },
        { id: uid(), company: 'Willow Engineering (Demo)', date: '2023-09', total_assets: 15000, annual_revenue: 10000, industry: 1, subsidiary_count: 0, first_audit: 1, staff_quality: 7, major_tax_issue: 0, financial_audit: 0, audit_risk: 2, price: 70000 },
        { id: uid(), company: 'Zenith Development (Demo)', date: '2023-10', total_assets: 100000, annual_revenue: 35000, industry: 4, subsidiary_count: 6, first_audit: 0, staff_quality: 5, major_tax_issue: 1, financial_audit: 1, audit_risk: 3, price: 310000 },
    ]
};

function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// 萬元即時換算顯示
function formatWan(wan) {
    const n = parseFloat(wan);
    if (!n || isNaN(n) || n <= 0) return '';
    if (n >= 10000) return `≈ NT$ ${(n / 10000).toFixed(2)} 億`;
    if (n >= 1000) return `≈ NT$ ${(n / 1000).toFixed(1)} 千萬`;
    return `≈ NT$ ${n.toLocaleString()} 萬`;
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
    { key: 'company', label: '公司名稱' },
    { key: 'date', label: '日期' },
    { key: 'monthly_vouchers', label: '月憑證數' },
    { key: 'revenue_level', label: '月營業額', render: v => REVENUE_LEVELS[v] || v },
    { key: 'employee_count', label: '員工數' },
    { key: 'industry', label: '行業', render: v => INDUSTRIES[v] || v },
    { key: 'staff_quality', label: '會計素質', render: v => renderQuality(v) },
    { key: 'major_tax_issue', label: '重大稅務', render: v => v == 1 ? '⚠️ 有' : '—' },
    { key: 'add_tax_vat', label: '+營業稅', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_tax_withholding', label: '+扣繳', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_invoice', label: '+發票', render: v => v == 1 ? '✓' : '—' },
    { key: 'add_payroll', label: '+薪資', render: v => v == 1 ? '✓' : '—' },
    { key: 'price', label: '月費（元）', render: v => `<span class="price-cell">${Number(v).toLocaleString()}</span>` },
];

const TABLE_COLUMNS_AUDIT = [
    { key: 'company', label: '公司名稱' },
    { key: 'date', label: '日期' },
    { key: 'total_assets', label: '資產（萬）', render: v => Number(v).toLocaleString() },
    { key: 'annual_revenue', label: '營收（萬）', render: v => Number(v).toLocaleString() },
    { key: 'industry', label: '行業', render: v => INDUSTRIES[v] || v },
    { key: 'subsidiary_count', label: '關係公司數' },
    { key: 'first_audit', label: '首次查核', render: v => v == 1 ? '⭐ 是' : '—' },
    { key: 'staff_quality', label: '會計素質', render: v => renderQuality(v) },
    { key: 'major_tax_issue', label: '重大稅務', render: v => v == 1 ? '⚠️ 有' : '—' },
    { key: 'financial_audit', label: '財務簽核', render: v => v == 1 ? '✓' : '—' },
    { key: 'audit_risk', label: '查帳風險', render: v => ({ 1: '🟢 低', 2: '🟡 中', 3: '🔴 高' })[v] || v },
    { key: 'price', label: '年度報價（元）', render: v => `<span class="price-cell">${Number(v).toLocaleString()}</span>` },
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

    thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;

    if (records.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'flex';
        countEl.textContent = '共 0 筆';
        return;
    }

    emptyState.style.display = 'none';
    countEl.textContent = `共 ${records.length} 筆`;

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
          <button class="btn-icon" onclick="openEditModal('${record.id}','${svcType}')" title="編輯">✏️</button>
          <button class="btn-icon delete" onclick="deleteRecord('${record.id}','${svcType}')" title="刪除">🗑️</button>
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
            input = `<select class="form-select" id="field-${field.key}" name="${field.key}" ${field.required ? 'required' : ''}><option value="">請選擇</option>${options}</select>`;
        } else if (field.type === 'quality') {
            const qOptions = Array.from({ length: 10 }, (_, i) => {
                const score = 10 - i;
                return `<option value="${score}" ${val == score ? 'selected' : ''}>${QUALITY_LABELS[score]}（${score}分）</option>`;
            }).join('');
            input = `<select class="form-select" id="field-${field.key}" name="${field.key}" ${field.required ? 'required' : ''}><option value="">請選擇</option>${qOptions}</select>`;
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
    document.getElementById('modal-title').textContent = `新增${SCHEMAS[svcType].label}案件`;
    document.getElementById('record-form').innerHTML = buildFormFields(svcType);
    document.getElementById('modal-overlay').classList.add('open');
}

function openEditModal(id, svcType) {
    const record = state.data[svcType].find(r => r.id === id);
    if (!record) return;
    state.editingId = id;
    document.getElementById('modal-title').textContent = `編輯案件 — ${record.company}`;
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
                showToast(`請填寫「${field.label}」`, 'error');
                el.focus();
                return;
            }
            data[field.key] = field.type === 'number' ? parseFloat(el.value) || 0 : el.value;
        }
    }

    if (state.editingId) {
        const idx = state.data[svcType].findIndex(r => r.id === state.editingId);
        state.data[svcType][idx] = { ...data, id: state.editingId };
        showToast('案件已更新 ✅');
    } else {
        state.data[svcType].push({ ...data, id: uid() });
        showToast('案件已新增 ✅');
    }

    saveData();
    closeModal();
    renderTable(svcType);
}

function deleteRecord(id, svcType) {
    if (!confirm('確定要刪除這筆案件嗎？')) return;
    state.data[svcType] = state.data[svcType].filter(r => r.id !== id);
    saveData();
    renderTable(svcType);
    showToast('案件已刪除', 'info');
}

// ──────────────────────────────────────────────
// 9. CSV IMPORT / EXPORT
// ──────────────────────────────────────────────

function importCSV(file, svcType) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const schema = SCHEMAS[svcType];
            const imported = results.data.map(row => {
                const record = { id: uid() };
                for (const field of schema.fields) {
                    const raw = row[field.key];
                    if (field.type === 'number' || field.type === 'select' || field.type === 'quality') {
                        record[field.key] = parseFloat(raw) || 0;
                    } else if (field.type === 'bool') {
                        record[field.key] = (raw === '1' || raw === 'true' || raw === '是') ? 1 : 0;
                    } else {
                        record[field.key] = raw || '';
                    }
                }
                return record;
            });
            state.data[svcType].push(...imported);
            saveData();
            renderTable(svcType);
            showToast(`成功匯入 ${imported.length} 筆${SCHEMAS[svcType].label}數據 ✅`);
        },
        error: () => showToast('CSV 解析失敗，請確認格式正確', 'error')
    });
}

function exportCSV(svcType) {
    const schema = SCHEMAS[svcType];
    const records = state.data[svcType];
    if (records.length === 0) { showToast('目前無數據可匯出', 'info'); return; }
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
    a.download = `princess_cpa_${svcType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 已匯出 ✅');
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
    if (!url) { showToast('請貼上 Google Sheets 網址', 'error'); return; }

    // Auto-convert edit URL → publish CSV URL
    if (!url.includes('/pub') && !url.includes('output=csv')) {
        const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch) {
            url = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/pub?output=csv`;
        } else {
            showToast('網址格式不正確，請確認是 Google Sheets 網址', 'error');
            return;
        }
    }

    showToast('正在從 Google Sheets 抓取數據⋯', 'info');
    const btn = document.getElementById('btn-gs-confirm');
    btn.disabled = true;
    btn.textContent = '抓取中⋯';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();

        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const schema = SCHEMAS[svcType];
                const imported = results.data.map(row => {
                    const record = { id: uid() };
                    for (const field of schema.fields) {
                        const raw = row[field.key];
                        if (field.type === 'number' || field.type === 'select' || field.type === 'quality') {
                            record[field.key] = parseFloat(raw) || 0;
                        } else if (field.type === 'bool') {
                            record[field.key] = (raw === '1' || raw === 'true' || raw === '是') ? 1 : 0;
                        } else {
                            record[field.key] = raw || '';
                        }
                    }
                    return record;
                });
                state.data[svcType].push(...imported);
                saveData();
                renderTable(svcType);
                showToast(`成功從 Google Sheets 匯入 ${imported.length} 筆${SCHEMAS[svcType].label}數據 ✅`);
                closeGsPanel();
            }
        });
    } catch (err) {
        showToast('匯入失敗：請確認試算表已「發布到網路」且網址正確', 'error');
        console.error('[GS Import Error]', err);
    } finally {
        btn.disabled = false;
        btn.textContent = '匯入';
    }
}

function downloadTemplate(svcType) {
    const schema = SCHEMAS[svcType];
    const headers = schema.fields.map(f => f.key).join(',');
    const sampleRow = schema.fields.map(f => {
        if (f.type === 'text') return f.key === 'company' ? '範例公司名稱' : '';
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
    showToast(`${SCHEMAS[svcType].label}範本已下載 ✅`);
}

// ──────────────────────────────────────────────
// 10. ANALYSIS RENDERING
// ──────────────────────────────────────────────

function runAnalysis() {
    const svcType = state.activeService.analysis;
    const records = state.data[svcType];
    if (records.length < 5) {
        showToast(`需要至少 5 筆${SCHEMAS[svcType].label}數據才能分析`, 'error');
        return;
    }
    const model = runRegression(svcType);
    if (!model) { showToast('回歸分析失敗，請確認數據格式', 'error'); return; }
    state.models[svcType] = model;
    renderModelSummary(model, svcType);
    renderCoefficients(model, svcType);
    renderFormula(model, svcType);
    renderAnalysisChart(model, records, svcType);
    showToast('回歸分析完成 🎉', 'success');
}

function renderModelSummary(model, svcType) {
    const r2 = (model.rSquared * 100).toFixed(1);
    const adjR2 = model.adjustedRSquared !== null
        ? (model.adjustedRSquared * 100).toFixed(1) + '%'
        : '<span style="font-size:12px;color:#f87171" title="樣本數不足以計算此指標（建議增加數據至少達因子數+2筆以上）">N/A ⚠️</span>';
    const rmse = Math.round(model.rmse).toLocaleString();
    const n = state.data[svcType].length;
    document.getElementById('model-summary-content').innerHTML = `
    <div class="model-stats">
      <div class="stat-item"><div class="stat-label">樣本數</div><div class="stat-value">${n}</div></div>
      <div class="stat-item"><div class="stat-label">Adj. R²</div><div class="stat-value">${adjR2}</div></div>
      <div class="stat-item"><div class="stat-label">RMSE</div><div class="stat-value" style="font-size:16px">${rmse}</div></div>
      <div class="stat-item"><div class="stat-label">R²</div><div class="stat-value">${r2}%</div></div>
    </div>
    <div class="r2-bar-wrap">
      <div class="r2-bar-label"><span>模型解釋力 R²</span><span>${r2}%</span></div>
      <div class="r2-bar"><div class="r2-bar-fill" style="width:0%" id="r2-fill"></div></div>
    </div>`;
    setTimeout(() => {
        const fill = document.getElementById('r2-fill');
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, model.rSquared * 100))}%`;
    }, 50);
}

function renderCoefficients(model, svcType) {
    const schema = SCHEMAS[svcType];
    const maxAbs = Math.max(...model.coefficients.map(Math.abs), 1);
    const items = model.features.map((key, i) => {
        const coef = model.coefficients[i];
        const pct = Math.abs(coef) / maxAbs * 100;
        const isPos = coef >= 0;
        const bar = isPos
            ? `<div class="coef-bar-pos" style="width:${pct}%"></div>`
            : `<div class="coef-bar-neg" style="width:${pct}%"></div>`;
        return `<div class="coef-item">
      <span class="coef-name">${schema.featureLabels[key] || key}</span>
      <div class="coef-bar-wrap">${bar}</div>
      <span class="coef-value ${isPos ? 'positive' : 'negative'}">${isPos ? '+' : ''}${coef.toFixed(1)}</span>
    </div>`;
    }).join('');
    document.getElementById('coefficients-content').innerHTML = `
    <div class="coef-list">
      <div class="coef-item">
        <span class="coef-name">基準報價（截距）</span>
        <div class="coef-bar-wrap"><div class="coef-bar-pos" style="width:30%"></div></div>
        <span class="coef-value contribution-base">${Math.round(model.intercept).toLocaleString()}</span>
      </div>
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
        return `  ${sign} ${Math.abs(coef).toFixed(2)} × [${label}]`;
    }).join('\n');
    document.getElementById('formula-box').innerHTML = `
    <pre style="white-space:pre-wrap;font-size:13px;line-height:1.9;color:#34d399">報價（${unit}）=
  ${Math.round(model.intercept).toLocaleString()}（基準）
${terms}</pre>`;
}

function renderAnalysisChart(model, records, svcType) {
    const actual = records.map(r => parseFloat(r.price));
    const predicted = model.predictions;
    const labels = records.map(r => r.company.slice(0, 8));

    if (state.chart) { state.chart.destroy(); }

    const ctx = document.getElementById('analysis-chart').getContext('2d');
    state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '實際報價',
                    data: actual,
                    backgroundColor: 'rgba(168,85,247,0.6)',
                    borderColor: 'rgba(168,85,247,1)',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: '模型預測',
                    data: predicted,
                    backgroundColor: 'rgba(52,211,153,0.6)',
                    borderColor: 'rgba(52,211,153,1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    type: 'bar',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#a0a0c0', font: { family: 'Inter' } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: NT$${Number(ctx.raw).toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#5a5a7a', maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: {
                    ticks: {
                        color: '#5a5a7a',
                        callback: v => `$${(v / 1000).toFixed(0)}K`
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
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
    const fields = schema.fields.filter(f => f.key !== 'price' && f.key !== 'company' && f.key !== 'date');
    const boolFields = fields.filter(f => f.type === 'bool');
    const otherFields = fields.filter(f => f.type !== 'bool');

    const otherInputs = otherFields.map(field => {
        let input = '';
        if (field.type === 'number') {
            input = `<input class="form-input" type="number" id="calc-${field.key}" min="0" step="any" placeholder="輸入數值" />`;
        } else if (field.type === 'select') {
            const opts = Object.entries(field.options).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
            input = `<select class="form-select" id="calc-${field.key}"><option value="">請選擇</option>${opts}</select>`;
        } else if (field.type === 'quality') {
            const opts = Array.from({ length: 10 }, (_, i) => {
                const s = 10 - i;
                return `<option value="${s}">${QUALITY_LABELS[s]}（${s}分）</option>`;
            }).join('');
            input = `<select class="form-select" id="calc-${field.key}"><option value="">請選擇</option>${opts}</select>`;
        }
        return `<div class="form-group">
      <label class="form-label" for="calc-${field.key}">${field.label}</label>
      ${input}
    </div>`;
    }).join('');

    const boolGrid = boolFields.length > 0 ? `
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">附加條件</label>
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
        showToast('請先在「回歸分析」頁執行分析', 'error');
        return;
    }
    const schema = SCHEMAS[svcType];
    const INDUSTRY_WEIGHT = { 1: 1, 2: 1.5, 3: 2.5, 4: 2, 5: 3, 6: 1, 7: 2, 8: 2.5 };
    const features = schema.regressionFeatures;

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
        if (key === 'industry') return INDUSTRY_WEIGHT[val] || 1;
        if (key === 'staff_quality') return 11 - val;
        return val;
    });

    const predicted = model.intercept + encoded.reduce((s, v, i) => s + v * model.coefficients[i], 0);
    const minPrice = MIN_PRICE[svcType] || 0;
    const price = Math.max(minPrice, Math.round(predicted));
    const rmse = model.rmse;
    const low = Math.max(minPrice, Math.round(predicted - 1.5 * rmse));
    const high = Math.round(predicted + 1.5 * rmse);

    // Factor contributions
    const contributions = model.features.map((key, i) => ({
        label: schema.featureLabels[key] || key,
        value: Math.round(encoded[i] * model.coefficients[i])
    }));

    document.getElementById('calc-result').innerHTML = `
    <div class="calc-result-main">
      <div class="price-display">
        <div class="price-label">${SCHEMAS[svcType].label} — 建議報價</div>
        <div class="price-amount">NT$${price.toLocaleString()}</div>
        <div class="price-unit">${SCHEMAS[svcType].priceUnit}</div>
      </div>
      <div class="price-range" style="width:100%">
        <div class="price-range-label">建議區間（±1.5σ）</div>
        <div class="price-range-value">NT$${low.toLocaleString()} ～ NT$${high.toLocaleString()}</div>
      </div>
      <div class="factor-breakdown" style="width:100%">
        <div class="factor-breakdown-title">各因子貢獻</div>
        <div class="factor-breakdown-list">
          <div class="factor-row">
            <span class="factor-row-name">基準報價</span>
            <span class="factor-row-contribution contribution-base">+${Math.round(model.intercept).toLocaleString()}</span>
          </div>
          ${contributions.map(c => {
        const cls = c.value >= 0 ? 'contribution-pos' : 'contribution-neg';
        const sign = c.value >= 0 ? '+' : '';
        return `<div class="factor-row">
              <span class="factor-row-name">${c.label}</span>
              <span class="factor-row-contribution ${cls}">${sign}${c.value.toLocaleString()}</span>
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
        if (state.data[svc].length > 0 && !confirm(`這將新增${DEMO_DATA[svc].length}筆範例數據（不影響現有數據），確認繼續嗎？`)) return;
        state.data[svc] = [...state.data[svc], ...DEMO_DATA[svc].map(r => ({ ...r, id: uid() }))];
        saveData();
        renderTable(svc);
        showToast(`已載入 ${DEMO_DATA[svc].length} 筆範例數據 🎉`);
    });

    // Run analysis
    document.getElementById('btn-run-analysis').addEventListener('click', runAnalysis);

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
