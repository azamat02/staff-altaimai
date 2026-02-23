import React, { useState, useEffect } from 'react';
import { groupsApi, blocksApi, usersApi, Group, Block, User } from '../services/api';
import Layout from '../components/Layout';
import SearchableSelect from '../components/SearchableSelect';

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

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const BlockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group form
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupLeaderId, setGroupLeaderId] = useState<number | null>(null);
  const [groupBlockId, setGroupBlockId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<User[]>([]);

  // Block form
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [blockName, setBlockName] = useState('');

  // Delete confirmations
  const [deleteConfirm, setDeleteConfirm] = useState<Group | null>(null);
  const [deleteUsers, setDeleteUsers] = useState<{ id: number; fullName: string; position: string }[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteBlockConfirm, setDeleteBlockConfirm] = useState<Block | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [groupsRes, blocksRes] = await Promise.all([
        groupsApi.getAll(),
        blocksApi.getAll(),
      ]);
      setGroups(groupsRes.data);
      setBlocks(blocksRes.data);
      setError(null);
    } catch (err) {
      setError('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Group handlers
  const handleCreateGroup = (preselectedBlockId?: number | null) => {
    setEditingGroup(null);
    setGroupName('');
    setGroupLeaderId(null);
    setGroupBlockId(preselectedBlockId ?? null);
    setGroupMembers([]);
    setShowGroupForm(true);
  };

  const handleEditGroup = async (group: Group) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupLeaderId(group.leaderId);
    setGroupBlockId(group.blockId ?? null);
    setShowGroupForm(true);

    try {
      const response = await usersApi.getAll();
      const members = response.data.filter((u) => u.groupId === group.id);
      setGroupMembers(members);
    } catch (err) {
      setGroupMembers([]);
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (group._count && group._count.users > 0) {
      try {
        setDeleteLoading(true);
        const response = await groupsApi.getOne(group.id);
        setDeleteUsers(response.data.users || []);
      } catch {
        setDeleteUsers([]);
      } finally {
        setDeleteLoading(false);
      }
    } else {
      setDeleteUsers([]);
    }
    setDeleteConfirm(group);
  };

  const confirmDeleteGroup = async () => {
    if (!deleteConfirm) return;
    try {
      setDeleteLoading(true);
      await groupsApi.delete(deleteConfirm.id);
      await fetchData();
      setDeleteConfirm(null);
      setDeleteUsers([]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Ошибка удаления группы';
      setError(errorMessage || 'Ошибка удаления группы');
      setDeleteConfirm(null);
      setDeleteUsers([]);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleGroupFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      if (editingGroup) {
        await groupsApi.update(editingGroup.id, {
          name: groupName,
          leaderId: groupLeaderId,
          blockId: groupBlockId,
        });
      } else {
        await groupsApi.create(groupName, groupBlockId);
      }
      await fetchData();
      setShowGroupForm(false);
      setEditingGroup(null);
      setGroupName('');
      setGroupLeaderId(null);
      setGroupBlockId(null);
      setGroupMembers([]);
    } catch (err) {
      setError('Ошибка сохранения группы');
    }
  };

  const handleGroupFormCancel = () => {
    setShowGroupForm(false);
    setEditingGroup(null);
    setGroupName('');
    setGroupLeaderId(null);
    setGroupBlockId(null);
    setGroupMembers([]);
  };

  // Block handlers
  const handleCreateBlock = () => {
    setEditingBlock(null);
    setBlockName('');
    setShowBlockForm(true);
  };

  const handleEditBlock = (block: Block) => {
    setEditingBlock(block);
    setBlockName(block.name);
    setShowBlockForm(true);
  };

  const handleDeleteBlock = (block: Block) => {
    setDeleteBlockConfirm(block);
  };

  const confirmDeleteBlock = async () => {
    if (!deleteBlockConfirm) return;
    try {
      setDeleteLoading(true);
      await blocksApi.delete(deleteBlockConfirm.id);
      await fetchData();
      setDeleteBlockConfirm(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Ошибка удаления блока';
      setError(errorMessage || 'Ошибка удаления блока');
      setDeleteBlockConfirm(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBlockFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockName.trim()) return;

    try {
      if (editingBlock) {
        await blocksApi.update(editingBlock.id, blockName.trim());
      } else {
        await blocksApi.create(blockName.trim());
      }
      await fetchData();
      setShowBlockForm(false);
      setEditingBlock(null);
      setBlockName('');
    } catch (err) {
      setError('Ошибка сохранения блока');
    }
  };

  const handleBlockFormCancel = () => {
    setShowBlockForm(false);
    setEditingBlock(null);
    setBlockName('');
  };

  // Group sections by blocks
  const groupsByBlock = blocks.map((block) => ({
    block,
    groups: groups.filter((g) => g.blockId === block.id),
  }));
  const ungrouped = groups.filter((g) => !g.blockId);

  // Block options for group form
  const blockOptions = blocks.map((b) => ({ value: b.id, label: b.name }));

  const renderGroupCard = (group: Group) => (
    <div key={group.id} className="card p-5 group hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-600">
              {group.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="font-medium text-slate-900">{group.name}</h3>
            <p className="text-sm text-slate-500">
              {group._count?.users || 0} пользователей
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => handleEditGroup(group)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <EditIcon />
          </button>
          <button
            onClick={() => handleDeleteGroup(group)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      {group.leader ? (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-1">Начальник</p>
          <p className="text-sm font-medium text-slate-700">{group.leader.fullName}</p>
          <p className="text-xs text-slate-500">{group.leader.position}</p>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-amber-600">Начальник не назначен</p>
        </div>
      )}
    </div>
  );

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
          <h1 className="text-2xl font-semibold text-slate-900">Структура организации</h1>
          <p className="mt-1 text-sm text-slate-500">Управление блоками и группами сотрудников</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleCreateBlock} className="btn-secondary">
            <BlockIcon />
            <span className="ml-2">Добавить блок</span>
          </button>
          <button onClick={() => handleCreateGroup()} className="btn-primary">
            <PlusIcon />
            <span className="ml-2">Добавить группу</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="p-1 text-red-400 hover:text-red-600 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Empty State */}
      {groups.length === 0 && blocks.length === 0 ? (
        <div className="card">
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">Нет групп</p>
            <p className="text-slate-400 text-xs mt-1">Создайте первый блок или группу</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Block sections */}
          {groupsByBlock.map(({ block, groups: blockGroups }) => (
            <div key={block.id}>
              {/* Block header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gold-100 rounded-lg flex items-center justify-center">
                    <BlockIcon />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">{block.name}</h2>
                  <span className="text-sm text-slate-400">{blockGroups.length} групп</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleCreateGroup(block.id)}
                    className="p-2 text-slate-400 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition-colors"
                    title="Добавить группу в блок"
                  >
                    <PlusIcon />
                  </button>
                  <button
                    onClick={() => handleEditBlock(block)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Редактировать блок"
                  >
                    <EditIcon />
                  </button>
                  <button
                    onClick={() => handleDeleteBlock(block)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Удалить блок"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* Block groups grid */}
              {blockGroups.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {blockGroups.map(renderGroupCard)}
                </div>
              ) : (
                <div className="card p-6 text-center">
                  <p className="text-sm text-slate-400">В блоке нет групп</p>
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped section */}
          {ungrouped.length > 0 && (
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-500">Без блока</h2>
                <span className="text-sm text-slate-400">{ungrouped.length} групп</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ungrouped.map(renderGroupCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Group Form Modal */}
      {showGroupForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleGroupFormCancel} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingGroup ? 'Редактировать группу' : 'Новая группа'}
                </h2>
                <button
                  onClick={handleGroupFormCancel}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>
              <form onSubmit={handleGroupFormSubmit}>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Название группы
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="input"
                      placeholder="Введите название"
                      autoFocus
                    />
                  </div>

                  {/* Block selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Блок
                    </label>
                    <SearchableSelect
                      options={blockOptions}
                      value={groupBlockId}
                      onChange={(val) => setGroupBlockId(val !== null ? Number(val) : null)}
                      placeholder="Выберите блок"
                      searchPlaceholder="Поиск блока..."
                      emptyText="Блоки не найдены"
                      allowEmpty
                      emptyLabel="Без блока"
                    />
                  </div>

                  {/* Leader selection - only when editing */}
                  {editingGroup && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Начальник группы
                      </label>
                      {groupMembers.length > 0 ? (
                        <select
                          value={groupLeaderId ?? ''}
                          onChange={(e) => setGroupLeaderId(e.target.value ? parseInt(e.target.value) : null)}
                          className="input"
                        >
                          <option value="">Не назначен</option>
                          {groupMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.fullName} — {member.position}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-slate-500 p-3 bg-slate-50 rounded-lg">
                          В группе нет пользователей. Добавьте пользователей, чтобы назначить начальника.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                  <button type="button" onClick={handleGroupFormCancel} className="btn-secondary">
                    Отмена
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingGroup ? 'Сохранить' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Block Form Modal */}
      {showBlockForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleBlockFormCancel} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingBlock ? 'Редактировать блок' : 'Новый блок'}
                </h2>
                <button
                  onClick={handleBlockFormCancel}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>
              <form onSubmit={handleBlockFormSubmit}>
                <div className="px-6 py-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Название блока
                    </label>
                    <input
                      type="text"
                      value={blockName}
                      onChange={(e) => setBlockName(e.target.value)}
                      className="input"
                      placeholder="Например: АУП"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                  <button type="button" onClick={handleBlockFormCancel} className="btn-secondary">
                    Отмена
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingBlock ? 'Сохранить' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { setDeleteConfirm(null); setDeleteUsers([]); }} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                {deleteUsers.length > 0 ? 'Удалить группу с сотрудниками?' : 'Удалить группу?'}
              </h3>
              {deleteUsers.length > 0 ? (
                <>
                  <p className="text-sm text-slate-500 text-center mb-4">
                    Группа &laquo;{deleteConfirm.name}&raquo; содержит {deleteUsers.length} сотрудников. Все они будут удалены:
                  </p>
                  <div className="max-h-48 overflow-y-auto mb-4 border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {deleteUsers.map((user) => (
                      <div key={user.id} className="px-3 py-2">
                        <p className="text-sm font-medium text-slate-700">{user.fullName}</p>
                        <p className="text-xs text-slate-500">{user.position}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-600 text-center mb-4 font-medium">
                    Это действие необратимо
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500 text-center mb-6">
                  Группа &laquo;{deleteConfirm.name}&raquo; будет удалена
                </p>
              )}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => { setDeleteConfirm(null); setDeleteUsers([]); }}
                  className="btn-secondary flex-1"
                  disabled={deleteLoading}
                >
                  Отмена
                </button>
                <button onClick={confirmDeleteGroup} className="btn-danger flex-1" disabled={deleteLoading}>
                  {deleteLoading ? (
                    <span className="flex items-center justify-center">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Удаление...
                    </span>
                  ) : (
                    'Удалить'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Block Confirmation Modal */}
      {deleteBlockConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteBlockConfirm(null)} />
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">Удалить блок?</h3>
              <p className="text-sm text-slate-500 text-center mb-2">
                Блок &laquo;{deleteBlockConfirm.name}&raquo; будет удалён.
              </p>
              <p className="text-sm text-slate-500 text-center mb-6">
                Группы, входящие в блок, не будут удалены — они перейдут в секцию «Без блока».
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setDeleteBlockConfirm(null)}
                  className="btn-secondary flex-1"
                  disabled={deleteLoading}
                >
                  Отмена
                </button>
                <button onClick={confirmDeleteBlock} className="btn-danger flex-1" disabled={deleteLoading}>
                  {deleteLoading ? (
                    <span className="flex items-center justify-center">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Удаление...
                    </span>
                  ) : (
                    'Удалить'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default GroupsPage;
