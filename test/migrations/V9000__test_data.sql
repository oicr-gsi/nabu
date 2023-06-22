DELETE FROM fileqc;
INSERT INTO fileqc (fileid, fileswid, md5sum, project, workflow, filepath, qcpassed, username, comment) VALUES
('vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f', 12017, '09e2ad7e25ab0337eeb7f70d22427b40', 'IPSCellLineReprogramming', 'import_fastq', '/analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz', true, 'me', 'test pass'),
('vidarr:research/file/000011481286954345f40be3bb7fe192715d98f4bc76d9e25e782c9ab0ae9ead', 12018, '0bb216df07ba25d8612435cea0bea88a', 'IPSCellLineReprogramming', 'CASAVA', '/analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz', false, 'me', NULL),
('vidarr:research/file/000020f1ddaa79c72ca761b6fbc919a192c41f88062863757495774bbf9a6235', 12020, 'efd75ff3495dd6ffa8f84cf3fd3d0476', 'MultiSwid', 'MultiQC', '/analysis/extra/added', true, 'me', 'fixed it'),
('vidarr:research/file/dfa067d1dc34c3f4b9ab4da72f03a5ca541e7b4582f8f1e855a56aab1d2c2e4', 12016, 'b2d0e43098750b3a7cd97c7a8e0b5eec', 'DeleteMe', 'CASAVA', '/delete/me', false, 'mistaken', NULL);

DELETE FROM cardea_case;
INSERT INTO cardea_case (case_identifier, requisition_id, lims_ids) VALUES ('R11_TEST_1000_Xy_Z', 11, '{"109_1_LDI5432", "109_1_LDI4321"}'),
('R12_TEST_1212_Ab_C', 12, '{"901_1_LDI9001", "901_1_LDI9002", "902_1_LDI9001", "902_1_LDI9002"}');
