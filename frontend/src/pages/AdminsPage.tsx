import React, { useState, useEffect } from 'react';
import { adminsApi, Admin } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const roleBadge = (role: string) => {
  switch (role) {
    case 'SUPER_ADMIN':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Супер-админ</span>;
    case 'ADMIN':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold-100 text-gold-800">Админ</span>;
    case 'OPERATOR':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">Оператор</span>;
    default:
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{role}</span>;
  }
};

const AdminsPage: React.FC = () => {
  const { admin: currentAdmin } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Admin | null>(null);
  const [passwordModal, setPasswordModal] = useState<{ admin: Admin; password: string } | null>(null);

  // Create form state
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<'ADMIN' | 'OPERATOR'>('OPERATOR');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const isSuperAdmin = currentAdmin?.isSuperAdmin;

  const fetchAdmins = async () => {
    try {
      setIsLoading(true);
      const response = await adminsApi.getAll();
      setAdmins(response.data);
      setError(null);
    } catch (err) {
      setError('Ошибка загрузки списка');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  // Filter: regular admin sees only operators, super admin sees all
  const visibleAdmins = isSuperAdmin
    ? admins
    : admins.filter(a => a.role === 'OPERATOR');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createUsername.trim() || !createPassword.trim()) {
      setCreateError('Заполните все поля');
      return;
    }

    if (!createEmail.trim()) {
      setCreateError('Email обязателен');
      return;
    }

    if (createUsername.trim().length < 3) {
      setCreateError('Имя пользователя минимум 3 символа');
      return;
    }

    if (createPassword.length < 6) {
      setCreateError('Пароль минимум 6 символов');
      return;
    }

    try {
      setIsCreating(true);
      const roleToCreate = isSuperAdmin ? createRole : 'OPERATOR';
      await adminsApi.create({ username: createUsername.trim(), password: createPassword, email: createEmail.trim(), role: roleToCreate });
      setShowCreateModal(false);
      setCreateUsername('');
      setCreatePassword('');
      setCreateEmail('');
      setCreateRole('OPERATOR');
      await fetchAdmins();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Ошибка создания');
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await adminsApi.delete(deleteConfirm.id);
      await fetchAdmins();
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка удаления');
      setDeleteConfirm(null);
    }
  };

  const handleRegeneratePassword = async (admin: Admin) => {
    try {
      const response = await adminsApi.regeneratePassword(admin.id);
      setPasswordModal({
        admin,
        password: response.data.generatedPassword,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка генерации пароля');
    }
  };

  const pageTitle = isSuperAdmin ? 'Администраторы' : 'Операторы';
  const pageSubtitle = isSuperAdmin ? 'Управление админскими аккаунтами' : 'Управление операторами';
  const createModalTitle = isSuperAdmin ? 'Новый аккаунт' : 'Новый оператор';

  const totalCount = visibleAdmins.length;
  const operatorCount = visibleAdmins.filter(a => a.role === 'OPERATOR').length;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-500">Загрузка...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{pageSubtitle}</p>
        </div>
        <button onClick={() => { setShowCreateModal(true); setCreateError(null); setCreateUsername(''); setCreatePassword(''); setCreateEmail(''); setCreateRole('OPERATOR'); }} className="btn-primary">
          <PlusIcon />
          <span className="ml-2">Добавить</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Всего</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Операторы</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{operatorCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Имя</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Роль</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата создания</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">KPI</th>
                <th className="text-right px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleAdmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-600">
                          {admin.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-900">{admin.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {admin.email || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {roleBadge(admin.role)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(admin.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {admin._count?.createdKpis ?? 0}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleRegeneratePassword(admin)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Сгенерировать пароль"
                        disabled={admin.role === 'SUPER_ADMIN' && admin.id !== currentAdmin?.id}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      {admin.role !== 'SUPER_ADMIN' && admin.id !== currentAdmin?.id && (
                        <button
                          onClick={() => setDeleteConfirm(admin)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">{createModalTitle}</h3>
              <form onSubmit={handleCreate}>
                <div className="space-y-4">
                  {isSuperAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Роль</label>
                      <select
                        value={createRole}
                        onChange={(e) => setCreateRole(e.target.value as 'ADMIN' | 'OPERATOR')}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      >
                        <option value="OPERATOR">Оператор</option>
                        <option value="ADMIN">Админ</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Имя пользователя</label>
                    <input
                      type="text"
                      value={createUsername}
                      onChange={(e) => setCreateUsername(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="Введите имя пользователя"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
                    <input
                      type="text"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="Минимум 6 символов"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>
                {createError && (
                  <p className="mt-3 text-sm text-red-600">{createError}</p>
                )}
                <div className="flex items-center space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Отмена
                  </button>
                  <button type="submit" disabled={isCreating} className="btn-primary flex-1">
                    {isCreating ? 'Создание...' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Удалить {deleteConfirm.role === 'OPERATOR' ? 'оператора' : 'администратора'}?
              </h3>
              <p className="text-sm text-slate-500 text-center mb-6">
                {deleteConfirm.username} будет удален.
              </p>
              <div className="flex items-center space-x-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
                  Отмена
                </button>
                <button onClick={confirmDelete} className="btn-danger flex-1">
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPasswordModal(null)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Новый пароль
              </h3>
              <p className="text-sm text-slate-500 text-center mb-4">
                для {passwordModal.admin.username}
              </p>
              <div className="bg-slate-50 rounded-xl p-4 mb-6">
                <code className="block text-center text-lg font-mono font-medium text-slate-900 select-all">
                  {passwordModal.password}
                </code>
              </div>
              <p className="text-xs text-slate-400 text-center mb-6">
                Сохраните пароль — он показывается только один раз
              </p>
              <button onClick={() => setPasswordModal(null)} className="btn-primary w-full">
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AdminsPage;
