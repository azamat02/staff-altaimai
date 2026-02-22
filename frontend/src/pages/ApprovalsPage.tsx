import React, { useState, useEffect } from 'react';
import { approvalsApi, User, Group } from '../services/api';
import Layout from '../components/Layout';

type Tab = 'users' | 'groups';

const ApprovalsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('users');
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [pendingGroups, setPendingGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<{ type: 'user' | 'group'; id: number; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Credentials modal (after user approval)
  const [credentialsModal, setCredentialsModal] = useState<{ login: string; password: string } | null>(null);

  // Processing state
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchPending = async () => {
    try {
      setIsLoading(true);
      const res = await approvalsApi.getPending();
      setPendingUsers(res.data.users);
      setPendingGroups(res.data.groups);
      setError(null);
    } catch {
      setError('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApproveUser = async (userId: number) => {
    try {
      setProcessingId(userId);
      const res = await approvalsApi.approveUser(userId);
      const approved = res.data;
      if (approved.generatedLogin && approved.generatedPassword) {
        setCredentialsModal({
          login: approved.generatedLogin,
          password: approved.generatedPassword,
        });
      }
      await fetchPending();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка одобрения');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveGroup = async (groupId: number) => {
    try {
      setProcessingId(groupId);
      await approvalsApi.approveGroup(groupId);
      await fetchPending();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка одобрения');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      setIsRejecting(true);
      if (rejectTarget.type === 'user') {
        await approvalsApi.rejectUser(rejectTarget.id, rejectReason || undefined);
      } else {
        await approvalsApi.rejectGroup(rejectTarget.id, rejectReason || undefined);
      }
      setRejectTarget(null);
      setRejectReason('');
      await fetchPending();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка отклонения');
    } finally {
      setIsRejecting(false);
    }
  };

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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Одобрения</h1>
        <p className="mt-1 text-sm text-slate-500">Заявки операторов на создание пользователей и групп</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="p-1 text-red-400 hover:text-red-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Пользователи
          {pendingUsers.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              {pendingUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'groups' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Группы
          {pendingGroups.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              {pendingGroups.length}
            </span>
          )}
        </button>
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">ФИО</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Должность</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Группа</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Оператор</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                      Нет заявок на рассмотрение
                    </td>
                  </tr>
                ) : pendingUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{user.fullName}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{user.position}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{user.group?.name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{user.createdByAdmin?.username || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleApproveUser(user.id)}
                          disabled={processingId === user.id}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Одобрить
                        </button>
                        <button
                          onClick={() => setRejectTarget({ type: 'user', id: user.id, name: user.fullName })}
                          disabled={processingId === user.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Отклонить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Groups Tab */}
      {tab === 'groups' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Название</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Оператор</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-400">
                      Нет заявок на рассмотрение
                    </td>
                  </tr>
                ) : pendingGroups.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{group.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{group.createdByAdmin?.username || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(group.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleApproveGroup(group.id)}
                          disabled={processingId === group.id}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Одобрить
                        </button>
                        <button
                          onClick={() => setRejectTarget({ type: 'group', id: group.id, name: group.name })}
                          disabled={processingId === group.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Отклонить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Отклонить заявку?
              </h3>
              <p className="text-sm text-slate-500 text-center mb-4">
                {rejectTarget.name}
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">Причина отклонения (необязательно)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Укажите причину..."
                />
              </div>
              <div className="flex items-center space-x-3">
                <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="btn-secondary flex-1">
                  Отмена
                </button>
                <button onClick={handleReject} disabled={isRejecting} className="btn-danger flex-1">
                  {isRejecting ? 'Отклонение...' : 'Отклонить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setCredentialsModal(null)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Пользователь одобрен
              </h3>
              <p className="text-sm text-slate-500 text-center mb-4">
                Данные для входа:
              </p>
              <div className="space-y-3 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Логин</p>
                  <code className="block text-sm font-mono font-medium text-slate-900 select-all">
                    {credentialsModal.login}
                  </code>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Пароль</p>
                  <code className="block text-sm font-mono font-medium text-slate-900 select-all">
                    {credentialsModal.password}
                  </code>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center mb-6">
                Сохраните данные — они показываются только один раз
              </p>
              <button onClick={() => setCredentialsModal(null)} className="btn-primary w-full">
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ApprovalsPage;
