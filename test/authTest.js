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
  token,
  caseIdentifier = {}
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

describe('case sign-off tracking', () => {
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('case sign-off authorization operations', () => {
    it('it should fail to retrieve a sign-off entry when there is no api-key', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifierSpecifyAuth(server, caseIdentifier, null).end(
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
    it('it should create an api-key of length 36', (done) => {
      let reqBody = {
        username: 'testuser',
      };
      getTokenSpecifyAuth(server, 'testingtoken', reqBody).end((err, res) => {
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
    it('it should fail to create a new api-key when there is an unregistered api-key in header', (done) => {
      let reqBody = {
        username: 'testuser',
      };
      getTokenSpecifyAuth(server, null, reqBody).end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
    });
  });
});
