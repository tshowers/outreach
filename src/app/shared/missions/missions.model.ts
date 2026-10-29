/**
 * Missions on screen (design_handoff_todd_missions). Synced into each app's
 * src/app/shared/missions/ by ../missions/sync.sh - edit the .tmpl in
 * taliferro-ui, never the copy.
 *
 * The API shapes match todd-backend orchestrator/routes.js
 * (/api/orchestration/missions). The view logic below is plain TypeScript so
 * every app draws a plan the same way: which steps are columns, which are
 * branch paths, what state each is in, and who holds it.
 */

export type Owner = 'todd' | 'maya' | 'person';
export type StepKind = 'tool' | 'task' | 'approval' | 'wait' | 'decision';
export type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed';
export type OutcomeType = 'action' | 'insight' | 'shortlist' | 'program' | 'assetSet';
export type MissionStatus = 'queued' | 'running' | 'proposed' | 'awaiting_user' | 'active' | 'done' | 'cancelled';
export type Phase = 'planning' | 'proposed' | 'working' | 'waiting_on_people' | 'waiting_on_world' | 'done' | 'cancelled';

export interface StepView {
  number: number;
  id: string;
  title: string;
  detail: string;
  owner: Owner;
  assigneeId: string;
  holder: { owner: Owner; assigneeId: string };
  kind: StepKind;
  tool: string;
  product: string;
  effect: string;
  automated: boolean;
  status: StepStatus;
  skipReason: string;
  when: string;
  branch: { group: string; if: string } | null;
  why: string;
  doneWhen: string;
  options: string[];
  minutes: number | null;
  dependsOn: string[];
  activeSince: string | null;
  waitUntil: string | null;
  finishedAt: string | null;
  finishedBy: { type: string; id?: string } | null;
  handoff: { from: string; code: string; reason: string; at: string } | null;
  reassigned?: { from: string; reason: string; by: string; at: string } | null;
  timedOut: boolean;
  resultSummary: string;
  output: Record<string, any> | null;
  error: { code: string; message: string } | null;
  revisions: number;
}

export interface PlanSummary {
  missionId: string;
  status: MissionStatus;
  phase: Phase;
  outcomeType: OutcomeType;
  stepsDone: number;
  stepsTotal: number;
  current: { stepId: string; title: string; kind: StepKind; owner: Owner; assigneeId: string; handedOff: boolean } | null;
}

export interface Estimate {
  counts: Record<string, number>;
  yourMinutes: number;
  approvals: number;
  split: Record<string, number>;
  waitBusinessDays: number;
  products: string[];
}

export interface ReportRow {
  stepId: string;
  title: string;
  kind: StepKind;
  by: { type: string; id: string };
  finishedAt: string | null;
  result: string;
  status: StepStatus;
  timedOut: boolean;
  skipReason: string;
  handedOff: boolean;
  handoffReason: string;
  artifacts: { kind: string; id: string; title?: string }[];
}

export interface Proposal { title: string; request: string; why: string }
export interface ShortlistItem { id: string; name: string; why: string; fit: 'strong' | 'medium' | 'weak'; route: string }

export interface MissionReport {
  missionId: string;
  title: string;
  outcomeType: OutcomeType;
  headline: string;
  startedAt: string | null;
  finishedAt: string | null;
  days: number | null;
  rows: ReportRow[];
  split: { todd: number; maya: number; owner: number; teammates: number };
  ownerMinutes: number;
  findings: { title: string; detail: string; evidence: string }[];
  recommendations: string[];
  shortlist: ShortlistItem[];
  proposals: Proposal[];
  line: string;
}

export interface MissionView {
  id: string;
  tenantId: string;
  ownerId: string;
  origin: string;
  request: string;
  title: string;
  outcomeType: OutcomeType;
  summary: string;
  questions: string[];
  status: MissionStatus;
  statusDetail: string;
  steps: StepView[];
  estimate: Estimate | null;
  planFallback?: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  moveId: string;
  report: MissionReport | null;
  phase: Phase;
  plan: PlanSummary;
  products: string[];
  split: { todd: number; maya: number; you: number; teammates: number };
  isOwner: boolean;
  assessment?: { signals?: string[]; reason?: string } | null;
}

export interface DirectAnswer {
  mode: 'direct';
  tool?: string;
  product?: string;
  summary?: string;
  output?: Record<string, any>;
}

export interface WaitingItem {
  missionId: string;
  missionTitle: string;
  plan: PlanSummary;
  step: StepView;
  /** Every step of the Mission, for the compact strip. */
  steps: StepView[];
  stepsTotal: number;
  inputs: { stepId: string; title: string; tool: string; output: Record<string, any> | null; resultSummary: string }[];
}

export interface Cockpit { stuck: number; inFlight: number; waitingOnPeople: number; waitingOnWorld: number }

export interface Playbook {
  id: string;
  title: string;
  request: string;
  category: string;
  outcomeType: OutcomeType;
  source: string;
  products: string[];
  stepsTotal: number;
  owners: { todd: number; maya: number; person: number };
  steps: StepView[];
}

export type StepActionType = 'approve' | 'reject' | 'complete' | 'answer' | 'without' | 'reassign';

// ---- who --------------------------------------------------------------------

/** 'todd' | 'maya' | 'you' | a teammate's id: how a token and its label read. */
export type Who = 'todd' | 'maya' | 'you' | string;

export function whoOf ( holder: { owner: Owner; assigneeId: string }, viewerId: string ): Who {
  if ( holder.owner === 'todd' ) return 'todd';
  if ( holder.owner === 'maya' ) return 'maya';
  return holder.assigneeId && holder.assigneeId === viewerId ? 'you' : ( holder.assigneeId || 'you' );
}

export interface Person { id: string; name: string; left?: boolean }

export function nameOf ( who: Who, people: Record<string, Person> = {} ): string {
  if ( who === 'todd' ) return 'General Assistant';
  if ( who === 'maya' ) return 'Marketing Assistant';
  if ( who === 'you' ) return 'You';
  return ( people[who] && people[who].name.split( ' ' )[0] ) || 'A teammate';
}

export function initialsOf ( who: Who, people: Record<string, Person> = {} ): string {
  const name = people[who] ? people[who].name : '';
  return name ? name.split( /\s+/ ).map( ( part ) => part[0] ).join( '' ).slice( 0, 2 ).toUpperCase() : '?';
}

// ---- states -----------------------------------------------------------------

export type Look = 'done' | 'run' | 'person' | 'wait' | 'next' | 'skip' | 'fail';

export const KIND_LABEL: Record<StepKind | 'branch', string> = {
  tool: 'Tool', task: 'Task', approval: 'Approval', wait: 'Wait', decision: 'Decision', branch: 'Branch',
};

/** The design's step state (PlanStrip look()). */
export function lookOf ( step: Pick<StepView, 'status' | 'kind' | 'owner' | 'handoff'> ): Look {
  if ( step.status === 'done' ) return 'done';
  if ( step.status === 'skipped' ) return 'skip';
  if ( step.status === 'failed' ) return 'fail';
  if ( step.status === 'pending' ) return 'next';
  // active
  if ( step.handoff && step.handoff.code !== 'not_wired' && step.handoff.code !== 'taken' ) return 'fail';
  if ( step.handoff || step.owner === 'person' ) return 'person';
  if ( step.kind === 'wait' ) return 'wait';
  return 'run';
}

/** "3 d 4 h" until a time, or '' when it's passed. */
export function leftUntil ( iso: string | null, now = Date.now() ): string {
  if ( !iso ) return '';
  const ms = Date.parse( iso ) - now;
  if ( !( ms > 0 ) ) return '';
  const hours = Math.floor( ms / 3600000 );
  const days = Math.floor( hours / 24 );
  if ( days ) return `${days} d ${hours % 24} h`;
  if ( hours ) return `${hours} h`;
  return `${Math.max( 1, Math.round( ms / 60000 ) )} min`;
}

export function labelOf ( look: Look, who: Who, people: Record<string, Person> = {}, left = '', handedTo: Who | null = null ): string {
  switch ( look ) {
    case 'done': return 'Done';
    case 'run': return `${nameOf( who, people )} is working`;
    case 'person': return `${who === 'you' ? 'Waiting on you' : `Waiting on ${nameOf( who, people )}`}${left ? ` · ${left} left` : ''}`;
    case 'wait': return left ? `${left} left` : 'Waiting';
    case 'skip': return 'Skipped';
    case 'fail': return handedTo ? `Failed, now with ${handedTo === 'you' ? 'you' : nameOf( handedTo, people )}` : 'Failed';
    default: return who === 'you' ? 'Yours, later' : 'Next';
  }
}

export const GLYPH: Record<Look, string> = { done: '✓', run: '●', person: '●', wait: '◷', next: '○', skip: '–', fail: '!' };

// ---- columns ----------------------------------------------------------------

export interface PathView {
  if: string;
  title: string;
  who: Who;
  look: Look;
  label: string;
  stepIds: string[];
}

export interface ColumnView {
  number: number;
  stepId: string;
  title: string;
  detail: string;
  kind: StepKind | 'branch';
  who: Who;
  look: Look;
  label: string;
  why: string;
  active: boolean;
  paths: PathView[];
  step: StepView | null;
  /** Ids of every step this column covers (itself plus folded path steps). */
  stepIds: string[];
}

function whenAnchor ( when: string ): string {
  const match = String( when || '' ).match( /\$step:([A-Za-z0-9_-]+)\./ );
  return match ? match[1] : '';
}

/**
 * Turns a plan's steps into the strip's columns (design 0a, 2a):
 *  - a branch step anchored on an ordinary step shows as a path inside that
 *    step's column ("One match: use it" / "More than one: you choose");
 *  - branches anchored on a wait get their own "After the wait" column;
 *  - steps that only continue one path (approve the reply, send it) fold into
 *    that path instead of becoming columns.
 */
export function stripColumns ( steps: StepView[], viewerId: string, people: Record<string, Person> = {}, now = Date.now() ): ColumnView[] {
  const byId = new Map( steps.map( ( step ) => [step.id, step] ) );
  const pathOf = new Map<string, string>(); // step id -> the branch step id whose path it continues
  steps.forEach( ( step ) => {
    if ( step.branch ) {
      pathOf.set( step.id, step.id );
      return;
    }
    const parents = step.dependsOn.map( ( id ) => pathOf.get( id ) ).filter( ( id ): id is string => Boolean( id ) );
    if ( parents.length && parents.length === step.dependsOn.length && new Set( parents ).size === 1 && step.tool !== 'todd.report' ) {
      pathOf.set( step.id, parents[0] );
    }
  } );

  const columns: ColumnView[] = [];
  const columnFor = new Map<string, ColumnView>();
  const groupColumn = new Map<string, ColumnView>();

  const view = ( step: StepView ): ColumnView => {
    const who = whoOf( step.holder, viewerId );
    const look = lookOf( step );
    const handed = step.handoff ? whoOf( { owner: 'person', assigneeId: step.holder.assigneeId }, viewerId ) : null;
    const left = look === 'wait' ? leftUntil( step.waitUntil, now ) : '';
    return {
      number: 0, stepId: step.id, title: step.title, detail: step.detail, kind: step.kind, who, look,
      label: labelOf( look, who, people, left, handed ), why: step.why,
      active: look === 'run' || look === 'person' || look === 'wait' || look === 'fail',
      paths: [], step, stepIds: [step.id],
    };
  };

  for ( const step of steps ) {
    const pathRoot = pathOf.get( step.id );
    if ( pathRoot && pathRoot !== step.id ) {
      // Continues a path: fold it in.
      const root = byId.get( pathRoot )!;
      const host = columnFor.get( root.id );
      const path = host && host.paths.find( ( entry ) => entry.stepIds[0] === root.id );
      if ( path ) {
        path.stepIds.push( step.id );
        host!.stepIds.push( step.id );
        columnFor.set( step.id, host! );
      }
      continue;
    }
    if ( step.branch ) {
      const anchor = byId.get( whenAnchor( step.when ) );
      let host: ColumnView | undefined;
      if ( anchor && anchor.kind !== 'wait' && columnFor.get( anchor.id ) ) {
        host = columnFor.get( anchor.id );
      } else {
        const key = `${step.branch.group}`;
        host = groupColumn.get( key );
        if ( !host ) {
          host = {
            number: 0, stepId: `branch:${key}`, title: anchor && anchor.kind === 'wait' ? 'After the wait' : 'Depends',
            detail: '', kind: 'branch', who: 'todd', look: 'next', label: 'Next', why: '', active: false, paths: [], step: null, stepIds: [],
          };
          groupColumn.set( key, host );
          columns.push( host );
        }
      }
      const who = whoOf( step.holder, viewerId );
      host!.paths.push( { if: step.branch.if ? `${step.branch.if}:` : '', title: step.title, who, look: lookOf( step ), label: '', stepIds: [step.id] } );
      host!.stepIds.push( step.id );
      columnFor.set( step.id, host! );
      continue;
    }
    const column = view( step );
    columns.push( column );
    columnFor.set( step.id, column );
  }

  // Path state: the furthest step along it that has a state worth showing.
  for ( const column of columns ) {
    for ( const path of column.paths ) {
      const chain = path.stepIds.map( ( id ) => byId.get( id )! );
      const root = chain[0];
      if ( root.status === 'skipped' ) {
        path.look = 'skip';
      } else {
        const live = chain.find( ( step ) => step.status === 'active' || step.status === 'failed' );
        const allDone = chain.every( ( step ) => step.status === 'done' || step.status === 'skipped' );
        const step = live || ( allDone ? chain[chain.length - 1] : root );
        path.look = live ? lookOf( live ) : allDone ? 'done' : 'next';
        path.who = whoOf( step.holder, viewerId );
      }
      path.label = labelOf( path.look, path.who, people );
    }
    if ( column.kind === 'branch' ) {
      const live = column.paths.find( ( path ) => path.look !== 'skip' && path.look !== 'next' && path.look !== 'done' );
      const taken = column.paths.find( ( path ) => path.look !== 'skip' );
      const anyTaken = column.paths.some( ( path ) => path.look !== 'next' );
      column.look = live ? live.look : taken && anyTaken ? ( column.paths.every( ( path ) => path.look === 'done' || path.look === 'skip' ) ? 'done' : 'next' ) : 'next';
      column.who = live ? live.who : 'todd';
      column.label = labelOf( column.look, column.who, people );
      column.active = Boolean( live );
    } else if ( column.look === 'done' && column.paths.some( ( path ) => path.look !== 'done' && path.look !== 'skip' && path.look !== 'next' ) ) {
      // The step finished, but a path under it is where the action is now.
      const live = column.paths.find( ( path ) => path.look !== 'done' && path.look !== 'skip' && path.look !== 'next' )!;
      column.look = live.look;
      column.who = live.who;
      column.label = labelOf( live.look, live.who, people );
      column.active = true;
    }
  }
  columns.forEach( ( column, index ) => {
    column.number = index + 1;
  } );
  return columns;
}

/** The column a person should look at: the first active one, else the first failed. */
export function currentColumn ( columns: ColumnView[] ): ColumnView | null {
  return columns.find( ( column ) => column.active ) || null;
}

/** "5 of 10" counts finished and skipped columns, as the compact strip shows. */
export function doneCount ( columns: ColumnView[] ): number {
  return columns.filter( ( column ) => column.look === 'done' || column.look === 'skip' ).length;
}

/** Owner split for a plan, by display owner ("5 by TODD · 4 by Maya · 1 by you"). */
export function splitLine ( columns: ColumnView[] ): string {
  const counts = { todd: 0, maya: 0, you: 0, teammates: 0 };
  columns.forEach( ( column ) => {
    if ( column.kind === 'branch' ) return;
    if ( column.who === 'todd' ) counts.todd += 1;
    else if ( column.who === 'maya' ) counts.maya += 1;
    else if ( column.who === 'you' ) counts.you += 1;
    else counts.teammates += 1;
  } );
  return [
    counts.todd ? `${counts.todd} by 16Ahead` : '',
    counts.maya ? `${counts.maya} by the Marketing Assistant` : '',
    counts.teammates ? `${counts.teammates} by teammates` : '',
    counts.you ? `${counts.you} by you` : '',
  ].filter( Boolean ).join( ' · ' );
}

/** Product ids as people read them. */
export const PRODUCT_LABEL: Record<string, string> = {
  network: 'Network', 'lead-vault': 'Lead Vault', find: 'Find', outreach: 'Outreach', 'email-creator': 'Email Creator',
  'image-creator': 'Image Creator', maya: 'Marketing Assistant', social: 'Social', docs: 'Docs', 'knowledge-base': 'Knowledge', pulse: 'Pulse',
  moves: 'Moves', sayit: 'SayIt', 'email-signature': 'Email Signature', events: 'Events', todd: '16Ahead',
};

/** The app filter on Playbooks (14a): Maya covers her tools' products. */
export function appOf ( product: string ): string {
  return ['image-creator', 'email-creator', 'social', 'sayit', 'maya'].includes( product ) ? 'maya' : product;
}
