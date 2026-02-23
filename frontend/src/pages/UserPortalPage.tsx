import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Kpi, MyKpiAssignment, kpisApi, KpiStatus, authApi } from '../services/api';

type ViewMode = 'hierarchy' | 'groups';

// Интерфейс для узла дерева групп
interface GroupNode {
  groupId: number;
  groupName: string;
  users: User[];
  childGroups: GroupNode[];
}

const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const ClipboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

// Структурирование плоского списка в дерево
const buildTree = (subordinates: User[], parentId: number): User[] => {
  return subordinates
    .filter((s) => s.managerId === parentId)
    .map((s) => ({
      ...s,
      subordinatesTree: buildTree(subordinates, s.id),
    }));
};

// Рекурсивный компонент для отображения дерева подчиненных
const SubordinateTree: React.FC<{ subordinates: User[]; level?: number }> = ({
  subordinates,
  level = 0,
}) => {
  if (subordinates.length === 0) return null;

  return (
    <div className={`${level > 0 ? 'ml-8 pl-4 border-l border-slate-200' : ''}`}>
      {subordinates.map((sub) => (
        <div key={sub.id} className="py-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-slate-600">
                {sub.fullName.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{sub.fullName}</p>
              <p className="text-xs text-slate-500">
                {sub.position} {sub.group?.name && `· ${sub.group.name}`}
              </p>
            </div>
          </div>
          {sub.subordinatesTree && sub.subordinatesTree.length > 0 && (
            <SubordinateTree subordinates={sub.subordinatesTree} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
};

// Функция построения иерархии групп из дерева подчиненных
const buildGroupTree = (
  subordinates: User[],
  parentGroupName: string | null = null
): { groups: GroupNode[]; sameGroupUsers: User[] } => {
  const groupMap = new Map<string, GroupNode>();
  const sameGroupUsers: User[] = [];

  const getOrCreateGroup = (user: User): GroupNode => {
    const groupName = user.group?.name || 'Без группы';
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {
        groupId: user.group?.id || 0,
        groupName,
        users: [],
        childGroups: [],
      });
    }
    return groupMap.get(groupName)!;
  };

  const mergeChildGroups = (target: GroupNode, childGroups: GroupNode[]) => {
    for (const child of childGroups) {
      const existing = target.childGroups.find(g => g.groupName === child.groupName);
      if (existing) {
        existing.users.push(...child.users);
        mergeChildGroups(existing, child.childGroups);
      } else {
        target.childGroups.push(child);
      }
    }
  };

  for (const user of subordinates) {
    const userGroupName = user.group?.name || 'Без группы';

    if (userGroupName === parentGroupName) {
      // Пользователь в той же группе что и родитель - добавляем в sameGroupUsers
      sameGroupUsers.push(user);

      // Но его подчиненных обрабатываем рекурсивно
      if (user.subordinatesTree && user.subordinatesTree.length > 0) {
        const result = buildGroupTree(user.subordinatesTree, userGroupName);

        // Подчиненные той же группы тоже добавляются в sameGroupUsers
        sameGroupUsers.push(...result.sameGroupUsers);

        // Дочерние группы мержим в groupMap
        for (const childGroup of result.groups) {
          const existing = groupMap.get(childGroup.groupName);
          if (existing) {
            existing.users.push(...childGroup.users);
            mergeChildGroups(existing, childGroup.childGroups);
          } else {
            groupMap.set(childGroup.groupName, childGroup);
          }
        }
      }
    } else {
      // Пользователь в другой группе - создаем/получаем узел группы
      const node = getOrCreateGroup(user);
      node.users.push(user);

      // Рекурсивно обрабатываем подчиненных
      if (user.subordinatesTree && user.subordinatesTree.length > 0) {
        const result = buildGroupTree(user.subordinatesTree, userGroupName);

        // Подчиненные той же группы добавляются в эту группу
        node.users.push(...result.sameGroupUsers);

        // Дочерние группы мержим
        mergeChildGroups(node, result.groups);
      }
    }
  }

  return { groups: Array.from(groupMap.values()), sameGroupUsers };
};

// Обертка для вызова из компонента
const buildGroupTreeRoot = (subordinates: User[]): GroupNode[] => {
  const result = buildGroupTree(subordinates, null);
  return result.groups;
};

// Рекурсивный подсчет пользователей в группе (включая вложенные)
const countUsersInGroup = (group: GroupNode): number => {
  let count = group.users.length;
  for (const child of group.childGroups) {
    count += countUsersInGroup(child);
  }
  return count;
};

// Рекурсивный компонент для отображения узла дерева групп
const GroupTreeNode: React.FC<{
  group: GroupNode;
  level?: number;
}> = ({ group, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const totalCount = countUsersInGroup(group);
  const hasChildren = group.childGroups.length > 0;

  return (
    <div className={level > 0 ? 'ml-6 pl-4 border-l border-slate-200' : ''}>
      <div className="py-2">
        <button
          onClick={() => hasChildren && setIsExpanded(!isExpanded)}
          className={`flex items-center space-x-2 w-full text-left group ${!hasChildren ? 'cursor-default' : ''}`}
        >
          {hasChildren ? (
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
            </div>
          )}
          <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
            {group.groupName}
          </span>
          <span className="text-xs text-slate-400">({totalCount})</span>
        </button>
        {isExpanded && hasChildren && (
          <div className="ml-6 pl-4 border-l border-slate-200 mt-1">
            {group.childGroups.map((child) => (
              <GroupTreeNode key={child.groupName} group={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Компонент для отображения подчиненных по группам с иерархией
const SubordinatesByGroup: React.FC<{ subordinatesTree: User[] }> = ({ subordinatesTree }) => {
  const groupTree = buildGroupTreeRoot(subordinatesTree);

  if (groupTree.length === 0) return null;

  return (
    <div>
      {groupTree.map((group) => (
        <GroupTreeNode key={group.groupName} group={group} />
      ))}
    </div>
  );
};

// Icons for KPI sections
const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

// Status badge component
const StatusBadge: React.FC<{ status: KpiStatus }> = ({ status }) => {
  const config: Record<KpiStatus, { label: string; className: string }> = {
    DRAFT: { label: 'Черновик', className: 'badge-gray' },
    PENDING_APPROVAL: { label: 'На согласовании', className: 'badge-warning' },
    REJECTED: { label: 'Отклонен', className: 'badge-error' },
    APPROVED: { label: 'Утвержден', className: 'badge-success' },
    COMPLETED: { label: 'Завершен', className: 'badge-info' },
  };
  const { label, className } = config[status];
  return <span className={className}>{label}</span>;
};

// KPI Approval Section (for approvers)
const KpiApprovalSection: React.FC = () => {
  const [pendingKpis, setPendingKpis] = useState<Kpi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<Kpi | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPendingKpis = async () => {
    try {
      setIsLoading(true);
      const response = await kpisApi.getPendingApproval();
      setPendingKpis(response.data);
      setError(null);
    } catch (err) {
      setError('Ошибка загрузки KPI');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingKpis();
  }, []);

  const handleApprove = async (kpiId: number) => {
    if (!confirm('Утвердить этот KPI?')) return;
    setIsSubmitting(true);
    try {
      await kpisApi.approve(kpiId);
      await fetchPendingKpis();
      setSelectedKpi(null);
    } catch (err) {
      setError('Ошибка утверждения KPI');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (kpiId: number) => {
    if (!rejectReason.trim()) {
      setError('Укажите причину отклонения');
      return;
    }
    setIsSubmitting(true);
    try {
      await kpisApi.reject(kpiId, rejectReason);
      await fetchPendingKpis();
      setSelectedKpi(null);
      setShowRejectModal(false);
      setRejectReason('');
    } catch (err) {
      setError('Ошибка отклонения KPI');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">KPI на утверждение</h2>
        </div>
        <div className="p-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (pendingKpis.length === 0) {
    return null;
  }

  return (
    <div className="card mb-6">
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">KPI на утверждение</h2>
          <span className="badge-warning">{pendingKpis.length}</span>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="divide-y divide-slate-100">
        {pendingKpis.map((kpi) => (
          <div key={kpi.id} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <button
                  onClick={() => setSelectedKpi(kpi)}
                  className="text-sm font-medium text-gold-600 hover:text-gold-700"
                >
                  {kpi.title}
                </button>
                {kpi.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{kpi.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span>Срок: {new Date(kpi.deadline).toLocaleDateString('ru-RU')}</span>
                  <span>Блоков: {(kpi.blocks || []).length}</span>
                  <span>Сотрудников: {kpi.assignments.length}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedKpi(kpi)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Просмотреть"
                >
                  <EyeIcon />
                </button>
                <button
                  onClick={() => handleApprove(kpi.id)}
                  disabled={isSubmitting}
                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  title="Утвердить"
                >
                  <CheckIcon />
                </button>
                <button
                  onClick={() => {
                    setSelectedKpi(kpi);
                    setShowRejectModal(true);
                  }}
                  disabled={isSubmitting}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Отклонить"
                >
                  <XIcon />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KPI Detail Modal */}
      {selectedKpi && !showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedKpi.title}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Срок: {new Date(selectedKpi.deadline).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <button onClick={() => setSelectedKpi(null)} className="text-slate-400 hover:text-slate-600">
                <CloseIcon />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedKpi.description && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Описание</h3>
                  <p className="text-sm text-slate-600">{selectedKpi.description}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">
                  Блоки и показатели ({(selectedKpi.blocks || []).length})
                </h3>
                {(selectedKpi.blocks || []).length > 0 ? (
                  <div className="space-y-3">
                    {selectedKpi.blocks.map((block, blockIndex) => (
                      <div key={block.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                          <span className="font-medium text-sm text-slate-900">
                            {blockIndex + 1}. {block.name}
                          </span>
                          <span className="text-xs text-slate-500">Вес: {block.weight}%</span>
                        </div>
                        {(block.tasks || []).length > 0 && (
                          <div className="divide-y divide-slate-100">
                            {block.tasks.map((task, taskIndex) => (
                              <div key={task.id} className="px-4 py-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-slate-700">
                                    <span className="font-medium text-slate-500">{blockIndex + 1}.{taskIndex + 1}</span>{' '}
                                    {task.name}
                                  </span>
                                  <span className="text-xs text-slate-500">Вес: {task.weight}%</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                  <span>План: {task.planValue || 100} {task.unit || 'шт'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Нет блоков</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">
                  Назначенные сотрудники ({selectedKpi.assignments.length})
                </h3>
                <div className="space-y-2">
                  {selectedKpi.assignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-slate-600">
                          {assignment.user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{assignment.user.fullName}</p>
                        <p className="text-xs text-slate-500">{assignment.user.position}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(true);
                }}
                disabled={isSubmitting}
                className="btn-secondary flex items-center gap-2"
              >
                <XIcon /> Отклонить
              </button>
              <button
                onClick={() => handleApprove(selectedKpi.id)}
                disabled={isSubmitting}
                className="btn-primary flex items-center gap-2"
              >
                <CheckIcon /> Утвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedKpi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Отклонить KPI</h3>
            <p className="text-sm text-slate-600 mb-4">
              Укажите причину отклонения KPI "{selectedKpi.title}"
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="input-field min-h-[100px] mb-4"
              placeholder="Причина отклонения..."
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                className="btn-secondary"
              >
                Отмена
              </button>
              <button
                onClick={() => handleReject(selectedKpi.id)}
                disabled={isSubmitting || !rejectReason.trim()}
                className="btn-danger"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// My KPIs Section (for employees)
const MyKpisSection: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<MyKpiAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMyKpis = async () => {
    try {
      setIsLoading(true);
      const response = await kpisApi.getMyKpis();
      setAssignments(response.data);
      setError(null);
    } catch (err) {
      setError('Ошибка загрузки KPI');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyKpis();
  }, []);

  // Helper to get all tasks from blocks
  const getAllTasks = (blocks: MyKpiAssignment['kpi']['blocks']) => {
    return (blocks || []).flatMap((block) => block.tasks || []);
  };

  if (isLoading) {
    return (
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Мои KPI</h2>
        </div>
        <div className="p-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return null;
  }

  return (
    <div className="card mb-6">
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Мои KPI</h2>
          <span className="badge-info">{assignments.length}</span>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="divide-y divide-slate-100">
        {assignments.map((assignment) => {
          const filledCount = assignment.factValues.filter((f) => f.factValue !== null).length;
          const totalTasks = getAllTasks(assignment.kpi.blocks).length;
          const progress = totalTasks > 0 ? Math.round((filledCount / totalTasks) * 100) : 0;

          return (
            <div key={assignment.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/my-kpis/${assignment.kpi.id}`)}
                      className="text-sm font-medium text-gold-600 hover:text-gold-700"
                    >
                      {assignment.kpi.title}
                    </button>
                    {assignment.isSubmitted ? (
                      <span className="badge-success text-xs">Отправлено</span>
                    ) : (
                      <StatusBadge status={assignment.kpi.status} />
                    )}
                  </div>
                  {assignment.kpi.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {assignment.kpi.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>Срок: {new Date(assignment.kpi.deadline).toLocaleDateString('ru-RU')}</span>
                    <span>
                      Заполнено: {filledCount}/{totalTasks}
                    </span>
                  </div>
                  {!assignment.isSubmitted && (
                    <div className="mt-3 w-full max-w-xs">
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gold-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/my-kpis/${assignment.kpi.id}`)}
                  className="btn-secondary text-sm"
                >
                  {assignment.isSubmitted ? 'Просмотреть' : 'Заполнить'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Personal Cabinet Modal
type CabinetResetStep = 'idle' | 'code' | 'newPassword' | 'success';

const PersonalCabinetModal: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
  // Change password via current password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Reset via email code
  const [resetStep, setResetStep] = useState<CabinetResetStep>('idle');
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Все поля обязательны');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Новый пароль должен быть не менее 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('Новый пароль должен отличаться от текущего');
      return;
    }

    try {
      setIsChangingPassword(true);
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Пароль успешно изменён');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || 'Ошибка смены пароля');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRequestResetCode = async () => {
    setResetError(null);
    try {
      setIsResetting(true);
      await authApi.requestResetCode(user.email!);
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
      for (let i = 0; i < 6; i++) newCode[i] = pasted[i] || '';
      setResetCode(newCode);
      codeInputsRef.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    const code = resetCode.join('');
    if (code.length !== 6) { setResetError('Введите 6-значный код'); return; }
    try {
      setIsResetting(true);
      const response = await authApi.verifyResetCode(user.email!, code);
      setResetToken(response.data.resetToken);
      setResetStep('newPassword');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Неверный код');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSetResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetNewPassword) { setResetError('Введите новый пароль'); return; }
    if (resetNewPassword.length < 6) { setResetError('Пароль должен быть не менее 6 символов'); return; }
    if (resetNewPassword !== resetConfirmPassword) { setResetError('Пароли не совпадают'); return; }
    try {
      setIsResetting(true);
      await authApi.setNewPassword(resetToken, resetNewPassword);
      setResetStep('success');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Ошибка установки пароля');
    } finally {
      setIsResetting(false);
    }
  };

  const EyeToggle: React.FC<{ show: boolean; toggle: () => void }> = ({ show, toggle }) => (
    <button type="button" onClick={toggle} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
      {show ? (
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
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between rounded-t-2xl z-10">
            <h2 className="text-lg font-semibold text-slate-900">Личный кабинет</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Profile section */}
            <div>
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Профиль</h3>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">ФИО</span>
                  <span className="text-sm font-medium text-slate-900">{user.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Должность</span>
                  <span className="text-sm font-medium text-slate-900">{user.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Группа</span>
                  <span className="text-sm font-medium text-slate-900">{user.group?.name}</span>
                </div>
                {user.email && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Email</span>
                    <span className="text-sm font-medium text-slate-900">{user.email}</span>
                  </div>
                )}
                {user.login && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Логин</span>
                    <span className="text-sm font-medium text-slate-900">{user.login}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Change password section */}
            <div>
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Смена пароля</h3>
              <form onSubmit={handleChangePassword} className="space-y-3">
                {passwordError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-sm text-red-600">{passwordError}</p>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <p className="text-sm text-emerald-700">{passwordSuccess}</p>
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                    placeholder="Текущий пароль"
                  />
                  <EyeToggle show={showCurrentPw} toggle={() => setShowCurrentPw(!showCurrentPw)} />
                </div>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                    placeholder="Новый пароль (мин. 6 символов)"
                  />
                  <EyeToggle show={showNewPw} toggle={() => setShowNewPw(!showNewPw)} />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                  placeholder="Подтверждение пароля"
                />
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="w-full py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50"
                >
                  {isChangingPassword ? 'Сохранение...' : 'Сменить пароль'}
                </button>
              </form>
            </div>

            {/* Reset via email section */}
            {user.email && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Сброс через email</h3>

                {resetStep === 'idle' && (
                  <div>
                    {resetError && (
                      <p className="mb-3 text-sm text-red-600">{resetError}</p>
                    )}
                    <button
                      onClick={handleRequestResetCode}
                      disabled={isResetting}
                      className="w-full py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                      {isResetting ? 'Отправка...' : `Отправить код на ${user.email}`}
                    </button>
                  </div>
                )}

                {resetStep === 'code' && (
                  <form onSubmit={handleVerifyCode}>
                    <p className="text-sm text-slate-500 mb-3">
                      Код отправлен на <strong>{user.email}</strong>
                    </p>
                    <div className="flex justify-center gap-2 mb-3" onPaste={handleCodePaste}>
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
                    {resetError && <p className="mb-3 text-sm text-red-600 text-center">{resetError}</p>}
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setResetStep('idle'); setResetError(null); setResetCode(['','','','','','']); }}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                        Назад
                      </button>
                      <button type="submit" disabled={isResetting || resetCode.join('').length !== 6}
                        className="flex-1 py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50">
                        {isResetting ? 'Проверка...' : 'Подтвердить'}
                      </button>
                    </div>
                  </form>
                )}

                {resetStep === 'newPassword' && (
                  <form onSubmit={handleSetResetPassword}>
                    <div className="space-y-3 mb-3">
                      <div className="relative">
                        <input
                          type={showResetPw ? 'text' : 'password'}
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                          placeholder="Новый пароль (мин. 6 символов)"
                          autoFocus
                        />
                        <EyeToggle show={showResetPw} toggle={() => setShowResetPw(!showResetPw)} />
                      </div>
                      <input
                        type="password"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                        placeholder="Подтвердите пароль"
                      />
                    </div>
                    {resetError && <p className="mb-3 text-sm text-red-600">{resetError}</p>}
                    <button type="submit" disabled={isResetting}
                      className="w-full py-2.5 text-sm font-medium text-brand-dark bg-gold-500 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50">
                      {isResetting ? 'Сохранение...' : 'Сохранить пароль'}
                    </button>
                  </form>
                )}

                {resetStep === 'success' && (
                  <div className="text-center py-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-700 font-medium">Пароль успешно изменён через email</p>
                    <button onClick={() => setResetStep('idle')}
                      className="mt-3 text-sm text-gold-600 hover:text-gold-700">
                      Готово
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const UserPortalPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('hierarchy');
  const [showCabinet, setShowCabinet] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  const subordinatesTree = user.subordinatesTree
    ? buildTree(user.subordinatesTree, user.id)
    : [];

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-brand-dark border-b border-brand-darker">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <img src="/logo.webp" alt="Altai Mai" className="h-8" />
            </div>
            <div className="flex items-center space-x-2">
              {user.subordinatesTree && user.subordinatesTree.length > 0 && (
                <button
                  onClick={() => navigate('/evaluations')}
                  className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white/70 hover:text-gold-500 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ClipboardIcon />
                  <span>Оценка сотрудников</span>
                </button>
              )}
              {user.isOperator && (
                <button
                  onClick={() => navigate('/operator')}
                  className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white/70 hover:text-gold-500 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Панель оператора</span>
                </button>
              )}
              <button
                onClick={() => setShowCabinet(true)}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white/70 hover:text-gold-500 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span>Личный кабинет</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white/50 hover:text-gold-500 hover:bg-white/10 rounded-lg transition-colors"
              >
                <LogoutIcon />
                <span>Выход</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Profile Card */}
          <div className="card p-6 mb-6">
            <div className="flex items-start space-x-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-semibold text-slate-600">
                  {user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-slate-900">{user.fullName}</h1>
                <p className="text-slate-500 mt-1">{user.position}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="badge-info">{user.group?.name}</span>
                  {user.submitsBasicReport && (
                    <span className="badge-success">Базовый отчет</span>
                  )}
                  {user.submitsKpi && (
                    <span className="badge-warning">KPI</span>
                  )}
                </div>
              </div>
            </div>

            {user.manager && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                  Руководитель
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-slate-600">
                      {user.manager.fullName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{user.manager.fullName}</p>
                    <p className="text-xs text-slate-500">{user.manager.position}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* KPI Approval Section (for approvers) */}
          <KpiApprovalSection />

          {/* My KPIs Section (for employees) */}
          <MyKpisSection />

          {/* Subordinates Card */}
          <div className="card">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Подчиненные</h2>
                {user.subordinatesTree && user.subordinatesTree.length > 0 && (
                  <span className="badge-gray">
                    {user.subordinatesTree.length}
                  </span>
                )}
              </div>
              {user.subordinatesTree && user.subordinatesTree.length > 0 && (
                <div className="flex mt-3">
                  <div className="inline-flex rounded-lg bg-slate-100 p-1">
                    <button
                      onClick={() => setViewMode('hierarchy')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        viewMode === 'hierarchy'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Иерархия
                    </button>
                    <button
                      onClick={() => setViewMode('groups')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        viewMode === 'groups'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      По группам
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6">
              {subordinatesTree.length > 0 ? (
                viewMode === 'hierarchy' ? (
                  <SubordinateTree subordinates={subordinatesTree} />
                ) : (
                  <SubordinatesByGroup subordinatesTree={subordinatesTree} />
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm">Нет подчиненных</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Personal Cabinet Modal */}
      {showCabinet && user && (
        <PersonalCabinetModal user={user} onClose={() => setShowCabinet(false)} />
      )}
    </div>
  );
};

export default UserPortalPage;
