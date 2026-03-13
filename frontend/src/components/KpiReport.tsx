import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  kpisApi,
  Kpi,
  KpiBlock,
  KpiAssignment,
} from '../services/api';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

// KPI completion categories
const KPI_CATEGORIES = [
  { name: 'Перевыполнение', min: 100, color: '#22c55e' },
  { name: 'Хорошо', min: 75, color: '#ceb275' },
  { name: 'Удовлетворительно', min: 50, color: '#eab308' },
  { name: 'Низкий', min: 0, color: '#ef4444' },
] as const;

function getCategoryIndex(score: number): number {
  if (score >= 100) return 0;
  if (score >= 75) return 1;
  if (score >= 50) return 2;
  return 3;
}

// Icons
const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const ChartBarIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// Score calculation helpers
interface UserResult {
  userId: number;
  fullName: string;
  position: string;
  groupName: string;
  blockScores: { blockName: string; score: number | null }[];
  overallScore: number | null;
  isSubmitted: boolean;
}

function computeUserResults(kpi: Kpi): UserResult[] {
  const blocks = kpi.blocks || [];
  const assignments = kpi.assignments || [];

  return assignments.map((assignment: KpiAssignment) => {
    const factMap = new Map<number, number | null>();
    if (assignment.factValues) {
      for (const fv of assignment.factValues) {
        factMap.set(fv.taskId, fv.factValue);
      }
    }

    const blockScores: { blockName: string; score: number | null }[] = [];
    let totalWeightedScore = 0;
    let totalBlockWeight = 0;

    for (const block of blocks) {
      const nonOptionalTasks = block.tasks.filter((t) => !t.isOptional);
      if (nonOptionalTasks.length === 0) {
        blockScores.push({ blockName: block.name, score: null });
        continue;
      }

      let weightedTaskSum = 0;
      let taskWeightSum = 0;
      let hasAnyFact = false;

      for (const task of nonOptionalTasks) {
        const factValue = factMap.get(task.id);
        if (factValue !== null && factValue !== undefined && task.planValue > 0) {
          const achievement = Math.min((factValue / task.planValue) * 100, 200);
          weightedTaskSum += achievement * task.weight;
          hasAnyFact = true;
        }
        taskWeightSum += task.weight;
      }

      if (!hasAnyFact || taskWeightSum === 0) {
        blockScores.push({ blockName: block.name, score: null });
        continue;
      }

      const blockScore = weightedTaskSum / taskWeightSum;
      blockScores.push({ blockName: block.name, score: blockScore });
      totalWeightedScore += blockScore * block.weight;
      totalBlockWeight += block.weight;
    }

    const overallScore = totalBlockWeight > 0 ? totalWeightedScore / 100 : null;

    return {
      userId: assignment.user.id,
      fullName: assignment.user.fullName,
      position: assignment.user.position,
      groupName: assignment.user.group?.name || '—',
      blockScores,
      overallScore,
      isSubmitted: assignment.isSubmitted,
    };
  });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PENDING_APPROVAL: 'На согласовании',
  APPROVED: 'Утверждён',
  REJECTED: 'Отклонён',
  COMPLETED: 'Завершён',
};

const KpiReport: React.FC = () => {
  const [kpiList, setKpiList] = useState<Kpi[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<Kpi | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [userResults, setUserResults] = useState<UserResult[]>([]);

  // Load KPI list (APPROVED and COMPLETED only)
  useEffect(() => {
    const loadKpis = async () => {
      setIsLoadingList(true);
      try {
        const response = await kpisApi.getAll();
        const filtered = response.data.filter(
          (k) => k.status === 'APPROVED' || k.status === 'COMPLETED'
        );
        setKpiList(filtered);
      } catch (error) {
        console.error('Failed to load KPIs:', error);
      } finally {
        setIsLoadingList(false);
      }
    };
    loadKpis();
  }, []);

  // Load selected KPI details
  useEffect(() => {
    if (!selectedKpiId) {
      setSelectedKpi(null);
      setUserResults([]);
      return;
    }
    const loadKpi = async () => {
      setIsLoading(true);
      try {
        const response = await kpisApi.getOne(selectedKpiId);
        const kpi = response.data;
        setSelectedKpi(kpi);
        setUserResults(computeUserResults(kpi));
      } catch (error) {
        console.error('Failed to load KPI:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadKpi();
  }, [selectedKpiId]);

  // Summary stats
  const totalAssigned = selectedKpi?.assignments?.length || 0;
  const submittedCount = selectedKpi?.assignments?.filter((a) => a.isSubmitted).length || 0;
  const avgCompletion =
    userResults.length > 0
      ? userResults.reduce((sum, r) => sum + (r.overallScore ?? 0), 0) / userResults.length
      : 0;

  const blocks: KpiBlock[] = selectedKpi?.blocks || [];

  // Distribution by KPI categories
  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const r of userResults) {
      if (r.overallScore !== null) {
        counts[getCategoryIndex(r.overallScore)]++;
      }
    }
    return KPI_CATEGORIES.map((cat, i) => ({ name: cat.name, value: counts[i], color: cat.color }));
  }, [userResults]);

  // Top-10 employees by completion %
  const barChartData = useMemo(() => {
    return userResults
      .filter((r) => r.overallScore !== null)
      .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
      .slice(0, 10)
      .map((r) => ({
        name: r.fullName.length > 20 ? r.fullName.slice(0, 20) + '...' : r.fullName,
        fullName: r.fullName,
        score: r.overallScore!,
      }));
  }, [userResults]);

  // Pie chart data (filter zero values)
  const pieChartData = useMemo(() => distribution.filter((d) => d.value > 0), [distribution]);

  // Register Cyrillic fonts for PDF
  const registerCyrillicFonts = async (doc: jsPDF) => {
    const loadFont = async (url: string, fileName: string, fontName: string, style: string) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      doc.addFileToVFS(fileName, base64);
      doc.addFont(fileName, fontName, style);
    };

    await Promise.all([
      loadFont('/fonts/Roboto-Regular.ttf', 'Roboto-Regular.ttf', 'Roboto', 'normal'),
      loadFont('/fonts/Roboto-Bold.ttf', 'Roboto-Bold.ttf', 'Roboto', 'bold'),
    ]);
  };

  // Export Excel
  const handleExportExcel = useCallback(() => {
    if (!selectedKpi) return;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Сводка
    const summaryData = [
      ['Отчёт по KPI'],
      [''],
      ['Название', selectedKpi.title],
      ['Описание', selectedKpi.description || '—'],
      ['Дедлайн', new Date(selectedKpi.deadline).toLocaleDateString('ru-RU')],
      ['Статус', STATUS_LABELS[selectedKpi.status] || selectedKpi.status],
      ['Согласующий', selectedKpi.approver?.fullName || '—'],
      ['Создал', selectedKpi.createdByAdmin?.username || '—'],
      [''],
      ['Статистика'],
      ['Назначено сотрудников', totalAssigned],
      ['Сдали результаты', submittedCount],
      ['Средний % выполнения', avgCompletion > 0 ? avgCompletion.toFixed(1) + '%' : '—'],
      [''],
      ['Распределение по категориям'],
      ...distribution.map((d) => [d.name, d.value]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

    // Sheet 2: Результаты
    const headerRow = [
      '№',
      'ФИО',
      'Должность',
      'Группа',
      ...blocks.map((b) => `${b.name} (%)`),
      'Итого (%)',
      'Статус',
    ];
    const dataRows = userResults.map((r, i) => [
      i + 1,
      r.fullName,
      r.position,
      r.groupName,
      ...r.blockScores.map((bs) => (bs.score !== null ? bs.score.toFixed(1) : '—')),
      r.overallScore !== null ? r.overallScore.toFixed(1) : '—',
      r.isSubmitted ? 'Сдан' : 'Не сдан',
    ]);
    const resultsSheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    XLSX.utils.book_append_sheet(workbook, resultsSheet, 'Результаты');

    const fileName = `kpi_report_${selectedKpi.title.replace(/\s/g, '_').slice(0, 30)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [selectedKpi, blocks, userResults, totalAssigned, submittedCount, avgCompletion, distribution]);

  // Export PDF
  const handleExportPdf = useCallback(async () => {
    if (!selectedKpi) return;

    const doc = new jsPDF({ orientation: blocks.length > 3 ? 'landscape' : 'portrait' });

    await registerCyrillicFonts(doc);
    doc.setFont('Roboto');

    // Title
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(18);
    doc.text('Отчёт по KPI', 14, 22);

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(12);
    doc.text(selectedKpi.title, 14, 32);

    // Info
    doc.setFontSize(10);
    const info = [
      `Дедлайн: ${new Date(selectedKpi.deadline).toLocaleDateString('ru-RU')}`,
      `Статус: ${STATUS_LABELS[selectedKpi.status] || selectedKpi.status}`,
      `Согласующий: ${selectedKpi.approver?.fullName || '—'}`,
      `Назначено: ${totalAssigned} | Сдали: ${submittedCount} | Средний %: ${avgCompletion > 0 ? avgCompletion.toFixed(1) + '%' : '—'}`,
    ];
    info.forEach((line, i) => {
      doc.text(line, 14, 42 + i * 6);
    });

    // Distribution
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.text('Распределение по категориям выполнения', 14, 72);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    distribution.forEach((d, i) => {
      doc.text(`${d.name}: ${d.value}`, 14, 80 + i * 6);
    });

    // Table
    autoTable(doc, {
      startY: 106,
      head: [
        [
          '№',
          'ФИО',
          'Должность',
          'Группа',
          ...blocks.map((b) => b.name + ' (%)'),
          'Итого (%)',
          'Статус',
        ],
      ],
      body: userResults.map((r, i) => [
        i + 1,
        r.fullName,
        r.position,
        r.groupName,
        ...r.blockScores.map((bs) => (bs.score !== null ? bs.score.toFixed(1) : '—')),
        r.overallScore !== null ? r.overallScore.toFixed(1) : '—',
        r.isSubmitted ? 'Сдан' : 'Не сдан',
      ]),
      styles: { fontSize: 7, font: 'Roboto' },
      headStyles: { fillColor: [51, 51, 51], font: 'Roboto', fontStyle: 'bold' },
    });

    const fileName = `kpi_report_${selectedKpi.title.replace(/\s/g, '_').slice(0, 30)}.pdf`;
    doc.save(fileName);
  }, [selectedKpi, blocks, userResults, totalAssigned, submittedCount, avgCompletion, distribution]);

  // Score color
  const getScoreColor = (score: number | null): string => {
    if (score === null) return 'bg-slate-100 text-slate-500';
    if (score >= 100) return 'bg-green-100 text-green-700';
    if (score >= 75) return 'bg-gold-100 text-gold-700';
    if (score >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-6">
      {/* Header with KPI selector and export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <select
            value={selectedKpiId || ''}
            onChange={(e) => setSelectedKpiId(e.target.value ? parseInt(e.target.value) : null)}
            className="input w-full max-w-md"
            disabled={isLoadingList}
          >
            <option value="">
              {isLoadingList ? 'Загрузка...' : '— Выберите KPI —'}
            </option>
            {kpiList.map((kpi) => (
              <option key={kpi.id} value={kpi.id}>
                {kpi.title} ({STATUS_LABELS[kpi.status] || kpi.status})
              </option>
            ))}
          </select>
        </div>
        {selectedKpi && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={isLoading}
              className="btn-secondary flex items-center gap-2"
            >
              <DownloadIcon />
              <span>Excel</span>
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isLoading}
              className="btn-secondary flex items-center gap-2"
            >
              <DownloadIcon />
              <span>PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-gold-500 rounded-full animate-spin" />
        </div>
      )}

      {/* No KPI selected */}
      {!selectedKpiId && !isLoading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">Выберите KPI из списка для просмотра отчёта</p>
        </div>
      )}

      {/* KPI Report content */}
      {selectedKpi && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Назначено</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{totalAssigned}</p>
                  <p className="text-xs text-slate-400 mt-1">сотрудников</p>
                </div>
                <div className="p-3 rounded-lg bg-gold-100 text-gold-600">
                  <UsersIcon />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Сдали результаты</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{submittedCount}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    из {totalAssigned} ({totalAssigned > 0 ? ((submittedCount / totalAssigned) * 100).toFixed(0) : 0}%)
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-100 text-green-600">
                  <CheckCircleIcon />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Средний % выполнения</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {avgCompletion > 0 ? avgCompletion.toFixed(1) + '%' : '—'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">по всем сотрудникам</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-100 text-slate-600">
                  <ChartBarIcon />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Дедлайн</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {new Date(selectedKpi.deadline).toLocaleDateString('ru-RU')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {STATUS_LABELS[selectedKpi.status] || selectedKpi.status}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-yellow-100 text-yellow-600">
                  <CalendarIcon />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Топ-10 сотрудников по выполнению KPI</h3>
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 'auto']} unit="%" />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [typeof value === 'number' ? value.toFixed(1) + '%' : value, 'Выполнение']}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          const item = payload[0] as { payload?: { fullName?: string } };
                          return item?.payload?.fullName || String(label);
                        }
                        return String(label);
                      }}
                    />
                    <Bar dataKey="score" fill="#ceb275" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-500">
                  Нет данных для отображения
                </div>
              )}
            </div>

            {/* Pie Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Распределение по категориям выполнения</h3>
              {pieChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {pieChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-500">
                  Нет данных для отображения
                </div>
              )}
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Результаты сотрудников</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      №
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      ФИО
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Должность
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Группа
                    </th>
                    {blocks.map((block) => (
                      <th
                        key={block.id}
                        className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3"
                      >
                        {block.name} (%)
                      </th>
                    ))}
                    <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Итого (%)
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Статус
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userResults.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5 + blocks.length}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        Нет назначенных сотрудников
                      </td>
                    </tr>
                  ) : (
                    userResults.map((result, idx) => (
                      <tr key={result.userId} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-slate-500 text-sm">{idx + 1}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{result.fullName}</td>
                        <td className="px-6 py-4 text-slate-600">{result.position}</td>
                        <td className="px-6 py-4 text-slate-600">{result.groupName}</td>
                        {result.blockScores.map((bs, bi) => (
                          <td key={bi} className="px-6 py-4 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(
                                bs.score
                              )}`}
                            >
                              {bs.score !== null ? bs.score.toFixed(1) : '—'}
                            </span>
                          </td>
                        ))}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(
                              result.overallScore
                            )}`}
                          >
                            {result.overallScore !== null ? result.overallScore.toFixed(1) : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                              result.isSubmitted
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {result.isSubmitted ? 'Сдан' : 'Не сдан'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default KpiReport;
