'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LoginForm } from '@/components/auth/LoginForm';
import { OTPInput } from '@/components/auth/OTPInput';
import { OnboardingForm } from '@/components/auth/OnboardingForm';
import { useAuth } from '@/lib/auth';

type Step = 'email' | 'otp' | 'onboarding';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const { user, loading, needsOnboarding, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && profile && !needsOnboarding) {
      router.push('/');
    } else if (!loading && user && needsOnboarding) {
      setStep('onboarding');
    }
  }, [user, loading, needsOnboarding, profile, router]);

  const handleEmailSuccess = (submittedEmail: string) => {
    setEmail(submittedEmail);
    setStep('otp');
  };

  const handleOtpSuccess = () => {
    // Auth state will update automatically, check if onboarding is needed
    // The useEffect will handle the redirect
  };

  const handleOnboardingComplete = () => {
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-white text-3xl font-bold tracking-tight">
            ProSmart<span className="text-emerald-400">.</span>
          </h1>
          <p className="text-slate-400 mt-2">Technical Assistant</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <AnimatePresence mode="wait">
            {step === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Bienvenido</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Ingresa tu email para comenzar
                  </p>
                </div>
                <LoginForm onSuccess={handleEmailSuccess} />
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <OTPInput
                  email={email}
                  onSuccess={handleOtpSuccess}
                  onBack={() => setStep('email')}
                />
              </motion.div>
            )}

            {step === 'onboarding' && (
              <motion.div
                key="onboarding"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <OnboardingForm onComplete={handleOnboardingComplete} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          Asistente técnico basado en IA para documentación
        </p>
      </motion.div>
    </main>
  );
}
