import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import groupRoutes from './routes/groupRoutes';
import evaluationPeriodRoutes from './routes/evaluationPeriodRoutes';
import evaluationRoutes from './routes/evaluationRoutes';
import groupScoreRoutes from './routes/groupScoreRoutes';
import kpiRoutes from './routes/kpiRoutes';
import adminRoutes from './routes/adminRoutes';
import operatorRoutes from './routes/operatorRoutes';
import approvalRoutes from './routes/approvalRoutes';
import blockRoutes from './routes/blockRoutes';
import auditLogRoutes from './routes/auditLogRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // true = allow all origins
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/evaluation-periods', evaluationPeriodRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/group-scores', groupScoreRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/operator', operatorRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/audit-logs', auditLogRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
