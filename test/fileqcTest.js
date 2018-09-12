'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const chaiExclude = require('chai-exclude');
const chaiHttp = require('chai-http');
const server = require('../app');
const cmd = require('node-cmd');
const path = require('path');

// mock out the databases in the controller to be able to unit test the private functions
// this will throw a 'duplicate db connection' error when the class is first rewired,
// but then we mock the databases so that it should never be an issue.
const rewire = require('rewire');
const controller = rewire('../components/fileqcs/fileQcsController');
// __set__ returns a function which reverts the changes introduced by this particular __set__ call
const revertPgDb = controller.__set__('pg', {});
const revertFprDb = controller.__set__('fpr', {});

chai.use(chaiHttp);
chai.use(chaiExclude);

const recreateFprDb = async cmd => {
  await cmd.run(
    'sqlite3 ' +
      process.env.SQLITE_LOCATION +
      '/fpr.db < ' +
      path.resolve(__dirname, './migrations/create_test_fpr.sql')
  );
  await cmd.run(
    'sqlite3 ' +
      process.env.SQLITE_LOCATION +
      '/fpr.db < ' +
      path.resolve(__dirname, './migrations/V9000__test_data.sql')
  );
};

describe('Unit test FileQcController', () => {
  before(async () => {
    recreateFprDb(cmd);
  });
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });
  after(() => {
    revertPgDb();
    revertFprDb();
  });

  const fprs = {
    12017: {
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    },
    12019: {
      fileswid: 12019,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    },
    12025: {
      fileswid: 12025,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    }
  };
  const fqcs = {
    12017: {
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      qcpassed: false,
      username: 'test',
      comment: 'failed for test'
    },
    12018: {
      fileswid: 12018,
      project: 'IPSCellLineReprogramming',
      filepath: '/oicr/deleted/items',
      username: 'me',
      comment: null,
      qcpassed: false
    },
    12025: {
      fileswid: 12025,
      project: 'IPSCellLineReprogramming',
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      username: 'me',
      comment: null,
      qcpassed: true
    }
  };
  const mergeOne = controller.__get__('mergeOneFileResult');
  const mergeFileResults = controller.__get__('mergeFprsAndFqcs');

  it('should return all data when some inputs are present in FPR, others in FQC, and some in both', done => {
    const expected = [
      {
        fileswid: 12017,
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
        project: 'IPSCellLineReprogramming',
        qcstatus: 'FAIL',
        username: 'test',
        comment: 'failed for test',
        upstream: [],
        skip: 'false',
        stalestatus: 'OKAY'
      },
      {
        fileswid: 12018,
        project: 'IPSCellLineReprogramming',
        filepath: '/oicr/deleted/items',
        username: 'me',
        qcstatus: 'FAIL',
        stalestatus: 'NOT IN FILE PROVENANCE'
      },
      {
        fileswid: 12019,
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
        skip: 'false',
        stalestatus: 'OKAY',
        project: 'IPSCellLineReprogramming',
        upstream: [],
        qcstatus: 'PENDING'
      },
      {
        fileswid: 12025,
        project: 'IPSCellLineReprogramming',
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
        username: 'me',
        qcstatus: 'PASS',
        upstream: [],
        skip: 'false',
        stalestatus: 'OKAY'
      }
    ];
    const actual = mergeFileResults(
      [fprs['12017'], fprs['12019'], fprs['12025']],
      [fqcs['12017'], fqcs['12018'], fqcs['12025']]
    );
    actual.forEach((item, index) =>
      expect(item)
        .excluding('qcdate')
        .excluding('fileqcid')
        .to.deep.equal(expected[index])
    );
    done();
  });

  it('should merge file results when item is found in both FPR and FQC', done => {
    const expected = {
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY',
      upstream: [],
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test'
    };
    const actual = mergeOne(fprs['12017'], fqcs['12017']);
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });

  it('should return FileQc results with "NOT IN PROVENANCE" when there is no FPR record', done => {
    const expected = {
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      stalestatus: 'NOT IN FILE PROVENANCE',
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test'
    };
    const actual = mergeOne({}, fqcs['12017']);
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });

  it('should return FPR result with qcstatus "PENDING" when there is no FQC record', done => {
    const expected = {
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY',
      qcstatus: 'PENDING',
      upstream: []
    };
    const actual = mergeOne(fprs['12017'], {});
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });
});

describe('available constants', () => {
  before(async () => {
    recreateFprDb(cmd);
  });
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });
  describe('GET available constants', () => {
    it('it should list available projects and workflows', done => {
      chai
        .request(server)
        .get('/available')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body).to.have.keys('workflows', 'projects');
          expect(res.body.workflows).to.not.be.empty;
          expect(res.body.projects).to.not.be.empty;
          done();
        });
    });
  });
});

describe('FileQC', () => {
  before(async () => {
    recreateFprDb(cmd);
  });
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('GET fileQc by id', () => {
    it('it should GET one PENDING FileQC', done => {
      chai
        .request(server)
        .get('/fileqc/12019')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.length(1);
          expect(res.body.fileqcs[0].fileswid).to.equal(12019);
          expect(res.body.fileqcs[0].qcstatus).to.equal('PENDING');
          expect(res.body.fileqcs[0]).to.not.have.any.keys(
            'username',
            'comment'
          );
          done();
        });
    });

    it('it should GET one PASS FileQC', done => {
      chai
        .request(server)
        .get('/fileqc/12017')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs[0].fileswid).to.equal(12017);
          expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
          expect(res.body.fileqcs[0].username).to.equal('me');
          expect(res.body.fileqcs[0]).to.have.property('comment');
          done();
        });
    });

    it('it should GET one FAIL FileQC not in File Provenance', done => {
      chai
        .request(server)
        .get('/fileqc/12018')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs[0].fileswid).to.equal(12018);
          expect(res.body.fileqcs[0].qcstatus).to.equal('FAIL');
          expect(res.body.fileqcs[0].stalestatus).to.equal(
            'NOT IN FILE PROVENANCE'
          );
          done();
        });
    });

    it('it should GET zero results for one unknown FileQC', done => {
      chai
        .request(server)
        .get('/fileqc/11')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.empty;
          done();
        });
    });
  });

  describe('GET FileQCs', () => {
    it('it should error on invalid parameters', done => {
      chai
        .request(server)
        .get('/fileqcs?nonsense=param&project=IPSCellLineReprogramming')
        .end((err, res) => {
          expect(res.status).to.equal(400);
          expect(res.body.errors).to.not.be.empty;
          expect(res.body.errors[0].includes('Invalid parameter')).to.be.true;
          done();
        });
    });

    it('it should GET all FileQCs for a given project', done => {
      chai
        .request(server)
        .get('/fileqcs?project=IPSCellLineReprogramming')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.lengthOf(4);
          done();
        });
    });

    it('it should GET all FileQCs for given file SWIDs', done => {
      chai
        .request(server)
        .get('/fileqcs?fileswids=12017,12018')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.lengthOf(2);
          expect(res.body.fileqcs[0].fileswid).to.equal(12017);
          expect(res.body.fileqcs[1].fileswid).to.equal(12018);
          done();
        });
    });

    it('it should GET multiple FileQCs for a single SWID if extra param is added', done => {
      chai
        .request(server)
        .get('/fileqcs?fileswids=12020&showall=true')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.lengthOf(2);
          expect(res.body.fileqcs[0].fileswid).to.equal(
            res.body.fileqcs[1].fileswid
          );
          expect(res.body.fileqcs[0].workflow).to.equal(
            res.body.fileqcs[1].workflow
          );
          expect(res.body.fileqcs[0].qcstatus).to.not.equal(
            res.body.fileqcs[1].qcstatus
          );
          done();
        });
    });

    it('it should GET one FileQC for a single SWID if no extra param is added', done => {
      chai
        .request(server)
        .get('/fileqcs?fileswids=12020')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.lengthOf(1);
          done();
        });
    });

    it('it should not return files for gibberish projects', done => {
      chai
        .request(server)
        .get('/fileqcs?project=UNKNOWN')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.be.empty;
          done();
        });
    });
  });

  describe('POST FileQC', () => {
    function assertNotSaved (parms, done, missing) {
      chai
        .request(server)
        .post('/fileqcs?' + parms)
        .end((err, res) => {
          expect(res.status, 'creating without param ' + missing).to.equal(400);
          done();
        });
    }
    const params = ['fileswid=12019', 'username=me', 'qcstatus=PASS'];
    for (let counter = 0; counter < params.length; counter++) {
      it('it should not POST a FileQC with any of the following missing: fileswid, username, qcstatus', done => {
        const currentParams = params
          .filter((param, index) => index !== counter)
          .join('&');
        assertNotSaved(currentParams, done, params[counter]);
      });
    }

    it('it should create a new FileQC for a new SWID with a status PENDING', done => {
      chai
        .request(server)
        .post('/fileqcs?fileswid=12022&username=me&qcstatus=PENDING')
        .end((err, res) => {
          expect(res.status).to.equal(201);
          expect(res.body.fileqc.qcstatus).to.equal('PENDING');
          done();
        });
    });

    it('it should create a new FileQC for a new SWID', done => {
      chai
        .request(server)
        .post('/fileqcs?' + params.join('&'))
        .end((err, res) => {
          expect(res.status).to.equal(201);
          expect(res.body.fileqc).to.have.property('upstream');
          expect(res.body.fileqc.qcstatus).to.equal('PASS');
          done();
        });
    });

    it('it should create a new FileQC for the same SWID', done => {
      const getFor12017 = '/fileqcs?fileswids=12017';
      chai
        .request(server)
        .get(getFor12017)
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.have.lengthOf(1);
          chai
            .request(server)
            .post(
              '/fileqcs?fileswid=12017&qcstatus=FAIL&username=test&comment=failed%20for%20test'
            )
            .end((err, res) => {
              expect(res.status).to.equal(201);
              expect(res.body.fileqc).to.have.property('upstream');
              expect(res.body.fileqc.qcstatus).to.equal('FAIL');
              chai
                .request(server)
                .get(getFor12017)
                .end((err, res) => {
                  expect(res.status).to.equal(200);
                  expect(res.body.fileqcs).to.have.lengthOf(1);
                });
              chai
                .request(server)
                .get(getFor12017 + '&showall=true')
                .end((err, res) => {
                  expect(res.status).to.equal(200);
                  expect(res.body.fileqcs).to.have.lengthOf(2);
                });
            });
          done();
        });
    });
  });

  describe('batch POST FileQCs', () => {
    it('it should succeed in creating multiple FileQCs for one request', done => {
      chai
        .request(server)
        .post('/fileqcs/batch')
        .set('content-type', 'application/json')
        .send({
          fileqcs: [
            {
              fileswid: 12019,
              qcstatus: 'PASS',
              username: 'me'
            },
            {
              fileswid: 12025,
              qcstatus: 'PASS',
              username: 'me'
            }
          ]
        })
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.fileqcs).to.have.lengthOf(2);
          expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
          expect(res.body.fileqcs[1].qcstatus).to.equal('PASS');
          done();
        });
    });
  });

  describe('batch DELETE FileQCs', () => {
    it('it should succeed in deleting a FileQC', done => {
      chai
        .request(server)
        .get('/fileqcs?fileswids=12016')
        .end((err, res) => {
          const fqcId = res.body.fileqcs[0].fileqcid;
          chai
            .request(server)
            .post('/delete-fileqcs')
            .set('content-type', 'application/json')
            .send({
              fileqcids: [fqcId],
              username: 'me'
            })
            .end((err, res) => {
              expect(res.status).to.equal(200);
              expect(res.body.success).not.to.be.empty;
              expect(res.body.success[0]).to.match(/^Deleted FileQC.*/);
            });
          done();
        });
    });

    it('it should fail to delete a non-existent FileQC', done => {
      chai
        .request(server)
        .post('/delete-fileqcs')
        .set('content-type', 'application/json')
        .send({
          fileqcids: [21221008773217],
          username: 'mistaken'
        })
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.errors).not.to.be.empty;
          expect(res.body.errors[0]).to.match(/^Failed to delete FileQC.*/);
          done();
        });
    });
  });
});
