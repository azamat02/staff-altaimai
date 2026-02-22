import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';

interface LoginFormData {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Reset password state
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setIsLoading(true);
    try {
      const role = await login(data.username.trim(), data.password.trim());
      if (role === 'admin') {
        navigate('/users');
      } else if (role === 'operator') {
        navigate('/operator');
      } else {
        navigate('/portal');
      }
    } catch (err) {
      setError('Неверный логин или пароль');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);

    if (!resetEmail.trim()) {
      setResetError('Введите email');
      return;
    }

    try {
      setIsResetting(true);
      const response = await authApi.resetPassword(resetEmail.trim());
      setResetMessage(response.data.message);
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Ошибка сброса пароля');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-light flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-dark p-12 flex-col justify-between">
        <div>
          <div className="flex items-center">
            <img src="/logo.webp" alt="Altai Mai" className="h-16" />
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Программная платформа оценки эффективности работников и управления KPI
          </h1>
          <div className="w-16 h-1 bg-gold-500 rounded-full"></div>
        </div>
        <div className="text-white/50 text-sm">
          2026 PrimeDev Technologies
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center">
              <img src="/logo.webp" alt="Altai Mai" className="h-16" />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">
              Вход в систему
            </h2>
            <p className="text-slate-500">
              Введите ваши учетные данные
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                Логин или Email
              </label>
              <input
                id="username"
                type="text"
                {...register('username', { required: 'Логин обязателен' })}
                className="input"
                placeholder="Введите логин или email"
              />
              {errors.username && (
                <p className="mt-2 text-sm text-red-500">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                {...register('password', { required: 'Пароль обязателен' })}
                className="input"
                placeholder="Введите пароль"
              />
              {errors.password && (
                <p className="mt-2 text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Вход...</span>
                </div>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setShowResetForm(true); setResetEmail(''); setResetMessage(null); setResetError(null); }}
              className="text-sm text-slate-500 hover:text-gold-600 transition-colors"
            >
              Забыли пароль?
            </button>
          </div>

        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowResetForm(false)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Сброс пароля</h3>
              <p className="text-sm text-slate-500 mb-6">
                Введите email, привязанный к вашему аккаунту. Новый пароль будет отправлен на почту.
              </p>

              {resetMessage ? (
                <div>
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
                    <p className="text-sm text-emerald-700">{resetMessage}</p>
                  </div>
                  <button
                    onClick={() => setShowResetForm(false)}
                    className="w-full py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <div className="mb-4">
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="Введите email"
                      autoFocus
                    />
                  </div>
                  {resetError && (
                    <p className="mb-4 text-sm text-red-600">{resetError}</p>
                  )}
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowResetForm(false)}
                      className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Назад
                    </button>
                    <button
                      type="submit"
                      disabled={isResetting}
                      className="flex-1 py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
                    >
                      {isResetting ? 'Отправка...' : 'Отправить'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
