import { planPassage } from '../core/passage-planner.js';
import { fetchWindGrid } from './wind.js';

export async function planPassageForBrowser({
  start, end, departureTime, basePolars, comfortParams,
  coastlineManager, routerOpts, roughRoute
}) {
  // The wind area must cover every point the passage can reach — a drawn course
  // that bulges around a headland can leave a start/end-only box.
  const pts = (Array.isArray(roughRoute) && roughRoute.length >= 2)
    ? roughRoute
    : [start, end];
  const area = {
    north: Math.max(...pts.map(p => p.lat)) + 0.5,
    south: Math.min(...pts.map(p => p.lat)) - 0.5,
    east: Math.max(...pts.map(p => p.lon)) + 0.5,
    west: Math.min(...pts.map(p => p.lon)) - 0.5
  };

  const endTime = new Date(new Date(departureTime).getTime() + 48 * 3600000).toISOString();
  const windGrid = await fetchWindGrid(area, departureTime, endTime);

  return planPassage({
    start, end, departureTime, basePolars, windGrid,
    comfortParams, roughRoute,
    coastlineCoarse: coastlineManager.getCoarseCoastline(),
    getFineCoastline: async (waypoints) => {
      await coastlineManager.prepareFineTiles(waypoints, 5);
      return coastlineManager.getSmartCoastline() || coastlineManager.getCoarseCoastline();
    },
    routerOpts
  });
}
