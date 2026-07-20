// A precise countdown clock driven by performance.now() and requestAnimationFrame.
//
// We track an absolute `endTime` rather than decrementing a counter on an
// interval, so the clock stays accurate even if frames are dropped, and a
// penalty is just "move the finish line 1 second closer". The rAF loop exists
// only to push smooth updates to the UI.

export class Countdown {
  /**
   * @param {object} opts
   * @param {number} opts.durationMs   starting time on the clock
   * @param {(remainingMs:number)=>void} [opts.onTick]  called every frame while running
   * @param {()=>void} [opts.onEnd]     called once when the clock hits zero
   */
  constructor({ durationMs, onTick, onEnd }) {
    this.durationMs = durationMs;
    this.onTick = onTick || (() => {});
    this.onEnd = onEnd || (() => {});

    this._remaining = durationMs; // authoritative when paused/not started
    this._endTime = 0; // performance.now() timestamp of zero, when running
    this._running = false;
    this._finished = false;
    this._rafId = 0;
    this._loop = this._loop.bind(this);
  }

  get remainingMs() {
    return this._running ? Math.max(0, this._endTime - performance.now()) : this._remaining;
  }

  get running() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._endTime = performance.now() + this._remaining;
    this._rafId = requestAnimationFrame(this._loop);
  }

  pause() {
    if (!this._running) return;
    this._remaining = this.remainingMs;
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  // Apply a time penalty (or bonus, with a negative value). Fires onEnd if it
  // pushes the clock to zero.
  adjust(deltaMs) {
    if (this._running) {
      this._endTime += deltaMs;
      if (this.remainingMs <= 0) this._finish();
    } else {
      this._remaining = Math.max(0, this._remaining + deltaMs);
      if (this._remaining <= 0) this._finish();
    }
  }

  _loop() {
    if (!this._running) return;
    const remaining = this.remainingMs;
    this.onTick(remaining);
    if (remaining <= 0) {
      this._finish();
      return;
    }
    this._rafId = requestAnimationFrame(this._loop);
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    this._running = false;
    this._remaining = 0;
    cancelAnimationFrame(this._rafId);
    this.onTick(0);
    this.onEnd();
  }
}
