import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from '../../src/pages/BaseScreen.js';

class ScrollScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  open(maxSwipes: number): Promise<void> {
    return this.scrollAndClick('//android-target', '//ios-target', maxSwipes);
  }
}

function setup(platform: 'Android' | 'iOS', visibleAfter: number) {
  let swipes = 0;
  let clicks = 0;
  let releases = 0;
  const pauses: number[] = [];
  const gestures: unknown[] = [];
  const selectors: string[] = [];
  const target = {
    isDisplayed: async () => true,
    getLocation: async () => ({ x: 100, y: swipes >= visibleAfter ? 300 : 1_100 }),
    getSize: async () => ({ width: 200, height: 100 }),
    click: async () => { clicks++; }
  };
  _setGlobal('browser', {
    getWindowSize: async () => ({ width: 600, height: 1_000 }),
    performActions: async (actions: unknown) => {
      gestures.push(actions);
      swipes++;
    },
    releaseActions: async () => { releases++; },
    pause: async (duration: number) => { pauses.push(duration); }
  });
  _setGlobal('$$', async (selector: string) => {
    selectors.push(selector);
    return [target];
  });
  const screen = new ScrollScreen(new MobileSession(platform));
  return {
    screen, gestures, pauses, selectors,
    counts: () => ({ swipes, clicks, releases })
  };
}

test('clicks an already visible target without scrolling', async () => {
  const fixture = setup('Android', 0);
  await fixture.screen.open(10);
  assert.deepEqual(fixture.counts(), { swipes: 0, clicks: 1, releases: 0 });
});

test('uses a slow short swipe and stops immediately when the target reaches the viewport', async () => {
  const fixture = setup('Android', 1);
  await fixture.screen.open(10);
  assert.deepEqual(fixture.counts(), { swipes: 1, clicks: 1, releases: 1 });
  assert.deepEqual(fixture.pauses, [750]);
  assert.deepEqual(fixture.gestures, [[{
    type: 'pointer',
    id: 'scroll-finger',
    parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: 300, y: 500 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 200 },
      { type: 'pointerMove', duration: 1_500, x: 300, y: 350 },
      { type: 'pause', duration: 300 },
      { type: 'pointerUp', button: 0 }
    ]
  }]]);
});

test('does not click a displayed but off-screen element and respects the swipe limit', async () => {
  const fixture = setup('Android', Infinity);
  await assert.rejects(fixture.screen.open(2), /Element not found after 2 upward scrolls/);
  assert.deepEqual(fixture.counts(), { swipes: 2, clicks: 0, releases: 2 });
});

test('checks the target after the final permitted swipe on iOS', async () => {
  const fixture = setup('iOS', 2);
  await fixture.screen.open(2);
  assert.deepEqual(fixture.counts(), { swipes: 2, clicks: 1, releases: 2 });
  assert.ok(fixture.selectors.every(selector => selector === '//ios-target'));
});

test('rejects invalid swipe limits before sending any commands', async () => {
  const fixture = setup('Android', 0);
  for (const value of [-1, 1.5, Infinity, NaN]) {
    await assert.rejects(fixture.screen.open(value), /non-negative integer/);
  }
  assert.deepEqual(fixture.counts(), { swipes: 0, clicks: 0, releases: 0 });
  assert.deepEqual(fixture.selectors, []);
});
