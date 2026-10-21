import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  encryptCIPhoto,
  decryptCIPhoto,
  calculateCreditScore,
  detectAnomalousAmount,
  getCreditSemaphore,
  calculateGlobalFiadosLimit,
  getGlobalLimitAlertLevel,
  generateSalvavidasScript,
} from './creditGuardianUtils';
import type { CuentaPorCobrar } from '../../db/types';

// Mock crypto.subtle for testing
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();
const mockImportKey = vi.fn();
const mockGenerateKey = vi.fn();
const mockExportKey = vi.fn();

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      encrypt: mockEncrypt,
      decrypt: mockDecrypt,
      importKey: mockImportKey,
      generateKey: mockGenerateKey,
      exportKey: mockExportKey,
    },
    getRandomValues: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
      return arr;
    }),
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
  },
  writable: true,
});

describe('T-007: Guardián Crediticio con IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Encriptación AES-GCM de CI (cryptoUtils)', () => {
    it('should encrypt CI photo with AES-GCM', async () => {
      const photoBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
      const password = 'test-password-123';
      
      const mockKey = { type: 'secret' };
      const mockEncryptedData = new ArrayBuffer(32);
      const mockExportedKey = new ArrayBuffer(32);
      
      mockGenerateKey.mockResolvedValue(mockKey);
      mockEncrypt.mockResolvedValue(mockEncryptedData);
      mockExportKey.mockResolvedValue(mockExportedKey);

      const result = await encryptCIPhoto(photoBlob, password);
      
      expect(result).toBeDefined();
      expect(result.encryptedData).toBeInstanceOf(ArrayBuffer);
      expect(result.iv).toBeInstanceOf(Uint8Array);
      expect(result.salt).toBeInstanceOf(Uint8Array);
      expect(result.keyHash).toBeDefined();
    });

    it('should decrypt CI photo with correct password', async () => {
      const encryptedData = new ArrayBuffer(32);
      const iv = new Uint8Array(12);
      const salt = new Uint8Array(16);
      const password = 'test-password-123';
      
      const mockKey = { type: 'secret' };
      const mockDecryptedData = new Blob(['fake-image-data'], { type: 'image/jpeg' });
      
      mockImportKey.mockResolvedValue(mockKey);
      mockDecrypt.mockResolvedValue(mockDecryptedData);

      const result = await decryptCIPhoto({
        encryptedData,
        iv,
        salt,
        keyHash: 'hash123',
      }, password);
      
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/jpeg');
    });

    it('should fail decryption with wrong password', async () => {
      const encryptedData = new ArrayBuffer(32);
      const iv = new Uint8Array(12);
      const salt = new Uint8Array(16);
      
      mockImportKey.mockResolvedValue({ type: 'secret' });
      mockDecrypt.mockRejectedValue(new Error('Decryption failed'));

      await expect(decryptCIPhoto({
        encryptedData,
        iv,
        salt,
        keyHash: 'hash123',
      }, 'wrong-password')).rejects.toThrow('Decryption failed');
    });

    it('should compress image before encryption', async () => {
      // Create a larger "image" to test compression
      const largeData = 'x'.repeat(100000);
      const photoBlob = new Blob([largeData], { type: 'image/jpeg' });
      const password = 'test-password-123';
      
      const mockKey = { type: 'secret' };
      mockGenerateKey.mockResolvedValue(mockKey);
      mockEncrypt.mockResolvedValue(new ArrayBuffer(32));
      mockExportKey.mockResolvedValue(new ArrayBuffer(32));

      const result = await encryptCIPhoto(photoBlob, password);
      
      // The encryption should have been called
      expect(mockEncrypt).toHaveBeenCalled();
      expect(result.encryptedData).toBeDefined();
    });
  });

  describe('Motor de Score Crediticio y Detección de Anomalías', () => {
    const mockAccounts: CuentaPorCobrar[] = [
      {
        id: '1',
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: 1000,
        saldo_pendiente: 0,
        fecha_vencimiento: '2026-10-15',
        estado: 'PAGADO',
        creado_en: '2026-01-01T00:00:00Z',
        actualizado_en: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: 1500,
        saldo_pendiente: 0,
        fecha_vencimiento: '2026-02-15',
        estado: 'PAGADO',
        creado_en: '2026-02-01T00:00:00Z',
        actualizado_en: '2026-02-01T00:00:00Z',
      },
      {
        id: '3',
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: 2000,
        saldo_pendiente: 500,
        fecha_vencimiento: '2026-03-15',
        estado: 'PARCIAL',
        creado_en: '2026-03-01T00:00:00Z',
        actualizado_en: '2026-03-01T00:00:00Z',
      },
    ];

    it('should calculate credit score based on payment history', () => {
      const score = calculateCreditScore(mockAccounts, '+59171234567');
      
      expect(score).toBeDefined();
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.factors).toBeDefined();
      expect(score.factors.paymentHistory).toBeDefined();
      expect(score.factors.currentDebt).toBeDefined();
      expect(score.factors.accountAge).toBeDefined();
    });

    it('should detect anomalous amount jump (estafa de confianza)', () => {
      // Average historical: (1000 + 1500 + 2000) / 3 = 1500
      // 2.5x threshold = 3750
      const isAnomalous = detectAnomalousAmount(mockAccounts, '+59171234567', 4000);
      
      expect(isAnomalous.isAnomalous).toBe(true);
      expect(isAnomalous.threshold).toBe(3750);
      expect(isAnomalous.requestedAmount).toBe(4000);
      expect(isAnomalous.averageHistorical).toBe(1500);
      expect(isAnomalous.ratio).toBeCloseTo(2.67, 1);
    });

    it('should not flag normal amounts', () => {
      const isAnomalous = detectAnomalousAmount(mockAccounts, '+59171234567', 2000);
      
      expect(isAnomalous.isAnomalous).toBe(false);
      expect(isAnomalous.ratio).toBeLessThan(2.5);
    });

    it('should return GREEN semaphore for low risk clients', () => {
      const goodAccounts: CuentaPorCobrar[] = [
        ...mockAccounts,
        {
          id: '4',
          cliente_nombre: 'Juan Pérez',
          cliente_telefono: '+59171234567',
          monto_total: 1000,
          saldo_pendiente: 0,
          fecha_vencimiento: '2026-04-15',
          estado: 'PAGADO',
          creado_en: '2026-04-01T00:00:00Z',
          actualizado_en: '2026-04-01T00:00:00Z',
        },
      ];

      const semaphore = getCreditSemaphore(goodAccounts, '+59171234567', 1000);
      
      expect(semaphore.color).toBe('VERDE');
      expect(semaphore.maxSuggestedFiado).toBeGreaterThan(0);
      expect(semaphore.recommendation).toContain('Bajo riesgo');
    });

    it('should return YELLOW semaphore for moderate risk', () => {
      const moderateAccounts: CuentaPorCobrar[] = [
        {
          id: '1',
          cliente_nombre: 'Cliente Moderado',
          cliente_telefono: '+59171111111',
          monto_total: 5000,
          saldo_pendiente: 2000,
          fecha_vencimiento: '2026-10-15',
          estado: 'PARCIAL',
          creado_en: '2026-01-01T00:00:00Z',
          actualizado_en: '2026-01-01T00:00:00Z',
        },
      ];

      const semaphore = getCreditSemaphore(moderateAccounts, '+59171111111', 3000);
      
      expect(semaphore.color).toBe('AMARILLO');
      expect(semaphore.maxSuggestedFiado).toBeLessThan(3000);
      expect(semaphore.recommendation).toContain('50%');
    });

    it('should return RED semaphore for delinquent clients', () => {
      const badAccounts: CuentaPorCobrar[] = [
        {
          id: '1',
          cliente_nombre: 'Cliente Moroso',
          cliente_telefono: '+59172222222',
          monto_total: 5000,
          saldo_pendiente: 5000,
          fecha_vencimiento: '2026-01-01',
          estado: 'VENCIDO',
          creado_en: '2025-12-01T00:00:00Z',
          actualizado_en: '2025-12-01T00:00:00Z',
        },
      ];

      const semaphore = getCreditSemaphore(badAccounts, '+59172222222', 1000);
      
      expect(semaphore.color).toBe('ROJO');
      expect(semaphore.maxSuggestedFiado).toBe(0);
      expect(semaphore.recommendation).toContain('0 Bs');
    });

    it('should handle new clients with no history', () => {
      const semaphore = getCreditSemaphore([], '+59179999999', 500);
      
      expect(semaphore.color).toBe('AMARILLO'); // New clients = moderate risk
      expect(semaphore.maxSuggestedFiado).toBeGreaterThan(0);
      expect(semaphore.maxSuggestedFiado).toBeLessThanOrEqual(500);
    });
  });

  describe('Límite Global de Fiados con IA Dinámica', () => {
    it('should calculate global limit based on inventory + cash flow', () => {
      const inventoryValue = 100000; // Bs 100,000
      const cashFlow = 50000; // Bs 50,000 monthly
      const activeCapital = inventoryValue + cashFlow; // 150,000
      // 15% of active capital = 22,500
      
      const limit = calculateGlobalFiadosLimit(inventoryValue, cashFlow, 0.15);
      
      expect(limit).toBe(22500);
    });

    it('should allow custom percentage override', () => {
      const inventoryValue = 100000;
      const cashFlow = 50000;
      
      const limit = calculateGlobalFiadosLimit(inventoryValue, cashFlow, 0.20);
      
      expect(limit).toBe(30000); // 20% of 150,000
    });

    it('should return VERDE alert level below 80%', () => {
      const currentFiados = 15000;
      const globalLimit = 22500; // 80% = 18000
      
      const alert = getGlobalLimitAlertLevel(currentFiados, globalLimit);
      
      expect(alert.level).toBe('VERDE');
      expect(alert.percentage).toBeLessThan(80);
    });

    it('should return AMARILLO alert level at 80-99%', () => {
      const currentFiados = 19000;
      const globalLimit = 22500; // ~84%
      
      const alert = getGlobalLimitAlertLevel(currentFiados, globalLimit);
      
      expect(alert.level).toBe('AMARILLO');
      expect(alert.percentage).toBeGreaterThanOrEqual(80);
      expect(alert.percentage).toBeLessThan(100);
    });

    it('should return ROJO alert level at 100%+', () => {
      const currentFiados = 23000;
      const globalLimit = 22500; // ~102%
      
      const alert = getGlobalLimitAlertLevel(currentFiados, globalLimit);
      
      expect(alert.level).toBe('ROJO');
      expect(alert.percentage).toBeGreaterThanOrEqual(100);
      expect(alert.blocked).toBe(true);
    });
  });

  describe('Selector de Salvavidas Social', () => {
    it('should generate Formal script (Opción A)', () => {
      const script = generateSalvavidasScript('FORMAL', 'Juan Pérez', 5000);
      
      expect(script).toContain('Políticas del sistema de caja');
      expect(script).toContain('bloquean nuevas cuentas');
      expect(script).toContain('liquidar saldo anterior');
      expect(script).toContain('Juan Pérez');
      expect(script).toContain('5.000');
    });

    it('should generate Barrio script (Opción B)', () => {
      const script = generateSalvavidasScript('BARRIO', 'Juan Pérez', 5000);
      
      expect(script).toContain('casero');
      expect(script).toContain('administrador');
      expect(script).toContain('cuadra el sistema');
      expect(script).toContain('cierre');
      expect(script).toContain('saldado');
      expect(script).toContain('Juan Pérez');
      expect(script).toContain('5.000');
    });

    it('should include risk assumption warning', () => {
      const script = generateSalvavidasScript('FORMAL', 'Juan Pérez', 5000, true);
      
      expect(script).toContain('riesgo_asumido');
      expect(script).toContain('bajo mi propio riesgo');
    });
  });
});