// Test-only Reactor transport. Real browser MediaStreams carry legibly labeled synthetic test frames.
export class Reactor {
  events = new Map();
  canvas = document.createElement('canvas');
  side = '';

  on(name, callback) {
    const handlers = this.events.get(name) ?? [];
    handlers.push(callback);
    this.events.set(name, handlers);
  }

  emit(name, ...args) {
    for (const callback of this.events.get(name) ?? []) callback(...args);
  }

  async connect() {
    const fixture = window.reactorFixture ??= { connections: 0, disconnects: 0, starts: 0, prompts: [] };
    fixture.connections++;
    fixture.drop = () => this.emit('error', { operation: 'readStream', code: 503,
      message: 'Fixture transport interrupted', recoverable: false });
    this.canvas.width = 320;
    this.canvas.height = 180;
    const ctx = this.canvas.getContext('2d');
    const paint = () => {
      ctx.fillStyle = '#ded6bb';
      ctx.fillRect(0, 0, 320, 180);
      if (this.side) {
        ctx.fillStyle = '#1163ce';
        ctx.fillRect(this.side === 'right' ? 180 : 22, 44, 118, 74);
      }
      ctx.fillStyle = '#212722';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('SYNTHETIC TEST FOOTAGE', 46, 145);
      ctx.fillText(String(Math.floor(performance.now() / 100)), 125, 167);
    };
    paint();
    this.stream = this.canvas.captureStream(15);
    this.timer = setInterval(paint, 65);
    this.emit('trackReceived', 'main_video', this.stream.getVideoTracks()[0], this.stream);
    this.emit('statusChanged', 'ready');
    this.emit('message', { type: 'state', data: { available_resolutions: ['720p'] } });
  }

  async sendCommand(command, data) {
    if (command === 'start') {
      window.reactorFixture.starts++;
      setTimeout(() => this.emit('message', { type: 'generation_started', data: {} }), 20);
    }
    if (command === 'set_prompt') {
      window.reactorFixture.prompts.push(data.prompt);
      // Deliberately differ from the first requested side to exercise human observation.
      if (data.prompt.includes('slides in')) this.side = 'right';
    }
  }

  async disconnect() {
    window.reactorFixture.disconnects++;
    clearInterval(this.timer);
    for (const track of this.stream.getTracks()) track.stop();
  }
}
