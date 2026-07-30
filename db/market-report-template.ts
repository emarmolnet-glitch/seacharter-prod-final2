import type { MarketReportData } from "./market-report.js";

export function buildMarketReportHtmlTemplate(data: MarketReportData): string {
  const formattedDate = new Date(data.generatedAt).toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Convert markdown-style **bold** text in executive narrative to <strong>
  const formattedNarrative = (data.executiveNarrative || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  const categoryRows = data.categories
    .map((cat) => {
      const trendSign = cat.weeklyTrendPercent >= 0 ? "+" : "";
      const trendClass = cat.weeklyTrendPercent >= 0 ? "trend-up" : "trend-down";
      const riskClass =
        cat.riskStatus === "ALTO RIESGO"
          ? "badge-risk-high"
          : cat.riskStatus === "PRECAUCIÓN"
          ? "badge-risk-warn"
          : "badge-risk-ok";

      return `
      <tr>
        <td class="col-cat">
          <strong>${cat.category}</strong>
          <div class="sub-text">${cat.primaryRoutes.join(" · ")}</div>
        </td>
        <td class="col-vessel">${cat.dominantVesselType}</td>
        <td class="col-num"><strong>$ ${cat.avgFreightGrossPerTon.toFixed(2)}</strong> /TM</td>
        <td class="col-num ${trendClass}">${trendSign}${cat.weeklyTrendPercent.toFixed(1)}%</td>
        <td class="col-num">$ ${cat.avgTcePerDay.toLocaleString("en-US")} /día</td>
        <td class="col-center"><span class="sim-pill">${cat.simulationCount}</span></td>
        <td class="col-center"><span class="badge ${riskClass}">${cat.riskStatus}</span></td>
      </tr>
    `;
    })
    .join("");

  const jwcRows = data.riskAlerts.jwcZones
    .map(
      (z) => `
      <div class="risk-card risk-card-jwc">
        <div class="risk-card-header">
          <span class="risk-title"><i class="icon">🛡️</i> ${z.zone}</span>
          <span class="badge ${z.level === "CRÍTICO" ? "badge-risk-high" : "badge-risk-warn"}">${z.level}</span>
        </div>
        <div class="risk-desc">${z.surchargeDesc}</div>
        <div class="risk-impact">Sobrecoste estimado: <strong>+$${z.impactPerTon.toFixed(2)}/TM</strong></div>
      </div>
    `
    )
    .join("");

  const congestionRows = data.riskAlerts.portCongestion
    .map(
      (p) => `
      <div class="risk-card risk-card-port">
        <div class="risk-card-header">
          <span class="risk-title"><i class="icon">⚓</i> ${p.port}</span>
          <span class="badge ${p.status === "CONGESTIONADO" ? "badge-risk-high" : "badge-risk-warn"}">${p.status}</span>
        </div>
        <div class="risk-desc">Tiempo medio de espera antes de atraque: <strong>${p.waitingDaysAvg} días</strong></div>
        <div class="risk-impact">Impacto TCE en armador: <strong>${p.impactTcePerDay} USD/día</strong></div>
      </div>
    `
    )
    .join("");

  const thermometerClass =
    data.thermometer.statusLabel === "ALTO RIESGO DE REPOSICIONAMIENTO"
      ? "thermometer-high"
      : data.thermometer.statusLabel === "MODERADO"
      ? "thermometer-warn"
      : "thermometer-ok";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>SeaCharter Core PRO - Market Report - ${data.reportId}</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      font-size: 10pt;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Top Accent Line */
    .top-accent-line {
      height: 4px;
      background: linear-gradient(90deg, #00875A 0%, #0284C7 50%, #0F172A 100%);
    }

    /* Clean Light Header */
    .header {
      background: #FFFFFF;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #E2E8F0;
    }
    .header-logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo-badge {
      width: 42px;
      height: 42px;
      background: #ECFDF5;
      border: 1.5px solid #10B981;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: #00875A;
      font-size: 16px;
      letter-spacing: -0.5px;
    }
    .header-brand h1 {
      font-size: 15pt;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.2px;
      text-transform: uppercase;
    }
    .header-brand p {
      font-size: 8.5pt;
      color: #0284C7;
      font-weight: 600;
    }
    .header-meta {
      text-align: right;
    }
    .header-report-id {
      display: inline-block;
      background: #F0F9FF;
      border: 1px solid #BAE6FD;
      padding: 3px 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 8.5pt;
      font-weight: 800;
      color: #0284C7;
      margin-bottom: 3px;
    }
    .header-date {
      font-size: 7.5pt;
      color: #64748B;
      font-weight: 500;
    }

    .container {
      padding: 16px 20px;
    }

    /* KPI Summary Row - Clean White Cards with Subtle Top Accent */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-top: 3px solid #00875A;
      border-radius: 6px;
      padding: 10px 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }
    .kpi-card-blue {
      border-top-color: #0284C7;
    }
    .kpi-card-slate {
      border-top-color: #334155;
    }
    .kpi-card-amber {
      border-top-color: #D97706;
    }
    .kpi-label {
      font-size: 7pt;
      text-transform: uppercase;
      font-weight: 800;
      color: #64748B;
      letter-spacing: 0.5px;
    }
    .kpi-value {
      font-size: 13.5pt;
      font-weight: 900;
      color: #0F172A;
      margin-top: 2px;
      font-family: monospace;
    }
    .kpi-sub {
      font-size: 7pt;
      color: #059669;
      font-weight: 600;
      margin-top: 2px;
    }

    /* Section Titles */
    .section-title {
      font-size: 10pt;
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
      border-bottom: 1.5px solid #E2E8F0;
      padding-bottom: 4px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: 0.3px;
    }
    .section-title::before {
      content: "";
      display: inline-block;
      width: 6px;
      height: 12px;
      background: #00875A;
      border-radius: 2px;
    }

    /* Editorial Executive Summary Note Box */
    .exec-summary-box {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-left: 4px solid #00875A;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 18px;
      font-size: 9pt;
      color: #1E293B;
      line-height: 1.55;
    }
    .exec-summary-box strong {
      color: #0F172A;
    }

    /* Multi-Category Table - Clean Light Header */
    .table-wrapper {
      margin-bottom: 18px;
    }
    table.market-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
    }
    table.market-table th {
      background: #F1F5F9;
      color: #1E293B;
      text-align: left;
      padding: 8px 10px;
      font-size: 7.5pt;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0.3px;
      border-bottom: 2px solid #CBD5E1;
    }
    table.market-table th.col-num {
      text-align: right;
    }
    table.market-table th.col-center {
      text-align: center;
    }
    table.market-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #E2E8F0;
      vertical-align: middle;
      color: #1E293B;
    }
    table.market-table tr:nth-child(even) td {
      background: #F8FAFC;
    }
    .col-cat strong {
      color: #0F172A;
      font-size: 9pt;
    }
    .sub-text {
      font-size: 7pt;
      color: #64748B;
      margin-top: 1px;
    }
    .col-vessel {
      font-size: 8pt;
      color: #334155;
      font-weight: 600;
    }
    .trend-up {
      color: #16A34A;
      font-weight: 800;
    }
    .trend-down {
      color: #DC2626;
      font-weight: 800;
    }
    .sim-pill {
      background: #F0F9FF;
      color: #0284C7;
      border: 1px solid #BAE6FD;
      padding: 1px 7px;
      border-radius: 10px;
      font-weight: 800;
      font-size: 7.5pt;
    }

    /* Status Badges */
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 800;
      text-transform: uppercase;
    }
    .badge-risk-ok {
      background: #ECFDF5;
      color: #15803D;
      border: 1px solid #A7F3D0;
    }
    .badge-risk-warn {
      background: #FEF3C7;
      color: #B45309;
      border: 1px solid #FDE68A;
    }
    .badge-risk-high {
      background: #FEE2E2;
      color: #B91C1C;
      border: 1px solid #FECACA;
    }

    /* Thermometer Block */
    .thermometer-container {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 18px;
    }
    .thermometer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .thermometer-title {
      font-size: 9pt;
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
    }
    .gauge-bar-bg {
      height: 12px;
      background: #E2E8F0;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      margin-bottom: 6px;
    }
    .gauge-bar-fill {
      height: 100%;
      border-radius: 6px;
    }
    .thermometer-ok .gauge-bar-fill {
      background: linear-gradient(90deg, #10B981, #059669);
      width: ${data.thermometer.repositioningEfficiencyScore}%;
    }
    .thermometer-warn .gauge-bar-fill {
      background: linear-gradient(90deg, #F59E0B, #D97706);
      width: ${data.thermometer.repositioningEfficiencyScore}%;
    }
    .thermometer-high .gauge-bar-fill {
      background: linear-gradient(90deg, #EF4444, #B91C1C);
      width: ${data.thermometer.repositioningEfficiencyScore}%;
    }
    .gauge-labels {
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #64748B;
      font-weight: 700;
      text-transform: uppercase;
    }
    .thermometer-desc {
      font-size: 8pt;
      color: #475569;
      margin-top: 6px;
    }

    /* Risk Grid */
    .risk-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .risk-column-title {
      font-size: 8.5pt;
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
      margin-bottom: 6px;
      padding-bottom: 2px;
      border-bottom: 1px solid #CBD5E1;
    }
    .risk-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-left: 4px solid #F59E0B;
      border-radius: 6px;
      padding: 9px 11px;
      margin-bottom: 6px;
    }
    .risk-card-jwc {
      border-left-color: #EF4444;
    }
    .risk-card-port {
      border-left-color: #0284C7;
    }
    .risk-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .risk-title {
      font-size: 8pt;
      font-weight: 800;
      color: #0F172A;
    }
    .risk-desc {
      font-size: 7.5pt;
      color: #475569;
      margin-bottom: 3px;
    }
    .risk-impact {
      font-size: 7.5pt;
      color: #0F172A;
    }

    /* Footer - Clean Light Footer */
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7pt;
      color: #64748B;
    }
    .footer-left strong {
      color: #00875A;
    }
  </style>
</head>
<body>

  <div class="top-accent-line"></div>
  <header class="header">
    <div class="header-logo-group">
      <div class="header-logo-badge">SC</div>
      <div class="header-brand">
        <h1>SeaCharter Core PRO</h1>
        <p>Maritime Intelligence & Market Analytics Engine</p>
      </div>
    </div>
    <div class="header-meta">
      <div class="header-report-id">${data.reportId}</div>
      <div class="header-date">Emisión: ${formattedDate}</div>
      <div class="header-date">Periodo analizado: ${data.periodStart} al ${data.periodEnd}</div>
    </div>
  </header>

  <div class="container">

    <!-- KPI Row -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Flete Promedio Gross</div>
        <div class="kpi-value">$ ${data.globalAvgFreightGross.toFixed(2)}</div>
        <div class="kpi-sub">$/TM (All-In FIOST)</div>
      </div>
      <div class="kpi-card kpi-card-blue">
        <div class="kpi-label">TCE Promedio Global</div>
        <div class="kpi-value">$ ${data.globalAvgTce.toLocaleString("en-US")}</div>
        <div class="kpi-sub">USD / día de navegación</div>
      </div>
      <div class="kpi-card kpi-card-slate">
        <div class="kpi-label">Simulaciones Auditadas</div>
        <div class="kpi-value">${data.totalSimulations}</div>
        <div class="kpi-sub">5 categorías de carga</div>
      </div>
      <div class="kpi-card kpi-card-amber">
        <div class="kpi-label">Alertas Activas (DSS)</div>
        <div class="kpi-value">${data.totalActiveBallastAlerts + data.totalActiveJwcAlerts}</div>
        <div class="kpi-sub">Lastre (${data.totalActiveBallastAlerts}) · JWC (${data.totalActiveJwcAlerts})</div>
      </div>
    </div>

    <!-- Resumen Ejecutivo y Nota Editorial Analítica -->
    <div class="section-title">Resumen Ejecutivo de Mercado & Nota Editorial</div>
    <div class="exec-summary-box">
      ${formattedNarrative}
    </div>

    <!-- Tabla Índice Multicategoría -->
    <div class="section-title">Índice Multicategoría y Tendencias Semanales</div>
    <div class="table-wrapper">
      <table class="market-table">
        <thead>
          <tr>
            <th>Categoría de Carga / Rutas Principales</th>
            <th>Tipo de Buque Dominante</th>
            <th class="col-num">Flete Gross ($/TM)</th>
            <th class="col-num">Tendencia Semanal</th>
            <th class="col-num">TCE Promedio ($/día)</th>
            <th class="col-center">Simulaciones</th>
            <th class="col-center">Estado de Riesgo</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    </div>

    <!-- Termómetro Operativo y Reposicionamiento -->
    <div class="section-title">Termómetro Operativo y Reposicionamiento (DSS Auto-Ballast)</div>
    <div class="thermometer-container ${thermometerClass}">
      <div class="thermometer-header">
        <span class="thermometer-title">Eficiencia de Flujo de Reposicionamiento: ${data.thermometer.repositioningEfficiencyScore} / 100</span>
        <span class="badge ${data.thermometer.statusLabel === "ALTO RIESGO DE REPOSICIONAMIENTO" ? "badge-risk-high" : data.thermometer.statusLabel === "MODERADO" ? "badge-risk-warn" : "badge-risk-ok"}">
          ${data.thermometer.statusLabel}
        </span>
      </div>
      <div class="gauge-bar-bg">
        <div class="gauge-bar-fill"></div>
      </div>
      <div class="gauge-labels">
        <span>0% Alto Lastre</span>
        <span>Ratio de Reposicionamiento Actual: ${data.thermometer.ballastRatioPercent}%</span>
        <span>100% Eficiencia Óptima</span>
      </div>
      <div class="thermometer-desc">
        ${data.thermometer.description}
      </div>
    </div>

    <!-- Alertas de Riesgo -->
    <div class="section-title">Bloque de Alertas de Riesgo y Sobrecostos Operativos</div>
    <div class="risk-grid">
      <div>
        <div class="risk-column-title">Primas de Guerra y Zonas ZWC (Joint War Committee)</div>
        ${jwcRows}
      </div>
      <div>
        <div class="risk-column-title">Congestión Portuaria y Tiempos de Espera</div>
        ${congestionRows}
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-left">
        <strong>SeaCharter Core PRO</strong> · Engine de Inteligencia Marítima & Analytics
      </div>
      <div class="footer-right">
        Informe certificado de inteligencia de mercado · Sello de Auditoría Autenticado
      </div>
    </footer>

  </div>

</body>
</html>`;
}
