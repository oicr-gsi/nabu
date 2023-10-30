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

const addSignoff = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case/sign-off')
    .set('content-type', 'application/json')
    .send(requestBody);
};

const getSignoffsByCaseIdentifier = (server, caseIdentifier = {}) => {
  return chai
    .request(server)
    .get('/case/' + caseIdentifier + '/sign-off')
    .set('content-type', 'application/json')
    .send();
};

describe('case sign-off tracking', () => {
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('case + archive operations', () => {
    it('it should retrieve a sign-off entry for an existing case identifier', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.length).to.equal(1);
        expect(res.body[0].caseIdentifier).to.be.equal(caseIdentifier);
        done();
      });
    });
    it('it should fail to retrieve an sign-off entry if no matching case identifier is found', (done) => {
      let caseIdentifier = 'R1_TEST_0000_Ab_C';
      getSignoffsByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(404);
        expect(res.body).to.be.empty;
        done();
      });
    });

    it('it should create a new sign-off entry for a new case identifier with comment', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_new',
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
        comment: 'thoughts',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for a new case identifier without comment', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_B',
        qcPassed: true,
        username: 'testuser2',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for a new case identifier with null qc status', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_newbie',
        qcPassed: null,
        username: 'testuser',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
        comment: 'thoughts',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier and user', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: true,
        username: 'me',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier, user, and deliverable type', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: true,
        username: 'me',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'CLINICAL REPORT',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier, user, and sign-off step', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: true,
        username: 'me',
        signoffStepName: 'RELEASE',
        deliverableType: 'DATA RELEASE',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should replace an existing sign-off entry for an existing case identifier, deliverable type, and sign-off step', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE',
        deliverableType: 'CLINICAL REPORT',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
    });
    it('it should replace an existing sign-off entry with existing case identifier, user, deliverable type, and sign-off step', (done) => {
      let reqBody = {
        caseIdentifier: 'R11_TEST_1000_Xy_Z',
        qcPassed: false,
        username: 'me',
        signoffStepName: 'RELEASE',
        deliverableType: 'CLINICAL REPORT',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
    });
    it('it should fail to create a sign-off entry if sign-off step is not a valid option', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_B',
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'NOT RELEASE APPROVAL',
        deliverableType: 'DATA RELEASE',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should fail to create a sign-off entry if deliverable type is not a valid option', (done) => {
      let reqBody = {
        caseIdentifier: 'R22_TEST_0022_Bb_B',
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE APPROVAL',
        deliverableType: 'DATA UNRELEASE',
        comment: '',
      };
      addSignoff(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
  });
});