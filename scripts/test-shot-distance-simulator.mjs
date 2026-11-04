import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const portal = readFileSync(new URL('../index3.html', import.meta.url), 'utf8');
const appUrl = new URL('../shot-distance-simulator/dist/index.html', import.meta.url);

test('simulator icon precedes today match entry inside player match preparation', () => {
  const playerStart = portal.indexOf('<section id="playerPortal">');
  const matchStart = portal.indexOf('시합준비 (', playerStart);
  const simulatorStart = portal.indexOf('id="shotDistanceSimulatorLink"', matchStart);
  const todayStart = portal.indexOf('오늘경기데이터 입력', matchStart);
  const boardStart = portal.indexOf('id="phaseBoard"', matchStart);
  assert(playerStart >= 0 && matchStart > playerStart);
  assert(simulatorStart > matchStart && todayStart > simulatorStart && boardStart > todayStart);
  const link = portal.slice(portal.lastIndexOf('<a ', simulatorStart), portal.indexOf('</a>', simulatorStart));
  assert.match(link, /href="\.\/shot-distance-simulator\/dist\/index\.html"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /aria-label="샷거리시뮬레이터 열기 \(새 탭\)"/);
  assert.match(link, /<svg aria-hidden="true"/);
});

test('built simulator ships relative local JS and CSS without a preview-server dependency', () => {
  const html = readFileSync(appUrl, 'utf8');
  assert.match(html, /SY-Shot Distance Estamater ver26\.1104-1f-ad/);
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert(assets.some(asset => asset.endsWith('.js')));
  assert(assets.some(asset => asset.endsWith('.css')));
  for (const asset of assets) {
    const url = new URL(asset, appUrl);
    assert(existsSync(url), `Missing built asset: ${asset}`);
    const content = readFileSync(url, 'utf8');
    assert.doesNotMatch(content, /127\.0\.0\.1:5174|localhost:5174|Users[\\/].*Downloads/);
    if (asset.endsWith('.js')) {
      assert.match(content, /환경반영 예상캐리/);
      assert.match(content, /위에서 보기/);
      assert.match(content, /sy-shot-personal-clubs-v1/);
    }
  }
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
});
