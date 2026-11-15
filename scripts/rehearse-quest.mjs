// Optional device-level practice check. Run npm run dev first, then
// node scripts/rehearse-quest.mjs /path/to/iwer-2.8.0/package/build/iwer.min.js
// IWER is a test-only input supplied by the caller. The game ships no emulator.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const bundlePath = process.argv[2];
if (!bundlePath) throw new Error('Pass the path to Meta IWER 2.8.0 build/iwer.min.js');
const bundle = await readFile(bundlePath, 'utf8');
const output = 'e2e-shots/soundings-emulated';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(25_000);
  // A local edit during the two dives must not reload the pilot station.
  // Practice telemetry uses HTTP; this intercepts only Vite's HMR socket.
  await page.routeWebSocket(url => url.searchParams.has('token') && url.port === '5173', socket => {
    socket.send(JSON.stringify({type:'connected'}));
  });
  await page.addInitScript({content: bundle + `
    window.qaQuest = new IWER.XRDevice(IWER.metaQuest3);
    qaQuest.installRuntime({forceInstall:true});
    qaQuest.primaryInputMode = 'controller';
  `});
  await page.goto('http://127.0.0.1:5173/?orbis=0');
  await page.waitForFunction(() => window.__soundings);
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const module = name => import(resources.find(url => new URL(url).pathname.endsWith(name)));
    const {Panel} = await module('/src/ui/panels.ts');
    const {armBase,lampAt} = await module('/src/soundings/mission.ts');
    // Read button locations and socket geometry. Every action is sent through
    // the emulated WebXR input source, including reset and the rig changes.
    const panels = {};
    const sync = Panel.prototype.sync;
    Panel.prototype.sync = function () {
      panels[this.name] = this;
      return sync.call(this);
    };
    const device = window.qaQuest;
    const state = () => window.__soundings.snapshot();
    const frames = async count => {
      for (let i=0; i<count; i++) await new Promise(resolve => device.activeSession.requestAnimationFrame(resolve));
    };
    const aimRay = (point,origin) => {
      const c = device.controllers.left;
      c.position.set(...origin);
      const [x,y,z] = point.map((v,i) => v-origin[i]);
      const distance = Math.hypot(x,y,z);
      // Shortest rotation taking the controller's -Z ray to the target.
      const q = [y/distance,-x/distance,0,1-z/distance], norm = Math.hypot(...q);
      c.quaternion.set(...q.map(v => v/norm));
    };
    const button = (label, name='instruments') => {
      const point = panels[name]?.buttonWorld(label);
      if (!point) throw new Error('Missing immersive button: '+label);
      return point.toArray();
    };
    const trigger = async value => {
      device.controllers.left.updateButtonValue('trigger',value);
      await frames(5);
    };
    const click = async label => {
      aimRay(button(label),[-.25,1.35,-.18]);
      await frames(5);
      await trigger(1);
      await trigger(0);
    };
    const dragLamp = async destination => {
      const rig = state().rig;
      const origin = [0,1.12,-.65];
      aimRay(lampAt(rig),origin);
      await frames(5);
      await trigger(1);
      aimRay(armBase({...rig,arm:destination}),origin);
      await frames(5);
      await trigger(0);
    };
    const neutral = [.16,1.25,-.40];
    let rightPosition = [...neutral];
    const left = device.hands.left, right = device.hands.right;
    const initHands = async () => {
      device.primaryInputMode='hand';
      rightPosition=[...neutral];
      right.poseId='open';
      left.poseId='point';
      left.setPin({anchor:'index-tip',target:[-.30,1.26,-.27]});
      right.setPinchValueImmediate(0);
      right.setPin({anchor:'grasp',target:rightPosition});
      await frames(12);
    };
    const press = async (label,panel) => {
      left.setPin({anchor:'index-tip',target:button(label,panel)});
      await frames(6);
      left.setPin({anchor:'index-tip',target:[-.30,1.26,-.27]});
      await frames(6);
    };
    const drive = async (point,stopOnContact=false) => {
      const initialPhase=state().phase;
      for(let i=0; i<12; i++){
        const current=state();
        if(stopOnContact && current.phase!==initialPhase)return;
        if(Math.hypot(...point.map((v,j)=>v-current.tip[j])) < .015)return;
        const scale=[-1.65,1.35,-1.55];
        rightPosition=rightPosition.map((v,j)=>v+(point[j]-current.target[j])/scale[j]);
        right.setPin({anchor:'grasp',target:rightPosition});
        await frames(10);
      }
      throw new Error('Hand could not reach target: '+JSON.stringify({point,state:state()}));
    };
    window.qaDive={frames,panelsReady:()=>!!panels.instruments,state,click,dragLamp,initHands,press,drive,
      pinch:async value=>{right.setPinchValueImmediate(value);await frames(12);}};
  });
  await page.locator('[data-action=xr]').click();
  await page.waitForFunction(() => window.qaQuest.activeSession && window.qaDive.panelsReady());
  await page.screenshot({path:output+'/bench.jpg',quality:83});
  await page.evaluate(async () => {
    await qaDive.dragLamp('port');
    if(qaDive.state().rig.lamp!=='inner')throw Error('Occupied arm rail accepted the lamp');
    await qaDive.dragLamp('starboard');
    if(qaDive.state().rig.lamp!=='starboard')throw Error('Controller did not seat the lamp on the open rail');
    await qaDive.click('Aim ahead');
    if(qaDive.state().rig.aim!=='forward')throw Error('Controller ray missed the aim control');
  });
  for (let run = 1; run <= 2; run++) {
    await page.evaluate(async first => {
      await qaDive.initHands();
      if (!first) await qaDive.press('Rail light');
      await qaDive.press('Aim inward');
      await qaDive.press('Dock check');
      if(qaDive.state().phase!=='dock')throw Error('Dock check did not start');
      await qaDive.drive(qaDive.state().handle,true);
      await qaDive.frames(5);
      if(!qaDive.state().dockDone)throw Error('Dock handle contact did not register');
      await qaDive.press('Clear view');
      await qaDive.press('Launch dive');
      await qaDive.press('ring');
      await qaDive.press('Steer water');
      if(!qaDive.state().waterTest)throw Error('Water comparison did not lock');
      const before=qaDive.state();
      qaQuest.position.x=.10;
      await qaDive.frames(8);
      const after=qaDive.state();
      if(JSON.stringify(after.tip)!==JSON.stringify(before.tip) || after.elapsedS!==before.elapsedS)
        throw Error('Moving the headset advanced the held robot pose');
      qaQuest.position.x=0;
    }, run===1);
    if(run===1)await page.screenshot({path:output+'/pilot.jpg',quality:83});
    await page.evaluate(async () => {
      await qaDive.press('Capture water');
      if(qaDive.state().waterTest)throw Error('Second water frame was not captured');
      const {handle,cradle}=qaDive.state();
      await qaDive.drive(handle);
      await qaDive.pinch(1);
      if(!qaDive.state().held)throw Error('Tracked pinch did not grasp recorder');
      await qaDive.drive([handle[0],1.16,handle[2]]);
      await qaDive.drive([cradle[0],1.16,cradle[2]]);
      await qaDive.pinch(0);
      if(qaDive.state().phase!=='debrief')throw Error('Recorder did not land in cradle');
      await qaDive.press('Compare water');
    });
    if(run===1)await page.screenshot({path:output+'/debrief.jpg',quality:83});
    const record=await page.evaluate(()=>{
      const r=window.__soundings.lastRecord();
      return {outcome:r.outcome,input:r.input,source:r.comparison.source,frames:r.samples.length,
        waterPairs:r.waterTests.length,session:r.sessionId};
    });
    assert.equal(record.outcome,'recovered');
    assert.equal(record.input,'hand');
    assert.equal(record.source,'practice');
    assert.equal(record.waterPairs,1);
    assert(record.frames>0);
    await page.evaluate(()=>qaDive.press('reset','operation'));
    const reset=await page.evaluate(()=>qaDive.state());
    assert.equal(reset.phase,'rig');
    assert.equal(reset.dockDone,false);
    assert.equal(reset.rig.lamp,'inner');
    console.log('Emulated Quest recovery',run,record);
  }
  await page.evaluate(()=>qaQuest.activeSession.end());
  assert.deepEqual(errors,[]);
  console.log('Two emulated practice runs passed. Screenshots in '+output);
} finally {
  await browser.close();
}
