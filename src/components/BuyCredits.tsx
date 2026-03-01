import React, { useState } from 'react';
import { 
  CreditCard, 
  Zap, 
  Star, 
  Crown, 
  Check, 
  Sparkles,
  ArrowLeft,
  ShoppingCart
} from 'lucide-react';
import Modal from './ui/Modal';

interface CreditPlan {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  icon: React.ElementType;
  color: string;
  features: string[];
}

interface BuyCreditsProps {
  onBack: () => void;
}

export default function BuyCredits({ onBack }: BuyCreditsProps) {
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  const [currentCredits, setCurrentCredits] = useState(150); // Mock current credits

  const creditPlans: CreditPlan[] = [
    {
      id: 'starter',
      name: 'Starter',
      credits: 100,
      price: 9.99,
      icon: Zap,
      color: 'from-blue-500 to-cyan-500',
      features: [
        '100 créditos',
        'Válido por 30 días',
        'Soporte básico',
        'Acceso a funciones estándar'
      ]
    },
    {
      id: 'professional',
      name: 'Profesional',
      credits: 500,
      price: 39.99,
      popular: true,
      icon: Star,
      color: 'from-purple-500 to-pink-500',
      features: [
        '500 créditos',
        'Válido por 60 días',
        'Soporte prioritario',
        'Acceso a todas las funciones',
        '10% de bonificación extra'
      ]
    },
    {
      id: 'enterprise',
      name: 'Empresarial',
      credits: 2000,
      price: 129.99,
      icon: Crown,
      color: 'from-amber-500 to-orange-500',
      features: [
        '2000 créditos',
        'Válido por 90 días',
        'Soporte dedicado 24/7',
        'Acceso completo + API',
        '25% de bonificación extra',
        'Reportes avanzados'
      ]
    }
  ];

  const handlePurchase = async () => {
    if (!selectedPlan) return;
    
    setProcessing(true);
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setCurrentCredits(prev => prev + selectedPlan.credits);
    setProcessing(false);
    setPurchaseComplete(true);
  };

  const resetPurchase = () => {
    setSelectedPlan(null);
    setShowCheckout(false);
    setPurchaseComplete(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comprar Créditos</h1>
          <p className="text-gray-500 mt-1">Selecciona un plan para continuar</p>
        </div>
      </div>

      {/* Current Credits Display */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Tu balance actual</p>
            <div className="flex items-center gap-3 mt-1">
              <Sparkles className="w-8 h-8 text-yellow-400" />
              <span className="text-4xl font-bold">{currentCredits.toLocaleString()}</span>
              <span className="text-slate-400">créditos</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Valor estimado</p>
            <p className="text-2xl font-semibold">${(currentCredits * 0.1).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Credit Plans */}
      <div className="grid md:grid-cols-3 gap-6">
        {creditPlans.map((plan) => {
          const Icon = plan.icon;
          const isSelected = selectedPlan?.id === plan.id;
          
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className={`
                relative bg-white rounded-2xl border-2 p-6 cursor-pointer transition-all duration-300
                ${isSelected 
                  ? 'border-blue-500 shadow-lg shadow-blue-500/20 scale-[1.02]' 
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }
              `}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold px-4 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                </div>
              )}

              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                <Icon className="w-7 h-7 text-white" />
              </div>

              <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
              
              <div className="mt-4 mb-6">
                <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-gray-500 ml-1">USD</span>
              </div>

              <div className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-gray-600 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlan(plan);
                  setShowCheckout(true);
                }}
                className={`
                  w-full py-3 rounded-xl font-semibold transition-all
                  ${isSelected
                    ? `bg-gradient-to-r ${plan.color} text-white shadow-lg`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {isSelected ? 'Comprar Ahora' : 'Seleccionar'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment Methods Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Métodos de pago aceptados</h3>
        <div className="flex flex-wrap gap-4">
          {['Visa', 'Mastercard', 'PayPal', 'Binance', 'Nequi'].map((method) => (
            <div key={method} className="px-4 py-2 bg-gray-50 rounded-lg text-gray-700 text-sm font-medium">
              {method}
            </div>
          ))}
        </div>
      </div>

      {/* Checkout Modal */}
      <Modal
        isOpen={showCheckout}
        onClose={resetPurchase}
        title={purchaseComplete ? 'Compra Exitosa' : 'Confirmar Compra'}
        size="md"
      >
        {purchaseComplete ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Compra Completada!</h3>
            <p className="text-gray-600 mb-6">
              Se han añadido <strong>{selectedPlan?.credits.toLocaleString()}</strong> créditos a tu cuenta.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Tu nuevo balance: <strong>{currentCredits.toLocaleString()}</strong> créditos
            </p>
            <button
              onClick={resetPurchase}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors"
            >
              Continuar
            </button>
          </div>
        ) : selectedPlan && (
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="font-semibold text-gray-900 mb-3">Resumen del pedido</h4>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Plan {selectedPlan.name}</span>
                <span className="font-semibold">{selectedPlan.credits.toLocaleString()} créditos</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">${selectedPlan.price}</span>
              </div>
            </div>

            {/* Payment Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de tarjeta
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de expiración
                  </label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CVV
                  </label>
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={resetPurchase}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePurchase}
                disabled={processing}
                className="flex-1 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    Pagar ${selectedPlan.price}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
