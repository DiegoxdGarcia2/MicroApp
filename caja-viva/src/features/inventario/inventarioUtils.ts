export interface StockStatus {
  type: 'OK' | 'BAJO' | 'AGOTADO';
  label: string;
  color: string;
}

export interface InventoryValue {
  totalCosto: number;
  totalVenta: number;
  gananciaPotencial: number;
}

export interface ProductValidation {
  valid: boolean;
  errors: string[];
}

export interface StockAlert {
  type: 'warning' | 'error' | null;
  message: string;
  producto: string;
}

/**
 * Calcula el estado del stock comparando actual vs mínimo
 */
export function calculateStockStatus(producto: { stock_actual: number; stock_minimo: number }): 'OK' | 'BAJO' | 'AGOTADO' {
  if (producto.stock_actual === 0) return 'AGOTADO';
  if (producto.stock_actual <= producto.stock_minimo) return 'BAJO';
  return 'OK';
}

/**
 * Obtiene el estado visual del stock con colores
 */
export function getStockStatusInfo(producto: { stock_actual: number; stock_minimo: number }): StockStatus {
  const status = calculateStockStatus({ stock_actual: producto.stock_actual, stock_minimo: producto.stock_minimo });
  
  switch (status) {
    case 'AGOTADO':
      return { type: 'AGOTADO', label: 'Agotado', color: 'red' };
    case 'BAJO':
      return { type: 'BAJO', label: 'Stock Bajo', color: 'amber' };
    default:
      return { type: 'OK', label: 'OK', color: 'green' };
  }
}

/**
 * Calcula el valor total del inventario
 */
export function calculateInventoryValue(productos: Array<{ precio_venta: number; costo: number; stock_actual: number }>, tipo: 'costo' | 'venta'): number {
  const campo = tipo === 'costo' ? 'costo' : 'precio_venta';
  return productos.reduce((sum, p) => sum + (p[campo] * p.stock_actual), 0);
}

/**
 * Filtra productos por búsqueda y categoría
 */
export function filterProducts(
  productos: Array<{ nombre: string; codigo_barras?: string | null; categoria?: string | null; stock_actual: number; stock_minimo: number }>,
  query: string,
  categoria?: string,
  stockStatus?: 'Todos' | 'OK' | 'BAJO' | 'AGOTADO'
): Array<{ nombre: string; codigo_barras?: string | null; categoria?: string | null; stock_actual: number; stock_minimo: number }> {
  let resultados = [...productos];

  // Filtrar por búsqueda
  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    resultados = resultados.filter(p => 
      p.nombre.toLowerCase().includes(lowerQuery) ||
      p.codigo_barras?.toLowerCase().includes(lowerQuery) ||
      p.categoria?.toLowerCase().includes(lowerQuery)
    );
  }

  // Filtrar por categoría
  if (categoria && categoria !== 'Todos') {
    resultados = resultados.filter(p => p.categoria === categoria);
  }

  // Filtrar por estado de stock
  if (stockStatus && stockStatus !== 'Todos') {
    resultados = resultados.filter(p => {
      const status = p.stock_actual === 0 ? 'AGOTADO' : 
                    p.stock_actual <= p.stock_minimo ? 'BAJO' : 'OK';
      return status === stockStatus;
    });
  }

  return resultados;
}

/**
 * Ordena productos por campo y dirección
 */
export function sortProducts(
  productos: Array<{ nombre: string; precio_venta: number; stock_actual: number; stock_minimo: number; categoria: string }>,
  field: keyof typeof productos[0],
  direction: 'asc' | 'desc'
): Array<{ nombre: string; precio_venta: number; stock_actual: number; stock_minimo: number; categoria: string }> {
  return [...productos].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === undefined || aVal === null) return direction === 'asc' ? 1 : -1;
    if (bVal === undefined || bVal === null) return direction === 'asc' ? -1 : 1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });
}

/**
 * Valida un producto antes de guardar
 */
export function validateProduct(producto: Partial<{
  nombre: string;
  precio_venta: number;
  costo: number;
  stock_actual: number;
  stock_minimo: number;
  codigo_barras: string | null;
}>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!producto.nombre || producto.nombre.trim() === '') {
    errors.push('El nombre es obligatorio');
  }

  if (producto.precio_venta === undefined || producto.precio_venta < 0) {
    errors.push('El precio de venta debe ser un número positivo');
  }

  if (producto.costo === undefined || producto.costo < 0) {
    errors.push('El costo debe ser un número positivo');
  }

  if (producto.stock_actual === undefined || producto.stock_actual < 0) {
    errors.push('El stock actual no puede ser negativo');
  }

  if (producto.stock_minimo === undefined || producto.stock_minimo < 0) {
    errors.push('El stock mínimo no puede ser negativo');
  }

  if (producto.codigo_barras && producto.codigo_barras.length > 50) {
    errors.push('El código de barras es demasiado largo');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Genera alerta de stock si corresponde
 */
export function generateStockAlert(producto: { nombre: string; stock_actual: number; stock_minimo: number }): { type: 'warning' | 'error'; message: string; producto: string } | null {
  if (producto.stock_actual === 0) {
    return {
      type: 'error',
      message: `${producto.nombre}: STOCK AGOTADO - Reponer urgentemente`,
      producto: producto.nombre,
    };
  }

  if (producto.stock_actual <= producto.stock_minimo) {
    return {
      type: 'warning',
      message: `${producto.nombre}: Stock BAJO (${producto.stock_actual}/${producto.stock_minimo})`,
      producto: producto.nombre,
    };
  }

  return null;
}