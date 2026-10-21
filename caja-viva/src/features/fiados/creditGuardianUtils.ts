import type { CuentaPorCobrar } from '../../db/types';

/**
 * Tipos para el Guardián Crediticio
 */
export interface CreditScore {
  score: number; // 0-100
  level: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO' | 'SIN_HISTORIAL';
  factors: {
    paymentHistory: number; // 0-100
    currentDebt: number; // 0-100
    accountAge: number; // 0-100
  };
  details: {
    totalAccounts: number;
    paidAccounts: number;
    partialAccounts: number;
    overdueAccounts: number;
    totalDebt: number;
    averageAmount: number;
  };
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  requestedAmount: number;
  averageHistorical: number;
  threshold: number;
  ratio: number;
  severity: 'NORMAL' | 'AMARILLO' | 'ROJO';
}

export interface CreditSemaphore {
  color: 'VERDE' | 'AMARILLO' | 'ROJO';
  maxSuggestedFiado: number;
  recommendation: string;
  details: {
    score: number;
    currentDebt: number;
    hasOverdue: boolean;
    isNewClient: boolean;
  };
}

export interface GlobalLimitResult {
  limit: number;
  percentage: number;
  capitalActivo: number;
  inventoryValue: number;
  cashFlow: number;
  appliedPercentage: number;
}

export interface GlobalAlertLevel {
  level: 'VERDE' | 'AMARILLO' | 'ROJO';
  percentage: number;
  blocked: boolean;
  message: string;
  currentFiados: number;
  globalLimit: number;
}

export type SalvavidasScriptType = 'FORMAL' | 'BARRIO';

export interface SalvavidasScript {
  script: string;
  type: SalvavidasScriptType;
  clientName: string;
  amount: number;
  riskAssumed: boolean;
}

/**
 * Calcula el score crediticio basado en el historial de cuentas por cobrar
 */
export function calculateCreditScore(
  accounts: CuentaPorCobrar[],
  clientPhone: string
): CreditScore {
  // Filtrar cuentas del cliente
  const clientAccounts = accounts.filter(a => a.cliente_telefono === clientPhone);
  
  if (clientAccounts.length === 0) {
    return {
      score: 50, // Neutral para nuevos clientes
      level: 'SIN_HISTORIAL',
      factors: {
        paymentHistory: 50,
        currentDebt: 50,
        accountAge: 50,
      },
      details: {
        totalAccounts: 0,
        paidAccounts: 0,
        partialAccounts: 0,
        overdueAccounts: 0,
        totalDebt: 0,
        averageAmount: 0,
      },
    };
  }

  const totalAccounts = clientAccounts.length;
  const paidAccounts = clientAccounts.filter(a => a.estado === 'PAGADO').length;
  const partialAccounts = clientAccounts.filter(a => a.estado === 'PARCIAL').length;
  const overdueAccounts = clientAccounts.filter(a => a.estado === 'VENCIDO').length;
  const totalDebt = clientAccounts.reduce((sum, a) => sum + a.saldo_pendiente, 0);
  const averageAmount = clientAccounts.reduce((sum, a) => sum + a.monto_total, 0) / totalAccounts;

  // Factor 1: Historial de pagos (0-100)
  const paymentHistoryScore = totalAccounts > 0
    ? Math.round((paidAccounts / totalAccounts) * 100)
    : 50;

  // Factor 2: Deuda actual (0-100, inverso: menos deuda = mejor)
  const totalCredit = clientAccounts.reduce((sum, a) => sum + a.monto_total, 0);
  const currentDebtScore = totalCredit > 0
    ? Math.max(0, 100 - Math.round((totalDebt / totalCredit) * 100))
    : 100;

  // Factor 3: Antigüedad de la relación (0-100)
  // Basado en la cuenta más antigua
  const oldestAccount = clientAccounts.reduce((oldest, current) => 
    new Date(current.creado_en) < new Date(oldest.creado_en) ? current : oldest
  );
  const accountAgeDays = (Date.now() - new Date(oldestAccount.creado_en).getTime()) / (1000 * 60 * 60 * 24);
  const accountAgeScore = Math.min(100, Math.round(accountAgeDays / 365 * 50) + 25); // Max 100 a ~1.5 años

  // Score ponderado
  const score = Math.round(
    paymentHistoryScore * 0.5 +
    currentDebtScore * 0.3 +
    accountAgeScore * 0.2
  );

  let level: CreditScore['level'];
  if (score >= 85) level = 'EXCELENTE';
  else if (score >= 70) level = 'BUENO';
  else if (score >= 50) level = 'REGULAR';
  else if (score >= 30) level = 'MALO';
  else level = 'SIN_HISTORIAL';

  return {
    score,
    level,
    factors: {
      paymentHistory: paymentHistoryScore,
      currentDebt: currentDebtScore,
      accountAge: accountAgeScore,
    },
    details: {
      totalAccounts,
      paidAccounts,
      partialAccounts,
      overdueAccounts,
      totalDebt,
      averageAmount: Math.round(averageAmount),
    },
  };
}

/**
 * Detecta si un monto solicitado es anómalamente alto respecto al histórico
 * "Estafa de confianza": > 2.5x el promedio histórico
 */
export function detectAnomalousAmount(
  accounts: CuentaPorCobrar[],
  clientPhone: string,
  requestedAmount: number
): AnomalyDetectionResult {
  const clientAccounts = accounts.filter(a => a.cliente_telefono === clientPhone);
  
  if (clientAccounts.length === 0) {
    return {
      isAnomalous: false,
      requestedAmount,
      averageHistorical: 0,
      threshold: 0,
      ratio: 0,
      severity: 'NORMAL',
    };
  }

  const averageHistorical = clientAccounts.reduce((sum, a) => sum + a.monto_total, 0) / clientAccounts.length;
  const threshold = averageHistorical * 2.5;
  const ratio = averageHistorical > 0 ? requestedAmount / averageHistorical : 0;
  const isAnomalous = requestedAmount > threshold;

  let severity: AnomalyDetectionResult['severity'] = 'NORMAL';
  if (isAnomalous) {
    severity = ratio > 4 ? 'ROJO' : 'AMARILLO';
  }

  return {
    isAnomalous,
    requestedAmount,
    averageHistorical: Math.round(averageHistorical),
    threshold: Math.round(threshold),
    ratio: Math.round(ratio * 100) / 100,
    severity,
  };
}

/**
 * Obtiene el semáforo crediticio dual para un cliente
 */
export function getCreditSemaphore(
  accounts: CuentaPorCobrar[],
  clientPhone: string,
  requestedAmount: number
): CreditSemaphore {
  const score = calculateCreditScore(accounts, clientPhone);
  const anomaly = detectAnomalousAmount(accounts, clientPhone, requestedAmount);
  const clientAccounts = accounts.filter(a => a.cliente_telefono === clientPhone);
  const currentDebt = clientAccounts.reduce((sum, a) => sum + a.saldo_pendiente, 0);
  const hasOverdue = clientAccounts.some(a => a.estado === 'VENCIDO');
  const isNewClient = clientAccounts.length === 0;

  // Cliente nuevo: riesgo moderado
  if (isNewClient) {
    const maxSuggested = Math.min(requestedAmount, 500);
    return {
      color: 'AMARILLO',
      maxSuggestedFiado: maxSuggested,
      recommendation: `Cliente nuevo sin historial. Sugerido: hasta ${maxSuggested} Bs al fiado.`,
      details: { score: 50, currentDebt: 0, hasOverdue: false, isNewClient: true },
    };
  }

  // Cuentas vencidas: ROJO
  if (hasOverdue) {
    return {
      color: 'ROJO',
      maxSuggestedFiado: 0,
      recommendation: 'Cliente con saldo vencido. NO autorizar fiado (0 Bs). Requiere pago total antes de nuevo crédito.',
      details: { score: score.score, currentDebt, hasOverdue: true, isNewClient: false },
    };
  }

  // Monto anómalo detectado
  if (anomaly.isAnomalous) {
    if (anomaly.severity === 'ROJO') {
      return {
        color: 'ROJO',
        maxSuggestedFiado: 0,
        recommendation: `ALERTA: Monto solicitado (${requestedAmount} Bs) es ${anomaly.ratio}x el promedio histórico (${anomaly.averageHistorical} Bs). Posible estafa de confianza. NO autorizar.`,
        details: { score: score.score, currentDebt, hasOverdue: false, isNewClient: false },
      };
    }
    // AMARILLO por anomalía
    const suggested = Math.min(requestedAmount, Math.round(anomaly.threshold));
    return {
      color: 'AMARILLO',
      maxSuggestedFiado: suggested,
      recommendation: `Monto inusual detectado (${anomaly.ratio}x el promedio). Sugerido: 50% al contado/QR, saldo menor a ${suggested} Bs al fiado.`,
      details: { score: score.score, currentDebt, hasOverdue: false, isNewClient: false },
    };
  }

  // Basado en score crediticio
  if (score.score >= 80) {
    // EXCELENTE/BUENO: VERDE
    const maxSuggested = Math.min(requestedAmount, Math.round(score.details.averageAmount * 1.5));
    return {
      color: 'VERDE',
      maxSuggestedFiado: maxSuggested,
      recommendation: `Bajo riesgo. Monto sugerido hasta ${maxSuggested} Bs al fiado. Historial excelente.`,
      details: { score: score.score, currentDebt, hasOverdue: false, isNewClient: false },
    };
  }

  if (score.score >= 60) {
    // REGULAR: AMARILLO
    const maxSuggested = Math.min(requestedAmount, Math.round(score.details.averageAmount * 0.8));
    return {
      color: 'AMARILLO',
      maxSuggestedFiado: maxSuggested,
      recommendation: `Riesgo moderado. Sugerir 50% al contado/QR y saldo menor a ${maxSuggested} Bs al fiado.`,
      details: { score: score.score, currentDebt, hasOverdue: false, isNewClient: false },
    };
  }

  // MALO: ROJO
  return {
    color: 'ROJO',
    maxSuggestedFiado: 0,
    recommendation: 'Historial crediticio deficiente. Sugerido: 0 Bs al fiado. Requiere pago contado.',
    details: { score: score.score, currentDebt, hasOverdue: false, isNewClient: false },
  };
}

/**
 * Calcula el límite global de fiados basado en capital activo
 * Fórmula: (Valor Inventario + Flujo de Caja Mensual) * Porcentaje (default 15%)
 */
export function calculateGlobalFiadosLimit(
  inventoryValue: number,
  monthlyCashFlow: number,
  percentage: number = 0.15
): number {
  const activeCapital = inventoryValue + monthlyCashFlow;
  return Math.round(activeCapital * percentage);
}

/**
 * Obtiene el nivel de alerta del límite global
 */
export function getGlobalLimitAlertLevel(
  currentFiados: number,
  globalLimit: number
): GlobalAlertLevel {
  const percentage = globalLimit > 0 ? (currentFiados / globalLimit) * 100 : 0;

  if (percentage >= 100) {
    return {
      level: 'ROJO',
      percentage: Math.round(percentage),
      blocked: true,
      message: `LÍMITE GLOBAL EXCEDIDO (${Math.round(percentage)}%). No se pueden autorizar más fiados hasta reducir exposición.`,
      currentFiados,
      globalLimit,
    };
  }

  if (percentage >= 80) {
    return {
      level: 'AMARILLO',
      percentage: Math.round(percentage),
      blocked: false,
      message: `ALERTA: Exposición al ${Math.round(percentage)}% del límite global. Revisar nuevos fiados con cautela.`,
      currentFiados,
      globalLimit,
    };
  }

  return {
    level: 'VERDE',
    percentage: Math.round(percentage),
    blocked: false,
    message: `Exposición saludable al ${Math.round(percentage)}% del límite global.`,
    currentFiados,
    globalLimit,
  };
}

/**
 * Genera guión de salvavidas social para comunicar negativa de fiado
 */
export function generateSalvavidasScript(
  type: SalvavidasScriptType,
  clientName: string,
  amount: number,
  riskAssumed: boolean = false
): SalvavidasScript {
  const formattedAmount = amount.toLocaleString('es-BO');
  
  let script: string;
  
  if (type === 'FORMAL') {
    script = `Estimado/a ${clientName}:

Por políticas del sistema de caja, no podemos autorizar nuevos fiados hasta que se liquide el saldo anterior pendiente.

El monto solicitado de ${formattedAmount} Bs no puede ser procesado como fiado en este momento.

Opciones disponibles:
• Pago al contado (efectivo/QR/transferencia)
• Liquidar saldo anterior para reactivar línea de crédito

Agradecemos su comprensión.`;
  } else {
    script = `Hola ${clientName}, te cuento:

El casero/administrador me cuadra el sistema al centavo todas las noches y no me cuadra el cierre si no está saldado.

Por eso no puedo darte fiado de ${formattedAmount} Bs ahora mismo.

Opciones:
• Pago al toque (efectivo/QR)
• Cuando saldes lo anterior, te abro la línea de nuevo

¡Entendés, no es conmigo, es el sistema!`;
  }

  if (riskAssumed) {
    script += `\n\n⚠️ AUTORIZACIÓN BAJO MI PROPIO RIESGO: El dueño ha autorizado este fiado asumiendo el riesgo crediticio. Flag: riesgo_asumido = true`;
  }

  return {
    script,
    type,
    clientName,
    amount,
    riskAssumed,
  };
}

/**
 * Formatea un monto en Bolivianos para display
 */
export function formatBs(amount: number): string {
  if (amount === 0) return 'Bs 0';
  return 'Bs ' + amount.toLocaleString('es-BO');
}