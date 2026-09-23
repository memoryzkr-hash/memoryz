import { World3D } from './world';

let instance: World3D | null = null;

/** The single 3D world (one WebGL context for the whole app). */
export function world(): World3D {
  return (instance ??= new World3D());
}
