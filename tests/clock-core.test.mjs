import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectTime, parseWorldDateTime, formatWorldDateTime,
  crossedHalfDayBoundary, sanitizeRate
} from '../scripts/clock-core.mjs';

test('relógio pausado não avança', () => {
  assert.equal(projectTime({gameTimeMs: 100000,wallTimeMs: 1000,rate: 100,running: false}, 11000), 100000);
});

test('tempo 60x avança 1 minuto a cada segundo', () => {
  assert.equal(projectTime({gameTimeMs: 100000,wallTimeMs: 1000,rate: 60,running: true}, 2000), 160000);
});

test('badalada ao passar 11:59 para 12:00', () => {
  const before = Date.UTC(2026,9,17,11,59,59);
  assert.ok(crossedHalfDayBoundary(before, before+1000) !== null);
});

test('badalada ao passar 23:59 para 00:00', () => {
  const before = Date.UTC(2026,9,17,23,59,59);
  assert.ok(crossedHalfDayBoundary(before, before+1000) !== null);
});

test('não toca ao retroceder nem entre 12:01 e 12:02', () => {
  const a = Date.UTC(2026,9,17,12,1,0);
  assert.equal(crossedHalfDayBoundary(a,a+60000), null);
  assert.equal(crossedHalfDayBoundary(a,a-60000), null);
});

test('date/time mantém horário sem deslocamento de fuso', () => {
  const ms = parseWorldDateTime('2026-10-17T12:30');
  assert.equal(ms, Date.UTC(2026,9,17,12,30));
  assert.equal(formatWorldDateTime(ms).time, '12:30:00');
  assert.equal(formatWorldDateTime(ms).date, '17/10/2026');
});

test('datas inválidas não normalizam silenciosamente', () => {
  assert.equal(parseWorldDateTime('2026-02-30T18:00'), null);
  assert.equal(parseWorldDateTime('2026-12-03T24:00'), null);
});

test('multiplicadores fora da faixa não são aceitos', () => {
  assert.equal(sanitizeRate('0'), null);
  assert.equal(sanitizeRate('3601'), null);
  assert.equal(sanitizeRate('60'), 60);
});
