export type Part = { name: string; points: number[][]; step?: string; stl?: string };
export type Joint = { part1: string; part2: string; p1: [number,number]; p2: [number,number]; fixed: boolean };
export type Pose = { x: number; y: number; rotation: number };
export type Keyframes = { [part_name: string]: Pose[] };