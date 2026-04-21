export type ResourceKey = 'scraps' | 'scent' | 'trust' | 'intel' | 'legend';

export type Phase = 'day' | 'night';

export type JobKey = 'forager' | 'diplomat' | 'scout' | 'warden';

export type BuildingKey =
  | 'hideout'
  | 'scentMarker'
  | 'observationPost'
  | 'moonPlatform';

export type InstinctKey = 'kinship' | 'nightRaid';

export type ResourceMap = Record<ResourceKey, number>;

export type JobConfig = {
  id: JobKey;
  name: string;
  shortName: string;
  description: string;
  dayYield: Partial<ResourceMap>;
  nightYield: Partial<ResourceMap>;
};

export type BuildRule =
  | 'mainNest'
  | 'controlled'
  | 'controlledNonMain'
  | 'subway';

export type BuildingConfig = {
  id: BuildingKey;
  name: string;
  cost: Partial<ResourceMap>;
  description: string;
  buildRule: BuildRule;
  unique: 'global' | 'perNode';
};

export type NodeConfig = {
  id: string;
  name: string;
  summary: string;
  risk: 1 | 2 | 3;
  dayYield: Partial<ResourceMap>;
  nightYield: Partial<ResourceMap>;
  neighbors: string[];
  tags: string[];
  position: {
    x: number;
    y: number;
  };
};

export type InstinctConfig = {
  id: InstinctKey;
  name: string;
  description: string;
  modifiers: string[];
};

export type LogTone = 'neutral' | 'good' | 'warning' | 'danger';

export type LogEntry = {
  id: number;
  title: string;
  detail: string;
  tone: LogTone;
};

export type DawnReport = {
  foodCost: number;
  maintenanceCost: number;
  floatingNodes: string[];
  lostNodes: string[];
  recruitedCat: boolean;
  patrolTriggered: boolean;
  stable: boolean;
  notes: string[];
};

export type GameState = {
  phase: Phase;
  phaseSecondsRemaining: number;
  attention: number;
  resources: ResourceMap;
  totalCats: number;
  catCap: number;
  assignments: Record<JobKey, number>;
  controlledNodeIds: string[];
  buildingsByNode: Record<string, BuildingKey[]>;
  selectedNodeId: string;
  logs: LogEntry[];
  nextLogId: number;
  lastDawnReport: DawnReport | null;
  instinct: InstinctKey | null;
  lives: number;
  archiveLegend: number;
  cycleCount: number;
  rebirthReady: boolean;
  paused: boolean;
  openingScavengeClicks: number;
  nodeHeatById: Record<string, number>;
};

export type Action =
  | { type: 'tick' }
  | { type: 'togglePause' }
  | { type: 'openingScavenge' }
  | { type: 'selectNode'; nodeId: string }
  | { type: 'assignCat'; jobId: JobKey; delta: 1 | -1 }
  | { type: 'expandNode'; nodeId: string }
  | { type: 'build'; nodeId: string; buildingId: BuildingKey }
  | { type: 'advancePhase' }
  | { type: 'rebirth'; instinct: InstinctKey };
