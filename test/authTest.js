'use strict';

require('dotenv').config({ path: __dirname + '/.env' }); // Use test-specific .env file
const chai = require('chai');
const expect = chai.expect;
const chaiExclude = require('chai-exclude');
const chaiHttp = require('chai-http');
const server = require('../app');
const cmd = require('node-cmd');
const urls = require('../utils/urlSlugs');

chai.use(chaiHttp);
chai.use(chaiExclude);

const testingToken =
  'wdew0h5hoxvraj1xhrzix4j6nbswhh-oiq8ipt84uj1zkwq8sx0yvfmvfw6no';

const addSignoffSpecifyAuth = (
  server,
  caseIdentifier,
  token,
  requestBody = {}
) => {
  return chai
    .request(server)
    .post('/case/' + caseIdentifier + '/sign-off')
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const addBatchSignoffsSpecifyAuth = (server, token, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case/sign-off')
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const getSignoffsByCaseIdentifierSpecifyAuth = (
  server,
  caseIdentifier = {},
  token
) => {
  return chai
    .request(server)
    .get('/case/' + caseIdentifier + '/sign-off')
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send();
};

const getTokenSpecifyAuth = (server, token, requestBody = {}) => {
  return chai
    .request(server)
    .post('/token')
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const addCaseArchivesSpecifyAuth = (server, token, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case')
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const updateCaseArchivesSpecifyAuth = (
  server,
  token,
  caseIdentifier,
  operationSlug,
  requestBody = {}
) => {
  let url = `/case/${caseIdentifier}/${operationSlug}`;
  return chai
    .request(server)
    .put(url)
    .set('X-API-KEY', token)
    .set('content-type', 'application/json')
    .send(requestBody);
};

describe('API authorization tests', () => {
  before(function () {
    this.timeout(10000);
    cmd.runSync('npm run fw:test-clean; npm run fw:test-migrate');
  });

  //this describe must be run syncronously
  describe('auth token operations', () => {
    it('it should create an api-key', (done) => {
      let reqBody = {
        username: 'testuser',
      };
      getTokenSpecifyAuth(server, testingToken, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.property('X-API-KEY');
        done();
      });
    });
    it('it should fail to create a new api-key when there is an unregistered api-key in header', (done) => {
      let reqBody = {
        username: 'testuser',
      };
      getTokenSpecifyAuth(server, 'sadfkjlb', reqBody).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
    it('it should fail to create a new api-key when there is an no api-key in header', (done) => {
      let reqBody = {
        username: 'testuser',
      };
      getTokenSpecifyAuth(server, null, reqBody).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
  });

  describe('case archiving authorization operations', () => {
    beforeEach(function () {
      this.timeout(5000);
      cmd.runSync('npm run fw:test-clean; npm run fw:test-migrate');
    });
    it('it should  fail to create a case + archive entry when no API-key provided', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_B',
        requisitionId: 22,
        limsIds: ['2222_1_LDI2222', '2222_1_LDI2323', '2222_1_LDI2442'],
        workflowRunIdsForOffsiteArchive: [
          'vidarr:research/run/asdf',
          'vidarr:research/run/1234',
        ],
        workflowRunIdsForVidarrArchival: ['vidarr:research/run/abba'],
      };
      addCaseArchivesSpecifyAuth(server, null, reqBody).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
    it('it should fail to update a case when no APi-key provided', (done) => {
      let caseIdentifier = 'R12_TEST_1212_Ab_C';
      let unloadFile = {};
      updateCaseArchivesSpecifyAuth(
        server,
        null,
        caseIdentifier,
        urls.filesCopiedToOffsiteStagingDir,
        unloadFile
      ).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
  });

  describe('case sign-off authorization operations', () => {
    beforeEach(function () {
      this.timeout(5000);
      cmd.runSync('npm run fw:test-clean; npm run fw:test-migrate');
    });
    it('it should fail to retrieve a sign-off entry when there is no api-key (null)', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifierSpecifyAuth(server, caseIdentifier, null).end(
        (err, res) => {
          expect(res.status).to.equal(401);
          done();
        }
      );
    });
    it('it should fail to retrieve a sign-off entry when there is no api-key ("")', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifierSpecifyAuth(server, caseIdentifier, '').end(
        (err, res) => {
          expect(res.status).to.equal(401);
          done();
        }
      );
    });
    it('it should fail to retrieve a sign-off entry when there is an unregistered api-key', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifierSpecifyAuth(
        server,
        caseIdentifier,
        'sadfkjlb'
      ).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
    it('it should fail to create a new sign-off entry when there is no api-key', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: 'thoughts',
      };
      let caseIdentifier = 'R22_TEST_0022_Bb_new';
      addSignoffSpecifyAuth(server, caseIdentifier, null, reqBody).end(
        (err, res) => {
          expect(res.status).to.equal(401);
          done();
        }
      );
    });
    it('it should fail to create a new sign-off entry when there is an unregistered api-key', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: 'thoughts',
      };
      let caseIdentifier = 'R22_TEST_0022_Bb_new';
      addSignoffSpecifyAuth(server, caseIdentifier, 'sadfkjlb', reqBody).end(
        (err, res) => {
          expect(res.status).to.equal(401);
          done();
        }
      );
    });
    it('it should fail to create any sign-off entrys when there is no api-key', (done) => {
      let reqBody = {
        caseIdentifiers: ['bleh1', 'bleh2'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffsSpecifyAuth(server, null, reqBody).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
    it('it should fail to create any sign-off entrys when there is an unregistered api-key', (done) => {
      let reqBody = {
        caseIdentifiers: ['bleh1', 'bleh2'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffsSpecifyAuth(server, 'sadfkjlb', reqBody).end(
        (err, res) => {
          expect(res.status).to.equal(401);
          done();
        }
      );
    });
  });
});
