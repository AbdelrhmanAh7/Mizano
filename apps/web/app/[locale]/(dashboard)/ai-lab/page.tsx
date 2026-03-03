'use client';

import { useState } from 'react';
import {
  Brain,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  FlaskConical,
  GraduationCap,
  BarChart3,
  Zap,
  Search,
  TrendingUp,
  ShieldCheck,
  Package,
  DollarSign,
  Users,
  FileText,
  MessageSquare,
  Database,
  ChevronDown,
  ChevronRight,
  Landmark,
  Shield,
  Settings,
  ScanLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api';
import {
  useTrainingLabDashboard,
  useTrainAllModels,
  useGenerateTrainingData,
} from '@/lib/hooks/use-ai-training-lab';
import { ModelCard } from '@/components/ai/training-lab/model-card';
import dynamic from 'next/dynamic';

const GenerateDataDialog = dynamic(
  () =>
    import('@/components/ai/training-lab/generate-data-dialog').then((m) => m.GenerateDataDialog),
  { ssr: false },
);
const ModelDetailDialog = dynamic(
  () => import('@/components/ai/training-lab/model-detail-dialog').then((m) => m.ModelDetailDialog),
  { ssr: false },
);
import { FeedbackCorrectionPanel } from '@/components/ai/training-lab/feedback-correction-panel';
import { OcrTrainingLabPanel } from '@/components/ai/ocr-training/ocr-training-lab-panel';
import {
  AI_MODELS,
  MODEL_CATEGORIES,
  getModelsByCategory,
  type AiModelConfig,
  type ModelCategory,
} from '@/components/ai/training-lab/all-models-config';

// ============ Testing Config (preserved) ============

interface TestableFeature {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
  method: 'GET' | 'POST';
  bodyTemplate?: Record<string, unknown>;
  color: string;
}

interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
}

const testableFeatures: TestableFeature[] = [
  {
    id: 'categorize',
    name: 'Categorize Transaction',
    description: 'Predict expense account for a transaction description',
    icon: <FileText className="h-5 w-5" />,
    endpoint: '/ai/categorization/predict',
    method: 'POST',
    bodyTemplate: { description: 'Office supplies from Staples', amount: 89.99 },
    color: 'bg-blue-500',
  },
  {
    id: 'anomaly-scan',
    name: 'Anomaly Scan',
    description: 'Scan all transactions for statistical anomalies',
    icon: <AlertTriangle className="h-5 w-5" />,
    endpoint: '/ai/anomalies/scan',
    method: 'POST',
    color: 'bg-red-500',
  },
  {
    id: 'lead-score-all',
    name: 'Score All Leads',
    description: 'Batch score all leads using rule-based + ML model',
    icon: <Users className="h-5 w-5" />,
    endpoint: '/ai/lead-scoring/score-all',
    method: 'POST',
    color: 'bg-orange-500',
  },
  {
    id: 'hot-leads',
    name: 'Get Hot Leads',
    description: 'Retrieve leads with score > 70',
    icon: <Zap className="h-5 w-5" />,
    endpoint: '/ai/lead-scoring/hot',
    method: 'GET',
    color: 'bg-yellow-500',
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow Forecast',
    description: 'Monte Carlo simulation for cash flow prediction',
    icon: <DollarSign className="h-5 w-5" />,
    endpoint: '/ai/cash-flow/forecast',
    method: 'GET',
    color: 'bg-green-500',
  },
  {
    id: 'demand-forecast',
    name: 'Demand Forecast Dashboard',
    description: 'Holt-Winters forecasting for all inventory items',
    icon: <TrendingUp className="h-5 w-5" />,
    endpoint: '/ai/demand-forecast/dashboard',
    method: 'GET',
    color: 'bg-indigo-500',
  },
  {
    id: 'pattern-analyze',
    name: 'Pattern Analysis',
    description: 'Detect recurring transaction patterns',
    icon: <Search className="h-5 w-5" />,
    endpoint: '/ai/patterns/analyze',
    method: 'POST',
    color: 'bg-purple-500',
  },
  {
    id: 'reorder-recalculate',
    name: 'Reorder Points',
    description: 'Recalculate optimal reorder points for all items',
    icon: <Package className="h-5 w-5" />,
    endpoint: '/ai/reorder/recalculate',
    method: 'POST',
    color: 'bg-teal-500',
  },
  {
    id: 'fraud-scan',
    name: 'Fraud Scan',
    description: 'Scan recent transactions for fraud indicators',
    icon: <ShieldCheck className="h-5 w-5" />,
    endpoint: '/ai/fraud/scan',
    method: 'POST',
    color: 'bg-red-600',
  },
  {
    id: 'sentiment',
    name: 'Sentiment Analysis',
    description: 'Analyze sentiment of text input',
    icon: <MessageSquare className="h-5 w-5" />,
    endpoint: '/ai/sentiment/analyze',
    method: 'POST',
    bodyTemplate: { text: 'Great service, very happy with the delivery speed!' },
    color: 'bg-pink-500',
  },
  {
    id: 'chatbot',
    name: 'AI Chatbot',
    description: 'Ask questions about your financial data',
    icon: <MessageSquare className="h-5 w-5" />,
    endpoint: '/ai/chatbot/message',
    method: 'POST',
    bodyTemplate: { message: 'What are my top expenses this month?' },
    color: 'bg-violet-500',
  },
  {
    id: 'compliance',
    name: 'Compliance Report',
    description: 'Generate compliance monitoring report',
    icon: <ShieldCheck className="h-5 w-5" />,
    endpoint: '/ai/compliance/report',
    method: 'GET',
    color: 'bg-emerald-500',
  },
  {
    id: 'narrative-monthly',
    name: 'Monthly Narrative',
    description: 'AI-generated financial narrative for current month',
    icon: <BarChart3 className="h-5 w-5" />,
    endpoint: '/ai/narrative/monthly',
    method: 'GET',
    color: 'bg-cyan-500',
  },
  {
    id: 'churn-high-risk',
    name: 'High-Risk Churn',
    description: 'Get customers with highest churn risk',
    icon: <Users className="h-5 w-5" />,
    endpoint: '/ai/churn/high-risk',
    method: 'GET',
    color: 'bg-rose-500',
  },
  {
    id: 'document-classify',
    name: 'Classify Document',
    description: 'Classify a text snippet as Bill, Invoice, etc.',
    icon: <FileText className="h-5 w-5" />,
    endpoint: '/ai/documents/classify',
    method: 'POST',
    bodyTemplate: { text: 'Invoice #1234 for consulting services. Total: $5,000.00' },
    color: 'bg-amber-500',
  },
];

// ============ Category Icons ============

const categoryIcons: Record<ModelCategory, React.ReactNode> = {
  'Core Financial': <Landmark className="h-4 w-4" />,
  'Sales & CRM': <TrendingUp className="h-4 w-4" />,
  'Security & Compliance': <Shield className="h-4 w-4" />,
  'NLP & Documents': <FileText className="h-4 w-4" />,
  'HR & Workforce': <Users className="h-4 w-4" />,
  Operations: <Settings className="h-4 w-4" />,
  'Chat & Voice': <MessageSquare className="h-4 w-4" />,
};

// ============ Main Component ============

export default function AiLabPage() {
  // Dashboard data
  const { data: dashboard, isLoading: dashboardLoading } = useTrainingLabDashboard();
  const trainAll = useTrainAllModels();
  const generateAll = useGenerateTrainingData();

  // Dialogs
  const [generateDialogModel, setGenerateDialogModel] = useState<AiModelConfig | null>(null);
  const [detailDialogModel, setDetailDialogModel] = useState<AiModelConfig | null>(null);

  // Category collapsible state
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(MODEL_CATEGORIES.map((c) => [c, true])),
  );

  // Generating all state
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState(0);

  // Testing state (preserved)
  const [testResults, setTestResults] = useState<Record<string, ActionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  // Dashboard model lookup
  const modelDataMap = new Map((dashboard?.models || []).map((m) => [m.feature, m]));

  const summary = dashboard?.summary;

  // ── Handlers ──

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    setGenerateAllProgress(0);
    for (let i = 0; i < AI_MODELS.length; i++) {
      try {
        await generateAll.mutateAsync({ feature: AI_MODELS[i].feature, count: 100 });
      } catch {
        // Continue even if one fails
      }
      setGenerateAllProgress(i + 1);
    }
    setGeneratingAll(false);
  };

  const handleTest = async (feature: TestableFeature) => {
    setLoading((prev) => ({ ...prev, [feature.id]: true }));
    const start = Date.now();
    try {
      let response;
      if (feature.method === 'POST') {
        let body = feature.bodyTemplate || {};
        const customInput = customInputs[feature.id];
        if (customInput) {
          try {
            body = JSON.parse(customInput);
          } catch {
            body = feature.bodyTemplate || {};
          }
        }
        response = await api.post(feature.endpoint, body);
      } else {
        response = await api.get(feature.endpoint);
      }
      setTestResults((prev) => ({
        ...prev,
        [feature.id]: { success: true, data: response.data, duration: Date.now() - start },
      }));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      setTestResults((prev) => ({
        ...prev,
        [feature.id]: {
          success: false,
          error: axiosErr?.response?.data?.message || axiosErr?.message || 'Request failed',
          duration: Date.now() - start,
        },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [feature.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            AI Training Lab
          </h1>
          <p className="text-muted-foreground">
            Train models, generate data, test predictions, and review feedback across all 33 AI
            features
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <Brain className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Models</p>
                <p className="text-2xl font-bold">{summary?.totalModels || 33}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Models</p>
                <p className="text-2xl font-bold text-green-600">{summary?.activeModels || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                <Database className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Training Data</p>
                <p className="text-2xl font-bold text-purple-600">
                  {summary?.totalTrainingData?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Accuracy</p>
                <p className="text-2xl font-bold text-amber-600">
                  {summary?.avgAccuracy ? `${(summary.avgAccuracy * 100).toFixed(1)}%` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-100 dark:bg-pink-950 rounded-lg">
                <MessageSquare className="h-5 w-5 text-pink-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Feedback</p>
                <p className="text-2xl font-bold text-pink-600">{summary?.totalFeedback || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Training
          </TabsTrigger>
          <TabsTrigger value="ocr-training" className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            OCR Training
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Testing
          </TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW TAB ============ */}
        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">All AI Models</h2>
              <p className="text-sm text-muted-foreground">
                Overview of all 33 AI models across 7 categories
              </p>
            </div>
          </div>

          {dashboardLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {MODEL_CATEGORIES.map((category) => {
                const models = getModelsByCategory(category);
                const activeCount = models.filter(
                  (m) => modelDataMap.get(m.feature)?.hasActiveModel,
                ).length;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      {categoryIcons[category]}
                      <h3 className="text-sm font-medium">{category}</h3>
                      <Badge variant="outline" className="text-xs">
                        {activeCount}/{models.length} active
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      {models.map((model) => {
                        const data = modelDataMap.get(model.feature);
                        return (
                          <div
                            key={model.feature}
                            className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setDetailDialogModel(model)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium truncate">{model.name}</span>
                              {data?.hasActiveModel ? (
                                <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                              ) : data?.trainingDataCount ? (
                                <div className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
                              ) : (
                                <div className="h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {data?.accuracy !== null && data?.accuracy !== undefined && (
                                <span>{(data.accuracy * 100).toFixed(0)}%</span>
                              )}
                              <span>{data?.trainingDataCount || 0} samples</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============ TRAINING TAB ============ */}
        <TabsContent value="training" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Train AI Models</h2>
              <p className="text-sm text-muted-foreground">
                Generate training data, train models, and monitor accuracy
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerateAll} disabled={generatingAll}>
                {generatingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating ({generateAllProgress}/{AI_MODELS.length})
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate All
                  </>
                )}
              </Button>
              <Button onClick={() => trainAll.mutate()} disabled={trainAll.isPending}>
                {trainAll.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Training...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Train All
                  </>
                )}
              </Button>
            </div>
          </div>

          {MODEL_CATEGORIES.map((category) => {
            const models = getModelsByCategory(category);
            const isOpen = openCategories[category] !== false;
            return (
              <div key={category}>
                <button
                  className="flex items-center gap-2 w-full text-left py-2 hover:bg-muted/50 rounded-lg px-2 transition-colors"
                  onClick={() => setOpenCategories((prev) => ({ ...prev, [category]: !isOpen }))}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {categoryIcons[category]}
                  <span className="font-medium text-sm">{category}</span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {models.length} models
                  </Badge>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-2 pb-4">
                    {models.map((model) => (
                      <ModelCard
                        key={model.feature}
                        config={model}
                        dashboardData={modelDataMap.get(model.feature)}
                        onGenerateClick={() => setGenerateDialogModel(model)}
                        onDetailClick={() => setDetailDialogModel(model)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* ============ OCR TRAINING TAB ============ */}
        <TabsContent value="ocr-training" className="space-y-4">
          <OcrTrainingLabPanel />
        </TabsContent>

        {/* ============ FEEDBACK TAB ============ */}
        <TabsContent value="feedback">
          <FeedbackCorrectionPanel />
        </TabsContent>

        {/* ============ TESTING TAB (preserved) ============ */}
        <TabsContent value="testing" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Test AI Features</h2>
            <p className="text-sm text-muted-foreground">
              Run AI predictions, scans, and analyses. Click any feature to execute it and see the
              response.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {testableFeatures.map((feature) => {
              const result = testResults[feature.id];
              const isLoading = loading[feature.id];
              const hasBody = feature.method === 'POST' && feature.bodyTemplate;

              return (
                <Card key={feature.id} className="overflow-hidden">
                  <div className={`h-1 ${feature.color}`} />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${feature.color} bg-opacity-10`}>
                          {feature.icon}
                        </div>
                        <div>
                          <CardTitle className="text-base">{feature.name}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {feature.method} {feature.endpoint}
                          </Badge>
                        </div>
                      </div>
                      {result && (
                        <Badge variant={result.success ? 'default' : 'destructive'}>
                          {result.success ? `${result.duration}ms` : 'Error'}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs mt-2">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {hasBody && (
                      <Textarea
                        className="text-xs font-mono h-20"
                        placeholder={JSON.stringify(feature.bodyTemplate, null, 2)}
                        value={customInputs[feature.id] || ''}
                        onChange={(e) =>
                          setCustomInputs((prev) => ({ ...prev, [feature.id]: e.target.value }))
                        }
                      />
                    )}

                    <Button
                      onClick={() => handleTest(feature)}
                      disabled={isLoading}
                      className="w-full"
                      variant={result?.success ? 'outline' : 'default'}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Run
                        </>
                      )}
                    </Button>

                    {result && (
                      <div className="p-3 rounded-lg bg-muted text-xs">
                        {result.success ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Success
                            </div>
                            <pre className="text-[10px] overflow-auto max-h-48 mt-1 whitespace-pre-wrap">
                              {JSON.stringify(
                                (result.data as Record<string, unknown>)?.data || result.data,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-red-600 font-medium">
                              <XCircle className="h-3 w-3" />
                              Error
                            </div>
                            <p className="text-red-600">{result.error}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <GenerateDataDialog
        model={generateDialogModel}
        open={!!generateDialogModel}
        onOpenChange={(open) => !open && setGenerateDialogModel(null)}
      />
      <ModelDetailDialog
        model={detailDialogModel}
        open={!!detailDialogModel}
        onOpenChange={(open) => !open && setDetailDialogModel(null)}
      />
    </div>
  );
}
