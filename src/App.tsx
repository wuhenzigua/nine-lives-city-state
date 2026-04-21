import { useEffect, useEffectEvent, useReducer, useState } from 'react';
import './App.css';
import manualText from './help/manual.md?raw';
import {
  buildings,
  instincts,
  nodes,
  resourceLabels,
  resourceOrder,
} from './game/config';
import {
  createInitialState,
  formatNumber,
  gameReducer,
  getAttentionBand,
  getAvailableBuildings,
  getConnectedNodeIds,
  getExpansionInfo,
  getNodeById,
  getNodeHeatLabel,
  getNodeDisplayYield,
  getNodeVulnerabilityScore,
  getNodeStatus,
  getPerSecondSummary,
  getPreviewDawn,
  getHottestNodeId,
  getMostVulnerableNodeId,
  getFrontlineSummary,
  getMetaUpgradePanel,
  getMapTierPanel,
  getEraPanel,
  getAvailableJobs,
} from './game/logic';
import type { ResourceMap } from './game/types';

const edges = nodes.flatMap((node) =>
  node.neighbors
    .filter((neighborId) => node.id < neighborId)
    .map((neighborId) => [node.id, neighborId] as const),
);

const phaseCopy = {
  day: {
    title: '白天潜伏',
    subtitle: '压低注意度，刷信任和情报，为夜晚行动做铺垫。',
  },
  night: {
    title: '夜晚扩张',
    subtitle: '扩张成本更低，收益更高，但失败会显著暴露城邦。',
  },
};

const attentionThresholds = [
  { max: 39, label: '安全区' },
  { max: 69, label: '紧张区' },
  { max: 100, label: '高压区' },
];

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;

  return `${minutes}:${String(remain).padStart(2, '0')}`;
};

const sumAssignments = (assignments: Record<string, number>) =>
  Object.values(assignments).reduce((sum, value) => sum + value, 0);

const describeYield = (yieldMap: Partial<ResourceMap>) => {
  const items = resourceOrder
    .filter((key) => (yieldMap[key] ?? 0) > 0.01)
    .map((key) => `${resourceLabels[key]} +${formatNumber(yieldMap[key] ?? 0)}/秒`);

  return items.length > 0 ? items.join(' · ') : '当前阶段无显著产出';
};

const summarizeYield = (yieldMap: Partial<ResourceMap>) =>
  resourceOrder.reduce((sum, key) => sum + (yieldMap[key] ?? 0), 0);

const canAfford = (resources: ResourceMap, cost: Partial<ResourceMap>) =>
  resourceOrder.every((key) => resources[key] >= (cost[key] ?? 0));

const compactText = (value: string, limit = 40) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

const getDecisionHint = ({
  attention,
  phase,
  scraps,
  previewDawn,
  expansionInfo,
  selectedNodeName,
}: {
  attention: number;
  phase: 'day' | 'night';
  scraps: number;
  previewDawn: ReturnType<typeof getPreviewDawn>;
  expansionInfo: ReturnType<typeof getExpansionInfo>;
  selectedNodeName: string;
}) => {
  if (previewDawn.foodCost > scraps) {
    return {
      title: '残羹撑不到下一个黎明',
      detail: '先稳口粮，再谈外扩。优先补残羹而不是继续贪线。',
    };
  }

  if (previewDawn.floatingNodes.length > 0) {
    return {
      title: '先补回气味链',
      detail: '已有游离节点。现在继续外扩，结算只会更差。',
    };
  }

  if (attention >= 70) {
    return {
      title: '城邦过热',
      detail: '下一次黎明大概率会触发巡查，本轮更适合降温。',
    };
  }

  if (
    phase === 'night' &&
    expansionInfo?.reachable &&
    scraps >= 0
  ) {
    return {
      title: `夜间窗口已开`,
      detail: `${selectedNodeName} 可以尝试进攻，但要先确认失败率是否值得承受。`,
    };
  }

  if (phase === 'day') {
    return {
      title: '先在白天做准备',
      detail: '白天优先刷信任、情报和安全边际，别急着硬冲。',
    };
  }

  return {
    title: '网络暂时稳定',
    detail: '可以为下一次扩张或月台建设继续蓄势。',
  };
};

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState(),
  );
  const [dawnToastCycle, setDawnToastCycle] = useState<number | null>(null);
  const [compactJobs, setCompactJobs] = useState(true);
  const [compactRightRail, setCompactRightRail] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);

  const selectedNode = getNodeById(state.selectedNodeId);
  const selectedStatus = getNodeStatus(state, selectedNode.id);
  const selectedYield = getNodeDisplayYield(state, selectedNode.id);
  const selectedHeat = selectedStatus.heat;
  const selectedVulnerability = getNodeVulnerabilityScore(state, selectedNode.id);
  const attentionBand = getAttentionBand(state.attention);
  const previewDawn = getPreviewDawn(state);
  const incomePerSecond = getPerSecondSummary(state);
  const connectedNodeIds = getConnectedNodeIds(state.controlledNodeIds);
  const idleCats = state.totalCats - sumAssignments(state.assignments);
  const expansionInfo = getExpansionInfo(state, selectedNode.id);
  const availableBuildings = getAvailableBuildings(state, selectedNode.id);
  const phaseInfo = phaseCopy[state.phase];
  const connectedCount = connectedNodeIds.length;
  const hottestNodeId = getHottestNodeId(state);
  const hottestNodeName = hottestNodeId ? getNodeById(hottestNodeId).name : '无';
  const hottestNodeHeat = hottestNodeId ? Math.round(state.nodeHeatById[hottestNodeId] ?? 0) : 0;
  const vulnerableNodeId = getMostVulnerableNodeId(state);
  const vulnerableNodeName = vulnerableNodeId ? getNodeById(vulnerableNodeId).name : '无';
  const vulnerableScore = vulnerableNodeId ? getNodeVulnerabilityScore(state, vulnerableNodeId) : 0;
  const frontlineSummary = getFrontlineSummary(state);
  const metaUpgradePanel = getMetaUpgradePanel(state);
  const mapTierPanel = getMapTierPanel(state);
  const eraPanel = getEraPanel(state);
  const availableJobs = getAvailableJobs(state);
  const currentThreshold = attentionThresholds.find(
    (threshold) => state.attention <= threshold.max,
  );
  const decisionHint = getDecisionHint({
    attention: state.attention,
    phase: state.phase,
    scraps: state.resources.scraps,
    previewDawn,
    expansionInfo,
    selectedNodeName: selectedNode.name,
  });
  const tickerEntries =
    state.logs.length > 0
      ? state.logs.slice(0, 6).map((log) => ({
          id: log.id,
          tone: log.tone,
          text: `${log.title} · ${compactText(log.detail, 44)}`,
        }))
      : [
          {
            id: 'quiet-city',
            tone: 'neutral',
            text: '城巷暂时平静，继续为下一次夜行蓄势。',
          },
        ];
  const dawnToastVisible =
    dawnToastCycle === state.cycleCount &&
    state.cycleCount > 0 &&
    state.lastDawnReport !== null;

  const runTick = useEffectEvent(() => {
    dispatch({ type: 'tick' });
  });

  useEffect(() => {
    if (state.paused) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      runTick();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [state.paused]);

  useEffect(() => {
    if (!state.lastDawnReport || state.cycleCount === 0) {
      return undefined;
    }

    setDawnToastCycle(state.cycleCount);

    const timer = window.setTimeout(() => {
      setDawnToastCycle((current) =>
        current === state.cycleCount ? null : current,
      );
    }, 3600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state.cycleCount, state.lastDawnReport]);

  return (
    <div className={`app-shell phase-${state.phase}`}>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">策略型增量原型</p>
          <h1>九命城邦</h1>
          <p className="headline">
            在人类城市的盲区里，用白天潜伏与夜晚扩张，把一群流浪猫养成一座必须持续连通的隐秘城邦。
          </p>
        </div>

        <div className="topbar-meta">
          <div className="phase-card">
            <span className="phase-chip">{phaseInfo.title}</span>
            <strong>{formatTimer(state.phaseSecondsRemaining)}</strong>
            <p>{phaseInfo.subtitle}</p>
            <div className="phase-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setManualOpen(true)}
              >
                功能说明
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => dispatch({ type: 'togglePause' })}
              >
                {state.paused ? '继续时钟' : '暂停时钟'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => dispatch({ type: 'advancePhase' })}
              >
                快进阶段
              </button>
            </div>
          </div>

          <div className="status-card">
            <div className="status-row">
              <span>命轮</span>
              <strong>第 {state.lives} 命</strong>
            </div>
            <div className="status-row">
              <span>已存传说</span>
              <strong>{state.archiveLegend}</strong>
            </div>
            <div className="status-row">
              <span>最近命途</span>
              <strong>{state.instinct ? instincts.find((item) => item.id === state.instinct)?.name : '未觉醒'}</strong>
            </div>
            <div className="status-row">
              <span>永久命途</span>
              <strong>{state.unlockedInstincts.length} / {instincts.length}</strong>
            </div>
            <div className="status-row">
              <span>当前地图</span>
              <strong>{state.currentMapTier} 级</strong>
            </div>
            <div className="status-row">
              <span>文明时代</span>
              <strong>
                {eraPanel.era === 'survival'
                  ? '求生时代'
                  : eraPanel.era === 'technology'
                    ? '科技时代'
                    : eraPanel.era === 'theology'
                      ? '神学时代'
                      : '飞升时代'}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <section className="resource-strip">
        {resourceOrder.map((resourceKey) => (
          <article key={resourceKey} className="resource-card">
            <div>
              <span className="resource-label">{resourceLabels[resourceKey]}</span>
              <strong>{formatNumber(state.resources[resourceKey])}</strong>
            </div>
            <span className="resource-delta">
              {incomePerSecond[resourceKey] > 0.01
                ? `+${formatNumber(incomePerSecond[resourceKey])}/秒`
                : '稳定'}
            </span>
          </article>
        ))}
      </section>

      <section className="attention-panel">
        <div className="attention-copy">
          <span className={`attention-tag tone-${attentionBand.tone}`}>
            注意度 {currentThreshold?.label}
          </span>
          <strong>{formatNumber(state.attention)} / 100</strong>
          <p>{attentionBand.hint}</p>
        </div>
        <div className="attention-meter" aria-hidden="true">
          <span style={{ width: `${state.attention}%` }} />
        </div>
      </section>

      <section className="feedback-ribbon">
        <div className="ticker-shell" aria-label="城市播报">
          <span className="mini-label">实时弹幕</span>
          <div className="ticker-viewport">
            <div className="ticker-track">
              <div className="ticker-row">
                <span className="ticker-item tone-neutral">
                  当前判断 · {decisionHint.title} · {compactText(decisionHint.detail, 42)}
                </span>
                {tickerEntries.map((entry) => (
                  <span
                    key={entry.id}
                    className={`ticker-item tone-${entry.tone}`}
                  >
                    {entry.text}
                  </span>
                ))}
              </div>
              <div className="ticker-row" aria-hidden="true">
                <span className="ticker-item tone-neutral">
                  当前判断 · {decisionHint.title} · {compactText(decisionHint.detail, 42)}
                </span>
                {tickerEntries.map((entry) => (
                  <span
                    key={`${entry.id}-clone`}
                    className={`ticker-item tone-${entry.tone}`}
                  >
                    {entry.text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="layout">
        <aside className="panel left-rail">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">猫口分工</p>
                <h2>{state.totalCats} / {state.catCap} 只猫在岗</h2>
              </div>
              <div className="heading-actions">
                <span className="soft-chip">闲置 {idleCats}</span>
                <button
                  type="button"
                  className="ghost-button ghost-button-compact"
                  onClick={() => setCompactJobs((current) => !current)}
                >
                  {compactJobs ? '展开说明' : '收起说明'}
                </button>
              </div>
            </div>

            <div className={`job-list ${compactJobs ? 'compact' : ''}`}>
              {availableJobs.map((job) => (
                <article key={job.id} className="job-card">
                  <div className="job-copy">
                    <div className="job-title">
                      <span className="job-short">{job.shortName}</span>
                      <div>
                        <strong>{job.name}</strong>
                        <p>{job.description}</p>
                      </div>
                    </div>
                    <small>
                      {compactJobs ? (
                        <>
                          日 +{formatNumber(summarizeYield(job.dayYield))}
                          /夜 +{formatNumber(summarizeYield(job.nightYield))}
                        </>
                      ) : (
                        <>
                          白天 {describeYield(job.dayYield)}<br />
                          夜晚 {describeYield(job.nightYield)}
                        </>
                      )}
                    </small>
                  </div>
                  <div className="stepper">
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'assignCat', jobId: job.id, delta: -1 })
                      }
                    >
                      -
                    </button>
                    <strong>{state.assignments[job.id]}</strong>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'assignCat', jobId: job.id, delta: 1 })
                      }
                    >
                      +
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">当前目标</p>
                <h2>首轮换命闭环</h2>
              </div>
            </div>

            <div className="goal-list">
              <div className={`goal-item ${connectedCount >= 4 ? 'done' : ''}`}>
                <span>{connectedCount >= 4 ? '已达成' : '进行中'}</span>
                <p>控制至少 4 个连通节点</p>
              </div>
              <div
                className={`goal-item ${
                  state.buildingsByNode.subway?.includes('moonPlatform') ? 'done' : ''
                }`}
              >
                <span>
                  {state.buildingsByNode.subway?.includes('moonPlatform')
                    ? '已达成'
                    : '待建造'}
                </span>
                <p>在地铁废口建成月台</p>
              </div>
              <div
                className={`goal-item ${
                  state.lastDawnReport?.stable || state.rebirthReady ? 'done' : ''
                }`}
              >
                <span>
                  {state.lastDawnReport?.stable || state.rebirthReady ? '已达成' : '待结算'}
                </span>
                <p>完成一次稳定黎明结算</p>
              </div>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">局外成长</p>
                <h2>传说用途</h2>
              </div>
              <span className="soft-chip">可用传说 {state.archiveLegend}</span>
            </div>

            <div className="building-list">
              {metaUpgradePanel.map((upgrade) => (
                <article key={upgrade.id} className="building-card">
                  <div>
                    <strong>{upgrade.name}</strong>
                    <small>
                      等级 {upgrade.level}/{upgrade.maxLevel}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={upgrade.cost === null || state.archiveLegend < (upgrade.cost ?? 0)}
                    onClick={() => dispatch({ type: 'buyMetaUpgrade', upgradeId: upgrade.id })}
                  >
                    {upgrade.cost === null ? '已满级' : `升级 -${upgrade.cost}`}
                  </button>
                </article>
              ))}
            </div>

            <div className="chip-row">
              {mapTierPanel.map((tier) => (
                <button
                  key={tier.tier}
                  type="button"
                  className="ghost-button ghost-button-compact"
                  disabled={!tier.unlocked && state.archiveLegend < tier.unlockCost}
                  onClick={() => dispatch({ type: 'setMapTier', tier: tier.tier })}
                >
                  {tier.active
                    ? `${tier.tier}级地图（当前）`
                    : tier.unlocked
                      ? `切换到${tier.tier}级`
                      : `解锁${tier.tier}级 -${tier.unlockCost}`}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">文明主线</p>
                <h2>时代推进</h2>
              </div>
              <span className="soft-chip">
                {eraPanel.era === 'survival'
                  ? '求生'
                  : eraPanel.era === 'technology'
                    ? '科技'
                    : eraPanel.era === 'theology'
                      ? '神学'
                      : '飞升'}
              </span>
            </div>

            {eraPanel.era === 'survival' ? (
              <p className="empty-copy">
                科技时代尚未开启。继续轮回强化并积累传说，达到科技门槛后会显示时代项目。
              </p>
            ) : (
              <div className="building-list">
                {eraPanel.projects.map((project) => (
                  <article key={project.id} className="building-card">
                    <div>
                      <strong>{project.name}</strong>
                      <small>
                        Lv.{project.level}/{project.maxLevel}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        project.lockedByEra ||
                        project.cost === null ||
                        state.archiveLegend < (project.cost ?? 0)
                      }
                      onClick={() => dispatch({ type: 'buyEraProject', projectId: project.id })}
                    >
                      {project.lockedByEra
                        ? '时代未解锁'
                        : project.cost === null
                          ? '已满级'
                          : `升级 -${project.cost}`}
                    </button>
                  </article>
                ))}
              </div>
            )}

            <button
              type="button"
              className="primary-button"
              disabled={!eraPanel.canAscend}
              onClick={() => dispatch({ type: 'ascend' })}
            >
              {state.ascended ? '已完成猫教飞升' : '启动猫教飞升仪式'}
            </button>
          </section>
        </aside>

        <section className="panel map-panel">
          <div className="section-heading">
            <div>
              <p className="mini-label">城市节点图</p>
              <h2>气味网络与扩张路线</h2>
            </div>
            <span className="soft-chip">
              连通 {connectedCount} / 已控 {state.controlledNodeIds.length}
            </span>
          </div>

          <div className="city-map">
            <svg className="map-links" viewBox="0 0 100 100" preserveAspectRatio="none">
              {edges.map(([fromId, toId]) => {
                const fromNode = getNodeById(fromId);
                const toNode = getNodeById(toId);
                const fromStatus = getNodeStatus(state, fromId);
                const toStatus = getNodeStatus(state, toId);

                const lineClass = [
                  'map-line',
                  fromStatus.controlled && toStatus.controlled ? 'owned' : '',
                  fromStatus.connected && toStatus.connected ? 'connected' : '',
                  !fromStatus.controlled || !toStatus.controlled ? 'open' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <line
                    key={`${fromId}-${toId}`}
                    className={lineClass}
                    x1={fromNode.position.x}
                    y1={fromNode.position.y}
                    x2={toNode.position.x}
                    y2={toNode.position.y}
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const nodeStatus = getNodeStatus(state, node.id);
              const selected = node.id === selectedNode.id;

              return (
                <button
                  key={node.id}
                  type="button"
                  className={[
                    'map-node',
                    nodeStatus.controlled ? 'controlled' : 'wild',
                    nodeStatus.connected ? 'connected' : '',
                    nodeStatus.floating ? 'floating' : '',
                    nodeStatus.heat >= 70 ? 'hotspot' : '',
                    nodeStatus.heat >= 40 && nodeStatus.heat < 70 ? 'warming' : '',
                    selected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${node.position.x}%`,
                    top: `${node.position.y}%`,
                  }}
                  onClick={() => dispatch({ type: 'selectNode', nodeId: node.id })}
                >
                  <span className="map-node-name">{node.name}</span>
                  <span className="map-node-risk">风险 {node.risk}/3 · 热度 {Math.round(nodeStatus.heat)}</span>
                </button>
              );
            })}
          </div>

          <div className="map-legend">
            <span className="legend-item">
              <i className="legend-dot connected" />
              连通节点
            </span>
            <span className="legend-item">
              <i className="legend-dot isolated" />
              已控但游离
            </span>
            <span className="legend-item">
              <i className="legend-dot wild" />
              未占领
            </span>
            <span className="legend-item">
              <i className="legend-dot hotspot" />
              局部热点
            </span>
          </div>

          <div className="selected-panel">
            <div className="selected-copy">
              <div className="selected-header">
                <div>
                  <p className="mini-label">节点详情</p>
                  <h2>{selectedNode.name}</h2>
                </div>
                <div className="selected-tags">
                  {selectedNode.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <p className="selected-summary">{selectedNode.summary}</p>

              <div className="selected-metrics">
                <div>
                  <span>当前状态</span>
                  <strong>
                    {selectedStatus.controlled
                      ? selectedStatus.connected
                        ? '已连通'
                        : '游离态'
                      : '未占领'}
                  </strong>
                </div>
                <div>
                  <span>本阶段产出</span>
                  <strong>{describeYield(selectedYield)}</strong>
                </div>
                <div>
                  <span>局部热点</span>
                  <strong>{getNodeHeatLabel(selectedHeat)} · {Math.round(selectedHeat)} / 100</strong>
                </div>
                <div>
                  <span>网络脆弱度</span>
                  <strong>{selectedVulnerability} / 100</strong>
                </div>
                <div>
                  <span>已建建筑</span>
                  <strong>
                    {state.buildingsByNode[selectedNode.id]?.length
                      ? state.buildingsByNode[selectedNode.id]
                          .map((buildingId) => buildings.find((item) => item.id === buildingId)?.name)
                          .join('、')
                      : '暂无'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="selected-actions">
              {!selectedStatus.controlled && expansionInfo && (
                <article className="action-card">
                  <div>
                    <p className="mini-label">占领动作</p>
                    <strong>
                      {expansionInfo.reachable
                        ? `气味 ${expansionInfo.scentCost} · 失败率约 ${Math.round(
                            expansionInfo.failureChance * 100,
                          )}%`
                        : '当前无法直连，先拿下中继节点'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      !expansionInfo.reachable ||
                      state.resources.scent < expansionInfo.scentCost
                    }
                    onClick={() =>
                      dispatch({ type: 'expandNode', nodeId: selectedNode.id })
                    }
                  >
                    占领 {selectedNode.name}
                  </button>
                </article>
              )}

              {selectedStatus.controlled && (
                <article className="action-card">
                  <div>
                    <p className="mini-label">节点判断</p>
                    <strong>
                      {selectedStatus.floating
                        ? '当前没有连回主巢，产出衰减且风险上升。'
                        : '当前被纳入主巢网络，能稳定供给城邦。'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => dispatch({ type: 'selectNode', nodeId: selectedNode.id })}
                  >
                    保持关注
                  </button>
                </article>
              )}
            </div>
          </div>
        </section>

        <aside className={`panel right-rail ${compactRightRail ? 'compact' : ''}`}>
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">建筑面板</p>
                <h2>对 {selectedNode.name} 的操作</h2>
              </div>
              <button
                type="button"
                className="ghost-button ghost-button-compact"
                onClick={() => setCompactRightRail((current) => !current)}
              >
                {compactRightRail ? '展开右栏' : '精简右栏'}
              </button>
            </div>

            {selectedStatus.controlled ? (
              <div className="building-list">
                {availableBuildings.length > 0 ? (
                  availableBuildings.map((building) => (
                    <article key={building.id} className="building-card">
                      <div>
                        <strong>{building.name}</strong>
                        <p>{building.description}</p>
                        <small>
                          {resourceOrder
                            .filter((key) => (building.cost[key] ?? 0) > 0)
                            .map((key) => `${resourceLabels[key]} ${building.cost[key]}`)
                            .join(' · ')}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!canAfford(state.resources, building.cost)}
                        onClick={() =>
                          dispatch({
                            type: 'build',
                            nodeId: selectedNode.id,
                            buildingId: building.id,
                          })
                        }
                      >
                        建造
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">这个节点当前没有可建的新建筑。</p>
                )}
              </div>
            ) : (
              <p className="empty-copy">先占领节点，建筑选项才会出现。</p>
            )}
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">风险与网络</p>
                <h2>当前局势摘要</h2>
              </div>
            </div>

            <div className="network-card">
              <div className="status-row">
                <span>连通节点</span>
                <strong>{connectedNodeIds.map((nodeId) => getNodeById(nodeId).name).join('、')}</strong>
              </div>
              <div className="status-row">
                <span>游离节点</span>
                <strong>
                  {previewDawn.floatingNodes.length > 0
                    ? previewDawn.floatingNodes
                        .map((nodeId) => getNodeById(nodeId).name)
                        .join('、')
                    : '无'}
                </strong>
              </div>
              <div className="status-row">
                <span>注意度效果</span>
                <strong>{attentionBand.hint}</strong>
              </div>
              <div className="status-row">
                <span>局部热点</span>
                <strong>{hottestNodeName} · 热度 {hottestNodeHeat}</strong>
              </div>
              <div className="status-row">
                <span>最脆弱节点</span>
                <strong>{vulnerableNodeName} · 脆弱度 {vulnerableScore}</strong>
              </div>
              <div className="status-row">
                <span>当前前线</span>
                <strong>{frontlineSummary.entries[0].label} · 压力 {frontlineSummary.entries[0].value}</strong>
              </div>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">外部势力前线</p>
                <h2>城市反制压力</h2>
              </div>
            </div>
            <div className="network-card">
              {frontlineSummary.entries.map((entry) => (
                <div key={entry.key} className="status-row">
                  <span>{entry.label}</span>
                  <strong>{entry.value} / 100</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">结算预估</p>
                <h2>下一次黎明会发生什么</h2>
              </div>
            </div>

            <div className="forecast-grid">
              <article className="forecast-card">
                <span>猫口消耗</span>
                <strong>{previewDawn.foodCost} 残羹</strong>
              </article>
              <article className="forecast-card">
                <span>连通维护</span>
                <strong>{previewDawn.maintenanceCost} 气味</strong>
              </article>
              <article className="forecast-card">
                <span>游离节点</span>
                <strong>{previewDawn.floatingNodes.length}</strong>
              </article>
              <article className="forecast-card">
                <span>巡查概率</span>
                <strong>{Math.round(previewDawn.patrolChance * 100)}%</strong>
              </article>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">换命系统</p>
                <h2>{state.rebirthReady ? '可觉醒永久命途' : '尚未解锁'}</h2>
              </div>
            </div>

            <div className="chip-row">
              <span className="soft-chip">
                已觉醒 {state.unlockedInstincts.length} / {instincts.length}
              </span>
            </div>

            {state.rebirthReady ? (
              <div className="instinct-grid">
                {instincts.map((instinct) => (
                  <article
                    key={instinct.id}
                    className={`instinct-card ready ${
                      state.unlockedInstincts.includes(instinct.id) ? 'active' : ''
                    }`}
                  >
                    <strong>{instinct.name}</strong>
                    <p>{instinct.description}</p>
                    <ul>
                      {instinct.modifiers.map((modifier) => (
                        <li key={modifier}>{modifier}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={state.unlockedInstincts.includes(instinct.id)}
                      onClick={() =>
                        dispatch({ type: 'rebirth', instinct: instinct.id })
                      }
                    >
                      {state.unlockedInstincts.includes(instinct.id)
                        ? '已永久觉醒'
                        : '永久觉醒该命途'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="instinct-grid">
                {instincts.map((instinct) => (
                  <article
                    key={instinct.id}
                    className={`instinct-card ${
                      state.unlockedInstincts.includes(instinct.id) ? 'active' : ''
                    }`}
                  >
                    <strong>{instinct.name}</strong>
                    <p>{instinct.description}</p>
                    <ul>
                      {instinct.modifiers.map((modifier) => (
                        <li key={modifier}>{modifier}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>

      {dawnToastVisible && state.lastDawnReport ? (
        <aside
          className={`dawn-toast ${
            state.lastDawnReport.stable ? 'stable' : 'unstable'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="mini-label">黎明结算</span>
          <strong>
            {state.lastDawnReport.stable ? '网络平稳收束' : '城邦承受了反制'}
          </strong>
          <p>
            残羹 -{state.lastDawnReport.foodCost} · 气味 -
            {state.lastDawnReport.maintenanceCost}
            {state.lastDawnReport.lostNodes.length > 0
              ? ` · 失守 ${state.lastDawnReport.lostNodes.length} 处`
              : ''}
            {state.lastDawnReport.recruitedCat ? ' · 新猫加入' : ''}
          </p>
          <small>
            {state.lastDawnReport.notes[0] ??
              '黎明平静过去，没有发生额外事故。'}
          </small>
        </aside>
      ) : null}

      {manualOpen ? (
        <aside className="manual-modal" role="dialog" aria-modal="true">
          <div className="manual-card">
            <div className="section-heading">
              <div>
                <p className="mini-label">帮助</p>
                <h2>功能说明</h2>
              </div>
              <button
                type="button"
                className="ghost-button ghost-button-compact"
                onClick={() => setManualOpen(false)}
              >
                关闭
              </button>
            </div>
            <pre className="manual-content">{manualText}</pre>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

export default App;
