import { planPassage } from '../core/passage-planner.js';
import { fetchWindGrid } from './wind.js';

export async function planPassageForBrowser({
  start, end, departureTime, basePolars, comfortParams,
  coastlineManager, routerOpts
}) {
  const area = {
    north: Math.max(start.lat, end.lat) + 0.5,
    south: Math.min(start.lat, end.lat) - 0.5,
    east: Math.max(start.lon, end.lon) + 0.5,
    west: Math.min(start.lon, end.lon) - 0.5
  };

  const endTime = new Date(new Date(departureTime).getTime() + 48 * 3600000).toISOString();
  const windGrid = await fetchWindGrid(area, departureTime, endTime);

  return planPassage({
    start, end, departureTime, basePolars, windGrid,
    comfortParams,
    coastlineCoarse: coastlineManager.getCoarseCoastline(),
    getFineCoastline: async (waypoints) => {
      await coastlineManager.prepareFineTiles(waypoints, 5);
      return coastlineManager.getSmartCoastline() || coastlineManager.getCoarseCoastline();
    },
    routerOpts
  });
}
