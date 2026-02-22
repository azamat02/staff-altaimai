import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  groupScoresApi,
  evaluationPeriodsApi,
  GroupScoreResult,
  EvaluationPeriod,
} from '../services/api';

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const scoreToPercent = (score: number | null): number | null =>
  score !== null ? Math.round(score / 5 * 100) : null;

// Get score color class based on percentage value
const getScoreColorClass = (score: number | null): string => {
  if (score === null) return 'bg-slate-100 text-slate-500';
  const pct = scoreToPercent(score)!;
  if (pct >= 90) return 'bg-green-100 text-green-700';
  if (pct >= 70) return 'bg-blue-100 text-blue-700';
  if (pct >= 50) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
};

interface GroupTreeNodeProps {
  group: GroupScoreResult;
  level: number;
  periodId: number | null;
}

const BlockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const GroupTreeNode: React.FC<GroupTreeNodeProps> = ({ group, level }) => {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = group.children.length > 0;
  const isBlock = group.type === 'block';
  const pct = scoreToPercent(group.score);

  return (
    <div>
      <div
        className={`flex items-center justify-between py-3 px-4 hover:bg-slate-50 ${
          hasChildren ? 'cursor-pointer' : ''
        } border-b border-slate-100 ${
          isBlock ? 'bg-gold-50/50' : level === 0 ? 'bg-slate-50' : ''
        }`}
        style={{ paddingLeft: `${1 + level * 1.5}rem` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </button>
          ) : (
            <div className="w-6" />
          )}
          <div>
            <div className={`flex items-center space-x-2 ${isBlock ? 'font-bold text-slate-900' : 'font-medium text-slate-900'}`}>
              {isBlock && <BlockIcon />}
              <span>{group.groupName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-sm text-slate-500">
            {group.userCount} чел.
          </div>
          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColorClass(group.score)}`}
          >
            {pct !== null ? `${pct}%` : '—'}
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {group.children.map((child) => (
            <GroupTreeNode
              key={child.groupId}
              group={child}
              level={level + 1}
              periodId={null}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const GroupScoresPage: React.FC = () => {
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupScoreResult[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<EvaluationPeriod | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);

  // Load periods
  useEffect(() => {
    const loadPeriods = async () => {
      try {
        const response = await evaluationPeriodsApi.getAll();
        setPeriods(response.data);
        // Select active period by default
        const activePeriod = response.data.find((p) => p.isActive);
        if (activePeriod) {
          setSelectedPeriodId(activePeriod.id);
        } else if (response.data.length > 0) {
          setSelectedPeriodId(response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to load periods:', error);
      }
    };
    loadPeriods();
  }, []);

  // Load group scores when period changes
  useEffect(() => {
    const loadGroupScores = async () => {
      setIsLoading(true);
      try {
        const response = await groupScoresApi.getAll(selectedPeriodId || undefined);
        setGroups(response.data.groups);
        setCurrentPeriod(response.data.period);
      } catch (error) {
        console.error('Failed to load group scores:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadGroupScores();
  }, [selectedPeriodId]);

  const handleRecalculate = async () => {
    if (!selectedPeriodId) return;

    setIsCalculating(true);
    try {
      await groupScoresApi.calculate(selectedPeriodId);
      // Reload scores after calculation
      const response = await groupScoresApi.getAll(selectedPeriodId);
      setGroups(response.data.groups);
    } catch (error) {
      console.error('Failed to recalculate scores:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Оценки по группам</h1>
            <p className="text-slate-500 mt-1">
              Агрегированные оценки сотрудников по структурным подразделениям
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={selectedPeriodId || ''}
              onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
              className="input w-48"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} {period.isActive && '(активен)'}
                </option>
              ))}
            </select>
            <button
              onClick={handleRecalculate}
              disabled={isCalculating || !selectedPeriodId}
              className="btn-secondary flex items-center space-x-2"
            >
              <RefreshIcon />
              <span>{isCalculating ? 'Расчет...' : 'Пересчитать'}</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-6 text-sm">
          <span className="text-slate-500">Уровни оценки:</span>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-slate-600">90%+ Эфф.</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-600">70-90% Надл.</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-slate-600">50-70% Удовл.</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-600">&lt;50% Неудовл.</span>
            </div>
          </div>
        </div>

        {/* Groups Tree */}
        <div className="card">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <UsersIcon />
              </div>
              <p className="text-slate-500">Нет данных по группам</p>
              {currentPeriod && (
                <p className="text-sm text-slate-400 mt-2">
                  Период: {currentPeriod.name}
                </p>
              )}
            </div>
          ) : (
            <div>
              {currentPeriod && (
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-sm text-slate-600">
                  Период: <span className="font-medium">{currentPeriod.name}</span>
                </div>
              )}
              {groups.map((group) => (
                <GroupTreeNode
                  key={group.groupId}
                  group={group}
                  level={0}
                  periodId={selectedPeriodId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default GroupScoresPage;
