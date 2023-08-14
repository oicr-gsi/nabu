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

const addCaseArchives = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/case')
    .set('content-type', 'application/json')
    .send(requestBody);
};

const updateCaseArchives = (
  server,
  caseIdentifier,
  operationSlug,
  requestBody = {}
) => {
  let url = `/case/${caseIdentifier}/${operationSlug}`;
  return chai
    .request(server)
    .put(url)
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

const isValidDate = (date) => {
  return !!Date.parse(date);
};

describe('case archive tracking', () => {
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('case + archive operations', () => {
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
    it('it should get all the case archive information at once', async () => {
      const res = await chai
        .request(server)
        .get('/cases')
        .set('content-type', 'application/json')
        .send();

      expect(res.status).to.equal(200);
    });
    it('it should create a case + archive entry', (done) => {
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
      addCaseArchives(server, reqBody).end((err, res) => {
        expect(res.status).to.equal(201);
        done();
      });
    });
    it('it should return OK when the same case data is submitted', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      let reqBody = {
        caseIdentifier: caseIdentifier,
        requisitionId: 11,
        limsIds: ['109_1_LDI5432', '109_1_LDI4321'],
        workflowRunIdsForOffsiteArchive: [
          'vidarr:research/run/f77732c812aa134f61b3a7c11d1c4451cefe70e90e828a11345e8a0cd7704a0f',
          'vidarr:research/run/eeb4c43908e5df3dd4997dcc982c4c0d7285b51d7a800e501da06add9125faa7',
          'vidarr:research/run/e651c4aa01d506904bc8b89a411e948c24d43fc0e841486937f23d72eb7c4fae',
          'vidarr:research/run/de7b18bb97916885afbb7b085d61f00cfaa28793a8b7260b50c4d4ece3567216',
        ],
        workflowRunIdsForVidarrArchival: [
          'vidarr:research/run/da0e6032ed08591ae684a015ad3c58867a47a65b6c61995e421fc417e2c438c1',
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.caseIdentifier).to.be.equal(reqBody.caseIdentifier);
        expect(res.body.requisitionId).to.be.equal(reqBody.requisitionId);
        expect(res.body.limsIds).to.include.members(reqBody.limsIds);
        expect(res.body.workflowRunIdsForOffsiteArchive).to.include.members(
          reqBody.workflowRunIdsForOffsiteArchive
        );
        expect(res.body.workflowRunIdsForVidarrArchival).to.include.members(
          reqBody.workflowRunIdsForVidarrArchival
        );

        addCaseArchives(server, reqBody).end((err, res) => {
          expect(res.status).to.equal(200); // 200 means it's the same
        });
        done();
      });
    });
    it('it should error when a case is submitted with the same case identifier but different case data', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      let reqBody = {
        caseIdentifier: caseIdentifier,
        requisitionId: 1111111,
        limsIds: ['109_1_LDI5432', '109_1_LDI4321'],
        workflowRunIdsForOffsiteArchive: [
          'vidarr:research/run/f77732c812aa134f61b3a7c11d1c4451cefe70e90e828a11345e8a0cd7704a0f',
          'vidarr:research/run/eeb4c43908e5df3dd4997dcc982c4c0d7285b51d7a800e501da06add9125faa7',
          'vidarr:research/run/e651c4aa01d506904bc8b89a411e948c24d43fc0e841486937f23d72eb7c4fae',
          'vidarr:research/run/de7b18bb97916885afbb7b085d61f00cfaa28793a8b7260b50c4d4ece3567216',
        ],
        workflowRunIdsForVidarrArchival: [
          'vidarr:research/run/da0e6032ed08591ae684a015ad3c58867a47a65b6c61995e421fc417e2c438c1',
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.caseIdentifier).to.be.equal(reqBody.caseIdentifier);
        expect(res.body.requisitionId).not.to.be.equal(reqBody.requisitionId);

        addCaseArchives(server, reqBody).end((err, res) => {
          expect(res.status).to.equal(409);
        });
        done();
      });
    });
    it('it should update a case with info that files have been copied to the offsite staging directory', (done) => {
      let caseIdentifier = 'R12_TEST_1212_Ab_C';
      let unloadFile = {
        workflows: ['bcl2fastq', 'consensusCruncher'],
        workflowVersions: [
          { name: 'bcl2fastq', version: '1.0.1' },
          { name: 'consensusCruncher', version: '2.0.0' },
        ],
        workflowRuns: [
          { run1: 'values' },
          { run2: 'more values' },
          { run3: 'yet more values' },
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.filesCopiedToOffsiteArchiveStagingDir).to.be.a('null');

        updateCaseArchives(
          server,
          caseIdentifier,
          urls.filesCopiedToOffsiteStagingDir,
          unloadFile
        ).end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.filesCopiedToOffsiteArchiveStagingDir).not.to.be.a(
            'null'
          );
          expect(isValidDate(res.body.filesCopiedToOffsiteArchiveStagingDir)).to
            .be.true;
          expect(res.body.filesLoadedIntoVidarrArchival).to.be.a('null');
        });
        done();
      });
    });
    it('it should not update a case if the case does not exist', (done) => {
      let caseIdentifier = 'nonexistent';
      let unloadFile = {
        workflows: ['bcl2fastq', 'consensusCruncher'],
        workflowVersions: [
          { name: 'bcl2fastq', version: '1.0.1' },
          { name: 'consensusCruncher', version: '2.0.0' },
        ],
        workflowRuns: [
          { run1: 'values' },
          { run2: 'more values' },
          { run3: 'yet more values' },
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(404);

        updateCaseArchives(
          server,
          caseIdentifier,
          urls.filesCopiedToOffsiteStagingDir,
          unloadFile
        ).end((err, res) => {
          expect(res.status).to.equal(404);
        });
        done();
      });
    });
    it('it should update twice that file have been copied to the offsite staging directory', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      let unloadFile = {
        workflows: ['bcl2fastq', 'consensusCruncher'],
        workflowVersions: [
          { name: 'bcl2fastq', version: '1.0.1' },
          { name: 'consensusCruncher', version: '2.0.0' },
        ],
        workflowRuns: [
          { run1: 'values' },
          { run2: 'more values' },
          { run3: 'yet more values' },
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.filesCopiedToOffsiteArchiveStagingDir).not.to.be.a(
          'null'
        );
        let firstCopyTime = res.body.filesCopiedToOffsiteArchiveStagingDir;

        updateCaseArchives(
          server,
          caseIdentifier,
          urls.filesCopiedToOffsiteStagingDir,
          unloadFile
        ).end((err, res) => {
          expect(res.status).to.equal(200);

          let secondCopyTime = res.body.filesCopiedToOffsiteArchiveStagingDir;
          expect(isValidDate(secondCopyTime)).to.be.true;
          expect(firstCopyTime).not.to.equal(secondCopyTime);
        });
        done();
      });
    });
    it('it should update a case and save the commvault job ID', (done) => {
      let caseIdentifier = 'R12_TEST_1212_Ab_C';
      let reqBody = {
        commvaultBackupJobId: 'CJ1212',
      };

      updateCaseArchives(
        server,
        caseIdentifier,
        urls.filesSentOffsite,
        reqBody
      ).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.commvaultBackupJobId).not.to.be.a('null');
        expect(res.body.commvaultBackupJobId).to.equal(
          reqBody.commvaultBackupJobId
        );
        done();
      });
    });
    it('it should update a commvault job ID if a new one is provided', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      let reqBody = {
        commvaultBackupJobId: 'CJ9999',
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        expect(res.body.commvaultBackupJobId).not.to.be.a('null');
        let firstCvId = res.body.commvaultBackupJobId;

        updateCaseArchives(
          server,
          caseIdentifier,
          urls.filesSentOffsite,
          reqBody
        ).end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.commvaultBackupJobId).not.to.be.a('null');
          expect(res.body.commvaultBackupJobId).not.to.equal(firstCvId);
          expect(res.body.commvaultBackupJobId).to.equal(
            reqBody.commvaultBackupJobId
          );
        });
        done();
      });
    });
    it('it should update a case to indicate files have been sent to vidarr-archival', (done) => {
      let caseIdentifier = 'R12_TEST_1212_Ab_C';
      let loadFile = {
        workflows: ['crosscheckFingerprintsCollector_bam'],
        workflowVersions: [
          { name: 'crosscheckFingerprintsCollector_bam', version: '1.2.1' },
        ],
        workflowRuns: [
          { name: 'crosscheckFingerprintsCollector_bam', values: 'lots' },
        ],
      };
      updateCaseArchives(
        server,
        caseIdentifier,
        urls.filesLoadedIntoVidarrArchival,
        loadFile
      ).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.filesLoadedIntoVidarrArchival).not.to.be.a('null');
        expect(isValidDate(res.body.filesLoadedIntoVidarrArchival)).to.be.true;
        done();
      });
    });
    it('it should update the "files have been sent to vidarr-archival" time', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      let loadFile = {
        workflows: ['crosscheckFingerprintsCollector_fastq'],
        workflowVersions: [
          { name: 'crosscheckFingerprintsCollector_fastq', version: '1.2.1' },
        ],
        workflowRuns: [
          { name: 'crosscheckFingerprintsCollector_fastq', values: 'yet more' },
        ],
      };
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        let firstLoadedDate = res.body.filesLoadedIntoVidarrArchival;
        expect(isValidDate(firstLoadedDate)).to.be.true;

        updateCaseArchives(
          server,
          caseIdentifier,
          urls.filesLoadedIntoVidarrArchival,
          loadFile
        ).end((err, res) => {
          expect(res.status).to.equal(200);
          let secondLoadedDate = res.body.filesLoadedIntoVidarrArchival;
          expect(firstLoadedDate).not.to.equal(secondLoadedDate);
          expect(isValidDate(secondLoadedDate)).to.be.true;
        });
        done();
      });
    });
    it('it should error if attempting to indicate files have been sent to vidarr-archival for a case with an unknown identifier', (done) => {
      let caseIdentifier = 'R1000_TEST_1000_Kw_Q';
      let loadFile = {
        workflows: ['crosscheckFingerprintsCollector_bam'],
        workflowVersions: [
          { name: 'crosscheckFingerprintsCollector_bam', version: '1.2.1' },
        ],
        workflowRuns: [
          { name: 'crosscheckFingerprintsCollector_bam', values: 'lots' },
        ],
      };
      updateCaseArchives(
        server,
        caseIdentifier,
        urls.filesLoadedIntoVidarrArchival,
        loadFile
      ).end((err, res) => {
        expect(res.status).to.equal(404);
        done();
      });
    });
    it('it should update a case to indicate that the case files have been unloaded from production vidarr', (done) => {
      let caseIdentifier = 'R12_TEST_1212_Ab_C';
      updateCaseArchives(server, caseIdentifier, urls.caseFilesUnloaded).end(
        (err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.caseFilesUnloaded).not.to.be.a('null');
          expect(isValidDate(res.body.caseFilesUnloaded)).to.be.true;
          done();
        }
      );
    });
    it('it should update the "files have been deleted from production vidarr" time', (done) => {
      let caseIdentifier = 'R11_TEST_1000_Xy_Z';
      getCaseByCaseIdentifier(server, caseIdentifier).end((err, res) => {
        let firstUnloadDate = res.body.caseFilesUnloaded;
        expect(isValidDate(firstUnloadDate)).to.be.true;

        updateCaseArchives(server, caseIdentifier, urls.caseFilesUnloaded).end(
          (err, res) => {
            expect(res.status).to.equal(200);
            let secondUnloadDate = res.body.caseFilesUnloaded;
            expect(firstUnloadDate).not.to.equal(secondUnloadDate);
            expect(isValidDate(secondUnloadDate)).to.be.true;
          }
        );
        done();
      });
    });
    it('it should error if attempting to indicate files have been deleted from production vidarr for a case with an unknown identifier', (done) => {
      let caseIdentifier = 'R1000_TEST_1000_Kw_Q';
      updateCaseArchives(server, caseIdentifier, urls.caseFilesUnloaded).end(
        (err, res) => {
          expect(res.status).to.equal(404);
          done();
        }
      );
    });
  });
});
