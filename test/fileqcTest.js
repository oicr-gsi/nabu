'use strict';

require('dotenv').config({ path: __dirname + '/.env' }); // Use test-specific .env file
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

chai.use(chaiHttp);
chai.use(chaiExclude);

const recreateFprDb = async (cmd) => {
  await cmd.run(
    'sqlite3 ' +
      process.env.SQLITE_LOCATION +
      '/fpr.db < ' +
      path.resolve(__dirname, './migrations/create_test_fpr.sql')
  );
};

describe('Unit test FileQcController', () => {
  const fprs = {
    12017: {
      fileid: 'vidarr:research/file/123',
      md5sum: 'aabb',
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: [],
    },
    12019: {
      fileid: 'vidarr:research/file/135',
      md5sum: '1a2b',
      fileswid: 12019,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: [],
    },
    12025: {
      fileid: 'vidarr:research/file/456',
      md5sum: 'ccdd',
      fileswid: 12025,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      skip: 'false',
      stalestatus: 'OKAY',
      project: 'IPSCellLineReprogramming',
      upstream: [],
    },
  };
  const fqcs = {
    12017: {
      fileid: 'vidarr:research/file/123',
      md5sum: 'aabb',
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      qcpassed: false,
      username: 'test',
      comment: 'failed for test',
    },
    12018: {
      fileid: 'vidarr:research/file/789',
      md5sum: 'eeff',
      fileswid: 12018,
      project: 'IPSCellLineReprogramming',
      filepath: '/oicr/deleted/items',
      username: 'me',
      comment: null,
      qcpassed: false,
    },
    12025: {
      fileid: 'vidarr:research/file/456',
      md5sum: 'ccdd',
      fileswid: 12025,
      project: 'IPSCellLineReprogramming',
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
      username: 'me',
      comment: null,
      qcpassed: true,
    },
  };
  const mergeOne = controller.__get__('mergeOneFileResult');
  const mergeFileResults = controller.__get__('mergeFprsAndFqcs');

  it('should return all data when some inputs are present in FPR, others in FQC, and some in both', (done) => {
    const expected = [
      {
        fileid: 'vidarr:research/file/123',
        md5sum: 'aabb',
        fileswid: 12017,
        project: 'IPSCellLineReprogramming',
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
        skip: 'false',
        upstream: [],
        username: 'test',
        comment: 'failed for test',
        qcstatus: 'FAIL',
        stalestatus: 'OKAY',
      },
      {
        fileid: 'vidarr:research/file/789',
        md5sum: 'eeff',
        fileswid: 12018,
        project: 'IPSCellLineReprogramming',
        filepath: '/oicr/deleted/items',
        username: 'me',
        qcstatus: 'FAIL',
        stalestatus: 'NOT IN FILE PROVENANCE',
      },
      {
        fileid: 'vidarr:research/file/456',
        md5sum: 'ccdd',
        fileswid: 12025,
        project: 'IPSCellLineReprogramming',
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11714/11714_ACTTGA_L002_R1_001.fastq.gz',
        skip: 'false',
        upstream: [],
        username: 'me',
        qcstatus: 'PASS',
        stalestatus: 'OKAY',
      },
      {
        fileid: 'vidarr:research/file/135',
        md5sum: '1a2b',
        fileswid: 12019,
        project: 'IPSCellLineReprogramming',
        filepath:
          '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz',
        skip: 'false',
        upstream: [],
        qcstatus: 'PENDING',
        stalestatus: 'OKAY',
      },
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

  it('should merge file results when item is found in both FPR and FQC', (done) => {
    const expected = {
      fileid: 'vidarr:research/file/123',
      md5sum: 'aabb',
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY',
      upstream: [],
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test',
    };
    const actual = mergeOne(fprs['12017'], fqcs['12017']);
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });

  it('should return FileQc results with "NOT IN PROVENANCE" when there is no FPR record', (done) => {
    const expected = {
      fileid: 'vidarr:research/file/123',
      md5sum: 'aabb',
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      stalestatus: 'NOT IN FILE PROVENANCE',
      qcstatus: 'FAIL',
      username: 'test',
      comment: 'failed for test',
    };
    const actual = mergeOne({}, fqcs['12017']);
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });

  it('should return FPR result with qcstatus "PENDING" when there is no FQC record', (done) => {
    const expected = {
      fileid: 'vidarr:research/file/123',
      md5sum: 'aabb',
      fileswid: 12017,
      filepath:
        '/oicr/data/archive/seqware/seqware_analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz',
      project: 'IPSCellLineReprogramming',
      skip: 'false',
      stalestatus: 'OKAY',
      qcstatus: 'PENDING',
      upstream: [],
    };
    const actual = mergeOne(fprs['12017'], {});
    expect(actual)
      .excluding('qcdate')
      .excluding('fileqcid')
      .to.deep.equal(expected);
    done();
  });
});

const get = (server, path) => {
  return chai.request(server).get(path);
};
const getFileQcs = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/get-fileqcs')
    .set('content-type', 'application/json')
    .send(requestBody);
};

const addFileQcs = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/add-fileqcs')
    .set('content-type', 'application/json')
    .send(requestBody);
};

const deleteFileQcs = (server, requestBody = {}) => {
  return chai
    .request(server)
    .post('/delete-fileqcs')
    .set('content-type', 'application/json')
    .send(requestBody);
};

describe('available constants', () => {
  before(async () => {
    recreateFprDb(cmd);
  });
  beforeEach(async () => {
    await cmd.run('npm run fw:test-clean; npm run fw:test-migrate');
  });
  describe('GET available constants', () => {
    it('it should list available projects and workflows', (done) => {
      get(server, '/available').end((err, res) => {
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

  describe('get fileQc by fileid or fileswid', () => {
    it('it should get one PENDING FileQC by fileid', (done) => {
      let requestBody = {
        fileids: [
          'vidarr:research/file/ffffed20becc81abd6b61c9972599985926eb2928303f7ee4c48e9076d443447',
        ],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('object');
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs).to.have.length(1);
        expect(res.body.fileqcs[0].fileid).to.equal(
          'vidarr:research/file/ffffed20becc81abd6b61c9972599985926eb2928303f7ee4c48e9076d443447'
        );
        expect(res.body.fileqcs[0].fileswid).to.equal(12019);
        expect(res.body.fileqcs[0].qcstatus).to.equal('PENDING');
        expect(res.body.fileqcs[0]).to.not.have.any.keys('username', 'comment');
        done();
      });
    });

    it('it should GET one PASS FileQC by file id', (done) => {
      let requestBody = {
        fileids: [
          'vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f',
        ],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('object');
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs[0].fileid).to.equal(
          'vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f'
        );
        expect(res.body.fileqcs[0].fileswid).to.equal(12017);
        expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
        expect(res.body.fileqcs[0].username).to.equal('me');
        expect(res.body.fileqcs[0]).to.have.property('comment');
        done();
      });
    });

    it('it should GET one FAIL FileQC not in File Provenance', (done) => {
      let requestBody = {
        fileids: [
          'vidarr:research/file/000011481286954345f40be3bb7fe192715d98f4bc76d9e25e782c9ab0ae9ead',
        ],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('object');
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs).to.have.lengthOf(1);
        expect(res.body.fileqcs[0].fileid).to.equal(
          'vidarr:research/file/000011481286954345f40be3bb7fe192715d98f4bc76d9e25e782c9ab0ae9ead'
        );
        expect(res.body.fileqcs[0].fileswid).to.equal(12018);
        expect(res.body.fileqcs[0].qcstatus).to.equal('FAIL');
        expect(res.body.fileqcs[0].stalestatus).to.equal(
          'NOT IN FILE PROVENANCE'
        );
        done();
      });
    });

    it('it should GET zero results for one unknown FileQC', (done) => {
      let requestBody = {
        fileids: [
          'vidarr:research/file/00000000000000000000000000000000000000000000000000000000000000000',
        ],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('object');
        expect(res.body.fileqcs).to.be.empty;
        done();
      });
    });
  });

  describe('GET FileQCs', () => {
    it('it should error on invalid parameters', (done) => {
      let requestBody = {
        nonsense: 'param',
        project: 'IPSCellLineReprogramming',
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(400);
        expect(res.body.errors[0]).to.not.be.null;
        expect(res.body.errors[0].includes('Invalid parameter')).to.be.true;
        done();
      });
    });

    it('it should GET all FileQCs for a given project', (done) => {
      let requestBody = {
        project: 'IPSCellLineReprogramming',
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.be.a('object');
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs).to.have.lengthOf(4);
        done();
      });
    });

    it('it should GET all FileQCs for given file IDs', (done) => {
      let requestBody = {
        fileids: [
          'vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f',
          'vidarr:research/file/000011481286954345f40be3bb7fe192715d98f4bc76d9e25e782c9ab0ae9ead',
        ],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs).to.have.lengthOf(2);
        expect(res.body.fileqcs[0].fileswid).to.equal(12017);
        expect(res.body.fileqcs[1].fileswid).to.equal(12018);
        done();
      });
    });

    it('it should GET all FileQCs for given file SWIDs', (done) => {
      let requestBody = {
        fileswids: [12017, 12018],
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.fileqcs).to.be.a('array');
        expect(res.body.fileqcs).to.have.lengthOf(2);
        expect(res.body.fileqcs[0].fileswid).to.equal(12017);
        expect(res.body.fileqcs[1].fileswid).to.equal(12018);
        done();
      });
    });

    it('it should not return files for unknown projects', (done) => {
      let requestBody = {
        project: 'UNKNOWN',
      };
      getFileQcs(server, requestBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.fileqcs).to.be.empty;
        done();
      });
    });
  });

  describe('POST FileQC', () => {
    function assertNotSaved (requestBody, done, missing) {
      addFileQcs(server, requestBody).end((err, res) => {
        expect(res.status, 'creating without param ' + missing).to.equal(400);
        done();
      });
    }
    const newFileqc = {
      fileid:
        'vidarr:research/file/ffffed20becc81abd6b61c9972599985926eb2928303f7ee4c48e9076d443447',
      username: 'me',
      qcstatus: 'PASS',
    };
    for (let k of Object.keys(newFileqc)) {
      it('it should not POST a FileQC with any of the following missing: fileid, username, qcstatus', (done) => {
        const currentFileQc = { ...newFileqc };
        delete currentFileQc[k];
        assertNotSaved({ fileqcs: [currentFileQc] }, done, k);
      });
    }

    it('it should create a new FileQC for a new file ID', (done) => {
      let getBody = {
        fileids: [newFileqc.fileid],
      };
      addFileQcs(server, { fileqcs: [newFileqc] }).end((err, res) => {
        expect(res.status).to.equal(201);
        getFileQcs(server, getBody).end((err, res) => {
          expect(res.body.fileqcs).to.have.lengthOf(1);
          expect(res.body.fileqcs[0]).to.have.property('upstream');
          expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
        });
        done();
      });
    });

    it('it should update a FileQC with a new QC value when a FileQC already exists for a given file ID', (done) => {
      const getBody = {
        fileids: [
          'vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f',
        ],
      };
      getFileQcs(server, getBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.fileqcs).to.have.lengthOf(1);
        expect(res.body.fileqcs[0].qcstatus).to.equal('PASS');
        const updateFileQc = {
          fileqcs: [
            {
              fileid:
                'vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f',
              qcstatus: 'FAIL',
              username: 'test',
              comment: 'failed for test',
            },
          ],
        };
        addFileQcs(server, updateFileQc).end((err, res) => {
          expect(res.status).to.equal(201);
          getFileQcs(server, getBody).end((err, res) => {
            expect(res.status).to.equal(200);
            // this should only get the latest result
            expect(res.body.fileqcs).to.have.lengthOf(1);
            expect(res.body.fileqcs[0]).to.have.property('upstream');
            expect(res.body.fileqcs[0].qcstatus).to.be.equal('FAIL');
          });
        });
        done();
      });
    });
  });

  describe('batch POST FileQCs', () => {
    it('it should succeed in creating multiple FileQCs in one request', (done) => {
      const postBody = {
        fileqcs: [
          {
            fileid:
              'vidarr:research/file/ffffed20becc81abd6b61c9972599985926eb2928303f7ee4c48e9076d443447',
            qcstatus: 'FAIL',
            username: 'me',
          },
          {
            fileid:
              'vidarr:research/file/0000118144b768469a250eb25eab7d288fd5485c99a50a7c93e659ab0331f0a4',
            qcstatus: 'PASS',
            username: 'me',
          },
        ],
      };
      addFileQcs(server, postBody).end((err, res) => {
        expect(res.status).to.equal(201);
        expect(res.body.fileqcs).to.have.lengthOf(2);
        let statuses = res.body.fileqcs.map((f) => f.qcstatus);
        expect(statuses).to.have.members(['PASS', 'FAIL']);
        done();
      });
    });

    it('it should fail in creating any FileQCs if one fileqc is missing a field', (done) => {
      const postBody = {
        fileqcs: [
          {
            fileid:
              'vidarr:research/file/ffffed20becc81abd6b61c9972599985926eb2928303f7ee4c48e9076d443447',
            qcstatus: 'FAIL',
            username: 'me',
          },
          {
            fileid:
              'vidarr:research/file/0000118144b768469a250eb25eab7d288fd5485c99a50a7c93e659ab0331f0a4',
            qcstatus: 'PASS',
          },
        ],
      };
      addFileQcs(server, postBody).end((err, res) => {
        expect(res.status).to.equal(400);
        done();
      });
    });
  });

  describe('batch DELETE FileQCs', () => {
    it('it should succeed in deleting a FileQC', (done) => {
      getFileQcs(server, { fileswids: ['12016'] }).end((err, res) => {
        const fileId = res.body.fileqcs[0].fileid;
        const deleteRequest = {
          fileids: [fileId],
          username: 'me',
        };
        deleteFileQcs(server, deleteRequest).end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.success).not.to.be.empty;
          expect(res.body.success[0]).to.match(/^Deleted: .*/);
          expect(res.body.errors).to.be.empty;
          done();
        });
      });
    });

    it('it should fail to delete a non-existent FileQC', (done) => {
      const deleteBody = {
        fileids: [21221008773217],
        username: 'mistaken',
      };
      deleteFileQcs(server, deleteBody).end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.empty;
        expect(res.body.errors).not.to.be.empty;
        expect(res.body.errors[0]).to.match(/^Not deleted:*/);
        done();
      });
    });
  });
});
