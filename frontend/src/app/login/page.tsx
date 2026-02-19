'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LoginForm } from '@/components/auth/LoginForm';
import { OTPInput } from '@/components/auth/OTPInput';
import { OnboardingForm } from '@/components/auth/OnboardingForm';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { Loader2, Mail, ArrowLeft, CheckCircle, Send } from 'lucide-react';

type Step = 'auth' | 'verify-email' | 'onboarding' | 'forgot-password';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('auth');
  const [email, setEmail] = useState('');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const { user, loading, needsOnboarding, profile, resetPasswordForEmail } = useAuth();
  const router = useRouter();

  // Auto-redirect when auth state changes
  useEffect(() => {
    if (!loading && user && profile && !needsOnboarding) {
      if (isAdminEmail(user.email)) {
        router.replace('/admin');
      } else {
        router.replace('/');
      }
    } else if (!loading && user && needsOnboarding) {
      setStep('onboarding');
    }
  }, [user, loading, needsOnboarding, profile, router]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleLoginSuccess = () => {
    // Auth state will update via signIn, useEffect handles redirect
  };

  const handleRegisterSuccess = (submittedEmail: string) => {
    setEmail(submittedEmail);
    setStep('verify-email');
  };

  const handleForgotPassword = (emailFromForm: string) => {
    setForgotEmail(emailFromForm || '');
    setForgotSent(false);
    setForgotError('');
    setStep('forgot-password');
  };

  const handleSendRecovery = async () => {
    if (!forgotEmail) return;
    setForgotError('');
    setForgotLoading(true);

    const { error } = await resetPasswordForEmail(forgotEmail);
    setForgotLoading(false);

    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSent(true);
    }
  };

  const handleOtpSuccess = () => {
    // Auth state will update via verifyOtp
    // useEffect will catch needsOnboarding and set step to 'onboarding'
  };

  const handleOnboardingComplete = () => {
    router.push('/');
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/logo-psf.png" alt="Pro Smart Factories" className="w-16 h-16 object-contain mb-4" />
          <h1 className="text-white text-3xl font-bold tracking-tight">
            Pro Smart Factories
          </h1>
          <p className="text-orange-400 mt-2 font-medium">Encargado Digital</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <AnimatePresence mode="wait">
            {/* ============================================================ */}
            {/* STEP: AUTH (Login / Register) */}
            {/* ============================================================ */}
            {step === 'auth' && (
              <motion.div
                key="auth"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <LoginForm
                  onLoginSuccess={handleLoginSuccess}
                  onRegisterSuccess={handleRegisterSuccess}
                  onForgotPassword={handleForgotPassword}
                />
              </motion.div>
            )}

            {/* ============================================================ */}
            {/* STEP: VERIFY EMAIL (OTP after registration) */}
            {/* ============================================================ */}
            {step === 'verify-email' && (
              <motion.div
                key="verify-email"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <OTPInput
                  email={email}
                  onSuccess={handleOtpSuccess}
                  onBack={() => setStep('auth')}
                  verifyType="signup"
                  backLabel="Volver al registro"
                />
              </motion.div>
            )}

            {/* ============================================================ */}
            {/* STEP: ONBOARDING (Name + Company) */}
            {/* ============================================================ */}
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

            {/* ============================================================ */}
            {/* STEP: FORGOT PASSWORD */}
            {/* ============================================================ */}
            {step === 'forgot-password' && (
              <motion.div
                key="forgot-password"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                {forgotSent ? (
                  /* Success: email sent */
                  <div className="text-center space-y-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex justify-center"
                    >
                      <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-white" />
                      </div>
                    </motion.div>

                    <h2 className="text-xl font-bold text-gray-900">Email enviado</h2>
                    <p className="text-gray-500 text-sm">
                      Hemos enviado un enlace de recuperación a
                    </p>
                    <p className="font-semibold text-gray-900">{forgotEmail}</p>
                    <p className="text-gray-400 text-xs mt-2">
                      Revisa tu bandeja de entrada y haz clic en el enlace para restablecer tu contraseña.
                    </p>

                    <button
                      onClick={() => { setStep('auth'); setForgotSent(false); }}
                      className="w-full bg-orange-500 text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 mt-4"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Volver al inicio de sesión
                    </button>
                  </div>
                ) : (
                  /* Form: enter email */
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <div className="flex justify-center mb-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                          <Mail className="w-6 h-6 text-orange-500" />
                        </div>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">Recuperar contraseña</h2>
                      <p className="text-gray-500 text-sm mt-1">
                        Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && forgotEmail && handleSendRecovery()}
                          placeholder="tu@empresa.com"
                          required
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                          autoFocus
                        />
                      </div>
                    </div>

                    {forgotError && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-red-500 text-sm"
                      >
                        {forgotError}
                      </motion.p>
                    )}

                    <button
                      onClick={handleSendRecovery}
                      disabled={forgotLoading || !forgotEmail}
                      className="w-full bg-orange-500 text-white py-3 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {forgotLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Enviar enlace de recuperación
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => { setStep('auth'); setForgotError(''); }}
                      className="w-full text-gray-500 text-sm hover:text-gray-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Volver al inicio de sesión
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          Encargado Digital basado en IA para documentación técnica
        </p>
      </motion.div>
    </main>
  );
}
