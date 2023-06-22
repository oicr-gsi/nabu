'use strict';

require('dotenv').config({ path: __dirname + '/.env' }); // Use test-specific .env file
const chai = require('chai');
const expect = chai.expect;
const chaiExclude = require('chai-exclude');
const chaiHttp = require('chai-http');
const server = require('../app');
const cmd = require('node-cmd');

chai.use(chaiHttp);
chai.use(chaiExclude);

/**
const get = (server, path) => {
  return chai.request(server).get(path);
};
const addArchive = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/archive')
    .set('content-type', 'application/json')
    .send(requestBody);
};
*/

const getCaseByCaseIdentifier = (server, caseIdentifier = {}) => {
  return chai
    .request(server)
    .get('/case/' + caseIdentifier)
    .set('content-type', 'application/json')
    .send();
};

describe('case archive tracking', () => {
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });
  it('it should retrieve an archive entry with case data', (done) => {
    let caseIdentifier = 'R11_TEST_1000_Xy_Z';
    getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
      expect(res.status).to.equal(200);
      expect(res.body.caseIdentifier).to.be.equal(caseIdentifier);
      done();
    });
  });
});
