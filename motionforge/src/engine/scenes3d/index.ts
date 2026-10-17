// Registry of Three.js cinematic scenes (see ../scene3d.ts).
import type { SceneDef } from '../scene3d';
import { productOrbit } from './productOrbit';
import { chromeLogo } from './chromeLogo';
import { liquidGlass } from './liquidGlass';
import { floatingUI } from './floatingUI';

export const SCENES3D: SceneDef[] = [productOrbit, chromeLogo, liquidGlass, floatingUI];
export const sceneById = (id: string) => SCENES3D.find((s) => s.id === id);
