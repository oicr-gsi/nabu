create user test;
alter role test with password 'test';
grant all on database qcdb_test to test;