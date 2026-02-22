import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { operatorApi, OperatorDashboard, User, Group, CreatePendingUserData } from '../services/api';

type Tab = 'dashboard' | 'users' | 'groups';

const statusBadge = (status?: string) => {
  switch (status) {
    case 'PENDING':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">На рассмотрении</span>;
    case 'APPROVED':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Одобрено</span>;
    case 'REJECTED':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Отклонено</span>;
    default:
      return null;
  }
};

const OperatorPage: React.FC = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<OperatorDashboard | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [approvedGroups, setApprovedGroups] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create user modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm] = useState<CreatePendingUserData>({
    fullName: '', position: '', groupId: 0, email: '',
    submitsBasicReport: false, submitsKpi: false, canAccessPlatform: false,
  });
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Create group modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchDashboard = async () => {
    try {
      const res = await operatorApi.getDashboard();
      setDashboard(res.data);
    } catch { /* ignore */ }
  };

  const fetchUsers = async () => {
    try {
      const res = await operatorApi.getUsers();
      setUsers(res.data);
    } catch { /* ignore */ }
  };

  const fetchGroups = async () => {
    try {
      const res = await operatorApi.getGroups();
      setGroups(res.data);
    } catch { /* ignore */ }
  };

  const fetchApprovedGroups = async () => {
    try {
      const res = await operatorApi.getApprovedGroups();
      setApprovedGroups(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchDashboard(), fetchUsers(), fetchGroups(), fetchApprovedGroups()]);
      setIsLoading(false);
    };
    load();
  }, []);

  const refreshAll = async () => {
    await Promise.all([fetchDashboard(), fetchUsers(), fetchGroups(), fetchApprovedGroups()]);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError(null);
    if (!userForm.fullName.trim() || !userForm.position.trim()) {
      setCreateUserError('Заполните ФИО и должность');
      return;
    }
    if (!userForm.groupId) {
      setCreateUserError('Выберите группу');
      return;
    }
    try {
      setIsCreatingUser(true);
      await operatorApi.createUser(userForm);
      setShowCreateUser(false);
      setUserForm({ fullName: '', position: '', groupId: 0, email: '', submitsBasicReport: false, submitsKpi: false, canAccessPlatform: false });
      await refreshAll();
    } catch (err: any) {
      setCreateUserError(err.response?.data?.error || 'Ошибка создания пользователя');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateGroupError(null);
    if (!groupName.trim()) {
      setCreateGroupError('Введите название группы');
      return;
    }
    try {
      setIsCreatingGroup(true);
      await operatorApi.createGroup(groupName.trim());
      setShowCreateGroup(false);
      setGroupName('');
      await refreshAll();
    } catch (err: any) {
      setCreateGroupError(err.response?.data?.error || 'Ошибка создания группы');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Дашборд' },
    { key: 'users', label: 'Пользователи' },
    { key: 'groups', label: 'Группы' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-brand-dark border-b border-brand-darker">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <img src="/logo.webp" alt="Altai Mai" className="h-8" />
              <div className="flex items-center space-x-1">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      tab === t.key
                        ? 'bg-gold-500/20 text-gold-500'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-3">
                <div className="w-8 h-8 bg-gold-500/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gold-500">
                    {admin?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-white/80">{admin?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white/50 hover:text-gold-500 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Выход</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
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

          {/* Dashboard Tab */}
          {tab === 'dashboard' && dashboard && (
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 mb-6">Дашборд</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Users stats */}
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Пользователи</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-amber-600">{dashboard.users.pending}</p>
                      <p className="text-xs text-slate-500 mt-1">На рассмотрении</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-emerald-600">{dashboard.users.approved}</p>
                      <p className="text-xs text-slate-500 mt-1">Одобрено</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-red-600">{dashboard.users.rejected}</p>
                      <p className="text-xs text-slate-500 mt-1">Отклонено</p>
                    </div>
                  </div>
                </div>
                {/* Groups stats */}
                <div className="card p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Группы</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-amber-600">{dashboard.groups.pending}</p>
                      <p className="text-xs text-slate-500 mt-1">На рассмотрении</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-emerald-600">{dashboard.groups.approved}</p>
                      <p className="text-xs text-slate-500 mt-1">Одобрено</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-red-600">{dashboard.groups.rejected}</p>
                      <p className="text-xs text-slate-500 mt-1">Отклонено</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {tab === 'users' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h1 className="text-2xl font-semibold text-slate-900">Пользователи</h1>
                <button
                  onClick={() => { setShowCreateUser(true); setCreateUserError(null); setUserForm({ fullName: '', position: '', groupId: 0, submitsBasicReport: false, submitsKpi: false, canAccessPlatform: false }); }}
                  className="btn-primary"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="ml-2">Добавить пользователя</span>
                </button>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">ФИО</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Должность</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Группа</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                            Нет пользователей
                          </td>
                        </tr>
                      ) : users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{user.fullName}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{user.position}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{user.group?.name || '—'}</td>
                          <td className="px-6 py-4">
                            {statusBadge(user.approvalStatus)}
                            {user.approvalStatus === 'REJECTED' && user.rejectionReason && (
                              <p className="text-xs text-red-500 mt-1">{user.rejectionReason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Groups Tab */}
          {tab === 'groups' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h1 className="text-2xl font-semibold text-slate-900">Группы</h1>
                <button
                  onClick={() => { setShowCreateGroup(true); setCreateGroupError(null); setGroupName(''); }}
                  className="btn-primary"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="ml-2">Добавить группу</span>
                </button>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Название</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {groups.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-sm text-slate-400">
                            Нет групп
                          </td>
                        </tr>
                      ) : groups.map((group) => (
                        <tr key={group.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{group.name}</td>
                          <td className="px-6 py-4">
                            {statusBadge(group.approvalStatus)}
                            {group.approvalStatus === 'REJECTED' && group.rejectionReason && (
                              <p className="text-xs text-red-500 mt-1">{group.rejectionReason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(group.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreateUser(false)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Новый пользователь</h3>
              <form onSubmit={handleCreateUser}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ФИО</label>
                    <input
                      type="text"
                      value={userForm.fullName}
                      onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="Иванов Иван Иванович"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Должность</label>
                    <input
                      type="text"
                      value={userForm.position}
                      onChange={(e) => setUserForm({ ...userForm, position: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="Менеджер"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={userForm.email || ''}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Группа</label>
                    <select
                      value={userForm.groupId}
                      onChange={(e) => setUserForm({ ...userForm, groupId: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                    >
                      <option value={0}>Выберите группу</option>
                      {approvedGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={userForm.submitsBasicReport}
                        onChange={(e) => setUserForm({ ...userForm, submitsBasicReport: e.target.checked })}
                        className="w-4 h-4 text-gold-500 border-slate-300 rounded focus:ring-gold-500"
                      />
                      <span className="text-sm text-slate-700">Сдает базовый отчет</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={userForm.submitsKpi}
                        onChange={(e) => setUserForm({ ...userForm, submitsKpi: e.target.checked })}
                        className="w-4 h-4 text-gold-500 border-slate-300 rounded focus:ring-gold-500"
                      />
                      <span className="text-sm text-slate-700">Сдает KPI</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={userForm.canAccessPlatform}
                        onChange={(e) => setUserForm({ ...userForm, canAccessPlatform: e.target.checked })}
                        className="w-4 h-4 text-gold-500 border-slate-300 rounded focus:ring-gold-500"
                      />
                      <span className="text-sm text-slate-700">Доступ к платформе</span>
                    </label>
                  </div>
                </div>
                {createUserError && (
                  <p className="mt-3 text-sm text-red-600">{createUserError}</p>
                )}
                <div className="flex items-center space-x-3 mt-6">
                  <button type="button" onClick={() => setShowCreateUser(false)} className="btn-secondary flex-1">
                    Отмена
                  </button>
                  <button type="submit" disabled={isCreatingUser} className="btn-primary flex-1">
                    {isCreatingUser ? 'Создание...' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreateGroup(false)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Новая группа</h3>
              <form onSubmit={handleCreateGroup}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Название группы</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                    placeholder="Введите название"
                    autoFocus
                  />
                </div>
                {createGroupError && (
                  <p className="mt-3 text-sm text-red-600">{createGroupError}</p>
                )}
                <div className="flex items-center space-x-3 mt-6">
                  <button type="button" onClick={() => setShowCreateGroup(false)} className="btn-secondary flex-1">
                    Отмена
                  </button>
                  <button type="submit" disabled={isCreatingGroup} className="btn-primary flex-1">
                    {isCreatingGroup ? 'Создание...' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorPage;
