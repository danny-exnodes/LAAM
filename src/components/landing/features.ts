// Feature data for the landing page. Prose (titles/descriptions/telemetry
// labels) lives in the i18n `landing` dictionary and is referenced here by key.
// Only universal, non-translated tokens live here: sci-fi "module" flavor,
// technical tags (SSE, OAuth…), telemetry VALUES, and the lucide icon + the
// mech part each core feature maps to.
import {
  Activity,
  MessageSquare,
  Plug,
  Workflow,
  Server,
  LayoutDashboard,
  Network,
  ShieldCheck,
  HardDrive,
  ScrollText,
  Languages,
  Globe,
  type LucideIcon,
} from 'lucide-react';

/** The mech body part a core feature is embodied by. Shared with MechModel. */
export type PartId = 'head' | 'core' | 'armL' | 'armR' | 'legL' | 'legR';

export interface Telemetry {
  /** i18n key for the label (e.g. 'feat.1.t1'). */
  labelKey: string;
  /** Universal value, not translated (e.g. '42', 'AES-256', '$0'). */
  value: string;
}

export interface CoreFeature {
  id: string;
  num: number; // 1..6, shown on the part + panel
  part: PartId;
  icon: LucideIcon;
  /** i18n key prefix: `${keyPrefix}.title`, `${keyPrefix}.desc`. */
  keyPrefix: string;
  /** Sci-fi HUD header, universal flavor. */
  modId: string;
  /** Sci-fi status chip, universal flavor. */
  status: string;
  telemetry: [Telemetry, Telemetry, Telemetry];
  /** Universal technical tokens shown as mono tags. */
  tags: string[];
  /** Conic gauge: 0-100 fill + short universal label. */
  gauge: { value: number; label: string };
  /** Scroll progress (0-1) at which this panel reveals during disassembly. */
  revealAt: number;
  /** Static demo numbers that LOOK live (landing-eval cnt-2) get a small label. */
  illustrative?: boolean;
  /** Real product screenshot under /public (falls back to the stylized frame). */
  shot?: string;
}

const T = (labelKey: string, value: string): Telemetry => ({ labelKey, value });

export const CORE_FEATURES: CoreFeature[] = [
  {
    id: 'monitoring', num: 1, part: 'head', icon: Activity, keyPrefix: 'feat.1',
    modId: 'MOD-01 // OPTIC ARRAY', status: 'ONLINE',
    telemetry: [T('feat.1.t1', '42'), T('feat.1.t2', '4m 12s'), T('feat.1.t3', '1')],
    tags: ['SSE', 'transcripts'], gauge: { value: 99, label: '99%' }, revealAt: 0.10,
    illustrative: true, shot: '/landing/shot-dashboard.png',
  },
  {
    id: 'chat', num: 2, part: 'core', icon: MessageSquare, keyPrefix: 'feat.2',
    modId: 'MOD-02 // REACTOR CORE', status: 'GPU',
    telemetry: [T('feat.2.t1', 'VLM 8B'), T('feat.2.t2', '$0'), T('feat.2.t3', 'web·ocr')],
    tags: ['Ollama', 'free'], gauge: { value: 100, label: '$0' }, revealAt: 0.18,
    shot: '/landing/shot-chat.png',
  },
  {
    id: 'connectors', num: 3, part: 'armL', icon: Plug, keyPrefix: 'feat.3',
    modId: 'MOD-03 // MANIPULATOR-L', status: '6 LINKED',
    telemetry: [T('feat.3.t1', '6'), T('feat.3.t2', 'AES-256'), T('feat.3.t3', 'gated')],
    tags: ['OAuth', 'per-user'], gauge: { value: 100, label: '6/6' }, revealAt: 0.32,
  },
  {
    id: 'workflows', num: 4, part: 'armR', icon: Workflow, keyPrefix: 'feat.4',
    modId: 'MOD-04 // MANIPULATOR-R', status: 'ARMED',
    telemetry: [T('feat.4.t1', '∞'), T('feat.4.t2', 'cron'), T('feat.4.t3', 'live')],
    tags: ['engine', 'scheduler'], gauge: { value: 86, label: 'auto' }, revealAt: 0.46,
  },
  {
    id: 'multimachine', num: 5, part: 'legL', icon: Server, keyPrefix: 'feat.5',
    modId: 'MOD-05 // STRUT-L', status: 'SYNCED',
    telemetry: [T('feat.5.t1', 'all'), T('feat.5.t2', 'token'), T('feat.5.t3', 'push')],
    tags: ['collector', 'zero-dep'], gauge: { value: 100, label: 'sync' }, revealAt: 0.60,
  },
  {
    id: 'dashboard', num: 6, part: 'legR', icon: LayoutDashboard, keyPrefix: 'feat.6',
    modId: 'MOD-06 // STRUT-R', status: 'NOMINAL',
    telemetry: [T('feat.6.t1', '▲'), T('feat.6.t2', 'Σ'), T('feat.6.t3', 'rank')],
    tags: ['recharts', 'xyflow'], gauge: { value: 92, label: 'live' }, revealAt: 0.72,
  },
];

export interface GridFeature {
  id: string;
  icon: LucideIcon;
  /** i18n key prefix: `${keyPrefix}.title`, `${keyPrefix}.desc`. */
  keyPrefix: string;
}

export const GRID_FEATURES: GridFeature[] = [
  { id: 'graph', icon: Network, keyPrefix: 'grid.graph' },
  { id: 'rbac', icon: ShieldCheck, keyPrefix: 'grid.rbac' },
  { id: 'local', icon: HardDrive, keyPrefix: 'grid.local' },
  { id: 'audit', icon: ScrollText, keyPrefix: 'grid.audit' },
  { id: 'i18n', icon: Languages, keyPrefix: 'grid.i18n' },
  { id: 'world', icon: Globe, keyPrefix: 'grid.world' },
];
