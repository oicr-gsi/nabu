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
*/

const addCaseArchives = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case')
    .set('content-type', 'application/json')
    .send(requestBody);
};


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
  it('it should retrieve an archive entry with case data for a given case identifier', (done) => {
    let caseIdentifier = 'R11_TEST_1000_Xy_Z';
    getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
      expect(res.status).to.equal(200);
      expect(res.body.caseIdentifier).to.be.equal(caseIdentifier);
      expect(res.body.commvaultBackupJobId).to.be.equal('CJ123');
      done();
    });
  });
  it('it should fail to retrieve an archive entry if no matching case identifier is found', (done) => {
    let caseIdentifier = 'R1_TEST_0000_Ab_C';
    //let caseIdentifier = '1; DROP TABLE archive;';
    getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
      expect(res.status).to.equal(404);
      expect(res.body).to.be.empty;
      done();
    });
  });
  it('it should create a case + archive entry', (done) => {
    let reqBody = {
      caseIdentifier: 'R22_TEST_0022_Bb_B',
      requisitionId: 22,
      limsIds: ['2222_1_LDI2222', '2222_1_LDI2323', '2222_1_LDI2442'],
      workflowRunIdsForOffsiteArchive: ['vidarr:research/run/asdf', 'vidarr:research/run/1234'],
      workflowRunIdsForVidarrArchival: ['vidarr:research/run/abba']
    };
    addCaseArchives(server, reqBody).end((err, res) => {
      expect(res.status).to.equal(201);
      done();
    });
  });
});
