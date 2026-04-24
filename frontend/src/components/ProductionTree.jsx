import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { getBuildTree, searchTypes, searchSystems, getJobSlots, getBpContracts, getInventoryContexts, getInventoryLocations } from '../services/api';
import ExternalLinks from './ExternalLinks';
import ExportButton from './ExportButton';
import BpcPriceTrendChart from './BpcPriceTrendChart';
import { copyToClipboard } from '../services/export';
import './ProductionTree.css';

function formatISK(value) {
  if (!value && value !== 0) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatTime(seconds) {
  if (!seconds) return '—';
  const hours = seconds / 3600;
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.ceil(seconds / 60)}m`;
}

// Force all buildable nodes to BUILD (deep clone + override)
function applyBuildAll(node) {
  const n = { ...node };
  if (n.is_buildable && n.build_cost !== null) {
    n.decision = 'build';
  }
  if (n.children?.length > 0) {
    n.children = n.children.map(c => applyBuildAll(c));
    // Recalculate build_cost from children
    const childCost = n.children.reduce((sum, c) => sum + (c.decision === 'build' && c.build_cost !== null ? c.build_cost : c.buy_cost), 0);
    if (n.is_buildable) n.build_cost = childCost + (n.job_cost || 0);
  }
  return n;
}

// Flatten tree to shopping list (BUY leaf nodes aggregated). Stock-check
// fields (have / missing) are carried from the first tree node we see for
// each type — the backend annotates them based on the stock_by_type_id
// map which is keyed by type, so the value is the same across duplicates.
function flattenShopping(node, list = {}) {
  if (node.decision === 'buy' || !node.children?.length) {
    if (!list[node.type_id]) {
      list[node.type_id] = {
        type_id: node.type_id,
        name: node.name,
        quantity: 0,
        unit_price: node.unit_price,
        volume: node.volume,
        have: node.have,
      };
    }
    list[node.type_id].quantity += node.quantity;
  } else {
    for (const child of node.children) flattenShopping(child, list);
  }
  return list;
}

// Recalculate summary from effective tree
function recalcSummary(tree, originalSummary, shippingConfig) {
  const shopMap = flattenShopping(tree);
  const shopList = Object.values(shopMap).map(item => ({
    ...item,
    // Stock-check missing is quantity − have, floor zero. `have` is
    // undefined when stock-check mode is off — keep it undefined so the
    // UI knows there's no data to render the filter against.
    missing: item.have !== undefined ? Math.max(0, item.quantity - (item.have || 0)) : undefined,
    total_cost: item.unit_price * item.quantity,
    total_volume: item.volume * item.quantity,
  })).sort((a, b) => b.total_cost - a.total_cost);

  // Summary-level cost + shipping use the MISSING quantity when stock-check
  // is on: you don't buy or ship materials you already have at the
  // build location.
  const stockActive = shopList.some(i => i.have !== undefined);
  const effQty = (i) => stockActive && i.have !== undefined
    ? Math.max(0, i.quantity - (i.have || 0))
    : i.quantity;
  const materialCost = shopList.reduce((s, i) => s + (i.unit_price || 0) * effQty(i), 0);
  const totalVolume = shopList.reduce((s, i) => s + (i.volume || 0) * effQty(i), 0);
  const { shippingMinFee, shippingPerM3, collateralPct, maxVolume } = shippingConfig;
  const contracts = Math.ceil(totalVolume / maxVolume) || 1;
  // Zero volume to ship → zero shipping cost (no 25M floor).
  const shippingCost = totalVolume > 0
    ? Math.max(shippingMinFee * contracts, totalVolume * shippingPerM3)
    : 0;
  const collateralCost = materialCost * collateralPct / 100;

  // Count jobs + job costs from tree
  let totalJobs = 0, totalJobCost = 0;
  function countJobs(n) {
    if (n.decision === 'build' && n.is_buildable && n.children?.length > 0) {
      totalJobs++; totalJobCost += n.job_cost || 0;
      for (const c of n.children) countJobs(c);
    }
  }
  countJobs(tree);

  const totalBuildCost = materialCost + totalJobCost + shippingCost + collateralCost;
  const buyFinishedCost = originalSummary.buy_finished_cost;

  // Recalculate import shipping from original summary values (they don't change with build/buy toggles)
  const importShipping = originalSummary.import_shipping || 0;
  const importCollateral = originalSummary.import_collateral || 0;
  const importTotalCost = buyFinishedCost + importShipping + importCollateral;

  return {
    summary: {
      ...originalSummary,
      material_cost: materialCost,
      job_cost: totalJobCost,
      shipping_cost: shippingCost,
      collateral_cost: collateralCost,
      total_build_cost: totalBuildCost,
      import_shipping: importShipping,
      import_collateral: importCollateral,
      import_total_cost: importTotalCost,
      total_volume_m3: totalVolume,
      shipping_contracts: contracts,
      total_jobs: totalJobs,
      savings: importTotalCost - totalBuildCost,
      recommendation: buyFinishedCost === 0 ? 'BUILD' : importTotalCost > totalBuildCost ? 'BUILD' : 'IMPORT',
    },
    shopping_list: shopList,
  };
}

// Classify job into Ravworks-style categories
function classifyJob(job) {
  const n = job.name;
  if (job.depth === 0) return 'End Product';
  if (n.startsWith('Capital ')) return 'Capital Components';
  if (job.category === 'reaction') {
    // Hybrid polymers (fullerene-based)
    if (/Fullerene|Fullero|Graphene|C3-FTM|Carbon-86|Nano/.test(n)) return 'Hybrid Reactions';
    // Biochem / molecular-forged
    if (/Neurolink|Isotropic Neo/.test(n)) return 'Biochem Reactions';
    // Composites (final reaction stage feeding into manufacturing)
    if (/Reinforced|Pressurized|Fermionic|Photonic|Crystallite|Hafnite|Fluxed|Prometium|Caesarium|Dysporite/.test(n))
      return 'Composite Reactions';
    // Everything else (Carbon Fiber, Sulfuric Acid, etc.)
    return 'Intermediate Reactions';
  }
  // All non-capital manufacturing = Advanced Components (matches Ravworks grouping)
  return 'Advanced Components';
}

// Extract all BUILD nodes from tree as flat job list
function extractBuildJobs(node, jobs = []) {
  if (node.decision === 'build' && node.is_buildable && node.children?.length > 0) {
    const job = {
      type_id: node.type_id,
      name: node.name,
      category: node.category,
      activity_id: node.activity_id,
      runs_needed: node.runs_needed || 1,
      batch_size: node.batch_size || 1,
      job_time: node.job_time || 0,
      job_cost: node.job_cost || 0,
      quantity: node.quantity,
      depth: node.depth,
    };
    job.group = classifyJob(job);
    jobs.push(job);
    for (const child of node.children) {
      extractBuildJobs(child, jobs);
    }
  }
  return jobs;
}

// Consolidate duplicate jobs: merge same type_id + category into one job with summed runs
function consolidateJobs(jobs) {
  const map = new Map();
  for (const job of jobs) {
    const key = `${job.type_id}_${job.category}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing.runs_needed += job.runs_needed;
      existing.quantity += job.quantity;
      existing.job_cost += job.job_cost;
    } else {
      map.set(key, { ...job });
    }
  }
  return Array.from(map.values());
}

// Schedule jobs: consolidate duplicates, then split any that exceed max day limit
function scheduleJobs(tree, mfgSlots, reactionSlots, maxJobSeconds) {
  if (!tree) return null;

  const allJobs = extractBuildJobs(tree);
  const mfgJobs = consolidateJobs(allJobs.filter(j => j.category === 'manufacturing'));
  const rxnJobs = consolidateJobs(allJobs.filter(j => j.category === 'reaction'));

  function splitAndSchedule(jobs, totalSlots) {
    const scheduled = [];
    for (const job of jobs) {
      const timePerRun = job.job_time;
      const totalTime = timePerRun * job.runs_needed;

      // If total time fits within max limit or only 1 run, no split needed
      if (totalTime <= maxJobSeconds || job.runs_needed <= 1) {
        scheduled.push({ ...job, total_time: totalTime, split_into: 1, parallel_time: totalTime, time_per_run: timePerRun });
      } else {
        // How many runs fit in the max time window?
        const runsPerChunk = Math.max(1, Math.floor(maxJobSeconds / timePerRun));
        const numChunks = Math.ceil(job.runs_needed / runsPerChunk);
        let runsLeft = job.runs_needed;

        for (let i = 0; i < numChunks; i++) {
          const chunkRuns = Math.min(runsPerChunk, runsLeft);
          const chunkTime = chunkRuns * timePerRun;
          const chunkCost = job.runs_needed > 0 ? job.job_cost * (chunkRuns / job.runs_needed) : 0;
          scheduled.push({
            ...job,
            runs_needed: chunkRuns,
            total_time: chunkTime,
            split_into: numChunks,
            parallel_time: chunkTime,
            time_per_run: timePerRun,
            job_cost: chunkCost,
          });
          runsLeft -= chunkRuns;
        }
      }
    }

    const totalSequential = scheduled.reduce((s, j) => s + j.total_time, 0);
    const totalParallel = scheduled.reduce((s, j) => s + j.parallel_time, 0);
    const bottleneck = scheduled.length > 0
      ? scheduled.reduce((a, b) => a.parallel_time > b.parallel_time ? a : b)
      : null;

    return { jobs: scheduled, totalSequential, totalParallel, slots: totalSlots, bottleneck };
  }

  const mfg = splitAndSchedule(mfgJobs, mfgSlots);
  const rxn = splitAndSchedule(rxnJobs, reactionSlots);

  // Wall-clock: reactions must finish before manufacturing that uses their outputs
  const wallClock = rxn.totalParallel + mfg.totalParallel;

  // Group all scheduled jobs by category
  const allScheduled = [...rxn.jobs, ...mfg.jobs];
  const groupOrder = [
    'Intermediate Reactions', 'Composite Reactions', 'Biochem Reactions', 'Hybrid Reactions',
    'Advanced Components', 'Capital Components', 'End Product',
  ];
  const grouped = {};
  for (const job of allScheduled) {
    const g = job.group || 'Other';
    if (!grouped[g]) grouped[g] = { name: g, jobs: [], longest: 0 };
    grouped[g].jobs.push(job);
    if (job.parallel_time > grouped[g].longest) grouped[g].longest = job.parallel_time;
  }
  const categories = groupOrder.filter(g => grouped[g]).map(g => grouped[g]);
  // Add any uncategorized
  for (const g of Object.keys(grouped)) {
    if (!groupOrder.includes(g)) categories.push(grouped[g]);
  }

  return { manufacturing: mfg, reactions: rxn, wallClock, totalJobs: allScheduled.length, categories };
}

// Recursive tree node component
function TreeNode({ node, depth, expanded, onToggleExpand, onToggleDecision, stockActive }) {
  const isExpanded = expanded[node.type_id + '_' + depth] !== false; // default expanded for depth 0-1
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;
  const cost = node.decision === 'build' && node.build_cost !== null ? node.build_cost : node.buy_cost;
  const savings = node.build_cost !== null && node.buy_cost > 0 ? node.buy_cost - node.build_cost : 0;

  return (
    <>
      <div className={`tree-node depth-${Math.min(depth, 4)}`} style={{ paddingLeft: indent + 8 }}>
        {/* Expand/collapse */}
        <span className="tree-expand" onClick={() => hasChildren && onToggleExpand(node.type_id + '_' + depth)}>
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </span>

        {/* Icon + Name + links */}
        <img className="tree-icon" src={`https://images.evetech.net/types/${node.type_id}/icon?size=32`} alt="" loading="lazy" />
        <span className="tree-name">
          {node.name}
          <ExternalLinks type="item" typeId={node.type_id} />
        </span>

        {/* Stock column — shown only when stock-check is on. Sits immediately
            left of Qty so you see "have | need" side by side at a glance.
            Abbreviated (18.9K) with color coding; full numbers in tooltip. */}
        {stockActive && (node.have !== undefined ? (() => {
          const have = node.have || 0;
          const need = node.quantity || 0;
          const abbr = (n) => {
            if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
            if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
            return String(n);
          };
          let cls = 'tree-have ok';
          let text;
          if (have >= need) { cls = 'tree-have ok'; text = `✓ ${abbr(have)}`; }
          else if (have > 0) { cls = 'tree-have partial'; text = `⚠ ${abbr(have)}`; }
          else { cls = 'tree-have missing'; text = `✗ 0`; }
          return <span className={cls} title={`Have ${have.toLocaleString()} of ${need.toLocaleString()} at build location${have < need ? ` · missing ${(need - have).toLocaleString()}` : ''}`}>{text}</span>;
        })() : <span className="tree-have empty" />)}

        {/* Quantity — needed */}
        <span className="tree-qty">x{node.quantity.toLocaleString()}</span>

        {/* Action: category badge + decision toggle */}
        <span className="tree-action">
          {node.category === 'reaction' && (
            <span className="tree-category reaction" title={`Reaction: ${node.runs_needed} runs × ${node.batch_size}/run`}>REACT</span>
          )}
          {node.is_buildable && node.build_cost !== null && (
            <button
              className={`tree-decision ${node.decision}`}
              onClick={() => onToggleDecision(node)}
              title={node.decision === 'build' ? 'Click to switch to BUY' : node.category === 'reaction' ? 'Click to switch to REACT' : 'Click to switch to BUILD'}
            >
              {node.decision === 'build' ? (node.category === 'reaction' ? 'REACT' : 'BUILD') : 'BUY'}
            </button>
          )}
          {!node.is_buildable && <span className="tree-decision buy-only">BUY</span>}
          {node.owned_blueprint && (
            <span className={`tree-owned ${node.owned_blueprint.is_bpo ? 'bpo' : 'bpc'}`} title={`${node.owned_blueprint.owner}: ${node.owned_blueprint.is_bpo ? 'BPO' : 'BPC'} ME${node.owned_blueprint.me}/TE${node.owned_blueprint.te}${node.owned_blueprint.runs > 0 ? ' (' + node.owned_blueprint.runs + ' runs)' : ''}`}>
              {node.owned_blueprint.is_bpo ? 'BPO' : 'BPC'} ME{node.owned_blueprint.me}
            </span>
          )}
          {node.location_blueprint !== undefined && node.location_blueprint === null && node.owned_blueprint && (
            <span className="tree-owned offsite" title="You own a BP but it's NOT at the chosen build location — move it there or get another copy">
              off-site
            </span>
          )}
        </span>

        {/* Cost */}
        <span className="tree-cost">{formatISK(cost)}</span>

        {/* Savings indicator */}
        <span className="tree-savings">{savings > 0 && node.decision === 'build' ? `-${formatISK(savings)}` : ''}</span>

        {/* Job time */}
        <span className="tree-time">{node.job_time > 0 && node.decision === 'build' ? formatTime(node.job_time) : ''}</span>

        {/* Job cost */}
        <span className="tree-job-cost">{node.job_cost > 0 && node.decision === 'build' ? formatISK(node.job_cost) : ''}</span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className={node.decision === 'buy' ? 'tree-children-dimmed' : ''}>
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.type_id}_${depth + 1}_${i}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onToggleDecision={onToggleDecision}
              stockActive={stockActive}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Load saved config from localStorage (outside component to avoid issues)
function loadSaved(key, fallback) {
  try {
    const v = localStorage.getItem('prodPlanner_' + key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function ProductionTree({ onError, refreshKey }) {
  const [searchText, setSearchText] = useState('');
  const [typeResults, setTypeResults] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  // Config
  const [quantity, setQuantity] = useState('1');
  const [meLevel, setMeLevel] = useState(loadSaved('meLevel', '0'));
  const [teLevel, setTeLevel] = useState(loadSaved('teLevel', '0'));
  const [contractPrice, setContractPrice] = useState('');
  const [shippingMinFee, setShippingMinFee] = useState(loadSaved('shippingMinFee', '25000000'));
  const [shippingPerM3, setShippingPerM3] = useState(loadSaved('shippingPerM3', '600'));
  const [collateralPct, setCollateralPct] = useState(loadSaved('collateralPct', '0'));
  const [maxVolume, setMaxVolume] = useState(loadSaved('maxVolume', '375000'));
  const [structureType, setStructureType] = useState(loadSaved('structureType', 'raitaru'));
  const [rigTier, setRigTier] = useState(loadSaved('rigTier', 'none'));
  const [secStatus, setSecStatus] = useState(loadSaved('secStatus', 'nullsec'));
  const [taxRate, setTaxRate] = useState(loadSaved('taxRate', '0'));
  const [systemSearch, setSystemSearch] = useState(loadSaved('systemName', ''));
  const [systemId, setSystemId] = useState(loadSaved('systemId', '0'));
  const [systemResults, setSystemResults] = useState([]);
  const systemSearchTimeout = useRef(null);

  // Industrial setup — job scheduling
  const [mfgSlots, setMfgSlots] = useState(loadSaved('mfgSlots', ''));
  const [reactionSlots, setReactionSlots] = useState(loadSaved('reactionSlots', ''));
  const [dontSplitDays, setDontSplitDays] = useState(loadSaved('dontSplitDays', '1'));
  const [buildAll, setBuildAll] = useState(loadSaved('buildAll', 'false') === 'true');
  const [detectedSlots, setDetectedSlots] = useState(null);

  // Save config to localStorage whenever it changes
  const saveConfig = (key, value, setter) => {
    setter(value);
    try { localStorage.setItem('prodPlanner_' + key, value); } catch {}
  };

  // Sell price (auto-populated from Jita, editable)
  const [sellPrice, setSellPrice] = useState('');

  // BP cost per run — auto-populated from cheapest Jita contract for the
  // top-level blueprint; deducted from profit. Manual override persists
  // across re-fetches until ↻ reset clears it back to contract minimum.
  const [bpCostPerRun, setBpCostPerRun] = useState('');
  const [bpContractData, setBpContractData] = useState(null);
  const [bpCostManual, setBpCostManual] = useState(false);
  const [showBpTrend, setShowBpTrend] = useState(false);

  // Inventory awareness — "what do I already have at this location?"
  // Personal mode: source is a character_id. Corp: source is a corp_id,
  // server transparently uses whichever linked char has asset-read role.
  const [invMode, setInvMode] = useState(loadSaved('invMode', '')); // '', 'personal', or 'corp'
  const [invSourceId, setInvSourceId] = useState(loadSaved('invSourceId', ''));
  const [invLocationId, setInvLocationId] = useState(loadSaved('invLocationId', ''));
  const [invContexts, setInvContexts] = useState(null); // { personal: [...], corps: [...] }
  const [invLocations, setInvLocations] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [shoppingMissingOnly, setShoppingMissingOnly] = useState(true);

  // Results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' or 'shopping'

  // Auto-detect industry slots from ESI on mount
  useEffect(() => {
    (async () => {
      try {
        const resp = await getJobSlots(null, true);
        const slots = resp.data.slots;
        setDetectedSlots(slots);
        if (!mfgSlots) setMfgSlots(String(slots.manufacturing.max));
        if (!reactionSlots) setReactionSlots(String(slots.reactions.max));
      } catch {}
    })();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load inventory contexts (character + corp dropdowns) on mount
  useEffect(() => {
    (async () => {
      try {
        const resp = await getInventoryContexts();
        setInvContexts(resp.data);
      } catch {
        setInvContexts({ personal: [], corps: [] });
      }
    })();
  }, [refreshKey]);

  // Whenever mode + sourceId both set, fetch available locations
  useEffect(() => {
    if (!invMode || !invSourceId) { setInvLocations([]); return; }
    let cancelled = false;
    (async () => {
      try {
        setInvLoading(true);
        const resp = await getInventoryLocations(invMode, invSourceId);
        if (!cancelled) {
          setInvLocations(resp.data.locations || []);
          // If the saved locationId isn't in the new list, clear it
          if (invLocationId && !(resp.data.locations || []).some(l => String(l.location_id) === String(invLocationId))) {
            setInvLocationId('');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setInvLocations([]);
          onError?.(err.response?.data?.error || 'Failed to load inventory locations');
        }
      } finally {
        if (!cancelled) setInvLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invMode, invSourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist inventory selections
  useEffect(() => { try { localStorage.setItem('prodPlanner_invMode', invMode); } catch {} }, [invMode]);
  useEffect(() => { try { localStorage.setItem('prodPlanner_invSourceId', invSourceId); } catch {} }, [invSourceId]);
  useEffect(() => { try { localStorage.setItem('prodPlanner_invLocationId', invLocationId); } catch {} }, [invLocationId]);

  // Effective tree — computed directly (no memo tricks)
  const tree = result?.tree ? (buildAll ? applyBuildAll(result.tree) : result.tree) : null;

  // Effective summary + shopping list
  let effectiveSummary = result?.summary || null;
  let effectiveShoppingList = result?.shopping_list || null;
  if (buildAll && tree && result) {
    try {
      const cfg = {
        shippingMinFee: parseFloat(shippingMinFee) || 25000000,
        shippingPerM3: parseFloat(shippingPerM3) || 600,
        collateralPct: parseFloat(collateralPct) || 0,
        maxVolume: parseFloat(maxVolume) || 375000,
      };
      const r = recalcSummary(tree, result.summary, cfg);
      effectiveSummary = r.summary;
      effectiveShoppingList = r.shopping_list;
    } catch (err) {
      console.error('recalcSummary error:', err);
    }
  }

  // Profit calculation from sell price
  if (effectiveSummary) {
    const sp = parseFloat(sellPrice) || 0;
    const qty = parseInt(quantity) || 1;
    const sellTotal = sp * qty;
    // BP cost is per run; user pays `bpCostPerRun × qty` for the blueprints
    // (1-run BPCs = 1 BPC per run; 10-run BPC at 33M costs 3.3M/run either
    // way). Deducted from build profit; import path is unaffected.
    const bpPerRun = parseFloat(bpCostPerRun) || 0;
    const bpTotal = bpPerRun * qty;
    effectiveSummary = {
      ...effectiveSummary,
      sell_price: sp,
      sell_total: sellTotal,
      bp_cost_per_run: bpPerRun,
      bp_cost_total: bpTotal,
      total_build_cost_with_bp: effectiveSummary.total_build_cost + bpTotal,
      build_profit: sellTotal > 0 ? sellTotal - effectiveSummary.total_build_cost - bpTotal : null,
      import_profit: sellTotal > 0 && !effectiveSummary.is_capital ? sellTotal - effectiveSummary.import_total_cost : null,
    };
  }

  // Job schedule — computed from tree + slot config
  const jobSchedule = useMemo(() => {
    if (!tree) return null;
    const s1 = parseInt(mfgSlots) || 1;
    const s2 = parseInt(reactionSlots) || 1;
    const threshold = (parseFloat(dontSplitDays) || 1) * 86400;
    return scheduleJobs(tree, s1, s2, threshold);
  }, [tree, mfgSlots, reactionSlots, dontSplitDays]);

  const handleSearchInput = (value) => {
    setSearchText(value);
    setTypeResults([]);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (/^\d+$/.test(value.trim()) || value.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const resp = await searchTypes(value.trim());
        setTypeResults(resp.data.results || []);
      } catch { setTypeResults([]); }
    }, 300);
    setSearchTimeout(timeout);
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setSearchText(type.name);
    setTypeResults([]);
  };

  const handleSystemSearch = (value) => {
    setSystemSearch(value);
    setSystemResults([]);
    if (systemSearchTimeout.current) clearTimeout(systemSearchTimeout.current);
    if (value.trim().length < 2) return;
    systemSearchTimeout.current = setTimeout(async () => {
      try {
        const resp = await searchSystems(value.trim());
        setSystemResults(resp.data || []);
      } catch { setSystemResults([]); }
    }, 300);
  };

  const handleSystemSelect = (sys) => {
    setSystemId(String(sys.id));
    setSystemSearch(sys.name);
    setSystemResults([]);
    try {
      localStorage.setItem('prodPlanner_systemId', String(sys.id));
      localStorage.setItem('prodPlanner_systemName', sys.name);
    } catch {}
  };

  const handleCalculate = async () => {
    const typeId = selectedType?.type_id || parseInt(searchText);
    if (!typeId) return;
    try {
      setLoading(true);
      const buildParams = {
        quantity: parseInt(quantity) || 1,
        me: parseInt(meLevel) || 0,
        te: parseInt(teLevel) || 0,
        contractPrice: parseFloat(contractPrice) || 0,
        shippingMinFee: parseFloat(shippingMinFee) || 25000000,
        shippingPerM3: parseFloat(shippingPerM3) || 600,
        collateralPct: parseFloat(collateralPct) || 0,
        maxVolume: parseFloat(maxVolume) || 375000,
        structure: structureType,
        rig: rigTier,
        sec: secStatus,
        taxRate: parseFloat(taxRate) || 0,
        systemId: parseInt(systemId) || 0,
      };
      // Inventory mode — server annotates each tree node with have/missing
      if (invMode && invSourceId && invLocationId) {
        buildParams.invMode = invMode;
        buildParams.invSourceId = parseInt(invSourceId);
        buildParams.invLocationId = parseInt(invLocationId);
      }
      const resp = await getBuildTree(typeId, buildParams);
      setResult(resp.data);
      setSellPrice(resp.data.summary?.sell_price > 0 ? String(resp.data.summary.sell_price) : '');
      setExpanded({});

      // Fetch current Jita BPC contracts for this blueprint so we can
      // auto-populate "BP cost per run". User can still override manually.
      const bpTypeId = resp.data.tree?.blueprint_id;
      if (bpTypeId) {
        try {
          const bpResp = await getBpContracts(bpTypeId);
          setBpContractData(bpResp.data);
          if (!bpCostManual) {
            const minPerRun = bpResp.data.summary?.min_price_per_run;
            setBpCostPerRun(minPerRun ? String(Math.round(minPerRun)) : '');
          }
        } catch {
          setBpContractData(null);
          if (!bpCostManual) setBpCostPerRun('');
        }
      } else {
        setBpContractData(null);
      }
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to build production tree');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (key) => {
    setExpanded(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const handleToggleDecision = useCallback((node) => {
    // Toggle decision in the tree — this is a simplified client-side toggle
    // In a full implementation we'd re-request the tree from the server
    node.decision = node.decision === 'build' ? 'buy' : 'build';
    setResult(r => ({ ...r })); // force re-render
  }, []);

  const handleCopyBuyAll = async () => {
    if (!effectiveShoppingList) return;
    // If we have inventory data AND the missing-only filter is on, copy
    // only the shortfall. Otherwise copy the full list.
    const hasInv = !!result?.inventory_context && !result.inventory_context.error;
    const rows = hasInv && shoppingMissingOnly
      ? effectiveShoppingList.filter(i => (i.missing || 0) > 0)
      : effectiveShoppingList;
    const lines = rows.map(item => {
      const qty = hasInv && shoppingMissingOnly ? (item.missing || item.quantity) : item.quantity;
      return `${item.name} ${qty}`;
    }).join('\n');
    const ok = await copyToClipboard(lines);
    if (!ok) onError?.('Failed to copy');
  };

  const s = effectiveSummary;

  return (
    <div className="ptree-container">
      <h2>Production Planner</h2>

      {/* Search */}
      <div className="ptree-search-wrap">
        <div className="ptree-search">
          <input
            type="text"
            placeholder="Search item to build (e.g. Gila, Ishtar, Cerberus)..."
            value={searchText}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCalculate()}
          />
        </div>
        {typeResults.length > 0 && (
          <div className="ptree-search-results">
            {typeResults.map(t => (
              <div key={t.type_id} className="ptree-search-result" onClick={() => handleTypeSelect(t)}>
                <span>{t.name}</span>
                <span className="ptree-type-id">ID: {t.type_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config */}
      <div className="ptree-controls">
        <div className="ptree-row">
          <div className="ptree-field">
            <label>Structure</label>
            <select value={structureType} onChange={e => saveConfig('structureType', e.target.value, setStructureType)}>
              <option value="raitaru">Raitaru (S)</option>
              <option value="azbel">Azbel (M)</option>
              <option value="sotiyo">Sotiyo (L)</option>
              <option value="tatara">Tatara (Reactions)</option>
              <option value="athanor">Athanor (Reactions)</option>
              <option value="npc">NPC Station</option>
            </select>
          </div>
          <div className="ptree-field">
            <label>Rig</label>
            <select value={rigTier} onChange={e => saveConfig('rigTier', e.target.value, setRigTier)}>
              <option value="none">No Rig</option>
              <option value="t1">T1 Rig (2% ME / 20% TE)</option>
              <option value="t2">T2 Rig (2.4% ME / 24% TE)</option>
            </select>
          </div>
          <div className="ptree-field">
            <label>Security</label>
            <select value={secStatus} onChange={e => saveConfig('secStatus', e.target.value, setSecStatus)}>
              <option value="nullsec">Nullsec / WH (2.1x rig)</option>
              <option value="low">Lowsec (1.9x rig)</option>
              <option value="high">Highsec (1.0x rig)</option>
            </select>
          </div>
          <div className="ptree-field">
            <label>Facility Tax % <span style={{fontSize:9,color:'#718096'}}>+4% SCC</span></label>
            <input type="number" value={taxRate} onChange={e => saveConfig('taxRate', e.target.value, setTaxRate)} placeholder="1" min="0" max="50" step="0.1" />
          </div>
          <div className="ptree-field" style={{ position: 'relative' }}>
            <label>System (job cost)</label>
            <input
              type="text"
              value={systemSearch}
              onChange={e => handleSystemSearch(e.target.value)}
              placeholder="Search system..."
            />
            {systemResults.length > 0 && (
              <div className="ptree-dropdown">
                {systemResults.map(sys => (
                  <div key={sys.id} className="ptree-dropdown-item" onClick={() => handleSystemSelect(sys)}>
                    {sys.name} <span style={{ opacity: 0.5, fontSize: 11 }}>{sys.security?.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ptree-row" style={{ marginTop: 10 }}>
          <div className="ptree-field narrow">
            <label>Quantity</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="ptree-field">
            <label>ME (0-10)</label>
            <input type="number" value={meLevel} onChange={e => saveConfig('meLevel', e.target.value, setMeLevel)} min="0" max="10" />
          </div>
          <div className="ptree-field">
            <label>TE (0-20)</label>
            <input type="number" value={teLevel} onChange={e => saveConfig('teLevel', e.target.value, setTeLevel)} min="0" max="20" />
          </div>
          <div className="ptree-field">
            <label>Contract Price</label>
            <input type="number" value={contractPrice} onChange={e => setContractPrice(e.target.value)} placeholder="Jita contract" />
          </div>
          <div className="ptree-field">
            <label>Sell Price</label>
            <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="Jita sell" />
          </div>
          <div className="ptree-field">
            <label title="Price per 1 BPC/run; deducted from build profit. Auto-populated from cheapest Jita contract when available.">
              BP Cost/Run
              {bpContractData?.summary?.offer_count > 0 && (
                <span style={{ fontSize: 10, color: '#718096', marginLeft: 4 }}>
                  ({bpContractData.summary.offer_count} offers{bpCostManual ? ' · manual' : ''})
                </span>
              )}
            </label>
            {/* Buttons always render so the input width + right edge stay
                pinned; we toggle visibility instead of mount/unmount. */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="number"
                value={bpCostPerRun}
                onChange={e => { setBpCostPerRun(e.target.value); setBpCostManual(true); }}
                placeholder={bpContractData?.summary?.min_price_per_run ? 'ISK' : 'no contracts yet'}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={`ptree-inline-btn${showBpTrend ? ' active' : ''}${result?.tree?.blueprint_id ? '' : ' invisible'}`}
                title="Show BPC price history — min/median/max per run over time"
                onClick={() => setShowBpTrend(s => !s)}
              >📈</button>
              <button
                type="button"
                className={`ptree-inline-btn${bpCostManual && bpContractData?.summary?.min_price_per_run > 0 ? '' : ' invisible'}`}
                title="Reset to cheapest contract price"
                onClick={() => {
                  if (bpContractData?.summary?.min_price_per_run > 0) {
                    setBpCostPerRun(String(Math.round(bpContractData.summary.min_price_per_run)));
                    setBpCostManual(false);
                  }
                }}
              >↻</button>
            </div>
          </div>
          {/* Explicit row break — keeps Min Fee + ISK/m³ together at the
              start of row 3 regardless of viewport width. */}
          <div style={{ flexBasis: '100%', height: 0, margin: 0, padding: 0 }} />
          <div className="ptree-field">
            <label>Min Fee</label>
            <input type="number" value={shippingMinFee} onChange={e => saveConfig('shippingMinFee', e.target.value, setShippingMinFee)} placeholder="25M" />
          </div>
          <div className="ptree-field narrow">
            <label>ISK/m³</label>
            <input type="number" value={shippingPerM3} onChange={e => saveConfig('shippingPerM3', e.target.value, setShippingPerM3)} placeholder="600" />
          </div>
          <div className="ptree-field">
            <label>Collateral %</label>
            <input type="number" value={collateralPct} onChange={e => saveConfig('collateralPct', e.target.value, setCollateralPct)} placeholder="0" />
          </div>
          <div className="ptree-field">
            <label>Max m³</label>
            <input type="number" value={maxVolume} onChange={e => saveConfig('maxVolume', e.target.value, setMaxVolume)} placeholder="375000" />
          </div>
          <div className="ptree-field">
            <label>MFG Slots {detectedSlots && <span className="slot-detected">({detectedSlots.manufacturing.max} detected)</span>}</label>
            <input type="number" value={mfgSlots} onChange={e => saveConfig('mfgSlots', e.target.value, setMfgSlots)} placeholder={String(detectedSlots?.manufacturing.max || 1)} min="1" />
          </div>
          <div className="ptree-field">
            <label>Reaction Slots {detectedSlots && <span className="slot-detected">({detectedSlots.reactions.max} detected)</span>}</label>
            <input type="number" value={reactionSlots} onChange={e => saveConfig('reactionSlots', e.target.value, setReactionSlots)} placeholder={String(detectedSlots?.reactions.max || 1)} min="1" />
          </div>
          <div className="ptree-field">
            <label>Max job length (days)</label>
            <input type="number" value={dontSplitDays} onChange={e => saveConfig('dontSplitDays', e.target.value, setDontSplitDays)} placeholder="1" min="0" step="0.5" />
          </div>
          <div className="ptree-field ptree-checkbox">
            <label>
              <input type="checkbox" checked={buildAll} onChange={e => { setBuildAll(e.target.checked); try { localStorage.setItem('prodPlanner_buildAll', String(e.target.checked)); } catch {} }} />
              Build All
            </label>
          </div>
          <div className="ptree-field">
            <label>&nbsp;</label>
            <button className="ptree-calc-btn" onClick={handleCalculate} disabled={loading || (!selectedType && !parseInt(searchText))}>
              {loading ? 'Building...' : 'Build Tree'}
            </button>
          </div>
        </div>

        {/* Inventory awareness — all three selectors always render with a
            fixed layout; disabled/empty state when not applicable so the
            row doesn't reflow as the user makes choices. */}
        <div className="ptree-row ptree-inventory-row" style={{ marginTop: 10, gap: 12, alignItems: 'end' }}>
          <div className="ptree-field" style={{ minWidth: 180 }}>
            <label>Stock check</label>
            <select
              value={invMode}
              onChange={e => { setInvMode(e.target.value); setInvSourceId(''); setInvLocationId(''); }}
            >
              <option value="">— Off —</option>
              <option value="personal">Personal character</option>
              <option value="corp">Corporation hangars</option>
            </select>
          </div>
          <div className="ptree-field" style={{ minWidth: 200 }}>
            <label>{invMode === 'corp' ? 'Corporation' : 'Character'}</label>
            <select
              value={invSourceId}
              onChange={e => setInvSourceId(e.target.value)}
              disabled={!invMode}
            >
              <option value="">{invMode ? `Pick ${invMode === 'corp' ? 'corp' : 'character'}…` : '—'}</option>
              {invMode === 'personal' && (invContexts?.personal || []).map(c => (
                <option key={c.character_id} value={c.character_id}>{c.character_name}</option>
              ))}
              {invMode === 'corp' && (invContexts?.corps || []).map(c => (
                <option
                  key={c.corporation_id}
                  value={c.corporation_id}
                  disabled={!c.role_holder_character_id}
                  title={c.role_holder_character_id ? '' : 'No linked character has asset-read role (Director / Accountant / Station Manager)'}
                >
                  {c.name}{c.ticker ? ` [${c.ticker}]` : ''}{!c.role_holder_character_id ? ' — no access' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="ptree-field" style={{ minWidth: 280 }}>
            <label>Location{invLoading ? ' (loading…)' : invLocations.length ? ` (${invLocations.length})` : ''}</label>
            <select
              value={invLocationId}
              onChange={e => setInvLocationId(e.target.value)}
              disabled={!invMode || !invSourceId || invLoading}
            >
              <option value="">{!invMode || !invSourceId ? '—' : 'Pick location…'}</option>
              {invLocations.map(l => (
                <option key={l.location_id} value={l.location_id}>
                  {l.name} — {l.asset_count.toLocaleString()} items
                </option>
              ))}
            </select>
          </div>
          <div className="ptree-field" style={{ alignSelf: 'end', fontSize: 11, color: '#a0aec0', flex: 1, minWidth: 0 }}>
            <label>&nbsp;</label>
            <span style={{ visibility: invMode && invSourceId && invLocationId ? 'visible' : 'hidden' }}>
              Stock check active — rebuild the tree to apply
            </span>
          </div>
        </div>

        {/* BPC price-history chart — toggled via 📈 button on BP Cost/Run */}
        {showBpTrend && result?.tree?.blueprint_id && (
          <div style={{ marginTop: 10, padding: 12, background: 'rgba(0,0,0,0.15)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
            <BpcPriceTrendChart
              typeId={result.tree.blueprint_id}
              typeName={result.product?.name}
            />
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <div className="ptree-summary">
            <div className="ptree-product-header">
              <h3>
                {result.product.name} x{result.product.quantity}
                <ExternalLinks type="item" typeId={result.product.type_id} />
                <span className={`ptree-item-type type-${result.product.item_type.toLowerCase()}`}>{result.product.item_type}</span>
              </h3>
            </div>

            <div className={`ptree-verdict ${s.recommendation.toLowerCase()}`}>
              <span className="verdict-label">{s.recommendation}</span>
              <span className="verdict-detail">
                {s.buy_finished_cost === 0
                  ? `Not on market — must build | Materials: ${formatISK(s.material_cost)} + Jobs: ${formatISK(s.job_cost)} + Shipping: ${formatISK(s.shipping_cost)} = ${formatISK(s.total_build_cost)}`
                  : s.recommendation === 'BUILD'
                  ? `Building saves ${formatISK(s.savings)} | Build: ${formatISK(s.total_build_cost)} (Mat: ${formatISK(s.material_cost)} + Jobs: ${formatISK(s.job_cost)} + Ship: ${formatISK(s.shipping_cost)}) vs Import: ${formatISK(s.import_total_cost)}${s.is_capital ? ' (can\'t ship)' : ` (Buy: ${formatISK(s.buy_finished_cost)} + Ship: ${formatISK(s.import_shipping)})`}`
                  : `Import saves ${formatISK(-s.savings)} | Import: ${formatISK(s.import_total_cost)}${s.is_capital ? ` (${formatISK(s.buy_finished_cost)} — can't ship)` : ` (Buy: ${formatISK(s.buy_finished_cost)} + Ship: ${formatISK(s.import_shipping)})`} vs Build: ${formatISK(s.total_build_cost)} (Mat: ${formatISK(s.material_cost)} + Jobs: ${formatISK(s.job_cost)} + Ship: ${formatISK(s.shipping_cost)})`
                }
              </span>
            </div>

            <div className="ptree-stats">
              <div className="stat-box">
                <span className="stat-label">{s.buy_source === 'contract' ? 'Contract' : s.buy_source === 'market' ? 'Import Total' : 'Buy Finished'}</span>
                <span className="stat-value">{s.buy_finished_cost > 0 ? (s.is_capital ? `${formatISK(s.buy_finished_cost)} (can't ship)` : formatISK(s.import_total_cost)) : 'N/A'}</span>
              </div>
              <div className="stat-box highlight">
                <span className="stat-label">Build Cost</span>
                <span className="stat-value">{formatISK(s.total_build_cost)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Materials</span>
                <span className="stat-value">{formatISK(s.material_cost)}</span>
              </div>
              {s.job_cost > 0 && (
                <div className="stat-box">
                  <span className="stat-label">Job Cost</span>
                  <span className="stat-value">{formatISK(s.job_cost)}</span>
                </div>
              )}
              <div className="stat-box">
                <span className="stat-label">Shipping (mats)</span>
                <span className="stat-value">{formatISK(s.shipping_cost)}</span>
              </div>
              {s.bp_cost_total > 0 && (
                <div className="stat-box" title={`${formatISK(s.bp_cost_per_run)}/run × ${parseInt(quantity) || 1} runs${bpContractData?.summary?.offer_count ? ` · sourced from ${bpContractData.summary.offer_count} Jita contracts` : ''}`}>
                  <span className="stat-label">BP Cost{bpCostManual ? ' (manual)' : ''}</span>
                  <span className="stat-value">{formatISK(s.bp_cost_total)}</span>
                </div>
              )}
              {s.sell_total > 0 && (
                <div className="stat-box">
                  <span className="stat-label">Sell Revenue</span>
                  <span className="stat-value">{formatISK(s.sell_total)}</span>
                </div>
              )}
              {s.build_profit !== null && (
                <div className={`stat-box ${s.build_profit > 0 ? 'profit-positive' : 'profit-negative'}`}>
                  <span className="stat-label">Build Profit</span>
                  <span className="stat-value">{s.build_profit > 0 ? '+' : ''}{formatISK(s.build_profit)}</span>
                </div>
              )}
              {s.import_profit !== null && (
                <div className={`stat-box ${s.import_profit > 0 ? 'profit-positive' : 'profit-negative'}`}>
                  <span className="stat-label">Import Profit</span>
                  <span className="stat-value">{s.import_profit > 0 ? '+' : ''}{formatISK(s.import_profit)}</span>
                </div>
              )}
              <div className="stat-box">
                <span className="stat-label">Volume</span>
                <span className="stat-value">{s.total_volume_m3?.toLocaleString()} m3</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Contracts</span>
                <span className="stat-value">{s.shipping_contracts}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Jobs</span>
                <span className="stat-value">{s.total_jobs}</span>
              </div>
              {s.owned_blueprints > 0 && (
                <div className="stat-box owned">
                  <span className="stat-label">Owned BPs</span>
                  <span className="stat-value">{s.owned_blueprints}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="ptree-tabs">
            <button className={activeTab === 'tree' ? 'active' : ''} onClick={() => setActiveTab('tree')}>
              Build Tree
            </button>
            <button className={activeTab === 'shopping' ? 'active' : ''} onClick={() => setActiveTab('shopping')}>
              Shopping List ({effectiveShoppingList?.length || 0})
            </button>
            {result.missing_blueprints?.length > 0 && (
              <button className={activeTab === 'blueprints' ? 'active' : ''} onClick={() => setActiveTab('blueprints')}>
                Missing BPs ({result.missing_blueprints.length})
              </button>
            )}
            <button className={activeTab === 'jobs' ? 'active' : ''} onClick={() => setActiveTab('jobs')}>
              Jobs {jobSchedule ? `(${jobSchedule.totalJobs})` : ''}
            </button>
          </div>

          {/* Tree View */}
          {activeTab === 'tree' && tree && (() => {
            const stockActive = !!result?.inventory_context && !result.inventory_context.error;
            return (
              <div className="ptree-tree">
                <div className="tree-header">
                  <span className="tree-header-name">Item</span>
                  {stockActive && <span className="tree-header-stock">Stock</span>}
                  <span className="tree-header-qty">Qty</span>
                  <span className="tree-header-decision">Action</span>
                  <span className="tree-header-cost">Cost</span>
                  <span className="tree-header-savings">Savings</span>
                  <span className="tree-header-time">Time</span>
                  <span className="tree-header-jobcost">Job Cost</span>
                </div>
                <TreeNode
                  node={tree}
                  depth={0}
                  expanded={expanded}
                  onToggleExpand={handleToggleExpand}
                  onToggleDecision={handleToggleDecision}
                  stockActive={stockActive}
                />
              </div>
            );
          })()}

          {/* Shopping List */}
          {activeTab === 'shopping' && effectiveShoppingList && (() => {
            const hasInv = !!result?.inventory_context && !result.inventory_context.error;
            const visibleRows = hasInv && shoppingMissingOnly
              ? effectiveShoppingList.filter(i => (i.missing || 0) > 0)
              : effectiveShoppingList;
            const missingCount = effectiveShoppingList.filter(i => (i.missing || 0) > 0).length;
            const totalCost = visibleRows.reduce((s, i) => {
              const qty = hasInv && shoppingMissingOnly ? (i.missing || i.quantity) : i.quantity;
              return s + (i.unit_price || 0) * qty;
            }, 0);
            const totalVol = visibleRows.reduce((s, i) => {
              const qty = hasInv && shoppingMissingOnly ? (i.missing || i.quantity) : i.quantity;
              return s + (i.volume || 0) * qty;
            }, 0);
            return (
              <div className="ptree-shopping">
                <div className="shopping-header">
                  <span>
                    Materials {hasInv && shoppingMissingOnly ? 'missing' : 'to buy'} ({visibleRows.length}{hasInv && !shoppingMissingOnly ? ` · ${missingCount} missing` : ''} items)
                  </span>
                  <div className="shopping-actions">
                    {hasInv && (
                      <label style={{ fontSize: 12, color: '#a0aec0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={shoppingMissingOnly} onChange={e => setShoppingMissingOnly(e.target.checked)} />
                        Missing only
                      </label>
                    )}
                    <button className="buy-all-btn" onClick={handleCopyBuyAll}>Copy Multi-Buy</button>
                    <ExportButton
                      getData={() => visibleRows.map(i => ({
                        item: i.name, quantity: i.quantity, have: i.have || 0, missing: i.missing || 0,
                        unit_price: i.unit_price, total_cost: i.total_cost, volume: i.total_volume,
                      }))}
                      columns={[
                        { key: 'item', label: 'Item' }, { key: 'quantity', label: 'Need' },
                        { key: 'have', label: 'Have' }, { key: 'missing', label: 'Missing' },
                        { key: 'unit_price', label: 'Unit Price' }, { key: 'total_cost', label: 'Total (need)' },
                        { key: 'volume', label: 'Volume m3' },
                      ]}
                      filename={hasInv && shoppingMissingOnly ? 'shopping-list-missing' : 'shopping-list'}
                    />
                  </div>
                </div>
                <table className="shopping-table">
                  <colgroup>
                    <col className="col-material" />
                    <col className="col-num" />
                    {hasInv && <col className="col-num" />}
                    {hasInv && <col className="col-num" />}
                    <col className="col-num" />
                    <col className="col-num" />
                    <col className="col-num" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th className="num">Need</th>
                      {hasInv && <th className="num">Have</th>}
                      {hasInv && <th className="num">Missing</th>}
                      <th className="num">Unit Price</th>
                      <th className="num">Subtotal</th>
                      <th className="num">m³</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(item => {
                      const showQty = hasInv && shoppingMissingOnly ? (item.missing || item.quantity) : item.quantity;
                      const subtotal = (item.unit_price || 0) * showQty;
                      const vol = (item.volume || 0) * showQty;
                      return (
                        <tr key={item.type_id}>
                          <td className="mat-name">
                            <img className="shop-icon" src={`https://images.evetech.net/types/${item.type_id}/icon?size=32`} alt="" loading="lazy" />
                            {item.name}
                            <ExternalLinks type="item" typeId={item.type_id} />
                          </td>
                          <td className="num">{item.quantity.toLocaleString()}</td>
                          {hasInv && <td className="num" style={{ color: '#48bb78' }}>{(item.have || 0).toLocaleString()}</td>}
                          {hasInv && <td className="num" style={{ color: (item.missing || 0) > 0 ? '#fc8181' : '#718096' }}>{(item.missing || 0).toLocaleString()}</td>}
                          <td className="num">{formatISK(item.unit_price)}</td>
                          <td className="num">{formatISK(subtotal)}</td>
                          <td className="num">{vol.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td></td>
                      {hasInv && <td></td>}
                      {hasInv && <td></td>}
                      <td></td>
                      <td className="num">{formatISK(totalCost)}</td>
                      <td className="num">{totalVol.toFixed(1)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}

          {/* Missing Blueprints */}
          {activeTab === 'blueprints' && result.missing_blueprints && (
            <div className="ptree-blueprints">
              <div className="bp-header">
                <span>Blueprints needed to build ({result.missing_blueprints.length})</span>
                <div className="shopping-actions">
                  <button
                    className="buy-all-btn"
                    title="Copy only the BPs that have a Jita BPO market price (BPCs aren't market-tradeable — pull those from contracts)"
                    onClick={async () => {
                      const buyable = result.missing_blueprints.filter(bp => bp.bpo_market_price > 0);
                      if (buyable.length === 0) { onError?.('No market-tradeable BPs in this list (all BPCs)'); return; }
                      const lines = buyable.map(bp => `${bp.name} Blueprint 1`).join('\n');
                      const ok = await copyToClipboard(lines);
                      if (!ok) onError?.('Failed to copy');
                    }}
                  >Copy Multi-Buy (BPOs)</button>
                  <ExportButton
                    getData={() => result.missing_blueprints.map(bp => ({
                      blueprint: `${bp.name} Blueprint`,
                      blueprint_type_id: bp.blueprint_id || bp.type_id,
                      product_type_id: bp.type_id,
                      category: bp.category,
                      quantity_needed: bp.quantity_needed,
                      bpo_market_price: bp.bpo_market_price,
                      source: bp.bpo_market_price > 0 ? 'Buy BPO on market' : 'BPC (contracts/LP/invention)',
                    }))}
                    columns={[
                      { key: 'blueprint', label: 'Blueprint' },
                      { key: 'blueprint_type_id', label: 'BP Type ID' },
                      { key: 'product_type_id', label: 'Product Type ID' },
                      { key: 'category', label: 'Activity' },
                      { key: 'quantity_needed', label: 'Runs Needed' },
                      { key: 'bpo_market_price', label: 'BPO Market Price (ISK)' },
                      { key: 'source', label: 'Source' },
                    ]}
                    filename="missing-blueprints"
                  />
                </div>
              </div>
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Type</th>
                    <th className="num">BPO Market Price</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {result.missing_blueprints.map(bp => (
                    <tr key={bp.type_id}>
                      <td className="mat-name">
                        {bp.name} Blueprint
                        <ExternalLinks type="item" typeId={bp.blueprint_id || bp.type_id} />
                      </td>
                      <td>
                        <span className={`bp-type-badge ${bp.category}`}>
                          {bp.category === 'reaction' ? 'REACTION' : 'MFG'}
                        </span>
                      </td>
                      <td className="num">
                        {bp.bpo_market_price > 0 ? formatISK(bp.bpo_market_price) : '—'}
                      </td>
                      <td className="bp-source">
                        {bp.bpo_market_price > 0 ? 'Buy BPO on market' : 'BPC (contracts/LP/invention)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total BPO cost</td>
                    <td></td>
                    <td className="num">{formatISK(result.missing_blueprints.reduce((s, bp) => s + (bp.bpo_market_price || 0), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Jobs Tab */}
          {activeTab === 'jobs' && jobSchedule && (
            <div className="ptree-jobs">
              <div className="jobs-summary">
                <div className="stat-box highlight">
                  <span className="stat-label">Wall-clock Time</span>
                  <span className="stat-value jobs-wallclock">{formatTime(jobSchedule.wallClock)}</span>
                  {(jobSchedule.reactions.bottleneck || jobSchedule.manufacturing.bottleneck) && (
                    <span className="jobs-bottleneck">
                      Bottleneck: {(jobSchedule.reactions.bottleneck?.parallel_time || 0) >= (jobSchedule.manufacturing.bottleneck?.parallel_time || 0)
                        ? jobSchedule.reactions.bottleneck?.name
                        : jobSchedule.manufacturing.bottleneck?.name}
                    </span>
                  )}
                </div>
                <div className="stat-box">
                  <span className="stat-label">Reactions (parallel)</span>
                  <span className="stat-value">{formatTime(jobSchedule.reactions.totalParallel)}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Manufacturing (parallel)</span>
                  <span className="stat-value">{formatTime(jobSchedule.manufacturing.totalParallel)}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Sequential Time</span>
                  <span className="stat-value">{formatTime(jobSchedule.reactions.totalSequential + jobSchedule.manufacturing.totalSequential)}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">MFG Slots</span>
                  <span className="stat-value">{mfgSlots || '?'}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Reaction Slots</span>
                  <span className="stat-value">{reactionSlots || '?'}</span>
                </div>
              </div>

              {jobSchedule.categories.map(cat => (
                <details key={cat.name} className="jobs-category" open>
                  <summary className="jobs-category-header">
                    <span className="jobs-category-name">{cat.name}</span>
                    <span className="jobs-category-meta">Job count: {cat.jobs.length} &nbsp; Longest: {formatTime(cat.longest)}</span>
                  </summary>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="num">Runs</th>
                        <th className="num">Time/Run</th>
                        <th className="num">Total Time</th>
                        <th className="num">Split</th>
                        <th className="num">Parallel Time</th>
                        <th className="num">Job Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.jobs.map((job, i) => (
                        <tr key={`${job.type_id}-${i}`}>
                          <td><img className="jobs-icon" src={`https://images.evetech.net/types/${job.type_id}/icon?size=32`} alt="" loading="lazy" />{job.name}</td>
                          <td className="num">{job.runs_needed.toLocaleString()}</td>
                          <td className="num">{formatTime(job.time_per_run)}</td>
                          <td className="num">{formatTime(job.total_time)}</td>
                          <td className="num">{job.split_into > 1 ? <span className="split-badge">{job.split_into}</span> : <span className="no-split">1</span>}</td>
                          <td className="num">{formatTime(job.parallel_time)}</td>
                          <td className="num">{job.job_cost > 0 ? formatISK(job.job_cost) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}

              {jobSchedule.totalJobs === 0 && (
                <p style={{ color: '#718096', textAlign: 'center', padding: 20 }}>No BUILD jobs in the current tree. Toggle some nodes to BUILD to see job scheduling.</p>
              )}
            </div>
          )}
        </>
      )}

     {!result && !loading && (
        <div className="ptree-empty">
          <p>Search for an item, configure ME and shipping, then click <strong>Build Tree</strong></p>
          <p className="ptree-hint">Recursively resolves materials — each component shows build vs buy with optimal decision</p>
        </div>
      )}
    </div>
  );
}

export default ProductionTree;
