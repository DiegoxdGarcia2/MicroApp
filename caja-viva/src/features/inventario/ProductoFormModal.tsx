import { useState, useEffect } from 'react';
import { Producto } from '../../db/types';
import { validateProduct } from '../inventario/inventarioUtils';
import { Card, CardHeader, btn-primary, btn-secondary, input-field } from '../../components/layout/Layout';
import { btn-secondary, btn-primary } from '../../components/layout/Layout'; // These are actually classes

interface ProductoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (producto: Partial<Producto>) => Promise<void>;
  initialData?: Partial<Producto>;
  isEditing?: boolean;
  isLoading?: boolean;
}

export function ProductoFormModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialData, 
  isEditing = false,
  isLoading = false 
}: ProductoFormModalProps) {
  const [formData, setFormData] = useState<Partial<Producto>>({
    nombre: '',
    codigo_barras: '',
    precio_venta: 0,
    costo: 0,
    stock_actual: 0,
    stock_minimo: 0,
    categoria: '',
    ...initialData,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        nombre: '',
        codigo_barras: '',
        precio_venta: 0,
        costo: 0,
        stock_actual: 0,
        stock_minimo: 0,
        categoria: '',
        ...initialData,
      });
      setErrors({});
      setTouched({});
    }
  }, [isOpen, initialData, isEditing]);

  const validateField = (name: string, value: any) => {
    const testData = { ...formData, [name]: value };
    const result = validateProduct(testData);
    const fieldError = result.errors.find(e => e.toLowerCase().includes(name.toLowerCase()));
    setErrors(prev => ({ ...prev, [name]: fieldError || '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let parsedValue = value;
    
    if (type === 'number') {
      parsedValue = value === '' ? 0 : Number(value);
    }
    
    setFormData(prev => ({ ...prev, [name]: parsedValue }));
    if (touched[name]) {
      validateField(name, parsedValue);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    validateField(name, formData[name]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark all fields as touched
    const allTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(allTouched);
    
    const result = validateProduct(formData);
    if (!result.valid) {
      const newErrors = result.errors.reduce((acc, err) => {
        // Map error to field
        let field = 'general';
        if (err.toLowerCase().includes('nombre')) field = 'nombre';
        else if (err.toLowerCase().includes('precio')) field = 'precio_venta';
        else if (err.toLowerCase().includes('costo')) field = 'costo';
        else if (err.toLowerCase().includes('stock actual')) field = 'stock_actual';
        else if (err.toLowerCase().includes('stock mínimo')) field = 'stock_minimo';
        else if (err.toLowerCase().includes('código')) field = 'codigo_barras';
        return { ...acc, [field]: err };
      }, {});
      setErrors(prev => ({ ...prev, ...newErrors }));
      return;
    }
    
    await onSubmit(formData);
  };

  if (!isOpen) return null;

  const isEditingMode = isEditing && initialData?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surface rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-h3 font-semibold text-primary">
              {isEditingMode ? 'Editar Producto' : 'Nuevo Producto'}
            </h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-4">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-primary mb-1">
                  Nombre del Producto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  value={formData.nombre || ''}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`input-field ${touched.nombre && errors.nombre ? 'border-red-500' : ''}`}
                  placeholder="Ej: Arroz 1kg"
                  required
                  maxLength={200}
                  disabled={isLoading}
                />
                {touched.nombre && errors.nombre && (
                  <p className="mt-1 text-sm text-red-500">{errors.nombre}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="codigo_barras" className="block text-sm font-medium text-primary mb-1">
                    Código de Barras / SKU
                  </label>
                  <input
                    type="text"
                    id="codigo_barras"
                    name="codigo_barras"
                    value={formData.codigo_barras || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`input-field ${touched.codigo_barras && errors.codigo_barras ? 'border-red-500' : ''}`}
                    placeholder="Opcional: 7790000000012"
                    maxLength={50}
                    disabled={isLoading}
                  />
                  {touched.codigo_barras && errors.codigo_barras && (
                    <p className="mt-1 text-sm text-red-500">{errors.codigo_barras}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="categoria" className="block text-sm font-medium text-primary mb-1">
                    Categoría
                  </label>
                  <select
                    id="categoria"
                    name="categoria"
                    value={formData.categoria || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`input-field ${touched.categoria && errors.categoria ? 'border-red-500' : ''}`}
                    disabled={isLoading}
                  >
                    <option value="">Seleccionar categoría</option>
                    <option value="Alimentos">Alimentos</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Limpieza">Limpieza</option>
                    <option value="Higiene">Higiene Personal</option>
                    <option value="Farmacia">Farmacia</option>
                    <option value="Otros">Otros</option>
                  </select>
                  {touched.categoria && errors.categoria && (
                    <p className="mt-1 text-sm text-red-500">{errors.categoria}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="precio_venta" className="block text-sm font-medium text-primary mb-1">
                    Precio de Venta (Bs) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">Bs</span>
                    <input
                      type="number"
                      id="precio_venta"
                      name="precio_venta"
                      value={formData.precio_venta || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`input-field pl-8 ${touched.precio_venta && errors.precio_venta ? 'border-red-500' : ''}`}
                      placeholder="850"
                      min="0"
                      step="1"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {touched.precio_venta && errors.precio_venta && (
                    <p className="mt-1 text-sm text-red-500">{errors.precio_venta}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="costo" className="block text-sm font-medium text-primary mb-1">
                    Costo (Bs) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">Bs</span>
                    <input
                      type="number"
                      id="costo"
                      name="costo"
                      value={formData.costo || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`input-field pl-8 ${touched.costo && errors.costo ? 'border-red-500' : ''}`}
                      placeholder="600"
                      min="0"
                      step="1"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {touched.costo && errors.costo && (
                    <p className="mt-1 text-sm text-red-500">{errors.costo}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stock_actual" className="block text-sm font-medium text-primary mb-1">
                    Stock Actual <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="stock_actual"
                    name="stock_actual"
                    value={formData.stock_actual || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`input-field ${touched.stock_actual && errors.stock_actual ? 'border-red-500' : ''}`}
                    placeholder="50"
                    min="0"
                    step="1"
                    required
                    disabled={isLoading}
                  />
                  {touched.stock_actual && errors.stock_actual && (
                    <p className="mt-1 text-sm text-red-500">{errors.stock_actual}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="stock_minimo" className="block text-sm font-medium text-primary mb-1">
                    Stock Mínimo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="stock_minimo"
                    name="stock_minimo"
                    value={formData.stock_minimo || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`input-field ${touched.stock_minimo && errors.stock_minimo ? 'border-red-500' : ''}`}
                    placeholder="10"
                    min="0"
                    step="1"
                    required
                    disabled={isLoading}
                  />
                  {touched.stock_minimo && errors.stock_minimo && (
                    <p className="mt-1 text-sm text-red-500">{errors.stock_minimo}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Imagen del Producto (opcional)
                </label>
                <input
                  type="file"
                  name="imagen"
                  accept="image/*"
                  className="input-field"
                  disabled={isLoading}
                />
                <p className="mt-1 text-xs text-muted">Formatos: JPG, PNG, WebP. Máx 2MB.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1 sm:flex-none"
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 sm:flex-none"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="none" stroke="currentColor" d="M4 12a8 8 0 018-8V0" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    Guardando...
                  </>
                ) : (
                  isEditingMode ? 'Actualizar' : 'Crear Producto'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}