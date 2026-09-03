export type PageActionGroup = 'context' | 'feature' | 'global';

export type PageActionKind = 'route' | 'callback' | 'separator' | 'heading';
export type PageActionContextScope = 'all' | 'say-it' | 'todd';
export type PageActionFeature = 'global' | 'network' | 'outreach' | 'docs' | 'moves' | 'pulse' | 'social' | 'admin' | 'misc';

export interface PageActionContext {
  pageId: string;
  feature?: string;
  entityType?:
  | 'contact'
  | 'task'
  | 'survey'
  | 'document'
  | 'email'
  | string;
  entityId?: string;
  selectedIds?: string[];
  mode?: string;
  extra?: Record<string, unknown>;
}

export interface PageAction {
  id: string;
  label?: string;
  icon?: string;
  image?: string;
  title?: string;
  kind: PageActionKind;
  context?: PageActionContextScope | PageActionContextScope[];
  feature?: PageActionFeature;
  group?: PageActionGroup;
  order?: number;
  route?: string;
  fragment?: string;
  handler?: () => void;
  visible?: boolean | ( () => boolean );
  hidden?: boolean | ( () => boolean );
  disabled?: boolean | ( () => boolean );
  cssClass?: string;
  pinned?: boolean;
}

export interface PageActionsConfig {
  pageId: string;
  context?: PageActionContext;
  includeGlobalActions?: boolean;
  actions: PageAction[];
}
