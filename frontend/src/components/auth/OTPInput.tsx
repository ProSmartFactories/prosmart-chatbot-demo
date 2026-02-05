'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface OTPInputProps {
  email: string;
  onSuccess: () => void;
  onBack: () => void;
}

export function OTPInput({ email, onSuccess, onBack }: OTPInputProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { verifyOtp, sendOtp } = useAuth();

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newOtp.every(digit => digit) && newOtp.join('').length === 6) {
      handleSubmit(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      handleSubmit(pastedData);
    }
  };

  const handleSubmit = async (code: string) => {
    setError(null);
    setLoading(true);

    const { error } = await verifyOtp(email, code);

    if (error) {
      setError('Código inválido. Intenta de nuevo.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(onSuccess, 1000);
    }
  };

  const handleResend = async () => {
    setError(null);
    await sendOtp(email);
    setOtp(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="text-center">
        <p className="text-gray-600 mb-1">Código enviado a</p>
        <p className="font-semibold text-gray-900">{email}</p>
      </div>

      {success ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex justify-center"
        >
          <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
        </motion.div>
      ) : (
        <>
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={loading}
                className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all disabled:opacity-50"
              />
            ))}
          </div>

          {loading && (
            <div className="flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          )}

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <div className="flex flex-col gap-2 text-center">
            <button
              onClick={handleResend}
              className="text-orange-600 text-sm hover:underline"
            >
              Reenviar código
            </button>
            <button
              onClick={onBack}
              className="text-gray-500 text-sm hover:underline"
            >
              Usar otro email
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
