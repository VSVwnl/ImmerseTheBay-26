import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XRInput } from '../src/input/xr';
import { createXrConsole } from '../src/recovery/xr-console';
import type { RecoveryAction } from '../src/recovery/hud';
import type { Core } from '../src/core';
import { Panel } from '../src/ui/panels';

function devices() {
  const hands = [new THREE.Group(), new THREE.Group()];
  const rays = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const reference = {};
  const renderer = { xr: {
    getHand: (index: number) => hands[index],
    getController: (index: number) => rays[index],
    getControllerGrip: (index: number) => grips[index],
    getReferenceSpace: () => reference,
    isPresenting: true,
  } } as unknown as THREE.WebGLRenderer;
  const input = new XRInput(renderer);
  function connect(index: number, source: Partial<XRInputSource>) {
    rays[index].dispatchEvent({ type: 'connected', data: source } as never);
  }
  return { input, renderer, rays, grips, hands, connect, reference };
}

function fakeDocument() {
  const paint = {
    clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
  };
  vi.stubGlobal('document', {createElement: () => ({
    width: 0, height: 0, dataset: {}, style: {}, classList: {add() {}},
    getContext: () => paint, appendChild() {}, replaceChildren() {}, addEventListener() {},
  })});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Panel.inScene = false;
});

describe('recovery input in the local-floor reference space', () => {
  it('preserves partial samples and reads tracked joints from the current frame', () => {
    const {input, connect, reference} = devices();
    const jointSpaces = new Map(['wrist', 'thumb-tip', 'index-finger-tip'].map(name => [name, {name}]));
    connect(1, {handedness:'right', hand:jointSpaces as unknown as XRHand});
    const orientation = {x:0, y:Math.SQRT1_2, z:0, w:Math.SQRT1_2};
    const positions = new Map([
      ['wrist', {x:0.11, y:0.93, z:-0.41}],
      ['thumb-tip', {x:0.12, y:1.0, z:-0.46}],
      ['index-finger-tip', {x:0.16, y:1.0, z:-0.46}],
    ]);
    const getJointPose = vi.fn((space: {name:string}, relativeTo: unknown) => {
      expect(relativeTo).toBe(reference);
      const position = positions.get(space.name);
      return position ? {transform:{position, orientation}} : null;
    });
    const frame = {getJointPose} as unknown as XRFrame;
    expect(input.rawHand(frame)).toEqual({
      tracked:true, wrist:{position:[0.11,0.93,-0.41], orientation:[0,Math.SQRT1_2,0,Math.SQRT1_2]},
      thumbTip:[0.12,1,-0.46], indexTip:[0.16,1,-0.46],
      thumbTipOrientation:[0,Math.SQRT1_2,0,Math.SQRT1_2], indexTipOrientation:[0,Math.SQRT1_2,0,Math.SQRT1_2],
    });
    positions.delete('thumb-tip');
    const partial = input.rawHand(frame);
    expect(partial.tracked).toBe(false);
    expect(partial.thumbTip).toBeNull();
    expect(partial.thumbTipOrientation).toBeNull();
    expect(partial.indexTip).toEqual([0.16,1,-0.46]);
    expect(input.rawHand(undefined).wrist).toBeNull();
  });

  it('stops controller motion and panel pokes when Quest loses those poses', () => {
    const {input, connect, grips, rays} = devices();
    connect(0, {handedness:'right', gamepad:{buttons:[{value:1}]} as unknown as Gamepad});
    grips[0].position.set(0.1, 1, -0.4);
    input.update(1/72);
    expect(input.active).toBe(true);
    expect(input.action()?.grip).toBe(1);
    grips[0].visible = false;
    rays[0].visible = false;
    input.update(1/72);
    expect(input.active).toBe(false);
    expect(input.pokeTips()).toHaveLength(0);
    grips[0].visible = true;
    input.update(1/72);
    expect(input.active).toBe(true);
  });

  it('ignores previously visible fingertips while the runtime hides their hand space', () => {
    const {input, connect, hands} = devices();
    connect(1, {handedness:'right', hand:{} as XRHand});
    const thumb = new THREE.Group(), index = new THREE.Group();
    thumb.position.set(0.09,1,-0.4);
    index.position.set(0.11,1,-0.4);
    hands[1].add(thumb,index);
    Object.assign(hands[1], {joints:{'thumb-tip':thumb,'index-finger-tip':index}});
    input.update(1/72);
    expect(input.active).toBe(true);
    hands[1].visible = false;
    input.update(1/72);
    expect(input.active).toBe(false);
    expect(input.pokeTips()).toHaveLength(0);
  });
});

describe('recovery headset console', () => {
  it('reserves the right hand for guiding the arm, while the left can still select station controls', () => {
    fakeDocument();
    const {renderer,input,rays,connect} = devices();
    const scene = new THREE.Scene();
    scene.add(input.group);
    connect(0,{handedness:'right'});
    connect(1,{handedness:'left'});
    const send = vi.fn<(action:RecoveryAction)=>void>();
    const panelSync = vi.spyOn(Panel.prototype,'sync');
    const panel = createXrConsole({renderer,scene} as Core, input, document.createElement('canvas'), send);
    const recording = {phase:'teaching', available:['reset']} as const;
    panel.update(recording,false,100);
    const controls = panelSync.mock.contexts.find((p): p is Panel => p instanceof Panel && p.name==='recovery-control')!;
    const reset = controls.buttonWorld('reset')!;
    expect(reset).toBeTruthy();
    const aim = (pointer:THREE.Group) => {
      pointer.position.set(0,1.4,0);
      const direction=reset.clone().sub(pointer.position).normalize();
      pointer.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
      scene.updateMatrixWorld(true);
      pointer.dispatchEvent({type:'selectstart'} as never);
    };
    aim(rays[0]);
    expect(send).not.toHaveBeenCalled();
    aim(rays[1]);
    expect(send.mock.calls).toEqual([['reset']]);
  });

  it('marks the actual half of the frozen image hit by a select ray', () => {
    fakeDocument();
    const {renderer,input,rays,connect} = devices();
    const scene = new THREE.Scene();
    scene.add(input.group);
    connect(0, {handedness:'left'});
    const send = vi.fn<(action:RecoveryAction)=>void>();
    const panel = createXrConsole({renderer,scene} as Core, input, document.createElement('canvas'), send);
    panel.update({available:['confirm-left','confirm-right'], mode:'live'}, true, 1);
    const monitor = scene.children.find(o => o instanceof THREE.Mesh &&
      o.geometry instanceof THREE.PlaneGeometry && !o.name) as THREE.Mesh;
    expect(monitor).toBeDefined();
    const pointer = rays[0];
    pointer.position.set(0, 1.55, 0);
    const forward = new THREE.Vector3(0,0,-1);
    function selectAt(localX:number) {
      const point = monitor.localToWorld(new THREE.Vector3(localX,0,0));
      pointer.quaternion.setFromUnitVectors(forward, point.sub(pointer.position).normalize());
      scene.updateMatrixWorld(true);
      pointer.dispatchEvent({type:'selectstart'} as never);
    }
    selectAt(-0.1);
    selectAt(0.1);
    expect(send.mock.calls).toEqual([['confirm-left'],['confirm-right']]);
    pointer.visible=false;
    selectAt(0.1);
    expect(send.mock.calls).toHaveLength(2);
  });
});
