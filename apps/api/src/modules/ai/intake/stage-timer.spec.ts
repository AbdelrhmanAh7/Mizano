import { StageTimer } from './stage-timer';

/** A fake clock that returns scripted readings, then repeats the last one. */
function scripted(...readings: number[]): () => number {
  let i = 0;
  return () => readings[Math.min(i++, readings.length - 1)];
}

describe('@issue-126 StageTimer', () => {
  it('records each stage as whole milliseconds from an injected clock', () => {
    const timer = new StageTimer(scripted(100, 1940, 1952, 1955));
    timer.start('extract');
    timer.start('parse');
    timer.start('validate');
    timer.stop();
    expect(timer.snapshot()).toEqual({ extract: 1840, parse: 12, validate: 3 });
  });

  it('rounds fractional readings and never reports a negative duration', () => {
    const timer = new StageTimer(scripted(10.2, 11.9, 5));
    timer.start('load');
    timer.start('extract');
    timer.stop();
    expect(timer.snapshot()).toEqual({ load: 2, extract: 0 });
  });

  it('records nothing for a stage that never started and ignores a second stop', () => {
    const timer = new StageTimer(scripted(0, 4));
    timer.stop();
    timer.start('load');
    timer.stop();
    timer.stop();
    expect(timer.snapshot()).toEqual({ load: 4 });
  });

  it('never throws when the clock fails; the affected stage is skipped', () => {
    let calls = 0;
    const timer = new StageTimer(() => {
      calls += 1;
      if (calls === 2) throw new Error('clock unavailable');
      return calls * 10;
    });
    expect(() => {
      timer.start('load'); // reading 10
      timer.start('extract'); // reading throws: load and extract are lost
      timer.start('parse'); // reading 30
      timer.stop(); // reading 40
    }).not.toThrow();
    expect(timer.snapshot()).toEqual({ parse: 10 });
  });

  it('skips non-finite readings', () => {
    const timer = new StageTimer(scripted(0, Number.NaN));
    timer.start('load');
    timer.stop();
    expect(timer.snapshot()).toEqual({});
  });

  it('returns a copy, so callers cannot alter recorded timings', () => {
    const timer = new StageTimer(scripted(0, 1));
    timer.start('load');
    timer.stop();
    timer.snapshot().load = 99;
    expect(timer.snapshot()).toEqual({ load: 1 });
  });

  it('skips a stage when the clock reads produce an infinite difference', () => {
    const timer = new StageTimer(scripted(-1e308, 1e308));
    expect(() => {
      timer.start('load');
      timer.stop();
    }).not.toThrow();
    expect(timer.snapshot()).toEqual({});
  });

  it('skips a single finite duration above the safe integer limit', () => {
    const timer = new StageTimer(scripted(0, Number.MAX_SAFE_INTEGER + 1));
    timer.start('load');
    timer.stop();
    expect(timer.snapshot()).toEqual({});
  });

  it('does not record a repeated stage whose total overflows Number.MAX_SAFE_INTEGER', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const timer = new StageTimer(scripted(0, max, 2 * max));
    timer.start('load'); // reading 0
    timer.start('load'); // reading max: records load = max
    timer.stop(); // reading 2 * max: max + max is not a safe integer, so it is dropped
    expect(timer.snapshot()).toEqual({ load: max });
  });
});
