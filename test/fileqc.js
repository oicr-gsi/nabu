'use strict';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const chaiHttp = require('chai-http');
const server = require('../app');
const cmd = require('node-cmd');
const path = require('path');
const test_migration = path.resolve(__dirname, './migrations/V9000__test_data.sql');

// mock out the databases in the controller to be able to unit test the private functions
// this will throw a 'duplicate db connection' error when the class is first rewired,
// but then we mock the databases so that it should never be an issue.
const rewire = require('rewire');
const controller = rewire('../components/fileqcs/fileQcsController');
// __set__ returns a function which reverts the changes introduced by this particular __set__ call
const revertPgDb = controller.__set__('pg', {});
const revertFprDb = controller.__set__('fpr', {});

chai.use(chaiHttp);

describe('FileQcController', () => {
  const fprs = {
    12017: {
      fileswid: 12017,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    }, 
    12019: {
      fileswid: 12019,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    },
    12025: {
      fileswid: 12025,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: []
    }
  };
  const fqcs = {
    12017: { 
      fileswid: 12017,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
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
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      username: 'me',
      comment: null,
      qcpassed: true 
    }
  }; 
  const mergeOne = controller.__get__('mergeOneFileResult');
  const mergeFileResults = controller.__get__('mergeFileResults');

  it('should merge file results when item is found in both FPR and FQC', (done) => {
    const expected = {
      fileswid: 12017,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY', 
      upstream: [],
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test'
    };
    const actual = mergeOne(fprs['12017'], fqcs['12017']);
    expect(actual).to.deep.equal(expected);
    done();
  });

  it('should return FileQc results with "NOT IN PROVENANCE" when there is no FPR record', (done) => {
    const expected = {
      fileswid: 12017,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      stalestatus: 'NOT IN FILE PROVENANCE', 
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test'
    };
    const actual = mergeOne({}, fqcs['12017']);
    expect(actual).to.deep.equal(expected);
    done();
  });

  it('should return FPR result with qcstatus "PENDING" when there is no FQC record', (done) => {
    const expected = {
      fileswid: 12017,
      filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY', 
      qcstatus: 'PENDING',
      upstream: []
    };
    const actual = mergeOne(fprs['12017'], {});
    expect(actual).to.deep.equal(expected);
    done();
  });

  it('should return all data when some inputs are present in FPR, others in FQC, and some in both', (done) => {
    const expected = [
      {
        fileswid: 12017,
        filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
        project: 'IPSCellLineReprogramming',
        qcstatus: 'FAIL',
        username: 'test',
        comment: 'failed for test',
        upstream: [],
        skip: 'false',
        stalestatus: 'OKAY'
      }, {
        fileswid: 12018,
        project: 'IPSCellLineReprogramming',
        filepath: '/oicr/deleted/items',
        username: 'me',
        comment: null,
        qcstatus: 'FAIL',
        stalestatus: 'NOT IN FILE PROVENANCE'
      }, {
        fileswid: 12019,
        filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
        skip: 'false',
        stalestatus: 'OKAY',
        project: 'IPSCellLineReprogramming',
        upstream: [],
        qcstatus: 'PENDING'
      }, { 
        fileswid: 12025,
        project: 'IPSCellLineReprogramming',
        filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
        username: 'me',
        qcstatus: 'PASS',
        upstream: [],
        skip: 'false',
        stalestatus: 'OKAY'
      }
    ];
    const actual = mergeFileResults([fprs['12017'], fprs['12019'], fprs['12025']], [fqcs['12017'], fqcs['12018'], fqcs['12025']]);
    expect(actual).to.deep.equal(expected);
    done();
  });
  revertPgDb();
  revertFprDb();
});


describe('FileQC', function() {
  // empty and repopulate the SQLite db and Postgres db
  beforeEach(async () => {
    await cmd.run('sqlite3 < ' + test_migration);
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });

  describe('GET fileQc by id', () => {
    it('it should GET one PENDING FileQC', (done) => {
      chai.request(server)
        .get('/fileqc/12019')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqc).to.be.a('object');
          expect(res.body.fileqc.fileswid).to.equal(12019);
          expect(res.body.fileqc.qcstatus).to.equal('PENDING');
          expect(res.body.fileqc).to.not.have.any.keys('username', 'comment');
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should GET one PASS FileQC', (done) => {
      chai.request(server)
        .get('/fileqc/12017')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqc).to.be.a('object');
          expect(res.body.fileqc.fileswid).to.equal(12017);
          expect(res.body.fileqc.qcstatus).to.equal('PASS');
          expect(res.body.fileqc.username).to.equal('me');
          expect(res.body.fileqc).to.have.property('comment');
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should GET one FAIL FileQC not in File Provenance', (done) => {
      chai.request(server)
        .get('/fileqc/12018')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqc).to.be.a('object');
          expect(res.body.fileqc.fileswid).to.equal(12018);
          expect(res.body.fileqc.qcstatus).to.equal('FAIL');
          expect(res.body.fileqc.stalestatus).to.equal('NOT IN FILE PROVENANCE');
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should fail to GET one unknown FileQC', (done) => {
      chai.request(server)
        .get('/fileqc/11')
        .end((err, res) => {
          expect(res.status).to.equal(400);
          expect(res.body).to.be.a('object');
          expect(res.body.errors).to.not.be.empty;
          expect(res.body.errors).to.have.members(['Cannot find any matching record in either file provenance or FileQC.']);
          done();
        });
    });
  });

  describe('GET FileQCs', () => {
    it('it should GET all FileQCs for a given project', (done) => {
      chai.request(server)
        .get('/fileqcs?project=IPSCellLineReprogramming')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body).to.be.a('object');
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs).to.have.lengthOf(4);
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should GET all FileQCs for given file SWIDs', (done) => {
      chai.request(server)
        .get('/fileqcs?fileswids=12017,12018')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.errors).to.be.empty;
          expect(res.body.fileqcs).to.be.a('array');
          expect(res.body.fileqcs[0].fileswid).to.equal(12017);
          expect(res.body.fileqcs[1].fileswid).to.equal(12018);
          done();
        });
    });
 
    it('it should not return files for gibberish projects', (done) => {
      chai.request(server)
        .get('/fileqcs?project=UNKNOWN')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.errors).to.be.empty;
          expect(res.body.fileqcs).to.be.empty;
          done();
        });
    });
  });

  describe('POST FileQC', () => {
    function assertNotSaved (parms, done, missing) {
      chai.request(server)
        .post('/fileqcs?' + parms)
        .end((err, res) => {
          expect(res.status, 'creating without param ' + missing).to.equal(400);
          done();
        });
    }
    const params = ['fileswid=12019', 'filepath=%2Foicr%2Fdata%2Farchive%2Fseqware%2Fseqware_analysis%2Fresults%2Fseqware-0.10.0_IlluminaBaseCalling-1.8.2%2F70453881%2FUnaligned_111028_SN393_0192_BC0AAKACXX_2%2FProject_na%2FSample_11720%2F11720_TAGCTT_L002_R2_001.fastq.gz', 'project=Test', 'username=me', 'qcstatus=PASS'];
    for (let counter = 0; counter < params.length; counter++) {
      it('it should not POST a FileQC with any of the following missing: fileswid, filepath, project, username, qcstatus', (done) => {
        const currentParams = params.filter((param, index) => index !== counter ).join('&');
        assertNotSaved(currentParams, done, params[counter]);
      });
    }

    it('it should create a new FileQC when one does not exist', (done) => {
      chai.request(server)
        .post('/fileqcs?' + params.join('&'))
        .end((err, res) => {
          expect(res.status).to.equal(201);
          expect(res.body.fileqc).to.have.property('upstream');
          expect(res.body.fileqc.qcstatus).to.equal('PASS');
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should update an existing FileQC', (done) => {
      chai.request(server)
        .post('/fileqcs?fileswid=12017&project=IPSCellLineReprogramming&filepath=%2Foicr%2Fdata%2Farchive%2Fseqware%2Fseqware_analysis%2Fresults%2Fseqware-0.10.0_IlluminaBaseCalling-1.8.2%2F70453881%2FUnaligned_111028_SN393_0192_BC0AAKACXX_2%2FProject_na%2FSample_11720%2F11720_TAGCTT_L002_R1_001.fastq.gz&qcstatus=FAIL&username=test&comment=failed%20for%20test')
        .end((err, res) => {
          expect(res.status).to.equal(201);
          expect(res.body.fileqc).to.have.property('upstream');
          expect(res.body.fileqc.qcstatus).to.equal('FAIL');
          expect(res.body.errors).to.be.empty;
          done();
        });
    });

    it('it should error if a fileqc is saved with an existing path and a different fileswid', (done) => {
      chai.request(server)
        .post('/fileqcs?fileswid=12222&project=IPSCellLineReprogramming&filepath=%2Foicr%2Fdata%2Farchive%2Fseqware%2Fseqware_analysis%2Fresults%2Fseqware-0.10.0_IlluminaBaseCalling-1.8.2%2F70453881%2FUnaligned_111028_SN393_0192_BC0AAKACXX_2%2FProject_na%2FSample_11720%2F11720_TAGCTT_L002_R1_001.fastq.gz&qcstatus=FAIL&username=test&comment=failed%20for%20test')
        .end((err, res) => {
          expect(res.status).to.equal(400);
          expect(res.body.errors).to.not.be.empty;
          done();
        });
    });
  });

  describe('batch POST FileQCs', () => {
    it('it should succeed in creating multiple FileQCs for one request', (done) => {
      chai.request(server)
        .post('/fileqcs/batch')
        .set('content-type', 'application/json')
        .send({ fileqcs: [
          { 
            fileswid: 12019, project: 'IPSCellLineReprogramming', qcstatus: 'PASS', username: 'me',
            filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz'
          }, {
            fileswid: 12025, project: 'IPSCellLineReprogramming', qcstatus: 'PASS', username: 'me',
            filepath: '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz'
          }
        ]})
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.errors).to.be.empty;
          expect(res.body.fileqcs).to.have.lengthOf(2);
          expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
          expect(res.body.fileqcs[1].qcstatus).to.equal('PASS');
          done();
        });
    });
  });
});
