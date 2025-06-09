DELETE FROM fileqc;
INSERT INTO fileqc (fileid, fileswid, md5sum, project, workflow, filepath, qcpassed, username, comment) VALUES
('vidarr:research/file/00000c255a2acbdd9ee34169925d2e106c2e09c8ce82c4345dd633597b664c9f', 12017, '09e2ad7e25ab0337eeb7f70d22427b40', 'IPSCellLineReprogramming', 'import_fastq', '/analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R1_001.fastq.gz', TRUE, 'me', 'test pass'),
('vidarr:research/file/000011481286954345f40be3bb7fe192715d98f4bc76d9e25e782c9ab0ae9ead', 12018, '0bb216df07ba25d8612435cea0bea88a', 'IPSCellLineReprogramming', 'CASAVA', '/analysis/results/seqware-0.10.0_IlluminaBaseCalling-1.8.2/70453881/Unaligned_111028_SN393_0192_BC0AAKACXX_2/Project_na/Sample_11720/11720_TAGCTT_L002_R2_001.fastq.gz', FALSE, 'me', NULL),
('vidarr:research/file/000020f1ddaa79c72ca761b6fbc919a192c41f88062863757495774bbf9a6235', 12020, 'efd75ff3495dd6ffa8f84cf3fd3d0476', 'MultiSwid', 'MultiQC', '/analysis/extra/added', TRUE, 'me', 'fixed it'),
('vidarr:research/file/dfa067d1dc34c3f4b9ab4da72f03a5ca541e7b4582f8f1e855a56aab1d2c2e4', 12016, 'b2d0e43098750b3a7cd97c7a8e0b5eec', 'DeleteMe', 'CASAVA', '/delete/me', FALSE, 'mistaken', NULL);

DELETE FROM cardea_case;
INSERT INTO cardea_case (case_identifier, requisition_id, lims_ids) VALUES
('R11_TEST_1000_Xy_Z', 11, '{"109_1_LDI5432", "109_1_LDI4321"}'),
('R12_TEST_1212_Ab_C', 12, '{"901_1_LDI9001", "901_1_LDI9002", "902_1_LDI9001", "902_1_LDI9002"}'),
('R13_TEST_9999_De_F', 13, '{"109_1_LDI1234", "109_1_LDI4321"}');

DELETE FROM archive;
INSERT INTO archive (case_id, workflow_run_ids_for_offsite_archive, unload_file_for_offsite_archive, files_copied_to_offsite_archive_staging_dir, commvault_backup_job_id, workflow_run_ids_for_vidarr_archival, unload_file_for_vidarr_archival, files_loaded_into_vidarr_archival, case_files_unloaded, metadata, archive_target, archive_with, batch_id, stop_processing) VALUES
((SELECT id FROM cardea_case WHERE case_identifier = 'R11_TEST_1000_Xy_Z'), '{"vidarr:research/run/f77732c812aa134f61b3a7c11d1c4451cefe70e90e828a11345e8a0cd7704a0f", "vidarr:research/run/eeb4c43908e5df3dd4997dcc982c4c0d7285b51d7a800e501da06add9125faa7", "vidarr:research/run/e651c4aa01d506904bc8b89a411e948c24d43fc0e841486937f23d72eb7c4fae", "vidarr:research/run/de7b18bb97916885afbb7b085d61f00cfaa28793a8b7260b50c4d4ece3567216"}', '{"a_json_file": "sure is"}', ('2023-06-22 16:49:37-04'::timestamptz), 'CJ123', '{"vidarr:research/run/da0e6032ed08591ae684a015ad3c58867a47a65b6c61995e421fc417e2c438c1"}', '{"this_is": "a_load_slash_unload_file_for_vidarr_archival"}', ('2023-06-21 09:38:13-04'::timestamptz), ('2023-06-23 04:03:02'::timestamptz), '{"case_total_size": 3764836327, "case_current_size": 3764836327, "offsite_archive_size": 2618336320, "onsite_archive_size": 200}'::jsonb, 'GLACIER_2Y', '{"R99_ANOTHER_100_Xy_Z"}', 'abcd123', FALSE),
((SELECT id FROM cardea_case WHERE case_identifier = 'R12_TEST_1212_Ab_C'), '{"vidarr:research/run/ac7fa728822f4b801f17cb6aa5d597e32642e6e36a2089fb3c947e4d7d679203", "vidarr:research/run/93d25e166f7ea82c6eb17e48e62e4134939fcaf75c9b9f953819797f4878d961", "vidarr:research/run/8b7fb588926f5efcdfe9824e867b91c93829c383f4177f87b92288b2f2554f8f", "vidarr:research/run/88065a62eeb0ad351f48ff9a3a32cdbdbe4bedf1e386603c1d4d8cfd46d5acd0", "vidarr:research/run/86b9da7b2b84174daef0f29beecf84453d8f987c46805121bf3109e0de48dc14"}', NULL, NULL, NULL, '{"vidarr:research/run/d8cc36839b0dd246af6940f175f089bf2007f5dcb01a00bc53a55526060250f9"}', NULL, NULL, NULL, '{}'::jsonb, 'DELETE', '{}', NULL, FALSE);

DELETE FROM signoff;
INSERT INTO signoff (case_identifier, qc_passed, username, signoff_step_name, deliverable_type, deliverable, comment, release) VALUES
('R11_TEST_1000_Xy_Z', TRUE, 'me', 'RELEASE', 'CLINICAL_REPORT', 'X', '', NULL),
('R12_TEST_1212_Ab_C', FALSE, 'me', 'ANALYSIS_REVIEW', 'DATA_RELEASE', '', '', NULL),
('R12_TEST_9999_De_F', NULL, 'me', 'RELEASE', 'DATA_RELEASE', 'X', '', NULL),
('R12_TEST_9999_De_F', TRUE, 'me', 'ANALYSIS_REVIEW', 'DATA_RELEASE', '', '', NULL),
('R12_TEST_9999_De_F', FALSE, 'me', 'RELEASE_APPROVAL', 'DATA_RELEASE', '', '', NULL);

INSERT INTO token (auth_token, auth_id, username) VALUES ('7e9668724e31742d:164f53c7057e2667de55ae8ad9c1df7fbf85f261f4d89e8f696a81b1ed9972652ed33269eaaa61f738f04cfb8310372e99faad26b1dee5dd1488d3d2dcfcf835', 'wdew0h5hoxvraj1xhrzix4j6nbswhh','inital');
