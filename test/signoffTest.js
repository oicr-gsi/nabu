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

const signoffProperties = [
  'id',
  'created',
  'caseIdentifier',
  'qcPassed',
  'username',
  'signoffStepName',
  'deliverableType',
  'deliverable',
  'comment',
];

const testingToken =
  'wdew0h5hoxvraj1xhrzix4j6nbswhh-oiq8ipt84uj1zkwq8sx0yvfmvfw6no';

const addSignoff = (server, caseIdentifier, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case/' + caseIdentifier + '/sign-off')
    .set('X-API-KEY', testingToken)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const addBatchSignoffs = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case/sign-off')
    .set('X-API-KEY', testingToken)
    .set('content-type', 'application/json')
    .send(requestBody);
};

const getSignoffsByCaseIdentifier = (server, caseIdentifier = {}) => {
  return chai
    .request(server)
    .get('/case/' + caseIdentifier + '/sign-off')
    .set('X-API-KEY', testingToken)
    .set('content-type', 'application/json')
    .send();
};

const getAllSignoffs = (server) => {
  return chai
    .request(server)
    .get('/case/sign-off')
    .set('X-API-KEY', testingToken)
    .set('content-type', 'application/json')
    .send();
};

describe('case sign-off tracking', () => {
  before(function () {
    this.timeout(10000);
    cmd.runSync('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('case sign-off operations', () => {
    it('it should retrieve all sign-off entries in the database', (done) => {
      getAllSignoffs(server).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.equal(5);
        done();
      });
    });

    it('it should retrieve a sign-off entry for an existing case identifier', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getSignoffsByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.equal(1);
        expect(res.body[0]).to.have.keys(signoffProperties);
        expect(res.body[0].caseIdentifier).to.be.equal(caseIdentifier);
        done();
      });
    });

    it('it should retrieve an empty list if no matching case identifier is found', (done) => {
      let caseIdentifier = 'R1_TEST_0000_Ab_C';
      getSignoffsByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.empty;
        done();
      });
    });

    it('it should create a new sign-off entry for a new case identifier with comment', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: 'thoughts',
      };
      let caseIdentifier = 'R22_TEST_0022_Bb_new';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for a new case identifier without comment', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser2',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
      };
      let caseIdentifier = 'R22_TEST_0022_Bb_B';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for a new case identifier with null qc status', (done) => {
      let reqBody = {
        qcPassed: null,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: 'thoughts',
      };
      let caseIdentifier = 'R22_TEST_0022_Bb_newbie';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier and user', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'me',
        signoffStepName: 'ANALYSIS_REVIEW',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier, user, and deliverable type', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'me',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'CLINICAL_REPORT',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create a new sign-off entry for an existing case identifier, user, and sign-off step', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'me',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should replace an existing sign-off entry for an existing case identifier, deliverable type, and sign-off step', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'CLINICAL_REPORT',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should replace an existing sign-off entry with existing case identifier, user, deliverable type, and sign-off step', (done) => {
      let reqBody = {
        qcPassed: false,
        username: 'me',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'CLINICAL_REPORT',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should fail to create a sign-off entry if sign-off step is not a valid option', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'NOT RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should fail to create a sign-off entry if deliverable type is not a valid option', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA UNRELEASE',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should fail to create a sign-off entry if deliverable is not provided for RELEASE step', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE',
        deliverableType: 'DATA_RELEASE',
        deliverable: '',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should create a sign-off entry when deliverable is provided for RELEASE step', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE',
        deliverableType: 'DATA_RELEASE',
        deliverable: 'something',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should fail to create a sign-off entry if deliverable is provided for a non RELEASE step', (done) => {
      let reqBody = {
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        deliverable: 'something',
        comment: '',
      };
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      addSignoff(server, caseIdentifier, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should create multiple sign-off entrys', (done) => {
      let reqBody = {
        caseIdentifiers: ['bleh1', 'bleh2'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffs(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body.length).to.equal(2);
        expect(res.body[0]).to.have.keys(signoffProperties);
        expect(res.body[1]).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create single sign-off entry when single case ID passed in body (not as parameter)', (done) => {
      let reqBody = {
        caseIdentifiers: ['newid1'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffs(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body.length).to.equal(1);
        expect(res.body[0]).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should fail to create multiple sign-off entrys when signoffStep is bad', (done) => {
      let reqBody = {
        caseIdentifiers: ['newid1', 'newid2'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_NOT_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffs(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
    it('it should create multiple sign-off entrys if one is duplicate', (done) => {
      let reqBody = {
        caseIdentifiers: ['newid1', 'R22_TEST_0022_Bb_B'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffs(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body.length).to.equal(2);
        expect(res.body[0]).to.have.keys(signoffProperties);
        expect(res.body[1]).to.have.keys(signoffProperties);
        done();
      });
    });
    it('it should create multiple sign-off entrys if all of them are duplicate', (done) => {
      let reqBody = {
        caseIdentifiers: ['R11_TEST_1000_Xy_Z', 'R22_TEST_0022_Bb_B'],
        qcPassed: true,
        username: 'testuser',
        signoffStepName: 'RELEASE_APPROVAL',
        deliverableType: 'DATA_RELEASE',
        comment: '',
      };
      addBatchSignoffs(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body.length).to.equal(2);
        expect(res.body[0]).to.have.keys(signoffProperties);
        expect(res.body[1]).to.have.keys(signoffProperties);
        done();
      });
    });
  });
});
