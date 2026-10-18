// Registry of Three.js cinematic scenes (see ../scene3d.ts).
import type { SceneDef } from '../scene3d';
import { productOrbit } from './productOrbit';
import { chromeLogo } from './chromeLogo';
import { liquidGlass } from './liquidGlass';
import { floatingUI } from './floatingUI';
import { hrPack } from './hrPack';
import { story2d } from './story2d';
import { pastel3d } from './pastel3d';
import { glowUI } from './glowUI';


export const SCENES3D: SceneDef[] = [productOrbit, chromeLogo, liquidGlass, floatingUI, hrPack, story2d, pastel3d, glowUI];
export const sceneById = (id: string) => SCENES3D.find((s) => s.id === id);
