import React, { useState, useEffect, useCallback } from 'react';
import { auditLogApi, AuditLog, AuditLogPagination } from '../services/api';
import Layout from '../components/Layout';

const ACTION_LABELS: Record<string, string> = {
  ADMIN_CREATE: 'Создание админа',
  ADMIN_DELETE: 'Удаление админа',
  ADMIN_PASSWORD_REGENERATE: 'Смена пароля админа',
  USER_PROMOTE_TO_OPERATOR: 'Назначение оператором',
  USER_DEMOTE_FROM_OPERATOR: 'Снятие роли оператора',
  USER_APPROVE: 'Одобрение пользователя',
  USER_REJECT: 'Отклонение пользователя',
  GROUP_APPROVE: 'Одобрение группы',
  GROUP_REJECT: 'Отклонение группы',
  PENDING_USER_CREATE: 'Создание заявки (пользователь)',
  PENDING_GROUP_CREATE: 'Создание заявки (группа)',
  GROUP_UPDATE: 'Обновление группы',
  GROUP_SUBMIT_FOR_APPROVAL: 'Отправка группы на одобрение',
  USER_CREATE: 'Создание пользователя',
  USER_UPDATE: 'Обновление пользователя',
  USER_DELETE: 'Удаление пользователя',
  USER_PASSWORD_REGENERATE: 'Смена пароля пользователя',
  LOGIN_SUCCESS: 'Успешный вход',
  LOGIN_FAILURE: 'Неудачный вход',
  PASSWORD_RESET: 'Сброс пароля',
};

const ACTION_COLORS: Record<string, string> = {
  ADMIN_CREATE: 'bg-emerald-50 text-emerald-700',
  ADMIN_DELETE: 'bg-red-50 text-red-700',
  ADMIN_PASSWORD_REGENERATE: 'bg-amber-50 text-amber-700',
  USER_PROMOTE_TO_OPERATOR: 'bg-blue-50 text-blue-700',
  USER_DEMOTE_FROM_OPERATOR: 'bg-orange-50 text-orange-700',
  USER_APPROVE: 'bg-emerald-50 text-emerald-700',
  USER_REJECT: 'bg-red-50 text-red-700',
  GROUP_APPROVE: 'bg-emerald-50 text-emerald-700',
  GROUP_REJECT: 'bg-red-50 text-red-700',
  PENDING_USER_CREATE: 'bg-blue-50 text-blue-700',
  PENDING_GROUP_CREATE: 'bg-blue-50 text-blue-700',
  GROUP_UPDATE: 'bg-slate-100 text-slate-700',
  GROUP_SUBMIT_FOR_APPROVAL: 'bg-amber-50 text-amber-700',
  USER_CREATE: 'bg-emerald-50 text-emerald-700',
  USER_UPDATE: 'bg-slate-100 text-slate-700',
  USER_DELETE: 'bg-red-50 text-red-700',
  USER_PASSWORD_REGENERATE: 'bg-amber-50 text-amber-700',
  LOGIN_SUCCESS: 'bg-emerald-50 text-emerald-700',
  LOGIN_FAILURE: 'bg-red-50 text-red-700',
  PASSWORD_RESET: 'bg-amber-50 text-amber-700',
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Details modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: Record<string, unknown> = { page, limit: 30 };
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        params.dateTo = d.toISOString();
      }
      const res = await auditLogApi.getAll(params as any);
      setLogs(res.data.data);
      setPagination(res.data.pagination);
      setError(null);
    } catch {
      setError('Ошибка загрузки аудит-логов');
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterReset = () => {
    setActionFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Аудит-лог</h1>
        <p className="mt-1 text-sm text-slate-500">
          История всех действий в системе
          {pagination.total > 0 && <span className="ml-1">({pagination.total} записей)</span>}
        </p>
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

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Действие</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
            >
              <option value="">Все действия</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Дата от</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Дата до</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleFilterReset}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Сбросить
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-500">Загрузка...</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Действие</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Кто</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Объект</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                      Нет записей
                    </td>
                  </tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{log.actorName}</div>
                      <div className="text-xs text-slate-400">{log.actorType === 'ADMIN' ? 'Админ' : 'Пользователь'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {log.targetName ? (
                        <div>
                          <div className="text-sm text-slate-900">{log.targetName}</div>
                          <div className="text-xs text-slate-400">{log.targetType} #{log.targetId}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {log.details && (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Детали
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Стр. {pagination.page} из {pagination.totalPages}
              </p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Назад
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                        pageNum === page
                          ? 'bg-gold-500 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Вперёд
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedLog(null)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Детали события
              </h3>
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Действие</p>
                    <p className="text-sm font-medium text-slate-900">{ACTION_LABELS[selectedLog.action] || selectedLog.action}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Дата</p>
                    <p className="text-sm text-slate-900">{formatDate(selectedLog.createdAt)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Актор</p>
                    <p className="text-sm text-slate-900">{selectedLog.actorName}</p>
                    <p className="text-xs text-slate-400">{selectedLog.actorType} #{selectedLog.actorId}</p>
                  </div>
                  {selectedLog.targetName && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs font-medium text-slate-500 mb-1">Объект</p>
                      <p className="text-sm text-slate-900">{selectedLog.targetName}</p>
                      <p className="text-xs text-slate-400">{selectedLog.targetType} #{selectedLog.targetId}</p>
                    </div>
                  )}
                </div>
                {selectedLog.ipAddress && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">IP-адрес</p>
                    <p className="text-sm font-mono text-slate-900">{selectedLog.ipAddress}</p>
                  </div>
                )}
                {selectedLog.details && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Детали</p>
                    <pre className="text-sm font-mono text-slate-900 whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn-primary w-full">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AuditLogPage;
