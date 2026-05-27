import { hydraTool } from './hydra.js';
import { metasploitTool } from './metasploit.js';
import { nmapTool } from './nmap.js';
import { nucleiTool } from './nuclei.js';
import { searchsploitTool } from './searchsploit.js';
import { shellTool } from './shell.js';
import { gobusterTool, whatwebTool } from './web-enum.js';
import { INTENSITY_RANK, type Intensity, type ToolDefinition } from '../types.js';

const ALL_TOOLS: ToolDefinition[] = [
  nmapTool,
  nucleiTool,
  gobusterTool,
  whatwebTool,
  searchsploitTool,
  metasploitTool,
  hydraTool,
  shellTool,
];

export function toolsForIntensity(intensity: Intensity): ToolDefinition[] {
  const rank = INTENSITY_RANK[intensity];
  return ALL_TOOLS.filter((t) => INTENSITY_RANK[t.minIntensity] <= rank);
}

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
