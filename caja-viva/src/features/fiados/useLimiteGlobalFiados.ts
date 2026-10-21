import { useState, useEffect, useCallback } from 'react';
import { calculateGlobalFiadosLimit, getGlobalLimitAlertLevel, type GlobalLimitResult, type GlobalAlertLevel } from './creditGuardianUtils';
interface UseLimiteGlobalFiadosOptions {
  inventoryValue: number;
  monthlyCashFlow: number;
  customPercentage?: number;
  customLimit?: number | null;
}

interface UseLimiteGlobalFiadosReturn {
  // Configuración
  inventoryValue: number;
  monthlyCashFlow: number;
  percentage: number;
  customLimit: number | null;
  
  // Resultados calculados
  globalLimit: GlobalLimitResult;
  alertLevel: GlobalAlertLevel;
  
  // Fiados actuales (desde store)
  currentFiados: number;
  setCurrentFiados: (value: number) => void;
  
  // Acciones
  updateInventoryValue: (value: number) => void;
  updateMonthlyCashFlow: (value: number) => void;
  updatePercentage: (value: number) => void;
  setCustomLimit: (limit: number | null) => void;
  resetToAuto: () => void;
  
  // Helpers de UI
  isNearLimit: boolean;
  isOverLimit: boolean;
  progressPercentage: number;
  remainingCapacity: number;
}

/**
 * Hook para gestionar el límite global de fiados con IA dinámica
 * Calcula el capital seguro en la calle basado en inventario + flujo de caja
 */
export function useLimiteGlobalFiados({
  inventoryValue: initialInventory,
  monthlyCashFlow: initialCashFlow,
  customPercentage = 0.15,
  customLimit: customLimitInicial = null,
}: UseLimiteGlobalFiadosOptions): UseLimiteGlobalFiadosReturn {
  // Estado de configuración
  const [inventoryValue, setInventoryValue] = useState(initialInventory);
  const [monthlyCashFlow, setMonthlyCashFlow] = useState(initialCashFlow);
  const [percentage, setPercentage] = useState(customPercentage);
  const [customLimit, setCustomLimitState] = useState<number | null>(customLimitInicial);
  
  // Estado de fiados actuales (se actualiza desde el store de cuentas_cobrar)
  const [currentFiados, setCurrentFiados] = useState(0);

  // Calcular límite global (customLimit manual o % automático del capital)
  const autoLimit = calculateGlobalFiadosLimit(inventoryValue, monthlyCashFlow, percentage);
  const globalLimit: GlobalLimitResult = {
    limit: customLimit ?? autoLimit,
    percentage: customLimit !== null ? 100 : Math.round(percentage * 100),
    capitalActivo: inventoryValue + monthlyCashFlow,
    inventoryValue,
    cashFlow: monthlyCashFlow,
    appliedPercentage: customLimit !== null ? 0 : Math.round(percentage * 100),
  };

  // Calcular nivel de alerta
  const alertLevel = getGlobalLimitAlertLevel(currentFiados, globalLimit.limit);

  // Helpers derivados
  const progressPercentage = Math.min(100, Math.round((currentFiados / globalLimit.limit) * 100));
  const remainingCapacity = Math.max(0, globalLimit.limit - currentFiados);
  const isNearLimit = progressPercentage >= 80;
  const isOverLimit = progressPercentage >= 100;

  // Acciones
  const updateInventoryValue = useCallback((value: number) => {
    setInventoryValue(Math.max(0, value));
  }, []);

  const updateMonthlyCashFlow = useCallback((value: number) => {
    setMonthlyCashFlow(Math.max(0, value));
  }, []);

  const updatePercentage = useCallback((value: number) => {
    setPercentage(Math.max(0.01, Math.min(1, value))); // Entre 1% y 100%
    setCustomLimitState(null); // Reset custom limit al cambiar porcentaje
  }, []);

  const setCustomLimit = useCallback((limit: number | null) => {
    setCustomLimitState(limit);
  }, []);

  const resetToAuto = useCallback(() => {
    setCustomLimitState(null);
    setPercentage(customPercentage);
  }, [customPercentage]);

  // Efecto para persistir configuración en localStorage
  useEffect(() => {
    const config = {
      inventoryValue,
      monthlyCashFlow,
      percentage,
      customLimit,
    };
    localStorage.setItem('cajaviva_global_fiados_config', JSON.stringify(config));
  }, [inventoryValue, monthlyCashFlow, percentage, customLimit]);

  // Cargar configuración guardada al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cajaviva_global_fiados_config');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.inventoryValue) setInventoryValue(config.inventoryValue);
        if (config.monthlyCashFlow) setMonthlyCashFlow(config.monthlyCashFlow);
        if (config.percentage) setPercentage(config.percentage);
        if (config.customLimit !== undefined) setCustomLimitState(config.customLimit);
      }
    } catch {
      // Ignorar errores de parsing
    }
  }, []);

  return {
    // Configuración
    inventoryValue,
    monthlyCashFlow,
    percentage,
    customLimit,
    
    // Resultados
    globalLimit,
    alertLevel,
    
    // Estado actual
    currentFiados,
    setCurrentFiados,
    
    // Acciones
    updateInventoryValue,
    updateMonthlyCashFlow,
    updatePercentage,
    setCustomLimit,
    resetToAuto,
    
    // Helpers UI
    isNearLimit,
    isOverLimit,
    progressPercentage,
    remainingCapacity,
  };
}

/**
 * Hook para obtener el total de fiados pendientes desde IndexedDB
 * Se usa en combinación con useLimiteGlobalFiados
 */
export function useCurrentFiadosTotal(): number {
  const [total, setTotal] = useState(0);
  
  useEffect(() => {
    let mounted = true;
    
    async function fetchFiadosTotal() {
      try {
        // Import dinámico para evitar circular deps
        const { cuentaPorCobrarRepository } = await import('../../db/repositories');
        const cuentas = await cuentaPorCobrarRepository.getAll();
        const totalPendiente = cuentas
          .filter(c => c.estado !== 'PAGADO')
          .reduce((sum, c) => sum + c.saldo_pendiente, 0);
        
        if (mounted) {
          setTotal(totalPendiente);
        }
      } catch (error) {
        console.error('Error fetching fiados total:', error);
      }
    }
    
    fetchFiadosTotal();
    
    // Escuchar cambios en el store
    const handleStorageChange = () => fetchFiadosTotal();
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  
  return total;
}