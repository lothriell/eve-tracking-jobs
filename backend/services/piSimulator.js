'use strict';

/**
 * PI Colony Simulator
 *
 * Advances an ESI planet layout snapshot forward to the current time by
 * replaying extractor and factory cycles using a discrete event loop.
 * Modeled on RIFT's ColonySimulation.kt.
 */

const MAX_ITERATIONS = 50000;

// Storage capacities by pin type name (matches frontend getStorageCapacity)
function getStorageCapacity(pin) {
  const name = (pin.type_name || '').toLowerCase();
  if (name.includes('launchpad')) return 10000;
  if (name.includes('storage')) return 12000;
  if (name.includes('command center')) return 500;
  return 0;
}

function isStoragePin(pin) {
  return getStorageCapacity(pin) > 0;
}

function isFactoryPin(pin) {
  return !!(pin.schematic_id || pin.factory_details);
}

function isExtractorPin(pin) {
  return !!pin.extractor_details;
}

// ============== CONTENTS HELPERS ==============

function getContentAmount(pin, typeId) {
  if (!pin.contents) return 0;
  const item = pin.contents.find(c => c.type_id === typeId);
  return item ? item.amount : 0;
}

function addToContents(pin, typeId, amount) {
  if (amount <= 0) return;
  if (!pin.contents) pin.contents = [];
  const existing = pin.contents.find(c => c.type_id === typeId);
  if (existing) {
    existing.amount += amount;
  } else {
    pin.contents.push({ type_id: typeId, amount });
  }
}

function removeFromContents(pin, typeId, amount) {
  if (!pin.contents) return 0;
  const existing = pin.contents.find(c => c.type_id === typeId);
  if (!existing) return 0;
  const removed = Math.min(existing.amount, amount);
  existing.amount -= removed;
  if (existing.amount <= 0) {
    pin.contents = pin.contents.filter(c => c.type_id !== typeId);
  }
  return removed;
}

// ============== CAPACITY ==============

function getVolume(typeVolumes, typeId) {
  return typeVolumes[typeId] || typeVolumes[String(typeId)] || 0.01;
}

function computeCapacityUsed(pin, typeVolumes) {
  if (!pin.contents) return 0;
  let used = 0;
  for (const item of pin.contents) {
    used += getVolume(typeVolumes, item.type_id) * item.amount;
  }
  return used;
}

function canAcceptStorage(pin, typeId, quantity, typeVolumes) {
  const cap = getStorageCapacity(pin);
  if (cap <= 0) return quantity; // not a storage pin, no volumetric limit
  const vol = getVolume(typeVolumes, typeId);
  const remaining = cap - (pin._capacityUsed || 0);
  return Math.min(quantity, Math.floor(remaining / vol));
}

function canAcceptFactory(pin, typeId, quantity, schematicInputs) {
  const inputs = schematicInputs[pin.schematic_id];
  if (!inputs) return 0;
  const demand = inputs.find(i => i.type_id === typeId);
  if (!demand) return 0;
  const current = getContentAmount(pin, typeId);
  const space = demand.quantity - current;
  return Math.min(quantity, Math.max(0, space));
}

// ============== EXTRACTOR DEGRADATION FORMULA ==============
// Ported from RIFT's ExtractionSimulation.kt

function getExtractorOutput(baseValue, installTime, currentTime, cycleTimeMs) {
  const cycleTimeSec = cycleTimeMs / 1000;
  const SEC = 10000000;
  const startT = installTime * SEC / 1000;  // ms to SEC units
  const currT = currentTime * SEC / 1000;
  const cycleSEC = cycleTimeSec * SEC;

  const timeDiff = currT - startT;
  const cycleNum = Math.max(Math.floor((timeDiff + SEC) / cycleSEC) - 1, 0);
  const barWidth = cycleTimeSec / 900;
  const t = (cycleNum + 0.5) * barWidth;

  const decayFactor = 0.012;
  const noiseFactor = 0.8;
  const decayValue = baseValue / (1 + t * decayFactor);
  const phaseShift = Math.pow(baseValue, 0.7);

  const sinA = Math.cos(phaseShift + t / 12);
  const sinB = Math.cos(phaseShift / 2 + t / 5);
  const sinC = Math.cos(t / 2);
  const sinStuff = Math.max(0, (sinA + sinB + sinC) / 3);

  const barHeight = decayValue * (1 + noiseFactor * sinStuff);
  const output = barWidth * barHeight;

  // RIFT rounding: integers round down by 1
  if (output - Math.floor(output) === 0) return Math.max(0, Math.floor(output) - 1);
  return Math.floor(output);
}

// ============== EVENT QUEUE ==============

class EventQueue {
  constructor() {
    this.events = [];
  }
  enqueue(time, pinId) {
    this.events.push({ time, pinId });
    // Keep sorted by time (insertion sort is fine for small arrays)
    this.events.sort((a, b) => a.time - b.time);
  }
  dequeue() {
    return this.events.shift();
  }
  isEmpty() {
    return this.events.length === 0;
  }
}

// ============== MAIN SIMULATION ==============

/**
 * Simulate a colony forward to the current time.
 *
 * @param {Object} layout - ESI layout (pins, routes, links) already enriched with factory_details
 * @param {Object} typeVolumes - { typeId: volumeM3 }
 * @param {Object} schematicInputs - { schematicId: [{ type_id, quantity }, ...] }
 * @param {number} [now] - target time in ms (defaults to Date.now())
 * @returns {Object} mutated layout with simulated pin contents
 */
function simulateColony(layout, typeVolumes, schematicInputs, now) {
  now = now || Date.now();
  const pins = layout.pins || [];
  if (pins.length === 0) return layout;

  // Deep-clone contents so we don't mutate ESI cache
  for (const pin of pins) {
    if (pin.contents) {
      pin.contents = pin.contents.map(c => ({ ...c }));
    } else {
      pin.contents = [];
    }
  }

  // Build pin map
  const pinMap = {};
  for (const pin of pins) {
    pinMap[pin.pin_id] = pin;
  }

  // Build route maps
  const inboundRoutes = {};  // destPinId -> [route, ...]
  const outboundRoutes = {}; // srcPinId -> [route, ...]
  for (const route of (layout.routes || [])) {
    const src = route.source_pin_id;
    const dst = route.destination_pin_id;
    if (!outboundRoutes[src]) outboundRoutes[src] = [];
    outboundRoutes[src].push(route);
    if (!inboundRoutes[dst]) inboundRoutes[dst] = [];
    inboundRoutes[dst].push(route);
  }

  // Compute initial capacity for storage pins
  for (const pin of pins) {
    if (isStoragePin(pin)) {
      pin._capacityUsed = computeCapacityUsed(pin, typeVolumes);
    }
  }

  // Schedule initial events
  const queue = new EventQueue();

  for (const pin of pins) {
    if (isExtractorPin(pin)) {
      const ext = pin.extractor_details;
      if (!ext || !pin.last_cycle_start || !ext.cycle_time) continue;
      const lastCycleMs = new Date(pin.last_cycle_start).getTime();
      const cycleMs = ext.cycle_time * 1000;
      const nextRun = lastCycleMs + cycleMs;
      if (nextRun <= now) {
        queue.enqueue(nextRun, pin.pin_id);
      }
    } else if (isFactoryPin(pin)) {
      const cycleTime = pin.factory_details?.cycle_time;
      if (!cycleTime || !pin.last_cycle_start) continue;
      const lastCycleMs = new Date(pin.last_cycle_start).getTime();
      const nextRun = lastCycleMs + cycleTime * 1000;
      if (nextRun <= now) {
        queue.enqueue(nextRun, pin.pin_id);
      }
    }
  }

  // Main simulation loop
  let iterations = 0;
  while (!queue.isEmpty() && iterations < MAX_ITERATIONS) {
    const event = queue.dequeue();
    if (event.time > now) break;
    iterations++;

    const pin = pinMap[event.pinId];
    if (!pin) continue;

    if (isExtractorPin(pin)) {
      processExtractor(pin, event.time, now, queue, pinMap, outboundRoutes, typeVolumes, schematicInputs);
    } else if (isFactoryPin(pin)) {
      processFactory(pin, event.time, now, queue, pinMap, inboundRoutes, outboundRoutes, typeVolumes, schematicInputs);
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn(`[PI Sim] Hit iteration cap (${MAX_ITERATIONS}) — snapshot may be very stale`);
  }

  // Mark factory idle/active state after simulation
  for (const pin of pins) {
    if (isFactoryPin(pin) && pin.factory_details) {
      const schematicId = pin.schematic_id || pin.factory_details.schematic_id;
      const inputs = schematicInputs[schematicId];
      if (!inputs) {
        pin.factory_details.simulated_idle = true;
        continue;
      }
      let canRun = true;
      for (const inp of inputs) {
        if (getContentAmount(pin, inp.type_id) < inp.quantity) {
          canRun = false;
          break;
        }
      }
      pin.factory_details.simulated_idle = !canRun;
    }
  }

  // Clean up internal fields
  for (const pin of pins) {
    delete pin._capacityUsed;
  }

  layout.simulated = true;
  layout.simulated_at = new Date(now).toISOString();
  return layout;
}

// ============== EXTRACTOR PROCESSING ==============

function processExtractor(pin, eventTime, now, queue, pinMap, outboundRoutes, typeVolumes, schematicInputs) {
  const ext = pin.extractor_details;
  const expiryMs = pin.expiry_time ? new Date(pin.expiry_time).getTime() : null;

  // Skip if expired
  if (expiryMs && eventTime > expiryMs) return;

  const installMs = pin.install_time ? new Date(pin.install_time).getTime() : null;
  const cycleMs = ext.cycle_time * 1000;
  const productTypeId = ext.product_type_id;

  if (!installMs || !productTypeId) return;

  // Calculate output for this cycle
  const output = getExtractorOutput(ext.qty_per_cycle, installMs, eventTime, cycleMs);

  if (output > 0) {
    // Route output to destination pins
    routeOutput(pin, productTypeId, output, pinMap, outboundRoutes, typeVolumes, schematicInputs);
  }

  // Reschedule next cycle
  const nextRun = eventTime + cycleMs;
  if (nextRun <= now && (!expiryMs || nextRun <= expiryMs)) {
    queue.enqueue(nextRun, pin.pin_id);
  }
}

// ============== FACTORY PROCESSING ==============

function processFactory(pin, eventTime, now, queue, pinMap, inboundRoutes, outboundRoutes, typeVolumes, schematicInputs) {
  const schematicId = pin.schematic_id || pin.factory_details?.schematic_id;
  const inputs = schematicInputs[schematicId];
  const cycleTime = pin.factory_details?.cycle_time;
  if (!inputs || !cycleTime) return;

  const cycleMs = cycleTime * 1000;

  // Step 1: Pull inputs from connected storage pins
  pullFactoryInputs(pin, pinMap, inboundRoutes, typeVolumes, schematicInputs);

  // Step 2: Check if factory has enough inputs
  let canRun = true;
  for (const inp of inputs) {
    if (getContentAmount(pin, inp.type_id) < inp.quantity) {
      canRun = false;
      break;
    }
  }

  if (canRun) {
    // Step 3: Consume inputs
    for (const inp of inputs) {
      removeFromContents(pin, inp.type_id, inp.quantity);
    }

    // Step 4: Produce output and route it
    const outputTypeId = pin.factory_details.output_type_id;
    const outputQty = pin.factory_details.output_quantity;
    if (outputTypeId && outputQty) {
      routeOutput(pin, outputTypeId, outputQty, pinMap, outboundRoutes, typeVolumes, schematicInputs);
    }

    pin.last_cycle_start = new Date(eventTime).toISOString();
  }

  // Reschedule regardless — inputs may arrive from future extractor/factory cycles
  const nextRun = eventTime + cycleMs;
  if (nextRun <= now) {
    queue.enqueue(nextRun, pin.pin_id);
  }
}

function pullFactoryInputs(factoryPin, pinMap, inboundRoutes, typeVolumes, schematicInputs) {
  const routes = inboundRoutes[factoryPin.pin_id] || [];
  for (const route of routes) {
    const sourcePin = pinMap[route.source_pin_id];
    if (!sourcePin || !isStoragePin(sourcePin)) continue;

    const typeId = route.content_type_id;
    const qty = route.quantity;
    if (!typeId || !qty) continue;

    const available = getContentAmount(sourcePin, typeId);
    const canAccept = canAcceptFactory(factoryPin, typeId, qty, schematicInputs);
    const transfer = Math.min(qty, available, canAccept);

    if (transfer > 0) {
      removeFromContents(sourcePin, typeId, transfer);
      addToContents(factoryPin, typeId, transfer);
      // Update source capacity
      const vol = getVolume(typeVolumes, typeId);
      if (sourcePin._capacityUsed !== undefined) {
        sourcePin._capacityUsed = Math.max(0, sourcePin._capacityUsed - vol * transfer);
      }
    }
  }
}

// ============== OUTPUT ROUTING ==============
// Routes output from a pin to downstream pins.
// Priority: factories first (sorted by input buffer fill), then storage (distributed evenly).

function routeOutput(sourcePin, typeId, quantity, pinMap, outboundRoutes, typeVolumes, schematicInputs) {
  const routes = (outboundRoutes[sourcePin.pin_id] || []).filter(r => r.content_type_id === typeId);
  if (routes.length === 0) {
    // No route — output stays in source pin buffer
    addToContents(sourcePin, typeId, quantity);
    return;
  }

  let remaining = quantity;

  // Separate factory routes from storage routes
  const factoryRoutes = [];
  const storageRoutes = [];
  for (const route of routes) {
    const destPin = pinMap[route.destination_pin_id];
    if (!destPin) continue;
    if (isFactoryPin(destPin)) {
      // Sort key: input buffer fill ratio (lower = more empty = higher priority)
      const inputs = schematicInputs[destPin.schematic_id || destPin.factory_details?.schematic_id];
      let fillRatio = 0;
      if (inputs) {
        let totalRatio = 0;
        for (const inp of inputs) {
          totalRatio += getContentAmount(destPin, inp.type_id) / inp.quantity;
        }
        fillRatio = totalRatio / inputs.length;
      }
      factoryRoutes.push({ route, destPin, sortKey: fillRatio });
    } else if (isStoragePin(destPin)) {
      const freeSpace = getStorageCapacity(destPin) - (destPin._capacityUsed || 0);
      storageRoutes.push({ route, destPin, sortKey: freeSpace });
    }
  }

  // Sort: factories by buffer fill (emptiest first), storage by free space (most free first)
  factoryRoutes.sort((a, b) => a.sortKey - b.sortKey);
  storageRoutes.sort((a, b) => b.sortKey - a.sortKey);

  // Route to factories first
  for (const { route, destPin } of factoryRoutes) {
    if (remaining <= 0) break;
    const accept = canAcceptFactory(destPin, typeId, Math.min(route.quantity, remaining), schematicInputs);
    if (accept > 0) {
      addToContents(destPin, typeId, accept);
      remaining -= accept;
    }
  }

  // Route remainder to storage pins (distributed evenly, like RIFT)
  const activeStorageRoutes = storageRoutes.filter(s => {
    const accept = canAcceptStorage(s.destPin, typeId, 1, typeVolumes);
    return accept > 0;
  });

  for (let i = 0; i < activeStorageRoutes.length && remaining > 0; i++) {
    const { route, destPin } = activeStorageRoutes[i];
    // Distribute evenly among remaining storage routes
    const maxAmount = Math.ceil(remaining / (activeStorageRoutes.length - i));
    const transfer = Math.min(route.quantity, remaining, maxAmount);
    const accepted = canAcceptStorage(destPin, typeId, transfer, typeVolumes);

    if (accepted > 0) {
      addToContents(destPin, typeId, accepted);
      const vol = getVolume(typeVolumes, typeId);
      if (destPin._capacityUsed !== undefined) {
        destPin._capacityUsed += vol * accepted;
      }
      remaining -= accepted;
    }
  }

  // Any remaining output stays in source pin
  if (remaining > 0) {
    addToContents(sourcePin, typeId, remaining);
  }
}

module.exports = { simulateColony };
