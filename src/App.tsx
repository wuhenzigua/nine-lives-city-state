import { useEffect, useEffectEvent, useReducer } from 'react';
import './App.css';
import {
  buildings,
  instincts,
  jobs,
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
  getNodeDisplayYield,
  getNodeStatus,
  getPerSecondSummary,
  getPreviewDawn,
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

const canAfford = (resources: ResourceMap, cost: Partial<ResourceMap>) =>
  resourceOrder.every((key) => resources[key] >= (cost[key] ?? 0));

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState(),
  );

  const selectedNode = getNodeById(state.selectedNodeId);
  const selectedStatus = getNodeStatus(state, selectedNode.id);
  const selectedYield = getNodeDisplayYield(state, selectedNode.id);
  const attentionBand = getAttentionBand(state.attention);
  const previewDawn = getPreviewDawn(state);
  const incomePerSecond = getPerSecondSummary(state);
  const connectedNodeIds = getConnectedNodeIds(state.controlledNodeIds);
  const idleCats = state.totalCats - sumAssignments(state.assignments);
  const expansionInfo = getExpansionInfo(state, selectedNode.id);
  const availableBuildings = getAvailableBuildings(state, selectedNode.id);
  const phaseInfo = phaseCopy[state.phase];
  const connectedCount = connectedNodeIds.length;
  const currentThreshold = attentionThresholds.find(
    (threshold) => state.attention <= threshold.max,
  );

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
              <span>当前本能</span>
              <strong>{state.instinct ? instincts.find((item) => item.id === state.instinct)?.name : '未继承'}</strong>
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

      <main className="layout">
        <aside className="panel left-rail">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">猫口分工</p>
                <h2>{state.totalCats} / {state.catCap} 只猫在岗</h2>
              </div>
              <span className="soft-chip">闲置 {idleCats}</span>
            </div>

            <div className="job-list">
              {jobs.map((job) => (
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
                      白天 {describeYield(job.dayYield)}<br />
                      夜晚 {describeYield(job.nightYield)}
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
                  <span className="map-node-risk">风险 {node.risk}/3</span>
                </button>
              );
            })}
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

        <aside className="panel right-rail">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">建筑面板</p>
                <h2>对 {selectedNode.name} 的操作</h2>
              </div>
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
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="mini-label">换命系统</p>
                <h2>{state.rebirthReady ? '可以换命' : '尚未解锁'}</h2>
              </div>
            </div>

            {state.rebirthReady ? (
              <div className="instinct-grid">
                {instincts.map((instinct) => (
                  <article key={instinct.id} className="instinct-card ready">
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
                      onClick={() =>
                        dispatch({ type: 'rebirth', instinct: instinct.id })
                      }
                    >
                      继承这一本能
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
                      state.instinct === instinct.id ? 'active' : ''
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

      <section className="bottom-grid">
        <article className="panel panel-section">
          <div className="section-heading">
            <div>
              <p className="mini-label">行动日志</p>
              <h2>最近发生了什么</h2>
            </div>
          </div>

          <div className="log-list">
            {state.logs.map((log) => (
              <article key={log.id} className={`log-item tone-${log.tone}`}>
                <div>
                  <strong>{log.title}</strong>
                  <p>{log.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel panel-section">
          <div className="section-heading">
            <div>
              <p className="mini-label">最近一次黎明</p>
              <h2>结算回顾</h2>
            </div>
          </div>

          {state.lastDawnReport ? (
            <div className="dawn-panel">
              <div className="forecast-grid">
                <article className="forecast-card">
                  <span>残羹消耗</span>
                  <strong>{state.lastDawnReport.foodCost}</strong>
                </article>
                <article className="forecast-card">
                  <span>气味维护</span>
                  <strong>{state.lastDawnReport.maintenanceCost}</strong>
                </article>
                <article className="forecast-card">
                  <span>丢失节点</span>
                  <strong>{state.lastDawnReport.lostNodes.length}</strong>
                </article>
                <article className="forecast-card">
                  <span>是否稳定</span>
                  <strong>{state.lastDawnReport.stable ? '稳定' : '失衡'}</strong>
                </article>
              </div>

              <div className="note-list">
                {state.lastDawnReport.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-copy">
              第一轮黎明还没到来。白天分配好猫口，夜晚再尝试扩张。
            </p>
          )}
        </article>
      </section>
    </div>
  );
}

export default App;
