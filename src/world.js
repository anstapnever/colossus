import * as THREE from 'three';
import { skyMaterial } from './bgmaterials.js';
import { ENV } from './passes-env.js';
import { makeClouds } from './world-sky.js';
import { onThrees } from './util.js';

// World department (lead): the sky dome only. Town, wall and fields belong to town.js.
export async function buildWorld(ctx) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8500, 48, 24), skyMaterial(makeClouds()));
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noShadow = true;
  ctx.scene.add(sky);
  const au = ctx.engine.mAtmos.uniforms, su = sky.material.uniforms;
  au.uHazeCool = su.uHorizonCool; au.uHazeWarm = su.uHorizonWarm;
  const world = {
    sky,
    update(st) {
      ENV.uEnvTime.value = onThrees(st.t);
      sky.position.copy(ctx.camera.position);
    },
  };
  ctx.world = world;
  return world;
}
