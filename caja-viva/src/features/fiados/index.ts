export { FiadosPage } from './FiadosPage';
export { SalvavidasModal } from './SalvavidasModal';

// Fiados Utils (originales)
export { 
  calculatePendingBalance,
  applyPayment,
  getAccountStatus,
  generatePaymentReminder,
  generateWhatsAppReminderUrl,
  validateCuentaPorCobrar,
  formatBs,
} from './fiadosUtils';

// Credit Guardian (T-007)
export {
  // Crypto
  encryptCIPhoto,
  decryptCIPhoto,
  isCryptoSupported,
  generateSecurePassword,
  type EncryptedPhoto,
} from '../../utils/cryptoUtils';

export {
  // Credit Scoring
  calculateCreditScore,
  detectAnomalousAmount,
  getCreditSemaphore,
  type CreditScore,
  type AnomalyDetectionResult,
  type CreditSemaphore,
  
  // Global Limits
  calculateGlobalFiadosLimit,
  getGlobalLimitAlertLevel,
  type GlobalLimitResult,
  type GlobalAlertLevel,
  
  // Salvavidas
  generateSalvavidasScript,
  type SalvavidasScriptType,
  type SalvavidasScript,
  
  // Hooks
  useLimiteGlobalFiados,
  useCurrentFiadosTotal,
  
  // Format
  formatBs,
} from './creditGuardianUtils';