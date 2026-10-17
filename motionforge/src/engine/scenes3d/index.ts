// Registry of Three.js cinematic scenes (see ../scene3d.ts).
import type { SceneDef } from '../scene3d';
import { productOrbit } from './productOrbit';
import { chromeLogo } from './chromeLogo';
import { liquidGlass } from './liquidGlass';
import { floatingUI } from './floatingUI';
import { hrPack } from './hrPack';
import { story2d } from './story2d';

export const SCENES3D: SceneDef[] = [productOrbit, chromeLogo, liquidGlass, floatingUI, hrPack, story2d];
export const sceneById = (id: string) => SCENES3D.find((s) => s.id === id);
