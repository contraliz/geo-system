import {
  BrainCircuit, ClipboardList, Cloud, Database, FileText, Gauge, Globe2, Image, LayoutDashboard,
  PenLine, Search, Settings2, ShieldCheck, UserRound, Users, WalletCards, WandSparkles,
} from 'lucide-react'
import type { Route } from '../types'

export type RouteInfo = { label: string; group: string; description: string }
export type NavItem = { route: Route; label: string; icon: typeof LayoutDashboard; badge?: string }
export type NavGroup = { label: string; items: NavItem[] }

export const routeInfo: Record<Route, RouteInfo> = {
  dashboard: { label: 'Dashboard', group: 'Workspace', description: 'A simulated view of how your content operations are moving from question to publication.' },
  'knowledge-bases': { label: 'Knowledge Bases', group: 'Asset Library', description: 'Keep approved facts and source material close to every generated article.' },
  'knowledge-base-detail': { label: 'Knowledge Base', group: 'Asset Library', description: 'Review readable local entries before using them as article grounding.' },
  'image-libraries': { label: 'Image Libraries', group: 'Asset Library', description: 'Organize the visual systems that make content recognizable and publishable.' },
  'image-library-detail': { label: 'Image Library', group: 'Asset Library', description: 'Review local image placeholders and selection state before using them in tasks.' },
  'keyword-distillation': { label: 'Keyword Distillation', group: 'Content Planning', description: 'Turn search themes into question sets your team can actually act on.' },
  'writing-instructions': { label: 'Writing Instructions', group: 'AI Writing', description: 'Create reusable guidance for article, title, and traffic replication workflows.' },
  'automatic-creation': { label: 'Automatic Creation', group: 'AI Writing', description: 'Manage generation tasks with explicit inputs, progress, and local-only demo status.' },
  'article-list': { label: 'Article List', group: 'AI Writing', description: 'Review generated articles, model attribution, and publication readiness.' },
  'personal-media': { label: 'Personal Media', group: 'Publishing', description: 'Coordinate publishing queues for your own website and owned channels.' },
  records: { label: 'Records', group: 'Publishing', description: 'A readable activity trail for content operations events.' },
  accounts: { label: 'Accounts', group: 'Publishing', description: 'Informative account destinations for a future connected publishing setup.' },
  'website-media': { label: 'Website Media', group: 'Publishing', description: 'Informative destination for website content channels and media rules.' },
  influencers: { label: 'Influencers', group: 'Publishing', description: 'Informative destination for creator and partner distribution workflows.' },
  'official-seo': { label: 'Official-site SEO', group: 'Publishing', description: 'Informative destination for owned-site technical and editorial SEO.' },
  'model-validation': { label: 'Model Validation', group: 'Quality', description: 'Compare simulated answer quality across the supported model platforms.' },
  'compute-points': { label: 'Compute Points', group: 'Workspace', description: 'Understand the demo balance used by generation and validation simulations.' },
  admin: { label: 'Admin Overview', group: 'Administration', description: 'Platform-level operating signals and configuration destinations.' },
  settings: { label: 'About & Settings', group: 'Workspace', description: 'Local demo controls, theme preferences, and data reset.' },
}

export const navGroups: NavGroup[] = [
  { label: 'Workspace', items: [{ route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { route: 'compute-points', label: 'Compute Points', icon: WalletCards }] },
  { label: 'Asset Library', items: [{ route: 'knowledge-bases', label: 'Knowledge Bases', icon: Database }, { route: 'image-libraries', label: 'Image Libraries', icon: Image }] },
  { label: 'Content Planning', items: [{ route: 'keyword-distillation', label: 'Keyword Distillation', icon: WandSparkles }] },
  { label: 'AI Writing', items: [{ route: 'writing-instructions', label: 'Writing Instructions', icon: PenLine }, { route: 'automatic-creation', label: 'Automatic Creation', icon: BrainCircuit, badge: '3' }, { route: 'article-list', label: 'Article List', icon: FileText }] },
  { label: 'Publishing', items: [{ route: 'personal-media', label: 'Personal Media', icon: Cloud }, { route: 'records', label: 'Records', icon: ClipboardList }, { route: 'accounts', label: 'Accounts', icon: UserRound }, { route: 'website-media', label: 'Website Media', icon: Globe2 }, { route: 'influencers', label: 'Influencers', icon: Users }, { route: 'official-seo', label: 'Official-site SEO', icon: Search }] },
  { label: 'Quality', items: [{ route: 'model-validation', label: 'Model Validation', icon: ShieldCheck }] },
  { label: 'Administration', items: [{ route: 'admin', label: 'Admin Overview', icon: Gauge }, { route: 'settings', label: 'About & Settings', icon: Settings2 }] },
]
