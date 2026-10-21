import { useState } from 'react';
import { generateSalvavidasScript, type SalvavidasScriptType, type SalvavidasScript } from './creditGuardianUtils';

interface SalvavidasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (script: SalvavidasScript, riskAssumed: boolean) => void;
  clientName: string;
  amount: number;
}

export function SalvavidasModal({ isOpen, onClose, onConfirm, clientName, amount }: SalvavidasModalProps) {
  const [selectedScript, setSelectedScript] = useState<SalvavidasScriptType>('FORMAL');
  const [riskAssumed, setRiskAssumed] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<SalvavidasScript | null>(null);

  // Generar script cuando cambie la selección
  const handleScriptChange = (type: SalvavidasScriptType) => {
    setSelectedScript(type);
    const script = generateSalvavidasScript(type, clientName, amount, riskAssumed);
    setGeneratedScript(script);
  };

  // Generar script cuando cambie riskAssumed
  const handleRiskAssumedChange = (checked: boolean) => {
    setRiskAssumed(checked);
    if (generatedScript) {
      const script = generateSalvavidasScript(selectedScript, clientName, amount, checked);
      setGeneratedScript(script);
    }
  };

  // Inicializar script al abrir
  if (isOpen && !generatedScript) {
    const script = generateSalvavidasScript(selectedScript, clientName, amount, riskAssumed);
    setGeneratedScript(script);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Salvavidas Social</h2>
              <p className="text-sm text-gray-500">Guión para comunicar negativa de fiado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Client Info */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cliente</p>
                <p className="text-lg font-medium text-gray-900">{clientName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Monto Solicitado</p>
                <p className="text-lg font-bold text-amber-600">Bs {amount.toLocaleString('es-BO')}</p>
              </div>
            </div>
          </div>

          {/* Script Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Seleccionar estilo de comunicación</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Opción A: Formal */}
              <button
                type="button"
                onClick={() => handleScriptChange('FORMAL')}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  selectedScript === 'FORMAL'
                    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm">A</span>
                  <span className="font-medium text-gray-900">Formal</span>
                </div>
                <p className="text-sm text-gray-600">"Políticas del sistema de caja bloquean nuevas cuentas..."</p>
                {selectedScript === 'FORMAL' && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                )}
              </button>

              {/* Opción B: Barrio */}
              <button
                type="button"
                onClick={() => handleScriptChange('BARRIO')}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  selectedScript === 'BARRIO'
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">B</span>
                  <span className="font-medium text-gray-900">Barrio</span>
                </div>
                <p className="text-sm text-gray-600">"El casero me cuadra el sistema al centavo todas las noches..."</p>
                {selectedScript === 'BARRIO' && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                )}
              </button>
            </div>
          </div>

          {/* Generated Script Preview */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Mensaje a enviar</label>
              <button
                onClick={() => navigator.clipboard.writeText(generatedScript?.script || '')}
                className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h10a2 2 0 012 2v1M8 5v15m-8-15v15" />
                </svg>
                Copiar
              </button>
            </div>
            <textarea
              readOnly
              className="w-full h-40 font-mono text-sm text-gray-800 bg-white rounded-lg border border-gray-200 p-3 resize-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              value={generatedScript?.script || ''}
            />
          </div>

          {/* Risk Assumption Toggle */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={riskAssumed}
                onChange={(e) => handleRiskAssumedChange(e.target.checked)}
                className="mt-1 w-4 h-4 text-red-600 border-red-300 rounded focus:ring-red-500 focus:ring-2"
              />
              <div>
                <p className="font-medium text-red-800">Autorizar bajo mi propio riesgo</p>
                <p className="text-sm text-red-600 mt-1">
                  El dueño aprueba el fiado asumiendo el riesgo crediticio. 
                  Se marcará con <code className="bg-red-100 px-1 rounded">riesgo_asumido: true</code> en el sistema.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (generatedScript) {
                onConfirm(generatedScript, riskAssumed);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-amber-600 rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {riskAssumed ? 'Autorizar con Riesgo' : 'Confirmar y Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}