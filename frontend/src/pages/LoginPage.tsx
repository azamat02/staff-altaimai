import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';

interface LoginFormData {
  username: string;
  password: string;
}

type ResetStep = 'email' | 'code' | 'newPassword' | 'success';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset password state
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

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

  const openResetModal = () => {
    setShowResetForm(true);
    setResetStep('email');
    setResetEmail('');
    setResetCode(['', '', '', '', '', '']);
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError(null);
  };

  const closeResetModal = () => {
    setShowResetForm(false);
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!resetEmail.trim()) {
      setResetError('Введите email');
      return;
    }

    try {
      setIsResetting(true);
      await authApi.requestResetCode(resetEmail.trim());
      setResetStep('code');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Ошибка отправки кода');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...resetCode];
    newCode[index] = value.slice(-1);
    setResetCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !resetCode[index] && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newCode = [...resetCode];
      for (let i = 0; i < 6; i++) {
        newCode[i] = pasted[i] || '';
      }
      setResetCode(newCode);
      const focusIndex = Math.min(pasted.length, 5);
      codeInputsRef.current[focusIndex]?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    const code = resetCode.join('');
    if (code.length !== 6) {
      setResetError('Введите 6-значный код');
      return;
    }

    try {
      setIsResetting(true);
      const response = await authApi.verifyResetCode(resetEmail.trim(), code);
      setResetToken(response.data.resetToken);
      setResetStep('newPassword');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Неверный код');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!newPassword) {
      setResetError('Введите новый пароль');
      return;
    }

    if (newPassword.length < 6) {
      setResetError('Пароль должен быть не менее 6 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Пароли не совпадают');
      return;
    }

    try {
      setIsResetting(true);
      await authApi.setNewPassword(resetToken, newPassword);
      setResetStep('success');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Ошибка установки пароля');
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', { required: 'Пароль обязателен' })}
                  className="input pr-10"
                  placeholder="Введите пароль"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
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
              onClick={openResetModal}
              className="text-sm text-slate-500 hover:text-gold-600 transition-colors"
            >
              Забыли пароль?
            </button>
          </div>

        </div>
      </div>

      {/* Reset Password Modal — 4-step wizard */}
      {showResetForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeResetModal} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">

              {/* Step 1: Email */}
              {resetStep === 'email' && (
                <>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Сброс пароля</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Введите email, привязанный к вашему аккаунту. Код для сброса будет отправлен на почту.
                  </p>
                  <form onSubmit={handleRequestCode}>
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
                        onClick={closeResetModal}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Назад
                      </button>
                      <button
                        type="submit"
                        disabled={isResetting}
                        className="flex-1 py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Отправка...' : 'Отправить код'}
                      </button>
                    </div>
                  </form>
                </>
              )}

              {/* Step 2: Code input */}
              {resetStep === 'code' && (
                <>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Введите код</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Код отправлен на <strong>{resetEmail}</strong>. Код действителен 10 минут.
                  </p>
                  <form onSubmit={handleVerifyCode}>
                    <div className="flex justify-center gap-2 mb-4" onPaste={handleCodePaste}>
                      {resetCode.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => { codeInputsRef.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleCodeInput(i, e.target.value)}
                          onKeyDown={(e) => handleCodeKeyDown(i, e)}
                          className="w-11 h-13 text-center text-lg font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                          autoFocus={i === 0}
                        />
                      ))}
                    </div>
                    {resetError && (
                      <p className="mb-4 text-sm text-red-600 text-center">{resetError}</p>
                    )}
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => { setResetStep('email'); setResetError(null); }}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Назад
                      </button>
                      <button
                        type="submit"
                        disabled={isResetting || resetCode.join('').length !== 6}
                        className="flex-1 py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Проверка...' : 'Подтвердить'}
                      </button>
                    </div>
                  </form>
                </>
              )}

              {/* Step 3: New password */}
              {resetStep === 'newPassword' && (
                <>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Новый пароль</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Установите новый пароль для вашего аккаунта.
                  </p>
                  <form onSubmit={handleSetNewPassword}>
                    <div className="space-y-3 mb-4">
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                          placeholder="Новый пароль (мин. 6 символов)"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                        placeholder="Подтвердите пароль"
                      />
                    </div>
                    {resetError && (
                      <p className="mb-4 text-sm text-red-600">{resetError}</p>
                    )}
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={closeResetModal}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={isResetting}
                        className="flex-1 py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
                  </form>
                </>
              )}

              {/* Step 4: Success */}
              {resetStep === 'success' && (
                <div className="text-center">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Пароль изменён</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Пароль успешно изменён. Теперь вы можете войти с новым паролем.
                  </p>
                  <button
                    onClick={closeResetModal}
                    className="w-full py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
