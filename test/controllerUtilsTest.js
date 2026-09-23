'use strict';

const chai = require('chai');
const expect = chai.expect;
const { EventEmitter } = require('events');
const rewire = require('rewire');

// rewire (rather than a plain require) so the test can shrink the inactivity
// window down from its real 60s default to something a test can wait out.
const controllerUtils = rewire('../utils/controllerUtils');
const streamResponse = controllerUtils.streamResponse;

// A stand-in for the pg-query-stream instance streamResponse is handed. Real streams
// emit 'close' as part of destroy(); reproduce that so the code under test can rely on
// it to clear its inactivity timer, same as it would against the real stream.
const makeFakeDbStream = () => {
  const stream = new EventEmitter();
  stream.destroyed = false;
  stream.destroy = function (err) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyReason = err;
    if (err) this.emit('error', err);
    this.emit('close');
  };
  return stream;
};

// Mirrors how pg-promise's db.stream(query, fn) behaves: fn(stream) is invoked
// synchronously to let the caller attach listeners, and the returned promise
// settles when the stream ends or errors.
const makeDaoFn = (stream) => (fn) => {
  fn(stream);
  return new Promise((resolve, reject) => {
    stream.on('end', () => resolve({ processed: 0, duration: 0 }));
    stream.on('error', (err) => reject(err));
  });
};

const makeReq = () => new EventEmitter();

const makeRes = () => ({
  writableEnded: false,
  statusCode: undefined,
  status (code) {
    this.statusCode = code;
    return this;
  },
  end () {
    this.writableEnded = true;
    return this;
  },
});

const makeLogger = () => {
  const calls = { info: [], error: [] };
  return {
    info: (msg) => calls.info.push(msg),
    error: (msg) => calls.error.push(msg),
    calls: calls,
  };
};

const noopTransformAndSend = () => () => {};

describe('streamResponse inactivity/disconnect handling', () => {
  let originalTimeout;

  before(() => {
    originalTimeout = controllerUtils.__get__('STREAM_INACTIVITY_TIMEOUT_MS');
  });

  afterEach(() => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', originalTimeout);
  });

  it('destroys the stream if no data arrives within the inactivity window', (done) => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', 40);
    const stream = makeFakeDbStream();
    const req = makeReq();
    const res = makeRes();
    const logger = makeLogger();

    streamResponse(
      req,
      res,
      makeDaoFn(stream),
      noopTransformAndSend,
      'testMethod',
      logger
    );

    setTimeout(() => {
      expect(stream.destroyed).to.equal(true);
      expect(stream.destroyReason.message).to.match(/produced no data/);
      expect(logger.calls.error).to.have.lengthOf(0);
      done();
    }, 100);
  });

  it('does not destroy the stream as long as data keeps arriving', (done) => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', 60);
    const stream = makeFakeDbStream();
    const req = makeReq();
    const res = makeRes();
    const logger = makeLogger();

    streamResponse(
      req,
      res,
      makeDaoFn(stream),
      noopTransformAndSend,
      'testMethod',
      logger
    );

    // Emit rows more frequently than the inactivity window, simulating healthy progress.
    const rowInterval = setInterval(() => stream.emit('data', { row: 1 }), 25);

    setTimeout(() => {
      clearInterval(rowInterval);
      expect(stream.destroyed).to.equal(false);
      stream.emit('end');
      done();
    }, 150);
  });

  it('destroys the stream on client disconnect independent of the inactivity timer', (done) => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', 1000);
    const stream = makeFakeDbStream();
    const req = makeReq();
    const res = makeRes();
    const logger = makeLogger();

    streamResponse(
      req,
      res,
      makeDaoFn(stream),
      noopTransformAndSend,
      'testMethod',
      logger
    );

    req.emit('close');

    setTimeout(() => {
      expect(stream.destroyed).to.equal(true);
      expect(stream.destroyReason.message).to.equal(
        'Client disconnected; destroying stream'
      );
      expect(logger.calls.error).to.have.lengthOf(0);
      done();
    }, 20);
  });

  it('does not destroy the stream after a clean disconnect once it has already ended', (done) => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', 30);
    const stream = makeFakeDbStream();
    const req = makeReq();
    const res = makeRes();
    const logger = makeLogger();

    streamResponse(
      req,
      res,
      makeDaoFn(stream),
      noopTransformAndSend,
      'testMethod',
      logger
    );

    stream.emit('data', {});
    stream.emit('end');

    // Even though STREAM_INACTIVITY_TIMEOUT_MS has elapsed since the last 'data' event,
    // the 'end' handler should have cleared the timer already.
    setTimeout(() => {
      expect(stream.destroyed).to.equal(false);
      done();
    }, 60);
  });

  it('still surfaces a genuine stream error as an error log and a 500 response', (done) => {
    controllerUtils.__set__('STREAM_INACTIVITY_TIMEOUT_MS', 1000);
    const stream = makeFakeDbStream();
    const req = makeReq();
    const res = makeRes();
    const logger = makeLogger();

    streamResponse(
      req,
      res,
      makeDaoFn(stream),
      noopTransformAndSend,
      'testMethod',
      logger
    );

    stream.destroy(new Error('connection terminated unexpectedly'));

    setTimeout(() => {
      expect(logger.calls.error).to.have.lengthOf(1);
      expect(res.statusCode).to.equal(500);
      expect(res.writableEnded).to.equal(true);
      done();
    }, 20);
  });
});
