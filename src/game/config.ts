import type {
  BuildingConfig,
  InstinctConfig,
  JobConfig,
  NodeConfig,
  ResourceKey,
  ResourceMap,
} from './types';

export const PHASE_DURATION_SECONDS = 120;
export const MAIN_NEST_ID = 'mainNest';
export const SUBWAY_ID = 'subway';

export const resourceLabels: Record<ResourceKey, string> = {
  scraps: '残羹',
  scent: '气味',
  trust: '信任',
  intel: '情报',
  legend: '传说',
  tech: '机巧',
  faith: '教义',
};

export const resourceOrder: ResourceKey[] = [
  'scraps',
  'scent',
  'trust',
  'intel',
  'legend',
  'tech',
  'faith',
];

export const emptyResources = (): ResourceMap => ({
  scraps: 0,
  scent: 0,
  trust: 0,
  intel: 0,
  legend: 0,
  tech: 0,
  faith: 0,
});

export const initialResources: ResourceMap = {
  scraps: 8,
  scent: 10,
  trust: 0,
  intel: 0,
  legend: 0,
  tech: 0,
  faith: 0,
};

export const openingScavengeYields = [4, 3, 2, 2, 1] as const;
export const openingScavengeAttention = [0, 1, 1, 2, 2] as const;

export const jobs: JobConfig[] = [
  {
    id: 'forager',
    name: '觅食猫',
    shortName: '觅',
    description: '稳定带回残羹，是维持猫群和建设的基础。',
    dayYield: { scraps: 0.08 },
    nightYield: { scraps: 0.14 },
  },
  {
    id: 'diplomat',
    name: '外交猫',
    shortName: '交',
    description: '白天刷信任并压低注意度，是稳健路线的关键。',
    dayYield: { trust: 0.11 },
    nightYield: { trust: 0.04 },
  },
  {
    id: 'scout',
    name: '斥候猫',
    shortName: '斥',
    description: '负责观察城市节奏，能显著降低夜间行动风险。',
    dayYield: { intel: 0.05 },
    nightYield: { intel: 0.12 },
  },
  {
    id: 'warden',
    name: '巡界猫',
    shortName: '巡',
    description: '维护气味边界，为扩张与连通兜底。',
    dayYield: { scent: 0.08 },
    nightYield: { scent: 0.1 },
  },
  {
    id: 'techSage',
    name: '机巧学者',
    shortName: '学',
    description: '科技时代职业。组织实验与记录，让情报与传说产出更稳定。',
    dayYield: { intel: 0.09, tech: 0.03, legend: 0.01 },
    nightYield: { intel: 0.12, tech: 0.04, legend: 0.02 },
    eraUnlock: 'technology',
  },
  {
    id: 'gearSmith',
    name: '齿轮匠猫',
    shortName: '匠',
    description: '科技时代职业。偏工程效率，补残羹与气味并提供少量情报。',
    dayYield: { scraps: 0.08, scent: 0.06, tech: 0.02 },
    nightYield: { scraps: 0.12, scent: 0.08, intel: 0.02, tech: 0.03 },
    eraUnlock: 'technology',
  },
  {
    id: 'moonPriest',
    name: '月坛祭司',
    shortName: '祭',
    description: '神学时代职业。稳定传说积累并在白天减缓注意度。',
    dayYield: { legend: 0.03, trust: 0.05, faith: 0.03 },
    nightYield: { legend: 0.06, intel: 0.03, faith: 0.04 },
    eraUnlock: 'theology',
  },
  {
    id: 'canonKeeper',
    name: '典仪守律',
    shortName: '律',
    description: '神学时代职业。提升秩序与边界稳定，强化信任与气味供给。',
    dayYield: { trust: 0.08, scent: 0.05, faith: 0.02 },
    nightYield: { trust: 0.06, scent: 0.08, legend: 0.02, faith: 0.03 },
    eraUnlock: 'theology',
  },
];

export const buildings: BuildingConfig[] = [
  {
    id: 'hideout',
    name: '隐窝',
    cost: { scraps: 10, trust: 4 },
    description: '猫口上限 +2。只能在主巢修建一次。',
    buildRule: 'mainNest',
    unique: 'global',
  },
  {
    id: 'scentMarker',
    name: '气味标记',
    cost: { scent: 6 },
    description: '该节点黎明维护成本由 2 气味降为 1。',
    buildRule: 'controlledNonMain',
    unique: 'perNode',
  },
  {
    id: 'observationPost',
    name: '观测点',
    cost: { scraps: 8, intel: 4 },
    description: '相邻节点的扩张失败率下降，并强化风险预判。',
    buildRule: 'controlledNonMain',
    unique: 'perNode',
  },
  {
    id: 'moonPlatform',
    name: '月台',
    cost: { scraps: 12, trust: 8, intel: 8 },
    description: '建成后，只要满足结构条件并完成一次稳定结算，就能换命。',
    buildRule: 'subway',
    unique: 'global',
  },
  {
    id: 'granaryVault',
    name: '蓄粮地窖',
    cost: { scraps: 16, trust: 6, tech: 4 },
    description: '科技时代建筑。黎明猫口消耗残羹 -2（全局唯一）。',
    buildRule: 'mainNest',
    unique: 'global',
    eraUnlock: 'technology',
  },
  {
    id: 'relayBeacon',
    name: '中继信标',
    cost: { scraps: 10, intel: 6, tech: 3 },
    description: '科技时代建筑。相邻节点扩张失败率进一步下降。',
    buildRule: 'controlledNonMain',
    unique: 'perNode',
    eraUnlock: 'technology',
  },
  {
    id: 'watchShrine',
    name: '守望祷所',
    cost: { trust: 10, faith: 6, scent: 6 },
    description: '神学时代建筑。降低黎明巡查触发概率（可叠加）。',
    buildRule: 'controlledNonMain',
    unique: 'perNode',
    eraUnlock: 'theology',
  },
  {
    id: 'incenseTower',
    name: '香火高塔',
    cost: { scraps: 12, faith: 8, legend: 3 },
    description: '神学时代建筑。减缓外部前线压力漂移（可叠加）。',
    buildRule: 'controlledNonMain',
    unique: 'perNode',
    eraUnlock: 'theology',
  },
];

export const instincts: InstinctConfig[] = [
  {
    id: 'kinship',
    name: '亲人本命',
    description: '永久提升白天的社会渗透能力，让城邦更稳。',
    modifiers: ['永久：白天信任产出 +35%', '永久：白天额外降低注意度', '首次觉醒：开局 +4 信任'],
  },
  {
    id: 'nightRaid',
    name: '夜袭本命',
    description: '永久强化夜间扩张窗口，适合高风险抢窗打法。',
    modifiers: ['永久：夜间扩张成本 -2 气味', '永久：夜间扩张失败率下降', '永久：高风险点夜间收益 +25%'],
  },
  {
    id: 'scentWeaver',
    name: '织气本命',
    description: '永久降低网络维护与断链风险，突出治网能力。',
    modifiers: ['永久：黎明维护额外 -1 气味', '永久：巡界猫产气味 +20%', '永久：网络脆弱度轻微下降'],
  },
  {
    id: 'streetOracle',
    name: '街兆本命',
    description: '永久强化情报体系，让高风险行动更可控。',
    modifiers: ['永久：斥候产情报 +30%', '永久：扩张失败率额外下降', '永久：热点增长略微减缓'],
  },
  {
    id: 'scrapEngineer',
    name: '匠巢本命',
    description: '永久强化建设效率，让中期运营更流畅。',
    modifiers: ['永久：建筑残羹成本 -20%', '永久：猫口上限 +1', '首次觉醒：开局 +2 残羹'],
  },
  {
    id: 'moonChaser',
    name: '逐月本命',
    description: '永久强化传说积累和月台联动，为后续轮回提速。',
    modifiers: ['永久：月台共振额外 +2 传说', '永久：黎明后额外 +1 传说', '永久：前线压力自然回落更快'],
  },
];

export const nodes: NodeConfig[] = [
  {
    id: MAIN_NEST_ID,
    name: '主巢',
    summary: '起点与核心仓储。人口、建筑与轮回都围绕它展开。',
    risk: 1,
    dayYield: { scraps: 0.02, scent: 0.03 },
    nightYield: { scraps: 0.03, scent: 0.04 },
    neighbors: ['convenience', 'library'],
    tags: ['核心', '人口'],
    position: { x: 12, y: 52 },
  },
  {
    id: 'convenience',
    name: '便利店后巷',
    summary: '前期粮仓，残羹稳定，风险适中。',
    risk: 2,
    dayYield: { scraps: 0.06 },
    nightYield: { scraps: 0.16 },
    neighbors: [MAIN_NEST_ID, 'acBridge', 'garbage'],
    tags: ['残羹', '前期'],
    position: { x: 32, y: 28 },
  },
  {
    id: 'library',
    name: '图书馆窗台',
    summary: '白天路线核心，既能堆信任也能缓慢攒情报。',
    risk: 1,
    dayYield: { trust: 0.12, intel: 0.03 },
    nightYield: { trust: 0.05, intel: 0.07 },
    neighbors: [MAIN_NEST_ID, 'acBridge'],
    tags: ['信任', '情报'],
    position: { x: 36, y: 74 },
  },
  {
    id: 'acBridge',
    name: '空调外机桥',
    summary: '中继节点，本身产值一般，但连通价值很高。',
    risk: 1,
    dayYield: { scent: 0.12 },
    nightYield: { scent: 0.12, intel: 0.02 },
    neighbors: ['convenience', 'library', 'garbage', SUBWAY_ID],
    tags: ['中继', '气味'],
    position: { x: 55, y: 49 },
  },
  {
    id: 'garbage',
    name: '垃圾站',
    summary: '夜间高收益节点，也是最容易把注意度拉高的地方。',
    risk: 3,
    dayYield: { scraps: 0.04 },
    nightYield: { scraps: 0.24, legend: 0.01 },
    neighbors: ['convenience', 'acBridge', SUBWAY_ID],
    tags: ['高风险', '高残羹'],
    position: { x: 76, y: 24 },
  },
  {
    id: SUBWAY_ID,
    name: '地铁废口',
    summary: '首轮终点。建成月台后，第一次换命才算闭环。',
    risk: 2,
    dayYield: { intel: 0.03, trust: 0.02 },
    nightYield: { scraps: 0.05, legend: 0.03 },
    neighbors: ['acBridge', 'garbage'],
    tags: ['换命', '传说'],
    position: { x: 82, y: 72 },
  },
];
