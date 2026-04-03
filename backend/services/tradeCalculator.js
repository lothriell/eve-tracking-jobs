/**
 * Trade Calculator — Pure calculation module
 * No DB calls, no ESI calls. Receives data, returns results.
 */

/**
 * Calculate effective broker fee percentage
 * Base: 3.0%, reduced by skills and standings, minimum 1.0%
 */
function calculateBrokerFee(brokerLevel = 0, advBrokerLevel = 0, factionStanding = 0, corpStanding = 0) {
  const base = 3.0;
  const skillReduction = brokerLevel * 0.3 + advBrokerLevel * 0.1;
  // Standing reduction (simplified EVE formula)
  const standingReduction = factionStanding * 0.03 + corpStanding * 0.02;
  return Math.max(1.0, base - skillReduction - standingReduction);
}

/**
 * Calculate effective sales tax percentage
 * Base: 3.6%, reduced by 0.6% per Accounting level, minimum 0%
 */
function calculateSalesTax(accountingLevel = 0) {
  return Math.max(0, 3.6 - accountingLevel * 0.6);
}

/**
 * Find trade opportunities between source and destination hubs
 *
 * @param {Object} sourcePrices - { type_id: { sell_min, buy_max, sell_volume, buy_volume, ... } }
 * @param {Object} destPrices - same format
 * @param {Object} settings - { brokerFee, salesTax } (percentages)
 * @param {string} tradeType - 'A' (buy order arb) or 'B' (instant relist)
 * @param {Object} filters - { minROI, minProfit, maxPrice, minVolume, limit }
 * @returns {Array} sorted trade opportunities
 */
function findTradeOpportunities(sourcePrices, destPrices, settings = {}, tradeType = 'B', filters = {}) {
  const brokerFee = (settings.brokerFee || 3.0) / 100;
  const salesTax = (settings.salesTax || 3.6) / 100;
  const opportunities = [];

  // Find types present in both hubs
  const sourceTypes = Object.keys(sourcePrices).map(Number);
  const destTypes = new Set(Object.keys(destPrices).map(Number));

  for (const typeId of sourceTypes) {
    if (!destTypes.has(typeId)) continue;

    const src = sourcePrices[typeId];
    const dst = destPrices[typeId];

    let buyPrice, sellPrice;

    if (tradeType === 'A') {
      // Type A: Place buy order at source, sell at destination
      buyPrice = src.buy_max;     // What buy orders are paying at source
      sellPrice = dst.sell_min;   // Undercut lowest sell at destination
    } else {
      // Type B: Buy instantly at source sell_min, relist at destination sell_min
      buyPrice = src.sell_min;    // Instant buy at source
      sellPrice = dst.sell_min;   // Undercut lowest sell at destination
    }

    // Skip invalid prices
    if (!buyPrice || buyPrice <= 0 || !sellPrice || sellPrice <= 0) continue;
    if (buyPrice >= sellPrice) continue; // No margin

    // Calculate fees
    const buyBrokerFee = buyPrice * brokerFee;
    const sellBrokerFee = sellPrice * brokerFee;
    const sellTax = sellPrice * salesTax;

    const grossMargin = sellPrice - buyPrice;
    const totalFees = buyBrokerFee + sellBrokerFee + sellTax;
    const netProfit = grossMargin - totalFees;

    if (netProfit <= 0) continue;

    const roi = (netProfit / buyPrice) * 100;
    const destVolume = dst.sell_volume + dst.buy_volume;

    // Apply filters
    if (filters.minROI && roi < filters.minROI) continue;
    if (filters.minProfit && netProfit < filters.minProfit) continue;
    if (filters.maxPrice && buyPrice > filters.maxPrice) continue;
    if (filters.minVolume && destVolume < filters.minVolume) continue;

    opportunities.push({
      type_id: typeId,
      buy_price: Math.round(buyPrice * 100) / 100,
      sell_price: Math.round(sellPrice * 100) / 100,
      gross_margin: Math.round(grossMargin * 100) / 100,
      broker_fees: Math.round((buyBrokerFee + sellBrokerFee) * 100) / 100,
      sales_tax: Math.round(sellTax * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      source_volume: src.sell_volume + src.buy_volume,
      dest_volume: destVolume,
      source_sell_volume: src.sell_volume,
      dest_sell_volume: dst.sell_volume,
    });
  }

  // Sort by ROI descending
  opportunities.sort((a, b) => b.roi - a.roi);

  // Apply limit
  const limit = filters.limit || 100;
  return opportunities.slice(0, limit);
}

module.exports = {
  calculateBrokerFee,
  calculateSalesTax,
  findTradeOpportunities
};
