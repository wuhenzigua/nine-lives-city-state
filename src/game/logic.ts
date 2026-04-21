import {
  MAIN_NEST_ID,
  PHASE_DURATION_SECONDS,
  SUBWAY_ID,
  buildings,
  emptyResources,
  initialResources,
  jobs,
  nodes,
  openingScavengeAttention,
  openingScavengeYields,
  resourceOrder,
} from './config';
import type {
  Action,
  BuildingKey,
  DawnReport,
  EraKey,
  EraProjectKey,
  FrontlineKey,
  GameState,
  JobKey,
  LogEntry,
  MetaUpgradeKey,
  NodeConfig,
  ResourceMap,
} from './types';

const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<
  string,
  NodeConfig
>;

const buildingMap = Object.fromEntries(
  buildings.map((building) => [building.id, building]),
) as Record<BuildingKey, (typeof buildings)[number]>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const HEAT_MAX = 100;
const FRONTLINE_MAX = 100;
const MAX_META_LEVEL = 3;
const mapTierUnlockCost: Record<number, number> = {
  2: 24,
  3: 60,
};

const getMetaUpgradeCost = (upgradeId: MetaUpgradeKey, level: number) => {
  const next = level + 1;
  if (upgradeId === 'deepLarder') {
    return next * 8;
  }
  if (upgradeId === 'scentDoctrine') {
    return next * 10;
  }
  return next * 12;
};

const ERA_PROJECT_MAX_LEVEL = 3;
const eraProjectLabels: Record<EraProjectKey, string> = {
  signalLab: '信号实验室',
  automaton: '自律工坊',
  scriptureHall: '经义厅',
  moonCathedral: '月神大教堂',
};
const eraProjectCost = (projectId: EraProjectKey, level: number) => {
  const next = level + 1;
  if (projectId === 'signalLab') {
    return next * 14;
  }
  if (projectId === 'automaton') {
    return next * 16;
  }
  if (projectId === 'scriptureHall') {
    return next * 20;
  }
  return next * 24;
};

const copyResources = (resources: ResourceMap): ResourceMap => ({ ...resources });

const getInitialNodeHeat = () =>
  Object.fromEntries(nodes.map((node) => [node.id, 0])) as Record<string, number>;

const addHeat = (
  heatMap: Record<string, number>,
  nodeId: string,
  delta: number,
) => {
  heatMap[nodeId] = clamp((heatMap[nodeId] ?? 0) + delta, 0, HEAT_MAX);
};

const decayHeat = (
  heatMap: Record<string, number>,
  amount: number,
) => {
  for (const node of nodes) {
    heatMap[node.id] = clamp((heatMap[node.id] ?? 0) - amount, 0, HEAT_MAX);
  }
};

const applyPassiveHeat = (state: GameState) => {
  const nextHeat = { ...state.nodeHeatById };
  decayHeat(nextHeat, state.phase === 'day' ? 0.24 : 0.12);

  for (const nodeId of state.controlledNodeIds) {
    const node = nodeMap[nodeId];
    const base = state.phase === 'night' ? 0.16 : 0.08;
    const riskBoost = node.risk * (state.phase === 'night' ? 0.08 : 0.04);
    addHeat(nextHeat, nodeId, base + riskBoost);
  }

  return nextHeat;
};

const hasDestiny = (state: GameState, destiny: GameState['unlockedInstincts'][number]) =>
  state.unlockedInstincts.includes(destiny);

const getEra = (state: Pick<GameState, 'archiveLegend' | 'unlockedInstincts' | 'eraProjectLevels' | 'ascended'>): EraKey => {
  if (state.ascended) {
    return 'ascension';
  }
  if (
    state.unlockedInstincts.length >= 5 &&
    state.eraProjectLevels.scriptureHall >= 1 &&
    state.archiveLegend >= 90
  ) {
    return 'theology';
  }
  if (state.unlockedInstincts.length >= 3 && state.archiveLegend >= 36) {
    return 'technology';
  }
  return 'survival';
};

const applyFrontlineDrift = (state: GameState) => {
  const next = { ...state.frontlinePressure };
  const heatPeak = Math.max(...Object.values(state.nodeHeatById), 0);
  const frontierCount = getFrontierNodeIds(state.controlledNodeIds).length;
  const disconnected = getFloatingNodeIds(state.controlledNodeIds).length;

  const mapPressure = 1 + (state.currentMapTier - 1) * 0.22;
  const moonLedgerMitigation = hasDestiny(state, 'moonChaser')
    ? 0.04 + state.metaUpgradeLevels.moonLedger * 0.02
    : 0;

  next.human = clamp(
    next.human + (state.attention >= 65 ? 0.2 : -0.1) + heatPeak * 0.002,
    0,
    FRONTLINE_MAX,
  );
  next.dogs = clamp(
    next.dogs + frontierCount * 0.14 + disconnected * 0.3 - 0.08,
    0,
    FRONTLINE_MAX,
  );
  next.rivalCats = clamp(
    next.rivalCats + Math.max(0, state.controlledNodeIds.length - 2) * 0.08 - 0.05,
    0,
    FRONTLINE_MAX,
  );

  next.human = clamp(next.human * mapPressure - moonLedgerMitigation, 0, FRONTLINE_MAX);
  next.dogs = clamp(next.dogs * mapPressure - moonLedgerMitigation, 0, FRONTLINE_MAX);
  next.rivalCats = clamp(next.rivalCats * mapPressure - moonLedgerMitigation, 0, FRONTLINE_MAX);

  return next;
};

const addResources = (
  base: ResourceMap,
  delta: Partial<ResourceMap>,
  multiplier = 1,
): ResourceMap => {
  const next = copyResources(base);

  for (const key of resourceOrder) {
    const amount = delta[key] ?? 0;
    next[key] = Math.max(0, next[key] + amount * multiplier);
  }

  return next;
};

const spendResources = (
  base: ResourceMap,
  cost: Partial<ResourceMap>,
): ResourceMap => {
  const next = copyResources(base);

  for (const key of resourceOrder) {
    const amount = cost[key] ?? 0;
    next[key] = Math.max(0, next[key] - amount);
  }

  return next;
};

const canAfford = (resources: ResourceMap, cost: Partial<ResourceMap>) =>
  resourceOrder.every((key) => resources[key] >= (cost[key] ?? 0));

const hasBuilding = (
  state: GameState,
  nodeId: string,
  buildingId: BuildingKey,
) => state.buildingsByNode[nodeId]?.includes(buildingId) ?? false;

const hasGlobalBuilding = (state: GameState, buildingId: BuildingKey) =>
  Object.values(state.buildingsByNode).some((list) => list.includes(buildingId));

const sumAssignments = (assignments: GameState['assignments']) =>
  Object.values(assignments).reduce((sum, value) => sum + value, 0);

const trimAssignments = (
  assignments: GameState['assignments'],
  totalCats: number,
): GameState['assignments'] => {
  const next = { ...assignments };
  const priority: JobKey[] = [
    'canonKeeper',
    'moonPriest',
    'techSage',
    'gearSmith',
    'diplomat',
    'scout',
    'warden',
    'forager',
  ];

  while (sumAssignments(next) > totalCats) {
    const target = priority.find((jobId) => next[jobId] > 0);

    if (!target) {
      break;
    }

    next[target] -= 1;
  }

  return next;
};

const computeConnectedNodeIds = (controlledNodeIds: string[]) => {
  const controlled = new Set(controlledNodeIds);

  if (!controlled.has(MAIN_NEST_ID)) {
    return new Set<string>();
  }

  const queue = [MAIN_NEST_ID];
  const connected = new Set<string>([MAIN_NEST_ID]);

  while (queue.length) {
    const current = queue.shift()!;

    for (const neighborId of nodeMap[current].neighbors) {
      if (!controlled.has(neighborId) || connected.has(neighborId)) {
        continue;
      }

      connected.add(neighborId);
      queue.push(neighborId);
    }
  }

  return connected;
};

export const getFloatingNodeIds = (controlledNodeIds: string[]) => {
  const connected = computeConnectedNodeIds(controlledNodeIds);

  return controlledNodeIds.filter((nodeId) => !connected.has(nodeId));
};

export const getConnectedNodeIds = (controlledNodeIds: string[]) =>
  Array.from(computeConnectedNodeIds(controlledNodeIds));

const pushLog = (
  state: GameState,
  title: string,
  detail: string,
  tone: LogEntry['tone'],
) => ({
  ...state,
  nextLogId: state.nextLogId + 1,
  logs: [{ id: state.nextLogId, title, detail, tone }, ...state.logs].slice(0, 16),
});

const isOpeningDay = (state: GameState) =>
  state.phase === 'day' && state.cycleCount === 0;

const currentObservationNodes = (state: GameState) =>
  Object.entries(state.buildingsByNode)
    .filter(([, list]) => list.includes('observationPost'))
    .map(([nodeId]) => nodeId);

const getAdjacentObservationBonus = (state: GameState, nodeId: string) => {
  const observationNodes = currentObservationNodes(state);

  return observationNodes.some((sourceNodeId) =>
    nodeMap[sourceNodeId].neighbors.includes(nodeId),
  )
    ? 0.1
    : 0;
};

const getTrustMultiplier = (state: GameState) => {
  let multiplier = 1;

  if (state.attention >= 70) {
    multiplier *= 0.45;
  } else if (state.attention >= 40) {
    multiplier *= 0.72;
  }

  if (hasDestiny(state, 'kinship') && state.phase === 'day') {
    multiplier *= 1.35;
  }

  return multiplier;
};

const isTechnologyEra = (state: GameState) =>
  state.era === 'technology' || state.era === 'theology' || state.era === 'ascension';

const isTheologyEra = (state: GameState) =>
  state.era === 'theology' || state.era === 'ascension';

const getPhaseNodeYield = (
  state: GameState,
  nodeId: string,
  connected: Set<string>,
): Partial<ResourceMap> => {
  const node = nodeMap[nodeId];
  const baseYield = state.phase === 'day' ? node.dayYield : node.nightYield;
  const connectedFactor = connected.has(nodeId) ? 1 : 0.35;
  const riskFactor =
    hasDestiny(state, 'nightRaid') && state.phase === 'night' && node.risk === 3
      ? 1.25
      : 1;

  const yieldMap: Partial<ResourceMap> = {};

  for (const key of resourceOrder) {
    const value = baseYield[key];

    if (value) {
      yieldMap[key] = value * connectedFactor * riskFactor;
    }
  }

  return yieldMap;
};

const getPerSecondResourceDelta = (state: GameState) => {
  let delta = emptyResources();
  const connected = computeConnectedNodeIds(state.controlledNodeIds);

  for (const job of jobs) {
    const assigned = state.assignments[job.id];
    const jobYield = state.phase === 'day' ? job.dayYield : job.nightYield;

    let yieldMultiplier = 1;
    if (job.id === 'warden' && hasDestiny(state, 'scentWeaver')) {
      yieldMultiplier *= 1.2;
    }
    if (job.id === 'scout' && hasDestiny(state, 'streetOracle')) {
      yieldMultiplier *= 1.3;
    }
    if (job.id === 'scout') {
      yieldMultiplier *= 1 + state.eraProjectLevels.signalLab * 0.12;
    }
    if (job.id === 'forager') {
      yieldMultiplier *= 1 + state.eraProjectLevels.automaton * 0.1;
    }
    if (job.id === 'warden') {
      yieldMultiplier *= 1 + state.eraProjectLevels.automaton * 0.08;
    }
    if (isTechnologyEra(state) && (job.id === 'scout' || job.id === 'forager')) {
      yieldMultiplier *= 1.08;
    }
    if (isTheologyEra(state) && (job.id === 'diplomat' || job.id === 'warden')) {
      yieldMultiplier *= 1.1;
    }
    delta = addResources(delta, jobYield, assigned * yieldMultiplier);
  }

  for (const nodeId of state.controlledNodeIds) {
    delta = addResources(delta, getPhaseNodeYield(state, nodeId, connected));
  }

  delta.trust *= getTrustMultiplier(state);
  if (isTechnologyEra(state)) {
    delta.tech += Math.max(0, delta.intel) * 0.18 + state.eraProjectLevels.signalLab * 0.01;
  }
  if (isTheologyEra(state)) {
    delta.faith += Math.max(0, delta.trust) * 0.16 + state.eraProjectLevels.scriptureHall * 0.01;
  }

  return delta;
};

const getPerSecondAttentionDelta = (state: GameState) => {
  let delta = 0;
  const floatingNodes = getFloatingNodeIds(state.controlledNodeIds);

  if (state.phase === 'day') {
    delta -= 8 / PHASE_DURATION_SECONDS;
    delta -= state.assignments.diplomat * 0.048;

    if (hasDestiny(state, 'kinship')) {
      delta -= 0.02;
    }
    delta -= state.eraProjectLevels.scriptureHall * 0.01;
    if (isTheologyEra(state)) {
      delta -= 0.015;
    }
  } else {
    delta -= state.assignments.diplomat * 0.012;
    delta += floatingNodes.length * 0.01;
    if (isTechnologyEra(state)) {
      delta -= 0.008;
    }
  }

  return delta;
};

const buildDawnReport = (
  foodCost: number,
  maintenanceCost: number,
  floatingNodes: string[],
  lostNodes: string[],
  recruitedCat: boolean,
  patrolTriggered: boolean,
  stable: boolean,
  notes: string[],
): DawnReport => ({
  foodCost,
  maintenanceCost,
  floatingNodes,
  lostNodes,
  recruitedCat,
  patrolTriggered,
  stable,
  notes,
});

const getFrontierNodeIds = (controlledNodeIds: string[]) =>
  controlledNodeIds.filter((nodeId) => {
    if (nodeId === MAIN_NEST_ID) {
      return false;
    }

    return nodeMap[nodeId].neighbors.some((neighborId) => !controlledNodeIds.includes(neighborId));
  });

const nodeLossOrder = (controlledNodeIds: string[]) =>
  [...controlledNodeIds]
    .filter((nodeId) => nodeId !== MAIN_NEST_ID)
    .sort((left, right) => {
      const frontierNodeIds = new Set(getFrontierNodeIds(controlledNodeIds));
      const frontierBoost =
        Number(frontierNodeIds.has(right)) - Number(frontierNodeIds.has(left));

      if (frontierBoost !== 0) {
        return frontierBoost;
      }

      return nodeMap[right].risk - nodeMap[left].risk;
    });

const nodeLossOrderWithHeat = (
  controlledNodeIds: string[],
  nodeHeatById: Record<string, number>,
) =>
  [...controlledNodeIds]
    .filter((nodeId) => nodeId !== MAIN_NEST_ID)
    .sort((left, right) => {
      const heatBoost = (nodeHeatById[right] ?? 0) - (nodeHeatById[left] ?? 0);
      if (Math.abs(heatBoost) > 0.5) {
        return heatBoost;
      }
      return nodeLossOrder(controlledNodeIds).indexOf(left) - nodeLossOrder(controlledNodeIds).indexOf(right);
    });

const pickTopFrontline = (pressure: Record<FrontlineKey, number>) =>
  (Object.entries(pressure) as [FrontlineKey, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

const resolveDawn = (state: GameState) => {
  let nextState = {
    ...state,
    buildingsByNode: { ...state.buildingsByNode },
  };
  const resources = copyResources(state.resources);
  let totalCats = state.totalCats;
  let assignments = { ...state.assignments };
  let controlledNodeIds = [...state.controlledNodeIds];
  let attention = state.attention;
  const nodeHeatById = { ...state.nodeHeatById };
  const frontlinePressure = { ...state.frontlinePressure };
  const notes: string[] = [];
  const lostNodes: string[] = [];

  decayHeat(nodeHeatById, 8);

  const foodCost = totalCats * 3;
  const baseMaintenance = controlledNodeIds
    .filter((nodeId) => nodeId !== MAIN_NEST_ID)
    .reduce(
      (sum, nodeId) => sum + (hasBuilding(state, nodeId, 'scentMarker') ? 1 : 2),
      0,
    );
  const maintenanceDiscount = controlledNodeIds.includes('acBridge') ? 1 : 0;
  const maintenanceCost = Math.max(
    0,
    baseMaintenance - maintenanceDiscount - (hasDestiny(state, 'scentWeaver') ? 1 : 0),
  );

  resources.scraps = Math.max(0, resources.scraps - foodCost);
  resources.scent = Math.max(0, resources.scent - maintenanceCost);

  if (state.resources.scraps < foodCost) {
    const starvationLoss = Math.min(
      totalCats - 1,
      Math.ceil((foodCost - state.resources.scraps) / 3),
    );

    totalCats -= starvationLoss;
    assignments = trimAssignments(assignments, totalCats);
    attention = clamp(attention + starvationLoss * 6, 0, 100);
    notes.push(`残羹不足，失去了 ${starvationLoss} 只猫。`);
  }

  if (state.resources.scent < maintenanceCost) {
    const shortfall = maintenanceCost - state.resources.scent;
    const candidates = nodeLossOrderWithHeat(controlledNodeIds, nodeHeatById);
    const dropCount = Math.min(candidates.length, Math.ceil(shortfall / 2));

    for (const nodeId of candidates.slice(0, dropCount)) {
      controlledNodeIds = controlledNodeIds.filter((value) => value !== nodeId);
      delete nextState.buildingsByNode[nodeId];
      lostNodes.push(nodeId);
    }

    if (dropCount > 0) {
      attention = clamp(attention + dropCount * 8, 0, 100);
      notes.push(`气味维护崩口，外围节点失守：${lostNodes.map((id) => nodeMap[id].name).join('、')}。`);
    }
  }

  const floatingNodes = getFloatingNodeIds(controlledNodeIds);

  if (floatingNodes.length > 0) {
    attention = clamp(attention + floatingNodes.length * 5, 0, 100);
    notes.push(`存在游离节点：${floatingNodes.map((id) => nodeMap[id].name).join('、')}。`);
  }

  const patrolChance =
    attention >= 100
      ? 1
      : attention >= 70
        ? 0.35 + (attention - 70) * 0.015 - (isTheologyEra(state) ? 0.06 : 0)
        : 0;
  const patrolTriggered = Math.random() < patrolChance;

  if (patrolTriggered) {
    const target = nodeLossOrderWithHeat(controlledNodeIds, nodeHeatById)[0];

    if (target) {
      controlledNodeIds = controlledNodeIds.filter((value) => value !== target);
      delete nextState.buildingsByNode[target];
      lostNodes.push(target);
      notes.push(`黎明巡查切走了 ${nodeMap[target].name}。`);
      addHeat(nodeHeatById, target, 20);
    } else {
      resources.scraps = Math.max(0, resources.scraps - 6);
      notes.push('黎明巡查扫过主巢周边，带走了部分残羹。');
    }

    attention = clamp(attention - 24, 0, 100);
  }

  const topFrontline = pickTopFrontline(frontlinePressure);
  const frontlineTriggerChance = clamp(
    0.16 + frontlinePressure[topFrontline] / 180,
    0.16,
    0.62,
  );
  const frontlineTriggered = Math.random() < frontlineTriggerChance;

  if (frontlineTriggered) {
    if (topFrontline === 'human') {
      const target = nodeLossOrderWithHeat(controlledNodeIds, nodeHeatById)
        .filter((nodeId) => (nodeHeatById[nodeId] ?? 0) >= 40)[0];
      if (target) {
        controlledNodeIds = controlledNodeIds.filter((value) => value !== target);
        delete nextState.buildingsByNode[target];
        lostNodes.push(target);
        notes.push(`人类前线清理了热点区域，${nodeMap[target].name} 被封控。`);
        addHeat(nodeHeatById, target, 18);
      } else {
        resources.trust = Math.max(0, resources.trust - 3);
        notes.push('人类前线收紧巡查，城邦信任受挫。');
      }
      frontlinePressure.human = clamp(frontlinePressure.human - 22, 0, FRONTLINE_MAX);
    } else if (topFrontline === 'dogs') {
      const frontierSet = new Set(getFrontierNodeIds(controlledNodeIds));
      const target = nodeLossOrderWithHeat(controlledNodeIds, nodeHeatById)
        .find((nodeId) => frontierSet.has(nodeId));
      if (target) {
        controlledNodeIds = controlledNodeIds.filter((value) => value !== target);
        delete nextState.buildingsByNode[target];
        lostNodes.push(target);
        notes.push(`狗群前线切断边界，${nodeMap[target].name} 被冲散。`);
      } else {
        resources.scent = Math.max(0, resources.scent - 4);
        notes.push('狗群在边界扰动，气味维护额外损耗。');
      }
      frontlinePressure.dogs = clamp(frontlinePressure.dogs - 24, 0, FRONTLINE_MAX);
    } else {
      const frontierSet = new Set(getFrontierNodeIds(controlledNodeIds));
      const target = nodeLossOrderWithHeat(controlledNodeIds, nodeHeatById)
        .find((nodeId) => frontierSet.has(nodeId));
      if (target) {
        resources.scraps = Math.max(0, resources.scraps - 5);
        addHeat(nodeHeatById, target, 12);
        notes.push(`rival 猫群在 ${nodeMap[target].name} 抢边，残羹被截走。`);
      } else {
        resources.legend = Math.max(0, resources.legend - 1);
        notes.push('rival 猫群散播对你不利传闻，传说积累受损。');
      }
      frontlinePressure.rivalCats = clamp(
        frontlinePressure.rivalCats - 20,
        0,
        FRONTLINE_MAX,
      );
    }
  }

  const connectedAfterDawn = computeConnectedNodeIds(controlledNodeIds);
  const moonPlatformOnline =
    controlledNodeIds.includes(SUBWAY_ID) &&
    connectedAfterDawn.has(SUBWAY_ID) &&
    hasBuilding(nextState, SUBWAY_ID, 'moonPlatform');

  if (moonPlatformOnline) {
    resources.legend += hasDestiny(state, 'moonChaser') ? 4 : 2;
    notes.push('月台与地铁废口共振，额外收集了 2 点传说。');
  }
  if (hasDestiny(state, 'moonChaser')) {
    resources.legend += 1;
  }
  resources.legend += state.currentMapTier - 1;
  resources.legend += state.eraProjectLevels.moonCathedral > 0
    ? state.eraProjectLevels.moonCathedral * 0.8
    : 0;
  if (isTechnologyEra(state)) {
    resources.legend += resources.tech * 0.015;
  }
  if (isTheologyEra(state)) {
    resources.legend += resources.faith * 0.02;
  }

  const recruitmentChance = clamp(
    0.15 +
      Math.min(resources.trust, 16) * 0.025 +
      connectedAfterDawn.size * 0.04 +
      (hasDestiny(state, 'kinship') ? 0.08 : 0),
    0.15,
    0.82,
  );
  const recruitedCat =
    totalCats < state.catCap &&
    resources.scraps >= 6 &&
    Math.random() < recruitmentChance;

  if (recruitedCat) {
    totalCats += 1;
    notes.push('新的流浪猫循着气味加入了城邦。');
  }

  assignments = trimAssignments(assignments, totalCats);

  const stable =
    lostNodes.length === 0 &&
    floatingNodes.length === 0 &&
    !patrolTriggered &&
    state.resources.scraps >= foodCost &&
    state.resources.scent >= maintenanceCost;

  nextState = {
    ...nextState,
    resources,
    totalCats,
    assignments,
    controlledNodeIds,
    attention,
    lastDawnReport: buildDawnReport(
      foodCost,
      maintenanceCost,
      floatingNodes,
      lostNodes,
      recruitedCat,
      patrolTriggered,
      stable,
      notes,
    ),
    cycleCount: state.cycleCount + 1,
    nodeHeatById,
    frontlinePressure,
  };

  const connectedCount = computeConnectedNodeIds(controlledNodeIds).size;
  const rebirthReady =
    stable &&
    moonPlatformOnline &&
    connectedCount >= 4 &&
    nextState.controlledNodeIds.includes(SUBWAY_ID);

  nextState.rebirthReady = rebirthReady;

  nextState = pushLog(
    nextState,
    '黎明结算',
    notes.length > 0 ? notes.join(' ') : '这一夜平稳收束，气味网络保持完整。',
    stable ? 'good' : 'warning',
  );

  return nextState;
};

const transitionPhase = (state: GameState) => {
  if (state.phase === 'day') {
    return pushLog(
      {
        ...state,
        phase: 'night',
        phaseSecondsRemaining: PHASE_DURATION_SECONDS,
      },
      '夜幕降下',
      '夜间行动窗口开启，扩张成本下降，但失误更致命。',
      'neutral',
    );
  }

  return resolveDawn({
    ...state,
    phase: 'day',
    phaseSecondsRemaining: PHASE_DURATION_SECONDS,
  });
};

const maybeTogglePhase = (state: GameState) => {
  if (state.phaseSecondsRemaining > 1) {
    return { ...state, phaseSecondsRemaining: state.phaseSecondsRemaining - 1 };
  }

  return transitionPhase(state);
};

const advancePhaseWithFastForwardBonus = (state: GameState) => {
  const perSecond = getPerSecondResourceDelta(state);
  const seconds = Math.max(0, state.phaseSecondsRemaining);
  const bonusMultiplier = seconds * 0.5;
  const bonus = emptyResources();

  for (const key of resourceOrder) {
    bonus[key] = Math.max(0, perSecond[key]) * bonusMultiplier;
  }

  const nextState = pushLog(
    {
      ...state,
      resources: addResources(state.resources, bonus),
    },
    '阶段快进',
    `已按剩余时长折算并发放本阶段 50% 收益（${seconds} 秒）。`,
    'neutral',
  );

  return transitionPhase(nextState);
};

const expandNode = (state: GameState, nodeId: string) => {
  const node = nodeMap[nodeId];

  if (!node || state.controlledNodeIds.includes(nodeId)) {
    return state;
  }

  const connected = computeConnectedNodeIds(state.controlledNodeIds);
  const isReachable = node.neighbors.some((neighborId) => connected.has(neighborId));

  if (!isReachable) {
    return pushLog(
      state,
      '扩张失败',
      '目标节点没有和当前气味网络相连，必须先拿到中继点。',
      'danger',
    );
  }

  const scentCost =
    state.phase === 'night'
      ? Math.max(2, 6 - (hasDestiny(state, 'nightRaid') ? 2 : 0))
      : 10;
  const baseCost = { scent: scentCost };

  if (!canAfford(state.resources, baseCost)) {
    return pushLog(
      state,
      '气味不足',
      `占领 ${node.name} 需要 ${scentCost} 点气味。`,
      'warning',
    );
  }

  let failureChance =
    (state.phase === 'night' ? 0.1 : 0.24) +
    node.risk * (state.phase === 'night' ? 0.12 : 0.16) +
    state.attention / 240;

  failureChance -= state.assignments.scout * (state.phase === 'night' ? 0.07 : 0.04);
  failureChance -= Math.min(state.resources.intel, 14) * 0.01;
  failureChance -= getAdjacentObservationBonus(state, nodeId);

  if (hasDestiny(state, 'kinship') && state.phase === 'day') {
    failureChance -= 0.04;
  }

  if (hasDestiny(state, 'nightRaid') && state.phase === 'night') {
    failureChance -= 0.08;
  }
  if (hasDestiny(state, 'streetOracle')) {
    failureChance -= 0.05;
  }
  if (isTechnologyEra(state)) {
    failureChance -= 0.04;
  }
  if (isTheologyEra(state)) {
    failureChance -= 0.02;
  }

  failureChance = clamp(failureChance, 0.08, 0.82);

  const nextState = {
    ...state,
    resources: spendResources(state.resources, baseCost),
    selectedNodeId: nodeId,
    nodeHeatById: { ...state.nodeHeatById },
  };

  const actionAttention =
    (state.phase === 'day' ? 8 : 0) +
    (state.phase === 'night' ? 6 : 3) +
    node.risk * 5 +
    (state.currentMapTier - 1) * 2;
  const success = Math.random() >= failureChance;

  const updatedAttention = clamp(nextState.attention + actionAttention, 0, 100);

  if (success) {
    addHeat(nextState.nodeHeatById, nodeId, 24 + node.risk * 6);
    for (const neighborId of node.neighbors) {
      addHeat(nextState.nodeHeatById, neighborId, 4);
    }
    return pushLog(
      {
        ...nextState,
        attention: updatedAttention,
        controlledNodeIds: [...state.controlledNodeIds, nodeId],
      },
      '节点占领',
      `${node.name} 已纳入城邦。风险 ${node.risk}/3，当前扩张失败率约 ${Math.round(
        failureChance * 100,
      )}%。`,
      'good',
    );
  }

  addHeat(nextState.nodeHeatById, nodeId, 16 + node.risk * 4);
  nextState.attention = clamp(nextState.attention + 6, 0, 100);

  return pushLog(
    {
      ...nextState,
      attention: clamp(updatedAttention + 6, 0, 100),
    },
    '行动暴露',
    `${node.name} 这次没有拿下，注意度明显上升。失败率约 ${Math.round(
      failureChance * 100,
    )}%。`,
    'danger',
  );
};

const canBuildAtNode = (
  state: GameState,
  nodeId: string,
  buildingId: BuildingKey,
) => {
  const building = buildingMap[buildingId];

  if (!building) {
    return false;
  }

  if (!state.controlledNodeIds.includes(nodeId)) {
    return false;
  }

  if (hasBuilding(state, nodeId, buildingId)) {
    return false;
  }

  if (building.unique === 'global' && hasGlobalBuilding(state, buildingId)) {
    return false;
  }

  if (building.buildRule === 'mainNest') {
    return nodeId === MAIN_NEST_ID;
  }

  if (building.buildRule === 'subway') {
    return nodeId === SUBWAY_ID;
  }

  if (building.buildRule === 'controlledNonMain') {
    return nodeId !== MAIN_NEST_ID;
  }

  return true;
};

const buildStructure = (
  state: GameState,
  nodeId: string,
  buildingId: BuildingKey,
) => {
  const building = buildingMap[buildingId];

  if (!building || !canBuildAtNode(state, nodeId, buildingId)) {
    return state;
  }

  const actualCost: Partial<ResourceMap> = { ...building.cost };
  if (hasDestiny(state, 'scrapEngineer') && (actualCost.scraps ?? 0) > 0) {
    actualCost.scraps = Math.max(1, Math.ceil((actualCost.scraps ?? 0) * 0.8));
  }

  if (!canAfford(state.resources, actualCost)) {
    return pushLog(
      state,
      '建造失败',
      `${building.name} 所需资源还没凑齐。`,
      'warning',
    );
  }

  const buildingsForNode = [...(state.buildingsByNode[nodeId] ?? []), buildingId];
  const nextState: GameState = {
    ...state,
    resources: spendResources(state.resources, actualCost),
    buildingsByNode: {
      ...state.buildingsByNode,
      [nodeId]: buildingsForNode,
    },
    catCap: buildingId === 'hideout' ? state.catCap + 2 : state.catCap,
  };

  if (buildingId === 'moonPlatform') {
    nextState.resources.legend += 3;
  }

  return pushLog(
    nextState,
    '建筑落成',
    `${building.name} 已在 ${nodeMap[nodeId].name} 完成。${building.description}`,
    'good',
  );
};

const rebirth = (state: GameState, instinct: GameState['instinct']) => {
  if (!state.rebirthReady || !instinct) {
    return state;
  }

  if (state.unlockedInstincts.includes(instinct)) {
    return pushLog(
      state,
      '命途已觉醒',
      '该命途已是永久增益，请选择新的命途进行下一次轮回。',
      'warning',
    );
  }
  const nextUnlockedInstincts = [...state.unlockedInstincts, instinct];
  const next = createInitialState(
    nextUnlockedInstincts,
    instinct,
    state.lives + 1,
    state.archiveLegend + Math.floor(state.resources.legend),
    state.metaUpgradeLevels,
    state.unlockedMapTiers,
    state.currentMapTier,
    state.eraProjectLevels,
    state.ascended,
  );

  return pushLog(
    next,
    '命途觉醒',
    `已永久觉醒 ${getInstinctName(instinct)}，后续每一命都会继承该增益。`,
    'good',
  );
};

const buyEraProject = (state: GameState, projectId: EraProjectKey) => {
  const era = getEra(state);
  if (projectId === 'scriptureHall' || projectId === 'moonCathedral') {
    if (era !== 'theology' && era !== 'ascension') {
      return pushLog(state, '时代未满足', '神学项目需先进入神学时代。', 'warning');
    }
  } else if (era === 'survival') {
    return pushLog(state, '时代未满足', '科技项目需先进入科技时代。', 'warning');
  }

  const currentLevel = state.eraProjectLevels[projectId];
  if (currentLevel >= ERA_PROJECT_MAX_LEVEL) {
    return pushLog(state, '时代项目', '该项目已满级。', 'warning');
  }

  const cost = eraProjectCost(projectId, currentLevel);
  if (state.archiveLegend < cost) {
    return pushLog(state, '传说不足', `升级需要 ${cost} 传说。`, 'warning');
  }

  const nextState: GameState = {
    ...state,
    archiveLegend: state.archiveLegend - cost,
    eraProjectLevels: {
      ...state.eraProjectLevels,
      [projectId]: currentLevel + 1,
    },
  };
  nextState.era = getEra(nextState);
  return pushLog(nextState, '时代项目升级', `${eraProjectLabels[projectId]} 已提升到 Lv.${currentLevel + 1}。`, 'good');
};

const ascend = (state: GameState) => {
  if (state.ascended) {
    return state;
  }
  const canAscend =
    getEra(state) === 'theology' &&
    state.eraProjectLevels.scriptureHall >= 3 &&
    state.eraProjectLevels.moonCathedral >= 2 &&
    state.archiveLegend >= 180;
  if (!canAscend) {
    return pushLog(state, '飞升条件不足', '需要更高神学积累与传说储备。', 'warning');
  }
  const nextState: GameState = {
    ...state,
    ascended: true,
    era: 'ascension',
  };
  return pushLog(nextState, '猫教飞升', '你已建立猫教并完成飞升，城邦进入永恒纪元。', 'good');
};

const buyMetaUpgrade = (state: GameState, upgradeId: MetaUpgradeKey) => {
  const currentLevel = state.metaUpgradeLevels[upgradeId];
  if (currentLevel >= MAX_META_LEVEL) {
    return pushLog(state, '局外升级', '该升级已达到最高等级。', 'warning');
  }
  const cost = getMetaUpgradeCost(upgradeId, currentLevel);
  if (state.archiveLegend < cost) {
    return pushLog(state, '传说不足', `升级需要 ${cost} 传说。`, 'warning');
  }

  const nextState: GameState = {
    ...state,
    archiveLegend: state.archiveLegend - cost,
    metaUpgradeLevels: {
      ...state.metaUpgradeLevels,
      [upgradeId]: currentLevel + 1,
    },
  };
  return pushLog(nextState, '局外升级完成', `消耗 ${cost} 传说，升级已生效。`, 'good');
};

const setMapTier = (state: GameState, tier: number) => {
  if (!state.unlockedMapTiers.includes(tier)) {
    return pushLog(state, '地图未解锁', '先用传说点数解锁该地图层级。', 'warning');
  }
  if (state.currentMapTier === tier) {
    return state;
  }
  return pushLog(
    {
      ...state,
      currentMapTier: tier,
    },
    '切换地图层级',
    `已切换到 ${tier} 级地图，下一轮将按新的城市压力运行。`,
    'neutral',
  );
};

const assignCat = (state: GameState, jobId: JobKey, delta: 1 | -1) => {
  const nextAssignments = { ...state.assignments };
  const idleCats = state.totalCats - sumAssignments(state.assignments);

  if (delta === 1 && idleCats <= 0) {
    return state;
  }

  if (delta === -1 && nextAssignments[jobId] <= 0) {
    return state;
  }

  nextAssignments[jobId] += delta;

  return {
    ...state,
    assignments: nextAssignments,
  };
};

const openingScavenge = (state: GameState) => {
  if (!isOpeningDay(state)) {
    return state;
  }

  const nextIndex = state.openingScavengeClicks;

  if (nextIndex >= openingScavengeYields.length) {
    return state;
  }

  const scrapsGain = openingScavengeYields[nextIndex];
  const attentionGain = openingScavengeAttention[nextIndex];
  const remainingUses = openingScavengeYields.length - nextIndex - 1;

  return pushLog(
    {
      ...state,
      openingScavengeClicks: nextIndex + 1,
      resources: addResources(state.resources, { scraps: scrapsGain }),
      attention: clamp(state.attention + attentionGain, 0, 100),
    },
    '主巢翻找',
    remainingUses > 0
      ? `在主巢周边翻出了 ${scrapsGain} 点残羹。还剩 ${remainingUses} 次开局翻找机会。`
      : `在主巢周边翻出了 ${scrapsGain} 点残羹。附近能捡的第一批口粮已经搜得差不多了。`,
    attentionGain > 0 ? 'warning' : 'good',
  );
};

const tick = (state: GameState) => {
  const delta = getPerSecondResourceDelta(state);
  const driftedFrontline = applyFrontlineDrift(state);
  const nextState = {
    ...state,
    resources: addResources(state.resources, delta),
    attention: clamp(state.attention + getPerSecondAttentionDelta(state), 0, 100),
    nodeHeatById: applyPassiveHeat(state),
    frontlinePressure: hasDestiny(state, 'moonChaser')
      ? {
          human: Math.max(0, driftedFrontline.human - 0.04),
          dogs: Math.max(0, driftedFrontline.dogs - 0.04),
          rivalCats: Math.max(0, driftedFrontline.rivalCats - 0.04),
        }
      : driftedFrontline,
  };

  return maybeTogglePhase(nextState);
};

export const formatNumber = (value: number) =>
  value >= 10 ? value.toFixed(0) : value.toFixed(1);

export const getAttentionBand = (attention: number) => {
  if (attention >= 70) {
    return { label: '高压区', hint: '下一次黎明可能触发巡查', tone: 'danger' as const };
  }

  if (attention >= 40) {
    return { label: '紧张区', hint: '信任增长变慢', tone: 'warning' as const };
  }

  return { label: '安全区', hint: '扩张节奏仍可控', tone: 'good' as const };
};

export const getNodeById = (nodeId: string) => nodeMap[nodeId];

export const frontlineLabels: Record<FrontlineKey, string> = {
  human: '人类前线',
  dogs: '狗群前线',
  rivalCats: 'rival 猫群',
};

export const getControlledNodeSet = (state: GameState) =>
  new Set(state.controlledNodeIds);

export const getNodeStatus = (state: GameState, nodeId: string) => {
  const connected = computeConnectedNodeIds(state.controlledNodeIds);
  const controlled = state.controlledNodeIds.includes(nodeId);

  return {
    controlled,
    connected: connected.has(nodeId),
    floating: controlled && !connected.has(nodeId),
    heat: state.nodeHeatById[nodeId] ?? 0,
  };
};

export const getNodeHeatLabel = (heat: number) => {
  if (heat >= 70) {
    return '高热';
  }
  if (heat >= 40) {
    return '升温';
  }
  return '平稳';
};

export const getNodeVulnerabilityScore = (state: GameState, nodeId: string) => {
  if (!state.controlledNodeIds.includes(nodeId) || nodeId === MAIN_NEST_ID) {
    return 0;
  }

  const node = nodeMap[nodeId];
  const controlledSet = new Set(state.controlledNodeIds);
  const controlledNeighbors = node.neighbors.filter((neighborId) =>
    controlledSet.has(neighborId),
  ).length;
  const frontierPressure = node.neighbors.filter((neighborId) =>
    !controlledSet.has(neighborId),
  ).length;
  const disconnectedPenalty = controlledNeighbors <= 1 ? 28 : controlledNeighbors === 2 ? 12 : 0;
  const riskPressure = node.risk * 14;
  const heatPressure = (state.nodeHeatById[nodeId] ?? 0) * 0.42;

  return clamp(
    Math.round(disconnectedPenalty + frontierPressure * 8 + riskPressure + heatPressure),
    0,
    100,
  );
};

export const getMostVulnerableNodeId = (state: GameState) => {
  const candidates = state.controlledNodeIds.filter((nodeId) => nodeId !== MAIN_NEST_ID);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort(
    (a, b) => getNodeVulnerabilityScore(state, b) - getNodeVulnerabilityScore(state, a),
  )[0];
};

export const getHottestNodeId = (state: GameState) => {
  const candidates = state.controlledNodeIds;
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (state.nodeHeatById[b] ?? 0) - (state.nodeHeatById[a] ?? 0))[0];
};

export const getFrontlineSummary = (state: GameState) => {
  const entries = (Object.entries(state.frontlinePressure) as [FrontlineKey, number][])
    .sort((a, b) => b[1] - a[1]);
  const [topKey, topValue] = entries[0];

  return {
    topKey,
    topValue: Math.round(topValue),
    entries: entries.map(([key, value]) => ({
      key,
      label: frontlineLabels[key],
      value: Math.round(value),
    })),
  };
};

export const metaUpgradeLabels: Record<MetaUpgradeKey, string> = {
  deepLarder: '深储粮仓',
  scentDoctrine: '气味教条',
  moonLedger: '月帐谱',
};

export const getMetaUpgradePanel = (state: GameState) => {
  const upgrades: MetaUpgradeKey[] = ['deepLarder', 'scentDoctrine', 'moonLedger'];
  return upgrades.map((upgradeId) => {
    const level = state.metaUpgradeLevels[upgradeId];
    return {
      id: upgradeId,
      name: metaUpgradeLabels[upgradeId],
      level,
      maxLevel: MAX_META_LEVEL,
      cost: level >= MAX_META_LEVEL ? null : getMetaUpgradeCost(upgradeId, level),
    };
  });
};

export const getMapTierPanel = (state: GameState) => {
  return [1, 2, 3].map((tier) => ({
    tier,
    unlocked: state.unlockedMapTiers.includes(tier),
    active: state.currentMapTier === tier,
    unlockCost: tier === 1 ? 0 : mapTierUnlockCost[tier],
  }));
};

export const getEraPanel = (state: GameState) => {
  const era = getEra(state);
  const technologyProjects: EraProjectKey[] = ['signalLab', 'automaton'];
  const theologyProjects: EraProjectKey[] = ['scriptureHall', 'moonCathedral'];
  const visibleProjectIds: EraProjectKey[] = [
    ...technologyProjects,
    ...(era === 'theology' || era === 'ascension' ? theologyProjects : []),
  ];

  const projects = visibleProjectIds.map((projectId) => {
    const level = state.eraProjectLevels[projectId];
    return {
      id: projectId,
      name: eraProjectLabels[projectId],
      level,
      maxLevel: ERA_PROJECT_MAX_LEVEL,
      cost: level >= ERA_PROJECT_MAX_LEVEL ? null : eraProjectCost(projectId, level),
      lockedByEra: era === 'survival',
    };
  });
  const canAscend =
    era === 'theology' &&
    state.eraProjectLevels.scriptureHall >= 3 &&
    state.eraProjectLevels.moonCathedral >= 2 &&
    state.archiveLegend >= 180 &&
    !state.ascended;

  return {
    era,
    projects,
    canAscend,
  };
};

export const unlockMapTierIfAffordable = (state: GameState, tier: number) => {
  if (tier <= 1 || state.unlockedMapTiers.includes(tier)) {
    return state;
  }
  const cost = mapTierUnlockCost[tier];
  if (state.archiveLegend < cost) {
    return pushLog(state, '传说不足', `解锁 ${tier} 级地图需要 ${cost} 传说。`, 'warning');
  }
  return pushLog(
    {
      ...state,
      archiveLegend: state.archiveLegend - cost,
      unlockedMapTiers: [...state.unlockedMapTiers, tier].sort((a, b) => a - b),
    },
    '地图解锁',
    `已解锁 ${tier} 级地图。`,
    'good',
  );
};

export const getPreviewDawn = (state: GameState) => {
  const floatingNodes = getFloatingNodeIds(state.controlledNodeIds);
  const foodCost = state.totalCats * 3;
  const maintenanceCost = Math.max(
    0,
    state.controlledNodeIds
      .filter((nodeId) => nodeId !== MAIN_NEST_ID)
      .reduce(
        (sum, nodeId) => sum + (hasBuilding(state, nodeId, 'scentMarker') ? 1 : 2),
        0,
      ) -
      (state.controlledNodeIds.includes('acBridge') ? 1 : 0) -
      (hasDestiny(state, 'scentWeaver') ? 1 : 0),
  );
  const patrolChance =
    state.attention >= 100
      ? 1
      : state.attention >= 70
        ? 0.35 + (state.attention - 70) * 0.015 - (isTheologyEra(state) ? 0.06 : 0)
        : 0;

  return {
    foodCost,
    maintenanceCost,
    floatingNodes,
    patrolChance: clamp(patrolChance, 0, 1),
  };
};

export const getOpeningScavengeInfo = (state: GameState) => {
  const remainingUses = Math.max(
    0,
    openingScavengeYields.length - state.openingScavengeClicks,
  );
  const active = isOpeningDay(state);

  return {
    active,
    remainingUses,
    totalUses: openingScavengeYields.length,
    nextScraps: active && remainingUses > 0
      ? openingScavengeYields[state.openingScavengeClicks]
      : 0,
    nextAttention: active && remainingUses > 0
      ? openingScavengeAttention[state.openingScavengeClicks]
      : 0,
  };
};

export const getPerSecondSummary = (state: GameState) =>
  getPerSecondResourceDelta(state);

export const getAvailableJobs = (state: GameState) =>
  jobs.filter((job) => {
    if (!job.eraUnlock) {
      return true;
    }
    if (job.eraUnlock === 'technology') {
      return state.era !== 'survival';
    }
    return state.era === 'theology' || state.era === 'ascension';
  });

export const getExpansionInfo = (state: GameState, nodeId: string) => {
  const node = nodeMap[nodeId];

  if (!node || state.controlledNodeIds.includes(nodeId)) {
    return null;
  }

  const connected = computeConnectedNodeIds(state.controlledNodeIds);
  const reachable = node.neighbors.some((neighborId) => connected.has(neighborId));
  const scentCost =
    state.phase === 'night'
      ? Math.max(2, 6 - (hasDestiny(state, 'nightRaid') ? 2 : 0))
      : 10;

  let failureChance =
    (state.phase === 'night' ? 0.1 : 0.24) +
    node.risk * (state.phase === 'night' ? 0.12 : 0.16) +
    state.attention / 240;

  failureChance -= state.assignments.scout * (state.phase === 'night' ? 0.07 : 0.04);
  failureChance -= Math.min(state.resources.intel, 14) * 0.01;
  failureChance -= getAdjacentObservationBonus(state, nodeId);

  if (hasDestiny(state, 'kinship') && state.phase === 'day') {
    failureChance -= 0.04;
  }

  if (hasDestiny(state, 'nightRaid') && state.phase === 'night') {
    failureChance -= 0.08;
  }
  if (hasDestiny(state, 'streetOracle')) {
    failureChance -= 0.05;
  }
  if (isTechnologyEra(state)) {
    failureChance -= 0.04;
  }
  if (isTheologyEra(state)) {
    failureChance -= 0.02;
  }

  return {
    reachable,
    scentCost,
    failureChance: clamp(failureChance, 0.08, 0.82),
  };
};

export const getAvailableBuildings = (state: GameState, nodeId: string) =>
  buildings.filter((building) => canBuildAtNode(state, nodeId, building.id));

export const getNodeDisplayYield = (state: GameState, nodeId: string) => {
  const connected = computeConnectedNodeIds(state.controlledNodeIds);

  return getPhaseNodeYield(state, nodeId, connected);
};

const getInstinctName = (instinct: NonNullable<GameState['instinct']>) => {
  const names: Record<NonNullable<GameState['instinct']>, string> = {
    kinship: '亲人本命',
    nightRaid: '夜袭本命',
    scentWeaver: '织气本命',
    streetOracle: '街兆本命',
    scrapEngineer: '匠巢本命',
    moonChaser: '逐月本命',
  };
  return names[instinct];
};

export const createInitialState = (
  unlockedInstincts: GameState['unlockedInstincts'] = [],
  instinct: GameState['instinct'] = null,
  lives = 1,
  archiveLegend = 0,
  metaUpgradeLevels: GameState['metaUpgradeLevels'] = {
    deepLarder: 0,
    scentDoctrine: 0,
    moonLedger: 0,
  },
  unlockedMapTiers: number[] = [1],
  currentMapTier = 1,
  eraProjectLevels: GameState['eraProjectLevels'] = {
    signalLab: 0,
    automaton: 0,
    scriptureHall: 0,
    moonCathedral: 0,
  },
  ascended = false,
): GameState => {
  const resources = copyResources(initialResources);

  if (unlockedInstincts.includes('kinship')) {
    resources.trust += 4;
  }

  if (unlockedInstincts.includes('nightRaid')) {
    resources.scent += 3;
  }
  if (unlockedInstincts.includes('scrapEngineer')) {
    resources.scraps += 2;
  }
  resources.scraps += metaUpgradeLevels.deepLarder * 2;
  resources.scent += metaUpgradeLevels.scentDoctrine * 2;

  const initialState: GameState = {
    phase: 'day',
    phaseSecondsRemaining: PHASE_DURATION_SECONDS,
    attention: unlockedInstincts.includes('kinship') ? 2 : 5,
    resources,
    totalCats: 3,
    catCap: 4 + (unlockedInstincts.includes('scrapEngineer') ? 1 : 0),
    assignments: {
      forager: 2,
      diplomat: 1,
      scout: 0,
      warden: 0,
      techSage: 0,
      gearSmith: 0,
      moonPriest: 0,
      canonKeeper: 0,
    },
    controlledNodeIds: [MAIN_NEST_ID],
    buildingsByNode: {
      [MAIN_NEST_ID]: [],
    },
    selectedNodeId: MAIN_NEST_ID,
    logs: [
      {
        id: 1,
        title: '九命城邦启动',
        detail: '主巢已经点亮。第一天白天可以手动翻找残羹，先稳住口粮，再决定今晚是否扩张。',
        tone: 'neutral',
      },
    ],
    nextLogId: 2,
    lastDawnReport: null,
    instinct,
    unlockedInstincts,
    lives,
    archiveLegend,
    metaUpgradeLevels,
    unlockedMapTiers,
    currentMapTier,
    era: getEra({ archiveLegend, unlockedInstincts, eraProjectLevels, ascended }),
    eraProjectLevels,
    ascended,
    cycleCount: 0,
    rebirthReady: false,
    paused: false,
    openingScavengeClicks: 0,
    nodeHeatById: getInitialNodeHeat(),
    frontlinePressure: {
      human: 18,
      dogs: 24,
      rivalCats: 20,
    },
  };

  return initialState;
};

export const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'reset':
      return createInitialState();
    case 'tick':
      return state.paused ? state : tick(state);
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'openingScavenge':
      return openingScavenge(state);
    case 'selectNode':
      return { ...state, selectedNodeId: action.nodeId };
    case 'assignCat':
      return assignCat(state, action.jobId, action.delta);
    case 'expandNode':
      return expandNode(state, action.nodeId);
    case 'build':
      return buildStructure(state, action.nodeId, action.buildingId);
    case 'advancePhase':
      return advancePhaseWithFastForwardBonus(state);
    case 'rebirth':
      return rebirth(state, action.instinct);
    case 'buyMetaUpgrade':
      return buyMetaUpgrade(state, action.upgradeId);
    case 'setMapTier': {
      if (state.unlockedMapTiers.includes(action.tier)) {
        return setMapTier(state, action.tier);
      }
      return unlockMapTierIfAffordable(state, action.tier);
    }
    case 'buyEraProject':
      return buyEraProject(state, action.projectId);
    case 'ascend':
      return ascend(state);
    default:
      return state;
  }
};
