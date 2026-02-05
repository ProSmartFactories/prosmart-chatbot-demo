'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Building2, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface OnboardingFormProps {
  onComplete: () => void;
}

export function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await updateProfile(name, company);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onComplete();
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Completa tu perfil</h2>
        <p className="text-gray-500 text-sm mt-1">Solo necesitamos unos datos más</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre completo
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
            required
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Empresa
        </label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="ProSmart Industries"
            required
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
          />
        </div>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-red-500 text-sm"
        >
          {error}
        </motion.p>
      )}

      <button
        type="submit"
        disabled={loading || !name || !company}
        className="w-full bg-orange-500 text-white py-3 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            Completar registro
          </>
        )}
      </button>
    </motion.form>
  );
}
